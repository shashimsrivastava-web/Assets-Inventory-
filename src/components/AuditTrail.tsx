import React, { useState } from "react";
import { selectBaseClass, selectStyle, optionClass } from "../lib/selectTheme";
import { Transaction } from "../types";
import { Search, Download, FileSpreadsheet, Printer, Activity, ClipboardList, RefreshCw, Calendar, Clock, RotateCcw, Trash2, Shield } from "lucide-react";
import { db } from "../firebase";
import { deleteDoc, doc, updateDoc } from "firebase/firestore";
import { DEVICE_TYPE_ORDER } from "../utils/deviceTypeSort";

interface AuditTrailProps {
  transactions: Transaction[];
  loading: boolean;
  onRefresh: () => void;
  role?: "Admin" | "Supervisor";
}

export default function AuditTrail({ transactions, loading, onRefresh, role = "Supervisor" }: AuditTrailProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState("All");
  const [selectedShift, setSelectedShift] = useState("All");
  const [selectedStatus, setSelectedStatus] = useState("All");
  
  // Admin Purge States
  const [showClearModal, setShowClearModal] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [passcodeError, setPasscodeError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const resetFilters = () => {
    setSearchTerm("");
    setSelectedType("All");
    setSelectedShift("All");
    setSelectedStatus("All");
    setStartDate("");
    setEndDate("");
  };

  const filteredTransactions = transactions.filter((tx) => {
    // Search filter
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      tx.id.toLowerCase().includes(term) ||
      tx.assetId.toLowerCase().includes(term) ||
      tx.assetName.toLowerCase().includes(term) ||
      tx.employeeId.toLowerCase().includes(term) ||
      tx.agentName.toLowerCase().includes(term);

    // Dropdown filters
    const matchesType = selectedType === "All" || tx.assetType === selectedType;
    const matchesShift = selectedShift === "All" || tx.shift === selectedShift;
    const matchesStatus = selectedStatus === "All" || tx.status === selectedStatus;

    // Date filters
    let matchesDate = true;
    if (startDate) {
      matchesDate = matchesDate && tx.issueDate >= startDate;
    }
    if (endDate) {
      matchesDate = matchesDate && tx.issueDate <= endDate;
    }

    return matchesSearch && matchesType && matchesShift && matchesStatus && matchesDate;
  });

  // Export to Excel / CSV
  const handleExportCSV = () => {
    if (filteredTransactions.length === 0) {
      alert("No data available to export.");
      return;
    }

    // Header row
    const headers = [
      "Transaction ID",
      "Asset ID",
      "Asset Name",
      "Asset Type",
      "Employee ID",
      "Agent Name",
      "Department",
      "Issue Date",
      "Issue Time",
      "Shift",
      "Issue Remarks",
      "Return Date",
      "Return Time",
      "Return Remarks",
      "Status",
      "Duration (Minutes)"
    ];

    const rows = filteredTransactions.map((tx) => [
      tx.id,
      tx.assetId,
      `"${tx.assetName.replace(/"/g, '""')}"`,
      tx.assetType,
      tx.employeeId,
      `"${tx.agentName.replace(/"/g, '""')}"`,
      `"${tx.department.replace(/"/g, '""')}"`,
      tx.issueDate,
      tx.issueTime,
      tx.shift,
      `"${(tx.issueRemarks || "").replace(/"/g, '""')}"`,
      tx.returnDate || "",
      tx.returnTime || "",
      `"${(tx.returnRemarks || "").replace(/"/g, '""')}"`,
      tx.status,
      tx.durationMinutes !== undefined && tx.durationMinutes !== null ? tx.durationMinutes : ""
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Asset_Audit_Trail_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print Trail
  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const rowsHtml = filteredTransactions.map((tx) => `
      <tr>
        <td>${tx.id}</td>
        <td>${tx.assetId}</td>
        <td>${tx.assetName}</td>
        <td>${tx.agentName} (${tx.employeeId})</td>
        <td>${tx.issueDate} ${tx.issueTime}</td>
        <td>${tx.returnDate ? tx.returnDate + " " + tx.returnTime : "With Agent"}</td>
        <td>${tx.status}</td>
        <td>${tx.durationMinutes !== undefined && tx.durationMinutes !== null ? tx.durationMinutes + " min" : "-"}</td>
      </tr>
    `).join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>Asset Control Audit Trail Report</title>
          <style>
            body { font-family: sans-serif; padding: 20px; color: #333; }
            h2 { border-bottom: 2px solid #5d5dff; padding-bottom: 8px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { bg-color: #f5f5f5; font-weight: bold; }
          </style>
        </head>
        <body>
          <h2>Asset Issue & Return Audit Report</h2>
          <p>Generated on: ${new Date().toLocaleString()}</p>
          <table>
            <thead>
              <tr>
                <th>Tx ID</th>
                <th>Asset ID</th>
                <th>Asset Name</th>
                <th>Agent</th>
                <th>Issued</th>
                <th>Returned</th>
                <th>Status</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <script>window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Helper for duration display
  const formatDuration = (minutes?: number | null) => {
    if (minutes === undefined || minutes === null) return "Active Session";
    if (minutes < 60) return `${minutes} min`;
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hrs}h ${mins}m`;
  };

  // Pre-calculate items older than 2 days
  const cutoff = Date.now() - 2 * 24 * 60 * 60 * 1000;
  const legacyCount = transactions.filter(t => t.issueTimestamp < cutoff).length;

  const handleClearTrash = async () => {
    setIsDeleting(true);
    setPasscodeError("");
    
    const cutoffDate = Date.now() - 2 * 24 * 60 * 60 * 1000;
    const oldTransactions = transactions.filter(t => t.issueTimestamp < cutoffDate);
    
    try {
      let deletedCount = 0;
      let assetUpdatesCount = 0;
      
      for (const tx of oldTransactions) {
        // Safe check: if this transaction is the active assignment of an asset,
        // we'll update the asset state to prevent dangling references.
        if (tx.status !== "Returned") {
          try {
            await updateDoc(doc(db, "assets", tx.assetId), {
              currentAssignmentId: null,
              status: "In Office"
            });
            assetUpdatesCount++;
          } catch (err) {
            console.error(`Could not clean active assignment on asset ${tx.assetId}:`, err);
          }
        }
        
        // Delete the transaction doc
        await deleteDoc(doc(db, "transactions", tx.id));
        deletedCount++;
      }
      
      alert(`Successfully purged ${deletedCount} historic transaction logs older than 2 days from the secure repository.${assetUpdatesCount > 0 ? ` Resolved ${assetUpdatesCount} active custody bindings.` : ""}`);
      setShowClearModal(false);
      setPasscode("");
      onRefresh(); // Trigger force sync/refresh callback
    } catch (error) {
      console.error("Purging transactional databases failed:", error);
      alert("Error: Insufficient database clearance or internet connection issue.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleVerifyAndClear = (e: React.FormEvent) => {
    e.preventDefault();
    if (role === "Admin") {
      handleClearTrash();
    } else {
      if (passcode.trim() === "Admin220!") {
        handleClearTrash();
      } else {
        setPasscodeError("Invalid Administrator passcode credentials.");
      }
    }
  };

  return (
    <div id="audit-trail-control" className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-indigo-500" />
            Audit Ledger & Activity Logs
          </h2>
          <p className="text-slate-500 text-xs mt-1">Immutable transaction ledger capturing all issuances and checkouts.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setPasscodeError("");
              setPasscode("");
              setShowClearModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 border border-rose-200 text-rose-705 text-rose-700 bg-rose-50 hover:bg-rose-100 hover:border-rose-350 hover:text-rose-900 font-bold rounded-xl text-xs transition-all cursor-pointer shadow-3xs"
            title="Clear all transactions and logs older than 2 days"
          >
            <Trash2 className="w-4 h-4 text-rose-605 text-rose-600 animate-pulse shrink-0" />
            <span>Purge History {legacyCount > 0 && `(${legacyCount})`}</span>
          </button>
          <button
            onClick={onRefresh}
            className="p-2 border border-slate-205 hover:border-indigo-200 bg-white text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/10 rounded-xl transition-colors cursor-pointer border border-slate-200"
            title="Reload Transactions"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            Export CSV
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4 text-slate-500" />
            Print Report
          </button>
        </div>
      </div>

      {/* Multilevel Search & Filters */}
      <div className="p-4 bg-slate-50/40 border border-slate-200 rounded-2xl space-y-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <label className="block text-[10px] uppercase font-bold text-slate-450 text-slate-400 mb-1.5 font-sans">Search Fields</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
                <Search className="w-4 h-4 text-slate-400" />
              </span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Agent, Asset ID, Employee ID..."
                className="w-full pl-10 pr-3 py-2 text-xs border border-slate-200 bg-white rounded-xl focus:ring-1 focus:ring-indigo-500/50 focus:outline-none transition-all font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-450 text-slate-400 mb-1.5 font-sans">Device Type</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className={`w-full h-10 ${selectBaseClass} text-xs`}
              style={selectStyle}
            >
              <option value="All" className={optionClass}>All types</option>
              {DEVICE_TYPE_ORDER.map(type => (
                <option key={type} value={type} className={optionClass}>{type}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-450 text-slate-400 mb-1.5 font-sans">Shift</label>
            <select
              value={selectedShift}
              onChange={(e) => setSelectedShift(e.target.value)}
              className={`w-full h-10 ${selectBaseClass} text-xs`}
              style={selectStyle}
            >
              <option value="All" className={optionClass}>All shifts</option>
              <option value="Morning" className={optionClass}>Morning</option>
              <option value="Afternoon" className={optionClass}>Afternoon</option>
              <option value="Night" className={optionClass}>Night</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-200/60">
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-450 text-slate-400 mb-1.5 font-sans">Operational Status</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className={`w-full h-10 ${selectBaseClass} text-xs`}
              style={selectStyle}
            >
              <option value="All" className={optionClass}>All states</option>
              <option value="Issued" className={optionClass}>Issued</option>
              <option value="Returned" className={optionClass}>Returned</option>
              <option value="Missing / Not Returned" className={optionClass}>Missing / Not Returned</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-450 text-slate-400 mb-1.5 font-sans">Issue Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3.5 py-2 text-xs border border-slate-200 bg-white rounded-xl focus:ring-1 focus:ring-indigo-500/50 focus:outline-none transition-all font-mono font-medium"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-450 text-slate-400 mb-1.5 font-sans">Issue End Date</label>
            <div className="flex gap-2">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="flex-1 px-3.5 py-2 text-xs border border-slate-200 bg-white rounded-xl focus:ring-1 focus:ring-indigo-500/50 focus:outline-none transition-all font-mono font-medium"
              />
              <button
                onClick={resetFilters}
                className="px-3 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-800 rounded-xl text-xs flex items-center gap-1 font-semibold transition-all shrink-0 cursor-pointer"
                title="Reset Filters"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Clear
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Audit List Table */}
      <div className="overflow-x-auto border border-slate-200 rounded-2xl bg-white shadow-xs animate-fadeIn">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-650">
              <th className="p-3">Receipt ID</th>
              <th className="p-3">Asset</th>
              <th className="p-3">Agent Holder</th>
              <th className="p-3">Checkout (Issued)</th>
              <th className="p-3">Check-In (Returned)</th>
              <th className="p-3">Shift</th>
              <th className="p-3">Live Status</th>
              <th className="p-3 text-right">Duration</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-slate-700">
            {filteredTransactions.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-slate-400 font-sans">
                  <Activity className="w-8 h-8 text-slate-300 mx-auto mb-2 animate-pulse" />
                  <p className="font-semibold text-sm text-slate-700">No transaction logs match selection criteria.</p>
                </td>
              </tr>
            ) : (
              filteredTransactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50/30 transition-colors">
                  <td className="p-3 font-mono font-semibold text-slate-400 text-[10px]">{tx.id}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200 px-1.5 py-0.5 rounded uppercase text-[9px]">
                        {tx.assetId}
                      </span>
                      <strong className="text-slate-800 font-bold text-xs">{tx.assetName}</strong>
                    </div>
                    <span className="text-[10px] text-slate-500 block mt-1">{tx.assetType}</span>
                  </td>
                  <td className="p-3">
                    <div className="font-semibold text-slate-800 text-[12px]">{tx.agentName}</div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                      {tx.employeeId} · {tx.department}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1.5 text-slate-600 font-medium font-sans">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-mono text-[11px]">{tx.issueDate}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 text-slate-400 font-mono text-[10px]">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>{tx.issueTime}</span>
                    </div>
                  </td>
                  <td className="p-3">
                    {tx.returnDate ? (
                      <>
                        <div className="flex items-center gap-1.5 text-slate-600 font-medium font-sans">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-mono text-[11px]">{tx.returnDate}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 text-slate-400 font-mono text-[10px]">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>{tx.returnTime}</span>
                        </div>
                      </>
                    ) : (
                      <span className="inline-block px-1.5 py-0.5 text-[10px] font-bold text-amber-705 text-amber-700 bg-amber-50/50 rounded border border-amber-100">With Agent</span>
                    )}
                  </td>
                  <td className="p-3 text-[11px] font-bold text-slate-550 text-slate-500 uppercase">{tx.shift}</td>
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
                    {(tx.issueRemarks !== "None specified" || tx.returnRemarks) && (
                      <div className="text-[10px] text-slate-500 italic mt-1.5 max-w-xs break-all">
                        {tx.returnRemarks ? `Return note: ${tx.returnRemarks}` : `Issue note: ${tx.issueRemarks}`}
                      </div>
                    )}
                  </td>
                  <td className="p-3 font-mono text-right text-slate-800 font-bold">
                    {formatDuration(tx.durationMinutes)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showClearModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-2xl max-w-md w-full text-center space-y-6">
            <div className="space-y-2">
              <div className="flex justify-center mb-1">
                <div className="p-3 bg-rose-50 border border-rose-100 rounded-2xl text-rose-700 shadow-sm animate-bounce">
                  <Shield className="w-8 h-8 text-rose-600" />
                </div>
              </div>
              <h2 className="text-xl font-extrabold text-slate-900 font-sans tracking-tight">
                {role === "Admin" ? "Confirm Legacy Purge" : "Admin Credentials Required"}
              </h2>
              <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                {role === "Admin" ? (
                  `You are about to permanently clear all transaction logs and device history records older than 2 days. This will purge ${legacyCount} items.`
                ) : (
                  `Purging historic logs is strictly restricted to Administrator capabilities. Please enter the live terminal passcode to authorize deleting ${legacyCount} legacy records:`
                )}
              </p>
            </div>

            <form onSubmit={handleVerifyAndClear} className="space-y-4 text-left font-sans">
              {role !== "Admin" && (
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1.5 tracking-wider font-sans">
                    Admin Terminal Passcode
                  </label>
                  <input
                    type="password"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    className="w-full h-12 px-4 bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 rounded-xl text-sm font-semibold tracking-wide transition-all text-center font-mono"
                    autoFocus
                  />
                </div>
              )}

              {passcodeError && (
                <div className="text-xs text-rose-600 font-extrabold bg-rose-50 border border-rose-100 px-3 py-2.5 rounded-xl text-center leading-relaxed font-sans">
                  ⚠️ {passcodeError}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowClearModal(false)}
                  disabled={isDeleting}
                  className="flex-1 h-11 text-slate-705 text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 font-extrabold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDeleting || legacyCount === 0}
                  className="flex-1 h-11 bg-rose-605 hover:bg-rose-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-md cursor-pointer transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {isDeleting ? (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  <span>{isDeleting ? "Purging..." : "Confirm Purge"}</span>
                </button>
              </div>
              
              {legacyCount === 0 && (
                <p className="text-[10px] text-center text-amber-606 text-amber-700 font-bold bg-amber-50 rounded-lg p-2 border border-amber-200">
                  Notice: No legacy transactions older than 2 days exist in the database.
                </p>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
