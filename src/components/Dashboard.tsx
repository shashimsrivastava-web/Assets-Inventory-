import React, { useState, useEffect } from "react";
import { Asset, Agent, Transaction, AssetStatus } from "../types";
import { Tablet, Smartphone, CreditCard, Shield, Laptop, AlertCircle, FileSpreadsheet, Search, CheckCircle, RefreshCw, AlertTriangle, Layers, Clock, HelpCircle, Layout } from "lucide-react";

interface DashboardProps {
  assets: Asset[];
  agents: Agent[];
  transactions: Transaction[];
  loading: boolean;
  onRefresh: () => void;
}

export default function Dashboard({ assets, agents, transactions, loading, onRefresh }: DashboardProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDeviceType, setSelectedDeviceType] = useState("All");

  // Filter conditions
  const matchesSearchAndType = (device: Asset) => {
    const term = searchTerm.toLowerCase();
    const activeAss = transactions.find(t => t.id === device.currentAssignmentId);

    const matchesType = selectedDeviceType === "All" || device.type === selectedDeviceType;

    const matchesText =
      device.id.toLowerCase().includes(term) ||
      device.name.toLowerCase().includes(term) ||
      (device.serialNumber || "").toLowerCase().includes(term) ||
      (activeAss && (
        activeAss.agentName.toLowerCase().includes(term) ||
        activeAss.employeeId.toLowerCase().includes(term)
      ));

    return matchesType && matchesText;
  };

  // Summary Metrics calculations
  const totalDevices = assets.length;
  const totalIpads = assets.filter((a) => a.type === "iPad").length;
  const totalIngenicos = assets.filter((a) => a.type === "Ingenico").length;
  const totalPhones = assets.filter((a) => a.type === "Mobile Phone").length;
  
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

  // Render icon helper
  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType.toLowerCase()) {
      case "ipad":
        return <Tablet className="w-5 h-5 text-emerald-500" />;
      case "ingenico":
        return <CreditCard className="w-5 h-5 text-indigo-500" />;
      case "mobile phone":
        return <Smartphone className="w-5 h-5 text-teal-400" />;
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
    const headers = ["Asset ID", "Type", "Device Name", "Serial Number", "Status"];
    const rows = list.map(a => [a.id, a.type, `"${a.name}"`, a.serialNumber || "N/A", a.status]);
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
      {/* 9 Summary Cards Grid */}
      <div id="dashboard-metrics-grid" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Devices</span>
          <div className="flex justify-between items-baseline mt-2">
            <span className="text-2xl font-bold text-slate-900">{totalDevices}</span>
            <span className="text-[9px] bg-slate-100 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded font-sans font-bold">Master</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total iPads</span>
          <div className="flex justify-between items-baseline mt-2">
            <span className="text-2xl font-bold text-slate-900">{totalIpads}</span>
            <Tablet className="w-4 h-4 text-slate-400" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Ingenico POS</span>
          <div className="flex justify-between items-baseline mt-2">
            <span className="text-2xl font-bold text-slate-900">{totalIngenicos}</span>
            <CreditCard className="w-4 h-4 text-slate-400" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Mobile Phones</span>
          <div className="flex justify-between items-baseline mt-2">
            <span className="text-2xl font-bold text-slate-900">{totalPhones}</span>
            <Smartphone className="w-4 h-4 text-slate-400" />
          </div>
        </div>

        {/* Action summaries row */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 border-l-4 border-l-indigo-500 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Active Issued</span>
          <div className="flex justify-between items-baseline mt-2">
            <span className="text-2xl font-bold text-indigo-600">{devicesIssued}</span>
            <span className="text-[9px] bg-indigo-50 text-indigo-600 border border-indigo-100 px-1.5 py-0.5 rounded font-sans font-bold">With-Agent</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 border-l-4 border-l-emerald-500 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Returned Today</span>
          <div className="flex justify-between items-baseline mt-2">
            <span className="text-2xl font-bold text-emerald-600">{devicesReturned}</span>
            <span className="text-[9px] bg-emerald-50 text-emerald-600 border border-emerald-100 px-1.5 py-0.5 rounded font-sans font-bold font-mono">Done</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 border-l-4 border-l-rose-500 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Unreturned Overdue</span>
          <div className="flex justify-between items-baseline mt-2">
            <span className="text-2xl font-bold text-rose-600">{overdueUnreturned.length}</span>
            <span className="text-[9px] bg-rose-50 text-rose-550 border border-rose-100 px-1.5 py-0.5 rounded font-sans font-bold animate-pulse">Critical</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 border-l-4 border-l-teal-500 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">In Office Available</span>
          <div className="flex justify-between items-baseline mt-2">
            <span className="text-2xl font-bold text-teal-650">{devicesAvailable}</span>
            <span className="text-[9px] bg-teal-50 text-teal-600 border border-teal-100 px-1.5 py-0.5 rounded font-sans font-bold">Ready</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col justify-between col-span-2 md:col-span-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Not Taken Device</span>
          <div className="flex justify-between items-baseline mt-2">
            <span className="text-2xl font-bold text-slate-450">{devicesNotTaken}</span>
            <span className="text-[9px] bg-slate-100 text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded font-sans font-bold">Unused</span>
          </div>
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
            className="px-3.5 py-2 text-xs border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500/50 text-slate-700 cursor-pointer font-semibold"
          >
            <option value="All">All Types</option>
            <option value="iPad">iPads</option>
            <option value="Ingenico">Ingenico POS</option>
            <option value="Mobile Phone">Mobile Phones</option>
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
                        <span className="text-[10px] text-slate-450 block mt-1.5">{device.type} · SN: <span className="font-mono">{device.serialNumber || "None"}</span></span>
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
                        <span className="text-[10px] text-slate-450 block mt-1.5">{device.type} · SN: <span className="font-mono">{device.serialNumber || "None"}</span></span>
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
    </div>
  );
}
