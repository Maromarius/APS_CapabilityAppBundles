using System.Collections.Generic;

namespace InventorBOMExtractor
{
    public class BOMReport
    {
        public string Source { get; set; } = string.Empty;
        public string GeneratedAt { get; set; } = string.Empty;
        public int TotalComponents { get; set; }
        public List<BOMRow> TopLevelRows { get; set; } = new List<BOMRow>();
        public List<string> Errors { get; set; } = new List<string>();
    }

    public class BOMRow
    {
        public string ItemNumber { get; set; } = string.Empty;
        public string PartNumber { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public double Quantity { get; set; }
        public string Unit { get; set; } = "ea";
        public string Material { get; set; } = string.Empty;
        public string Mass { get; set; } = string.Empty;
        public bool IsAssembly { get; set; }
        public List<BOMRow> ChildRows { get; set; } = new List<BOMRow>();
    }
}
