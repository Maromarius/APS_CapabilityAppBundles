# Inventor Interop DLL

Place `autodesk.inventor.interop.dll` here before running the CI workflow.

**How to get it:**

1. On a Windows machine with Inventor 2023+ installed:
   ```
   C:\Program Files\Autodesk\Inventor <year>\Bin\Public Assemblies\autodesk.inventor.interop.dll
   ```
2. Copy it here (`lib/inventor/autodesk.inventor.interop.dll`).
3. `git add` and commit it to this repo.

**Why it's needed:**

The `InventorBOMExtractor.csproj` references this DLL with `EmbedInteropTypes=True` — the
compiler extracts COM type information and embeds it directly into `InventorBOMExtractor.dll`.
The original DLL is *not* shipped in the bundle; the Inventor DA worker provides Inventor at
runtime. But the DLL must be present at compile time.

**Version:**  Any version 23.0.0.0+ (Inventor 2023 or newer). The interop is forward-compatible.
