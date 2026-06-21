import React, { useState, useEffect } from "react";
import { Asset, Agent, Transaction, AssetStatus } from "../types";
import { ArrowUpRight, ArrowDownLeft, Calendar, FileText, Clock, HelpCircle, CheckCircle, AlertTriangle, Play, Smartphone, BookOpen, Camera, Search, User, Clipboard, Sliders, ArrowLeftRight } from "lucide-react";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { useZxing } from "react-zxing";

import { db, assetsCol, transactionsCol } from "../firebase";
import { HOURLY_SHIFTS } from "../utils/shiftConfig";

interface IssueReturnFormProps {
  assets: Asset[];
  agents: Agent[];
  transactions: Transaction[];
  role: "Admin" | "Supervisor";
  activeShift: string;
  onRefresh: () => void;
  onAddAlert: (type: "overdue" | "missing" | "duplicate_issue" | "already_returned" | "system", title: string, message: string, assetId?: string) => void;
}

export default function IssueReturnForm({ assets, agents, transactions, role, activeShift, onRefresh, onAddAlert }: IssueReturnFormProps) {
  const [activeTab, setActiveTab] = useState<"issue" | "return" | "handover">("issue");

  // Main operational agent selection
  const [selectedAgentId, setSelectedAgentId] = useState("");

  // Form states - Issue
  const [issueAssetId, setIssueAssetId] = useState("");
  const [issueRemarks, setIssueRemarks] = useState("");
  const [issueShift, setIssueShift] = useState(activeShift);

  // Form states - Return
  const [returnAssetId, setReturnAssetId] = useState("");
  const [returnRemarks, setReturnRemarks] = useState("");
  const [returnStatus, setReturnStatus] = useState<"In Office" | "Missing / Not Returned">("In Office");

  // Form states - Handover
  const [handoverAssetId, setHandoverAssetId] = useState("");
  const [handoverToAgentId, setHandoverToAgentId] = useState("");
  const [handoverRemarks, setHandoverRemarks] = useState("");

  // Interactive scanner simulation
  const [showScanner, setShowScanner] = useState(false);

  // Success Confirmation Pop-up modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: "Issue" | "Return" | "Handover";
    txId: string;
    assetId: string;
    assetName: string;
    assetType: string;
    agentId: string;
    agentName: string;
    targetAgentId?: string;
    targetAgentName?: string;
    remarks?: string;
    timestamp: number;
    durationMinutes?: number;
  } | null>(null);

  // Populate form with current shift when shift updates
  useEffect(() => {
    setIssueShift(activeShift);
  }, [activeShift]);

  // Find currently selected agent details
  const currentAgent = agents.find(
    (a) => a.id.toUpperCase() === selectedAgentId.toUpperCase().trim()
  );

  // Compute assets currently held by the selected agent
  const agentHeldAssets = currentAgent
    ? assets.filter(
        (a) =>
          a.status === AssetStatus.ISSUED &&
          a.currentAssignmentId &&
          transactions.find((tx) => tx.id === a.currentAssignmentId)?.employeeId.toUpperCase() === currentAgent.id.toUpperCase()
      )
    : [];

  // Automatically reset tab back to "issue" if selected agent holds no devices
  useEffect(() => {
    if (agentHeldAssets.length === 0 && (activeTab === "return" || activeTab === "handover")) {
      setActiveTab("issue");
    }
  }, [agentHeldAssets.length, activeTab]);

  // Auto-fill active asset on tab switch
  useEffect(() => {
    if (activeTab === "return") {
      if (agentHeldAssets.length > 0) {
        setReturnAssetId(agentHeldAssets[0].id);
      } else {
        setReturnAssetId("");
      }
    } else if (activeTab === "handover") {
      if (agentHeldAssets.length > 0) {
        setHandoverAssetId(agentHeldAssets[0].id);
      } else {
        setHandoverAssetId("");
      }
    }
  }, [activeTab, selectedAgentId]);

  // Handle Quick Selection helpers from sidebar
  const handleSelectAssetForIssue = (id: string) => {
    setIssueAssetId(id);
  };

  const handleSelectAgent = (id: string) => {
    setSelectedAgentId(id);
    setIssueAssetId("");
    setReturnAssetId("");
    setHandoverAssetId("");
  };

  // Submit Issue
  const handleIssueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const targetAgentId = selectedAgentId.trim().toUpperCase();
    const targetAssetId = issueAssetId.trim().toUpperCase();

    if (!targetAgentId) {
      alert("Please select or enter an Agent Employee ID first.");
      return;
    }
    if (!targetAssetId) {
      alert("Please enter the Device Asset ID.");
      return;
    }

    const agentObj = agents.find((a) => a.id.toUpperCase() === targetAgentId);
    const assetObj = assets.find((a) => a.id.toUpperCase() === targetAssetId);

    if (!agentObj) {
      alert(`Agent Employee ID ${targetAgentId} is not enrolled.`);
      return;
    }
    if (!assetObj) {
      alert(`Asset ID ${targetAssetId} does not exist in the master list.`);
      return;
    }

    // Check if asset is already issued or has active custody
    const isAlreadyIssued = 
      assetObj.status === AssetStatus.ISSUED || 
      assetObj.status === AssetStatus.MISSING || 
      !!assetObj.currentAssignmentId;

    if (isAlreadyIssued) {
      onAddAlert(
        "duplicate_issue",
        "Duplicate Issue Attempt",
        `Asset ${targetAssetId} is already marked as Issued/Missing or has active custody. Double issuing blocked.`,
        targetAssetId
      );
      alert(`Validation Warning: Asset ${targetAssetId} is currently issued or missing. It cannot be issued to anyone else until it has been returned or handed over.`);
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
      await updateDoc(doc(assetsCol, targetAssetId), {
        status: AssetStatus.ISSUED,
        currentAssignmentId: txId,
        lastUpdated: now.getTime()
      });

      setConfirmModal({
        isOpen: true,
        type: "Issue",
        txId,
        assetId: targetAssetId,
        assetName: assetObj.name,
        assetType: assetObj.type,
        agentId: targetAgentId,
        agentName: agentObj.name,
        remarks: issueRemarks || "None specified",
        timestamp: now.getTime()
      });
      setIssueAssetId("");
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

    const targetAgentId = selectedAgentId.trim().toUpperCase();
    const targetAssetId = returnAssetId.trim().toUpperCase();

    if (!targetAgentId) {
      alert("Please select an Agent first.");
      return;
    }
    if (!targetAssetId) {
      alert("Please select the returning Asset ID.");
      return;
    }

    // Validate that the device is indeed held by this agent
    const holdsDevice = agentHeldAssets.some((a) => a.id.toUpperCase() === targetAssetId);
    if (!holdsDevice) {
      alert(`Validation Error: Agent ${targetAgentId} does not currently hold device ${targetAssetId}.`);
      return;
    }

    const assetObj = assets.find((a) => a.id.toUpperCase() === targetAssetId);
    if (!assetObj) {
      alert(`Asset ID ${targetAssetId} does not exist in the master inventory list.`);
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
      await updateDoc(doc(assetsCol, targetAssetId), {
        status: returnStatus === "In Office" ? AssetStatus.IN_OFFICE : AssetStatus.MISSING,
        currentAssignmentId: null,
        lastUpdated: returnTimeMs
      });

      setConfirmModal({
        isOpen: true,
        type: "Return",
        txId: activeTxId,
        assetId: targetAssetId,
        assetName: assetObj.name,
        assetType: assetObj.type,
        agentId: targetAgentId,
        agentName: currentAgent?.name || "Unknown",
        remarks: returnRemarks || "Returned normal checkout",
        timestamp: returnTimeMs,
        durationMinutes: updatedTx.durationMinutes
      });
      setReturnAssetId("");
      setReturnRemarks("");
      onRefresh();
    } catch (err) {
      console.error("Error returning asset:", err);
      alert("Error returning asset.");
    }
  };

  // Submit Direct Handover
  const handleHandoverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const fromAgentId = selectedAgentId.trim().toUpperCase();
    const targetAssetId = handoverAssetId.trim().toUpperCase();
    const toAgentIdInput = handoverToAgentId.trim().toUpperCase();

    if (!fromAgentId) {
      alert("Please select the sending Agent first.");
      return;
    }
    if (!targetAssetId) {
      alert("Please select the device to handover.");
      return;
    }
    if (!toAgentIdInput) {
      alert("Please select the receiving Agent.");
      return;
    }
    if (fromAgentId === toAgentIdInput) {
      alert("Error: Cannot handover a device to the exact same agent.");
      return;
    }

    // Validate that the device is indeed held by this agent
    const holdsDevice = agentHeldAssets.some((a) => a.id.toUpperCase() === targetAssetId);
    if (!holdsDevice) {
      alert(`Validation Error: Agent ${fromAgentId} does not currently hold device ${targetAssetId}.`);
      return;
    }

    const assetObj = assets.find((a) => a.id.toUpperCase() === targetAssetId);
    const toAgentObj = agents.find((a) => a.id.toUpperCase() === toAgentIdInput);

    if (!assetObj) {
      alert(`Asset ID ${targetAssetId} does not exist in master list.`);
      return;
    }
    if (!toAgentObj) {
      alert(`Receiving Agent ${toAgentIdInput} is not registered in Roster.`);
      return;
    }

    const activeTxId = assetObj.currentAssignmentId;
    if (!activeTxId) {
      alert(`System Error: No active transaction binding found for asset ${targetAssetId}.`);
      return;
    }

    try {
      const now = new Date();
      const currentDateStr = now.toISOString().split("T")[0];
      const currentTimeStr = now.toTimeString().split(" ")[0].slice(0, 5);
      const currentMs = now.getTime();

      // 1. Close current active transaction of the previous agent
      const txDocRef = doc(transactionsCol, activeTxId);
      const txSnap = await getDoc(txDocRef);
      let updatedTx: Partial<Transaction> = {
        returnDate: currentDateStr,
        returnTime: currentTimeStr,
        returnTimestamp: currentMs,
        returnRemarks: `Direct Handover by Supervisor to Agent ${toAgentObj.name} (${toAgentObj.id}).`,
        status: "Returned"
      };
      if (txSnap.exists()) {
        const txData = txSnap.data() as Transaction;
        const diffMs = currentMs - txData.issueTimestamp;
        updatedTx.durationMinutes = Math.max(0, Math.round(diffMs / (1000 * 60)));
      }
      await updateDoc(txDocRef, updatedTx);

      // 2. Open new custodian transaction record for target agent
      const newTxId = `TX-${Date.now().toString().slice(-6)}-HO`;
      const newTransaction: Transaction = {
        id: newTxId,
        assetId: targetAssetId,
        assetName: assetObj.name,
        assetType: assetObj.type,
        employeeId: toAgentObj.id,
        agentName: toAgentObj.name,
        department: toAgentObj.department || "General Shift Operations",
        issueDate: currentDateStr,
        issueTime: currentTimeStr,
        issueTimestamp: currentMs,
        shift: issueShift,
        issueRemarks: `Direct Handover by Supervisor from Agent ${currentAgent ? currentAgent.name : "Unknown"} (${fromAgentId}). ${handoverRemarks ? `Note: ${handoverRemarks}` : "No details specify."}`,
        status: "Issued"
      };
      await setDoc(doc(transactionsCol, newTxId), newTransaction);

      // 3. Point asset pointer record to the new transaction ID
      await updateDoc(doc(assetsCol, targetAssetId), {
        status: AssetStatus.ISSUED,
        currentAssignmentId: newTxId,
        lastUpdated: currentMs
      });

      setConfirmModal({
        isOpen: true,
        type: "Handover",
        txId: newTxId,
        assetId: targetAssetId,
        assetName: assetObj.name,
        assetType: assetObj.type,
        agentId: fromAgentId,
        agentName: currentAgent?.name || "Unknown",
        targetAgentId: toAgentObj.id,
        targetAgentName: toAgentObj.name,
        remarks: handoverRemarks || "No details specify.",
        timestamp: currentMs
      });
      setHandoverAssetId("");
      setHandoverToAgentId("");
      setHandoverRemarks("");
      onRefresh();
    } catch (err) {
      console.error("Direct handover fails", err);
      alert("Ledger transaction failed to update. Check operational connections.");
    }
  };

  // Simulate Barcode QR code scanning
  const handleSimulatedScan = (scannedId: string) => {
    const assetIdUpper = scannedId.toUpperCase().trim();
    if (activeTab === "issue") {
      setIssueAssetId(assetIdUpper);
    } else if (activeTab === "return") {
      // Check if held
      const holdsDevice = agentHeldAssets.some((a) => a.id.toUpperCase() === assetIdUpper);
      if (selectedAgentId && !holdsDevice) {
        alert(`Validation Warning: Agent ${selectedAgentId} does not currently hold this device. Scanning blocked.`);
        return;
      }
      setReturnAssetId(assetIdUpper);
    } else if (activeTab === "handover") {
      // Check if held
      const holdsDevice = agentHeldAssets.some((a) => a.id.toUpperCase() === assetIdUpper);
      if (selectedAgentId && !holdsDevice) {
        alert(`Validation Warning: Agent ${selectedAgentId} does not currently hold this device. Scanning blocked.`);
        return;
      }
      setHandoverAssetId(assetIdUpper);
    }
    setShowScanner(false);
    alert(`⚡ Scanned Device ID: ${scannedId}`);
  };

  const availableAssetsForIssue = assets.filter((a) => a.status !== AssetStatus.ISSUED && a.status !== AssetStatus.MISSING);

  return (
    <div id="issue-return-control" className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden shadow-md flex flex-col">
      
      {/* Selected Agent Header Search Panel - Premium Dark Slate Indigo Design */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-950 text-white border-b border-indigo-900/50 p-4 sm:p-6 flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        <div className="flex-1 min-w-0">
          <label className="block text-[11px] uppercase font-bold text-slate-300 mb-2 tracking-widest font-sans flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
            1. Select ACTIVE SHIFT AGENT *
          </label>
          <div className="flex gap-2 w-full">
            <select
              value={selectedAgentId}
              onChange={(e) => handleSelectAgent(e.target.value)}
              className="flex-1 h-12 px-4 border border-slate-705 bg-slate-900 text-white rounded-xl text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-indigo-400 font-bold cursor-pointer transition-all placeholder-slate-400 shadow-inner"
            >
              <option value="" className="text-slate-900 font-sans">-- Click here to select Active Agent --</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id} className="text-slate-950 font-sans font-medium">
                  👤 {agent.name} ({agent.id}) - {agent.department || "Operations"}
                </option>
              ))}
            </select>
            {selectedAgentId && (
              <button
                type="button"
                onClick={() => setSelectedAgentId("")}
                className="px-4 text-sm font-extrabold bg-slate-800 hover:bg-rose-600 text-slate-200 hover:text-white border border-slate-700 hover:border-rose-600 rounded-xl transition-all cursor-pointer h-12 flex items-center justify-center shrink-0 shadow-sm"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {currentAgent && (
          <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-xl p-4 min-w-[260px] text-left md:text-right shrink-0 shadow-lg relative overflow-hidden flex flex-col justify-center">
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-xl -mr-6 -mt-6 pointer-events-none" />
            <h5 className="text-sm font-extrabold tracking-tight text-white flex items-center gap-2 md:justify-end">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
              {currentAgent.name}
            </h5>
            <p className="text-xs text-indigo-200 font-bold mt-0.5">{currentAgent.id} · {currentAgent.department || "Operations"}</p>
            <div className="mt-2.5 flex items-center justify-start md:justify-end gap-1.5 text-xs text-teal-300 font-black tracking-wide">
              <Smartphone className="w-4 h-4 text-teal-400" />
              {agentHeldAssets.length === 0 ? (
                <span className="text-slate-350 font-medium">No Devices Checked Out</span>
              ) : (
                <span className="bg-teal-950/60 text-teal-300 px-2 py-0.5 rounded-lg border border-teal-850">
                  Holds {agentHeldAssets.length} Active Device{agentHeldAssets.length > 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Top Slider Navigation Tabs - responsive layout grid */}
      <div className="grid grid-cols-3 gap-1.5 p-1.5 bg-slate-200/60 border-b border-slate-250 font-bold">
        <button
          id="tab-select-issue"
          onClick={() => setActiveTab("issue")}
          className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2.5 py-3.5 rounded-xl text-xs sm:text-sm tracking-wide transition-all shadow-3xs cursor-pointer ${
            activeTab === "issue"
              ? "bg-emerald-600 text-white shadow-md border-b-2 border-emerald-700 font-black animate-scaleIn"
              : "bg-white/80 text-slate-600 hover:text-slate-900 hover:bg-white border border-slate-300/40"
          }`}
        >
          <ArrowUpRight className="w-4 h-4 text-emerald-500 shrink-0" />
          <span className="text-center font-bold">Issue Device</span>
        </button>

        <button
          id="tab-select-return"
          disabled={!selectedAgentId || agentHeldAssets.length === 0}
          onClick={() => {
            if (selectedAgentId && agentHeldAssets.length > 0) {
              setActiveTab("return");
            }
          }}
          className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2.5 py-3.5 rounded-xl text-xs sm:text-sm tracking-wide transition-all shadow-3xs ${
            (!selectedAgentId || agentHeldAssets.length === 0)
              ? "opacity-35 cursor-not-allowed bg-slate-100/50 text-slate-400 border border-slate-200"
              : activeTab === "return"
              ? "bg-indigo-600 text-white shadow-md border-b-2 border-indigo-700 font-black cursor-pointer"
              : "bg-white/80 text-slate-600 hover:text-indigo-600 hover:bg-white border border-slate-300/40 cursor-pointer"
          }`}
          title={(!selectedAgentId || agentHeldAssets.length === 0) ? "Return options are only available when the selected agent holds active devices." : ""}
        >
          <ArrowDownLeft className="w-4 h-4 text-indigo-500 shrink-0" />
          <span className="text-center font-bold">Return {agentHeldAssets.length > 0 && `(${agentHeldAssets.length})`}</span>
        </button>

        <button
          id="tab-select-handover"
          disabled={!selectedAgentId || agentHeldAssets.length === 0}
          onClick={() => {
            if (selectedAgentId && agentHeldAssets.length > 0) {
              setActiveTab("handover");
            }
          }}
          className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2.5 py-3.5 rounded-xl text-xs sm:text-sm tracking-wide transition-all shadow-3xs ${
            (!selectedAgentId || agentHeldAssets.length === 0)
              ? "opacity-35 cursor-not-allowed bg-slate-100/50 text-slate-400 border border-slate-200"
              : activeTab === "handover"
              ? "bg-amber-600 text-white shadow-md border-b-2 border-amber-700 font-black cursor-pointer"
              : "bg-white/80 text-slate-600 hover:text-amber-600 hover:bg-white border border-slate-300/40 cursor-pointer"
          }`}
          title={(!selectedAgentId || agentHeldAssets.length === 0) ? "Handover options are only available when the selected agent holds active devices." : ""}
        >
          <ArrowLeftRight className="w-4 h-4 text-amber-500 shrink-0" />
          <span className="text-center font-bold">Handover {agentHeldAssets.length > 0 && `(${agentHeldAssets.length})`}</span>
        </button>
      </div>

      <div className="p-4 sm:p-6 flex-1 flex flex-col lg:flex-row gap-6 bg-white">
        {/* Left Side: Submission Forms */}
        <div className="flex-1 min-w-0">
          {!selectedAgentId ? (
            <div className="flex flex-col items-center justify-center text-center p-6 sm:p-12 bg-indigo-50/25 border-2 border-dashed border-indigo-150 rounded-2xl min-h-[340px] animate-fadeIn">
              <div className="w-14 h-14 bg-indigo-100 border border-indigo-200 rounded-3xl flex items-center justify-center text-indigo-600 mb-4 shadow-sm">
                <User className="w-7 h-7 shrink-0" />
              </div>
              <h4 className="text-base font-extrabold text-slate-900 tracking-tight">Supervisor Desk Active</h4>
              <p className="text-xs sm:text-sm text-slate-600 mt-2 max-w-sm leading-relaxed font-semibold">
                To issue, return, or transfer terminal scanners and passenger devices, first assign the active <strong className="text-indigo-600">Lufthansa Staff Crew Member</strong>.
              </p>
              
              <div className="mt-6 w-full max-w-md">
                <h5 className="text-[10px] uppercase font-bold text-slate-400 mb-3 tracking-widest text-center">Or click a staff member from Roster:</h5>
                <div className="flex flex-wrap gap-2 justify-center">
                  {agents.slice(0, 6).map(ag => (
                    <button 
                      key={ag.id}
                      onClick={() => handleSelectAgent(ag.id)}
                      className="px-3.5 py-2.5 text-xs bg-white border border-slate-350 hover:border-indigo-500 hover:text-indigo-750 rounded-xl font-bold text-slate-700 shadow-3xs hover:shadow-2xs transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                    >
                      <span>👤 {ag.name}</span>
                      <span className="font-mono text-[10px] bg-indigo-50 text-indigo-600 px-1 py-0.2 rounded font-semibold">{ag.id}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-55/60 bg-slate-50/80 rounded-2xl p-4 sm:p-6 border border-slate-200">
              {activeTab === "issue" && (
                <form onSubmit={handleIssueSubmit} className="space-y-4 animate-fadeIn">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200/75">
                    <span className="text-xs font-bold text-emerald-800 uppercase tracking-widest flex items-center gap-1.5 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-255 border-emerald-250">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      Issue Device Form
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowScanner(true)}
                      className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-teal-50 to-emerald-50 hover:from-teal-100 hover:to-emerald-100 text-teal-700 hover:text-teal-850 border border-teal-200 hover:border-teal-300 rounded-xl text-xs font-extrabold cursor-pointer transition-all shadow-3xs"
                    >
                      <Camera className="w-4 h-4 text-teal-600 animate-pulse shrink-0" />
                      Scan QR / Label
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">Device Asset ID *</label>
                    <div className="flex gap-2">
                      <select
                        value={issueAssetId}
                        onChange={(e) => setIssueAssetId(e.target.value)}
                        className="flex-1 h-12 px-4 border border-slate-300 bg-white rounded-xl text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-emerald-500 font-extrabold font-mono text-slate-800 cursor-pointer shadow-3xs"
                        required
                        id="issue-asset-select"
                      >
                        <option value="" className="font-sans">-- Click to choose available device --</option>
                        {availableAssetsForIssue.map((asset) => (
                          <option key={asset.id} value={asset.id}>
                            📱 {asset.id} - {asset.name} ({asset.type})
                          </option>
                        ))}
                      </select>
                      {issueAssetId && (
                        <button
                          type="button"
                          onClick={() => setIssueAssetId("")}
                          className="px-4 text-xs font-bold border border-slate-300 text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 rounded-xl transition-all h-12 cursor-pointer shadow-3xs"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">Operational Shift *</label>
                      <select
                        value={issueShift}
                        onChange={(e) => setIssueShift(e.target.value)}
                        className="w-full h-12 px-4 border border-slate-300 bg-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-slate-700 cursor-pointer shadow-3xs"
                      >
                        {HOURLY_SHIFTS.map((shift) => (
                          <option key={shift.value} value={shift.value}>
                            {shift.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">Auto Handover Time</label>
                      <div className="w-full h-12 px-4 bg-slate-100 text-slate-500 rounded-xl text-xs sm:text-sm font-bold font-mono select-none flex items-center gap-2 border border-slate-200">
                        <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                        Automatic Clock Timestamp
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">Issue Remarks / Notes</label>
                    <textarea
                      value={issueRemarks}
                      onChange={(e) => setIssueRemarks(e.target.value)}
                      placeholder="Specify device state, physical defects, power levels or configurations..."
                      rows={3}
                      className="w-full px-4 py-3 border border-slate-300 bg-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-slate-800 shadow-3xs"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full h-12 text-white bg-emerald-600 hover:bg-emerald-700 font-black rounded-xl text-xs sm:text-sm tracking-wide transition shadow-md hover:shadow-lg active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 border border-emerald-700"
                  >
                    <span>Confirm Issue Verification</span>
                    <span className="text-emerald-100">🟢</span>
                  </button>
                </form>
              )}

              {activeTab === "return" && (
                <form onSubmit={handleReturnSubmit} className="space-y-4 animate-fadeIn">
                  <div className="pb-3 border-b border-slate-205">
                    <span className="text-xs font-bold text-indigo-850 uppercase tracking-widest flex items-center gap-1.5 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200 w-fit">
                      <span className="w-2 h-2 rounded-full bg-indigo-550" />
                      Asset Return Form
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">Choose Device held by {currentAgent?.name} *</label>
                    <select
                      value={returnAssetId}
                      onChange={(e) => setReturnAssetId(e.target.value)}
                      className="w-full h-12 px-4 border border-slate-300 bg-white rounded-xl text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-indigo-505 font-bold font-mono text-slate-850 cursor-pointer shadow-3xs"
                      required
                    >
                      <option value="" className="font-sans">-- Click to select returning device --</option>
                      {agentHeldAssets.map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          📱 {asset.id} - {asset.name} ({asset.type})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">Returning Placement State *</label>
                      <select
                        value={returnStatus}
                        onChange={(e) => setReturnStatus(e.target.value as any)}
                        className="w-full h-12 px-4 border border-slate-300 bg-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-700 cursor-pointer shadow-3xs"
                      >
                        <option value="In Office">Returned (Safe In Office)</option>
                        <option value="Missing / Not Returned">⚠️ Missing / Lost Device</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">Auto Return Timestamp</label>
                      <div className="w-full h-12 px-4 text-slate-500 bg-slate-100 rounded-xl text-xs sm:text-sm font-bold font-mono select-none flex items-center gap-2 border border-slate-200">
                        <Clock className="w-4 h-4 text-slate-450 shrink-0" />
                        Automatic Clock Time
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">Return Remarks / Notes</label>
                    <textarea
                      value={returnRemarks}
                      onChange={(e) => setReturnRemarks(e.target.value)}
                      placeholder="Note charging status, power level, damage or safe physical placement info..."
                      rows={3}
                      className="w-full px-4 py-3 border border-slate-300 bg-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-505 transition-all text-slate-800 shadow-3xs"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full h-12 text-white bg-indigo-600 hover:bg-indigo-750 font-black rounded-xl text-sm sm:text-base tracking-wide shadow-md hover:shadow-lg active:scale-[0.98] transition cursor-pointer flex items-center justify-center gap-2 border border-indigo-705"
                  >
                    <span>Log Return Custody Registry</span>
                    <span className="text-indigo-100">🔵</span>
                  </button>
                </form>
              )}

              {activeTab === "handover" && (
                <form onSubmit={handleHandoverSubmit} className="space-y-4 animate-fadeIn">
                  <div className="pb-3 border-b border-slate-205">
                    <span className="text-xs font-bold text-amber-800 uppercase tracking-widest flex items-center gap-1.5 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 w-fit">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      Asset Direct Handover Form
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">Choose Device held by {currentAgent?.name} *</label>
                    <select
                      value={handoverAssetId}
                      onChange={(e) => setHandoverAssetId(e.target.value)}
                      className="w-full h-12 px-4 border border-slate-300 bg-white rounded-xl text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-amber-500 font-bold font-mono text-slate-800 cursor-pointer shadow-3xs"
                      required
                    >
                      <option value="" className="font-sans">-- Click to choose device to send --</option>
                      {agentHeldAssets.map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          📱 {asset.id} - {asset.name} ({asset.type})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">Direct Recipient (To Agent) *</label>
                    <select
                      value={handoverToAgentId}
                      onChange={(e) => setHandoverToAgentId(e.target.value)}
                      className="w-full h-12 px-4 border border-slate-300 bg-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-bold text-slate-800 cursor-pointer shadow-3xs"
                      required
                    >
                      <option value="">-- Choose Recipient Agent --</option>
                      {agents
                        .filter((a) => a.id.toUpperCase() !== selectedAgentId.toUpperCase())
                        .map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            👤 {agent.name} ({agent.id}) - {agent.department || "Operations"}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">Handover Remarks / Notes</label>
                    <textarea
                      value={handoverRemarks}
                      onChange={(e) => setHandoverRemarks(e.target.value)}
                      placeholder="Describe physical transition, active flight/ops constraints or state notes..."
                      rows={3}
                      className="w-full px-4 py-3 border border-slate-300 bg-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all text-slate-805 text-slate-800 shadow-3xs"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full h-12 text-white bg-amber-600 hover:bg-amber-700 font-black rounded-xl text-sm sm:text-base tracking-wide shadow-md hover:shadow-lg active:scale-[0.98] transition cursor-pointer flex items-center justify-center gap-2 border border-amber-700"
                  >
                    <span>Process Supervisor Direct Handover</span>
                    <span className="text-amber-100">🤝</span>
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Right Side: Quick Selection Helpers */}
        <div className="w-full lg:w-80 bg-slate-50 border border-slate-250 rounded-3xl p-5 flex flex-col justify-between shrink-0 shadow-3xs">
          <div>
            <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2 pb-3 border-b border-slate-200 mb-4 uppercase tracking-wider">
              <Sliders className="w-4 h-4 text-indigo-650 shrink-0" />
              Quick Assist Deck
            </h4>

            {activeTab === "issue" ? (
              <div className="space-y-5">
                {/* Available Assets autofill list */}
                <div>
                  <span className="text-[11px] uppercase font-bold text-emerald-900 bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 rounded-md inline-block mb-3 tracking-wider font-sans">
                    Available Devices ({availableAssetsForIssue.length})
                  </span>
                  {availableAssetsForIssue.length === 0 ? (
                    <span className="text-xs text-slate-400 italic block py-4 bg-white rounded-xl text-center border border-dashed border-slate-200">All assets issued.</span>
                  ) : (
                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-1">
                      {availableAssetsForIssue.slice(0, 15).map((asset) => (
                        <button
                          key={asset.id}
                          type="button"
                          onClick={() => handleSelectAssetForIssue(asset.id)}
                          className={`px-3 py-2 bg-white hover:bg-emerald-50 hover:text-emerald-700 text-slate-800 border ${
                            issueAssetId === asset.id ? "border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500" : "border-slate-300"
                          } rounded-xl text-xs font-mono font-bold active:scale-95 transition-all cursor-pointer shadow-3xs`}
                        >
                          {asset.id}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Agents list */}
                <div>
                  <span className="text-[11px] uppercase font-bold text-indigo-850 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-md inline-block mb-3 tracking-wider font-sans">
                    Enrolled Agents Roster ({agents.length})
                  </span>
                  {agents.length === 0 ? (
                    <span className="text-xs text-slate-400 italic block py-4 bg-white rounded-xl text-center border border-dashed border-slate-200">No active agents.</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 sm:gap-2 max-h-48 overflow-y-auto pr-1">
                      {agents.slice(0, 20).map((agent) => (
                        <button
                          key={agent.id}
                          type="button"
                          onClick={() => handleSelectAgent(agent.id)}
                          className={`px-3 py-2.5 border rounded-xl text-xs font-bold active:scale-95 transition-all cursor-pointer shadow-3xs ${
                            selectedAgentId.toUpperCase() === agent.id.toUpperCase()
                              ? "bg-indigo-600 text-white border-indigo-700 shadow-md scale-[1.02]"
                              : "bg-white hover:bg-indigo-50 hover:border-indigo-400 text-slate-700 border-slate-300"
                          }`}
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
                  <span className="text-[11px] uppercase font-bold text-indigo-900 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-md inline-block mb-3 tracking-wider font-sans">
                    {currentAgent ? `${currentAgent.name}'s Held Devices` : "Agent Held Devices"} ({agentHeldAssets.length})
                  </span>
                  {agentHeldAssets.length === 0 ? (
                    <span className="text-xs text-slate-400 italic block py-6 bg-white rounded-xl text-center border border-dashed border-slate-200 p-4 leading-relaxed font-semibold">
                      This agent currently holds no active device placements.
                    </span>
                  ) : (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1 flex flex-col">
                      {agentHeldAssets.map((asset) => (
                        <button
                          key={asset.id}
                          type="button"
                          onClick={() => {
                            if (activeTab === "return") {
                              setReturnAssetId(asset.id);
                            } else if (activeTab === "handover") {
                              setHandoverAssetId(asset.id);
                            }
                          }}
                          className={`p-3 border rounded-xl text-xs font-bold active:scale-95 transition-all text-left flex justify-between items-center w-full cursor-pointer shadow-3xs ${
                            (activeTab === "return" ? returnAssetId : handoverAssetId) === asset.id
                              ? "bg-indigo-600 border-indigo-700 text-white shadow-md scale-[1.01]"
                              : "bg-white hover:bg-slate-55 text-slate-850 border-slate-200"
                          }`}
                        >
                          <div className="flex flex-col">
                            <span className="font-mono font-bold text-sm">{asset.id}</span>
                            <span className={`text-[10px] mt-0.5 font-medium ${
                              (activeTab === "return" ? returnAssetId : handoverAssetId) === asset.id ? "text-indigo-100" : "text-slate-550"
                            }`}>{asset.name}</span>
                          </div>
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-lg border ${
                            asset.status === AssetStatus.MISSING
                              ? "bg-rose-50 border-rose-200 text-rose-700 font-bold" 
                              : (activeTab === "return" ? returnAssetId : handoverAssetId) === asset.id 
                              ? "bg-indigo-700 border-indigo-800 text-indigo-50 font-bold" 
                              : "bg-emerald-50 border-emerald-100 text-emerald-700 font-bold"
                          }`}>{asset.status === AssetStatus.MISSING ? "⚠️ Lost" : "Held"}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-205 bg-white rounded-2xl p-3.5 text-[11px] text-slate-500 font-medium flex items-start gap-2 border border-slate-100 shadow-3xs">
            <BookOpen className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
            <p className="leading-relaxed font-sans">
              Use this Quick Assist Deck to instantly bind open device nodes & roster agents. Tapping lists automatically inputs IDs into the sheet.
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
                QR / Barcode Scanner Simulator
              </h3>
              <button
                type="button"
                onClick={() => setShowScanner(false)}
                className="text-slate-450 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="bg-black/40 border border-slate-800 rounded-xl aspect-video relative overflow-hidden mb-4 flex flex-col items-center justify-center text-center p-4">
              <div className="absolute top-0 inset-x-0 h-0.5 bg-teal-400 shadow-md shadow-teal-400/50 animate-bounce" />
            <VideoSimulator onScan={handleSimulatedScan} />
              <p className="text-[11px] text-slate-400 max-w-xs mt-3 relative z-10 font-sans">
                Align standard flight crew barcode/QR sticker inside the viewfinder frame.
              </p>
            </div>

            <div className="space-y-4">
              <span className="text-[10px] font-bold text-slate-400 block pb-1 border-b border-slate-800 uppercase tracking-wide">
                Select barcode payload
              </span>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                {assets.map((asset) => (
                  <button
                    key={asset.id}
                    onClick={() => handleSimulatedScan(asset.id)}
                    className="p-2 border border-slate-800 bg-slate-800/50 hover:bg-slate-850 rounded-xl text-left text-xs text-slate-200 truncate transition-colors cursor-pointer"
                  >
                    🚀 Scan {asset.id} <span className="text-[9px] text-slate-400 font-sans block truncate font-medium">({asset.name})</span>
                  </button>
                ))}
              </div>

              <button
                onClick={() => setShowScanner(false)}
                className="w-full mt-2 p-2 border border-slate-800 text-slate-400 hover:text-white text-xs font-semibold rounded-xl text-center cursor-pointer transition-colors"
              >
                Cancel Stream
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmModal && confirmModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white border border-slate-250 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden animate-scaleIn border-slate-200">
            <div className="p-6 text-center border-b border-slate-100 bg-slate-50">
              <div className="mx-auto w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-3 shadow-3xs">
                <CheckCircle className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-slate-900 font-sans tracking-tight">
                Desk Transaction Verified 🤝
              </h3>
              <p className="text-[11px] text-slate-500 mt-1 font-medium leading-relaxed">
                The device custody transfer has been successfully recorded in the Master Ledger.
              </p>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 font-sans text-xs space-y-2.5">
                <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                  <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Transaction Type</span>
                  <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase flex items-center gap-1 ${
                    confirmModal.type === "Issue" ? "bg-indigo-100 text-indigo-700" :
                    confirmModal.type === "Return" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                  }`}>
                    {confirmModal.type === "Issue" && <ArrowUpRight className="w-2.5 h-2.5" />}
                    {confirmModal.type === "Return" && <ArrowDownLeft className="w-2.5 h-2.5" />}
                    {confirmModal.type === "Handover" && <ArrowLeftRight className="w-2.5 h-2.5" />}
                    {confirmModal.type}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Ledger TXID</span>
                  <span className="font-mono font-bold text-slate-800">{confirmModal.txId}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Device Asset</span>
                  <span className="font-bold text-slate-800 text-right">
                    <span className="font-mono bg-slate-200/60 px-1.5 py-0.5 rounded text-[10px] mr-1">{confirmModal.assetId}</span> 
                    {confirmModal.assetName}
                  </span>
                </div>

                {confirmModal.type !== "Handover" ? (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">{confirmModal.type === "Issue" ? "Custodian Assigned" : "Returning Custodian"}</span>
                    <span className="font-bold text-slate-800">
                      {confirmModal.agentName} <span className="font-mono text-slate-400 text-[9.5px] font-normal">({confirmModal.agentId})</span>
                    </span>
                  </div>
                ) : (
                  <div className="space-y-2 pt-2 border-t border-slate-205">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-[10px] font-semibold uppercase">From Custodian</span>
                      <span className="font-bold text-slate-700">
                        {confirmModal.agentName} <span className="font-mono text-slate-400 text-[9px] font-normal">({confirmModal.agentId})</span>
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-[10px] font-semibold uppercase">To Custodian</span>
                      <span className="font-bold text-indigo-700">
                        {confirmModal.targetAgentName} <span className="font-mono text-indigo-505 text-[9px] font-normal">({confirmModal.targetAgentId})</span>
                      </span>
                    </div>
                  </div>
                )}

                {confirmModal.type === "Return" && confirmModal.durationMinutes !== undefined && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Assigned Custody Duration</span>
                    <span className="font-semibold text-slate-800">
                      {confirmModal.durationMinutes} minutes
                    </span>
                  </div>
                )}

                <div className="flex justify-between items-start pt-2 border-t border-slate-200/60">
                  <span className="text-slate-500 font-medium shrink-0">Transaction Notes</span>
                  <span className="font-semibold text-slate-600 text-right max-w-[200px] italic break-words">
                    {confirmModal.remarks || "No remarks annotated"}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Timestamp</span>
                  <span className="text-slate-650 font-medium text-slate-600">
                    {new Date(confirmModal.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {new Date(confirmModal.timestamp).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-5 bg-slate-50 border-t border-slate-100 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  try {
                    window.print();
                  } catch (e) {
                    console.log(e);
                  }
                }}
                className="flex-1 px-3 py-2 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                id="modal-print-btn"
              >
                <FileText className="w-3.5 h-3.5" />
                Slip
              </button>
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="flex-[2] px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-slate-950/10 cursor-pointer text-center"
                id="modal-accept-btn"
              >
                Acknowledge Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VideoSimulator({ onScan }: { onScan: (id: string) => void }) {
  const [cameraPermissionState, setCameraPermissionState] = useState<"pending" | "granted" | "denied">("pending");
  const [cameraError, setCameraError] = useState<string | null>(null);

  const { ref } = useZxing({
    onDecodeResult(result: any) {
      onScan(result.getText ? result.getText() : result.rawValue);
    },
    onError(error: any) {
      if (
        error.name === "NotAllowedError" ||
        error.name === "NotFoundError" ||
        error.name === "NotReadableError"
      ) {
        setCameraPermissionState("denied");
        setCameraError(error.message || "Permissions blocked or no camera detected.");
      }
    }
  });

  useEffect(() => {
    // There is no explicit "granted" callback in useZxing, but video stream will start.
    // If we have video stream (i.e. ref element has srcObject), we consider it granted.
    const pollDevice = setInterval(() => {
      if (ref.current && ref.current.srcObject) {
        setCameraPermissionState("granted");
        clearInterval(pollDevice);
      }
    }, 500);
    return () => clearInterval(pollDevice);
  }, [ref]);

  return (
    <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-slate-950">
      <video ref={ref} className="w-full h-full object-cover" muted playsInline />
      
      {cameraPermissionState === "pending" && (
        <div className="flex flex-col items-center opacity-75 p-4 text-center z-10 absolute inset-0 justify-center pointer-events-none">
          <div className="w-8 h-8 border-3 border-teal-500 border-t-transparent rounded-full animate-spin mb-3" />
          <span className="font-mono text-[9px] tracking-widest text-[#2dd4bf] font-bold">
            CONNECTING SHIFT SCAN CAMERA...
          </span>
          <span className="text-[9px] text-slate-500 mt-1 font-semibold">Please authorize web devices permissions</span>
        </div>
      )}

      {cameraPermissionState === "denied" && (
        <div className="flex flex-col items-center p-4 text-center max-w-xs z-10 space-y-2 absolute inset-0 justify-center">
          <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-full mb-1">
            <Camera className="w-6 h-6 shrink-0" />
          </div>
          <span className="font-bold text-[11px] text-rose-400 uppercase tracking-wider block">
            Camera Initialization Failed
          </span>
          <p className="text-[10px] text-slate-400 leading-relaxed max-h-16 overflow-y-auto w-full break-words">
            {cameraError}
          </p>
          <div className="mt-2 text-[8.5px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono select-all w-full break-all">
            Check local site settings or check secure domain contexts (https)
          </div>
        </div>
      )}

      {cameraPermissionState === "granted" && (
        /* Green viewfinder square center border */
        <div className="absolute inset-8 border border-dashed border-teal-400/40 rounded flex items-center justify-center pointer-events-none z-10">
          <span className="text-[9px] bg-black/60 text-teal-400 px-1.5 py-0.5 border border-teal-500/20 rounded font-mono uppercase tracking-widest leading-none font-black animate-pulse">
            [ LIVE SCANNING VIEWPORT ]
          </span>
        </div>
      )}
    </div>
  );
}
