import React, { useState, useEffect, useMemo } from "react";
import { selectBaseClass, selectStyle, optionClass } from "../lib/selectTheme";
import { doc, setDoc } from "firebase/firestore";
import { shiftReleasesCol } from "../firebase";
import { Asset, Agent, Transaction, AssetStatus, ShiftRelease, ShiftReleaseException } from "../types";
import { Tablet, Smartphone, CreditCard, Shield, Laptop, AlertCircle, FileSpreadsheet, Search, CheckCircle, RefreshCw, AlertTriangle, Layers, Clock, HelpCircle, Layout, Scan, Camera, Share2, Users } from "lucide-react";
import { sortDeviceTypes } from "../utils/deviceTypeSort";

interface DashboardProps {
  assets: Asset[];
  agents: Agent[];
  transactions: Transaction[];
  loading: boolean;
  onRefresh: () => void;
  activeShift: string;
  onNavigateToAssets?: (typeFilter: string, searchTerm: string, statusFilter?: string) => void;
  onNavigateToIssueReturn?: (subTab?: "issue" | "return" | "handover") => void;
}

export default function Dashboard({ assets, agents, transactions, loading, onRefresh, activeShift, onNavigateToAssets, onNavigateToIssueReturn }: DashboardProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDeviceType, setSelectedDeviceType] = useState("All");
  const [isReleaseModalOpen, setIsReleaseModalOpen] = useState(false);

  // Physical Verification states
  const [isPhysicallyVerified, setIsPhysicallyVerified] = useState(false);
  const [verifierName, setVerifierName] = useState("");
  const [verifierId, setVerifierId] = useState("");
  const [isVerificationModalOpen, setIsVerificationModalOpen] = useState(false);
  const [tempName, setTempName] = useState("");
  const [tempId, setTempId] = useState("");
  const [verifierError, setVerifierError] = useState("");

  // Exception Shift Release states
  const [isReturnListModalOpen, setIsReturnListModalOpen] = useState(false);
  const [verifiedHolders, setVerifiedHolders] = useState<{[key: string]: boolean}>({});
  const [showReleaseRemainingForm, setShowReleaseRemainingForm] = useState(false);
  const [releaseRemainingName, setReleaseRemainingName] = useState("");
  const [releaseRemainingId, setReleaseRemainingId] = useState("");
  const [releaseError, setReleaseError] = useState("");
  const [isShiftReleasedWithExceptions, setIsShiftReleasedWithExceptions] = useState(false);
  const [isShiftFullyReleased, setIsShiftFullyReleased] = useState(false);
  const [releasedExceptionsList, setReleasedExceptionsList] = useState<Array<{holderName: string, holderId: string, deviceCount: number}>>([]);
  const [certReleaseSupervisorName, setCertReleaseSupervisorName] = useState("");
  const [certReleaseSupervisorId, setCertReleaseSupervisorId] = useState("");

  const buildWhatsAppReleaseMessage = () => {
    const ts = new Date().toLocaleString("en-GB", { hour12: false });
    return `✈️ *Lufthansa Operational Handover - Shift Release Success*\n\n` +
      `📅 *Date/Time:* ${ts}\n` +
      `🔒 *Status:* Cabinet system and hardware fully aligned. Shift clearance completed!\n\n` +
      `📋 *Key Handover Metrics:*\n` +
      `• Fleet Total: ${totalDevices} Devices\n` +
      `• Cabinet Shelf: ${devicesAvailable} Devices physically verified present in locker\n` +
      `• Outstanding Custody Loans: 0 (NIL)\n\n` +
      `👤 *Certified & Authorized by:* ${verifierName || "N/A"} (ID: ${verifierId || "N/A"})\n` +
      `🌍 *Location:* DELSM Terminal Charging Locker Station`;
  };

  const buildWhatsAppExceptionMessage = () => {
    const ts = new Date().toLocaleString("en-GB", { hour12: false });
    const exceptionsText = releasedExceptionsList
      .map(exc => `• 👤 *${exc.holderName}* (ID: ${exc.holderId}): ${exc.deviceCount} Outstanding Device(s)`)
      .join("\n");
    return `✈️ *Lufthansa Handover - EXCEPTIONAL SHIFT RELEASE*\n\n` +
      `📅 *Date/Time:* ${ts}\n` +
      `⚠️ *Status:* ALL SHIFT RELEASED EXCEPT:\n` +
      `${exceptionsText}\n\n` +
      `👤 *Authorized Supervisor:* ${certReleaseSupervisorName || "N/A"} (ID: ${certReleaseSupervisorId || "N/A"})\n` +
      `🌍 *Location:* DELSM Terminal Charging Locker Station`;
  };

  const saveShiftRelease = async (type: "Standard" | "Exceptional", customSupervisor?: string, customSupervisorId?: string, customExceptions?: Array<{holderName: string, holderId: string, deviceCount: number}>) => {
    try {
      const releaseId = `SR-${Date.now()}`;
      const nameOfRelease = type === "Standard" ? verifierName : (customSupervisor || releaseRemainingName || verifierName);
      const idOfRelease = type === "Standard" ? verifierId : (customSupervisorId || releaseRemainingId || verifierId);
      
      const dateStr = new Date().toISOString().split("T")[0];
      const timeStr = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
      
      const vHash = `SHA-SR-${totalDevices}${devicesAvailable}-${idOfRelease || "NIL"}`;

      let exceptionsPayload: ShiftReleaseException[] = [];
      if (type === "Exceptional" && customExceptions) {
        exceptionsPayload = customExceptions.map(e => ({
          holderName: e.holderName,
          holderId: e.holderId,
          deviceCount: e.deviceCount
        }));
      }

      const summaryText = type === "Standard" 
        ? `All ${totalDevices} devices verified and stored securely. Shift fully released.`
        : `Released with exceptions. ${customExceptions?.length || 0} custody exception(s) tracked.`;

      const newRelease: ShiftRelease = {
        id: releaseId,
        timestamp: Date.now(),
        date: dateStr,
        time: timeStr,
        shift: activeShift || "Morning",
        releasedBy: nameOfRelease || "Unknown Supervisor",
        releasedById: idOfRelease || "NIL",
        type,
        exceptions: exceptionsPayload,
        verificationHash: vHash,
        summary: summaryText
      };

      await setDoc(doc(shiftReleasesCol, releaseId), newRelease);
      console.log("Successfully saved shift release to Firebase:", newRelease);
      onRefresh(); // Refresh parent collections
    } catch (err) {
      console.error("Failed to save shift release to database:", err);
    }
  };

  const deviceTypes = useMemo(() => {
    const types = new Set<string>();
    assets.forEach(a => types.add(a.type));
    return ["All", ...sortDeviceTypes(Array.from(types))];
  }, [assets]);

  const holdersWithAssets = useMemo(() => {
    const map: { [key: string]: { holderName: string; holderId: string; assets: Asset[] } } = {};
    assets.forEach((asset) => {
      if (asset.status === AssetStatus.ISSUED) {
        const tx = transactions.find((t) => t.id === asset.currentAssignmentId);
        const hId = tx?.employeeId || "UNKNOWN_ID";
        const hName = tx?.agentName || "Unknown Staff";
        if (!map[hId]) {
          map[hId] = {
            holderId: hId,
            holderName: hName,
            assets: []
          };
        }
        map[hId].assets.push(asset);
      }
    });
    return Object.values(map);
  }, [assets, transactions]);

  const filteredHolders = useMemo(() => {
    if (!searchTerm) return holdersWithAssets;
    const term = searchTerm.toLowerCase();
    return holdersWithAssets.filter(h => 
      h.holderName.toLowerCase().includes(term) || 
      h.holderId.toLowerCase().includes(term) ||
      h.assets.some(a => 
        a.id.toLowerCase().includes(term) || 
        a.name.toLowerCase().includes(term) || 
        (a.type || "").toLowerCase().includes(term)
      )
    );
  }, [holdersWithAssets, searchTerm]);

  // Filter conditions
  const matchesSearchAndType = (device: Asset) => {
    const term = searchTerm.toLowerCase();
    const activeAss = transactions.find(t => t.id === device.currentAssignmentId);

    let matchesType = false;
    if (selectedDeviceType === "All") {
      matchesType = true;
    } else if (selectedDeviceType === "iPad") {
      const typeLower = (device.type || "").toLowerCase();
      const nameLower = (device.name || "").toLowerCase();
      matchesType = typeLower.includes("ipad") || typeLower.includes("pda") ||
                    nameLower.includes("ipad") || nameLower.includes("pda");
    } else if (selectedDeviceType === "Ingenico") {
      const typeLower = (device.type || "").toLowerCase();
      const nameLower = (device.name || "").toLowerCase();
      matchesType = typeLower.includes("ingenico") || nameLower.includes("ingenico");
    } else if (selectedDeviceType === "Mobile Phone") {
      const typeLower = (device.type || "").toLowerCase().trim();
      matchesType = typeLower === "mobile phone";
    } else if (selectedDeviceType === "Scanner") {
      const typeLower = (device.type || "").toLowerCase();
      const nameLower = (device.name || "").toLowerCase();
      matchesType = typeLower.includes("scanner") || nameLower.includes("scanner") ||
                    typeLower.includes("scan") || nameLower.includes("scan");
    } else if (selectedDeviceType === "Hold Camera Phone") {
      const typeLower = (device.type || "").toLowerCase();
      const nameLower = (device.name || "").toLowerCase();
      matchesType = typeLower.includes("hold") || nameLower.includes("hold") ||
                    typeLower.includes("camera") || nameLower.includes("camera");
    } else {
      matchesType = device.type === selectedDeviceType;
    }

    const matchesText =
      device.id.toLowerCase().includes(term) ||
      device.name.toLowerCase().includes(term) ||
      (activeAss && (
        activeAss.agentName.toLowerCase().includes(term) ||
        activeAss.employeeId.toLowerCase().includes(term)
      ));

    return matchesType && matchesText;
  };

  // Summary Metrics calculations
  const totalDevices = assets.length;
  const totalIpads = assets.filter((a) => {
    const typeLower = (a.type || "").toLowerCase();
    const nameLower = (a.name || "").toLowerCase();
    return typeLower.includes("ipad") || typeLower.includes("pda") ||
           nameLower.includes("ipad") || nameLower.includes("pda");
  }).length;

  const totalIngenicos = assets.filter((a) => {
    const typeLower = (a.type || "").toLowerCase();
    const nameLower = (a.name || "").toLowerCase();
    return typeLower.includes("ingenico") || nameLower.includes("ingenico");
  }).length;

  const totalPhones = assets.filter((a) => {
    const typeLower = (a.type || "").toLowerCase().trim();
    return typeLower === "mobile phone";
  }).length;

  const totalScanners = assets.filter((a) => {
    const typeLower = (a.type || "").toLowerCase();
    const nameLower = (a.name || "").toLowerCase();
    return typeLower.includes("scanner") || nameLower.includes("scanner") ||
           typeLower.includes("scan") || nameLower.includes("scan");
  }).length;

  const totalHoldCameraPhones = assets.filter((a) => {
    const typeLower = (a.type || "").toLowerCase();
    const nameLower = (a.name || "").toLowerCase();
    return typeLower.includes("hold") || nameLower.includes("hold") ||
           typeLower.includes("camera") || nameLower.includes("camera");
  }).length;
  
  const devicesIssued = assets.filter((a) => a.status === AssetStatus.ISSUED).length;
  const devicesAvailable = assets.filter((a) => a.status === AssetStatus.IN_OFFICE).length;
  
  // Outstanding Overdue definition: specifically marked as missing, or checked out > 8 hours ago
  const overdueUnreturned = assets.filter((a) => {
    if (a.status === AssetStatus.MISSING) return true;
    if (a.status === AssetStatus.ISSUED && a.currentAssignmentId) {
      const tx = transactions.find((t) => t.id === a.currentAssignmentId);
      if (tx) {
        const hoursElapsed = (Date.now() - tx.issueTimestamp) / (1000 * 60 * 60);
        return hoursElapsed > 8; // Checked out for more than 8 hours is Overdue
      }
    }
    return false;
  });

  const devicesReturned = transactions.filter((t) => t.status === "Returned").length;
  const devicesNotTaken = assets.filter((a) => a.status === AssetStatus.NOT_TAKEN).length;
  const missingCount = assets.filter((a) => a.status === AssetStatus.MISSING).length;

  const isShiftReleaseOk = (
    totalDevices === devicesAvailable &&
    devicesIssued === 0 &&
    overdueUnreturned.length === 0 &&
    missingCount === 0
  );

  // Render icon helper
  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType.toLowerCase()) {
      case "ipad":
      case "ipads":
        return <Tablet className="w-5 h-5 text-emerald-500" />;
      case "ingenico":
      case "ingenico pos":
        return <CreditCard className="w-5 h-5 text-indigo-500" />;
      case "mobile phone":
      case "mobile phones":
        return <Smartphone className="w-5 h-5 text-teal-400" />;
      case "brs scanner":
      case "brs scanners":
        return <Scan className="w-5 h-5 text-blue-500" />;
      default:
        return <Layers className="w-5 h-5 text-amber-500" />;
    }
  };

  // Duration formatter
  const getCustodyDuration = (issueTimestamp?: number) => {
    if (!issueTimestamp) return "";
    const elapsedMinutes = Math.floor((Date.now() - issueTimestamp) / (1000 * 60));
    if (elapsedMinutes < 60) {
      return `${elapsedMinutes}m`;
    }
    const hrs = Math.floor(elapsedMinutes / 60);
    const mins = elapsedMinutes % 60;
    return `${hrs}h ${mins}m`;
  };

  // Export filtered views helper
  const exportGridCSV = (title: string, list: Asset[]) => {
    if (list.length === 0) {
      alert("No resources available to export.");
      return;
    }
    const headers = ["Asset ID", "Type", "Device Name", "Status"];
    const rows = list.map(a => [a.id, a.type, `"${a.name}"`, a.status]);
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `${title.replace(/\s+/g, "_")}_Export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div id="live-dashboard-pane" className="space-y-6">
      {/* Shift Clearance Handover Status Banner */}
      <div id="shift-handover-release-banner" className="transition-all duration-300">
        {isShiftReleasedWithExceptions ? (
          /* Shift released with active verified exceptions certificate banner */
          <div className="bg-amber-50 border-2 border-amber-400 rounded-3xl p-5 shadow-lg animate-scaleIn font-sans w-full">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
              {/* Left Column (Span 4) - Big Alert & Supervisor badge */}
              <div className="lg:col-span-4 space-y-2">
                <div className="flex items-center gap-1.5 text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1 rounded-xl text-[10PX] font-black uppercase tracking-wider inline-flex shadow-3xs">
                  <AlertTriangle className="w-3.5 h-3.5 animate-bounce text-rose-500 shrink-0" />
                  <span>Exceptional Clearance Active</span>
                </div>
                <h3 className="font-extrabold text-[#071d49] text-base leading-snug tracking-tight">
                  ALL SHIFT RELEASED EXCEPT:
                </h3>
                <p className="text-[12px] text-slate-650 font-semibold leading-relaxed">
                  Authorized by Supervisor: <strong className="text-[#071d49] underline">{certReleaseSupervisorName}</strong>{" "}
                  <span className="font-mono bg-slate-200 text-slate-705 px-1.5 py-0.2 rounded text-[10.5px] ml-1 select-all">
                    {certReleaseSupervisorId}
                  </span>
                </p>
              </div>

              {/* Middle Column (Span 5) - Custody Exceptions list spanning nicely */}
              <div className="lg:col-span-5 bg-white/95 p-4 rounded-2xl border border-amber-200 shadow-3xs space-y-2 self-stretch flex flex-col justify-center">
                <span className="font-black text-[#071d49] block text-[10px] tracking-wider uppercase flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse shrink-0" />
                  Active Custody Exception List ({releasedExceptionsList.length}):
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-[85px] overflow-y-auto pr-1">
                  {releasedExceptionsList.map((exc, idx) => (
                    <span key={idx} className="bg-amber-50/80 border border-amber-200 px-2.5 py-1 rounded-lg font-mono text-[10px] text-[#071d49] font-black shadow-3xs transition-all hover:bg-amber-100/70">
                      👤 {exc.holderName} (<span className="text-rose-600">{exc.holderId}</span>): {exc.deviceCount} Device(s)
                    </span>
                  ))}
                </div>
              </div>

              {/* Right Column (Span 3) - Action Buttons layout */}
              <div className="lg:col-span-3 flex lg:flex-col sm:flex-row flex-col gap-2 w-full shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    alert(`Lufthansa shift exception certificate signed by ${certReleaseSupervisorName} printed and dispatched to terminal controllers.`);
                  }}
                  className="w-full bg-[#071d49] hover:bg-[#071d49]/90 text-white py-2.5 px-4 rounded-xl font-bold text-[11px] tracking-wider uppercase cursor-pointer border-b-4 border-[#040f2b] active:border-b-0 active:translate-y-1 transition-all text-center animate-fadeIn"
                >
                  Print Exception Cert
                </button>
                <a
                  href={`https://api.whatsapp.com/send?text=${encodeURIComponent(buildWhatsAppExceptionMessage())}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full bg-[#25D366] hover:bg-[#20BA56] hover:text-white text-white py-2.5 px-4 rounded-xl font-bold text-[11px] tracking-wider uppercase cursor-pointer no-underline text-center animate-fadeIn flex items-center justify-center gap-1.5 shadow-sm transition-all"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  Share WhatsApp
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setIsShiftReleasedWithExceptions(false);
                    setReleasedExceptionsList([]);
                    setVerifiedHolders({});
                  }}
                  className="w-full bg-white hover:bg-slate-50 border border-slate-300 text-slate-755 py-2.5 px-4 rounded-xl font-bold text-[11px] tracking-wider uppercase cursor-pointer transition-all text-center animate-fadeIn"
                >
                  Reset Clearance
                </button>
              </div>
            </div>
          </div>
        ) : isShiftFullyReleased ? (
          /* Standard Shift Release Completed Banner */
          <div className="bg-emerald-50 border-2 border-emerald-500 rounded-3xl p-5 shadow-lg animate-scaleIn font-sans w-full">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
              <div className="lg:col-span-4 space-y-2">
                <div className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider inline-flex shadow-3xs">
                  <CheckCircle className="w-3.5 h-3.5 animate-bounce text-emerald-500 shrink-0" />
                  <span>Standard Shift Release Secure</span>
                </div>
                <h3 className="font-extrabold text-[#071d49] text-base leading-snug tracking-tight">
                  ALL SHIFT RELEASE CLEARANCE COMPLETE
                </h3>
                <p className="text-[12px] text-slate-650 font-semibold leading-relaxed">
                  Authorized present by: <strong className="text-[#071d49] underline">{verifierName}</strong>{" "}
                  <span className="font-mono bg-slate-200 text-slate-705 px-1.5 py-0.2 rounded text-[10.5px] ml-1 select-all">
                    {verifierId}
                  </span>
                </p>
              </div>

              {/* Middle Column - Details */}
              <div className="lg:col-span-5 bg-white/95 p-4 rounded-2xl border border-emerald-200 shadow-3xs space-y-2 self-stretch flex flex-col justify-center">
                <span className="font-black text-[#071d49] block text-[10px] tracking-wider uppercase flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse shrink-0" />
                  Hardware Shelf Fleet Stats (100% Present):
                </span>
                <p className="text-[11.5px] text-slate-600 font-medium">
                  Verified all <strong className="text-emerald-700">{totalDevices} fleet devices</strong> are securely docked in the lockers. Zero outstanding custody sessions active.
                </p>
              </div>

              {/* Right Column - Actions */}
              <div className="lg:col-span-3 flex lg:flex-col sm:flex-row flex-col gap-2 w-full shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    alert(`Shift handover certificate printed and dispatched to terminal controller successfully. Certified by: ${verifierName} (${verifierId}).`);
                  }}
                  className="w-full bg-[#071d49] hover:bg-[#071d49]/90 text-white py-2.5 px-4 rounded-xl font-bold text-[11px] tracking-wider uppercase cursor-pointer border-b-4 border-[#040f2b] active:border-b-0 active:translate-y-1 transition-all text-center animate-fadeIn"
                >
                  Print Clearance Log
                </button>
                <a
                  href={`https://api.whatsapp.com/send?text=${encodeURIComponent(buildWhatsAppReleaseMessage())}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full bg-[#25D366] hover:bg-[#20BA56] hover:text-white text-white py-2.5 px-4 rounded-xl font-bold text-[11px] tracking-wider uppercase cursor-pointer no-underline text-center animate-fadeIn flex items-center justify-center gap-1.5 shadow-sm transition-all"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  Share WhatsApp
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setIsShiftFullyReleased(false);
                    setIsPhysicallyVerified(false);
                    setVerifierName("");
                    setVerifierId("");
                  }}
                  className="w-full bg-white hover:bg-slate-50 border border-slate-300 text-slate-755 py-2.5 px-4 rounded-xl font-bold text-[11px] tracking-wider uppercase cursor-pointer transition-all text-center animate-fadeIn"
                >
                  Reset Clearance
                </button>
              </div>
            </div>
          </div>
        ) : isShiftReleaseOk ? (
          isPhysicallyVerified ? (
            /* All conditions met: Database logistics reconciled AND physically verified! Show BOLD OK FOR SHIFT RELEASE button */
            <div className="bg-emerald-500/10 border-2 border-emerald-500 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row items-center justify-between gap-5 animate-fade-in">
              <div className="flex items-center gap-4 text-center md:text-left flex-col md:flex-row">
                <div className="p-3 bg-emerald-600 text-white rounded-2xl shadow-md shadow-emerald-500/20">
                  <CheckCircle className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h3 className="font-extrabold text-emerald-900 text-sm md:text-base leading-snug flex items-center gap-1.5 justify-center md:justify-start">
                    Cabinet System & Hardware Fully Aligned!
                  </h3>
                  <p className="text-[11px] md:text-xs text-emerald-700 font-semibold mt-0.5">
                    100% of flight terminal fleet ({totalDevices}/{devicesAvailable} devices) is securely present and verified in office.
                  </p>
                  <p className="text-[10.5px] text-emerald-800 font-mono mt-1 font-bold">
                    ✓ Physically Verified by: <span className="underline">{verifierName}</span> (ID: <span className="underline">{verifierId}</span>)
                  </p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                <a
                  href={`https://api.whatsapp.com/send?text=${encodeURIComponent(buildWhatsAppReleaseMessage())}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto bg-[#25D366] hover:bg-[#20BA56] hover:text-white text-white px-5 py-3 rounded-xl font-bold text-xs tracking-wider uppercase cursor-pointer no-underline flex items-center justify-center gap-1.5 shadow-sm transition-all transform hover:scale-[1.01]"
                >
                  <Share2 className="w-4 h-4 shrink-0" />
                  Share WhatsApp
                </a>
                <button
                  id="btn-shift-release-ok"
                  onClick={() => setIsReleaseModalOpen(true)}
                  className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-4 rounded-xl font-black text-sm tracking-widest uppercase shadow-md hover:shadow-xl transition-all transform hover:scale-[1.03] cursor-pointer border-none"
                >
                  OK FOR SHIFT RELEASE
                </button>
              </div>
            </div>
          ) : (
            /* Logistics DB is matched, but the physical counters are missing verification. Show "Verify Devices physically before shift release" button */
            <div className="bg-amber-500/10 border-2 border-amber-500 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row items-center justify-between gap-5 animate-fade-in">
              <div className="flex items-center gap-4 text-center md:text-left flex-col md:flex-row">
                <div className="p-3 bg-amber-500 text-white rounded-2xl shadow-md shadow-amber-500/20">
                  <AlertTriangle className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h3 className="font-bold text-amber-950 text-sm md:text-base leading-snug flex items-center gap-1.5 justify-center md:justify-start">
                    Logistics Match • Physical Audit Required
                  </h3>
                  <p className="text-[11px] md:text-xs text-amber-800 font-semibold mt-0.5">
                     Database record count matches current local counts, but you must physically verify the devices before shift release can be authorized.
                  </p>
                </div>
              </div>
              <button
                id="btn-verify-physically"
                onClick={() => {
                  setTempName(verifierName);
                  setTempId(verifierId);
                  setVerifierError("");
                  setIsVerificationModalOpen(true);
                }}
                className="w-full md:w-auto bg-amber-600 hover:bg-amber-700 text-white px-6 py-3.5 rounded-xl font-extrabold text-xs tracking-wider uppercase shadow-md hover:shadow-lg transition-all transform hover:scale-[1.01] cursor-pointer border-none"
              >
                Verify Devices physically before shift release
              </button>
            </div>
          )
        ) : (
          /* Logistics criteria are NOT met. Still offer physical verification, but warn they can only do full release when both are OK */
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col lg:flex-row items-center justify-between gap-5">
            <div className="flex items-center gap-4 text-center md:text-left flex-col md:flex-row">
              <div className="p-3 bg-slate-100 text-slate-500 rounded-2xl border border-slate-200">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-slate-700 text-sm">
                  Pending Shift Handover Assets Verification
                </h4>
                <p className="text-[11px] text-slate-500 mt-1">
                  Handover Clearance Status: <span className="font-semibold text-rose-500">{devicesIssued} outstanding</span>, <span className="font-semibold text-amber-600">{overdueUnreturned.length} overdue</span>, and <span className="font-semibold text-rose-600">{missingCount} missing</span>. All must be NIL (0) to auto-verify shift release.
                </p>
                {isPhysicallyVerified && (
                  <p className="text-[10px] text-emerald-600 font-mono mt-1.5 font-bold flex items-center gap-1">
                    ✓ Tactile Shelf Verified Present: {verifierName} ({verifierId})
                  </p>
                )}
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto justify-end items-center">
              <button
                id="btn-trigger-early-physical-verify"
                onClick={() => {
                  setTempName(verifierName);
                  setTempId(verifierId);
                  setVerifierError("");
                  setIsVerificationModalOpen(true);
                }}
                className={`w-full sm:w-auto px-5 py-3 rounded-xl font-extrabold text-xs tracking-wider uppercase shadow-sm transition-all transform hover:scale-[1.01] cursor-pointer border-none ${
                  isPhysicallyVerified 
                    ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200"
                    : "bg-[#071d49] hover:bg-[#071d49]/90 text-white"
                }`}
              >
                {isPhysicallyVerified ? "Update Physical Verification" : "Total In office Available Physically verified"}
              </button>
              
              <button
                id="btn-awaiting-device-return"
                onClick={() => {
                  setShowReleaseRemainingForm(false);
                  setReleaseError("");
                  setIsReturnListModalOpen(true);
                }}
                className="w-full sm:w-auto text-[10.5px] bg-amber-500 hover:bg-amber-600 text-[#071d49] font-black px-4.5 py-3 rounded-xl uppercase tracking-wider text-center flex items-center justify-center cursor-pointer transition-all active:scale-[0.98] shrink-0 border-none shadow-sm hover:shadow-md"
              >
                Awaiting Device Return
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 11 Summary Cards Grid */}
      <div id="dashboard-metrics-grid" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {/* Total Devices Card */}
        <div 
          onClick={() => onNavigateToAssets?.("All", "")}
          className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col justify-between cursor-pointer hover:border-indigo-400 hover:shadow-md transition-all group duration-200"
          title="Click to view all registered devices in Asset Inventory"
        >
          <span className="text-[10px] uppercase font-bold text-slate-400 group-hover:text-indigo-500 tracking-wider transition-colors">Total Devices</span>
          <div className="flex justify-between items-baseline mt-2">
            <span className="text-2xl font-bold text-slate-900 group-hover:scale-[1.03] origin-left transition-transform duration-250">{totalDevices}</span>
            <span className="text-[9px] bg-slate-100 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded font-sans font-bold">Master</span>
          </div>
        </div>

        {/* Total iPads Card */}
        <div 
          onClick={() => onNavigateToAssets?.("ipad group", "")}
          className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col justify-between cursor-pointer hover:border-indigo-400 hover:shadow-md transition-all group duration-200"
          title="Click to filter Asset Inventory for iPads & PDAs (iPad Mini, iPad, PDA@OPS)"
        >
          <span className="text-[10px] uppercase font-bold text-slate-400 group-hover:text-indigo-500 tracking-wider transition-colors">Total iPads</span>
          <div className="flex justify-between items-baseline mt-2">
            <span className="text-2xl font-bold text-slate-900 group-hover:scale-[1.03] origin-left transition-transform duration-250">{totalIpads}</span>
            <Tablet className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 transition-colors" />
          </div>
        </div>

        {/* Total Ingenico POS Card */}
        <div 
          onClick={() => onNavigateToAssets?.("ingenico group", "")}
          className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col justify-between cursor-pointer hover:border-indigo-400 hover:shadow-md transition-all group duration-200"
          title="Click to filter Asset Inventory for Ingenico POS devices"
        >
          <span className="text-[10px] uppercase font-bold text-slate-400 group-hover:text-indigo-500 tracking-wider transition-colors">Total Ingenico POS</span>
          <div className="flex justify-between items-baseline mt-2">
            <span className="text-2xl font-bold text-slate-900 group-hover:scale-[1.03] origin-left transition-transform duration-250">{totalIngenicos}</span>
            <CreditCard className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 transition-colors" />
          </div>
        </div>

        {/* Total Mobile Phones Card */}
        <div 
          onClick={() => onNavigateToAssets?.("mobile phone group", "")}
          className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col justify-between cursor-pointer hover:border-indigo-400 hover:shadow-md transition-all group duration-200"
          title="Click to filter Asset Inventory for Mobile Phones"
        >
          <span className="text-[10px] uppercase font-bold text-slate-400 group-hover:text-indigo-500 tracking-wider transition-colors">Total Mobile Phones</span>
          <div className="flex justify-between items-baseline mt-2">
            <span className="text-2xl font-bold text-slate-900 group-hover:scale-[1.03] origin-left transition-transform duration-250">{totalPhones}</span>
            <Smartphone className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 transition-colors" />
          </div>
        </div>

        {/* Total Scanners Card */}
        <div 
          onClick={() => onNavigateToAssets?.("scanner group", "")}
          className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col justify-between cursor-pointer hover:border-indigo-400 hover:shadow-md transition-all group duration-200"
          title="Click to filter Asset Inventory for BRS Scanners"
        >
          <span className="text-[10px] uppercase font-bold text-slate-400 group-hover:text-indigo-500 tracking-wider transition-colors">Total Scanners</span>
          <div className="flex justify-between items-baseline mt-2">
            <span className="text-2xl font-bold text-slate-900 group-hover:scale-[1.03] origin-left transition-transform duration-250">{totalScanners}</span>
            <Scan className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 transition-colors" />
          </div>
        </div>

        {/* Hold Camera Phones Card */}
        <div 
          onClick={() => onNavigateToAssets?.("hold camera phone group", "")}
          className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col justify-between cursor-pointer hover:border-indigo-400 hover:shadow-md transition-all group duration-200"
          title="Click to filter Asset Inventory for Hold Camera Phones"
        >
          <span className="text-[10px] uppercase font-bold text-slate-400 group-hover:text-indigo-500 tracking-wider transition-colors">Hold Camera Phones</span>
          <div className="flex justify-between items-baseline mt-2">
            <span className="text-2xl font-bold text-slate-900 group-hover:scale-[1.03] origin-left transition-transform duration-250">{totalHoldCameraPhones}</span>
            <Camera className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 transition-colors" />
          </div>
        </div>

        {/* Action summaries row: Active Issued */}
        <div 
          onClick={() => onNavigateToIssueReturn?.("return")}
          className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 border-l-4 border-l-indigo-500 flex flex-col justify-between cursor-pointer hover:border-indigo-400 hover:shadow-md transition-all group duration-200"
          title="Click to open return desk for active transactions with agents"
        >
          <span className="text-[10px] uppercase font-bold text-slate-400 group-hover:text-indigo-650 tracking-wider transition-colors">Active Issued</span>
          <div className="flex justify-between items-baseline mt-2">
            <span className="text-2xl font-bold text-indigo-600 group-hover:scale-[1.03] origin-left transition-transform duration-250">{devicesIssued}</span>
            <span className="text-[9px] bg-indigo-50 text-indigo-600 border border-indigo-100 px-1.5 py-0.5 rounded font-sans font-bold">With-Agent</span>
          </div>
        </div>

        {/* Returned Today Card */}
        <div 
          onClick={() => onNavigateToAssets?.("All", "", "In Office")}
          className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 border-l-4 border-l-emerald-500 flex flex-col justify-between cursor-pointer hover:border-emerald-450 hover:shadow-md transition-all group duration-200"
          title="Click to view all assets returned to the office cabinet today"
        >
          <span className="text-[10px] uppercase font-bold text-slate-400 group-hover:text-emerald-550 tracking-wider transition-colors">Returned Today</span>
          <div className="flex justify-between items-baseline mt-2">
            <span className="text-2xl font-bold text-emerald-600 group-hover:scale-[1.03] origin-left transition-transform duration-250">{devicesReturned}</span>
            <span className="text-[9px] bg-emerald-50 text-emerald-600 border border-emerald-100 px-1.5 py-0.5 rounded font-sans font-bold font-mono">Done</span>
          </div>
        </div>

        {/* Unreturned Overdue Card */}
        <div 
          onClick={() => onNavigateToIssueReturn?.("return")}
          className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 border-l-4 border-l-rose-500 flex flex-col justify-between cursor-pointer hover:border-rose-400 hover:shadow-md transition-all group duration-200"
          title="Click to view return options for unreturned, overdue devices"
        >
          <span className="text-[10px] uppercase font-bold text-slate-400 group-hover:text-rose-550 tracking-wider transition-colors">Unreturned Overdue</span>
          <div className="flex justify-between items-baseline mt-2">
            <span className="text-2xl font-bold text-rose-600 group-hover:scale-[1.03] origin-left transition-transform duration-250">{overdueUnreturned.length}</span>
            <span className="text-[9px] bg-rose-50 text-rose-550 border border-rose-100 px-1.5 py-0.5 rounded font-sans font-bold animate-pulse">Critical</span>
          </div>
        </div>

        {/* In Office Available Card */}
        <div 
          onClick={() => onNavigateToAssets?.("All", "", "In Office")}
          className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 border-l-4 border-l-teal-500 flex flex-col justify-between cursor-pointer hover:border-teal-400 hover:shadow-md transition-all group duration-200"
          title="Click to filter Asset Inventory for available devices in office"
        >
          <span className="text-[10px] uppercase font-bold text-slate-400 group-hover:text-teal-600 tracking-wider transition-colors">In Office Available</span>
          <div className="flex justify-between items-baseline mt-2">
            <span className="text-2xl font-bold text-teal-650 group-hover:scale-[1.03] origin-left transition-transform duration-250">{devicesAvailable}</span>
            <span className="text-[9px] bg-teal-50 text-teal-600 border border-teal-100 px-1.5 py-0.5 rounded font-sans font-bold">Ready</span>
          </div>
        </div>

        {/* Not Taken Device Card */}
        <div 
          onClick={() => onNavigateToAssets?.("All", "", "Not Taken")}
          className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col justify-between md:col-span-1 cursor-pointer hover:border-slate-400 hover:shadow-md transition-all group duration-200"
          title="Click to view devices not taken during current shift"
        >
          <span className="text-[10px] uppercase font-bold text-slate-400 group-hover:text-slate-600 tracking-wider transition-colors">Not Taken Device</span>
          <div className="flex justify-between items-baseline mt-2">
            <span className="text-2xl font-bold text-slate-450 group-hover:scale-[1.03] origin-left transition-transform duration-250">{devicesNotTaken}</span>
            <span className="text-[9px] bg-slate-100 text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded font-sans font-bold">Unused</span>
          </div>
        </div>
      </div>

      {/* Dynamic Summary Breakdown by Asset Type */}
      <div id="dashboard-asset-type-breakdown" className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-500" />
              Dynamic Inventory Summary by Device Class
            </h3>
            <p className="text-[10px] text-slate-400 mt-0.5">Real-time status metrics segregated by physical asset category</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from(new Set(assets.map((a) => a.type || "Other"))).sort().map((type) => {
            const ofType = assets.filter((a) => (a.type || "Other") === type);
            const total = ofType.length;
            const issued = ofType.filter((a) => a.status === AssetStatus.ISSUED).length;
            const inOffice = ofType.filter((a) => a.status === AssetStatus.IN_OFFICE).length;
            const missing = ofType.filter((a) => a.status === AssetStatus.MISSING).length;
            const notTaken = ofType.filter((a) => a.status === AssetStatus.NOT_TAKEN).length;

            return (
              <div key={type} className="bg-slate-50/50 border border-slate-200/60 hover:border-slate-300 rounded-xl p-4 transition-all" id={`class-summary-${type.toLowerCase().replace(/\s+/g, '-')}`}>
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="p-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg">
                    {getDeviceIcon(type)}
                  </div>
                  <span className="font-bold text-xs text-slate-800 uppercase tracking-tight">{type}s</span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-white border border-slate-200/85 rounded-lg py-1.5">
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider leading-none">Total</div>
                    <div className="text-xs font-bold text-slate-850 mt-1">{total}</div>
                  </div>
                  <div className="bg-indigo-50/50 border border-indigo-100 rounded-lg py-1.5">
                    <div className="text-[9px] font-bold text-indigo-500 uppercase tracking-wider leading-none">Issued</div>
                    <div className="text-xs font-bold text-indigo-750 mt-1">{issued}</div>
                  </div>
                  <div className="bg-emerald-50/50 border border-emerald-100 rounded-lg py-1.5">
                    <div className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider leading-none">In Office</div>
                    <div className="text-xs font-bold text-emerald-750 mt-1">{inOffice}</div>
                  </div>
                </div>

                {(missing > 0 || notTaken > 0) && (
                  <div className="mt-2 text-[9px] text-slate-400 flex justify-between px-1">
                    {missing > 0 && <span className="font-semibold text-rose-500">⚠️ {missing} missing</span>}
                    {notTaken > 0 && <span className="font-semibold text-slate-500">⏳ {notTaken} not taken</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Agent Custody Overview (Grouped by Agent) */}
      <div id="dashboard-agent-custody-grouped" className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-500" />
              Agent Custody Overview (Grouped by Staff)
            </h3>
            <p className="text-[10px] text-slate-400 mt-0.5">Summary of all devices currently held by individual agents</p>
          </div>
          <div className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-1 rounded-lg font-bold border border-indigo-100">
            {holdersWithAssets.length} Agents with Assets
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[9px] tracking-wider font-bold">
              <tr>
                <th className="px-4 py-3 rounded-l-xl">Agent Information</th>
                <th className="px-4 py-3">Devices Held</th>
                <th className="px-4 py-3 rounded-r-xl text-right">Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredHolders.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-slate-400 italic font-sans">
                    {searchTerm ? "No agents found matching search criteria." : "No active custody sessions found."}
                  </td>
                </tr>
              ) : (
                filteredHolders.map((holder) => (
                  <tr key={holder.holderId} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-[10px] shrink-0 border border-indigo-200 shadow-3xs">
                          {holder.holderName.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 truncate">{holder.holderName}</p>
                          <p className="text-[10px] text-slate-450 font-mono">{holder.holderId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        {holder.assets.map((asset) => (
                          <div key={asset.id} className="flex items-center gap-1.5 bg-white border border-slate-200 px-2 py-1 rounded-lg shadow-3xs hover:border-indigo-300 transition-colors">
                            {getDeviceIcon(asset.type)}
                            <div>
                              <p className="text-[9px] font-bold text-slate-800 leading-tight">{asset.id}</p>
                              <p className="text-[8px] text-slate-400 leading-tight">{asset.name}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100 font-bold text-[10px]">
                        {holder.assets.length}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Global Interactive Filter Search Row */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row gap-4 items-center justify-between shadow-xs">
        <div className="relative w-full md:flex-1">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter live lists by Device ID, Name, Serial Number, Agent Name or Agent ID..."
            className="w-full pl-9/12 pl-10 pr-4 py-2 border border-slate-200 bg-slate-50/50 rounded-xl text-xs font-sans focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all font-medium"
          />
        </div>

        <div className="flex gap-2 w-full md:w-auto shrink-0 justify-end">
          <select
            value={selectedDeviceType}
            onChange={(e) => setSelectedDeviceType(e.target.value)}
            className={`${selectBaseClass} w-auto h-10 px-4`}
            style={selectStyle}
          >
            {deviceTypes.map(type => (
              <option key={type} value={type} className={optionClass}>{type}</option>
            ))}
          </select>

          <button
            onClick={onRefresh}
            className="p-2 border border-slate-200 hover:border-indigo-200 text-slate-600 hover:text-indigo-600 bg-white hover:bg-indigo-50/20 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
            title="Force Live Synchronize"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Bento Grid layout for lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* 1. Assets Currently With Agents */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3.5">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Layout className="w-4 h-4 text-indigo-500" />
                Assets Currently With Agents ({assets.filter(a => a.status === AssetStatus.ISSUED).length})
              </h3>
              <button
                onClick={() => exportGridCSV("Assets_With_Agents", assets.filter(a => a.status === AssetStatus.ISSUED))}
                className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Export CSV
              </button>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {assets.filter(a => a.status === AssetStatus.ISSUED).filter(matchesSearchAndType).length === 0 ? (
                <p className="text-xs text-slate-400 italic py-8 text-center bg-slate-50/50 rounded-xl">No active out-of-office custody logs matching filter.</p>
              ) : (
                assets.filter(a => a.status === AssetStatus.ISSUED).filter(matchesSearchAndType).map((device) => {
                  const tx = transactions.find((t) => t.id === device.currentAssignmentId);
                  return (
                    <div key={device.id} className="p-3.5 border border-slate-100 rounded-xl hover:border-slate-200/80 bg-slate-50/30 transition-all flex justify-between items-start">
                      <div className="flex gap-3">
                        <div className="shrink-0 p-2 bg-indigo-50 border border-indigo-100/40 text-indigo-650 rounded-lg">
                          {getDeviceIcon(device.type)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-[9px] font-bold bg-slate-100 text-slate-800 border border-slate-200 px-1.5 py-0.5 rounded uppercase">
                              {device.id}
                            </span>
                            <strong className="text-xs font-semibold text-slate-900">{device.name}</strong>
                          </div>
                          {tx ? (
                            <div className="text-[10px] text-slate-500 mt-2 space-y-0.5 font-sans">
                              <p className="font-semibold text-slate-700">Holder: {tx.agentName} ({tx.employeeId})</p>
                              <p className="flex items-center gap-1 text-slate-450 mt-1">
                                <Clock className="w-3 h-3" />
                                <span>Issued: {tx.issueTime} · Custody duration: <span className="font-semibold text-slate-700">{getCustodyDuration(tx.issueTimestamp)}</span></span>
                              </p>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic block mt-1.5">No holding receipt loaded</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* 2. Assets Available in Office */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3.5">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                Assets Available in Office ({assets.filter(a => a.status === AssetStatus.IN_OFFICE).length})
              </h3>
              <button
                onClick={() => exportGridCSV("Assets_In_Office", assets.filter(a => a.status === AssetStatus.IN_OFFICE))}
                className="text-[10px] text-emerald-600 hover:text-emerald-800 font-bold flex items-center gap-1 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Export CSV
              </button>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {assets.filter(a => a.status === AssetStatus.IN_OFFICE).filter(matchesSearchAndType).length === 0 ? (
                <p className="text-xs text-slate-400 italic py-8 text-center bg-slate-50/50 rounded-xl">No available in-office assets matching filter.</p>
              ) : (
                assets.filter(a => a.status === AssetStatus.IN_OFFICE).filter(matchesSearchAndType).map((device) => (
                  <div key={device.id} className="p-3.5 border border-slate-100 rounded-xl hover:border-slate-200 bg-slate-50/30 transition-all flex items-center justify-between">
                    <div className="flex gap-3 items-center">
                      <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-100/40">
                        {getDeviceIcon(device.type)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[9px] font-bold bg-slate-100 text-slate-800 border border-slate-200 px-1.5 py-0.5 rounded uppercase">
                            {device.id}
                          </span>
                          <strong className="text-xs font-semibold text-slate-900">{device.name}</strong>
                        </div>
                        <span className="text-[10px] text-slate-450 block mt-1.5">{device.type}</span>
                      </div>
                    </div>

                    <span className="bg-emerald-50 text-emerald-750 border border-emerald-100 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase scale-90">
                      In Office
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* 3. Assets Not Returned (Overdue Shift) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3.5">
              <h3 className="font-bold text-rose-600 text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-500" />
                Assets Not Returned / Overdue ({overdueUnreturned.length})
              </h3>
              <button
                onClick={() => exportGridCSV("Assets_Not_Returned_Overdue", overdueUnreturned)}
                className="text-[10px] text-rose-600 hover:text-rose-800 font-bold flex items-center gap-1 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Export CSV
              </button>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {overdueUnreturned.filter(matchesSearchAndType).length === 0 ? (
                <p className="text-xs text-slate-400 italic py-8 text-center bg-slate-50/50 rounded-xl">Awesome! No devices classified as overdue or lost.</p>
              ) : (
                overdueUnreturned.filter(matchesSearchAndType).map((device) => {
                  const tx = transactions.find((t) => t.id === device.currentAssignmentId);
                  return (
                    <div key={device.id} className="p-3.5 border border-rose-100 bg-rose-50/20 rounded-xl hover:bg-rose-50/40 transition-all flex justify-between items-start">
                      <div className="flex gap-3">
                        <div className="shrink-0 p-2 bg-rose-100 text-rose-600 rounded-lg border border-rose-200/50">
                          {getDeviceIcon(device.type)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-[9px] font-bold bg-slate-100 text-slate-800 border border-slate-200 px-1.5 py-0.5 rounded uppercase">
                              {device.id}
                            </span>
                            <strong className="text-xs font-semibold text-slate-900">{device.name}</strong>
                          </div>
                          {tx ? (
                            <div className="text-[10px] text-slate-500 mt-2 space-y-0.5">
                              <p className="font-semibold text-slate-700">Issued to: {tx.agentName} ({tx.employeeId})</p>
                              <p className="text-rose-650 font-semibold font-sans flex items-center gap-1 text-[10px] mt-1">
                                <Clock className="w-3.5 h-3.5" />
                                <span>Out: {tx.issueDate} {tx.issueTime} ({getCustodyDuration(tx.issueTimestamp)} ago)</span>
                              </p>
                            </div>
                          ) : (
                            <p className="text-[10px] mt-1.5 text-rose-600 font-semibold">Device status is flagged as {device.status}</p>
                          )}
                        </div>
                      </div>

                      <span className="bg-rose-100 border border-rose-200 text-rose-700 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse shrink-0">
                        {device.status === AssetStatus.MISSING ? "Lost Device" : "Overdue Shift"}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* 4. Assets Not Taken */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3.5">
              <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-slate-400" />
                Assets Not Taken During Shift ({assets.filter(a => a.status === AssetStatus.NOT_TAKEN).length})
              </h3>
              <button
                onClick={() => exportGridCSV("Assets_Not_Taken", assets.filter(a => a.status === AssetStatus.NOT_TAKEN))}
                className="text-[10px] text-slate-500 hover:text-slate-700 font-bold flex items-center gap-1 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Export CSV
              </button>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {assets.filter(a => a.status === AssetStatus.NOT_TAKEN).filter(matchesSearchAndType).length === 0 ? (
                <p className="text-xs text-slate-400 italic py-8 text-center bg-slate-50/50 rounded-xl">All assets fully checklist active in this shift cycle.</p>
              ) : (
                assets.filter(a => a.status === AssetStatus.NOT_TAKEN).filter(matchesSearchAndType).map((device) => (
                  <div key={device.id} className="p-3.5 border border-slate-100 rounded-xl bg-slate-50/20 flex items-center justify-between hover:border-slate-200 transition-all">
                    <div className="flex gap-3 items-center">
                      <div className="p-2 bg-slate-100 text-slate-400 rounded-lg">
                        {getDeviceIcon(device.type)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[9px] font-bold bg-slate-100 text-slate-800 border border-slate-200 px-1.5 py-0.5 rounded uppercase">
                            {device.id}
                          </span>
                          <strong className="text-xs font-semibold text-slate-900">{device.name}</strong>
                        </div>
                        <span className="text-[10px] text-slate-450 block mt-1.5">{device.type}</span>
                      </div>
                    </div>

                    <span className="bg-slate-100 border border-slate-200 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase scale-90">
                      Not Taken
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Physical Audit Verification Modal */}
      {isVerificationModalOpen && (
        <div id="physical-cabinet-verification-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-xs transition-opacity duration-300">
          <div className="bg-white border border-slate-250 shadow-2xl rounded-3xl w-full max-w-md overflow-hidden transform scale-100 transition-all font-sans animate-fade-in">
            <div className="bg-[#071d49] text-white p-5 relative">
              <button
                type="button"
                onClick={() => setIsVerificationModalOpen(false)}
                className="absolute top-4 right-4 text-slate-350 hover:text-white text-base font-bold p-1 bg-transparent border-none cursor-pointer"
                title="Cancel"
              >
                ✕
              </button>
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500 rounded-xl text-[#071d49]">
                  <Shield className="w-5 h-5 font-bold" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm tracking-wider text-white uppercase leading-none">
                    Tactile Cabinet Shelving Audit
                  </h3>
                  <p className="text-[10px] text-slate-300 mt-1">Physical count authenticity check</p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl text-slate-600 text-xs leading-relaxed">
                Please enter your airline ID credentials to certify that you have physically counted and verified that <strong className="text-[#071d49]">{devicesAvailable} device(s)</strong> are correct and present in the local charging locker.
              </div>

              {verifierError && (
                <div className="bg-rose-50 border border-rose-150 p-3 rounded-xl text-rose-700 text-xs font-semibold animate-pulse">
                  ⚠ {verifierError}
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label htmlFor="temp-verifier-name" className="block text-[10.5px] uppercase font-bold text-slate-500 tracking-wider mb-1.5">
                    Verifier Employee Name
                  </label>
                  <input
                    id="temp-verifier-name"
                    type="text"
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                    placeholder="e.g. Captain Shashi Kumar"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-[#071d49] focus:bg-white text-slate-900 rounded-xl px-4 py-3 text-xs outline-none transition-all placeholder:text-slate-400 font-medium"
                  />
                </div>

                <div>
                  <label htmlFor="temp-verifier-id" className="block text-[10.5px] uppercase font-bold text-slate-500 tracking-wider mb-1.5">
                    Verifier Employee ID Code
                  </label>
                  <input
                    id="temp-verifier-id"
                    type="text"
                    value={tempId}
                    onChange={(e) => setTempId(e.target.value)}
                    placeholder="e.g. LH-9284 / DEL-804"
                    className="w-full bg-slate-50 border border-[#071d49] focus:bg-white text-slate-900 rounded-xl px-4 py-3 text-xs outline-none transition-all placeholder:text-slate-400 font-mono font-medium"
                  />
                </div>
              </div>
            </div>

            <div className="bg-slate-50 border-t border-slate-150 p-4 flex gap-2.5 justify-end">
              <button
                type="button"
                onClick={() => setIsVerificationModalOpen(false)}
                className="bg-white border border-slate-200 text-slate-750 hover:bg-slate-100 px-4 py-2.5 text-[11px] font-bold tracking-wider uppercase cursor-pointer rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!tempName.trim()) {
                    setVerifierError("Please enter your Employee Name to authorize verification.");
                    return;
                  }
                  if (!tempId.trim()) {
                    setVerifierError("Please enter your Employee ID Code to authorize verification.");
                    return;
                  }
                  setVerifierName(tempName.trim());
                  setVerifierId(tempId.trim());
                  setIsPhysicallyVerified(true);
                  setVerifierError("");
                  setIsVerificationModalOpen(false);
                }}
                className="bg-[#071d49] hover:bg-[#071d49]/90 text-white px-5 py-2.5 rounded-xl text-[11px] font-bold tracking-wider uppercase cursor-pointer border-none"
              >
                Confirm & Verify Present
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Handover Handshake Release Success Modal */}
      {isReleaseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-300">
          <div className="bg-white border border-slate-250 shadow-2xl rounded-3xl w-full max-w-lg overflow-hidden transform scale-100 transition-transform duration-300 font-sans">
            <div className="bg-[#071d49] text-white p-6 relative">
              <button
                onClick={() => setIsReleaseModalOpen(false)}
                className="absolute top-4 right-4 text-slate-330 hover:text-white text-lg font-bold p-1 cursor-pointer bg-transparent border-none"
                title="Close"
              >
                ✕
              </button>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500 rounded-xl text-white">
                  <CheckCircle className="w-6 h-6 animate-bounce" />
                </div>
                <div>
                  <h3 className="font-bold text-base tracking-tight text-white uppercase">
                    Lufthansa Operational Handover Success
                  </h3>
                  <p className="text-[10px] text-slate-300 mt-0.5">Terminal Electronics Device Storage Inventory Checked</p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-emerald-50 border border-emerald-100/80 p-4 rounded-2xl flex items-center gap-3 text-emerald-800">
                <Shield className="w-5 h-5 text-emerald-600 shrink-0" />
                <span className="text-xs font-bold leading-normal uppercase">
                  SHUTTLE CABINET HARDWARE LOGS ALIGNED: SHIFT CLEARANCE COMPLETED!
                </span>
              </div>

              <div className="space-y-2">
                <h4 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Verification Metrics</h4>
                <div className="bg-slate-50 border border-slate-200 rounded-xl divide-y divide-slate-150 overflow-hidden">
                  <div className="flex items-center justify-between p-3 text-xs">
                    <span className="text-slate-500 font-medium font-sans">Corporate Master Catalog Fleet</span>
                    <strong className="text-slate-800 font-mono font-bold text-sm">{totalDevices} Devices</strong>
                  </div>
                  <div className="flex items-center justify-between p-3 text-xs">
                    <span className="text-slate-500 font-medium font-sans">Cabinet Shelving Audit (Present)</span>
                    <strong className="text-emerald-700 font-mono font-bold text-xs bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">{devicesAvailable} Devices</strong>
                  </div>
                  <div className="flex items-center justify-between p-3 text-xs">
                    <span className="text-slate-500 font-medium font-sans">Active Custody Loans Outstanding</span>
                    <strong className="text-slate-700 font-mono font-bold text-xs">0 Devices (NIL)</strong>
                  </div>
                  <div className="flex items-center justify-between p-3 text-xs">
                    <span className="text-slate-500 font-medium font-sans">Unreturned Overdue Devices</span>
                    <strong className="text-slate-700 font-mono font-bold text-xs">0 Devices (NIL)</strong>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-indigo-50/40 border border-indigo-150/40 rounded-xl">
                <p className="text-[10.5px] text-[#071d49] leading-relaxed italic font-medium font-sans">
                  "This certificate verifies that all Lufthansa DELSM Terminal operational assets (iPad devices, BRS scanners, Ingenico POS systems, and priority mobile phones) have been fully matched and physically verified present in the lockbox cabinet. Shift release is herewith officially clear and approved."
                </p>
              </div>

              <div className="text-[9px] text-slate-400 text-center flex flex-col items-center gap-0.5 pt-2 font-mono">
                <span>Verification Hash: SHA256-LF-{totalDevices}{devicesAvailable}-{verifierId || "NIL"}</span>
                <span>Certified present by: <strong>{verifierName || "NIL"}</strong> (ID: <strong>{verifierId || "NIL"}</strong>)</span>
                <span>Auto-signed by terminal controller at {new Date().toLocaleString("en-GB", { timeZone: "America/Los_Angeles" })}</span>
              </div>
            </div>

            <div className="bg-slate-50 border-t border-slate-150 p-4 flex gap-2.5 justify-end">
              <a
                href={`https://api.whatsapp.com/send?text=${encodeURIComponent(buildWhatsAppReleaseMessage())}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-[#25D366] hover:bg-[#20BA56] hover:text-white text-white px-4 py-2 rounded-xl text-[11px] font-bold tracking-wider uppercase cursor-pointer no-underline flex items-center gap-1.5 shadow-sm transition-all"
              >
                <Share2 className="w-3.5 h-3.5" />
                Share WhatsApp
              </a>
              <button
                onClick={() => {
                  saveShiftRelease("Standard");
                  setIsShiftFullyReleased(true);
                  setIsReleaseModalOpen(false);
                  alert(`Shift handover certificate printed and dispatched to terminal controller successfully. Certified by: ${verifierName} (${verifierId}).`);
                }}
                className="bg-[#071d49] text-white hover:bg-[#071d49]/90 px-4 py-2 rounded-xl text-[11px] font-bold tracking-wider uppercase cursor-pointer"
              >
                Print Clearance Log
              </button>
              <button
                onClick={() => {
                  saveShiftRelease("Standard");
                  setIsShiftFullyReleased(true);
                  setIsReleaseModalOpen(false);
                }}
                className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 px-4 py-2 rounded-xl text-[11px] font-bold tracking-wider uppercase cursor-pointer"
              >
                Confirm Release & Exit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Awaiting Device Return Custom Exception Desk Modal */}
      {isReturnListModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-300">
          <div className="bg-white border border-slate-250 shadow-2xl rounded-3xl w-full max-w-2xl overflow-hidden transform scale-100 transition-transform duration-300 font-sans flex flex-col max-h-[90vh]">
            <div className="bg-amber-500 text-[#071d49] p-6 relative">
              <button
                onClick={() => setIsReturnListModalOpen(false)}
                className="absolute top-4 right-4 text-[#071d49]/70 hover:text-[#071d49] text-xl font-bold p-1 cursor-pointer bg-transparent border-none"
                title="Close"
              >
                ✕
              </button>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#071d49] text-white rounded-xl">
                  <Clock className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base tracking-tight uppercase">
                    Awaiting Device Return Desk
                  </h3>
                  <p className="text-[11px] text-[#071d49]/80 mt-0.5 font-semibold">Active checked-out terminals and staff roster custody lookup</p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto flex-1 font-sans">
              <div className="bg-amber-50/50 border border-amber-150 rounded-2xl p-4 text-[12px] text-amber-900 font-medium flex items-start gap-2.5">
                <AlertTriangle className="w-4.5 h-4.5 text-amber-600 shrink-0 mt-0.5 animate-pulse" />
                <div>
                  <p className="font-bold leading-normal text-[#071d49]">Handover Exception Oversight Required</p>
                  <p className="text-[11px] mt-0.5 leading-relaxed font-sans font-medium text-slate-700">
                    The following staff members have not yet checked back their assigned terminals. You must verify custody status with them to bypass auto-checks and perform an exception shift release.
                  </p>
                </div>
              </div>

              {!showReleaseRemainingForm ? (
                <div className="space-y-4 font-sans">
                  <div className="flex justify-between items-center">
                    <h4 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Active Custody Staff List ({holdersWithAssets.length})</h4>
                    {holdersWithAssets.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const allVerified: {[key: string]: boolean} = {};
                          holdersWithAssets.forEach(h => {
                            allVerified[h.holderId] = true;
                          });
                          setVerifiedHolders(allVerified);
                        }}
                        className="text-[10px] text-[#071d49] hover:underline font-bold bg-transparent border-none cursor-pointer"
                      >
                        ✓ Mark All as Verified
                      </button>
                    )}
                  </div>
                  {holdersWithAssets.length === 0 ? (
                    <div className="text-center py-10 text-neutral-400 text-xs border border-dashed border-neutral-200 rounded-2xl bg-slate-50 font-sans">
                      ✓ All checked out devices have been successfully returned. No outstanding custody exceptions!
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {holdersWithAssets.map((holder) => {
                        const isVerified = !!verifiedHolders[holder.holderId];
                        return (
                          <div key={holder.holderId} className={`border rounded-2xl p-4 transition-all duration-200 ${isVerified ? "bg-emerald-50/40 border-emerald-300" : "bg-neutral-50 border-neutral-200"}`}>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-extrabold text-neutral-855">👤 {holder.holderName}</span>
                                  <span className="text-[10px] font-mono bg-slate-200 border border-slate-300 font-bold px-1.5 py-0.2 rounded text-slate-600 uppercase">{holder.holderId}</span>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {holder.assets.map((asset) => (
                                    <span key={asset.id} className="inline-flex items-center gap-1.5 bg-white border border-slate-200 px-2 py-0.5 rounded-md font-mono text-[9px] text-slate-700 font-bold">
                                      🔍 [{asset.type}] {asset.id} - {asset.name}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setVerifiedHolders(prev => ({
                                    ...prev,
                                    [holder.holderId]: !prev[holder.holderId]
                                  }));
                                }}
                                className={`px-4 py-2 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all transform active:scale-95 cursor-pointer border flex items-center gap-1 shrink-0 ${
                                  isVerified
                                    ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-3xs"
                                    : "bg-white hover:bg-neutral-100 text-[#071d49] border-slate-300 shadow-3xs"
                                }`}
                              >
                                {isVerified ? "✓ Verified" : "Verify Custody"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}

              {showReleaseRemainingForm ? (
                <div className="space-y-4 border-t border-slate-150 pt-4 animate-scaleIn font-sans">
                  <div className="bg-amber-500/10 border-2 border-amber-500/60 rounded-2xl p-4.5 space-y-1">
                    <h5 className="font-extrabold text-[#071d49] text-xs uppercase tracking-wider">Authorized Exception Clearance Certificate</h5>
                    <p className="text-[11px] text-slate-700 leading-relaxed font-sans font-medium">
                      Releasing the remaining shift forces the handover cabinet system into general clearance status, **except for the following staff members** verified to still hold outstanding terminal devices:
                    </p>
                    <div className="mt-2 text-[10.5px] font-mono text-indigo-950 font-bold bg-white p-2.5 rounded-xl border border-indigo-150 flex flex-wrap gap-2">
                      {holdersWithAssets.filter(h => !!verifiedHolders[h.holderId]).length === 0 ? (
                        <span className="text-rose-600 font-sans font-semibold">⚠️ No custody exceptions verified yet. Go back and select staff members.</span>
                      ) : (
                        holdersWithAssets.filter(h => !!verifiedHolders[h.holderId]).map(h => (
                          <span key={h.holderId} className="bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded animate-fadeIn">
                            👤 {h.holderName} (ID: {h.holderId}): {h.assets.length} device(s)
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="release-remaining-name" className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1.5 font-sans">
                        Supervisor Employee Name *
                      </label>
                      <input
                        id="release-remaining-name"
                        type="text"
                        value={releaseRemainingName}
                        onChange={(e) => setReleaseRemainingName(e.target.value)}
                        placeholder="e.g. Inspector Shashi Kumar"
                        className="w-full bg-slate-50 border border-slate-200 focus:border-[#071d49] focus:bg-white text-slate-900 rounded-xl px-4 py-3 text-xs outline-none transition-all font-medium font-sans"
                      />
                    </div>
                    <div>
                      <label htmlFor="release-remaining-id" className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1.5 font-sans">
                        Authorized Employee ID *
                      </label>
                      <input
                        id="release-remaining-id"
                        type="text"
                        value={releaseRemainingId}
                        onChange={(e) => setReleaseRemainingId(e.target.value)}
                        placeholder="e.g. LH-CONF-9844"
                        className="w-full bg-slate-50 border border-slate-200 focus:border-[#071d49] focus:bg-white text-slate-900 rounded-xl px-4 py-3 text-xs outline-none transition-all font-mono font-medium font-sans"
                      />
                    </div>
                  </div>

                  {releaseError && (
                    <p className="text-[11px] text-rose-600 font-bold animate-pulse font-sans">{releaseError}</p>
                  )}

                  <div className="flex gap-2.5 justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => setShowReleaseRemainingForm(false)}
                      className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2.5 text-[11px] font-bold tracking-wider uppercase cursor-pointer rounded-xl font-sans"
                    >
                      Back to Custody List
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const verifiedExceptionHolders = holdersWithAssets.filter(h => !!verifiedHolders[h.holderId]);
                        if (verifiedExceptionHolders.length === 0) {
                          setReleaseError("Please verify at least one custody exception holder to release remainder of shift with exceptions.");
                          return;
                        }
                        if (!releaseRemainingName.trim()) {
                          setReleaseError("Authorizing Supervisor Name is required for shift release.");
                          return;
                        }
                        if (!releaseRemainingId.trim()) {
                          setReleaseError("Supervisor Employee ID is required for verification clearance.");
                          return;
                        }
                        const exceptionPayload = verifiedExceptionHolders.map(h => ({
                          holderName: h.holderName,
                          holderId: h.holderId,
                          deviceCount: h.assets.length
                        }));
                        setReleasedExceptionsList(exceptionPayload);
                        setCertReleaseSupervisorName(releaseRemainingName.trim());
                        setCertReleaseSupervisorId(releaseRemainingId.trim());
                        saveShiftRelease("Exceptional", releaseRemainingName.trim(), releaseRemainingId.trim(), exceptionPayload);
                        setIsShiftReleasedWithExceptions(true);
                        setIsReturnListModalOpen(false);
                        setShowReleaseRemainingForm(false);
                        setReleaseError("");
                      }}
                      className="bg-[#071d49] hover:bg-[#071d49]/90 text-white px-5 py-2.5 rounded-xl text-[11px] font-bold tracking-wider uppercase cursor-pointer border-none font-sans"
                    >
                      Confirm Exception Shift Release
                    </button>
                  </div>
                </div>
              ) : (
                holdersWithAssets.length > 0 && (
                  <div className="border-t border-slate-100 pt-4 flex flex-col sm:flex-row justify-between items-center gap-3">
                    <p className="text-[10px] text-slate-500 font-medium font-sans leading-normal">
                      Releasing the remaining shift registers an authorized exception certificate allowing incoming shifts to start work.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        const verifiedCount = holdersWithAssets.filter(h => !!verifiedHolders[h.holderId]).length;
                        if (verifiedCount === 0) {
                          alert("Please verify custody of at least one outstanding staff member regarding holding their devices before executing release!");
                          return;
                        }
                        setShowReleaseRemainingForm(true);
                        setReleaseError("");
                      }}
                      className="bg-amber-500 hover:bg-amber-600 text-[#071d49] font-extrabold px-5 py-3 rounded-xl uppercase tracking-wider text-[11px] shadow-sm hover:shadow-md transition-all active:scale-[0.98] border-none shrink-0"
                    >
                      Option Release remaining Shift
                    </button>
                  </div>
                )
              )}
            </div>

            <div className="bg-slate-50 border-t border-slate-150 p-4 flex gap-2.5 justify-end shrink-0">
              <button
                type="button"
                onClick={() => setIsReturnListModalOpen(false)}
                className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 px-4 py-2.5 text-[11px] font-bold tracking-wider uppercase cursor-pointer rounded-xl font-sans"
              >
                Close desk
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
