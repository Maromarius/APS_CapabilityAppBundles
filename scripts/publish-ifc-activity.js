/**
 * publish-ifc-activity.js
 *
 * Creates or updates the APS Design Automation Activity for Revit → IFC export:
 *
 *   ExportRvtToIFC — converts an input .rvt to result.ifc
 *
 * Activity I/O parameters:
 *   rvtFile    (get, required) — the Revit model to convert
 *   params     (get, optional) — params.json controlling IFC version and options
 *   ifcFile    (put, required) — result.ifc output
 *   resultJson (put, optional) — result.json manifest (success/fileSizeBytes/error)
 *
 * CRITICAL: NICKNAME must come from process.env.APS_NICKNAME — never from an API call.
 *   A missing env var returns undefined → bundle ref becomes "undefined.RevitIFCExport+prod".
 */

"use strict";

const https = require("https");

// ── Config ────────────────────────────────────────────────────────────────────
const CLIENT_ID     = process.env.APS_CLIENT_ID;
const CLIENT_SECRET = process.env.APS_CLIENT_SECRET;
const NICKNAME      = process.env.APS_NICKNAME;
const BUNDLE_NAME   = process.env.BUNDLE_NAME   || "RevitIFCExport";
const ENGINE_VER    = process.env.ENGINE_VERSION || "2026";
const ALIAS         = process.env.ALIAS          || "prod";
const ACTIVITY_ID   = process.env.ACTIVITY_ID    || "ExportRvtToIFC";

const ENGINE_ID  = `Autodesk.Revit+${ENGINE_VER}`;
const BUNDLE_REF = `${NICKNAME}.${BUNDLE_NAME}+${ALIAS}`;
const BASE_URL   = "developer.api.autodesk.com";

// ── Validation ────────────────────────────────────────────────────────────────
function validate() {
  const missing = [];
  if (!CLIENT_ID)     missing.push("APS_CLIENT_ID");
  if (!CLIENT_SECRET) missing.push("APS_CLIENT_SECRET");
  if (!NICKNAME)      missing.push("APS_NICKNAME");
  if (missing.length)
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  if (BUNDLE_REF.startsWith("undefined."))
    throw new Error(
      `BUNDLE_REF resolved to "${BUNDLE_REF}" — APS_NICKNAME env var is missing or undefined`
    );
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () =>
        resolve({ status: res.statusCode, body: data ? tryParse(data) : null })
      );
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function tryParse(text) {
  try { return JSON.parse(text); } catch { return text; }
}

async function getToken() {
  const body = `client_id=${encodeURIComponent(CLIENT_ID)}&client_secret=${encodeURIComponent(CLIENT_SECRET)}&grant_type=client_credentials&scope=code%3Aall`;
  const res = await httpsRequest({
    hostname: BASE_URL,
    path:     "/authentication/v2/token",
    method:   "POST",
    headers:  {
      "Content-Type":   "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(body)
    }
  }, body);
  if (res.status !== 200)
    throw new Error(`Auth failed (${res.status}): ${JSON.stringify(res.body)}`);
  console.log("✔ Token obtained");
  return res.body.access_token;
}

async function apiPost(token, apiPath, payload) {
  const body = JSON.stringify(payload);
  return httpsRequest({
    hostname: BASE_URL,
    path:     apiPath,
    method:   "POST",
    headers:  {
      "Authorization":  `Bearer ${token}`,
      "Content-Type":   "application/json",
      "Content-Length": Buffer.byteLength(body)
    }
  }, body);
}

async function apiPatch(token, apiPath, payload) {
  const body = JSON.stringify(payload);
  return httpsRequest({
    hostname: BASE_URL,
    path:     apiPath,
    method:   "PATCH",
    headers:  {
      "Authorization":  `Bearer ${token}`,
      "Content-Type":   "application/json",
      "Content-Length": Buffer.byteLength(body)
    }
  }, body);
}

async function apiDelete(token, apiPath) {
  return httpsRequest({
    hostname: BASE_URL,
    path:     apiPath,
    method:   "DELETE",
    headers:  { "Authorization": `Bearer ${token}` }
  });
}

