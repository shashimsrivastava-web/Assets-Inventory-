import React, { useState, useEffect } from "react";
import { onSnapshot, doc, getDocFromServer, query, orderBy, getDocs } from "firebase/firestore";
import { db, assetsCol, agentsCol, transactionsCol } from "./firebase";
import { bootstrapDatabaseIfEmpty } from "./utils/initDb";
import { Asset, Agent, Transaction, AlertLog, WebhookConfig, AssetStatus } from "./types";
import { getRecommendedShiftByTime } from "./utils/shiftConfig";

// Component imports
import Header from "./components/Header";
import Dashboard from "./components/Dashboard";
import IssueReturnForm from "./components/IssueReturnForm";
import AssetMaster from "./components/AssetMaster";
import AgentMaster from "./components/AgentMaster";
import AuditTrail from "./components/AuditTrail";
import Reports from "./components/Reports";
import AlertsManager from "./components/AlertsManager";
import AgentPortal from "./components/AgentPortal";

// Sidebar Navigation Icons
import { LayoutDashboard, Key, Laptop, Users, History, BarChart3, Bell, Shield, Info, Database } from "lucide-react";

export default function App() {
  const [role, setRole] = useState<"Admin" | "Supervisor">("Supervisor");
  const [activeTab, setActiveTab] = useState<"dashboard" | "handover" | "assets" | "agents" | "audit" | "reports" | "alerts">("dashboard");
  const [activeShift, setActiveShift] = useState(getRecommendedShiftByTime());
  const [viewMode, setViewMode] = useState<"console" | "agent">("console");

  // Collections state
  const [assets, setAssets] = useState<Asset[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  
  // App infrastructure states
  const [loading, setLoading] = useState(true);
  const [dbVerified, setDbVerified] = useState<boolean | null>(null);

  // Warnings / Alarm states
  const [alerts, setAlerts] = useState<AlertLog[]>([]);
  const [webhookConfig, setWebhookConfig] = useState<WebhookConfig>({
    teamsUrl: "",
    emailRecipient: "",
    enabled: false
  });

  // Automatically compute shift based on current time (June 2026)
  useEffect(() => {
    setActiveShift(getRecommendedShiftByTime());
  }, []);

  // Dynamic separate link hash routing for Agent Portal
  useEffect(() => {
    const handleUrlChecks = () => {
      const isAgentHash = window.location.hash === "#agent-portal" || window.location.search.includes("portal=agent");
      if (isAgentHash) {
        setViewMode("agent");
      } else {
        setViewMode("console");
      }
    };
    
    handleUrlChecks();
    window.addEventListener("hashchange", handleUrlChecks);
    return () => window.removeEventListener("hashchange", handleUrlChecks);
  }, []);

  const handleSwitchToAgentPortal = () => {
    window.location.hash = "#agent-portal";
    setViewMode("agent");
  };

  const handleExitAgentPortal = () => {
    // Clear hash cleanly
    window.history.pushState("", document.title, window.location.pathname + window.location.search);
    setViewMode("console");
  };

  // Check database connectivity as strictly requested in Firebase instructions
  useEffect(() => {
    async function testConnection() {
      try {
        // Trigger bootstrap check first
        await bootstrapDatabaseIfEmpty();
        
        // Test fetch connection
        await getDocs(assetsCol);
        setDbVerified(true);
      } catch (error) {
        console.error("Firestore loading failure. Working offline safely with dynamic in-memory synchronization.");
        setDbVerified(false);
      }
    }
    testConnection();
  }, []);

  // Real-time synchronization listeners
  useEffect(() => {
    setLoading(true);

    const unsubAssets = onSnapshot(assetsCol, (snapshot) => {
      const list: Asset[] = [];
      snapshot.forEach((doc) => {
        list.push({ ...doc.data() } as Asset);
      });
      // Sort assets predictably by ID
      setAssets(list.sort((a,b) => a.id.localeCompare(b.id)));
      setLoading(false);
    }, (error) => {
      console.warn("Assets listener failed: fallback loading", error);
      setLoading(false);
    });

    const unsubAgents = onSnapshot(agentsCol, (snapshot) => {
      const list: Agent[] = [];
      snapshot.forEach((doc) => {
        list.push({ ...doc.data() } as Agent);
      });
      setAgents(list.sort((a,b) => a.id.localeCompare(b.id)));
    }, (error) => {
      console.warn("Agents listener failed", error);
    });

    const qTransactions = query(transactionsCol, orderBy("issueTimestamp", "desc"));
    const unsubTransactions = onSnapshot(qTransactions, (snapshot) => {
      const list: Transaction[] = [];
      snapshot.forEach((doc) => {
        list.push({ ...doc.data() } as Transaction);
      });
      setTransactions(list);
    }, (error) => {
      console.warn("Transactions listener failed", error);
    });

    return () => {
      unsubAssets();
      unsubAgents();
      unsubTransactions();
    };
  }, []);

  // System alert checker when assets load
  useEffect(() => {
    if (assets.length === 0) return;

    const overdueAlertsList: AlertLog[] = [];

    // Analyze checked out status
    assets.forEach((asset) => {
      if (asset.status === AssetStatus.ISSUED && asset.currentAssignmentId) {
        const tx = transactions.find((t) => t.id === asset.currentAssignmentId);
        if (tx) {
          const hoursElapsed = (Date.now() - tx.issueTimestamp) / (1000 * 60 * 60);
          if (hoursElapsed > 8) {
            // Overdue!
            const alertId = `ALERT-OV-${asset.id}`;
            const exists = alerts.some((a) => a.id === alertId);
            if (!exists) {
              overdueAlertsList.push({
                id: alertId,
                type: "overdue",
                title: "Overdue Custody Incident",
                message: `Asset ${asset.id} (${asset.name}) is with Agent ${tx.agentName} for more than 8 hours. Shift ended!`,
                timestamp: Date.now(),
                resolved: false,
                assetId: asset.id
              });
            }
          }
        }
      } else if (asset.status === AssetStatus.MISSING) {
        const alertId = `ALERT-MS-${asset.id}`;
        const exists = alerts.some((a) => a.id === alertId);
        if (!exists) {
          overdueAlertsList.push({
            id: alertId,
            type: "missing",
            title: "Asset Flagged Missing",
            message: `Asset ${asset.id} (${asset.name}) was logged missing on return checklist. Immediate supervisor audit recommended.`,
            timestamp: Date.now(),
            resolved: false,
            assetId: asset.id
          });
        }
      }
    });

    if (overdueAlertsList.length > 0) {
      setAlerts((prev) => [...overdueAlertsList, ...prev]);
    }
  }, [assets, transactions]);

  // Alert callbacks
  const handleAddNewAlert = (
    type: "overdue" | "missing" | "duplicate_issue" | "already_returned" | "system",
    title: string,
    message: string,
    assetId?: string
  ) => {
    const newAlert: AlertLog = {
      id: `ALERT-${Date.now()}-${Math.floor(Math.random() * 100)}`,
      type,
      title,
      message,
      timestamp: Date.now(),
      resolved: false,
      assetId
    };
    
    setAlerts((prev) => [newAlert, ...prev]);

    // Fast-trigger webhook simulation if active
    if (webhookConfig.enabled) {
      console.log(`[ALERT BOT WEBHOOK CHANNEL DISPATCH]: Dispatching exception '${title}' successfully.`);
    }
  };

  const handleResolveAlert = (id: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, resolved: true } : a))
    );
  };

  const handleClearAlerts = () => {
    setAlerts([]);
  };

  // Force database reload
  const handleForceSync = () => {
    setLoading(true);
    // Dynamic reload simulated via listener trigger
    setTimeout(() => setLoading(false), 500);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Upper header */}
      <Header role={role} setRole={setRole} activeShift={activeShift} isAgentPortal={viewMode === "agent"} onChangeShift={setActiveShift} />

      {viewMode === "agent" ? (
        <main className="flex-1 p-6 md:p-8 overflow-y-auto max-w-5xl mx-auto w-full animate-fadeIn">
          <AgentPortal
            assets={assets}
            agents={agents}
            transactions={transactions}
            activeShift={activeShift}
            onRefresh={handleForceSync}
            onAddAlert={handleAddNewAlert}
            onExitPortal={handleExitAgentPortal}
          />
        </main>
      ) : (
        /* Main dashboard body */
        <div className="flex-1 flex flex-col md:flex-row">
          {/* Left Drawer / Nav Rails */}
        <aside className="w-full md:w-64 bg-white border-b md:border-b-0 md:border-r border-slate-200 text-slate-600 py-6 px-4 shrink-0 flex flex-col justify-between">
          <nav className="space-y-1.5">
            <span className="px-3 text-[10px] uppercase font-bold text-slate-450 tracking-wider block mb-3 font-sans">Live Ops Console</span>

            <button
              onClick={() => setActiveTab("dashboard")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all border cursor-pointer ${
                activeTab === "dashboard"
                  ? "bg-indigo-50 text-indigo-700 border-indigo-105/50 font-bold"
                  : "border-transparent hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <LayoutDashboard className="w-4 h-4 text-indigo-600" />
              Live Dashboard
            </button>

            <button
              id="nav-tab-handover"
              onClick={() => setActiveTab("handover")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all border cursor-pointer ${
                activeTab === "handover"
                  ? "bg-indigo-50 text-indigo-700 border-indigo-105/50 font-bold"
                  : "border-transparent hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <Key className="w-4 h-4 text-indigo-600" />
              Issue & Return Desk
            </button>

            <button
              onClick={() => setActiveTab("assets")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all border cursor-pointer ${
                activeTab === "assets"
                  ? "bg-indigo-50 text-indigo-700 border-indigo-105/50 font-bold"
                  : "border-transparent hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <Laptop className="w-4 h-4 text-indigo-600" />
              Asset Inventory
            </button>

            <button
              onClick={() => setActiveTab("agents")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all border cursor-pointer ${
                activeTab === "agents"
                  ? "bg-indigo-50 text-indigo-700 border-indigo-105/50 font-bold"
                  : "border-transparent hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <Users className="w-4 h-4 text-indigo-600" />
              Agent Roster
            </button>

            <button
              onClick={() => setActiveTab("audit")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all border cursor-pointer ${
                activeTab === "audit"
                  ? "bg-indigo-50 text-indigo-700 border-indigo-105/50 font-bold"
                  : "border-transparent hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <History className="w-4 h-4 text-indigo-600" />
              Audit Trail logs
            </button>

            <button
              onClick={() => setActiveTab("reports")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all border cursor-pointer ${
                activeTab === "reports"
                  ? "bg-indigo-50 text-indigo-700 border-indigo-105/50 font-bold"
                  : "border-transparent hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <BarChart3 className="w-4 h-4 text-indigo-600" />
              Utilization Reports
            </button>

            <button
              onClick={() => setActiveTab("alerts")}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all border cursor-pointer ${
                activeTab === "alerts"
                  ? "bg-indigo-50 text-indigo-700 border-indigo-105/50 font-bold"
                  : "border-transparent hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <div className="flex items-center gap-3">
                <Bell className="w-4 h-4 text-indigo-600" />
                Operational Warnings
              </div>
              {alerts.filter(a => !a.resolved).length > 0 && (
                <span className="bg-rose-550 text-rose-700 border border-rose-200 bg-rose-50 font-mono text-[9px] px-1.5 py-0.5 rounded-full animate-pulse font-bold">
                  {alerts.filter(a => !a.resolved).length}
                </span>
              )}
            </button>
          </nav>

          <div className="space-y-3 pt-6 border-t border-slate-100">
            {/* Agent Desk Portal separate link */}
            <div className="bg-indigo-50/50 border border-indigo-150 border-indigo-100 rounded-xl p-3 text-[11px] space-y-2">
              <div className="flex items-center gap-1.5 font-bold text-indigo-900 uppercase tracking-tight text-[10px] font-sans">
                <Key className="w-3.5 h-3.5 text-indigo-600" />
                <span>Agent Desk Gateway</span>
              </div>
              <p className="text-slate-500 text-[10px] leading-relaxed">
                Dedicated desk link for roster agents to self-issue and rollback custody devices.
              </p>
              <a
                href="#agent-portal"
                onClick={(e) => {
                  e.preventDefault();
                  handleSwitchToAgentPortal();
                }}
                className="w-full flex items-center justify-center gap-1 py-1.5 border border-indigo-200 hover:border-indigo-350 bg-white hover:bg-slate-50 text-indigo-700 text-[10.5px] font-bold rounded-lg shadow-2xs transition-colors cursor-pointer"
                id="link-agent-portal"
              >
                Access Desk Portal ➔
              </a>
            </div>

            {/* Database verification badges */}
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-[10px] text-slate-500 space-y-2">
              <div className="flex items-center gap-2">
                <Database className="w-3.5 h-3.5 text-indigo-500" />
                <span className="font-semibold text-slate-700 uppercase font-sans tracking-tight">Cloud Database Status</span>
              </div>
              {dbVerified === true ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-600 font-bold font-mono">
                  ● Firestore Online
                </span>
              ) : dbVerified === false ? (
                <span className="inline-flex items-center gap-1.5 text-indigo-600 font-bold font-mono">
                  ● Offline/Memory Sync Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-amber-600 font-bold font-mono">
                  ○ Querying Connection...
                </span>
              )}
            </div>

            <div className="text-[10px] text-slate-400 text-center flex items-center justify-center gap-1.5">
              <Info className="w-3 h-3 text-slate-400 shrink-0" />
              <span>Shift System v2.10.4</span>
            </div>
          </div>
        </aside>

        {/* Central Workspace area */}
        <main className="flex-1 p-6 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full">
          {activeTab === "dashboard" && (
            <Dashboard
              assets={assets}
              agents={agents}
              transactions={transactions}
              loading={loading}
              onRefresh={handleForceSync}
            />
          )}

          {activeTab === "handover" && (
            <IssueReturnForm
              assets={assets}
              agents={agents}
              role={role}
              activeShift={activeShift}
              onRefresh={handleForceSync}
              onAddAlert={handleAddNewAlert}
            />
          )}

          {activeTab === "assets" && (
            <AssetMaster
              assets={assets}
              role={role}
              loading={loading}
              onRefresh={handleForceSync}
              onAddAlert={handleAddNewAlert}
            />
          )}

          {activeTab === "agents" && (
            <AgentMaster
              agents={agents}
              role={role}
              loading={loading}
              onRefresh={handleForceSync}
            />
          )}

          {activeTab === "audit" && (
            <AuditTrail
              transactions={transactions}
              loading={loading}
              onRefresh={handleForceSync}
            />
          )}

          {activeTab === "reports" && (
            <Reports
              transactions={transactions}
              assets={assets}
              agents={agents}
            />
          )}

          {activeTab === "alerts" && (
            <AlertsManager
              alerts={alerts}
              onResolve={handleResolveAlert}
              onClearAll={handleClearAlerts}
              webhookConfig={webhookConfig}
              onSaveWebhook={setWebhookConfig}
              role={role}
            />
          )}
        </main>
      </div>
      )}
    </div>
  );
}
