import React, { useState } from "react";
import { Asset, AssetStatus } from "../types";
import { Plus, Edit2, Trash2, Smartphone, Tablet, CreditCard, Layers, Tag, Eye, RefreshCw, Printer } from "lucide-react";
import { addDoc, deleteDoc, doc, setDoc } from "firebase/firestore";
import { assetsCol } from "../firebase";

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
  const [serialNumber, setSerialNumber] = useState("");
  const [status, setStatus] = useState<AssetStatus>(AssetStatus.IN_OFFICE);
  const [imageUrl, setImageUrl] = useState("");
  const [showQr, setShowQr] = useState<string | null>(null);

  const resetForm = () => {
    setAssetId("");
    setType("iPad");
    setCustomType("");
    setName("");
    setSerialNumber("");
    setStatus(AssetStatus.IN_OFFICE);
    setImageUrl(PRESET_IMAGES[0].url);
    setEditingAsset(null);
  };

  const handleOpenCreateForm = () => {
    resetForm();
    setIsFormOpen(true);
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
    setSerialNumber(asset.serialNumber || "");
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
      serialNumber,
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
              <label className="block text-xs font-semibold text-slate-650 mb-1.5">Serial Number (optional)</label>
              <input
                type="text"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                placeholder="SN-XXXXX"
                className="w-full px-3.5 py-2 border border-slate-200 bg-white rounded-xl text-sm font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all text-slate-800"
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
                  <p className="text-[11px] text-slate-550 mt-1 flex items-center gap-1">
                    <span className="font-semibold text-slate-400">SN:</span>
                    <span className="font-mono text-slate-600">{asset.serialNumber || "None"}</span>
                  </p>
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
