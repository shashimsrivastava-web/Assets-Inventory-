import React, { useState } from "react";
import { Asset, AssetStatus } from "../types";
import { Plus, Edit2, Trash2, Smartphone, Tablet, CreditCard, Layers, Tag, Eye, RefreshCw, Printer, UploadCloud, FileSpreadsheet } from "lucide-react";
import { addDoc, deleteDoc, doc, setDoc } from "firebase/firestore";
import { assetsCol } from "../firebase";
import { read, utils } from "xlsx";

interface AssetMasterProps {
  assets: Asset[];
  role: "Admin" | "Supervisor";
  loading: boolean;
  onRefresh: () => void;
  onAddAlert: (type: "overdue" | "missing" | "duplicate_issue" | "already_returned" | "system", title: string, message: string, assetId?: string) => void;
}

const PRESET_IMAGES = [
  { name: "iPad Slate Grey", url: "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=150&auto=format&fit=crop&q=60" },
  { name: "iPad Silver Clean", url: "https://images.unsplash.com/photo-1589739900243-4b52cd9b104e?w=150&auto=format&fit=crop&q=60" },
  { name: "Ingenico Terminal Black", url: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=150&auto=format&fit=crop&q=60" },
  { name: "iPhone Charcoal", url: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=150&auto=format&fit=crop&q=60" },
  { name: "Samsung Galaxy Silver", url: "https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=150&auto=format&fit=crop&q=60" },
];

export default function AssetMaster({ assets, role, loading, onRefresh, onAddAlert }: AssetMasterProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);

  // Form states
  const [assetId, setAssetId] = useState("");
  const [type, setType] = useState("iPad");
  const [customType, setCustomType] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<AssetStatus>(AssetStatus.IN_OFFICE);
  const [imageUrl, setImageUrl] = useState("");
  const [showQr, setShowQr] = useState<string | null>(null);

  // Excel Sheet upload states
  const [isExcelOpen, setIsExcelOpen] = useState(false);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [parsedAssets, setParsedAssets] = useState<Asset[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [isExcelImporting, setIsExcelImporting] = useState(false);
  const [importFeedback, setImportFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const resetForm = () => {
    setAssetId("");
    setType("iPad");
    setCustomType("");
    setName("");
    setStatus(AssetStatus.IN_OFFICE);
    setImageUrl(PRESET_IMAGES[0].url);
    setEditingAsset(null);
  };

  const handleOpenCreateForm = () => {
    resetForm();
    setIsExcelOpen(false); // Close the excel panel if opening regular form
    setIsFormOpen(true);
  };

  // Case-insensitive, space-flexible header key-value lookup helper
  const findValueByHeader = (row: any, targetHeaders: string[]): string => {
    const rowKeys = Object.keys(row);
    for (const h of targetHeaders) {
      const cleanTarget = h.trim().replace(/\s+/g, "").toLowerCase();
      const matchedKey = rowKeys.find(
        (k) => k.trim().replace(/\s+/g, "").toLowerCase() === cleanTarget
      );
      if (matchedKey !== undefined) {
        return String(row[matchedKey] || "").trim();
      }
    }
    return "";
  };

  // Process Excel binary sheet
  const processExcelFile = (file: File) => {
    setExcelFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = read(data, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to rows of objects mapping Column Header -> Value
        const rawRows = utils.sheet_to_json<any>(worksheet);
        const results: Asset[] = [];

        for (const row of rawRows) {
          // 1. Asset ID from column "ID"
          const assetIdVal = findValueByHeader(row, ["ID", "Asset ID", "Asset_ID", "AssetID"]);
          
          if (!assetIdVal) continue; // Skip empty/header rows

          // 2. Device Type from "Asset Type"
          let deviceType = findValueByHeader(row, ["Asset Type", "Device Type", "Type", "AssetType", "DeviceType"]);
          if (!deviceType) {
            deviceType = "Other"; // Default fallback
          }

          // 3. Device Friendly Name from Location, Brand Details, and Usage Location combined
          const location = findValueByHeader(row, ["Location", "Loc", "Location Key"]);
          const brand = findValueByHeader(row, ["Brand Details", "Brand", "Brand_Details", "BrandDetails"]);
          const usage = findValueByHeader(row, ["Usage Location", "Usage_Location", "UsageLocation", "Usage Key"]);

          // Build combined friendly name safely skipping empty parts
          const nameParts = [brand, location, usage].filter(val => val !== "");
          const combinedName = nameParts.join(" - ") || `Asset ${assetIdVal}`;

          // Clean ID representation: letters or numbers, uppercase
          const cleanedId = assetIdVal.toUpperCase().trim().replace(/\s+/g, "-");

          results.push({
            id: cleanedId,
            type: deviceType,
            name: combinedName,
            status: AssetStatus.IN_OFFICE, // Under active available custody inside office
            imageUrl: PRESET_IMAGES[0].url,
            lastUpdated: Date.now()
          });
        }

        if (results.length === 0) {
          alert("No valid rows matching ID found. Please inspect the headers in your uploaded spreadsheet.");
          setExcelFile(null);
          setParsedAssets([]);
        } else {
          setParsedAssets(results);
        }
      } catch (err) {
        console.error("Error reading spreadsheet layout:", err);
        alert("Could not successfully parse this spreadsheet file.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const nameLower = file.name.toLowerCase();
      if (nameLower.endsWith(".xlsx") || nameLower.endsWith(".xls") || nameLower.endsWith(".csv") || file.type === "text/csv") {
        processExcelFile(file);
      } else {
        alert("Please drop a valid Excel file (.xlsx, .xls) or comma-separated CSV file.");
      }
    }
  };

  const handleFileSelectChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processExcelFile(e.target.files[0]);
    }
  };

  const handleCommitExcelImport = async () => {
    if (parsedAssets.length === 0) return;
    setIsExcelImporting(true);
    setImportFeedback(null);

    let successCount = 0;
    let failureCount = 0;

    try {
      for (const asset of parsedAssets) {
        try {
          await setDoc(doc(assetsCol, asset.id), asset);
          successCount++;
        } catch (err) {
          console.error(`Failed to register asset ${asset.id}:`, err);
          failureCount++;
        }
      }

      setImportFeedback({
        type: "success",
        text: `Excel master inventory import finished! Registered ${successCount} devices (${failureCount} failed).`
      });

      try {
        alert(`Excel master inventory import finished!\n\nRegistered devices: ${successCount}\nFailed: ${failureCount}`);
      } catch (alertErr) {
        console.warn("System modal alert blocked by user's browser sandbox environment:", alertErr);
      }
      
      setExcelFile(null);
      setParsedAssets([]);
      setTimeout(() => {
        setIsExcelOpen(false);
        setImportFeedback(null);
      }, 2500);
      onRefresh();
    } catch (globalErr) {
      console.error("Bulk database insert failed:", globalErr);
      setImportFeedback({
        type: "error",
        text: "Encountered database compilation error or write issue."
      });
      try {
        alert("Encountered a database issue compiling bulk imports.");
      } catch (alertErr) {}
    } finally {
      setIsExcelImporting(false);
    }
  };

  const handleEdit = (asset: Asset) => {
    setEditingAsset(asset);
    setAssetId(asset.id);
    if (["iPad", "Ingenico", "Mobile Phone"].includes(asset.type)) {
      setType(asset.type);
      setCustomType("");
    } else {
      setType("Other");
      setCustomType(asset.type);
    }
    setName(asset.name);
    setStatus(asset.status);
    setImageUrl(asset.imageUrl || PRESET_IMAGES[0].url);
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const finalType = type === "Other" ? customType : type;
    if (!assetId.trim() || !finalType.trim() || !name.trim()) {
      alert("Please fill in all mandatory fields.");
      return;
    }

    const cleanedAssetId = assetId.toUpperCase().replace(/\s+/g, "-");

    // Check duplicate ID for newly created asset
    if (!editingAsset) {
      const exists = assets.some((a) => a.id.toLowerCase() === cleanedAssetId.toLowerCase());
      if (exists) {
        onAddAlert("duplicate_issue", "Duplicate Asset Registration Attempt", `The asset status of ${cleanedAssetId} is active or registered. Registration blocked.`, cleanedAssetId);
        alert(`Asset with ID ${cleanedAssetId} already exists!`);
        return;
      }
    }

    const assetData: Asset = {
      id: cleanedAssetId,
      type: finalType,
      name,
      status,
      imageUrl: imageUrl || PRESET_IMAGES[0].url,
      currentAssignmentId: editingAsset ? editingAsset.currentAssignmentId : null,
      lastUpdated: Date.now()
    };

    try {
      await setDoc(doc(assetsCol, cleanedAssetId), assetData);
      setIsFormOpen(false);
      resetForm();
      onRefresh();
    } catch (error) {
      console.error("Error saving asset: ", error);
      alert("Failed to save asset. Check your console log.");
    }
  };

  const handleDelete = async (id: string) => {
    if (role !== "Admin") {
      alert("Only Admins can delete assets from the master inventory list.");
      return;
    }
    if (!window.confirm(`Are you sure you want to delete asset ${id}? This action is irreversible.`)) {
      return;
    }

    try {
      await deleteDoc(doc(assetsCol, id));
      onRefresh();
    } catch (error) {
      console.error("Error deleting asset: ", error);
      alert("Failed to delete asset.");
    }
  };

  const triggerPrint = (id: string, name: string) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Print Label - ${id}</title>
          <style>
            body { font-family: monospace; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 90vh; text-align: center; margin: 0; }
            .card { border: 2px dashed #000; padding: 20px; border-radius: 8px; width: 280px; }
            .barcode { letter-spacing: 5px; font-weight: bold; font-size: 24px; margin: 15px 0; border: 1px solid #000; padding: 8px; }
            .meta { font-size: 14px; margin-top: 10px; }
          </style>
        </head>
        <body>
          <div class="card">
            <h3>ASSET CONTROL LABEL</h3>
            <div class="barcode">*${id}*</div>
            <strong>${id}</strong>
            <p>${name}</p>
            <div class="meta">Asset-Link Control Management</div>
          </div>
          <script>window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType.toLowerCase()) {
      case "ipad":
        return <Tablet className="w-4 h-4 text-emerald-500" />;
      case "ingenico":
        return <CreditCard className="w-4 h-4 text-indigo-500" />;
      case "mobile phone":
        return <Smartphone className="w-4 h-4 text-teal-400" />;
      default:
        return <Layers className="w-4 h-4 text-amber-500" />;
    }
  };

  return (
    <div id="asset-master-pane" className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Tag className="w-5 h-5 text-indigo-500" />
            Asset Master Inventory
          </h2>
          <p className="text-slate-500 text-xs mt-1">Manage and register business devices inside your organization.</p>
        </div>
        <div className="flex items-center gap-2 sm:self-end">
          <button
            onClick={onRefresh}
            className="p-2 border border-slate-200 hover:border-indigo-200 rounded-xl bg-white text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/10 transition-colors cursor-pointer"
            title="Reload Assets"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          {role === "Admin" && (
            <button
              id="bulk-excel-upload-button"
              onClick={() => {
                setIsExcelOpen(!isExcelOpen);
                setIsFormOpen(false); // Close individual form if toggled
              }}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 hover:border-indigo-500 text-slate-705 bg-white hover:bg-indigo-50/10 font-semibold rounded-xl text-xs tracking-wide shadow-sm transition-all cursor-pointer animate-fadeIn"
            >
              <UploadCloud className="w-4 h-4 text-emerald-500" />
              Upload Excel Inventory
            </button>
          )}
          <button
            id="register-asset-button"
            onClick={handleOpenCreateForm}
            className="flex items-center gap-1.5 px-4 py-2 text-white bg-slate-900 hover:bg-slate-800 font-semibold rounded-xl text-xs tracking-wide shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Register New Asset
          </button>
        </div>
      </div>

      {role === "Admin" && isExcelOpen && (
        <div id="excel-import-panel" className="mb-6 p-5 border border-dashed border-slate-250 bg-slate-50/40 rounded-2xl animate-fadeIn">
          <div className="flex justify-between items-center mb-3">
            <div>
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <FileSpreadsheet className="w-4.5 h-4.5 text-emerald-500 shrink-0" />
                Bulk Import Assets from Excel / CSV Sheet
              </h3>
              <p className="text-[11px] text-slate-500 mt-1 font-medium">
                Upload inventory items from a spreadsheet book or standard comma-separated text file (.xlsx, .xls, .csv).
              </p>
            </div>
            <button
              onClick={() => {
                setIsExcelOpen(false);
                setExcelFile(null);
                setParsedAssets([]);
              }}
              className="text-xs text-slate-400 hover:text-slate-650 cursor-pointer font-medium font-sans border border-slate-200 px-2.5 py-1 rounded-lg bg-white"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mt-4">
            <div className="lg:col-span-5 space-y-3">
              <div className="bg-white border border-slate-150 rounded-xl p-4 text-xs text-slate-650 leading-relaxed space-y-2">
                <div className="font-bold text-slate-800 uppercase tracking-widest text-[9.5px]">
                  📋 Expected Columns Mapping
                </div>
                <div className="flex items-start gap-1">
                  <span className="font-bold text-indigo-650">Column `ID`:</span>
                  <span>Used as the unique <strong>Asset ID</strong> (e.g. AST-008)</span>
                </div>
                <div className="flex items-start gap-1">
                  <span className="font-bold text-indigo-650">Column `Asset Type`:</span>
                  <span>Used as the <strong>Device Type</strong> (e.g. iPad, Ingenico, Mobile Phone)</span>
                </div>
                <div className="flex items-start gap-1 flex-wrap">
                  <span className="font-bold text-indigo-650">Device Friendly Name:</span>
                  <span>Formed by joining columns <strong>`Brand Details`</strong>, <strong>`Location`</strong>, and <strong>`Usage Location`</strong>.</span>
                </div>
                <div className="pt-2 border-t border-slate-100 text-slate-400 font-mono text-[9px]">
                  Note: Headers are parsed flexibly and case-independently.
                </div>
              </div>

              {/* Drag and Drop Zone */}
              <div
                className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer relative ${
                  dragActive
                    ? "border-emerald-550 bg-emerald-50/10"
                    : "border-slate-250 hover:border-emerald-500 hover:bg-slate-50/10"
                }`}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => document.getElementById("excel-file-input")?.click()}
              >
                <input
                  type="file"
                  id="excel-file-input"
                  className="hidden"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileSelectChange}
                />
                
                <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mx-auto mb-2.5 border border-emerald-100">
                  <UploadCloud className="w-5 h-5 shrink-0" />
                </div>
                <p className="text-xs font-bold text-slate-800">
                  {excelFile ? excelFile.name : "Choose sheet or Drag & Drop"}
                </p>
                <p className="text-[10.5px] text-slate-400 mt-1">
                  {excelFile 
                    ? `Size: ${(excelFile.size / 1024).toFixed(1)} KB` 
                    : "Supports spreadsheet books (.xlsx, .xls) and CSV data tables"
                  }
                </p>
              </div>
            </div>

            <div className="lg:col-span-7 flex flex-col justify-between border border-slate-150 rounded-xl bg-white p-4">
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-3">
                  <span className="text-[11.5px] font-bold text-slate-700 uppercase tracking-wider">
                    Spreadsheet Preview ({parsedAssets.length} devices detected)
                  </span>
                  {parsedAssets.length > 0 && (
                    <button
                      onClick={() => {
                        setExcelFile(null);
                        setParsedAssets([]);
                      }}
                      className="text-[10px] text-rose-500 hover:underline font-bold tracking-wider uppercase cursor-pointer"
                    >
                      Reset
                    </button>
                  )}
                </div>

                <div className="overflow-y-auto max-h-[170px] text-xs space-y-1.5 pr-1 divide-y divide-slate-100">
                  {parsedAssets.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 font-medium italic">
                      No resources loaded. Select or drag a spreadsheet to preview.
                    </div>
                  ) : (
                    parsedAssets.map((as, idx) => (
                      <div key={idx} className="pt-2 first:pt-0 flex items-center justify-between text-[11px] text-slate-700">
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold text-emerald-650 w-20">{as.id}</span>
                          <span className="font-semibold text-slate-800 truncate max-w-[240px]">{as.name}</span>
                        </div>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-650 text-[9px] font-bold uppercase tracking-wider">
                          {as.type}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {importFeedback && (
                <div id="excel-import-feedback-banner" className={`mt-3 p-3 rounded-xl text-xs font-semibold ${
                  importFeedback.type === "success" 
                    ? "bg-emerald-50 border border-emerald-200 text-emerald-800" 
                    : "bg-rose-50 border border-rose-250 text-rose-800"
                }`}>
                  {importFeedback.type === "success" ? "✅" : "⚠️"} {importFeedback.text}
                </div>
              )}

              <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <span className="text-[10px] text-slate-400 font-semibold leading-normal max-w-sm">
                  {parsedAssets.length > 0 
                    ? "Existing records sharing equivalent IDs will be updated. Check friendly names combination carefully." 
                    : "Upload workbook. Once ready, click import below."
                  }
                </span>

                <button
                  type="button"
                  disabled={parsedAssets.length === 0 || isExcelImporting}
                  onClick={handleCommitExcelImport}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold shadow-sm transition uppercase tracking-wider cursor-pointer text-center ${
                    parsedAssets.length > 0 && !isExcelImporting
                      ? "bg-emerald-600 text-white hover:bg-emerald-750"
                      : "bg-slate-100 text-slate-450 cursor-not-allowed border border-slate-200"
                  }`}
                >
                  {isExcelImporting ? "Importing..." : "Commit Import ✅"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isFormOpen && (
        <div className="mb-6 p-5 border border-slate-200 bg-slate-50/40 rounded-2xl animate-fadeIn">
          <h3 className="font-bold text-sm text-slate-900 mb-4 flex items-center gap-1.5">
            {editingAsset ? "✏️ Modify" : "➕ Register"} Asset Specifications
          </h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-650 mb-1.5 mb-1.5">Asset ID * (e.g. AST-008)</label>
              <input
                type="text"
                value={assetId}
                onChange={(e) => setAssetId(e.target.value)}
                placeholder="AST-XXX"
                className="w-full px-3.5 py-2 border border-slate-200 bg-white rounded-xl text-sm font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all text-slate-800 uppercase"
                disabled={!!editingAsset}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-650 mb-1.5 mb-1.5">Device Type *</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-200 bg-white rounded-xl text-sm font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500/50 cursor-pointer transition-all text-slate-705"
              >
                <option value="iPad">iPad</option>
                <option value="Ingenico">Ingenico POS</option>
                <option value="Mobile Phone">Mobile Phone</option>
                <option value="Other">Other / Custom</option>
              </select>
            </div>

            {type === "Other" && (
              <div>
                <label className="block text-xs font-semibold text-slate-650 mb-1.5">Custom Device Name *</label>
                <input
                  type="text"
                  value={customType}
                  onChange={(e) => setCustomType(e.target.value)}
                  placeholder="e.g. Scanner, Laptop, headset"
                  className="w-full px-3.5 py-2 border border-slate-200 bg-white rounded-xl text-sm font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all text-slate-800"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-650 mb-1.5">Device Friendly Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Product description / location key"
                className="w-full px-3.5 py-2 border border-slate-200 bg-white rounded-xl text-sm font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all text-slate-800"
                required
              />
            </div>



            <div>
              <label className="block text-xs font-semibold text-slate-650 mb-1.5">Physical Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as AssetStatus)}
                className="w-full px-3.5 py-2 border border-slate-200 bg-white rounded-xl text-sm font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500/50 cursor-pointer transition-all text-slate-705"
                disabled={role !== "Admin"}
              >
                <option value={AssetStatus.IN_OFFICE}>In Office / Available</option>
                <option value={AssetStatus.ISSUED}>Issued</option>
                <option value={AssetStatus.RETURNED}>Returned</option>
                <option value={AssetStatus.NOT_TAKEN}>Not Taken</option>
                <option value={AssetStatus.MISSING}>Missing / Not Returned</option>
              </select>
              {role !== "Admin" && (
                <span className="text-[10px] text-slate-450 mt-1 block">Only Admins can override manual status.</span>
              )}
            </div>

            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-xs font-semibold text-slate-650 mb-2.5">Preset Device Photo</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                {PRESET_IMAGES.map((img) => (
                  <button
                    key={img.name}
                    type="button"
                    onClick={() => setImageUrl(img.url)}
                    className={`flex flex-col items-center p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                      imageUrl === img.url
                        ? "border-indigo-600 bg-indigo-50/40 text-indigo-750 font-semibold"
                        : "border-slate-200 hover:bg-slate-50 text-slate-600"
                    }`}
                  >
                    <img referrerPolicy="no-referrer" src={img.url} alt={img.name} className="w-10 h-10 object-cover rounded-md mb-1.5 border border-slate-200/60" />
                    <span className="text-[10px] line-clamp-1">{img.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="md:col-span-2 lg:col-span-3 flex justify-end gap-3 mt-4">
              <button
                type="button"
                onClick={() => {
                  setIsFormOpen(false);
                  resetForm();
                }}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-medium hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer"
              >
                {editingAsset ? "Save Modifications" : "Register Specifications"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Grid List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {assets.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-400">
            <Layers className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium">No assets registered yet in the database.</p>
            <p className="text-xs text-slate-400 mt-1">Click "Register New Asset" above to initialize your control log.</p>
          </div>
        ) : (
          assets.map((asset) => (
            <div
              key={asset.id}
              className="border border-slate-200 hover:border-slate-300 rounded-2xl overflow-hidden bg-white flex flex-col justify-between transition-all hover:shadow-xs relative"
            >
              {/* Card top banner */}
              <div className="p-4 flex gap-4">
                <div className="relative">
                  <img
                    referrerPolicy="no-referrer"
                    src={asset.imageUrl || PRESET_IMAGES[0].url}
                    alt={asset.name}
                    className="w-16 h-16 object-cover rounded-xl border border-slate-200"
                  />
                  <div className="absolute -bottom-2 -right-2 p-1 bg-white border border-slate-200 shadow-xs rounded-full">
                    {getDeviceIcon(asset.type)}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1.5 flex-wrap">
                    <span className="text-[9px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200 px-1.5 py-0.5 rounded uppercase">
                      {asset.id}
                    </span>
                    <span
                      className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                        asset.status === AssetStatus.IN_OFFICE
                          ? "bg-teal-50 text-teal-700 border border-teal-150"
                          : asset.status === AssetStatus.ISSUED
                          ? "bg-indigo-50 text-indigo-700 border border-indigo-150"
                          : asset.status === AssetStatus.MISSING
                          ? "bg-rose-50 text-rose-700 border border-rose-150 animate-pulse"
                          : asset.status === AssetStatus.NOT_TAKEN
                          ? "bg-slate-100 text-slate-500 border border-slate-200"
                          : "bg-indigo-50 text-indigo-700 border border-indigo-150"
                      }`}
                    >
                      {asset.status === AssetStatus.IN_OFFICE ? "In Office" : asset.status}
                    </span>
                  </div>

                  <h4 className="font-bold text-slate-900 text-sm mt-2 line-clamp-1">{asset.name}</h4>

                </div>
              </div>

              {/* Action row */}
              <div className="border-t border-slate-200 px-4 py-2 bg-slate-50/50 flex justify-between items-center text-xs">
                <span className="text-[10px] text-slate-450 font-mono font-medium">
                  {asset.type}
                </span>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => triggerPrint(asset.id, asset.name)}
                    className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded-lg transition-colors border border-transparent hover:border-slate-200 cursor-pointer"
                    title="Print Control Barcode / QR Label"
                  >
                    <Printer className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleEdit(asset)}
                    className="p-1.5 hover:bg-slate-100 text-slate-650 hover:text-slate-950 rounded-lg transition-colors border border-transparent hover:border-slate-200 cursor-pointer"
                    title="Edit Asset Details"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(asset.id)}
                    className="p-1.5 hover:bg-rose-50 text-rose-600 hover:text-rose-800 rounded-lg transition-colors border border-transparent hover:border-rose-200 cursor-pointer"
                    title="Delete Asset Master Spec"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
