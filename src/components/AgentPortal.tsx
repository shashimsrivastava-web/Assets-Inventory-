import React, { useState, useEffect, useRef } from "react";
import { Asset, Agent, Transaction, AssetStatus, Handover } from "../types";
import { 
  Key, ArrowUpRight, ArrowDownLeft, Clock, History, LogIn, 
  UserCheck, Smartphone, CheckCircle, AlertTriangle, ShieldAlert,
  Sliders, Calendar, FileText, Send, Camera, ArrowLeftRight, LogOut
} from "lucide-react";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

import { db, assetsCol, transactionsCol, handoversCol } from "../firebase";
import { SmartphoneLogo } from "./Header";

interface AgentPortalProps {
  assets: Asset[];
  agents: Agent[];
  transactions: Transaction[];
  handovers: Handover[];
  activeShift: string;
  onRefresh: () => void;
  onAddAlert: (
    type: "overdue" | "missing" | "duplicate_issue" | "already_returned" | "system",
    title: string,
    message: string,
    assetId?: string
  ) => void;
  onExitPortal: () => void;
}

export default function AgentPortal({
  assets,
  agents,
  transactions,
  handovers = [],
  activeShift,
  onRefresh,
  onAddAlert,
  onExitPortal
}: AgentPortalProps) {
  // Login states
  const [employeeIdInput, setEmployeeIdInput] = useState("");
  const [fullNameInput, setFullNameInput] = useState("");
  const [currentAgent, setCurrentAgent] = useState<Agent | null>(null);
  const [loginError, setLoginError] = useState("");

  // Portal Desk active sub-tab
  const [deskTab, setDeskTab] = useState<"operations" | "history">("operations");

  // Form states inside portal
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [issueRemarks, setIssueRemarks] = useState("");
  const [returnRemarks, setReturnRemarks] = useState("");

  // Device Handover State hooks
  const [activeHandoverAssetId, setActiveHandoverAssetId] = useState<string | null>(null);
  const [targetAgentUId, setTargetAgentUId] = useState("");
  const [handoverRemarks, setHandoverRemarks] = useState("");
  const [handoverSubmitting, setHandoverSubmitting] = useState(false);
  const [portalHandoverAssetId, setPortalHandoverAssetId] = useState("");
  const [portalHandoverToAgentId, setPortalHandoverToAgentId] = useState("");

  // Check physical sessionStorage to keep agent logged in across hot reloads if preferred
  useEffect(() => {
    const savedAgent = sessionStorage.getItem("active_portal_agent");
    if (savedAgent) {
      try {
        const parsed = JSON.parse(savedAgent);
        const exists = agents.find(a => a.id.toUpperCase() === parsed.id.toUpperCase());
        if (exists) {
          setCurrentAgent(exists);
        }
      } catch (e) {
        sessionStorage.removeItem("active_portal_agent");
      }
    }
  }, [agents]);

  // Handle portal sign-in
  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");

    const targetId = employeeIdInput.trim().toUpperCase();
    const targetName = fullNameInput.trim().toLowerCase();

    if (!targetId || !targetName) {
      setLoginError("Please enter both your Employee ID and Full Name.");
      return;
    }

    // Lookup Agent in Roster
    const matchedAgent = agents.find(
      (a) => a.id.toUpperCase() === targetId && a.name.toLowerCase() === targetName
    );

    if (matchedAgent) {
      setCurrentAgent(matchedAgent);
      sessionStorage.setItem("active_portal_agent", JSON.stringify(matchedAgent));
      setEmployeeIdInput("");
      setFullNameInput("");
    } else {
      setLoginError("Credentials do not match the authorized Shift Agent Roster. Please verify with your Supervisor.");
    }
  };

  // Handle portal sign-out
  const handleSignOut = () => {
    sessionStorage.removeItem("active_portal_agent");
    setCurrentAgent(null);
    setSelectedAssetId("");
    setIssueRemarks("");
    setReturnRemarks("");
  };

  // Self-Issue verification submission
  const handleSelfIssueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAgent) return;

    const targetAssetId = selectedAssetId.trim().toUpperCase();
    if (!targetAssetId) {
      alert("Please choose or specify an Asset ID.");
      return;
    }

    const assetObj = assets.find((a) => a.id.toUpperCase() === targetAssetId);
    if (!assetObj) {
      alert(`Asset ID ${targetAssetId} does not exist in master inventory list.`);
      return;
    }

    // Guard duplicate issue or active custody
    const isAlreadyIssued = 
      assetObj.status === AssetStatus.ISSUED || 
      assetObj.status === AssetStatus.MISSING || 
      !!assetObj.currentAssignmentId;

    if (isAlreadyIssued) {
      onAddAlert(
        "duplicate_issue",
        "Agent Single-Desk Block",
        `Agent ${currentAgent.name} tried self-issuing ${targetAssetId} which is already in custody or missing.`,
        targetAssetId
      );
      alert(`Asset Warning: Device ${targetAssetId} is already issued or in custody elsewhere. It cannot be issued until returned or directly handed over.`);
      return;
    }

    // Set transaction ID
    const txId = `TX-${Date.now().toString().slice(-6)}`;
    const now = new Date();
    const currentDateStr = now.toISOString().split("T")[0];
    const currentTimeStr = now.toTimeString().split(" ")[0].slice(0, 5);

    const transaction: Transaction = {
      id: txId,
      assetId: targetAssetId,
      assetName: assetObj.name,
      assetType: assetObj.type,
      employeeId: currentAgent.id,
      agentName: currentAgent.name,
      department: currentAgent.department || "General Shift Operations",
      issueDate: currentDateStr,
      issueTime: currentTimeStr,
      issueTimestamp: now.getTime(),
      shift: activeShift,
      issueRemarks: issueRemarks || "Self-issued from Agent Desk",
      status: "Issued"
    };

    try {
      // 1. Transaction creation in firestore
      await setDoc(doc(transactionsCol, txId), transaction);

      // 2. Set Asset Assignment
      await updateDoc(doc(assetsCol, targetAssetId), {
        status: AssetStatus.ISSUED,
        currentAssignmentId: txId,
        lastUpdated: now.getTime()
      });

      alert(`Verification success! Device ${targetAssetId} is now assigned to you.`);
      setSelectedAssetId("");
      setIssueRemarks("");
      onRefresh();
    } catch (err) {
      console.error("Portal self-issue failure", err);
      alert("Transaction failed to upload. Check connectivity configurations.");
    }
  };

  // Self-Return action trigger
  const handleSelfReturn = async (assetId: string, remarksText: string = "") => {
    if (!currentAgent) return;

    const assetObj = assets.find((a) => a.id === assetId);
    if (!assetObj) return;

    const activeTxId = assetObj.currentAssignmentId;
    if (!activeTxId) {
      alert("System database discrepancy: No active transaction binding found.");
      return;
    }

    try {
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
        returnRemarks: remarksText || returnRemarks || "Self-returned from Agent Portal",
        status: "Returned"
      };

      if (txSnap.exists()) {
        const txData = txSnap.data() as Transaction;
        const diffMs = returnTimeMs - txData.issueTimestamp;
        updatedTx.durationMinutes = Math.max(0, Math.round(diffMs / (1000 * 60)));
      }

      // 1. Update Transaction
      await updateDoc(txDocRef, updatedTx);

      // 2. Clear Asset Assignments
      await updateDoc(doc(assetsCol, assetId), {
        status: AssetStatus.IN_OFFICE,
        currentAssignmentId: null,
        lastUpdated: returnTimeMs
      });

      alert(`Successfully returned device ${assetId} to office cabinet.`);
      setReturnRemarks("");
      onRefresh();
    } catch (err) {
      console.error("Portal self-return failed", err);
      alert("Could not process returned status. Please reload portal.");
    }
  };

  // Initiate direct device handover with target agent verification
  const handleInitiateHandover = async (assetId: string, toAgent: Agent) => {
    if (!currentAgent) return;
    const assetObj = assets.find((a) => a.id === assetId);
    if (!assetObj) return;

    setHandoverSubmitting(true);
    const handoverDocId = assetId; // 1 active pending handover per device
    const handoverData: Handover = {
      id: handoverDocId,
      assetId: assetId,
      assetName: assetObj.name,
      assetType: assetObj.type,
      fromAgentId: currentAgent.id,
      fromAgentName: currentAgent.name,
      toAgentId: toAgent.id,
      toAgentName: toAgent.name,
      status: "pending",
      timestamp: Date.now(),
      remarks: handoverRemarks || "Shift Direct Handover"
    };

    try {
      await setDoc(doc(handoversCol, handoverDocId), handoverData);
      alert(`Handover registered in system! Agent ${toAgent.name} (${toAgent.id}) must now sign in & accept take-over receipt.`);
      setActiveHandoverAssetId(null);
      setTargetAgentUId("");
      setHandoverRemarks("");
      onRefresh();
    } catch (err) {
      console.error("Handover submit failed", err);
      alert("Could not update secure hand-off database ledger.");
    } finally {
      setHandoverSubmitting(false);
    }
  };

  // Dedicated submission handler for the central Handover Device panel
  const handlePortalHandoverSubmit = async (assetId: string, toAgent: Agent) => {
    if (!currentAgent) return;
    const assetObj = assets.find((a) => a.id === assetId);
    if (!assetObj) return;

    setHandoverSubmitting(true);
    const handoverDocId = assetId; // 1 active pending handover per device
    const handoverData: Handover = {
      id: handoverDocId,
      assetId: assetId,
      assetName: assetObj.name,
      assetType: assetObj.type,
      fromAgentId: currentAgent.id,
      fromAgentName: currentAgent.name,
      toAgentId: toAgent.id,
      toAgentName: toAgent.name,
      status: "pending",
      timestamp: Date.now(),
      remarks: handoverRemarks || "Direct Handover requested"
    };

    try {
      await setDoc(doc(handoversCol, handoverDocId), handoverData);
      alert(`Handover registered in system!\n\nAgent ${toAgent.name} (${toAgent.id}) must now sign in to Agent Desk Gateway and accept the takeover request to complete the transaction.`);
      
      // Clear inputs
      setPortalHandoverAssetId("");
      setPortalHandoverToAgentId("");
      setHandoverRemarks("");
      onRefresh();
    } catch (err) {
      console.error("Agent handover submission failed", err);
      alert("Could not update handover transaction record in the database.");
    } finally {
      setHandoverSubmitting(false);
    }
  };

  // Accept/Complete device handover
  const handleAcceptTakeover = async (ho: Handover) => {
    if (!currentAgent) return;

    const assetObj = assets.find((a) => a.id === ho.assetId);
    if (!assetObj) {
      alert("Asset target no longer exists inside inventory database.");
      return;
    }

    const activeTxId = assetObj.currentAssignmentId;
    const now = new Date();
    const currentDateStr = now.toISOString().split("T")[0];
    const currentTimeStr = now.toTimeString().split(" ")[0].slice(0, 5);
    const currentMs = now.getTime();

    try {
      // 1. Close original custodian transaction record 
      if (activeTxId) {
        const txDocRef = doc(transactionsCol, activeTxId);
        const txSnap = await getDoc(txDocRef);
        let updatedTx: Partial<Transaction> = {
          returnDate: currentDateStr,
          returnTime: currentTimeStr,
          returnTimestamp: currentMs,
          returnRemarks: `Direct Handover completed to Agent ${ho.toAgentName} (${ho.toAgentId}).`,
          status: "Returned"
        };
        if (txSnap.exists()) {
          const txData = txSnap.data() as Transaction;
          const diffMs = currentMs - txData.issueTimestamp;
          updatedTx.durationMinutes = Math.max(0, Math.round(diffMs / (1000 * 60)));
        }
        await updateDoc(txDocRef, updatedTx);
      }

      // 2. Open new custodian transaction record for current target agent
      const txId = `TX-${Date.now().toString().slice(-6)}-HO`;
      const newTransaction: Transaction = {
        id: txId,
        assetId: ho.assetId,
        assetName: ho.assetName,
        assetType: ho.assetType,
        employeeId: currentAgent.id,
        agentName: currentAgent.name,
        department: currentAgent.department || "General Shift Operations",
        issueDate: currentDateStr,
        issueTime: currentTimeStr,
        issueTimestamp: currentMs,
        shift: activeShift,
        issueRemarks: `Direct Handover checkout accepted from Agent ${ho.fromAgentName} (${ho.fromAgentId}).`,
        status: "Issued"
      };
      await setDoc(doc(transactionsCol, txId), newTransaction);

      // 3. Point asset pointer record to new transaction id
      await updateDoc(doc(assetsCol, ho.assetId), {
        status: AssetStatus.ISSUED,
        currentAssignmentId: txId,
        lastUpdated: currentMs
      });

      // 4. Update handover state document status to completed
      await updateDoc(doc(handoversCol, ho.id), {
        status: "completed",
        completedAt: currentMs
      });

      alert(`Verification receipt success! Device ${ho.assetId} successfully assigned in your shift hand-held custody.`);
      onRefresh();
    } catch (err) {
      console.error("Takeover receipt fails", err);
      alert("Ledger transaction failed to update. Check operational connections.");
    }
  };

  // Reject/Decline a handover request
  const handleDeclineTakeover = async (ho: Handover) => {
    try {
      await updateDoc(doc(handoversCol, ho.id), {
        status: "declined"
      });
      alert(`Declined direct checkout invitation of device ${ho.assetId}.`);
      onRefresh();
    } catch (err) {
      console.error("Decline handover failure", err);
    }
  };

  // Cancel an initiated handover request
  const handleCancelHandover = async (hoId: string) => {
    try {
      await updateDoc(doc(handoversCol, hoId), {
        status: "declined"
      });
      alert(`Handover transfer submission retracted/cancelled.`);
      onRefresh();
    } catch (err) {
      console.error("Cancel handover failure", err);
    }
  };

  // Fetch lists
  const availableAssets = assets.filter((a) => a.status === AssetStatus.IN_OFFICE);
  
  // Calculate specific custody held by the logged-in agent
  const myDevicesHeld = currentAgent
    ? assets.filter(
        (a) =>
          a.status === AssetStatus.ISSUED &&
          transactions.find((tx) => tx.id === a.currentAssignmentId)?.employeeId === currentAgent.id
      )
    : [];

  const myHistory = currentAgent
    ? transactions.filter((tx) => tx.employeeId === currentAgent.id)
    : [];

  return (
    <div className="max-w-4xl mx-auto py-4 px-2">
      {/* Portal Top Navigation Breadcrumb Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-4 border-b border-slate-200">
        <div>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] font-bold uppercase tracking-wider mb-2">
            🔑 Client Handover Session
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Smartphone className="w-6 h-6 text-indigo-500" />
            Agent Issue & Return Desk
          </h1>
          <p className="text-xs text-slate-500 mt-1">Authorized self-service hardware check-ins and check-outs.</p>
        </div>

        <button
          onClick={onExitPortal}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:border-slate-350 bg-white hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer"
        >
          Exit to Supervisor Console
        </button>
      </div>

      {!currentAgent ? (
        /* Portal Login Panel Container */
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xl max-w-lg mx-auto my-8 animate-fadeIn">
          <div className="text-center mb-6">
            <div className="flex justify-center mb-5">
              <div className="shrink-0">
                <SmartphoneLogo className="w-16 h-16" color="#071d49" bgColor="#ffffff" />
              </div>
            </div>
            <div className="w-12 h-12 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-center mx-auto mb-3 text-slate-700 shadow-3xs">
              <Key className="w-5 h-5 text-[#071d49]" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Roster Validation Gateway</h2>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
              Please enter your registered shift credentials as enrolled in the system.
            </p>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] uppercase font-bold text-slate-500 mb-1.5 font-sans">
                Employee ID (Username)
              </label>
              <input
                type="text"
                placeholder="e.g. EMP001"
                value={employeeIdInput}
                onChange={(e) => setEmployeeIdInput(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 bg-white rounded-xl text-sm font-medium focus:ring-1 focus:ring-indigo-500/50 focus:outline-none transition-all uppercase"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] uppercase font-bold text-slate-500 mb-1.5 font-sans">
                Registered Full Name
              </label>
              <input
                type="text"
                placeholder="e.g. Daniel Courier"
                value={fullNameInput}
                onChange={(e) => setFullNameInput(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 bg-white rounded-xl text-sm font-medium focus:ring-1 focus:ring-indigo-500/50 focus:outline-none transition-all"
                required
              />
            </div>

            {loginError && (
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-700 text-xs flex items-start gap-2 animate-pulse">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{loginError}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs tracking-wider uppercase transition shadow-sm cursor-pointer"
            >
              Authenticate & Access Desk ➔
            </button>
          </form>

          {/* Quick login validation help block */}
          <div className="mt-8 pt-6 border-t border-slate-100 bg-slate-50/50 p-4 rounded-2xl">
            <h4 className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2.5 flex items-center gap-1">
              <Sliders className="w-3 h-3 text-slate-400" />
              Quick Validation Test Accounts
            </h4>
            {agents.length === 0 ? (
              <p className="text-[10px] text-slate-400 italic">No enrolled agents. Create one in the Roster tab first.</p>
            ) : (
              <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                {agents.slice(0, 4).map((agentObj) => (
                  <button
                    key={agentObj.id}
                    type="button"
                    onClick={() => {
                      setEmployeeIdInput(agentObj.id);
                      setFullNameInput(agentObj.name);
                    }}
                    className="w-full text-left p-1.5 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 rounded-lg text-[11px] text-slate-650 bg-white shadow-2xs transition-all flex justify-between items-center"
                  >
                    <span>ID: <strong className="font-mono text-slate-900">{agentObj.id}</strong> · {agentObj.name}</span>
                    <span className="text-[9px] bg-slate-100 font-bold px-1.5 text-slate-500 rounded">{agentObj.department || "Ops"}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Authenticated Agent Workspace */
        <div className="space-y-6 animate-fadeIn">
          {/* Welcome User Banner */}
          <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-center text-indigo-600">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">
                  Welcome to Your Shift, {currentAgent.name}
                </h3>
                <p className="text-xs text-slate-500">
                  Employee Ref: <strong className="font-mono uppercase text-indigo-600">{currentAgent.id}</strong> · Team Division: <span className="font-medium">{currentAgent.department || "General Shift Operations"}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-[10px] text-slate-500 flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-slate-400" />
                Active Shift: <strong className="text-slate-800 font-bold uppercase">{activeShift}</strong>
              </div>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-1 bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 border border-rose-200 hover:border-rose-300 rounded-lg px-2.5 py-1 text-[11px] font-bold shadow-3xs hover:shadow-2xs cursor-pointer transition-all"
                id="agent-signout-btn"
              >
                <LogOut className="w-3 h-3 shrink-0" />
                Sign Out
              </button>
            </div>
          </div>

          {/* Sub Tab Navigation */}
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setDeskTab("operations")}
              className={`pb-3 px-4 text-xs font-bold tracking-wide border-b-2 transition-all cursor-pointer ${
                deskTab === "operations"
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-slate-500 hover:text-slate-850"
              }`}
            >
              📋 Issue & Return operations
            </button>
            <button
              onClick={() => setDeskTab("history")}
              className={`pb-3 px-4 text-xs font-bold tracking-wide border-b-2 transition-all cursor-pointer ${
                deskTab === "history"
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-slate-500 hover:text-slate-850"
              }`}
            >
              <History className="w-3.5 h-3.5 inline mr-1" />
              My Custody Wallet History ({myHistory.length})
            </button>
          </div>

          {deskTab === "operations" ? (
            <div className="space-y-6">
              {/* Takeovers Section */}
              {(() => {
                const pendingTakeovers = currentAgent
                  ? handovers.filter(
                      (ho) =>
                        ho.toAgentId.toUpperCase() === currentAgent.id.toUpperCase() &&
                        ho.status === "pending"
                    )
                  : [];
                if (pendingTakeovers.length === 0) return null;
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 shadow-xs animate-fadeIn">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="p-1 px-2.5 rounded-full bg-amber-100 text-amber-850 text-amber-800 text-[9px] font-bold uppercase tracking-wider">
                        📬 Takeover Request Pending
                      </div>
                      <h4 className="font-bold text-xs text-amber-905 text-amber-900 uppercase tracking-wide flex items-center gap-1">
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                        Device Transfer Receipt Action Required
                      </h4>
                    </div>
                    <div className="space-y-3">
                      {pendingTakeovers.map((ho) => (
                        <div key={ho.id} className="bg-white border border-amber-105 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono text-[10px] font-bold uppercase bg-slate-100 border border-slate-200 text-slate-700 px-1.5 py-0.5 rounded">
                                {ho.assetId}
                              </span>
                              <span className="font-bold text-slate-900 text-xs">{ho.assetName}</span>
                              <span className="text-[10px] text-slate-500">({ho.assetType})</span>
                            </div>
                            <p className="text-xs text-slate-700 mt-2">
                              Offered by: <strong className="text-indigo-900">{ho.fromAgentName}</strong> (<span className="font-mono">{ho.fromAgentId}</span>)
                            </p>
                            {ho.remarks && (
                              <p className="text-[11px] text-indigo-700 bg-indigo-50/50 px-2 py-1 rounded inline-block mt-1 font-serif">
                                💬 Note: "{ho.remarks}"
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                            <button
                              type="button"
                              onClick={() => handleAcceptTakeover(ho)}
                              className="flex-1 sm:flex-initial px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-2xs cursor-pointer transition-all active:scale-95 text-center"
                            >
                              Accept Takeover ✓
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeclineTakeover(ho)}
                              className="flex-1 sm:flex-initial px-3 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-bold text-xs uppercase tracking-wider rounded-xl shadow-3xs cursor-pointer transition-all text-center"
                            >
                              Decline ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* SECTION: ASSIGNED ASSETS IN CUSTODY */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-xs text-slate-500 uppercase tracking-wider pb-2 border-b border-slate-100 mb-4 flex justify-between items-center">
                    <span>Devices Currently in Your Custody</span>
                    <span className="bg-indigo-50 border border-indigo-100 text-indigo-700 font-mono text-[9px] font-bold px-2 py-0.5 rounded-full">
                      {myDevicesHeld.length} Device(s)
                    </span>
                  </h3>

                  {myDevicesHeld.length === 0 ? (
                    <div className="py-8 text-center text-slate-450 text-xs text-slate-400 font-sans">
                      <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2 animate-bounce" />
                      <p className="font-bold text-slate-705">No Active Custody Assignments</p>
                      <p className="text-[10px] text-slate-400 mt-1">If you need shift gear, utilize the issue panel on the right.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {myDevicesHeld.map((device) => {
                        const activeTx = transactions.find((t) => t.id === device.currentAssignmentId);
                        const durationMinutes = activeTx 
                          ? Math.round((Date.now() - activeTx.issueTimestamp) / (1000 * 60)) 
                          : 0;

                        return (
                          <div
                            key={device.id}
                            className="p-4 border border-indigo-100 bg-indigo-50/10 rounded-xl relative overflow-hidden"
                          >
                            <div className="flex justify-between items-start gap-4 mb-3">
                              <div>
                                <span className="font-mono text-[10px] font-bold uppercase bg-white border border-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">
                                  {device.id}
                                </span>
                                <h4 className="text-xs font-bold text-slate-900 mt-1.5">{device.name}</h4>
                                <p className="text-[10px] text-slate-500 mt-0.5">Asset Division: {device.type}</p>
                              </div>

                              <span className="text-[9px] font-bold font-mono text-indigo-600 bg-indigo-50/50 px-1.5 py-0.5 rounded border border-indigo-100 flex items-center gap-1 shrink-0">
                                <Clock className="w-3 h-3 text-indigo-500 animate-spin" />
                                Custody: {durationMinutes}m
                              </span>
                            </div>

                            {activeTx && (
                              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg text-[10px] text-slate-650 font-mono mb-3">
                                Check Out: {activeTx.issueDate} at {activeTx.issueTime} ({activeTx.shift})
                              </div>
                            )}

                                     {/* Return action card container inside portal */}
                             {(() => {
                               const pendingHo = handovers.find(
                                 (ho) =>
                                   ho.assetId === device.id &&
                                   ho.fromAgentId.toUpperCase() === currentAgent.id.toUpperCase() &&
                                   ho.status === "pending"
                               );

                               return pendingHo ? (
                                 <div className="mt-3 p-3 bg-indigo-50 border border-indigo-150 rounded-xl space-y-2.5 animate-fadeIn">
                                   <p className="text-[11px] text-indigo-900 flex items-center gap-1.5 font-medium leading-relaxed">
                                     <span className="w-2 h-2 bg-indigo-600 rounded-full animate-ping shrink-0" />
                                     Transfer pending to <strong>{pendingHo.toAgentName}</strong> (<span className="font-mono text-[10px] uppercase font-bold">{pendingHo.toAgentId}</span>)
                                   </p>
                                   <button
                                     onClick={() => handleCancelHandover(pendingHo.id)}
                                     className="w-full py-1.5 border border-rose-200 bg-white hover:bg-rose-50 text-rose-700 text-[10px] font-bold rounded-lg uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1"
                                   >
                                     Cancel Transfer Request ✕
                                   </button>
                                 </div>
                               ) : (
                                 /* Toggled switcher between return and physical hand-off forms */
                                 <div className="space-y-2.5 pt-3 border-t border-slate-100">
                                   <div className="flex justify-between items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/50">
                                     <button
                                       type="button"
                                       onClick={() => setActiveHandoverAssetId(null)}
                                       className={`flex-1 text-center py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                                         activeHandoverAssetId !== device.id
                                           ? "bg-white text-indigo-700 shadow-3xs border border-slate-200/50 font-extrabold"
                                           : "text-slate-500 hover:text-slate-705"
                                       }`}
                                     >
                                       Cabinet Return
                                     </button>
                                     <button
                                       type="button"
                                       onClick={() => {
                                         setActiveHandoverAssetId(device.id);
                                         setTargetAgentUId("");
                                         setHandoverRemarks("");
                                       }}
                                       className={`flex-1 text-center py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                                         activeHandoverAssetId === device.id
                                           ? "bg-white text-indigo-700 shadow-3xs border border-slate-200/50 font-extrabold"
                                           : "text-slate-500 hover:text-slate-705"
                                       }`}
                                     >
                                       Direct Handover
                                     </button>
                                   </div>

                                   {activeHandoverAssetId !== device.id ? (
                                     /* Cabinet Return Form Component */
                                     <div className="space-y-1.5 animate-fadeIn">
                                       <label className="block text-[10px] text-slate-500 font-medium">Optional state notes for supervisors:</label>
                                       <div className="flex gap-2">
                                         <input
                                           type="text"
                                           placeholder="e.g. Returned fully charged..."
                                           id={`remarks-input-${device.id}`}
                                           className="flex-1 px-2.5 py-1.5 border border-slate-200 bg-white rounded-lg text-[10.5px]"
                                         />
                                         <button
                                           onClick={() => {
                                             const inputEl = document.getElementById(`remarks-input-${device.id}`) as HTMLInputElement;
                                             handleSelfReturn(device.id, inputEl ? inputEl.value : "");
                                           }}
                                           className="px-3.5 py-1.5 bg-indigo-600 hover:bg-slate-900 text-white font-bold rounded-lg text-[10px] shrink-0 transition-colors shadow-2xs cursor-pointer"
                                         >
                                           Return cabinet roll-in ➔
                                         </button>
                                       </div>
                                     </div>
                                   ) : (
                                     /* Direct Handover Form Component */
                                     <div className="space-y-3 bg-indigo-50/20 border border-indigo-100/40 p-3 rounded-xl animate-fadeIn">
                                       <div className="space-y-1">
                                         <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                                           Target Agent U ID / Employee ID:
                                         </label>
                                         <input
                                           type="text"
                                           placeholder="e.g. EMP001"
                                           value={targetAgentUId}
                                           onChange={(e) => setTargetAgentUId(e.target.value)}
                                           className="w-full px-2.5 py-1.5 border border-slate-200 bg-white rounded-lg text-[11px] uppercase font-bold text-slate-800"
                                         />
                                         {(() => {
                                           const lookupVal = targetAgentUId.trim().toUpperCase();
                                           if (!lookupVal) return null;
                                           
                                           const matched = agents.find((ag) => ag.id.toUpperCase() === lookupVal);
                                           if (matched) {
                                             const isSelf = matched.id.toUpperCase() === currentAgent.id.toUpperCase();
                                             if (isSelf) {
                                               return (
                                                 <p className="text-[10px] text-rose-600 font-bold leading-tight mt-1 animate-pulse">
                                                   ⚠️ You cannot handover a device to yourself.
                                                 </p>
                                               );
                                             }
                                             return (
                                               <p className="text-[10.5px] text-emerald-600 font-bold leading-tight mt-1 flex items-center gap-1">
                                                 ✓ Found Agent: <strong className="text-slate-900">{matched.name}</strong> ({matched.department || "General Shift"})
                                               </p>
                                             );
                                           } else if (lookupVal.length >= 3) {
                                             return (
                                               <p className="text-[10px] text-amber-600 font-bold leading-tight mt-1 animate-pulse">
                                                 ⚠️ No registered agent found with ID "{lookupVal}"
                                               </p>
                                             );
                                           }
                                           return null;
                                         })()}
                                       </div>

                                       <div className="space-y-1">
                                         <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                                           Handover Comments / Notes:
                                         </label>
                                         <input
                                           type="text"
                                           placeholder="e.g. Handoff for next flight schedule..."
                                           value={handoverRemarks}
                                           onChange={(e) => setHandoverRemarks(e.target.value)}
                                           className="w-full px-2.5 py-1.5 border border-slate-200 bg-white rounded-lg text-[10.5px]"
                                         />
                                       </div>

                                       {(() => {
                                         const lookupVal = targetAgentUId.trim().toUpperCase();
                                         const matched = agents.find((ag) => ag.id.toUpperCase() === lookupVal);
                                         const isSelf = matched?.id.toUpperCase() === currentAgent.id.toUpperCase();
                                         const canSubmit = matched && !isSelf;

                                         return (
                                           <button
                                             type="button"
                                             disabled={!canSubmit || handoverSubmitting}
                                             onClick={() => {
                                               if (matched) {
                                                 handleInitiateHandover(device.id, matched);
                                               }
                                             }}
                                             className={`w-full py-2 font-bold text-[10.5px] uppercase tracking-wider rounded-lg transition-all shadow-3xs cursor-pointer ${
                                               canSubmit
                                                 ? "bg-[#071d49] hover:bg-[#0a2966] text-white active:scale-[0.98]"
                                                 : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                                             }`}
                                           >
                                             {handoverSubmitting ? "Syncing Handover..." : "Initiate Direct Handover Receipt ➔"}
                                           </button>
                                         );
                                       })()}
                                     </div>
                                   )}
                                 </div>
                               );
                             })()}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-[10px] text-slate-500 flex items-start gap-1.5 mt-6">
                  <AlertTriangle className="w-3.5 h-3.5 text-indigo-505 text-indigo-500 shrink-0 mt-0.5" />
                  <p className="leading-snug">
                    Always returned assets are double-verified by operations audit trails. Do not share credentials or devices under checkout.
                  </p>
                </div>
              </div>

              {/* SECTION: SELF-SERVICE ISSUE CABINET */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-4">
                  <h3 className="font-bold text-xs text-slate-500 uppercase tracking-wider">
                    Assigned Device Desk Checkout
                  </h3>
                </div>

                {availableAssets.length === 0 ? (
                  <div className="py-12 border border-dashed border-slate-250 border-slate-200 rounded-xl text-center text-slate-400 bg-slate-50/50">
                    <ShieldAlert className="w-8 h-8 text-rose-300 mx-auto mb-2 animate-pulse" />
                    <p className="font-bold text-xs">All System Devices Checked Out</p>
                    <p className="text-[10px] text-slate-400 mt-1">There are no operational assets currently returned of cabinet.</p>
                  </div>
                ) : (
                  <form onSubmit={handleSelfIssueSubmit} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                        Choose Available Device from Cabinet
                      </label>
                      <input
                        type="text"
                        list="cabinet-assets"
                        value={selectedAssetId}
                        onChange={(e) => setSelectedAssetId(e.target.value.toUpperCase())}
                        className="w-full px-3.5 py-2 border border-slate-200 bg-white rounded-xl text-xs font-medium text-slate-700 uppercase"
                        required
                        placeholder="Scan or choose hardware item..."
                      />
                      <datalist id="cabinet-assets">
                        {availableAssets.map((asset) => (
                          <option key={asset.id} value={asset.id}>
                            {asset.name} ({asset.type})
                          </option>
                        ))}
                      </datalist>
                    </div>

                    {/* Quick Select Buttons */}
                    <div>
                      <span className="block text-[10px] uppercase font-bold text-slate-400 mb-2 tracking-wider">
                        Quick Pick Desk Cards:
                      </span>
                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                        {availableAssets.slice(0, 6).map((asset) => (
                          <button
                            key={asset.id}
                            type="button"
                            onClick={() => setSelectedAssetId(asset.id)}
                            className={`px-2 py-1 border rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer ${
                              selectedAssetId === asset.id
                                ? "bg-indigo-600 border-indigo-600 text-white"
                                : "bg-white hover:bg-slate-50 border-slate-200 text-slate-800"
                            }`}
                          >
                            {asset.id}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                        Shift Custody Comments / Remarks
                      </label>
                      <textarea
                        value={issueRemarks}
                        onChange={(e) => setIssueRemarks(e.target.value)}
                        placeholder="State battery percentage, physical conditions, or destination scope (optional)"
                        rows={2}
                        className="w-full px-3.5 py-2 border border-slate-200 bg-slate-50/20 focus:bg-white rounded-xl text-xs focus:outline-none transition-all text-slate-800 font-sans"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={!selectedAssetId}
                      className={`w-full py-2.5 text-xs sm:text-sm font-bold rounded-xl tracking-wider uppercase transition shadow-sm cursor-pointer ${
                        selectedAssetId
                          ? "bg-slate-900 hover:bg-slate-800 text-white"
                          : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                      }`}
                    >
                      Process Issue Verification & Sign ✍️
                    </button>
                  </form>
                )}
              </div>
            </div>

            {/* SECTION: DIRECT DEVICE HANDOVER FROM AGENT TO AGENT */}
            <div id="central-device-handover-panel" className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm mt-6">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100 mb-5">
                <div className="p-2 bg-amber-50 border border-amber-105 rounded-xl text-amber-700">
                  <ArrowLeftRight className="w-4 h-4 shrink-0" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-800">
                    Direct Shift Handover
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">Coordinate a direct hardware custodial swap with another flight crew agent.</p>
                </div>
              </div>

              {myDevicesHeld.length === 0 ? (
                <div className="py-8 px-4 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                  <div className="w-10 h-10 bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-center text-slate-400 mx-auto mb-3">
                    <ShieldAlert className="w-5 h-5 shrink-0" />
                  </div>
                  <h4 className="font-bold text-xs text-slate-700">Handover Option Unavailable</h4>
                  <p className="text-[10.5px] text-slate-500 max-w-sm mx-auto mt-1 leading-relaxed">
                    This option is not available because you do not have any devices issued to you. Please self-issue a device from the Shift Cabinet above first.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider font-sans">
                        1. Select Your Device to Handover *
                      </label>
                      <select
                        value={portalHandoverAssetId}
                        onChange={(e) => setPortalHandoverAssetId(e.target.value)}
                        className="w-full px-3.5 py-2.5 border border-slate-200 bg-white rounded-xl text-xs font-semibold text-slate-800 cursor-pointer focus:ring-1 focus:ring-indigo-500/50 focus:outline-none"
                        required
                      >
                        <option value="">-- Choose your device in custody --</option>
                        {myDevicesHeld.map((asset) => (
                          <option key={asset.id} value={asset.id}>
                            [{asset.id}] - {asset.name} ({asset.type})
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-slate-400 mt-1">Only devices you currently hold under active checkouts are listed here.</p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider font-sans">
                        2. Recipient Agent U Number / ID *
                      </label>
                      <input
                        type="text"
                        placeholder="Enter Recipient's Employee ID (e.g. EMP002 or U123)"
                        value={portalHandoverToAgentId}
                        onChange={(e) => setPortalHandoverToAgentId(e.target.value)}
                        className="w-full px-3.5 py-2.5 border border-slate-200 bg-white rounded-xl text-xs font-mono font-bold uppercase text-slate-850 focus:ring-1 focus:ring-indigo-500/50 focus:outline-none"
                        required
                      />
                      {(() => {
                        const lookupVal = portalHandoverToAgentId.trim().toUpperCase();
                        if (!lookupVal) return null;
                        
                        const matched = agents.find((ag) => ag.id.toUpperCase() === lookupVal);
                        if (matched) {
                          const isSelf = matched.id.toUpperCase() === currentAgent.id.toUpperCase();
                          if (isSelf) {
                            return (
                              <p className="text-[10px] text-rose-600 font-bold mt-1.5 flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                You cannot handover a device to yourself.
                              </p>
                            );
                          }
                          return (
                            <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl mt-2 animate-fadeIn">
                              <p className="text-[11px] text-emerald-800 font-bold flex items-center gap-1">
                                ✓ Authorized Recipient Found: <strong className="text-slate-900 font-semibold">{matched.name}</strong>
                              </p>
                              <p className="text-[10px] text-slate-500 mt-0.5">Division: {matched.department || "Operations Team"} · Status: Registered in database</p>
                            </div>
                          );
                        } else if (lookupVal.length >= 3) {
                          return (
                            <p className="text-[10px] text-amber-600 font-bold mt-1.5 flex items-center gap-1.5 animate-pulse">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              No registered agent matching lookup ID "{lookupVal}" inside Roster database.
                            </p>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>

                  <div className="space-y-4 flex flex-col justify-between">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider font-sans">
                        3. Handover Remarks / Comments
                      </label>
                      <textarea
                        value={handoverRemarks}
                        onChange={(e) => setHandoverRemarks(e.target.value)}
                        placeholder="State any specific reason, physical condition, or flight handover schedule notes (optional)..."
                        rows={3.5}
                        className="w-full px-3.5 py-2.5 border border-slate-200 bg-slate-50/20 focus:bg-white rounded-xl text-xs focus:outline-none transition-all text-slate-800 font-sans"
                      />
                    </div>

                    {(() => {
                      const lookupVal = portalHandoverToAgentId.trim().toUpperCase();
                      const matched = agents.find((ag) => ag.id.toUpperCase() === lookupVal);
                      const isSelf = matched?.id.toUpperCase() === currentAgent.id.toUpperCase();
                      const canSubmit = portalHandoverAssetId && matched && !isSelf;

                      return (
                        <button
                          type="button"
                          disabled={!canSubmit || handoverSubmitting}
                          onClick={() => {
                            if (matched && portalHandoverAssetId) {
                              handlePortalHandoverSubmit(portalHandoverAssetId, matched);
                            }
                          }}
                          className={`w-full py-3 text-xs sm:text-sm font-bold rounded-xl tracking-wider uppercase transition shadow-sm cursor-pointer ${
                            canSubmit
                              ? "bg-amber-600 hover:bg-amber-700 text-white"
                              : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                          }`}
                        >
                          {handoverSubmitting ? "Submitting Transfer..." : "Initiate Direct Takeover Request ➔"}
                        </button>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>
          ) : (
            /* Tab: My Personal Activity Log History */
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm overflow-x-auto">
              <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100">
                <h3 className="font-bold text-xs text-slate-500 uppercase tracking-wider">
                  Your Personal Device Custody History Receipt Ledger
                </h3>
                <span className="bg-emerald-50 border border-emerald-100 text-emerald-700 font-mono text-[10px] font-bold px-2 py-0.5 rounded">
                  {myHistory.length} Record(s) Total
                </span>
              </div>

              {myHistory.length === 0 ? (
                <div className="py-12 text-center text-slate-400 italic">
                  No previous device handovers logged under your Employee ID profile.
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-650">
                      <th className="p-3">Receipt</th>
                      <th className="p-3">Asset</th>
                      <th className="p-3">Checked Out</th>
                      <th className="p-3">Returned In</th>
                      <th className="p-3">Remarks Notes</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Custody Du.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-slate-705">
                    {myHistory.map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-50/30 transition-colors">
                        <td className="p-3 font-mono font-bold text-slate-400 text-[10px]">{tx.id}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold bg-slate-100 border border-slate-200 px-1 py-0.5 rounded text-[10.5px]">
                              {tx.assetId}
                            </span>
                            <span className="font-bold text-slate-800 text-[11px]">{tx.assetName}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="font-mono">{tx.issueDate}</div>
                          <div className="text-[10px] text-slate-400">{tx.issueTime}</div>
                        </td>
                        <td className="p-3">
                          {tx.returnDate ? (
                            <>
                              <div className="font-mono">{tx.returnDate}</div>
                              <div className="text-[10px] text-slate-400">{tx.returnTime}</div>
                            </>
                          ) : (
                            <span className="inline-block px-1.5 py-0.5 text-[9.5px] font-bold text-amber-705 text-amber-700 bg-amber-50/50 rounded border border-amber-100">With You</span>
                          )}
                        </td>
                        <td className="p-3">
                          <p className="text-[10px] max-w-[150px] truncate" title={tx.returnRemarks || tx.issueRemarks}>
                            {tx.returnRemarks ? `Return: ${tx.returnRemarks}` : `Issue: ${tx.issueRemarks}`}
                          </p>
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 font-bold rounded-lg text-[9px] ${
                              tx.status === "Returned"
                                ? "bg-teal-50 text-teal-700 border border-teal-150"
                                : tx.status === "Issued"
                                ? "bg-indigo-50 text-indigo-700 border border-indigo-150 animate-pulse"
                                : "bg-rose-50 text-rose-700 border border-rose-150"
                            }`}
                          >
                            {tx.status}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-slate-800">
                          {tx.durationMinutes !== undefined && tx.durationMinutes !== null
                            ? `${tx.durationMinutes} min`
                            : "Active"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
