using System;
using System.Diagnostics;
using System.Reflection;
using System.Runtime.InteropServices;
using Inventor;

namespace InventorBOMExtractor
{
    [Guid("00b94922-a4b5-4867-98bc-4e9418b04cfe")]
    public class PluginServer : ApplicationAddInServer
    {
        private InventorServer? _inventorServer;

        public dynamic Automation { get; private set; } = null!;

        public void Activate(ApplicationAddInSite addInSiteObject, bool firstTime)
        {
            Trace.TraceInformation("[InventorBOMExtractor] Activate called. v"
                + Assembly.GetExecutingAssembly().GetName().Version?.ToString(4));
            _inventorServer = addInSiteObject.InventorServer;
            Automation = new BOMExtractorAutomation(_inventorServer);
        }

        public void Deactivate()
        {
            Trace.TraceInformation("[InventorBOMExtractor] Deactivate called.");
            if (_inventorServer != null)
                Marshal.ReleaseComObject(_inventorServer);
            _inventorServer = null;
            GC.Collect();
            GC.WaitForPendingFinalizers();
        }

        public void ExecuteCommand(int CommandID) { }
    }
}
