import React, { useState } from "react";
import { selectBaseClass, selectStyle, optionClass } from "../lib/selectTheme";
import { Transaction, Asset, Agent } from "../types";
import { Calendar, BarChart3, TrendingUp, HelpCircle, FileText, Smartphone, Users, RotateCcw, Search, Clock, Award, ShieldAlert } from "lucide-react";

interface ReportsProps {
  transactions: Transaction[];
  assets: Asset[];
  agents: Agent[];
}

export default function Reports({ transactions, assets, agents }: ReportsProps) {
  const [selectedAgentId, setSelectedAgentId] = useState("");

  // --- 1. Total Issues and Returns calculation ---
  const totalIssues = transactions.length;
  const totalReturns = transactions.filter((t) => t.status === "Returned").length;
  const totalOverdue = transactions.filter((t) => t.status === "Missing / Not Returned").length;

  // --- 2. Device Utilization by Type calculation ---
  // Count devices of each type that are currently Issued vs overall
  const typeStats = assets.reduce((acc, asset) => {
    if (!acc[asset.type]) {
      acc[asset.type] = { total: 0, issued: 0 };
    }
    acc[asset.type].total += 1;
    if (asset.currentAssignmentId || asset.status === "Issued") {
      acc[asset.type].issued += 1;
    }
    return acc;
  }, {} as { [key: string]: { total: number; issued: number } });

  // --- 3. Frequently Used Devices ---
  // Count transactions per asset ID
  const usageFrequency = transactions.reduce((acc, tx) => {
    acc[tx.assetId] = (acc[tx.assetId] || 0) + 1;
    return acc;
  }, {} as { [key: string]: number });

  // Sort and take top 5
  const topAssets = Object.entries(usageFrequency)
    .map(([id, count]) => {
      const assetObj = assets.find((a) => a.id === id);
      return {
        id,
        name: assetObj ? assetObj.name : "Archived Asset",
        type: assetObj ? assetObj.type : "Unknown",
        count
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // --- 4. Agent-wise Asset History Query ---
  const selectedAgentTransactions = selectedAgentId
    ? transactions.filter((t) => t.employeeId.toUpperCase() === selectedAgentId.toUpperCase())
    : [];

  const selectedAgentObj = agents.find((a) => a.id.toUpperCase() === selectedAgentId.toUpperCase());

  // Max count of usage to normalize bar widths
  const maxUsageCount = topAssets.length > 0 ? Math.max(...topAssets.map(a => a.count)) : 1;

  return (
    <div id="reports-board-pane" className="space-y-6">
      {/* 4 Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-indigo-50/50 text-indigo-600 rounded-xl border border-indigo-100/50">
            <TrendingUp className="w-5 h-5 text-indigo-500" />
          </div>
          <div>
            <h3 className="text-slate-400 font-bold text-[10px] uppercase tracking-wider font-sans">Total Cycle Issues</h3>
            <p className="text-2xl font-extrabold text-slate-900 mt-0.5">{totalIssues}</p>
            <span className="text-[10px] text-slate-400">All shifts combined</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-teal-50/50 text-teal-600 rounded-xl border border-teal-100/50">
            <Award className="w-5 h-5 text-teal-500" />
          </div>
          <div>
            <h3 className="text-slate-400 font-bold text-[10px] uppercase tracking-wider font-sans">Total Returns</h3>
            <p className="text-2xl font-extrabold text-slate-900 mt-0.5">{totalReturns}</p>
            <span className="text-[10px] text-teal-600 font-semibold">
              {totalIssues > 0 ? Math.round((totalReturns / totalIssues) * 100) : 0}% return rate
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-rose-50/60 text-rose-500 rounded-xl animate-pulse border border-rose-100/50">
            <ShieldAlert className="w-5 h-5 text-rose-500" />
          </div>
          <div>
            <h3 className="text-slate-400 font-bold text-[10px] uppercase tracking-wider font-sans">Outstanding Overdue</h3>
            <p className="text-2xl font-extrabold text-slate-900 mt-0.5">{totalOverdue}</p>
            <span className="text-[10px] text-rose-500 font-semibold">Action required</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-slate-50 text-slate-600 rounded-xl border border-slate-200/60">
            <Users className="w-5 h-5 text-slate-500" />
          </div>
          <div>
            <h3 className="text-slate-400 font-bold text-[10px] uppercase tracking-wider font-sans">Authorized Agents</h3>
            <p className="text-2xl font-extrabold text-slate-900 mt-0.5">{agents.length}</p>
            <span className="text-[10px] text-slate-400">Enrolled profiles</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Device Utilization by Type Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-1.5 border-b border-slate-100 pb-3 font-sans">
            <Smartphone className="w-4 h-4 text-indigo-500" />
            Device Utilization Real-time Ratio
          </h3>

          <div className="space-y-4">
            {Object.entries(typeStats).map(([typeName, stats]) => {
              const utilPercent = stats.total > 0 ? Math.round((stats.issued / stats.total) * 100) : 0;
              return (
                <div key={typeName} className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <div>
                      <strong className="text-slate-800 font-semibold">{typeName}s</strong>
                      <span className="text-slate-400 text-[10px] ml-1.5">({stats.issued} of {stats.total} with agents)</span>
                    </div>
                    <span className="inline-flex px-1.5 py-0.5 border border-slate-200 text-slate-705 bg-slate-50 font-mono text-[9px] font-bold rounded-lg shadow-2xs">
                      {utilPercent}% Active
                    </span>
                  </div>
                  {/* ProgressBar */}
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                      style={{ width: `${utilPercent}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {Object.keys(typeStats).length === 0 && (
              <p className="text-center text-slate-400 py-8 text-xs">Seeding master lists to compute utilization ratios.</p>
            )}
          </div>
        </div>

        {/* Top 5 Most Frequently Checked-Out Devices */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-1.5 border-b border-slate-100 pb-3 font-sans">
            <BarChart3 className="w-4 h-4 text-emerald-500" />
            Top 5 Frequently Used Devices (Friction Logs)
          </h3>

          <div className="space-y-3.5 animate-fadeIn">
            {topAssets.map((item) => {
              const widthPct = Math.round((item.count / maxUsageCount) * 100);
              return (
                <div key={item.id} className="flex items-center gap-3">
                  <span className="w-16 font-mono font-bold text-[9px] bg-slate-50 border border-slate-200 text-slate-700 px-1.5 py-0.5 rounded text-center shrink-0 shadow-2xs">
                    {item.id}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center text-xs mb-1">
                      <span className="font-semibold text-slate-800 truncate">{item.name}</span>
                      <span className="text-[10px] font-bold text-slate-800 bg-slate-100/50 px-1 rounded">{item.count} checkouts</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-lg overflow-hidden">
                      <div
                        className="h-full bg-slate-900 rounded-lg transition-all duration-500"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            {topAssets.length === 0 && (
              <p className="text-center text-slate-400 py-8 text-xs">No checkout logs registered yet to show frequency map.</p>
            )}
          </div>
        </div>
      </div>

      {/* Agent-Wise Asset History Explorer */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-1.5 border-b border-slate-100 pb-3 font-sans">
          <Users className="w-4 h-4 text-indigo-500" />
          Agent Handover History Lookup
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Select Agent to Generate History</label>
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className={`w-full h-10 ${selectBaseClass}`}
              style={selectStyle}
            >
              <option value="" className={optionClass}>-- Choose active agent from roster --</option>
              {agents.map((ag) => (
                <option key={ag.id} value={ag.id} className={optionClass}>
                  {ag.name} (ID: {ag.id} - {ag.department || "General Operational Team"})
                </option>
              ))}
            </select>
          </div>
          {selectedAgentId && (
            <div className="flex items-end">
              <button
                onClick={() => setSelectedAgentId("")}
                className="w-full py-2 border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-semibold text-slate-605 text-slate-600 bg-slate-50 hover:bg-slate-100/50 flex items-center justify-center gap-1 cursor-pointer transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Clear Selection
              </button>
            </div>
          )}
        </div>

        {selectedAgentId ? (
          <div className="space-y-4 animate-fadeIn">
            {selectedAgentObj && (
              <div className="p-4 bg-slate-50/50 border border-slate-200 rounded-2xl shadow-2xs">
                <h4 className="font-bold text-slate-900 text-sm">{selectedAgentObj.name}</h4>
                <p className="text-xs text-slate-500 mt-1">Roster Employee ID: <strong className="font-mono text-slate-700">{selectedAgentObj.id}</strong> · Department: <span className="inline-flex px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-[10px] font-bold text-indigo-700">{selectedAgentObj.department || "General Shift Operations"}</span></p>
              </div>
            )}

            <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-650">
                    <th className="p-3">Receipt</th>
                    <th className="p-3">Asset Code</th>
                    <th className="p-3">Asset Description</th>
                    <th className="p-3">Issue Details</th>
                    <th className="p-3">Return Details</th>
                    <th className="p-3">Live Status</th>
                    <th className="p-3 text-right">Custody Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-700">
                  {selectedAgentTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-400 italic">
                        No transactions registered in this shift cycle for this agent.
                      </td>
                    </tr>
                  ) : (
                    selectedAgentTransactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-50/30 transition-colors">
                        <td className="p-3 font-mono font-bold text-slate-400 text-[10px]">{tx.id}</td>
                        <td className="p-3 font-mono font-bold text-slate-905 text-slate-900">{tx.assetId}</td>
                        <td className="p-3">
                          <strong className="text-slate-800 font-bold">{tx.assetName}</strong>
                          <span className="text-[10px] text-slate-450 block mt-0.5">{tx.assetType}</span>
                        </td>
                        <td className="p-3">
                          <span className="font-mono text-slate-600">{tx.issueDate}</span> at <span className="font-mono text-slate-600">{tx.issueTime}</span>
                        </td>
                        <td className="p-3">
                          {tx.returnDate ? (
                            <span className="text-slate-600"><span className="font-mono">{tx.returnDate}</span> at <span className="font-mono">{tx.returnTime}</span></span>
                          ) : (
                            <span className="inline-block px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded">Active Custody</span>
                          )}
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
                        <td className="p-3 text-right font-mono font-bold text-slate-805 text-slate-800">
                          {tx.durationMinutes !== undefined && tx.durationMinutes !== null
                            ? `${tx.durationMinutes} min`
                            : "Active Custody"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="py-12 border border-dashed border-slate-200 rounded-2xl text-center text-slate-400 bg-slate-50/20">
            <Search className="w-8 h-8 text-slate-300 mx-auto mb-2 animate-pulse" />
            <p className="text-xs font-semibold text-slate-700">Roster History Ledger Is Unloaded</p>
            <p className="text-[11px] text-slate-400 mt-1 max-w-xs mx-auto">Please select an employee profile from the dropdown panel above to generate metrics.</p>
          </div>
        )}
      </div>
    </div>
  );
}
