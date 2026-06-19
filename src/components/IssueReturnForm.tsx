import React, { useState, useEffect } from "react";
import { Asset, Agent, Transaction, AssetStatus } from "../types";
import { ArrowUpRight, ArrowDownLeft, Calendar, FileText, Clock, HelpCircle, CheckCircle, AlertTriangle, Play, Smartphone, BookOpen, Camera, Search, User, Clipboard, Sliders } from "lucide-react";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { db, assetsCol, transactionsCol } from "../firebase";
import { HOURLY_SHIFTS } from "../utils/shiftConfig";

interface IssueReturnFormProps {
  assets: Asset[];
  agents: Agent[];
  role: "Admin" | "Supervisor";
  activeShift: string;
  onRefresh: () => void;
  onAddAlert: (type: "overdue" | "missing" | "duplicate_issue" | "already_returned" | "system", title: string, message: string, assetId?: string) => void;
}

export default function IssueReturnForm({ assets, agents, role, activeShift, onRefresh, onAddAlert }: IssueReturnFormProps) {
  const [activeTab, setActiveTab] = useState<"issue" | "return">("issue");

  // Form states - Issue
  const [issueAssetId, setIssueAssetId] = useState("");
  const [issueAgentId, setIssueAgentId] = useState("");
  const [issueRemarks, setIssueRemarks] = useState("");
  const [issueShift, setIssueShift] = useState(activeShift);

  // Form states - Return
  const [returnAssetId, setReturnAssetId] = useState("");
  const [returnRemarks, setReturnRemarks] = useState("");
  const [returnStatus, setReturnStatus] = useState<"In Office" | "Missing / Not Returned">("In Office");

  // Interactive scanner simulation
  const [showScanner, setShowScanner] = useState(false);
  const [cameraAccess, setCameraAccess] = useState(false);
  const [scannedResult, setScannedResult] = useState("");

  // Populate form with current shift when shift updates
  useEffect(() => {
    setIssueShift(activeShift);
  }, [activeShift]);

  // Handle Asset Quick Autofill Select
  const handleSelectAssetForIssue = (id: string) => {
    setIssueAssetId(id);
  };

  const handleSelectAgentForIssue = (id: string) => {
    setIssueAgentId(id);
  };

  const handleSelectAssetForReturn = (id: string) => {
    setReturnAssetId(id);
  };

  // Submit Issue
  const handleIssueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const targetAssetId = issueAssetId.trim().toUpperCase();
    const targetAgentId = issueAgentId.trim().toUpperCase();

    if (!targetAssetId || !targetAgentId) {
      alert("Please provide both Asset ID and Agent Employee ID.");
      return;
    }

    const assetObj = assets.find((a) => a.id === targetAssetId);
    const agentObj = agents.find((a) => a.id === targetAgentId);

    if (!assetObj) {
      alert(`Asset ID ${targetAssetId} does not exist in master list.`);
      return;
    }

    if (!agentObj) {
      alert(`Agent Employee ID ${targetAgentId} is not enrolled.`);
      return;
    }

    // Check if asset is already issued
    if (assetObj.status === AssetStatus.ISSUED) {
      onAddAlert(
        "duplicate_issue",
        "Duplicate Issue Attempt",
        `Asset ${targetAssetId} is already marked as Issued to agent ${targetAgentId}. Double issuing blocked.`,
        targetAssetId
      );
      alert(`Validation Warning: Asset ${targetAssetId} is already issued. Please complete the return first.`);
      return;
    }

    // Prepare transaction
    const txId = `TX-${Date.now().toString().slice(-6)}`;
    const now = new Date();
    const currentDateStr = now.toISOString().split("T")[0];
    const currentTimeStr = now.toTimeString().split(" ")[0].slice(0, 5);

    const transaction: Transaction = {
      id: txId,
      assetId: targetAssetId,
      assetName: assetObj.name,
      assetType: assetObj.type,
      employeeId: targetAgentId,
      agentName: agentObj.name,
      department: agentObj.department || "General Operational Team",
      issueDate: currentDateStr,
      issueTime: currentTimeStr,
      issueTimestamp: now.getTime(),
      shift: issueShift,
      issueRemarks: issueRemarks || "None specified",
      status: "Issued"
    };

    try {
      // 1. Create Transaction Document
      await setDoc(doc(transactionsCol, txId), transaction);

      // 2. Update Asset Document
      await setDoc(doc(assetsCol, targetAssetId), {
        ...assetObj,
        status: AssetStatus.ISSUED,
        currentAssignmentId: txId,
        lastUpdated: now.getTime()
      });

      alert(`Success! Asset ${targetAssetId} successfully issued to ${agentObj.name}.`);
      setIssueAssetId("");
      setIssueAgentId("");
      setIssueRemarks("");
      onRefresh();
    } catch (err) {
      console.error("Error issuing asset:", err);
      alert("Error issuing asset. Try checking Firestore database permissions.");
    }
  };

  // Submit Return
  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const targetAssetId = returnAssetId.trim().toUpperCase();

    if (!targetAssetId) {
      alert("Please provide the returning Asset ID.");
      return;
    }

    const assetObj = assets.find((a) => a.id === targetAssetId);

    if (!assetObj) {
      alert(`Asset ID ${targetAssetId} does not exist in master list.`);
      return;
    }

    // Check if asset is NOT issued
    if (assetObj.status !== AssetStatus.ISSUED && assetObj.status !== AssetStatus.MISSING) {
      onAddAlert(
        "already_returned",
        "Invalid Return Attempt",
        `Attempted to return asset ${targetAssetId} which is already marked as ${assetObj.status} inside the office.`,
        targetAssetId
      );
      alert(`Warning: Asset ${targetAssetId} is already in the office. Handover cannot be processed.`);
      return;
    }

    const activeTxId = assetObj.currentAssignmentId;
    if (!activeTxId) {
      alert(`System Error: No active transaction binding found for asset ${targetAssetId}.`);
      return;
    }

    try {
      // Fetch active transaction
      const txDocRef = doc(transactionsCol, activeTxId);
      const txSnap = await getDoc(txDocRef);
      const now = new Date();
      const currentDateStr = now.toISOString().split("T")[0];
      const currentTimeStr = now.toTimeString().split(" ")[0].slice(0, 5);
      const returnTimeMs = now.getTime();

      let updatedTx: Partial<Transaction> = {
        returnDate: currentDateStr,
        returnTime: currentTimeStr,
        returnTimestamp: returnTimeMs,
        returnRemarks: returnRemarks || "Returned normal checkout",
        status: returnStatus === "In Office" ? "Returned" : "Missing / Not Returned",
      };

      if (txSnap.exists()) {
        const txData = txSnap.data() as Transaction;
        const diffMs = returnTimeMs - txData.issueTimestamp;
        updatedTx.durationMinutes = Math.max(0, Math.round(diffMs / (1000 * 60)));
      }

      // 1. Update Transaction
      await updateDoc(txDocRef, updatedTx);

      // 2. Update Asset
      await setDoc(doc(assetsCol, targetAssetId), {
        ...assetObj,
        status: returnStatus === "In Office" ? AssetStatus.IN_OFFICE : AssetStatus.MISSING,
        currentAssignmentId: null,
        lastUpdated: returnTimeMs
      });

      alert(`Success! Asset ${targetAssetId} return processed successfully.`);
      setReturnAssetId("");
      setReturnRemarks("");
      onRefresh();
    } catch (err) {
      console.error("Error returning asset:", err);
      alert("Error returning asset.");
    }
  };

  // Simulate Barcode QR code scanning
  const handleSimulatedScan = (scannedId: string) => {
    if (activeTab === "issue") {
      setIssueAssetId(scannedId);
    } else {
      setReturnAssetId(scannedId);
    }
    setShowScanner(false);
    alert(`⚡ Scanned Device ID: ${scannedId}`);
  };

  // Filter lists for quick autofill pills
  const availableAssetsForIssue = assets.filter((a) => a.status !== AssetStatus.ISSUED && a.status !== AssetStatus.MISSING);
  const issuedAssetsForReturn = assets.filter((a) => a.status === AssetStatus.ISSUED || a.status === AssetStatus.MISSING);  return (
    <div id="issue-return-control" className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col">
      {/* Top Slider Navigation Tabs */}
      <div className="flex border-b border-slate-255 border-slate-200 bg-slate-50/50 font-semibold p-1">
        <button
          id="tab-select-issue"
          onClick={() => setActiveTab("issue")}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs sm:text-sm tracking-wide transition-all cursor-pointer ${
            activeTab === "issue"
              ? "bg-white text-slate-900 shadow-sm border border-slate-200"
              : "text-slate-500 hover:text-slate-900 hover:bg-slate-100/50"
          }`}
        >
          <ArrowUpRight className="w-4 h-4 text-emerald-500" />
          Issue Handover
        </button>
        <button
          id="tab-select-return"
          onClick={() => setActiveTab("return")}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs sm:text-sm tracking-wide transition-all cursor-pointer ${
            activeTab === "return"
              ? "bg-white text-indigo-600 shadow-sm border border-slate-200"
              : "text-slate-500 hover:text-slate-900 hover:bg-slate-100/50"
          }`}
        >
          <ArrowDownLeft className="w-4 h-4 text-indigo-500" />
          Return Rollback
        </button>
      </div>

      <div className="p-6 flex-1 flex flex-col lg:flex-row gap-6">
        {/* Left Side: Submission Forms */}
        <div className="flex-1">
          {activeTab === "issue" ? (
            <form onSubmit={handleIssueSubmit} className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Asset Handover Form</span>
                <button
                  type="button"
                  onClick={() => setShowScanner(true)}
                  className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                >
                  <Camera className="w-3.5 h-3.5 text-slate-500" />
                  Scan QR / Label
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Device Asset ID *</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={issueAssetId}
                    onChange={(e) => setIssueAssetId(e.target.value)}
                    placeholder="Enter AST-XXX Code"
                    className="flex-1 px-3.5 py-2 border border-slate-200 bg-slate-50/20 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:bg-white transition-all uppercase font-mono font-medium text-slate-800"
                    required
                  />
                  {issueAssetId && (
                    <button
                      type="button"
                      onClick={() => setIssueAssetId("")}
                      className="px-3 text-xs border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-xl transition-all"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Agent Employee ID *</label>
                <input
                  type="text"
                  value={issueAgentId}
                  onChange={(e) => setIssueAgentId(e.target.value)}
                  placeholder="Enter EMPXXX"
                  className="w-full px-3.5 py-2 border border-slate-200 bg-slate-50/20 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:bg-white transition-all uppercase font-mono font-medium text-slate-800"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Operational Shift</label>
                  <select
                    value={issueShift}
                    onChange={(e) => setIssueShift(e.target.value)}
                    className="w-full px-3.5 py-2 border border-slate-200 bg-white rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all font-medium text-slate-700 cursor-pointer"
                  >
                    {HOURLY_SHIFTS.map((shift) => (
                      <option key={shift.value} value={shift.value}>
                        {shift.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Auto Handover Time</label>
                  <div className="w-full px-3.5 py-2 border border-slate-100 bg-slate-50 text-slate-450 rounded-xl text-xs font-mono select-none flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    Automatic Timestamp
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Issue Remarks / Notes</label>
                <textarea
                  value={issueRemarks}
                  onChange={(e) => setIssueRemarks(e.target.value)}
                  placeholder="Note device state or special configurations (optional)"
                  rows={2}
                  className="w-full px-3.5 py-2 border border-slate-200 bg-slate-50/20 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:bg-white transition-all text-slate-800"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 text-white bg-slate-900 hover:bg-slate-800 font-semibold rounded-xl text-xs sm:text-sm tracking-wide transition shadow-sm cursor-pointer"
              >
                Confirm Issue Verification 🟢
              </button>
            </form>
          ) : (
            <form onSubmit={handleReturnSubmit} className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Asset Return Form</span>
                <button
                  type="button"
                  onClick={() => setShowScanner(true)}
                  className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                >
                  <Camera className="w-3.5 h-3.5 text-slate-500" />
                  Scan QR / Label
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Device Asset ID *</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={returnAssetId}
                    onChange={(e) => setReturnAssetId(e.target.value)}
                    placeholder="Enter AST-XXX Code"
                    className="flex-1 px-3.5 py-2 border border-slate-200 bg-slate-50/20 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:bg-white transition-all uppercase font-mono font-medium text-slate-800"
                    required
                  />
                  {returnAssetId && (
                    <button
                      type="button"
                      onClick={() => setReturnAssetId("")}
                      className="px-3 text-xs border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-xl transition-all"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Returning State</label>
                  <select
                    value={returnStatus}
                    onChange={(e) => setReturnStatus(e.target.value as any)}
                    className="w-full px-3.5 py-2 border border-slate-200 bg-white rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all font-medium text-slate-700 cursor-pointer"
                  >
                    <option value="In Office">Returned (In Office)</option>
                    <option value="Missing / Not Returned">Missing / Lost Device</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Auto Return Time</label>
                  <div className="w-full px-3.5 py-2 border border-slate-100 bg-slate-50 text-slate-450 rounded-xl text-xs font-mono select-none flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    Automatic Timestamp
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Return Remarks / Notes</label>
                <textarea
                  value={returnRemarks}
                  onChange={(e) => setReturnRemarks(e.target.value)}
                  placeholder="Describe status on return e.g. Fully charged, minor screen scratch (optional)"
                  rows={2}
                  className="w-full px-3.5 py-2 border border-slate-200 bg-slate-50/20 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:bg-white transition-all text-slate-800"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 text-white bg-indigo-600 hover:bg-indigo-700 font-semibold rounded-xl text-xs sm:text-sm tracking-wide shadow-sm transition cursor-pointer"
              >
                Log Return Rollback 🔵
              </button>
            </form>
          )}
        </div>

        {/* Right Side: Quick Selection Helpers (UX enhancement) */}
        <div className="w-full lg:w-72 bg-slate-50/50 rounded-2xl p-5 border border-slate-200 flex flex-col justify-between">
          <div>
            <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5 pb-2.5 border-b border-slate-200/60 mb-4">
              <Sliders className="w-3.5 h-3.5 text-slate-500" />
              Quick Assist Deck
            </h4>

            {activeTab === "issue" ? (
              <div className="space-y-5">
                {/* Available Assets autofill list */}
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-wider">Available Assets ({availableAssetsForIssue.length})</span>
                  {availableAssetsForIssue.length === 0 ? (
                    <span className="text-[10px] text-slate-400 italic block py-2">All assets issued.</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                      {availableAssetsForIssue.slice(0, 8).map((asset) => (
                        <button
                          key={asset.id}
                          type="button"
                          onClick={() => handleSelectAssetForIssue(asset.id)}
                          className="px-2 py-1 bg-white hover:bg-indigo-50/50 hover:text-indigo-600 text-slate-700 border border-slate-200 rounded-lg text-[10px] font-mono font-bold active:scale-95 transition-all cursor-pointer"
                        >
                          {asset.id}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Agents list */}
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-wider">Enrolled Agents ({agents.length})</span>
                  {agents.length === 0 ? (
                    <span className="text-[10px] text-slate-400 italic block py-2">No active agents.</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                      {agents.slice(0, 8).map((agent) => (
                        <button
                          key={agent.id}
                          type="button"
                          onClick={() => handleSelectAgentForIssue(agent.id)}
                          className="px-2 py-1 bg-white hover:bg-indigo-50/50 hover:text-indigo-600 text-slate-700 border border-slate-200 rounded-lg text-[10px] font-semibold active:scale-95 transition-all cursor-pointer"
                        >
                          {agent.name.split(" ")[0]} ({agent.id})
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-3 tracking-wider">Issued Devices ({issuedAssetsForReturn.length})</span>
                  {issuedAssetsForReturn.length === 0 ? (
                    <span className="text-[10px] text-slate-400 italic block py-2">All devices returned!</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pr-1">
                      {issuedAssetsForReturn.map((asset) => (
                        <button
                          key={asset.id}
                          type="button"
                          onClick={() => handleSelectAssetForReturn(asset.id)}
                          className="px-2.5 py-1.5 bg-white hover:bg-indigo-50/50 hover:text-indigo-600 text-slate-700 border border-slate-200 rounded-lg text-[10px] font-mono font-bold active:scale-95 transition-all text-left flex justify-between items-center w-full cursor-pointer"
                        >
                          <span>{asset.id} - {asset.name.split(" ")[0]}</span>
                          <span className="text-[9px] text-slate-400 font-sans font-medium">{asset.status === AssetStatus.MISSING ? "⚠️ Lost" : "Issued"}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="mt-5 pt-3 border-t border-slate-200/60 bg-white/40 rounded-xl p-2.5 text-[10px] text-slate-450 flex items-start gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Assets are timestamped with local hardware and synced back real-time with Firestore history.
            </p>
          </div>
        </div>
      </div>

      {showScanner && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-sm text-slate-100 flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-teal-400 animate-pulse" />
                QR / Barcode Scanner Sandbox
              </h3>
              <button
                type="button"
                onClick={() => setShowScanner(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="bg-black/40 border border-slate-800 rounded-xl aspect-video relative overflow-hidden mb-4 flex flex-col items-center justify-center text-center p-4">
              {/* Pulsing Scan bar */}
              <div className="absolute top-0 inset-x-0 h-0.5 bg-teal-400 shadow-md shadow-teal-400/50 animate-bounce" />

              <VideoSimulator />
              <p className="text-[11px] text-slate-400 max-w-xs mt-3 relative z-10">
                Place the device barcode or printed QR in the visual field of container stream.
              </p>
            </div>

            <div className="space-y-4">
              <span className="text-[10px] font-bold text-slate-400 block pb-1 border-b border-slate-800 uppercase">Select Simulator Payload</span>
              <div className="grid grid-cols-2 gap-2">
                {assets.map((asset) => (
                  <button
                    key={asset.id}
                    onClick={() => handleSimulatedScan(asset.id)}
                    className="p-2 border border-slate-800 bg-slate-800/50 hover:bg-slate-800 rounded-xl text-left text-xs text-slate-200 truncate transition-colors cursor-pointer"
                  >
                    🚀 Scan {asset.id} <span className="text-[9px] text-slate-400 font-serif block">({asset.name})</span>
                  </button>
                ))}
              </div>

              <button
                onClick={() => setShowScanner(false)}
                className="w-full mt-2 p-2 border border-slate-800 text-slate-400 hover:text-white text-xs font-semibold rounded-xl"
              >
                Cancel Stream
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VideoSimulator() {
  return (
    <div className="flex flex-col items-center opacity-60">
      <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-2" />
      <span className="font-mono text-[10px]">SYNCING SHIFT CAMERA STREAM...</span>
    </div>
  );
}