// ── Activity definition ───────────────────────────────────────────────────────
function buildActivityDef() {
  return {
    id:          ACTIVITY_ID,
    engine:      ENGINE_ID,
    appbundles:  [BUNDLE_REF],
    commandLine: [
      `$(engine.path)\\revitcoreconsole.exe /i "$(args[rvtFile].path)" /al "$(appbundles[${BUNDLE_NAME}].path)"`
    ],
    parameters: {
      rvtFile: {
        verb:        "get",
        localName:   "input.rvt",
        required:    true,
        description: "The Revit model (.rvt) to convert to IFC"
      },
      params: {
        verb:        "get",
        localName:   "params.json",
        required:    false,
        description: JSON.stringify({
          ifcVersion:            "IFC2x3CV2 | IFC2x3 | IFC4",
          exportBaseQuantities:  false,
          wallAndColumnSplitting: false,
          spaceBoundaryLevel:    0
        })
      },
      ifcFile: {
        verb:        "put",
        localName:   "result.ifc",
        required:    true,
        description: "The exported IFC file"
      },
      resultJson: {
        verb:        "put",
        localName:   "result.json",
        required:    false,
        description: "Manifest: { success, ifcVersion, documentTitle, outputFile, fileSizeBytes, error }"
      }
    }
  };
}

// ── Create or update the Activity ─────────────────────────────────────────────
async function deleteAndRecreate(token, def) {
  console.log(`  ⚠️  100-version limit — deleting and recreating '${ACTIVITY_ID}'...`);
  const del = await apiDelete(token, `/da/us-east/v3/activities/${ACTIVITY_ID}`);
  if (del.status !== 204 && del.status !== 200)
    throw new Error(`Delete failed (${del.status}): ${JSON.stringify(del.body)}`);
  return apiPost(token, "/da/us-east/v3/activities", def);
}

async function publishActivity(token) {
  console.log(`\n── Activity: ${NICKNAME}.${ACTIVITY_ID} ──`);
  const def = buildActivityDef();

  let res = await apiPost(token, "/da/us-east/v3/activities", def);
  let version;

  if (res.status === 200 || res.status === 201) {
    console.log(`✔ Created Activity '${ACTIVITY_ID}' (version ${res.body.version})`);
    version = res.body.version;
  } else if (res.status === 409) {
    console.log(`  Activity '${ACTIVITY_ID}' exists — creating new version...`);
    const { id: _, ...versionDef } = def;
    res = await apiPost(token, `/da/us-east/v3/activities/${ACTIVITY_ID}/versions`, versionDef);
    if (res.status === 403) {
      res = await deleteAndRecreate(token, def);
    }
    if (res.status !== 200 && res.status !== 201)
      throw new Error(`Failed to version Activity (${res.status}): ${JSON.stringify(res.body)}`);
    console.log(`✔ New version of '${ACTIVITY_ID}': ${res.body.version}`);
    version = res.body.version;
  } else if (res.status === 403) {
    res = await deleteAndRecreate(token, def);
    if (res.status !== 200 && res.status !== 201)
      throw new Error(`Failed to recreate Activity (${res.status}): ${JSON.stringify(res.body)}`);
    console.log(`✔ Recreated Activity '${ACTIVITY_ID}' (version ${res.body.version})`);
    version = res.body.version;
  } else {
    throw new Error(`Unexpected status (${res.status}): ${JSON.stringify(res.body)}`);
  }

  await setAlias(token, version);
  return version;
}

async function setAlias(token, version) {
  let res = await apiPatch(token,
    `/da/us-east/v3/activities/${ACTIVITY_ID}/aliases/${ALIAS}`,
    { version }
  );
  if (res.status === 200) {
    console.log(`✔ Alias '${ALIAS}' → version ${version}`);
  } else if (res.status === 404) {
    console.log(`  Creating alias '${ALIAS}'...`);
    res = await apiPost(token,
      `/da/us-east/v3/activities/${ACTIVITY_ID}/aliases`,
      { id: ALIAS, version }
    );
    if (res.status !== 200 && res.status !== 201)
      throw new Error(`Failed to create alias (${res.status}): ${JSON.stringify(res.body)}`);
    console.log(`✔ Alias '${ALIAS}' created → version ${version}`);
  } else {
    throw new Error(`Unexpected alias status (${res.status}): ${JSON.stringify(res.body)}`);
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────
async function main() {
  console.log("=== publish-ifc-activity.js ===");
  console.log(`  Engine  : ${ENGINE_ID}`);
  console.log(`  Bundle  : ${BUNDLE_REF}`);
  console.log(`  Activity: ${NICKNAME}.${ACTIVITY_ID}`);
  console.log(`  Alias   : ${ALIAS}`);

  validate();

  const token   = await getToken();
  const version = await publishActivity(token);

  console.log(`\n✅ Activity published: ${NICKNAME}.${ACTIVITY_ID}+${ALIAS} (v${version})`);
  console.log(`   Engine: ${ENGINE_ID}`);
  console.log(`   Bundle: ${BUNDLE_REF}`);
}

main().catch((err) => {
  console.error(`\n❌ publish-ifc-activity.js failed: ${err.message}`);
  process.exit(1);
});
