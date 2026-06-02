using System.Collections.Generic;
using Newtonsoft.Json;

namespace CADStandardsChecker
{
    // ─── Input: params.json ──────────────────────────────────────────────────

    internal class RunParams
    {
        [JsonProperty("rules")]     public RulesConfig Rules     { get; set; } = new RulesConfig();
        [JsonProperty("fileAlias")] public string?     FileAlias { get; set; }
    }

    internal class RulesConfig
    {
        [JsonProperty("layerNamePatterns")] public List<string>        LayerNamePatterns { get; set; } = new List<string>();
        [JsonProperty("requiredLayers")]    public List<RequiredLayer>  RequiredLayers    { get; set; } = new List<RequiredLayer>();
        [JsonProperty("forbiddenLayers")]   public List<string>        ForbiddenLayers   { get; set; } = new List<string>();
        [JsonProperty("textStyleWhitelist")]public List<string>        TextStyleWhitelist{ get; set; } = new List<string>();
        [JsonProperty("dimStyleWhitelist")] public List<string>        DimStyleWhitelist { get; set; } = new List<string>();
        [JsonProperty("requiredBlocks")]    public List<string>        RequiredBlocks    { get; set; } = new List<string>();
        [JsonProperty("linetypeWhitelist")] public List<string>        LinetypeWhitelist { get; set; } = new List<string>();
        [JsonProperty("requirePurge")]      public bool                RequirePurge      { get; set; }
    }

    internal class RequiredLayer
    {
        [JsonProperty("name")]       public string  Name       { get; set; } = "";
        [JsonProperty("color")]      public short?  Color      { get; set; }
        [JsonProperty("linetype")]   public string? Linetype   { get; set; }
        [JsonProperty("lineweight")] public int?    Lineweight { get; set; }
    }

    // ─── Output: report.json ─────────────────────────────────────────────────

    internal class ComplianceReport
    {
        [JsonProperty("checkedAt")]     public string       CheckedAt     { get; set; } = "";
        [JsonProperty("file")]          public string       File          { get; set; } = "";
        [JsonProperty("overallStatus")] public string       OverallStatus { get; set; } = "pass";
        [JsonProperty("summary")]       public StatusSummary Summary      { get; set; } = new StatusSummary();
        [JsonProperty("rules")]         public List<RuleResult> Rules     { get; set; } = new List<RuleResult>();
    }

    internal class StatusSummary
    {
        [JsonProperty("pass")]    public int Pass    { get; set; }
        [JsonProperty("warning")] public int Warning { get; set; }
        [JsonProperty("fail")]    public int Fail    { get; set; }
    }

    internal class RuleResult
    {
        [JsonProperty("ruleId")]      public string         RuleId      { get; set; } = "";
        [JsonProperty("category")]    public string         Category    { get; set; } = "";
        [JsonProperty("result")]      public string         Result      { get; set; } = "pass";
        [JsonProperty("message")]     public string         Message     { get; set; } = "";
        [JsonProperty("offenders")]   public List<Offender> Offenders   { get; set; } = new List<Offender>();
        [JsonProperty("remediation")] public string?        Remediation { get; set; }
    }

    internal class Offender
    {
        [JsonProperty("objectType")] public string  ObjectType { get; set; } = "";
        [JsonProperty("name")]       public string  Name       { get; set; } = "";
        [JsonProperty("value")]      public string? Value      { get; set; }
        [JsonProperty("expected")]   public string? Expected   { get; set; }
    }
}
