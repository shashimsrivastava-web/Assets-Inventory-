import React, { useState, useEffect } from "react";
import { Asset, Agent, Transaction, AssetStatus } from "../types";
import { ArrowUpRight, ArrowDownLeft, Calendar, FileText, Clock, HelpCircle, CheckCircle, AlertTriangle, Play, Smartphone, BookOpen, Camera, Search, User, Clipboard, Sliders, ArrowLeftRight } from "lucide-react";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
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
    <div id="issue-return-control" className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col">
      
      {/* Selected Agent Header Search Panel */}
      <div className="bg-slate-50 border-b border-slate-200 p-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex-1 w-full">
          <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1.5 tracking-wider font-sans">
            1. Select ACTIVE SHIFT AGENT *
          </label>
          <div className="flex gap-2 w-full">
            <select
              value={selectedAgentId}
              onChange={(e) => handleSelectAgent(e.target.value)}
              className="flex-1 px-4 py-2.5 border border-slate-200 bg-white rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold text-slate-800 cursor-pointer"
            >
              <option value="">-- Click here to select Agent --</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} ({agent.id}) - {agent.department || "Operations"}
                </option>
              ))}
            </select>
            {selectedAgentId && (
              <button
                type="button"
                onClick={() => setSelectedAgentId("")}
                className="px-3 text-xs border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all cursor-pointer font-semibold"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {currentAgent && (
          <div className="bg-white border border-indigo-100 rounded-xl px-4 py-2.5 min-w-[240px] text-left sm:text-right shadow-3xs">
            <h5 className="text-xs font-bold text-slate-900">{currentAgent.name}</h5>
            <p className="text-[10px] text-slate-500 font-medium">{currentAgent.id} · {currentAgent.department || "Operations"}</p>
            <div className="mt-1 flex items-center justify-start sm:justify-end gap-1.5 text-[10px] text-indigo-650 font-bold text-indigo-600">
              <Smartphone className="w-3.5 h-3.5" />
              {agentHeldAssets.length === 0 ? "Holds No Devices Currently" : `Currently holds ${agentHeldAssets.length} Device(s)`}
            </div>
          </div>
        )}
      </div>

      {/* Top Slider Navigation Tabs */}
      <div className="flex border-b border-slate-200 bg-slate-50/20 font-semibold p-1">
        <button
          id="tab-select-issue"
          onClick={() => setActiveTab("issue")}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs sm:text-sm tracking-wide transition-all cursor-pointer ${
            activeTab === "issue"
              ? "bg-white text-slate-950 shadow-sm border border-slate-200 font-bold"
              : "text-slate-500 hover:text-slate-900 hover:bg-slate-100/50"
          }`}
        >
          <ArrowUpRight className="w-4 h-4 text-emerald-500" />
          Issue Device
        </button>

        <button
          id="tab-select-return"
          disabled={!selectedAgentId || agentHeldAssets.length === 0}
          onClick={() => {
            if (selectedAgentId && agentHeldAssets.length > 0) {
              setActiveTab("return");
            }
          }}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs sm:text-sm tracking-wide transition-all ${
            (!selectedAgentId || agentHeldAssets.length === 0)
              ? "opacity-45 cursor-not-allowed text-slate-400"
              : activeTab === "return"
              ? "bg-white text-indigo-600 shadow-sm border border-slate-200 font-bold cursor-pointer"
              : "text-slate-500 hover:text-indigo-600 hover:bg-slate-100/50 cursor-pointer"
          }`}
          title={(!selectedAgentId || agentHeldAssets.length === 0) ? "Return options are only available when the selected agent holds active devices." : ""}
        >
          <ArrowDownLeft className="w-4 h-4 text-indigo-500" />
          Return {agentHeldAssets.length > 0 && `(${agentHeldAssets.length})`}
        </button>

        <button
          id="tab-select-handover"
          disabled={!selectedAgentId || agentHeldAssets.length === 0}
          onClick={() => {
            if (selectedAgentId && agentHeldAssets.length > 0) {
              setActiveTab("handover");
            }
          }}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs sm:text-sm tracking-wide transition-all ${
            (!selectedAgentId || agentHeldAssets.length === 0)
              ? "opacity-45 cursor-not-allowed text-slate-400"
              : activeTab === "handover"
              ? "bg-white text-amber-500 shadow-sm border border-slate-200 font-bold cursor-pointer"
              : "text-slate-500 hover:text-amber-500 hover:bg-slate-100/50 cursor-pointer"
          }`}
          title={(!selectedAgentId || agentHeldAssets.length === 0) ? "Handover options are only available when the selected agent holds active devices." : ""}
        >
          <ArrowLeftRight className="w-4 h-4 text-amber-500" />
          Handover {agentHeldAssets.length > 0 && `(${agentHeldAssets.length})`}
        </button>
      </div>

      <div className="p-6 flex-1 flex flex-col lg:flex-row gap-6">
        {/* Left Side: Submission Forms */}
        <div className="flex-1">
          {!selectedAgentId ? (
            <div className="flex flex-col items-center justify-center text-center p-12 bg-slate-50/25 border border-dashed border-slate-200 rounded-2xl min-h-[300px]">
              <div className="w-12 h-12 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-center text-indigo-500 mb-4">
                <User className="w-6 h-6 shrink-0" />
              </div>
              <h4 className="text-sm font-bold text-slate-800">Operational Desk Locked</h4>
              <p className="text-xs text-slate-500 mt-1.5 max-w-sm leading-relaxed">
                Please select an active Lufthansa agent in the header bar or roster list to enable device <strong>Issue</strong>, <strong>Return</strong>, or <strong>Handover</strong> capabilities.
              </p>
              <div className="mt-4 flex gap-1.5 flex-wrap justify-center">
                {agents.slice(0, 4).map(ag => (
                  <button 
                    key={ag.id}
                    onClick={() => handleSelectAgent(ag.id)}
                    className="p-1 px-2 text-[10px] bg-slate-50 border border-slate-200 hover:bg-white hover:border-slate-350 hover:text-slate-900 rounded-lg font-medium text-slate-600 transition"
                  >
                    Select {ag.name.split(" ")[0]}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {activeTab === "issue" && (
                <form onSubmit={handleIssueSubmit} className="space-y-4 animate-fadeIn">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Asset Handover Form (Issue)</span>
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
                      <select
                        value={issueAssetId}
                        onChange={(e) => setIssueAssetId(e.target.value)}
                        className="flex-1 px-3.5 py-2.5 border border-slate-200 bg-white rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all font-semibold font-mono text-slate-800 cursor-pointer"
                        required
                        id="issue-asset-select"
                      >
                        <option value="">-- Click here to select available device --</option>
                        {availableAssetsForIssue.map((asset) => (
                          <option key={asset.id} value={asset.id}>
                            {asset.id} - {asset.name} ({asset.type})
                          </option>
                        ))}
                      </select>
                      {issueAssetId && (
                        <button
                          type="button"
                          onClick={() => setIssueAssetId("")}
                          className="px-3 text-xs border border-slate-200 text-slate-500 hover:text-slate-850 hover:bg-slate-50 rounded-xl transition-all font-semibold"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">Operational Shift</label>
                      <select
                        value={issueShift}
                        onChange={(e) => setIssueShift(e.target.value)}
                        className="w-full px-3.5 py-2.5 border border-slate-200 bg-white rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all font-medium text-slate-705 cursor-pointer"
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
                      <div className="w-full px-3.5 py-2.5 border border-slate-100 bg-slate-50 text-slate-450 rounded-xl text-xs font-mono select-none flex items-center gap-2">
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
                      rows={2.5}
                      className="w-full px-3.5 py-2.5 border border-slate-200 bg-slate-50/20 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:bg-white transition-all text-slate-800"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 text-white bg-slate-900 hover:bg-slate-800 font-bold rounded-xl text-xs sm:text-sm tracking-wide transition shadow-sm cursor-pointer"
                  >
                    Confirm Issue Verification 🟢
                  </button>
                </form>
              )}

              {activeTab === "return" && (
                <form onSubmit={handleReturnSubmit} className="space-y-4 animate-fadeIn">
                  <div>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Asset Return Form (Rollback)</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Choose Device held by {currentAgent?.name} *</label>
                    <select
                      value={returnAssetId}
                      onChange={(e) => setReturnAssetId(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-slate-200 bg-white rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all font-semibold font-mono text-slate-800 cursor-pointer"
                      required
                    >
                      <option value="">-- Click here to choose device --</option>
                      {agentHeldAssets.map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {asset.id} - {asset.name} ({asset.type})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">Returning State</label>
                      <select
                        value={returnStatus}
                        onChange={(e) => setReturnStatus(e.target.value as any)}
                        className="w-full px-3.5 py-2.5 border border-slate-200 bg-white rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all font-medium text-slate-700 cursor-pointer"
                      >
                        <option value="In Office">Returned (In Office)</option>
                        <option value="Missing / Not Returned">Missing / Lost Device</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">Auto Return Time</label>
                      <div className="w-full px-3.5 py-2.5 border border-slate-100 bg-slate-50 text-slate-450 rounded-xl text-xs font-mono select-none flex items-center gap-2">
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
                      rows={2.5}
                      className="w-full px-3.5 py-2.5 border border-slate-200 bg-slate-50/20 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:bg-white transition-all text-slate-800"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 text-white bg-indigo-600 hover:bg-indigo-700 font-bold rounded-xl text-xs sm:text-sm tracking-wide shadow-sm transition cursor-pointer"
                  >
                    Log Return Rollback 🔵
                  </button>
                </form>
              )}

              {activeTab === "handover" && (
                <form onSubmit={handleHandoverSubmit} className="space-y-4 animate-fadeIn">
                  <div>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Asset Direct Handover Form</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Choose Device held by {currentAgent?.name} *</label>
                    <select
                      value={handoverAssetId}
                      onChange={(e) => setHandoverAssetId(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-slate-200 bg-white rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all font-semibold font-mono text-slate-800 cursor-pointer"
                      required
                    >
                      <option value="">-- Click here to choose device --</option>
                      {agentHeldAssets.map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {asset.id} - {asset.name} ({asset.type})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Direct Recipient (To Agent) *</label>
                    <select
                      value={handoverToAgentId}
                      onChange={(e) => setHandoverToAgentId(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-slate-200 bg-white rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all font-semibold text-slate-800 cursor-pointer"
                      required
                    >
                      <option value="">-- Choose Recipient Agent --</option>
                      {agents
                        .filter((a) => a.id.toUpperCase() !== selectedAgentId.toUpperCase())
                        .map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name} ({agent.id}) - {agent.department || "Operations"}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Handover Remarks / Notes</label>
                    <textarea
                      value={handoverRemarks}
                      onChange={(e) => setHandoverRemarks(e.target.value)}
                      placeholder="Describe physical hand-held transition note or special task state if any (optional)"
                      rows={2.5}
                      className="w-full px-3.5 py-2.5 border border-slate-200 bg-slate-50/20 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:bg-white transition-all text-slate-800"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 text-white bg-amber-600 hover:bg-amber-700 font-bold rounded-xl text-xs sm:text-sm tracking-wide shadow-sm transition cursor-pointer"
                  >
                    Process Supervisor Direct Handover 🤝
                  </button>
                </form>
              )}
            </>
          )}
        </div>

        {/* Right Side: Quick Selection Helpers */}
        <div className="w-full lg:w-72 bg-slate-50/50 rounded-2xl p-5 border border-slate-200 flex flex-col justify-between">
          <div>
            <h4 className="font-bold text-slate-850 text-xs flex items-center gap-1.5 pb-2.5 border-b border-slate-200 mb-4 text-slate-800">
              <Sliders className="w-3.5 h-3.5 text-slate-550" />
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
                      {availableAssetsForIssue.slice(0, 12).map((asset) => (
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
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-wider">Enrolled Agents Roster ({agents.length})</span>
                  {agents.length === 0 ? (
                    <span className="text-[10px] text-slate-400 italic block py-2">No active agents.</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                      {agents.slice(0, 16).map((agent) => (
                        <button
                          key={agent.id}
                          type="button"
                          onClick={() => handleSelectAgent(agent.id)}
                          className={`px-2 py-1 border rounded-lg text-[10px] font-semibold active:scale-95 transition-all cursor-pointer ${
                            selectedAgentId.toUpperCase() === agent.id.toUpperCase()
                              ? "bg-indigo-600 text-white border-indigo-650"
                              : "bg-white hover:bg-indigo-50/55 text-slate-700 border-slate-200"
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
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-3 tracking-wider font-sans">
                    {currentAgent ? `${currentAgent.name}'s held items` : "Agent held items"} ({agentHeldAssets.length})
                  </span>
                  {agentHeldAssets.length === 0 ? (
                    <span className="text-[10px] text-slate-400 italic block py-2 bg-slate-100/50 rounded-lg p-2.5 border border-dashed border-slate-200 text-center">
                      No active device placements to display.
                    </span>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
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
                          className={`px-2.5 py-1.5 border rounded-lg text-[10px] font-mono font-bold active:scale-95 transition-all text-left flex justify-between items-center w-full cursor-pointer ${
                            (activeTab === "return" ? returnAssetId : handoverAssetId) === asset.id
                              ? "bg-indigo-100 border-indigo-300 text-indigo-750"
                              : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200"
                          }`}
                        >
                          <span>{asset.id} - {asset.name}</span>
                          <span className="text-[9px] text-slate-400 font-sans font-medium">{asset.status === AssetStatus.MISSING ? "⚠️ Lost" : "Held"}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="mt-5 pt-3 border-t border-slate-200 bg-white/40 rounded-xl p-2.5 text-[10px] text-slate-500 flex items-start gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              You can click any enrolled agent from the right side panel to seamlessly bind them as active inside this desk transaction sheet.
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
              <VideoSimulator />
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

function VideoSimulator() {
  return (
    <div className="flex flex-col items-center opacity-60">
      <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-2" />
      <span className="font-mono text-[10px] tracking-widest text-[#2dd4bf]">CONNECTING SHIFT SCAN CAMERA...</span>
    </div>
  );
}
