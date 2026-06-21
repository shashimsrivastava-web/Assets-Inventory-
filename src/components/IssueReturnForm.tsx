import React, { useState, useEffect, useRef, useMemo } from "react";
import { Asset, Agent, Transaction, AssetStatus } from "../types";
import { ArrowUpRight, ArrowDownLeft, Calendar, FileText, Clock, HelpCircle, CheckCircle, AlertTriangle, Play, Smartphone, BookOpen, Camera, Search, User, Clipboard, Sliders, ArrowLeftRight } from "lucide-react";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

import { db, assetsCol, transactionsCol } from "../firebase";
import { HOURLY_SHIFTS } from "../utils/shiftConfig";
import { sortDeviceTypes } from "../utils/deviceTypeSort";

interface IssueReturnFormProps {
  assets: Asset[];
  agents: Agent[];
  transactions: Transaction[];
  role: "Admin" | "Supervisor";
  activeShift: string;
  onRefresh: () => void;
  onAddAlert: (type: "overdue" | "missing" | "duplicate_issue" | "already_returned" | "system", title: string, message: string, assetId?: string) => void;
  initialTab?: "issue" | "return" | "handover";
}

export default function IssueReturnForm({ assets, agents, transactions, role, activeShift, onRefresh, onAddAlert, initialTab }: IssueReturnFormProps) {
  const [activeTab, setActiveTab] = useState<"issue" | "return" | "handover">("issue");

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Main operational agent selection
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [agentSearchQuery, setAgentSearchQuery] = useState("");

  // Form states - Issue
  const [selectedDeviceType, setSelectedDeviceType] = useState<string>("All");
  const [issueAssetId, setIssueAssetId] = useState("");
  const [issueRemarks, setIssueRemarks] = useState("");
  const [issueShift, setIssueShift] = useState(activeShift);
  const [issueAssetSearchQuery, setIssueAssetSearchQuery] = useState("");
  const [issueEmployeeSearchQuery, setIssueEmployeeSearchQuery] = useState("");
  const [handoverDeviceType, setHandoverDeviceType] = useState<string>("All");

  // Form states - Return
  const [returnAssetId, setReturnAssetId] = useState("");
  const [returnRemarks, setReturnRemarks] = useState("");
  const [returnStatus, setReturnStatus] = useState<"In Office" | "Missing / Not Returned">("In Office");

  // Form states - Handover
  const [handoverAssetId, setHandoverAssetId] = useState("");
  const [handoverToAgentId, setHandoverToAgentId] = useState("");
  const [handoverRemarks, setHandoverRemarks] = useState("");
  const [recipientSearchQuery, setRecipientSearchQuery] = useState("");

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

  const selectBaseClass = "bg-[#05162E] text-white border-2 border-transparent rounded-xl text-sm md:text-base font-bold shadow-[0_4px_10px_rgba(0,0,0,0.3)] hover:border-[#0066FF] hover:shadow-[0_0_15px_rgba(0,102,255,0.4)] focus:outline-none focus:border-[#0066FF] focus:ring-4 focus:ring-[#0066FF]/40 transition-all duration-300 cursor-pointer appearance-none outline-none";
  const selectStyle = {
    backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23ffffff' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
    backgroundPosition: 'right 1rem center',
    backgroundRepeat: 'no-repeat',
    backgroundSize: '1.5em 1.5em',
    WebkitAppearance: 'none' as const,
    appearance: 'none' as const,
    paddingRight: '2.5rem'
  };
  const optionClass = "bg-[#05162E] text-white hover:bg-[#FFC72C] hover:text-[#05162E] font-medium";

  // Populate form with current shift when shift updates
  useEffect(() => {
    setIssueShift(activeShift);
  }, [activeShift]);

  // Find currently selected agent details
  const currentAgent = agents.find(
    (a) => a.id.toUpperCase() === selectedAgentId.toUpperCase().trim()
  );

  // Compute assets currently held by the selected agent, sorted alphabetically by ID
  const agentHeldAssets = useMemo(() => {
    if (!currentAgent) return [];
    return assets
      .filter(
        (a) =>
          a.status === AssetStatus.ISSUED &&
          a.currentAssignmentId &&
          transactions.find((tx) => tx.id === a.currentAssignmentId)?.employeeId.toUpperCase() === currentAgent.id.toUpperCase()
      )
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [currentAgent, assets, transactions]);

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

  const availableAssetsForIssue = assets.filter((a) => a.status !== AssetStatus.ISSUED && a.status !== AssetStatus.MISSING);

  const deviceTypes = useMemo(() => {
    const types = new Set<string>();
    availableAssetsForIssue.forEach(a => types.add(a.type));
    return ["All", ...sortDeviceTypes(Array.from(types))];
  }, [availableAssetsForIssue]);

  const filteredAssetsForIssue = useMemo(() => {
    const list = selectedDeviceType === "All" ? availableAssetsForIssue : availableAssetsForIssue.filter(a => a.type === selectedDeviceType);
    return list.sort((a, b) => a.id.localeCompare(b.id));
  }, [availableAssetsForIssue, selectedDeviceType]);

  const searchedAssetsForIssue = useMemo(() => {
    return filteredAssetsForIssue
      .filter(a => 
        a.id.toLowerCase().includes(issueAssetSearchQuery.toLowerCase()) || 
        a.name.toLowerCase().includes(issueAssetSearchQuery.toLowerCase())
      );
  }, [filteredAssetsForIssue, issueAssetSearchQuery]);

  const activeShiftAgents = useMemo(() => {
    const agentsWithDevices = agents.filter(agent => {
      return assets.some(a => 
        a.status === AssetStatus.ISSUED &&
        transactions.find(tx => tx.id === a.currentAssignmentId)?.employeeId === agent.id
      );
    });
    return agentsWithDevices.sort((a, b) => a.name.localeCompare(b.name));
  }, [agents, assets, transactions]);

  const displayedAgents = useMemo(() => {
    return activeShiftAgents.filter(a => a.name.toLowerCase().includes(agentSearchQuery.toLowerCase()));
  }, [activeShiftAgents, agentSearchQuery]);

  const filteredRecipientAgents = useMemo(() => {
    return agents
      .filter((a) => a.id.toUpperCase() !== selectedAgentId.toUpperCase())
      .filter((a) => a.name.toLowerCase().includes(recipientSearchQuery.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [agents, selectedAgentId, recipientSearchQuery]);

  const filteredEmployeesForIssue = useMemo(() => {
    return [...agents]
      .filter((agent) =>
        agent.name.toLowerCase().includes(issueEmployeeSearchQuery.toLowerCase()) ||
        agent.id.toLowerCase().includes(issueEmployeeSearchQuery.toLowerCase())
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [agents, issueEmployeeSearchQuery]);

  const handoverDeviceTypes = useMemo(() => {
    const types = new Set<string>();
    agentHeldAssets.forEach(a => types.add(a.type));
    return ["All", ...sortDeviceTypes(Array.from(types))];
  }, [agentHeldAssets]);

  const filteredHandoverAssets = useMemo(() => {
    if (handoverDeviceType === "All") {
      return agentHeldAssets;
    }
    return agentHeldAssets.filter((a) => a.type === handoverDeviceType);
  }, [agentHeldAssets, handoverDeviceType]);

  return (
    <div id="issue-return-control" className="bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 rounded-3xl overflow-hidden shadow-[0_20px_50px_rgba(236,72,153,0.3)] flex flex-col p-1 sm:p-2 transition-all duration-500 hover:shadow-[0_20px_60px_rgba(236,72,153,0.5)]">
      <div className="bg-white/95 backdrop-blur-3xl rounded-[1.5rem] overflow-hidden flex flex-col shadow-inner w-full flex-1">
      {/* Selected Agent Header Search Panel - Premium Dark Slate Indigo Design */}
      <div className="bg-transparent text-slate-900 border-b border-indigo-900/10 p-4 sm:p-6 flex flex-col md:flex-row gap-4 items-stretch md:items-start justify-between">
        <div className="flex-1 min-w-0">
          <label className="block text-[11px] uppercase font-bold text-pink-600 mb-2 tracking-widest font-sans flex items-center gap-1.5 drop-shadow-sm">
            <span className="w-2 h-2 rounded-full bg-pink-500 shadow-[0_0_8px_rgba(236,72,153,0.8)] animate-pulse inline-block" />
            1. Select ACTIVE SHIFT AGENT *
          </label>
          <div className="flex flex-col gap-2 w-full">
            <div className="relative w-full md:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search agent name..."
                value={agentSearchQuery}
                onChange={(e) => setAgentSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 h-10 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500 transition-all shadow-sm"
              />
            </div>
            <div className="flex gap-2 w-full">
              <select
                value={selectedAgentId}
                onChange={(e) => handleSelectAgent(e.target.value)}
                className={`flex-1 h-12 ${selectBaseClass}`}
                style={selectStyle}
              >
                <option value="" className={optionClass}>-- Click here to select Active Agent --</option>
                {displayedAgents.map((agent) => (
                  <option key={agent.id} value={agent.id} className={optionClass}>
                    👤 {agent.name} ({agent.id}) - {agent.department || "Operations"}
                   </option>
                ))}
              </select>
              {selectedAgentId && (
                <button
                  type="button"
                  onClick={() => setSelectedAgentId("")}
                  className="px-6 text-sm font-extrabold bg-gradient-to-r from-pink-500 to-rose-400 hover:from-rose-400 hover:to-pink-500 text-white rounded-2xl transition-all duration-300 hover:scale-105 hover:shadow-[0_0_15px_rgba(244,63,94,0.5)] cursor-pointer h-12 flex items-center justify-center shrink-0 shadow-md border-0"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {currentAgent && (
          <div className="bg-gradient-to-br from-purple-100 to-pink-50 border-2 border-pink-200 rounded-2xl p-4 min-w-[260px] text-left md:text-right shrink-0 shadow-lg relative overflow-hidden flex flex-col justify-center transition-all duration-300 hover:shadow-[0_0_20px_rgba(236,72,153,0.3)] hover:scale-105">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-pink-300 to-purple-300 rounded-full blur-2xl -mr-10 -mt-10 opacity-50 pointer-events-none" />
            <h5 className="text-sm font-extrabold tracking-tight text-purple-900 flex items-center gap-2 md:justify-end">
              <span className="w-2 h-2 rounded-full bg-pink-500 shadow-[0_0_8px_rgba(236,72,153,0.8)] animate-pulse" />
              {currentAgent.name}
            </h5>
            <p className="text-[11px] text-purple-700 font-bold mt-1 uppercase tracking-wider">{currentAgent.id} · {currentAgent.department || "Operations"}</p>
            <div className="mt-3 flex items-center justify-start md:justify-end gap-1.5 text-xs text-pink-700 font-black tracking-wide">
              <Smartphone className="w-4 h-4 text-pink-600 drop-shadow-sm" />
              {agentHeldAssets.length === 0 ? (
                <span className="text-slate-500 font-bold">No Devices Checked Out</span>
              ) : (
                <span className="bg-gradient-to-r from-pink-500 to-purple-600 text-white px-2.5 py-1 rounded-xl shadow-md border border-pink-400">
                  Holds {agentHeldAssets.length} Active Device{agentHeldAssets.length > 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Top Slider Navigation Tabs - responsive layout grid */}
      <div className="grid grid-cols-3 gap-2 p-3 bg-purple-50/50 border-b border-purple-100 font-bold">
        <button
          id="tab-select-issue"
          onClick={() => setActiveTab("issue")}
          className={`group flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2.5 py-4 rounded-2xl text-xs sm:text-sm tracking-wide transition-all duration-300 cursor-pointer ${
            activeTab === "issue"
              ? "bg-gradient-to-r from-emerald-400 to-teal-500 text-white shadow-[0_10px_20px_rgba(52,211,153,0.4)] scale-[1.02] border-0"
              : "bg-white text-slate-500 hover:text-emerald-500 shadow-sm hover:shadow-md border border-slate-100"
          }`}
        >
          <ArrowUpRight className={`w-5 h-5 transition-transform duration-300 ${activeTab === "issue" ? "text-white" : "text-emerald-400 group-hover:-translate-y-1 group-hover:translate-x-1"}`} />
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
          className={`group flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2.5 py-4 rounded-2xl text-xs sm:text-sm tracking-wide transition-all duration-300 ${
            (!selectedAgentId || agentHeldAssets.length === 0)
              ? "opacity-50 cursor-not-allowed bg-slate-100/50 text-slate-400 border border-slate-200"
              : activeTab === "return"
              ? "bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-[0_10px_20px_rgba(99,102,241,0.4)] scale-[1.02] border-0 cursor-pointer"
              : "bg-white text-slate-500 hover:text-indigo-500 shadow-sm hover:shadow-md border border-slate-100 cursor-pointer"
          }`}
          title={(!selectedAgentId || agentHeldAssets.length === 0) ? "Return options are only available when the selected agent holds active devices." : ""}
        >
          <ArrowDownLeft className={`w-5 h-5 transition-transform duration-300 ${activeTab === "return" ? "text-white" : "text-indigo-400 group-hover:translate-y-1 group-hover:-translate-x-1"}`} />
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
          className={`group flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2.5 py-4 rounded-2xl text-xs sm:text-sm tracking-wide transition-all duration-300 ${
            (!selectedAgentId || agentHeldAssets.length === 0)
              ? "opacity-50 cursor-not-allowed bg-slate-100/50 text-slate-400 border border-slate-200"
              : activeTab === "handover"
              ? "bg-gradient-to-r from-orange-400 to-rose-400 text-white shadow-[0_10px_20px_rgba(249,115,22,0.4)] scale-[1.02] border-0 cursor-pointer"
              : "bg-white text-slate-500 hover:text-orange-500 shadow-sm hover:shadow-md border border-slate-100 cursor-pointer"
          }`}
          title={(!selectedAgentId || agentHeldAssets.length === 0) ? "Handover options are only available when the selected agent holds active devices." : ""}
        >
          <ArrowLeftRight className={`w-5 h-5 transition-transform duration-300 ${activeTab === "handover" ? "text-white" : "text-orange-400 group-hover:scale-110"}`} />
          <span className="text-center font-bold">Handover {agentHeldAssets.length > 0 && `(${agentHeldAssets.length})`}</span>
        </button>
      </div>

      <div className="p-4 sm:p-6 flex-1 flex flex-col lg:flex-row gap-6 bg-white/50">
        {/* Left Side: Submission Forms */}
        <div className="flex-1 min-w-0">
          {!selectedAgentId && activeTab !== "issue" ? (
            <div className="flex flex-col items-center justify-center text-center p-6 sm:p-12 bg-indigo-50/25 border-2 border-dashed border-indigo-150 rounded-2xl min-h-[340px] animate-fadeIn">
              <div className="w-14 h-14 bg-indigo-100 border border-indigo-200 rounded-3xl flex items-center justify-center text-indigo-600 mb-4 shadow-sm">
                <User className="w-7 h-7 shrink-0" />
              </div>
              <h4 className="text-base font-extrabold text-slate-900 tracking-tight">Supervisor Desk Active</h4>
              <p className="text-xs sm:text-sm text-slate-600 mt-2 max-w-sm leading-relaxed font-semibold">
                To issue, return, or transfer terminal scanners and passenger devices, first assign the active <strong className="text-indigo-600">Lufthansa Staff Crew Member</strong>.
              </p>
            </div>
          ) : (
            <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] p-4 sm:p-6 border border-pink-100 shadow-[0_10px_30px_rgba(236,72,153,0.1)] transition-all">
              {activeTab === "issue" && (
                <form onSubmit={handleIssueSubmit} className="space-y-4 animate-fadeIn">
                  <div className="flex items-center justify-between pb-3 border-b border-pink-100">
                    <span className="text-xs font-bold text-teal-800 uppercase tracking-widest flex items-center gap-1.5 bg-teal-50 px-3 py-1.5 rounded-xl border border-teal-200 shadow-sm">
                      <span className="w-2 h-2 rounded-full bg-teal-500 shadow-[0_0_5px_rgba(20,184,166,0.8)]" />
                      Issue Device Form
                    </span>
                  </div>

                  {/* Choose Employee Section */}
                  <div className="bg-slate-50 p-4 sm:p-5 rounded-2xl border border-dashed border-slate-200 space-y-3">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Lufthansa Crew Member (Sorted Alphabetically) *
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Type to search staff roster..."
                          value={issueEmployeeSearchQuery}
                          onChange={(e) => setIssueEmployeeSearchQuery(e.target.value)}
                          className="w-full pl-9 pr-3 h-11 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all text-slate-800 font-medium animate-fadeIn"
                        />
                      </div>
                      <select
                        value={selectedAgentId}
                        onChange={(e) => handleSelectAgent(e.target.value)}
                        className={`w-full h-11 ${selectBaseClass}`}
                        style={selectStyle}
                        required
                      >
                        <option value="" className={optionClass}>-- Choose Employee --</option>
                        {filteredEmployeesForIssue.map((agent) => (
                          <option key={agent.id} value={agent.id} className={optionClass}>
                            👤 {agent.name} ({agent.id}) - {agent.department || "Operations"}
                          </option>
                        ))}
                      </select>
                    </div>
                    {currentAgent && (
                      <div className="flex items-center gap-2 text-xs text-emerald-800 font-semibold bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-1.5 mt-2 animate-fadeIn">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.8)] animate-pulse" />
                        Active Selection: <strong>{currentAgent.name} ({currentAgent.id})</strong> is active for operational issue.
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                    <div className="flex flex-col justify-end h-full">
                      <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">Filter by Device Type</label>
                      <select
                        value={selectedDeviceType}
                        onChange={(e) => {
                          setSelectedDeviceType(e.target.value);
                          setIssueAssetId("");
                        }}
                        className={`w-full h-12 ${selectBaseClass}`}
                        style={selectStyle}
                      >
                        {deviceTypes.map(type => (
                          <option key={type} value={type} className={optionClass}>{type}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col justify-end h-full">
                      <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">Device Asset ID *</label>
                      <div className="flex flex-col gap-2 w-full">
                        <div className="relative w-full">
                          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            placeholder="Search device ID or name..."
                            value={issueAssetSearchQuery}
                            onChange={(e) => setIssueAssetSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-3 h-10 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500 transition-all shadow-sm text-slate-800"
                          />
                        </div>
                        <div className="flex gap-2">
                          <select
                            value={issueAssetId}
                            onChange={(e) => setIssueAssetId(e.target.value)}
                            className={`flex-1 h-12 ${selectBaseClass} font-mono`}
                            style={selectStyle}
                            required
                            id="issue-asset-select"
                          >
                            <option value="" className={optionClass}>-- Choose available device --</option>
                            {searchedAssetsForIssue.map((asset) => (
                              <option key={asset.id} value={asset.id} className={optionClass}>
                                [{asset.id}] - {asset.name} ({asset.type})
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
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                    <div className="flex flex-col justify-end h-full">
                      <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">Operational Shift *</label>
                      <select
                        value={issueShift}
                        onChange={(e) => setIssueShift(e.target.value)}
                        className={`w-full h-12 ${selectBaseClass}`}
                        style={selectStyle}
                      >
                        {HOURLY_SHIFTS.map((shift) => (
                          <option key={shift.value} value={shift.value} className={optionClass}>
                            {shift.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col justify-end h-full">
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
                    className="w-full h-14 mt-4 text-white bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-teal-400 hover:to-emerald-400 font-extrabold rounded-2xl text-xs sm:text-sm tracking-wide transition-all duration-300 shadow-[0_10px_20px_rgba(52,211,153,0.3)] hover:shadow-[0_15px_30px_rgba(52,211,153,0.5)] hover:scale-105 cursor-pointer flex items-center justify-center gap-2 border-0"
                  >
                    <span>Confirm Issue Verification</span>
                    <span className="text-emerald-100 text-lg">🟢</span>
                  </button>
                </form>
              )}

              {activeTab === "return" && (
                <form onSubmit={handleReturnSubmit} className="space-y-4 animate-fadeIn">
                  <div className="pb-3 border-b border-pink-100">
                    <span className="text-xs font-bold text-indigo-800 uppercase tracking-widest flex items-center gap-1.5 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-200 w-fit shadow-sm">
                      <span className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_5px_rgba(99,102,241,0.8)]" />
                      Asset Return Form
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">Choose Device held by {currentAgent?.name} *</label>
                    <select
                      value={returnAssetId}
                      onChange={(e) => setReturnAssetId(e.target.value)}
                      className={`w-full h-12 ${selectBaseClass} font-mono`}
                      style={selectStyle}
                      required
                    >
                      <option value="" className={optionClass}>-- Choose returning device --</option>
                      {agentHeldAssets.map((asset) => (
                        <option key={asset.id} value={asset.id} className={optionClass}>
                          [{asset.id}] - {asset.name} ({asset.type})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                    <div className="flex flex-col justify-end h-full">
                      <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">Returning Placement State *</label>
                      <select
                        value={returnStatus}
                        onChange={(e) => setReturnStatus(e.target.value as any)}
                        className={`w-full h-12 ${selectBaseClass}`}
                        style={selectStyle}
                      >
                        <option value="In Office" className={optionClass}>Returned (Safe In Office)</option>
                        <option value="Missing / Not Returned" className={optionClass}>⚠️ Missing / Lost Device</option>
                      </select>
                    </div>
                    <div className="flex flex-col justify-end h-full">
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
                    className="w-full h-14 mt-4 text-white bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-purple-500 hover:to-indigo-500 font-extrabold rounded-2xl text-sm sm:text-base tracking-wide transition-all duration-300 shadow-[0_10px_20px_rgba(99,102,241,0.3)] hover:shadow-[0_15px_30px_rgba(99,102,241,0.5)] hover:scale-105 cursor-pointer flex items-center justify-center gap-2 border-0"
                  >
                    <span>Log Return Custody Registry</span>
                    <span className="text-indigo-100 text-lg">🔵</span>
                  </button>
                </form>
              )}

              {activeTab === "handover" && (
                <form onSubmit={handleHandoverSubmit} className="space-y-4 animate-fadeIn">
                  <div className="pb-3 border-b border-pink-100">
                    <span className="text-xs font-bold text-orange-850 uppercase tracking-widest flex items-center gap-1.5 bg-orange-50 px-3 py-1.5 rounded-xl border border-orange-200 w-fit shadow-sm text-orange-800">
                      <span className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_5px_rgba(249,115,22,0.8)]" />
                      Asset Direct Handover Form
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                    <div className="flex flex-col justify-end h-full">
                      <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">Filter Handover Devices by Type</label>
                      <select
                        value={handoverDeviceType}
                        onChange={(e) => {
                          setHandoverDeviceType(e.target.value);
                          setHandoverAssetId("");
                        }}
                        className={`w-full h-12 ${selectBaseClass}`}
                        style={selectStyle}
                      >
                        {handoverDeviceTypes.map(type => (
                          <option key={type} value={type} className={optionClass}>{type}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col justify-end h-full">
                      <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">Choose Device held by {currentAgent?.name} *</label>
                      <select
                        value={handoverAssetId}
                        onChange={(e) => setHandoverAssetId(e.target.value)}
                        className={`w-full h-12 ${selectBaseClass} font-mono`}
                        style={selectStyle}
                        required
                      >
                        <option value="" className={optionClass}>-- Choose device to hand over --</option>
                        {filteredHandoverAssets.map((asset) => (
                          <option key={asset.id} value={asset.id} className={optionClass}>
                            [{asset.id}] - {asset.name} ({asset.type})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">Direct Recipient (To Agent) *</label>
                    <div className="flex flex-col gap-2 w-full mb-2">
                      <div className="relative w-full">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Search recipient name..."
                          value={recipientSearchQuery}
                          onChange={(e) => setRecipientSearchQuery(e.target.value)}
                          className="w-full pl-9 pr-3 h-10 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500 transition-all shadow-sm text-slate-800"
                        />
                      </div>
                    </div>
                    <select
                      value={handoverToAgentId}
                      onChange={(e) => setHandoverToAgentId(e.target.value)}
                      className={`w-full h-12 ${selectBaseClass}`}
                      style={selectStyle}
                      required
                    >
                      <option value="" className={optionClass}>-- Choose Recipient Agent --</option>
                      {filteredRecipientAgents.map((agent) => (
                        <option key={agent.id} value={agent.id} className={optionClass}>
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
                    className="w-full h-14 mt-4 text-white bg-gradient-to-r from-orange-400 to-rose-400 hover:from-rose-400 hover:to-orange-400 font-extrabold rounded-2xl text-sm sm:text-base tracking-wide transition-all duration-300 shadow-[0_10px_20px_rgba(249,115,22,0.3)] hover:shadow-[0_15px_30px_rgba(249,115,22,0.5)] hover:scale-105 cursor-pointer flex items-center justify-center gap-2 border-0"
                  >
                    <span>Process Supervisor Direct Handover</span>
                    <span className="text-amber-100 text-lg">🤝</span>
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Right Side: Quick Selection Helpers */}
        <div className="w-full lg:w-80 bg-white/80 backdrop-blur-xl border border-pink-100 rounded-[2rem] p-5 flex flex-col justify-between shrink-0 shadow-[0_10px_30px_rgba(236,72,153,0.15)] transition-all">
          <div>
            <h4 className="font-extrabold text-purple-900 text-sm flex items-center gap-2 pb-3 border-b border-pink-100 mb-4 uppercase tracking-wider">
              <Sliders className="w-5 h-5 text-pink-500 shrink-0" />
              Quick Assist Deck
            </h4>

            {activeTab === "issue" ? (
              <div className="space-y-6">
                {/* Available Assets autofill list */}
                <div>
                  <span className="text-[11px] uppercase font-bold text-teal-800 bg-teal-50 shadow-sm border border-teal-200 px-3 py-1 rounded-lg inline-block mb-3 tracking-wider font-sans">
                    Available Devices ({filteredAssetsForIssue.length})
                  </span>
                  {filteredAssetsForIssue.length === 0 ? (
                    <span className="text-xs text-slate-400 italic block py-4 bg-white/50 rounded-2xl text-center border border-dashed border-slate-200">No matching assets found.</span>
                  ) : (
                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-1">
                      {filteredAssetsForIssue.slice(0, 15).map((asset) => (
                        <button
                          key={asset.id}
                          type="button"
                          onClick={() => handleSelectAssetForIssue(asset.id)}
                          className={`px-3 py-2 bg-white text-slate-800 border-2 ${
                            issueAssetId === asset.id ? "border-teal-500 shadow-[0_0_10px_rgba(20,184,166,0.3)] bg-teal-50 scale-105" : "border-slate-100 hover:border-teal-300 hover:text-teal-600 hover:scale-[1.03]"
                          } rounded-2xl text-xs font-mono font-bold active:scale-95 transition-all duration-300 cursor-pointer shadow-sm`}
                        >
                          {asset.id}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Agents list */}
                <div>
                  <span className="text-[11px] uppercase font-bold text-purple-800 bg-purple-50 shadow-sm border border-purple-200 px-3 py-1 rounded-lg inline-block mb-3 tracking-wider font-sans">
                    Enrolled Agents ({agents.length})
                  </span>
                  {agents.length === 0 ? (
                    <span className="text-xs text-slate-400 italic block py-4 bg-white/50 rounded-2xl text-center border border-dashed border-slate-200">No active agents.</span>
                  ) : (
                    <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-1">
                      {agents.slice(0, 20).map((agent) => (
                        <button
                          key={agent.id}
                          type="button"
                          onClick={() => handleSelectAgent(agent.id)}
                          className={`px-3 py-2.5 border-2 rounded-2xl text-xs font-bold active:scale-95 transition-all duration-300 cursor-pointer shadow-sm ${
                            selectedAgentId.toUpperCase() === agent.id.toUpperCase()
                              ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white border-transparent shadow-[0_5px_15px_rgba(236,72,153,0.4)] scale-[1.05]"
                              : "bg-white hover:border-pink-300 hover:text-pink-600 border-slate-100 hover:scale-[1.03]"
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
                  <span className="text-[11px] uppercase font-bold text-indigo-800 bg-indigo-50 shadow-sm border border-indigo-200 px-3 py-1 rounded-lg inline-block mb-3 tracking-wider font-sans">
                    {currentAgent ? `${currentAgent.name}'s Held Devices` : "Agent Held Devices"} ({agentHeldAssets.length})
                  </span>
                  {agentHeldAssets.length === 0 ? (
                    <span className="text-xs text-slate-400 italic block py-6 bg-white/50 rounded-2xl text-center border border-dashed border-slate-200 p-4 leading-relaxed font-semibold">
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
                          className={`p-3 border-2 rounded-2xl text-xs font-bold active:scale-95 transition-all duration-300 text-left flex justify-between items-center w-full cursor-pointer shadow-sm ${
                            (activeTab === "return" ? returnAssetId : handoverAssetId) === asset.id
                              ? "bg-gradient-to-r from-indigo-500 to-purple-500 border-transparent text-white shadow-[0_5px_15px_rgba(99,102,241,0.4)] scale-[1.03]"
                              : "bg-white hover:border-indigo-300 hover:text-indigo-600 border-slate-100 hover:scale-[1.02]"
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
    </div>
  );
}

