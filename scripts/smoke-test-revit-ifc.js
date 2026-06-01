#!/usr/bin/env node
// Post-publish smoke gate for RevitIFCExport:
//   Upload sample.rvt → run ExportRvtToIFC activity → verify status:success
//   + valid no-BOM result.json with success=true + fileSizeBytes > 0.
//
// Activity I/O contract (from publish-ifc-activity.js):
//   input arg  `rvtFile`    (get) — the .rvt to convert
//   output arg `ifcFile`    (put) — result.ifc
//   output arg `resultJson` (put) — result.json manifest

"use strict";

const fs    = require("fs");
const path  = require("path");
const https = require("https");

const CLIENT_ID     = required("APS_CLIENT_ID");
const CLIENT_SECRET = required("APS_CLIENT_SECRET");
const NICKNAME      = required("APS_NICKNAME");
const ACTIVITY_ID   = process.env.SMOKE_ACTIVITY_ID || "ExportRvtToIFC";
const ALIAS         = process.env.ALIAS || "prod";
const SAMPLE_RVT    = process.env.SAMPLE_RVT || path.join(process.cwd(), "test", "sample.rvt");
const BUCKET_KEY    = (NICKNAME.toLowerCase().replace(/[^a-z0-9]/g, "") + "-smoke-ifc").slice(0, 60);
const BASE          = "developer.api.autodesk.com";

function required(name) {
  const v = process.env[name];
  if (!v) { console.error(`❌ Missing env var: ${name}`); process.exit(1); }
  return v;
}

function req(method, host, p, headers, body) {
  return new Promise((resolve, reject) => {
    const r = https.request({ hostname: host, path: p, method, headers }, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks);
        let parsed; try { parsed = JSON.parse(raw.toString()); } catch { parsed = raw.toString(); }
        resolve({ status: res.statusCode, body: parsed, raw });
      });
    });
    r.on("error", reject);
    if (body) r.write(body);
    r.end();
  });
}

function putBytes(url, buf) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const r = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: "PUT",
      headers: { "Content-Length": buf.length }
    }, res => {
      res.on("data", () => {}); res.on("end", () => resolve(res.statusCode));
    });
    r.on("error", reject); r.write(buf); r.end();
  });
}

function getUrl(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    https.get({ hostname: u.hostname, path: u.pathname + u.search }, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve({
        status: res.statusCode,
        raw: Buffer.concat(chunks),
        text: Buffer.concat(chunks).toString()
      }));
    }).on("error", reject);
  });
}

