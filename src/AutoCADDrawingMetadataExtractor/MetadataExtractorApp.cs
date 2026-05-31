using Autodesk.AutoCAD.Runtime;
using System.IO;
using System.Text;

// ── DIAGNOSTIC SMOKE-TEST BUILD ──────────────────────────────────────────────
// Temporary minimal build to bisect a persistent DA failure where the command is
// "Unknown" and IExtensionApplication.Initialize() never fires, with no DLL load
// error in the work-item report. It removes ALL external dependencies (no
// System.Text.Json) and the entire extractor, leaving only assembly load,
// Initialize(), and two commands that write a hard-coded result.json.
//
// Interpretation of the next DA run:
//   * "[SMOKE] static ctor" / "[SMOKE] Initialize" appear + result.json written
//        -> the assembly loads fine; the real failure is System.Text.Json or the
//           extractor code. Next step: reintroduce extraction with zero ext deps.
//   * Still "Unknown command" with no [SMOKE] lines
//        -> the assembly is not being loaded at all -> structural/packaging or
//           AutoCAD.NET reference problem, not our managed logic.
// ─────────────────────────────────────────────────────────────────────────────

[assembly: CommandClass(typeof(AutoCADDrawingMetadataExtractor.MetadataExtractorCommands))]
[assembly: ExtensionApplication(typeof(AutoCADDrawingMetadataExtractor.MetadataExtractorApp))]

namespace AutoCADDrawingMetadataExtractor
{
    public class MetadataExtractorApp : IExtensionApplication
    {
        // A static ctor that runs at type load — if this prints, the CLR loaded and
        // initialized the type, ruling out a TypeInitializationException.
        static MetadataExtractorApp()
        {
            System.Console.WriteLine("[SMOKE] MetadataExtractorApp static ctor ran.");
        }

        public void Initialize()
        {
            System.Console.WriteLine("[SMOKE] Initialize called — assembly loaded successfully.");
        }

        public void Terminate() { }
    }

    public class MetadataExtractorCommands
    {
        private static void WriteSmokeResult(string command)
        {
            System.Console.WriteLine("[SMOKE] Command " + command + " invoked.");
            string json = "{\"smoke\":\"ok\",\"command\":\"" + command + "\"}";
            File.WriteAllText("result.json", json, Encoding.UTF8);
            System.Console.WriteLine("[SMOKE] result.json written (" + json.Length + " bytes).");
        }

        [CommandMethod("EXTRACTDWGMETADATA", CommandFlags.Modal)]
        public static void ExtractDwgMetadata() => WriteSmokeResult("EXTRACTDWGMETADATA");

        [CommandMethod("EXTRACTALLDRAWINGMETADATA", CommandFlags.Modal)]
        public static void ExtractAllDrawingMetadata() => WriteSmokeResult("EXTRACTALLDRAWINGMETADATA");
    }
}
