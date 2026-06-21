import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { selectBaseClass, selectStyle, optionClass } from "../lib/selectTheme";
import { Asset, AssetStatus } from "../types";
import { Plus, Edit2, Trash2, Smartphone, Tablet, CreditCard, Layers, Tag, Eye, RefreshCw, Printer, UploadCloud, FileSpreadsheet, Scan, Camera, Image, Link, Settings, X, Wrench, AlertCircle, CheckCircle2, ExternalLink } from "lucide-react";
import { addDoc, deleteDoc, doc, setDoc, onSnapshot } from "firebase/firestore";
import { assetsCol, deviceTypesCol } from "../firebase";
import { sortDeviceTypes } from "../utils/deviceTypeSort";
import { read, utils, writeFile } from "xlsx";

interface AssetMasterProps {
  assets: Asset[];
  role: "Admin" | "Supervisor";
  loading: boolean;
  onRefresh: () => void;
  onAddAlert: (type: "overdue" | "missing" | "duplicate_issue" | "already_returned" | "system", title: string, message: string, assetId?: string) => void;
  initialTypeFilter?: string;
  initialSearchTerm?: string;
  initialStatusFilter?: string;
}

const PRESET_IMAGES = [
  { name: "iPad Slate Grey", url: "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=150&auto=format&fit=crop&q=60" },
  { name: "iPad Silver Clean", url: "https://images.unsplash.com/photo-1589739900243-4b52cd9b104e?w=150&auto=format&fit=crop&q=60" },
  { name: "Ingenico Terminal Black", url: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=150&auto=format&fit=crop&q=60" },
  { name: "iPhone Charcoal", url: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=150&auto=format&fit=crop&q=60" },
  { name: "BRS Warehouse Scanner", url: "https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=150&auto=format&fit=crop&q=60" },
  { name: "Samsung Galaxy Silver", url: "https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=150&auto=format&fit=crop&q=60" },
];

function generateCode39SVG(data: string) {
  const code39Chars: Record<string, string> = {
    '0': 'NNNWWNWNN', '1': 'WNNWNNNNW', '2': 'NNWWNNNNW', '3': 'WNWWNNNNN',
    '4': 'NNNWWNNNW', '5': 'WNNWWNNNN', '6': 'NNWWWNNNN', '7': 'NNNWWNNWN',
    '8': 'WNNWWNNWN', '9': 'NNWWWNNWN', 'A': 'WNNNNWNNW', 'B': 'NNWNNWNNW',
    'C': 'WNWNNWNNN', 'D': 'NNNNWWNNW', 'E': 'WNNNWWNNN', 'F': 'NNWNWWNNN',
    'G': 'NNNNNWWNW', 'H': 'WNNNNWWNN', 'I': 'NNWNNWWNN', 'J': 'NNNNWWWNN',
    'K': 'WNNNNNNWW', 'L': 'NNWNNNNWW', 'M': 'WNWNNNNWN', 'N': 'NNNNWNNWW',
    'O': 'WNNNWNNWN', 'P': 'NNWNWNNWN', 'Q': 'NNNNNNWWW', 'R': 'WNNNNNWWN',
    'S': 'NNWNNNWWN', 'T': 'NNNNWNWWN', 'U': 'WWNNNNNNW', 'V': 'NWWNNNNNW',
    'W': 'WWWNNNNNN', 'X': 'NWNNWNNNW', 'Y': 'WWNNWNNNN', 'Z': 'NWWWNNNNN',
    '-': 'NWNNNNWNW', '.': 'WWNNNNWNN', ' ': 'NWWNNNWNN', '*': 'NWNNWNWNN',
    '$': 'NWNWNWNNN', '/': 'NWNWNNNWN', '+': 'NWNNNWNWN', '%': 'NNNWNWNWN'
  };

  const formatted = `*${data.toUpperCase().trim()}*`;
  let combinedPattern = "";
  
  for (let i = 0; i < formatted.length; i++) {
    const char = formatted[i];
    const pattern = code39Chars[char] || code39Chars['*'];
    combinedPattern += pattern;
    if (i < formatted.length - 1) {
      combinedPattern += "N";
    }
  }

  const bars: { x: number; width: number; isBlack: boolean }[] = [];
  let currentX = 0;
  
  for (let idx = 0; idx < combinedPattern.length; idx++) {
    const isBlack = idx % 2 === 0;
    const isWide = combinedPattern[idx] === 'W';
    const barWidth = isWide ? 2.5 : 1;
    
    bars.push({ x: currentX, width: barWidth, isBlack });
    currentX += barWidth;
  }

  return (
    <svg width="100%" height="80" viewBox={`0 0 ${currentX} 80`} preserveAspectRatio="none" className="w-full">
      {bars.map((bar, index) => bar.isBlack ? (
        <rect key={index} x={bar.x} y="0" width={bar.width} height="80" fill="black" />
      ) : null)}
    </svg>
  );
}

export default function AssetMaster({ assets, role, loading, onRefresh, onAddAlert, initialTypeFilter, initialSearchTerm, initialStatusFilter }: AssetMasterProps) {
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

  // Dynamic Device Types and Toast Notification states
  const [deviceTypes, setDeviceTypes] = useState<{ id: string; name: string }[]>([]);
  const [toastNotification, setToastNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isTypesManagerOpen, setIsTypesManagerOpen] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [editingType, setEditingType] = useState<{ id: string; name: string } | null>(null);

  // Search & Type Filters inside Asset Master
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  useEffect(() => {
    if (initialTypeFilter !== undefined) {
      setTypeFilter(initialTypeFilter);
    }
  }, [initialTypeFilter]);

  useEffect(() => {
    if (initialSearchTerm !== undefined) {
      setSearchTerm(initialSearchTerm);
    }
  }, [initialSearchTerm]);

  useEffect(() => {
    if (initialStatusFilter !== undefined) {
      setStatusFilter(initialStatusFilter);
    }
  }, [initialStatusFilter]);

  // Custom modal for barcode printing bypasses sandboxed iframe window.open blockers
  const [activePrintAsset, setActivePrintAsset] = useState<Asset | null>(null);
  const [printLayoutType, setPrintLayoutType] = useState<"standard" | "compact">("standard");

  // Print All Barcodes states
  const [activePrintAllAssets, setActivePrintAllAssets] = useState<Asset[] | null>(null);
  const [batchPrintLayout, setBatchPrintLayout] = useState<"grid" | "continuous">("grid");
  const [printSelectMode, setPrintSelectMode] = useState<"filtered" | "all">("filtered");

  // Custom modal overlay popup to handle iframe alert sandboxing safely
  const [customModal, setCustomModal] = useState<{ title: string; message: string; type: "success" | "error" | "info" } | null>(null);

  const isWithinIframe = typeof window !== "undefined" && window.self !== window.top;

  const triggerCustomModal = (title: string, message: string, type: "success" | "error" | "info" = "info") => {
    setCustomModal({ title, message, type });
    try {
      alert(`${title}\n\n${message}`);
    } catch (e) {
      console.warn("Native alert blocked by iframe sandbox, using elegant custom DOM modal:", e);
    }
  };

  useEffect(() => {
    let active = true;
    const unsubTypes = onSnapshot(deviceTypesCol, (snapshot) => {
      if (!active) return;
      const list: { id: string; name: string }[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data && data.name) {
          list.push({ id: docSnap.id, name: data.name });
        }
      });
      
      const sorted = list.sort((a, b) => {
        const order = sortDeviceTypes([a.name, b.name]);
        return order[0] === a.name ? -1 : 1;
      });
      if (sorted.length === 0) {
        // Fallback to initial defaults if collection is empty
        const defaults = [
          { id: "pda@ops", name: "PDA@OPS" },
          { id: "ipad", name: "IPAD" },
          { id: "ipad-mini", name: "IPAD Mini (ALS)" },
          { id: "ingenico-pos", name: "Ingenico POS" },
          { id: "mobile-phone", name: "Mobile Phone" },
          { id: "hold-camera", name: "Hold Camera Phone" },
          { id: "brs-scanner", name: "BRS Scanner" }
        ];
        console.log("No custom categories in database, showing default categories:", defaults);
        setDeviceTypes(defaults);
      } else {
        setDeviceTypes(sorted);
      }
    }, (error) => {
      console.warn("Device types subscription failed, falling back to offline categories:", error);
      const defaults = [
        { id: "ipad", name: "iPad" },
        { id: "ingenico-pos", name: "Ingenico POS" },
        { id: "mobile-phone", name: "Mobile Phone" },
        { id: "brs-scanner", name: "BRS Scanner" }
      ];
      setDeviceTypes(defaults);
    });
    return () => {
      active = false;
      unsubTypes();
    };
  }, []);

  // Excel Sheet upload states
  const [isExcelOpen, setIsExcelOpen] = useState(false);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [parsedAssets, setParsedAssets] = useState<Asset[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [isExcelImporting, setIsExcelImporting] = useState(false);
  const [importFeedback, setImportFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handlePhotoUploadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 2 * 1024 * 1024) {
        alert("The selected image file is too large (maximum limit: 2 MB).");
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setImageUrl(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

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

          const cleanedId = assetIdVal.toUpperCase().trim().replace(/\s+/g, "-");

          // 2. Device Type from "Asset Type"
          let deviceType = findValueByHeader(row, ["Asset Type", "Device Type", "Type", "AssetType", "DeviceType"]);
          if (!deviceType) {
            deviceType = "Other"; // Default fallback
          }

          // 3. Device Friendly Name - support direct columns or build from pieces
          let combinedName = findValueByHeader(row, ["Friendly Name", "Device Name", "Asset Name", "Name", "Device Friendly Name"]);
          if (!combinedName) {
            const location = findValueByHeader(row, ["Location", "Loc", "Location Key"]);
            const brand = findValueByHeader(row, ["Brand Details", "Brand", "Brand_Details", "BrandDetails"]);
            const usage = findValueByHeader(row, ["Usage Location", "Usage_Location", "UsageLocation", "Usage Key"]);

            // Build combined friendly name safely skipping empty parts
            const nameParts = [brand, location, usage].filter(val => val !== "");
            combinedName = nameParts.join(" - ") || `Asset ${cleanedId}`;
          }

          // 4. Current Status
          const statusVal = findValueByHeader(row, ["Current Status", "Asset Status", "Status"]);
          let parsedStatus = AssetStatus.IN_OFFICE;
          if (statusVal) {
            const matchedEnum = Object.values(AssetStatus).find(
              (v) => v.toLowerCase() === statusVal.trim().toLowerCase()
            );
            if (matchedEnum) {
              parsedStatus = matchedEnum;
            }
          }

          // 5. Image URL
          const imageUrlVal = findValueByHeader(row, ["Image URL", "ImageUrl", "Image", "Image_URL"]);

          // Check if this asset already exists in local assets array
          const existingAsset = assets.find(a => a.id.toUpperCase() === cleanedId.toUpperCase());
          const currentAssignmentId = existingAsset ? (existingAsset.currentAssignmentId || null) : null;
          const finalStatus = statusVal ? parsedStatus : (existingAsset ? existingAsset.status : AssetStatus.IN_OFFICE);
          
          let finalImageUrl = PRESET_IMAGES[0].url;
          if (existingAsset && existingAsset.imageUrl) {
            finalImageUrl = existingAsset.imageUrl;
          }
          if (imageUrlVal && typeof imageUrlVal === "string" && imageUrlVal.trim() !== "") {
            const cleanedVal = imageUrlVal.trim();
            const isPlaceholder = cleanedVal.startsWith("[") || cleanedVal.toLowerCase().includes("embedded") || cleanedVal.toLowerCase().includes("preserve") || cleanedVal.toLowerCase().includes("do not edit");
            if (!isPlaceholder) {
              finalImageUrl = cleanedVal;
            }
          }

          results.push({
            id: cleanedId,
            type: deviceType,
            name: combinedName,
            status: finalStatus,
            currentAssignmentId: currentAssignmentId,
            imageUrl: finalImageUrl,
            lastUpdated: Date.now()
          });
        }

        if (results.length === 0) {
          triggerCustomModal("Validation Error", "No valid rows matching ID found. Please inspect the headers in your uploaded spreadsheet.", "error");
          setExcelFile(null);
          setParsedAssets([]);
        } else {
          setParsedAssets(results);
        }
      } catch (err) {
        console.error("Error reading spreadsheet layout:", err);
        triggerCustomModal("Parsing Error", "Could not successfully parse this spreadsheet file.", "error");
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

      triggerCustomModal(
        "Excel Import Finished",
        `Database synchronization completed! Successfully registered/updated ${successCount} devices in Firestore. Failed entries: ${failureCount}.`,
        "success"
      );
      
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
      triggerCustomModal(
        "Import compilation failed",
        "Encountered a database issue compiling bulk imports. Please verify your Firestore connections.",
        "error"
      );
    } finally {
      setIsExcelImporting(false);
    }
  };

  const handleEdit = (asset: Asset) => {
    setEditingAsset(asset);
    setAssetId(asset.id);
    const normalizedType = (asset.type || "").toLowerCase().trim();
    if (normalizedType === "ipad" || normalizedType === "ipads") {
      setType("iPad");
      setCustomType("");
    } else if (normalizedType === "ingenico" || normalizedType === "ingenico pos") {
      setType("Ingenico POS");
      setCustomType("");
    } else if (normalizedType === "mobile phone" || normalizedType === "mobile phones") {
      setType("Mobile Phone");
      setCustomType("");
    } else if (normalizedType === "brs scanner" || normalizedType === "brs scanners") {
      setType("BRS Scanner");
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
      currentAssignmentId: (editingAsset && editingAsset.currentAssignmentId) ? editingAsset.currentAssignmentId : null,
      lastUpdated: Date.now()
    };

    try {
      await setDoc(doc(assetsCol, cleanedAssetId), assetData);
      setIsFormOpen(false);
      resetForm();
      onRefresh();

      // Show dynamic user-friendly alert prompt/toast
      const successMsg = editingAsset 
        ? `Successfully modified details for device ${cleanedAssetId} in database.`
        : `Successfully registered new specifications for ${cleanedAssetId} inside inventory.`;
      
      setToastNotification({
        type: "success",
        text: successMsg
      });

      // Show the beautifully styled custom popup dialog to confirm database update!
      triggerCustomModal(
        editingAsset ? "Asset Modified" : "Asset Registered",
        successMsg,
        "success"
      );

      // Automatically hide after 4 seconds
      setTimeout(() => setToastNotification(null), 4000);
    } catch (error) {
      console.error("Error saving asset: ", error);
      setToastNotification({
        type: "error",
        text: `Error saving asset specifications for ${cleanedAssetId}. Permission incident.`
      });
      triggerCustomModal(
        "Save Failed",
        `Failed to save details for asset ${cleanedAssetId} due to a permissions incident or network issue.`,
        "error"
      );
    }
  };

  // Device type database category handlers
  const handleAddType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTypeName.trim()) return;

    const trimmedName = newTypeName.trim();
    // Clean to lowercase hyphenated ID
    const typeId = trimmedName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    if (!typeId) {
      triggerCustomModal("Invalid Input", "Please provide a valid category name consisting of letters, numbers, or spaces.", "error");
      return;
    }

    const alreadyExists = deviceTypes.some(t => t.id === typeId || t.name.toLowerCase() === trimmedName.toLowerCase());
    if (alreadyExists) {
      triggerCustomModal(
        "Duplicate Category",
        `The category "${trimmedName}" matches an existing dynamic category description or ID.`,
        "error"
      );
      return;
    }

    try {
      await setDoc(doc(deviceTypesCol, typeId), { id: typeId, name: trimmedName });
      setNewTypeName("");
      setToastNotification({
        type: "success",
        text: `Device category "${trimmedName}" was recorded in master databases.`
      });
      
      // Confirm the new category added with a pop-up!
      triggerCustomModal(
        "Device Category Registered",
        `Success! The device category "${trimmedName}" has been successfully added to the master list. It is now immediately available in the registration form select dropdown.`,
        "success"
      );

      setTimeout(() => setToastNotification(null), 4000);
    } catch (err) {
      console.error("Error storing device type:", err);
      triggerCustomModal("Database Error", "Failed to add custom device type into Firebase Firestore database.", "error");
    }
  };

  const handleUpdateType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingType || !newTypeName.trim()) return;

    const trimmedName = newTypeName.trim();
    try {
      await setDoc(doc(deviceTypesCol, editingType.id), { id: editingType.id, name: trimmedName });
      setNewTypeName("");
      setEditingType(null);
      setToastNotification({
        type: "success",
        text: `Device category renamed to "${trimmedName}" successfully.`
      });
      
      triggerCustomModal(
        "Device Category Modified",
        `Success! The category has been renamed to "${trimmedName}" in the database.`,
        "success"
      );

      setTimeout(() => setToastNotification(null), 4000);
    } catch (err) {
      console.error("Error editing device type:", err);
      triggerCustomModal("Database Error", "Failed to modify device category in Firestore database.", "error");
    }
  };

  const handleDeleteType = async (typeId: string, name: string) => {
    let confirmDelete = true;
    try {
      confirmDelete = window.confirm(`Are you sure you want to delete Category "${name}"?\n\nWarning: This will remove "${name}" from selection dropdown list. Existing assets marked as "${name}" are unaffected.`);
    } catch (e) {
      console.warn("Native confirm blocked by user sandbox, safety-overriding.", e);
    }

    if (!confirmDelete) return;

    try {
      await deleteDoc(doc(deviceTypesCol, typeId));
      setToastNotification({
        type: "success",
        text: `Device category "${name}" is no longer active.`
      });
      
      triggerCustomModal(
        "Device Category Removed",
        `The device category "${name}" has been successfully deleted from active lists.`,
        "success"
      );

      setTimeout(() => setToastNotification(null), 4000);
    } catch (err) {
      console.error("Error deleting style:", err);
      triggerCustomModal("Database Error", "Failed to delete category from database.", "error");
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

  const filteredAssets = assets.filter((asset) => {
    const matchesSearch = 
      (asset.id || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (asset.name || "").toLowerCase().includes(searchTerm.toLowerCase());

    // 1. Status Filter matching logic
    let matchesStatus = true;
    if (statusFilter !== "All") {
      if (statusFilter.toLowerCase() === "issued") {
        matchesStatus = (asset.status || "").toLowerCase() === "issued" || (asset.status || "").toLowerCase() === "active issued";
      } else if (statusFilter.toLowerCase() === "in office") {
        matchesStatus = (asset.status || "").toLowerCase() === "in office" || (asset.status || "").toLowerCase() === "in_office";
      } else if (statusFilter.toLowerCase() === "missing") {
        matchesStatus = (asset.status || "").toLowerCase() === "missing" || (asset.status || "").toLowerCase() === "missing / not returned";
      } else if (statusFilter.toLowerCase() === "not taken") {
        matchesStatus = (asset.status || "").toLowerCase() === "not taken" || (asset.status || "").toLowerCase() === "not_taken";
      } else {
        matchesStatus = (asset.status || "").toLowerCase() === statusFilter.toLowerCase();
      }
    }

    if (!matchesStatus) {
      return false;
    }

    // 2. Type Filter matching logic
    if (typeFilter === "All") {
      return matchesSearch;
    }
    
    // Support compound filters or groups
    if (typeFilter.toLowerCase() === "ipad group" || typeFilter.toLowerCase() === "ipad") {
      const typeLower = (asset.type || "").toLowerCase();
      const nameLower = (asset.name || "").toLowerCase();
      const isIpadLike = typeLower.includes("ipad") || typeLower.includes("pda") ||
                         nameLower.includes("ipad") || nameLower.includes("pda");
      return matchesSearch && isIpadLike;
    }

    if (typeFilter.toLowerCase() === "ingenico group" || typeFilter.toLowerCase() === "ingenico pos" || typeFilter.toLowerCase() === "ingenico") {
      const typeLower = (asset.type || "").toLowerCase();
      const nameLower = (asset.name || "").toLowerCase();
      const isIngenico = typeLower.includes("ingenico") || nameLower.includes("ingenico");
      return matchesSearch && isIngenico;
    }

    if (typeFilter.toLowerCase() === "scanner group" || typeFilter.toLowerCase() === "brs scanner" || typeFilter.toLowerCase() === "scanner") {
      const typeLower = (asset.type || "").toLowerCase();
      const nameLower = (asset.name || "").toLowerCase();
      const isScanner = typeLower.includes("scanner") || nameLower.includes("scanner") ||
                        typeLower.includes("scan") || nameLower.includes("scan");
      return matchesSearch && isScanner;
    }

    if (typeFilter.toLowerCase() === "hold camera phone group" || typeFilter.toLowerCase() === "hold camera phone") {
      const typeLower = (asset.type || "").toLowerCase();
      const nameLower = (asset.name || "").toLowerCase();
      const isHoldCamera = typeLower.includes("hold") || nameLower.includes("hold") ||
                           typeLower.includes("camera") || nameLower.includes("camera");
      return matchesSearch && isHoldCamera;
    }

    if (typeFilter.toLowerCase() === "mobile phone group" || typeFilter.toLowerCase() === "mobile phone") {
      const typeLower = (asset.type || "").toLowerCase().trim();
      return matchesSearch && typeLower === "mobile phone";
    }

    if (typeFilter === "Other") {
      const knownTypeNames = deviceTypes.map(dt => (dt.name || "").toLowerCase());
      const isKnown = knownTypeNames.includes((asset.type || "").toLowerCase());
      return matchesSearch && (!isKnown || (asset.type || "").toLowerCase() === "other");
    }

    return matchesSearch && (asset.type || "").toLowerCase() === typeFilter.toLowerCase();
  });

  const handleExportExcel = () => {
    try {
      const exportData = assets.map((asset) => {
        let exportedImageUrl = asset.imageUrl || "";
        // Excel maximum cell text length is 32,767 characters. 
        // Base64 photos will exceed this, so we export a placeholder that we recognize on import.
        if (exportedImageUrl.startsWith("data:") || exportedImageUrl.length > 30000) {
          exportedImageUrl = "[Embedded Base64 Image - Do Not Edit]";
        }
        return {
          "Asset ID": asset.id,
          "Device Type": asset.type,
          "Friendly Name": asset.name,
          "Current Status": asset.status,
          "Image URL": exportedImageUrl
        };
      });

      const worksheet = utils.json_to_sheet(exportData);
      const workbook = utils.book_new();
      utils.book_append_sheet(workbook, worksheet, "Inventory");

      const maxIdLen = assets.length > 0 ? Math.max(...assets.map(a => (a.id || "").length), 10) : 10;
      const maxTypeLen = assets.length > 0 ? Math.max(...assets.map(a => (a.type || "").length), 15) : 15;
      const maxNameLen = assets.length > 0 ? Math.max(...assets.map(a => (a.name || "").length), 20) : 20;
      const maxStatusLen = assets.length > 0 ? Math.max(...assets.map(a => (a.status || "").length), 15) : 15;
      
      worksheet["!cols"] = [
        { wch: maxIdLen + 2 },
        { wch: maxTypeLen + 2 },
        { wch: maxNameLen + 4 },
        { wch: maxStatusLen + 2 },
        { wch: 35 }
      ];

      const dateStr = new Date().toISOString().split("T")[0];
      writeFile(workbook, `Asset_Inventory_Export_${dateStr}.xlsx`);
      
      setToastNotification({
        type: "success",
        text: "Successfully compiled and downloaded Excel master database backup."
      });
      setTimeout(() => setToastNotification(null), 4000);
    } catch (err) {
      console.error("Export failed:", err);
      triggerCustomModal("Export Error", "Failed to export database inventory sheet. Check browser permissions.", "error");
    }
  };

  const triggerPrint = (id: string, name: string) => {
    const assetObj = assets.find((a) => a.id === id) || {
      id,
      name,
      type: "Unknown",
      status: AssetStatus.IN_OFFICE,
      imageUrl: ""
    };
    setActivePrintAsset(assetObj);
  };

  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType.toLowerCase()) {
      case "ipad":
      case "ipads":
        return <Tablet className="w-4 h-4 text-emerald-500" />;
      case "ingenico":
      case "ingenico pos":
        return <CreditCard className="w-4 h-4 text-indigo-500" />;
      case "mobile phone":
      case "mobile phones":
        return <Smartphone className="w-4 h-4 text-teal-400" />;
      case "brs scanner":
      case "brs scanners":
        return <Scan className="w-4 h-4 text-blue-500" />;
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
                setIsTypesManagerOpen(false);
              }}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 hover:border-indigo-500 text-slate-705 bg-white hover:bg-indigo-50/10 font-semibold rounded-xl text-xs tracking-wide shadow-sm transition-all cursor-pointer animate-fadeIn"
            >
              <UploadCloud className="w-4 h-4 text-emerald-500" />
              Upload Excel Inventory
            </button>
          )}
          <button
            id="export-excel-inventory-button"
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 hover:border-indigo-500 text-slate-705 bg-white hover:bg-indigo-50/10 font-semibold rounded-xl text-xs tracking-wide shadow-sm transition-all cursor-pointer animate-fadeIn"
            title="Export all inventory to Excel workbook"
          >
            <FileSpreadsheet className="w-4 h-4 text-indigo-500" />
            Export Inventory
          </button>
          <button
            id="print-bulk-barcodes-button"
            onClick={() => {
              if (assets.length === 0) {
                triggerCustomModal("Print Error", "There are no devices registered in your inventory to print barcodes from.", "error");
                return;
              }
              const activeFiltersExist = searchTerm.trim() !== "" || typeFilter !== "All";
              setPrintSelectMode(activeFiltersExist ? "filtered" : "all");
              setActivePrintAllAssets(activeFiltersExist ? filteredAssets : assets);
            }}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 hover:border-indigo-500 text-slate-705 bg-white hover:bg-indigo-50/10 font-semibold rounded-xl text-xs tracking-wide shadow-sm transition-all cursor-pointer animate-fadeIn"
            title="Print barcodes for devices in batch"
          >
            <Printer className="w-4 h-4 text-indigo-500" />
            Print Barcodes
          </button>
          {role === "Admin" && (
            <button
              id="manage-device-categories-button"
              onClick={() => {
                setIsTypesManagerOpen(!isTypesManagerOpen);
                setIsFormOpen(false);
                setIsExcelOpen(false);
              }}
              className={`flex items-center gap-1.5 px-3 py-2 border font-semibold rounded-xl text-xs tracking-wide shadow-sm transition-all cursor-pointer ${
                isTypesManagerOpen
                  ? "border-amber-500 bg-amber-50/20 text-amber-700"
                  : "border-slate-200 hover:border-amber-500 text-slate-705 bg-white hover:bg-amber-50/10"
              }`}
            >
              <Settings className="w-4 h-4 text-amber-550" />
              Manage Device Categories
            </button>
          )}
          <button
            id="register-asset-button"
            onClick={() => {
              handleOpenCreateForm();
              setIsTypesManagerOpen(false);
            }}
            className="flex items-center gap-1.5 px-4 py-2 text-white bg-slate-900 hover:bg-slate-800 font-semibold rounded-xl text-xs tracking-wide shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Register New Asset
          </button>
        </div>
      </div>

      {toastNotification && (
        <div
          id="operation-success-toast"
          className={`mb-5 p-3.5 rounded-2xl border flex items-center gap-3 animate-slideIn ${
            toastNotification.type === "success"
              ? "bg-emerald-50 border-emerald-250 text-emerald-800"
              : "bg-rose-50 border-rose-250 text-rose-800"
          }`}
        >
          {toastNotification.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
          )}
          <div className="flex-1 text-xs font-semibold">
            {toastNotification.text}
          </div>
          <button
            onClick={() => setToastNotification(null)}
            className={`text-[10px] uppercase font-bold tracking-wider cursor-pointer ${
              toastNotification.type === "success" ? "text-emerald-700 hover:underline" : "text-rose-700 hover:underline"
            }`}
          >
            Dismiss
          </button>
        </div>
      )}

      {role === "Admin" && isTypesManagerOpen && (
        <div id="categories-manager-panel" className="mb-6 p-5 border border-slate-200 bg-amber-50/10 rounded-2xl animate-fadeIn space-y-4">
          <div className="flex justify-between items-start pb-2 border-b border-amber-100 mb-2">
            <div>
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Wrench className="w-4 h-4 text-amber-500" />
                Customize Master Device Categories
              </h3>
              <p className="text-[11px] text-slate-500 mt-1">
                Add, modify or delete standard class categories available in the registration select menu.
              </p>
            </div>
            <button
              onClick={() => {
                setIsTypesManagerOpen(false);
                setEditingType(null);
                setNewTypeName("");
              }}
              className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Form */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3.5">
              <span className="text-xs font-bold text-slate-800 block">
                {editingType ? "✏️ Rename Category Class" : "➕ Add Custom Class"}
              </span>
              <form onSubmit={editingType ? handleUpdateType : handleAddType} className="space-y-3.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Category Name *</label>
                  <input
                    type="text"
                    value={newTypeName}
                    onChange={(e) => setNewTypeName(e.target.value)}
                    placeholder="e.g. Card Reader, VR Headset"
                    className="w-full px-3 py-2 border border-slate-200 bg-white rounded-lg text-xs font-medium focus:outline-none focus:ring-1 focus:ring-amber-500/50 transition-all text-slate-800"
                    required
                  />
                </div>
                <div className="flex justify-end gap-2">
                  {editingType && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingType(null);
                        setNewTypeName("");
                      }}
                      className="px-3 py-1.5 border border-slate-200 text-slate-500 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-slate-50 transition cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-white bg-amber-600 hover:bg-amber-705 rounded-lg text-[10px] font-bold uppercase tracking-wider shadow-xs transition cursor-pointer"
                  >
                    {editingType ? "Rename" : "Create Option"}
                  </button>
                </div>
              </form>
            </div>

            {/* List */}
            <div className="md:col-span-2 bg-white border border-slate-200 rounded-xl p-4">
              <span className="text-xs font-bold text-slate-800 block mb-3">Dropdown Options Classes ({deviceTypes.length})</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-1">
                {deviceTypes.length === 0 ? (
                  <div className="col-span-full text-center py-6 text-slate-400 text-xs italic">
                    Loading category lists from database...
                  </div>
                ) : (
                  deviceTypes.map((dt) => (
                    <div
                      key={dt.id}
                      className="flex items-center justify-between p-2 rounded-lg border border-slate-100 bg-slate-50/20 text-xs"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Tag className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span className="font-bold text-slate-800 truncate" title={dt.name}>{dt.name}</span>
                        <span className="text-[9px] font-mono text-slate-400 truncate max-w-[80px]">({dt.id})</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingType(dt);
                            setNewTypeName(dt.name);
                          }}
                          className="p-1 text-slate-500 hover:text-amber-650 hover:bg-amber-50 rounded transition cursor-pointer"
                          title="Rename Option"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteType(dt.id, dt.name)}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                          title="Delete Option"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

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
              <label className="block text-xs font-semibold text-slate-650 mb-1.5">Device Type *</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className={`w-full h-10 ${selectBaseClass}`}
                style={selectStyle}
              >
                {deviceTypes.length > 0 ? (
                  deviceTypes.map((dt) => (
                    <option key={dt.id} value={dt.name} className={optionClass}>{dt.name}</option>
                  ))
                ) : (
                  <>
                    <option value="PDA@OPS" className={optionClass}>PDA@OPS</option>
                    <option value="IPAD" className={optionClass}>IPAD</option>
                    <option value="IPAD Mini (ALS)" className={optionClass}>IPAD Mini (ALS)</option>
                    <option value="Ingenico POS" className={optionClass}>Ingenico POS</option>
                    <option value="Mobile Phone" className={optionClass}>Mobile Phone</option>
                    <option value="Hold Camera Phone" className={optionClass}>Hold Camera Phone</option>
                    <option value="BRS Scanner" className={optionClass}>BRS Scanner</option>
                  </>
                )}
                <option value="Other" className={optionClass}>Other / Custom</option>
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
                className={`w-full h-10 ${selectBaseClass}`}
                style={selectStyle}
                disabled={role !== "Admin"}
              >
                <option value={AssetStatus.IN_OFFICE} className={optionClass}>In Office / Available</option>
                <option value={AssetStatus.ISSUED} className={optionClass}>Issued</option>
                <option value={AssetStatus.RETURNED} className={optionClass}>Returned</option>
                <option value={AssetStatus.NOT_TAKEN} className={optionClass}>Not Taken</option>
                <option value={AssetStatus.MISSING} className={optionClass}>Missing / Not Returned</option>
              </select>
              {role !== "Admin" && (
                <span className="text-[10px] text-slate-450 mt-1 block">Only Admins can override manual status.</span>
              )}
            </div>

            <div className="md:col-span-2 lg:col-span-3 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-650 mb-2.5">Preset Device Photo</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
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

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3.5">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-slate-500" />
                  Or Add Custom Device Photo
                </span>
                
                <div className="flex flex-col sm:flex-row gap-4">
                  {/* Option A: Upload File */}
                  <div className="flex-1 space-y-1.5">
                    <span className="block text-[11px] font-semibold text-slate-550">File Upload (.png, .jpg, .jpeg)</span>
                    <label className="flex items-center justify-center gap-2 px-3 py-2 border border-slate-250 hover:border-indigo-500 hover:bg-white rounded-xl text-xs font-semibold text-slate-700 transition-all cursor-pointer bg-slate-100/50">
                      <UploadCloud className="w-4 h-4 text-slate-500" />
                      Choose Local Image File
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoUploadChange}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {/* Option B: Enter Web URL */}
                  <div className="flex-1 space-y-1.5">
                    <span className="block text-[11px] font-semibold text-slate-550">Web Image URL</span>
                    <input
                      type="url"
                      value={imageUrl.startsWith("data:") ? "" : imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="https://example.com/photo.jpg"
                      className="w-full px-3 py-2 border border-slate-250 bg-white rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all text-slate-800"
                    />
                  </div>
                </div>

                {/* Live Preview Bar */}
                {imageUrl && (
                  <div className="pt-2 flex items-center gap-3">
                    <img
                      referrerPolicy="no-referrer"
                      src={imageUrl}
                      alt="Device preview"
                      className="w-12 h-12 object-cover rounded-xl border border-slate-200 bg-white"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=150&auto=format&fit=crop&q=60";
                      }}
                    />
                    <div>
                      <span className="text-[11px] font-bold text-slate-700 block">Selected Photo Preview</span>
                      <span className="text-[10px] text-slate-400 font-mono block truncate max-w-[280px]">
                        {imageUrl.startsWith("data:") ? "Local Upload (Base64 Mode)" : imageUrl}
                      </span>
                    </div>
                  </div>
                )}
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

      {/* Filtering and Search Controls */}
      <div id="inventory-filter-bar" className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:max-w-xs">
          <input
            type="text"
            placeholder="Search ID or friendly name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8.5 pr-8.5 py-2 border border-slate-200 bg-white rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all text-slate-800"
          />
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600 font-bold text-xs cursor-pointer"
            >
              ×
            </button>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3.5 w-full sm:w-auto shrink-0 justify-end">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`${selectBaseClass} min-w-[120px] px-3 h-8 text-[11px]`}
              style={{ ...selectStyle, paddingRight: '2rem', backgroundSize: '1.2em 1.2em', backgroundPosition: 'right 0.5rem center' }}
            >
              <option value="All" className={optionClass}>All Statuses</option>
              <option value="In Office" className={optionClass}>In Office Available</option>
              <option value="Issued" className={optionClass}>Issued to Agent</option>
              <option value="Missing" className={optionClass}>Missing / Overdue</option>
              <option value="Not Taken" className={optionClass}>Not Taken during Shift</option>
            </select>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">Type:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className={`${selectBaseClass} min-w-[140px] px-3 h-8 text-[11px]`}
              style={{ ...selectStyle, paddingRight: '2rem', backgroundSize: '1.2em 1.2em', backgroundPosition: 'right 0.5rem center' }}
            >
              <option value="All" className={optionClass}>All Device Types</option>
              <optgroup label="Compound Groups" className="font-bold text-slate-600 bg-slate-50">
                <option value="ipad group" className={optionClass}>📱 iPads & PDAs (iPad, iPad Mini, PDA@OPS)</option>
                <option value="ingenico group" className={optionClass}>💳 Ingenico POS</option>
                <option value="scanner group" className={optionClass}>🔍 BRS Scanners & PDAs</option>
                <option value="mobile phone group" className={optionClass}>📞 Mobile Phones Only</option>
                <option value="hold camera phone group" className={optionClass}>📷 Hold Camera Phones</option>
              </optgroup>
              <optgroup label="Registered Types" className="font-bold text-slate-600 bg-slate-50">
                {deviceTypes.map((dt) => (
                  <option key={dt.id} value={dt.name} className={optionClass}>{dt.name}</option>
                ))}
                <option value="Other" className={optionClass}>Other / Custom</option>
              </optgroup>
            </select>
          </div>
        </div>
      </div>

      {/* Grid List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {assets.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-400">
            <Layers className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium">No assets registered yet in the database.</p>
            <p className="text-xs text-slate-400 mt-1">Click "Register New Asset" above to initialize your control log.</p>
          </div>
        ) : filteredAssets.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
            <Layers className="w-12 h-12 text-slate-300 mx-auto mb-3 opacity-60" />
            <p className="text-sm font-medium">No assets match your search or filter selection.</p>
            <p className="text-xs text-slate-400 mt-1">Try adjusting your filters or clearing the search term.</p>
          </div>
        ) : (
          filteredAssets.map((asset) => (
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

      {customModal && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity" onClick={() => setCustomModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-150 max-w-sm w-full p-6 animate-scaleIn select-none">
            <button
              onClick={() => setCustomModal(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex flex-col items-center text-center">
              {customModal.type === "success" && (
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-3.5 border border-emerald-100">
                  <CheckCircle2 className="w-6 h-6 shrink-0" />
                </div>
              )}
              {customModal.type === "error" && (
                <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mb-3.5 border border-rose-100">
                  <AlertCircle className="w-6 h-6 shrink-0" />
                </div>
              )}
              {customModal.type === "info" && (
                <div className="w-12 h-12 bg-indigo-55/10 text-indigo-600 rounded-full flex items-center justify-center mb-3.5 border border-indigo-100">
                  <Wrench className="w-6 h-6 shrink-0" />
                </div>
              )}
              <h4 className="font-bold text-slate-900 text-sm mb-1.5">{customModal.title}</h4>
              <p className="text-xs text-slate-500 font-medium leading-relaxed mb-4">{customModal.message}</p>
              <button
                type="button"
                onClick={() => setCustomModal(null)}
                className="w-full py-2 bg-slate-900 text-white font-bold hover:bg-slate-800 rounded-xl text-xs uppercase tracking-wider transition shadow-sm cursor-pointer"
              >
                O.K.
              </button>
            </div>
          </div>
        </div>
      )}

      {activePrintAsset && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity" onClick={() => setActivePrintAsset(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-200 max-w-sm w-full p-6 animate-scaleIn select-none flex flex-col items-center">
            
            <button
              onClick={() => setActivePrintAsset(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 cursor-pointer"
              type="button"
            >
              <X className="w-4 h-4" />
            </button>

            <span className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl mb-3 flex items-center justify-center border border-indigo-100/50">
              <Printer className="w-5 h-5 shrink-0" />
            </span>
            <h4 className="font-bold text-slate-900 text-sm mb-1">Print Control Tag</h4>
            <p className="text-[10px] text-slate-500 font-medium text-center mb-4 leading-normal">
              Prepares label templates optimized for thermal barcode receipt printers or customized labels. Bypasses sandboxed iframe popup blocks perfectly.
            </p>

            {/* Label Style selector */}
            <div className="w-full flex items-center justify-between mb-4 px-2.5 py-1.5 bg-slate-50 border border-slate-150 rounded-xl">
              <span className="text-[9px] uppercase tracking-wider text-slate-450 font-bold pl-1">Label Density</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setPrintLayoutType("standard")}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wide transition-all cursor-pointer ${
                    printLayoutType === "standard"
                      ? "bg-white text-indigo-600 shadow-xs border border-indigo-100"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Standard (Code 39)
                </button>
                <button
                  type="button"
                  onClick={() => setPrintLayoutType("compact")}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wide transition-all cursor-pointer ${
                    printLayoutType === "compact"
                      ? "bg-white text-indigo-600 shadow-xs border border-indigo-100"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Compact Code
                </button>
              </div>
            </div>

            {/* Physical Label Live Preview */}
            <div className="w-full border-2 border-dashed border-slate-200 p-4 rounded-2xl bg-slate-50/50 mb-5 flex flex-col items-center justify-center text-center font-mono">
              <div className="border border-slate-900 bg-white p-4 rounded-lg w-full max-w-[260px] shadow-xs text-slate-900 select-none">
                <span className="text-[8px] font-extrabold uppercase tracking-[2px] text-slate-900 border-b border-slate-900 pb-1 block mb-2 text-center">
                  Asset Control Label
                </span>
                <div className="my-2 py-0.5">
                  {generateCode39SVG(activePrintAsset.id)}
                </div>
                <div className="text-[11px] font-black tracking-widest text-slate-950 mt-1 uppercase text-center">
                  * {activePrintAsset.id} *
                </div>
                <div className="text-[9px] font-bold text-slate-800 mt-2 font-sans truncate text-center">
                  {activePrintAsset.name}
                </div>
                <div className="text-[8px] font-medium text-slate-500 mt-0.5 text-center">
                  Type: {activePrintAsset.type || "Unknown"} | {activePrintAsset.status}
                </div>
              </div>
            </div>

            {isWithinIframe && (
              <div className="w-full mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-[10px] leading-relaxed font-semibold flex items-start gap-1.5 animate-fadeIn">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-extrabold uppercase text-amber-850 block mb-0.5">⚠️ Preview Sandbox Restrictions</span>
                  Browsers protect security by disabling printers inside preview iframes. Open the app in a new independent tab to enable standard print layouts.
                </div>
              </div>
            )}

            {/* Print and Close Actions */}
            <div className="flex flex-col gap-2 w-full">
              {isWithinIframe && (
                <button
                  type="button"
                  onClick={() => {
                    try {
                      window.open(window.location.href, "_blank");
                    } catch (err) {
                      console.error("Open tab failed:", err);
                      triggerCustomModal("Tab Blocked", "Your browser blocked opening a new tab. Please click the 'Open in static tab' button in the toolbar overlay or allow popups.", "error");
                    }
                  }}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-xs uppercase tracking-wider transition shadow-sm cursor-pointer flex items-center justify-center gap-2 border border-indigo-700 animate-pulse"
                >
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  Open in New Tab & Print
                </button>
              )}
              <div className="flex gap-2 w-full">
                <button
                  type="button"
                  onClick={() => setActivePrintAsset(null)}
                  className="flex-1 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-250/70 hover:border-slate-300 font-bold text-xs uppercase tracking-wider rounded-xl transition cursor-pointer text-center"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      window.print();
                    } catch (err) {
                      console.error("Print call failed:", err);
                      triggerCustomModal("System Printing Error", "Could not trigger system hardware print driver.", "error");
                    }
                  }}
                  className={`flex-1 py-2 font-bold rounded-xl text-xs uppercase tracking-wider transition shadow-sm cursor-pointer flex items-center justify-center gap-1.5 ${
                    isWithinIframe
                      ? "bg-slate-100 text-slate-500 border border-slate-200"
                      : "bg-slate-900 hover:bg-slate-850 text-white"
                  }`}
                  title={isWithinIframe ? "Might be blocked by browser sandbox unless opened in new tab" : "Trigger system printers"}
                >
                  <Printer className="w-3.5 h-3.5" />
                  {isWithinIframe ? "Force Print" : "Trigger Print"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activePrintAllAssets && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity" onClick={() => setActivePrintAllAssets(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 animate-scaleIn select-none flex flex-col">
            
            <button
              onClick={() => setActivePrintAllAssets(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 cursor-pointer"
              type="button"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex flex-col items-center text-center">
              <span className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl mb-3 flex items-center justify-center border border-indigo-100/50">
                <Printer className="w-5 h-5 shrink-0" />
              </span>
              <h4 className="font-bold text-slate-900 text-sm mb-1">Batch Barcode Printing</h4>
              <p className="text-[10px] text-slate-500 font-medium leading-normal mb-4">
                Generate and print multiple asset barcodes at once. Set your printing layout and document content.
              </p>
            </div>

            {/* Print Selection Scope */}
            <div className="mb-4">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5 pl-1">Print Scope</label>
              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-1 border border-slate-150 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setPrintSelectMode("filtered");
                    setActivePrintAllAssets(filteredAssets);
                  }}
                  className={`py-1.5 rounded-lg text-xs font-semibold select-none cursor-pointer transition-all ${
                    printSelectMode === "filtered"
                      ? "bg-white text-indigo-600 shadow-xs border border-slate-200/50 font-bold"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Filtered ({filteredAssets.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPrintSelectMode("all");
                    setActivePrintAllAssets(assets);
                  }}
                  className={`py-1.5 rounded-lg text-xs font-semibold select-none cursor-pointer transition-all ${
                    printSelectMode === "all"
                      ? "bg-white text-indigo-600 shadow-xs border border-slate-200/50 font-bold"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  All ({assets.length})
                </button>
              </div>
            </div>

            {/* Layout type selector */}
            <div className="mb-5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5 pl-1">Layout Configuration</label>
              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-1 border border-slate-150 rounded-xl">
                <button
                  type="button"
                  onClick={() => setBatchPrintLayout("grid")}
                  className={`py-1.5 rounded-lg text-xs font-semibold select-none cursor-pointer transition-all ${
                    batchPrintLayout === "grid"
                      ? "bg-white text-indigo-600 shadow-xs border border-slate-200/50 font-bold"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Two-Column Grid
                </button>
                <button
                  type="button"
                  onClick={() => setBatchPrintLayout("continuous")}
                  className={`py-1.5 rounded-lg text-xs font-semibold select-none cursor-pointer transition-all ${
                    batchPrintLayout === "continuous"
                      ? "bg-white text-indigo-600 shadow-xs border border-slate-200/50 font-bold"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Continuous Roll
                </button>
              </div>
            </div>

            {/* Small live info / Preview section */}
            <div className="border border-dashed border-slate-200 rounded-xl p-3 bg-slate-50 text-[11px] text-slate-600 leading-relaxed mb-5 font-medium">
              <span className="font-bold text-slate-700 block mb-1">🖨️ Print Margins & Page Setup:</span>
              <ul className="list-disc pl-4 space-y-1">
                <li>Make sure to enable <strong>"Background graphics"</strong> under print/page options.</li>
                <li>Set layout orientation to <strong>"Portrait"</strong>.</li>
                <li>Ensure margins are set to <strong>"Default"</strong> or <strong>"None"</strong>.</li>
              </ul>
            </div>

            {isWithinIframe && (
              <div className="w-full mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-[10px] leading-relaxed font-semibold flex items-start gap-1.5 animate-fadeIn">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-extrabold uppercase text-amber-850 block mb-0.5">⚠️ Preview Sandbox Restrictions</span>
                  Browsers protect security by disabling printers inside preview iframes. Open the app in a new independent tab to enable standard print layouts.
                </div>
              </div>
            )}

            {/* Print and Close Actions */}
            <div className="flex flex-col gap-2 w-full">
              {isWithinIframe && (
                <button
                  type="button"
                  onClick={() => {
                    try {
                      window.open(window.location.href, "_blank");
                    } catch (err) {
                      console.error("Open tab failed:", err);
                      triggerCustomModal("Tab Blocked", "Your browser blocked opening a new tab. Please click the 'Open in static tab' button in the toolbar overlay or allow popups.", "error");
                    }
                  }}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-xs uppercase tracking-wider transition shadow-sm cursor-pointer flex items-center justify-center gap-2 border border-indigo-700 animate-pulse"
                >
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  Open in New Tab & Print
                </button>
              )}
              <div className="flex gap-2 w-full">
                <button
                  type="button"
                  onClick={() => setActivePrintAllAssets(null)}
                  className="flex-1 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-250/70 hover:border-slate-300 font-bold text-xs uppercase tracking-wider rounded-xl transition cursor-pointer text-center"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      window.print();
                    } catch (err) {
                      console.error("Print call failed:", err);
                      triggerCustomModal("System Printing Error", "Could not trigger system hardware print driver.", "error");
                    }
                  }}
                  className={`flex-1 py-2 font-bold rounded-xl text-xs uppercase tracking-wider transition shadow-sm cursor-pointer flex items-center justify-center gap-1.5 ${
                    isWithinIframe
                      ? "bg-slate-100 text-slate-500 border border-slate-200"
                      : "bg-slate-900 hover:bg-slate-850 text-white"
                  }`}
                  title={isWithinIframe ? "Might be blocked by browser sandbox unless opened in new tab" : "Trigger system printers"}
                >
                  <Printer className="w-3.5 h-3.5" />
                  {isWithinIframe ? "Force Print" : "Trigger Print"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Embedded hidden offline printable block for Chrome / Safari hardware output */}
      {activePrintAsset && createPortal(
        <div id="printable-barcode-section">
          <div className="print-card-box">
            <div className="print-logo-hdr">ASSET CONTROL LABEL</div>
            <div className="print-barcode-svg">
              {generateCode39SVG(activePrintAsset.id)}
            </div>
            <div className="print-asset-id">
              * {activePrintAsset.id.toUpperCase()} *
            </div>
            <div className="print-asset-name">
              <strong>{activePrintAsset.name}</strong>
              <div style={{ fontSize: "11px", marginTop: "5px", color: "#555" }}>
                Type: {activePrintAsset.type} | {activePrintAsset.status}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Embedded hidden offline printable block for batch asset printing */}
      {activePrintAllAssets && activePrintAllAssets.length > 0 && createPortal(
        <div id="printable-all-barcodes-section">
          <div className={batchPrintLayout === "grid" ? "print-all-grid" : "print-all-continuous"}>
            {activePrintAllAssets.map((asset) => (
              <div key={asset.id} className="print-card-box">
                <div className="print-logo-hdr">ASSET CONTROL LABEL</div>
                <div className="print-barcode-svg">
                  {generateCode39SVG(asset.id)}
                </div>
                <div className="print-asset-id">
                  * {asset.id.toUpperCase()} *
                </div>
                <div className="print-asset-name">
                  <strong>{asset.name}</strong>
                  <div style={{ fontSize: "11px", marginTop: "5px", color: "#555" }}>
                    Type: {asset.type || "Unknown"} | {asset.status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}

      {/* Injected Print Stylesheet Override */}
      <style>{`
        /* Hide printable sections on screen completely */
        #printable-barcode-section,
        #printable-all-barcodes-section {
          display: none !important;
        }

        @media print {
          /* Hide the main React app root and other body nodes completely */
          #root {
            display: none !important;
          }
          body > *:not(#printable-barcode-section):not(#printable-all-barcodes-section) {
            display: none !important;
          }

          /* Show the printable sections correctly */
          #printable-barcode-section {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            width: 100vw !important;
            height: 100vh !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            background: white !important;
            page-break-inside: avoid !important;
          }

          #printable-all-barcodes-section {
            display: block !important;
            width: 100% !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            background: white !important;
          }

          .print-all-grid {
            display: grid !important;
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 20px !important;
            padding: 20px !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }

          .print-all-continuous {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            width: 100% !important;
          }

          .print-all-continuous .print-card-box {
            page-break-after: always !important;
            margin-bottom: 20px !important;
          }

          .print-card-box {
            border: 3px solid #000000 !important;
            padding: 25px !important;
            border-radius: 12px !important;
            width: 320px !important;
            text-align: center !important;
            font-family: monospace !important;
            background: white !important;
            box-sizing: border-box !important;
            page-break-inside: avoid !important;
            margin: 0 auto !important;
          }

          .print-logo-hdr {
            font-size: 16px !important;
            font-weight: 800 !important;
            letter-spacing: 2px !important;
            margin-bottom: 12px !important;
            border-bottom: 2px solid #000000 !important;
            padding-bottom: 6px !important;
          }

          .print-barcode-svg {
            width: 100% !important;
            height: 75px !important;
            margin: 14px 0 !important;
          }

          .print-asset-id {
            font-weight: 700 !important;
            font-size: 18px !important;
            letter-spacing: 1px !important;
          }

          .print-asset-name {
            font-size: 13px !important;
            margin-top: 4px !important;
          }
        }
      `}</style>
    </div>
  );
}