async function token() {
  const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const res = await req("POST", BASE, "/authentication/v2/token",
    { "Content-Type": "application/x-www-form-urlencoded", "Authorization": `Basic ${auth}` },
    "grant_type=client_credentials&scope=code:all data:read data:write data:create bucket:create bucket:read"
  );
  if (!res.body.access_token) throw new Error(`token failed: ${JSON.stringify(res.body)}`);
  return res.body.access_token;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log(`═══ IFC smoke test: run ${ACTIVITY_ID}+${ALIAS} end-to-end ═══`);
  console.log(`   Sample RVT: ${SAMPLE_RVT}`);

  if (!fs.existsSync(SAMPLE_RVT))
    throw new Error(`Sample RVT not found: ${SAMPLE_RVT}`);

  const rvt = fs.readFileSync(SAMPLE_RVT);
  const t   = await token();
  const H   = { "Authorization": `Bearer ${t}`, "Content-Type": "application/json" };

  // 1. Ensure transient bucket
  const b = await req("POST", BASE, "/oss/v2/buckets", H,
    JSON.stringify({ bucketKey: BUCKET_KEY, policyKey: "transient" }));
  if (![200, 409].includes(b.status))
    throw new Error(`bucket failed HTTP ${b.status}: ${JSON.stringify(b.body)}`);
  console.log(`   bucket: ${BUCKET_KEY} (HTTP ${b.status})`);

  // 2. Upload input RVT via signed S3
  const objKey = `smoke-ifc-input-${Date.now()}.rvt`;
  const up = await req("GET", BASE, `/oss/v2/buckets/${BUCKET_KEY}/objects/${objKey}/signeds3upload`, H);
  if (up.status !== 200)
    throw new Error(`signeds3upload GET HTTP ${up.status}: ${JSON.stringify(up.body)}`);
  const putStatus = await putBytes(up.body.urls[0], rvt);
  if (putStatus < 200 || putStatus >= 300)
    throw new Error(`S3 PUT failed HTTP ${putStatus}`);
  const fin = await req("POST", BASE,
    `/oss/v2/buckets/${BUCKET_KEY}/objects/${objKey}/signeds3upload`, H,
    JSON.stringify({ uploadKey: up.body.uploadKey }));
  if (fin.status < 200 || fin.status >= 300)
    throw new Error(`upload finalize HTTP ${fin.status}: ${JSON.stringify(fin.body)}`);
  console.log(`   uploaded input: ${objKey} (${rvt.length} bytes)`);

  // 3. Signed download URL for input
  const dl = await req("GET", BASE,
    `/oss/v2/buckets/${BUCKET_KEY}/objects/${objKey}/signeds3download`, H);
  if (dl.status !== 200)
    throw new Error(`signeds3download HTTP ${dl.status}: ${JSON.stringify(dl.body)}`);
  const inputUrl = dl.body.url;

  // 4. Readwrite signed URL for result.ifc output
  const ifcObj = `smoke-ifc-result-${Date.now()}.ifc`;
  const sigIfc = await req("POST", BASE,
    `/oss/v2/buckets/${BUCKET_KEY}/objects/${ifcObj}/signed?access=readwrite`, H, "{}");
  if (sigIfc.status < 200 || sigIfc.status >= 300)
    throw new Error(`signed ifc url HTTP ${sigIfc.status}: ${JSON.stringify(sigIfc.body)}`);
  const ifcUrl = sigIfc.body.signedUrl;

  // 5. Readwrite signed URL for result.json output
  const resObj = `smoke-ifc-manifest-${Date.now()}.json`;
  const sigRes = await req("POST", BASE,
    `/oss/v2/buckets/${BUCKET_KEY}/objects/${resObj}/signed?access=readwrite`, H, "{}");
  if (sigRes.status < 200 || sigRes.status >= 300)
    throw new Error(`signed result url HTTP ${sigRes.status}: ${JSON.stringify(sigRes.body)}`);
  const resultUrl = sigRes.body.signedUrl;

  // 6. Submit work item
  const wiBody = JSON.stringify({
    activityId: `${NICKNAME}.${ACTIVITY_ID}+${ALIAS}`,
    arguments: {
      rvtFile:    { url: inputUrl, verb: "get" },
      ifcFile:    { url: ifcUrl,   verb: "put" },
      resultJson: { url: resultUrl, verb: "put" },
    }
  });
  const wi = await req("POST", BASE, "/da/us-east/v3/workitems", H, wiBody);
  if (wi.status < 200 || wi.status >= 300)
    throw new Error(`workitem POST HTTP ${wi.status}: ${JSON.stringify(wi.body)}`);
  const id = wi.body.id;
  console.log(`   workitem: ${id} → ${NICKNAME}.${ACTIVITY_ID}+${ALIAS}`);

  // 7. Poll — Revit + IFC export can be slow, allow ~8 min
  let status = wi.body.status, reportUrl = wi.body.reportUrl;
  for (let i = 0; i < 160 && ["pending", "inprogress"].includes(status); i++) {
    await sleep(3000);
    const p = await req("GET", BASE, `/da/us-east/v3/workitems/${id}`,
      { "Authorization": `Bearer ${t}` });
    status    = p.body.status;
    reportUrl = p.body.reportUrl || reportUrl;
    process.stdout.write(`   status: ${status}\r`);
  }
  console.log(`\n   final status: ${status}`);

  // 8. Always dump the DA report log
  if (reportUrl) {
    const rep = await getUrl(reportUrl);
    console.log("───── work item report ─────");
    console.log(rep.text);
    console.log("────────────────────────────");
  }

  if (status !== "success") {
    throw new Error(
      `Smoke test FAILED: work item status='${status}' (expected 'success'). ` +
      "The appbundle or activity is not working correctly."
    );
  }

  // 9. Verify result.json: present, valid JSON, NO BOM, success=true, fileSizeBytes > 0
  const out = await getUrl(resultUrl);
  console.log("───── result.json ─────");
  console.log(out.text.slice(0, 2000));
  console.log("───────────────────────");

  if (out.raw.length >= 3 && out.raw[0] === 0xEF && out.raw[1] === 0xBB && out.raw[2] === 0xBF)
    throw new Error("Smoke test FAILED: result.json starts with a UTF-8 BOM.");

  let parsed;
  try { parsed = JSON.parse(out.text); }
  catch { throw new Error("Smoke test FAILED: result.json is not valid JSON."); }

  // Newtonsoft default serialization = PascalCase; check both casings defensively
  const success       = parsed.Success       ?? parsed.success;
  const fileSizeBytes = parsed.FileSizeBytes ?? parsed.fileSizeBytes;
  const error         = parsed.Error         ?? parsed.error;

  if (success !== true)
    throw new Error(
      `Smoke test FAILED: result.json shows success=false. Error: ${error || "(none)"}`
    );
  if (typeof fileSizeBytes !== "number" || fileSizeBytes <= 0)
    throw new Error(
      `Smoke test FAILED: result.json fileSizeBytes must be > 0 (got: ${fileSizeBytes})`
    );

  console.log(
    `✅ IFC smoke test PASSED — status:success, no BOM, ` +
    `fileSizeBytes=${fileSizeBytes.toLocaleString()}.`
  );
})().catch(err => { console.error("\n❌", err.message); process.exit(1); });
