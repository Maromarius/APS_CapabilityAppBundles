using Autodesk.Forge.DesignAutomation.Inventor.Utils;
using Inventor;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

namespace InventorBOMExtractor
{
    [ComVisible(true)]
    public class BOMExtractorAutomation
    {
        private readonly InventorServer _server;

        public BOMExtractorAutomation(InventorServer server)
        {
            _server = server;
        }

        public void Run(Document doc)
        {
            var report = new BOMReport
            {
                GeneratedAt = DateTime.UtcNow.ToString("o")
            };

            try
            {
                using (new HeartBeat())
                {
                    Trace.TraceInformation("[InventorBOMExtractor] Run called. DocumentType={0}", doc.DocumentType);
                    report.Source = Path.GetFileName(doc.FullFileName);

                    if (doc.DocumentType != DocumentTypeEnum.kAssemblyDocumentObject)
                    {
                        report.Errors.Add($"Input is not an assembly (IAM). DocumentType={doc.DocumentType}");
                        Trace.TraceWarning("[InventorBOMExtractor] Not an assembly — writing partial report.");
                    }
                    else
                    {
                        var asmDoc = (AssemblyDocument)doc;
                        report.TopLevelRows = ExtractBOM(asmDoc, out int total);
                        report.TotalComponents = total;
                        Trace.TraceInformation("[InventorBOMExtractor] BOM extracted: {0} top-level rows, {1} total.", report.TopLevelRows.Count, total);
                    }
                }
            }
            catch (Exception ex)
            {
                Trace.TraceError("[InventorBOMExtractor] Exception: {0}", ex);
                report.Errors.Add(ex.Message);
            }
            finally
            {
                WriteResult(report);
            }
        }

        private List<BOMRow> ExtractBOM(AssemblyDocument asmDoc, out int totalCount)
        {
            totalCount = 0;
            var rows = new List<BOMRow>();

            AssemblyComponentDefinition compDef = asmDoc.ComponentDefinition;
            BOM bom = compDef.BOM;

            bom.StructuredViewEnabled = true;
            bom.StructuredViewFirstLevelOnly = false;

            BOMView view = bom.BOMViews["Structured"];
            if (view == null)
            {
                Trace.TraceWarning("[InventorBOMExtractor] 'Structured' BOM view not found.");
                return rows;
            }

            WalkRows(view.BOMRows, rows, ref totalCount);
            return rows;
        }

        private void WalkRows(BOMRowsEnumerator rowEnum, List<BOMRow> target, ref int totalCount)
        {
            foreach (BOMRow row in rowEnum)
            {
                totalCount++;
                var entry = new BOMRow
                {
                    ItemNumber = row.ItemNumber,
                    Quantity = row.ItemQuantity,
                };

                try
                {
                    ComponentDefinition compDef = row.ComponentDefinitions[1];
                    Document compDoc = (Document)compDef.Document;

                    entry.IsAssembly = compDoc.DocumentType == DocumentTypeEnum.kAssemblyDocumentObject;
                    entry.PartNumber = SafeProperty(compDoc, "Design Tracking Properties", "Part Number");
                    entry.Description = SafeProperty(compDoc, "Design Tracking Properties", "Description");
                    entry.Material = SafeProperty(compDoc, "Design Tracking Properties", "Material");
                    entry.Mass = SafeProperty(compDoc, "Design Tracking Properties", "Mass");
                    entry.Unit = SafeProperty(compDoc, "Design Tracking Properties", "Unit Quantity");
                    if (string.IsNullOrWhiteSpace(entry.Unit)) entry.Unit = "ea";
                }
                catch (Exception ex)
                {
                    Trace.TraceWarning("[InventorBOMExtractor] Row {0}: property read failed: {1}", row.ItemNumber, ex.Message);
                }

                if (row.ChildRows != null)
                    WalkRows(row.ChildRows, entry.ChildRows, ref totalCount);

                target.Add(entry);
            }
        }

        private static string SafeProperty(Document doc, string setName, string propName)
        {
            try
            {
                PropertySet ps = doc.PropertySets[setName];
                Inventor.Property prop = ps[propName];
                var val = prop.Value;
                return val?.ToString() ?? string.Empty;
            }
            catch
            {
                return string.Empty;
            }
        }

        private static void WriteResult(BOMReport report)
        {
            string json = JsonConvert.SerializeObject(report, Formatting.Indented);
            File.WriteAllText("result.json", json, new UTF8Encoding(false));
            Trace.TraceInformation("[InventorBOMExtractor] result.json written ({0} chars).", json.Length);
        }
    }
}
