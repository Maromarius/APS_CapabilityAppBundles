using Autodesk.AutoCAD.ApplicationServices.Core;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.Runtime;
using Newtonsoft.Json;
using System.IO;
using System.Text;

[assembly: CommandClass(typeof(AutoCADDrawingMetadataExtractor.MetadataExtractorCommands))]
[assembly: ExtensionApplication(typeof(AutoCADDrawingMetadataExtractor.MetadataExtractorApp))]

namespace AutoCADDrawingMetadataExtractor
{
    public class MetadataExtractorApp : IExtensionApplication
    {
        public void Initialize() { }
        public void Terminate() { }
    }

    public class MetadataExtractorCommands
    {
        private static readonly JsonSerializerSettings JsonSettings = new()
        {
            Formatting = Formatting.Indented,
            NullValueHandling = NullValueHandling.Ignore,
        };

        private static Database? ResolveDatabase()
        {
            try
            {
                var doc = Application.DocumentManager.MdiActiveDocument;
                return doc?.Database ?? HostApplicationServices.WorkingDatabase;
            }
            catch
            {
                return HostApplicationServices.WorkingDatabase;
            }
        }

        [CommandMethod("EXTRACTDWGMETADATA", CommandFlags.Modal)]
        public static void ExtractDwgMetadata()
        {
            var db = ResolveDatabase();
            if (db == null)
            {
                System.Console.WriteLine("[MetadataExtractor] ERROR: No active database.");
                return;
            }

            System.Console.WriteLine("[MetadataExtractor] Starting extraction...");

            try
            {
                var extractor = new DwgMetadataExtractor(db);
                var report = extractor.BuildReport();
                string json = JsonConvert.SerializeObject(report, JsonSettings);
                File.WriteAllText("result.json", json, Encoding.UTF8);
                System.Console.WriteLine($"[MetadataExtractor] Done — result.json written ({json.Length} bytes).");
            }
            catch (System.Exception ex)
            {
                System.Console.WriteLine($"[MetadataExtractor] ERROR: {ex.Message}
{ex.StackTrace}");
            }
        }

        // Single-pass combined extraction: all 7 metadata sections in one DWG open.
        // Output keys mirror the 7 individual operationIds for drop-in compatibility.
        [CommandMethod("EXTRACTALLDRAWINGMETADATA", CommandFlags.Modal)]
        public static void ExtractAllDrawingMetadata()
        {
            var db = ResolveDatabase();
            if (db == null)
            {
                System.Console.WriteLine("[MetadataExtractor] ERROR: No active database.");
                return;
            }

            System.Console.WriteLine("[MetadataExtractor] Starting combined extraction...");

            try
            {
                var extractor = new DwgMetadataExtractor(db);
                var result = extractor.BuildCombinedReport();
                string json = JsonConvert.SerializeObject(result, JsonSettings);
                File.WriteAllText("result.json", json, Encoding.UTF8);
                System.Console.WriteLine($"[MetadataExtractor] Done — result.json written ({json.Length} bytes).");
            }
            catch (System.Exception ex)
            {
                System.Console.WriteLine($"[MetadataExtractor] ERROR: {ex.Message}
{ex.StackTrace}");
            }
        }
    }
}
