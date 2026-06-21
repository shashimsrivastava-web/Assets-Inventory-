import React, { useState, useEffect } from "react";
import { onSnapshot, doc, getDocFromServer, query, orderBy, getDocs } from "firebase/firestore";
import { db, assetsCol, agentsCol, transactionsCol, handoversCol } from "./firebase";
import { bootstrapDatabaseIfEmpty } from "./utils/initDb";
import { Asset, Agent, Transaction, AlertLog, WebhookConfig, AssetStatus, Handover } from "./types";
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
import { LayoutDashboard, Key, Laptop, Users, History, BarChart3, Bell, Shield, Info, Database, User } from "lucide-react";

export default function App() {
  const [role, setRole] = useState<"Admin" | "Supervisor">("Supervisor");
  const [activeTab, setActiveTab] = useState<"dashboard" | "handover" | "assets" | "agents" | "audit" | "reports" | "alerts">("dashboard");
  const [activeShift, setActiveShift] = useState(getRecommendedShiftByTime());
  const [viewMode, setViewMode] = useState<"console" | "agent">("console");

  // Metric Navigation sync states
  const [assetSearchTerm, setAssetSearchTerm] = useState("");
  const [assetTypeFilter, setAssetTypeFilter] = useState("All");
  const [assetStatusFilter, setAssetStatusFilter] = useState("All");
  const [issueReturnInitialTab, setIssueReturnInitialTab] = useState<"issue" | "return" | "handover">("issue");

  // Console credentials permission validation
  const [isAuthenticatedSupervisor, setIsAuthenticatedSupervisor] = useState(() => sessionStorage.getItem("auth_supervisor") === "true");
  const [isAuthenticatedAdmin, setIsAuthenticatedAdmin] = useState(() => sessionStorage.getItem("auth_admin") === "true");
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");

  // Collections state
  const [assets, setAssets] = useState<Asset[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [handovers, setHandovers] = useState<Handover[]>([]);
  
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

    const unsubHandovers = onSnapshot(handoversCol, (snapshot) => {
      const list: Handover[] = [];
      snapshot.forEach((doc) => {
        list.push({ ...doc.data() } as Handover);
      });
      setHandovers(list);
    }, (error) => {
      console.warn("Handovers listener failed", error);
    });

    return () => {
      unsubAssets();
      unsubAgents();
      unsubTransactions();
      unsubHandovers();
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

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");

    const term = passwordInput.trim();
    if (!term) {
      setPasswordError("Passcode cannot be empty.");
      return;
    }

    if (role === "Supervisor") {
      if (term === "Supervisor220!") {
        setIsAuthenticatedSupervisor(true);
        sessionStorage.setItem("auth_supervisor", "true");
        setPasswordInput("");
      } else {
        setPasswordError("Invalid supervisor passcode. Please try again.");
      }
    } else if (role === "Admin") {
      if (term === "Admin220!") {
        setIsAuthenticatedAdmin(true);
        sessionStorage.setItem("auth_admin", "true");
        setPasswordInput("");
      } else {
        setPasswordError("Invalid administrator passcode. Please try again.");
      }
    }
  };

  const isCurrentRoleAuthenticated = role === "Supervisor" ? isAuthenticatedSupervisor : isAuthenticatedAdmin;

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
            handovers={handovers}
            activeShift={activeShift}
            onRefresh={handleForceSync}
            onAddAlert={handleAddNewAlert}
            onExitPortal={handleExitAgentPortal}
          />
        </main>
      ) : !isCurrentRoleAuthenticated ? (
        /* Custom secure console lock/entry screen overlay */
        <main className="flex-1 flex items-center justify-center p-6 md:p-12 bg-slate-50">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xl max-w-md w-full animate-fadeIn text-center space-y-6">
            <div className="space-y-2">
              <div className="flex justify-center mb-1">
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl text-slate-700 shadow-sm">
                  <Shield className="w-8 h-8 text-[#071d49]" />
                </div>
              </div>
              <h2 className="text-xl font-bold text-slate-900 font-sans tracking-tight">Console Authorization Required</h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                Access to the administrative control systems requires valid role verification credentials.
              </p>
            </div>

            <form onSubmit={handlePasswordSubmit} className="space-y-4 text-left">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1.5 tracking-wider font-sans">
                  Target Authority Role
                </label>
                {role === "Supervisor" ? (
                  <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-slate-50 text-slate-700 text-xs font-bold border border-slate-200">
                    <User className="w-4 h-4 text-[#071d49]" />
                    <span>Supervisor Desk Interface</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-indigo-50 text-indigo-800 text-xs font-bold border border-indigo-200">
                    <Shield className="w-4 h-4 text-indigo-600" />
                    <span>Administrator Console Interface</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1.5 tracking-wider font-sans">
                  Terminal Passcode
                </label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium tracking-wide focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-center font-mono"
                  autoFocus
                />
              </div>

              {passwordError && (
                <div className="text-xs text-rose-600 font-semibold bg-rose-50 border border-rose-100 px-3 py-2.5 rounded-xl text-center leading-relaxed font-sans">
                  ⚠️ {passwordError}
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 bg-[#071d49] hover:bg-[#0a2966] text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-md cursor-pointer transition-all active:scale-[0.98]"
              >
                Unlock Live Console
              </button>
            </form>

            <div className="flex flex-col gap-2 pt-4 border-t border-slate-100 text-center">
              <button
                type="button"
                onClick={handleSwitchToAgentPortal}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-bold hover:underline cursor-pointer font-sans"
              >
                ➔ Access General Agent Desk Gateway instead
              </button>
              
              {((role === "Admin" && isAuthenticatedSupervisor) || (role === "Supervisor" && isAuthenticatedAdmin)) && (
                <button
                  type="button"
                  onClick={() => {
                    setPasswordError("");
                    setPasswordInput("");
                    setRole(role === "Admin" ? "Supervisor" : "Admin");
                  }}
                  className="text-[10.5px] text-slate-500 hover:text-slate-700 font-medium hover:underline cursor-pointer mt-1 font-sans"
                >
                  Cancel & Return to {role === "Admin" ? "Supervisor" : "Admin"} Console View
                </button>
              )}
            </div>
          </div>
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
              onClick={() => {
                setIssueReturnInitialTab("issue");
                setActiveTab("handover");
              }}
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
              onClick={() => {
                setAssetTypeFilter("All");
                setAssetSearchTerm("");
                setAssetStatusFilter("All");
                setActiveTab("assets");
              }}
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

            {/* Lock Console Session Button */}
            {(isAuthenticatedSupervisor || isAuthenticatedAdmin) && (
              <button
                onClick={() => {
                  setIsAuthenticatedSupervisor(false);
                  setIsAuthenticatedAdmin(false);
                  sessionStorage.removeItem("auth_supervisor");
                  sessionStorage.removeItem("auth_admin");
                  setPasswordInput("");
                  setPasswordError("");
                }}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 border border-slate-200 hover:border-rose-200 bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-700 text-[11px] font-bold rounded-xl shadow-3xs transition-all cursor-pointer"
              >
                <Shield className="w-3.5 h-3.5 text-slate-400" />
                Lock Console Session
              </button>
            )}

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
              onNavigateToAssets={(typeFilter, searchTerm, statusFilter) => {
                setAssetTypeFilter(typeFilter || "All");
                setAssetSearchTerm(searchTerm || "");
                setAssetStatusFilter(statusFilter || "All");
                setActiveTab("assets");
              }}
              onNavigateToIssueReturn={(subTab) => {
                setIssueReturnInitialTab(subTab || "issue");
                setActiveTab("handover");
              }}
            />
          )}

          {activeTab === "handover" && (
            <IssueReturnForm
              assets={assets}
              agents={agents}
              transactions={transactions}
              role={role}
              activeShift={activeShift}
              onRefresh={handleForceSync}
              onAddAlert={handleAddNewAlert}
              initialTab={issueReturnInitialTab}
            />
          )}

          {activeTab === "assets" && (
            <AssetMaster
              assets={assets}
              role={role}
              loading={loading}
              onRefresh={handleForceSync}
              onAddAlert={handleAddNewAlert}
              initialTypeFilter={assetTypeFilter}
              initialSearchTerm={assetSearchTerm}
              initialStatusFilter={assetStatusFilter}
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
              role={role}
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
