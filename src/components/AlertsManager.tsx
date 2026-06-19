import React, { useState } from "react";
import { AlertLog, WebhookConfig } from "../types";
import { AlertTriangle, Bell, Shield, Mail, Webhook, Check, Trash2, Settings, HelpCircle, Send } from "lucide-react";

interface AlertsManagerProps {
  alerts: AlertLog[];
  onResolve: (id: string) => void;
  onClearAll: () => void;
  webhookConfig: WebhookConfig;
  onSaveWebhook: (config: WebhookConfig) => void;
  role: "Admin" | "Supervisor";
}

export default function AlertsManager({ alerts, onResolve, onClearAll, webhookConfig, onSaveWebhook, role }: AlertsManagerProps) {
  const [showConfig, setShowConfig] = useState(false);
  const [teamsUrl, setTeamsUrl] = useState(webhookConfig.teamsUrl || "");
  const [emailRecipient, setEmailRecipient] = useState(webhookConfig.emailRecipient || "");
  const [enabled, setEnabled] = useState(webhookConfig.enabled);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveWebhook({
      teamsUrl: teamsUrl.trim(),
      emailRecipient: emailRecipient.trim(),
      enabled
    });
    setShowConfig(false);
    alert("System alerts notification channels saved!");
  };

  const handleSimulateWebhook = () => {
    if (!enabled || (!teamsUrl && !emailRecipient)) {
      alert("Please ensure channels are enabled and configured to trigger simulations.");
      return;
    }
    
    alert(`📢 Notification Dispatch Simulation:
- Microsoft Teams URI: ${teamsUrl || "Not Configured"}
- Email Payload: ${emailRecipient || "Not Configured"}
Payload: [Asset Link Warning] Out-of-custody shift exceptions dispatched successfully!`);
  };

  const overdueAlertsCount = alerts.filter(a => !a.resolved && a.type === "overdue").length;
  const duplicateAlertsCount = alerts.filter(a => !a.resolved && a.type === "duplicate_issue").length;

  return (
    <div id="alerts-manager-pane" className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-rose-50 text-rose-500 rounded-xl relative border border-rose-100">
            <Bell className="w-5 h-5 text-rose-500" />
            {alerts.filter(a => !a.resolved).length > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-600 rounded-full animate-ping" />
            )}
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Operational Warnings</h2>
            <p className="text-slate-500 text-xs mt-0.5">Real-time alerts tracking inventory exceptions, duplicate registers and delays.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 rounded-xl text-xs font-semibold transition-all cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5 text-slate-500" />
            Notification Channels
          </button>
          
          {role === "Admin" && alerts.length > 0 && (
            <button
              onClick={onClearAll}
              className="flex items-center gap-1 px-3 py-1.5 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-semibold transition-colors shrink-0 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-500 hover:text-rose-600" />
              Clear Logs
            </button>
          )}
        </div>
      </div>

      {showConfig && (
        <form onSubmit={handleSave} className="mb-6 p-5 border border-slate-200 bg-slate-50/40 rounded-2xl animate-fadeIn space-y-4">
          <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500 flex items-center gap-1.5 font-sans">
            <Webhook className="w-4 h-4 text-indigo-500" />
            Automated Alert Channels Setup
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">MS Teams Incoming Webhook URL</label>
              <input
                type="url"
                value={teamsUrl}
                onChange={(e) => setTeamsUrl(e.target.value)}
                placeholder="https://outlook.office.com/webhook/..."
                className="w-full px-3.5 py-2 border border-slate-200 bg-white rounded-xl text-xs focus:ring-1 focus:ring-indigo-500/50 focus:outline-none transition-all font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email Notification Recipient</label>
              <input
                type="email"
                value={emailRecipient}
                onChange={(e) => setEmailRecipient(e.target.value)}
                placeholder="supervisor@operations.com"
                className="w-full px-3.5 py-2 border border-slate-200 bg-white rounded-xl text-xs focus:ring-1 focus:ring-indigo-500/50 focus:outline-none transition-all font-medium"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="w-4 h-4 text-indigo-605 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
              />
              Enable Real-Time Alerts Webhooks Integration
            </label>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSimulateWebhook}
                className="flex items-center gap-1 px-3 py-1.5 border border-slate-255 border-slate-200 bg-white hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-semibold cursor-pointer shadow-2xs"
              >
                <Send className="w-3 h-3 text-indigo-505 text-indigo-500" />
                Trigger Test Webhook
              </button>

              <button
                type="submit"
                className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer"
              >
                Save Channels Configure
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Real-time Alerts List Feed */}
      <div className="space-y-3">
        {alerts.length === 0 ? (
          <div className="py-12 border border-slate-200 rounded-2xl text-center text-slate-400 bg-slate-50/20">
            <Check className="w-8 h-8 text-emerald-500 mx-auto mb-2 animate-bounce" />
            <p className="text-xs font-semibold text-slate-800">Asset Inventory in Pristine State</p>
            <p className="text-[10px] text-slate-400 mt-1 max-w-xs mx-auto">No overdue devices, duplicates or exceptions logged.</p>
          </div>
        ) : (
          alerts.map((alertItem) => (
            <div
              key={alertItem.id}
              className={`p-4 border rounded-2xl flex items-start justify-between gap-4 transition-all animate-fadeIn ${
                alertItem.resolved
                  ? "bg-slate-50 border-slate-200 text-slate-500 opacity-75"
                  : alertItem.type === "overdue" || alertItem.type === "missing"
                  ? "bg-rose-50/20 border-rose-200 text-slate-850"
                  : "bg-amber-50/20 border-amber-200 text-slate-850"
              }`}
            >
              <div className="flex gap-3">
                <div className={`p-2 rounded-xl mt-0.5 shrink-0 border ${
                  alertItem.resolved
                    ? "bg-slate-100 text-slate-400 border-slate-200"
                    : alertItem.type === "overdue" || alertItem.type === "missing"
                    ? "bg-rose-100/40 text-rose-600 border-rose-200"
                    : "bg-amber-100/40 text-amber-600 border-amber-200"
                }`}>
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <strong className="text-xs font-bold text-slate-900">{alertItem.title}</strong>
                    <span className="text-[10px] text-slate-400 font-mono font-medium">
                      {new Date(alertItem.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {alertItem.resolved && (
                      <span className="bg-emerald-50 text-emerald-800 border border-emerald-100 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wide">
                        Resolved
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 mt-1">{alertItem.message}</p>
                  
                  {alertItem.assetId && (
                    <span className="inline-block mt-2 font-mono text-[9px] font-bold bg-slate-900 border border-slate-950 text-slate-200 px-1.5 py-0.5 rounded uppercase shadow-2xs">
                      Code Ref: {alertItem.assetId}
                    </span>
                  )}
                </div>
              </div>

              {!alertItem.resolved && (
                <button
                  onClick={() => onResolve(alertItem.id)}
                  className="px-2.5 py-1 text-[10px] font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-sm shrink-0 hover:text-emerald-600 hover:border-emerald-350 transition-colors cursor-pointer"
                  title="Mark alert as resolved"
                >
                  Resolve
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
