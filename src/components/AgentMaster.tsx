import React, { useState } from "react";
import { Agent } from "../types";
import { Plus, Edit2, Trash2, Users, Search, RefreshCw, Briefcase, UserPlus, UploadCloud, FileSpreadsheet } from "lucide-react";
import { addDoc, deleteDoc, doc, setDoc } from "firebase/firestore";
import { agentsCol } from "../firebase";

interface AgentMasterProps {
  agents: Agent[];
  role: "Admin" | "Supervisor";
  loading: boolean;
  onRefresh: () => void;
}

export default function AgentMaster({ agents, role, loading, onRefresh }: AgentMasterProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);

  // Search input
  const [searchTerm, setSearchTerm] = useState("");

  // Form states
  const [employeeId, setEmployeeId] = useState("");
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");

  // CSV Upload states
  const [isCsvOpen, setIsCsvOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parsedAgents, setParsedAgents] = useState<Agent[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [isCsvImporting, setIsCsvImporting] = useState(false);
  const [importFeedback, setImportFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const resetForm = () => {
    setEmployeeId("");
    setName("");
    setDepartment("");
    setEditingAgent(null);
  };

  const handleOpenCreateForm = () => {
    resetForm();
    setIsCsvOpen(false); // Close CSV panel if opening form
    setIsFormOpen(true);
  };

  // Drag-and-drop CSV handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith(".csv") || file.type === "text/csv") {
        processCsvFile(file);
      } else {
        alert("Please upload a valid CSV (.csv) file.");
      }
    }
  };

  const handleFileSelectChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processCsvFile(e.target.files[0]);
    }
  };

  const processCsvFile = (file: File) => {
    setCsvFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) {
          alert("The uploaded file is empty.");
          return;
        }

        const lines = text.split(/\r?\n/);
        const results: Agent[] = [];

        for (const line of lines) {
          if (!line.trim()) continue;

          // Simple CSV line parse respecting quote encapsulation
          let parts: string[] = [];
          if (line.includes('"')) {
            let currentPart = "";
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
              const c = line[i];
              if (c === '"') {
                inQuotes = !inQuotes;
              } else if (c === ',' && !inQuotes) {
                parts.push(currentPart);
                currentPart = "";
              } else {
                currentPart += c;
              }
            }
            parts.push(currentPart);
          } else {
            parts = line.split(',');
          }

          if (parts.length < 2) continue;

          const empId = parts[0].trim().toUpperCase();
          const agentName = parts[1].trim();

          // Skip empty rows or potential CSV column header labels
          if (!empId || !agentName) continue;
          if (
            empId === "ID" ||
            empId === "EMPLOYEE ID" ||
            empId === "EMPLOYEE_ID" ||
            empId === "U NUMBER" ||
            empId === "UNUMBER" ||
            empId === "EMPLOYEEID" ||
            empId === "U-NUMBER" ||
            (empId.toLowerCase() === "id" && agentName.toLowerCase() === "name")
          ) {
            continue;
          }

          // Determine department: default to "DELSM" as requested by user
          let dept = parts[2] ? parts[2].trim() : "";
          if (!dept) {
            dept = "DELSM";
          }

          results.push({
            id: empId,
            name: agentName,
            department: dept,
            lastActivity: Date.now()
          });
        }

        if (results.length === 0) {
          alert("No valid agent records found in the CSV. Form format is Expected: ID, Name, Department (optional).");
          setCsvFile(null);
          setParsedAgents([]);
        } else {
          setParsedAgents(results);
        }
      } catch (err) {
        console.error("Error parsing CSV:", err);
        alert("An error occurred while reading the CSV content.");
      }
    };
    reader.readAsText(file);
  };

  const handleCommitCsvImport = async () => {
    if (parsedAgents.length === 0) return;
    setIsCsvImporting(true);
    setImportFeedback(null);

    let successCount = 0;
    let failureCount = 0;

    try {
      for (const agent of parsedAgents) {
        try {
          await setDoc(doc(agentsCol, agent.id), agent);
          successCount++;
        } catch (err) {
          console.error(`Failed to record agent: ${agent.id}`, err);
          failureCount++;
        }
      }

      setImportFeedback({
        type: "success",
        text: `Roster update completed successfully! Registered ${successCount} agents (${failureCount} failed).`
      });

      // Try calling alert safely, but don't fail if the browser/iframe denies modals
      try {
        alert(`Roster update completed successfully!\n\nAuthorized Agents registered: ${successCount}\nFailed: ${failureCount}`);
      } catch (alertErr) {
        console.warn("System modal alert blocked by user's browser sandbox environment:", alertErr);
      }

      // Reset and refresh database state after a brief visual confirmation delay or instantly
      setCsvFile(null);
      setParsedAgents([]);
      // Keep panel open briefly if they want to read, or close it after 1.5 seconds so they can see success
      setTimeout(() => {
        setIsCsvOpen(false);
        setImportFeedback(null);
      }, 2500);

      onRefresh();
    } catch (globalErr) {
      console.error("Bulk upload transaction crash:", globalErr);
      setImportFeedback({
        type: "error",
        text: "Failed during bulk upload execution. Check operations and try again."
      });
      try {
        alert("Failed during bulk upload execution. Please try again.");
      } catch (alertErr) {}
    } finally {
      setIsCsvImporting(false);
    }
  };

  const handleEdit = (agent: Agent) => {
    setEditingAgent(agent);
    setEmployeeId(agent.id);
    setName(agent.name);
    setDepartment(agent.department || "");
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!employeeId.trim() || !name.trim()) {
      alert("Employee ID and Name are mandatory fields.");
      return;
    }

    const cleanedEmpId = employeeId.trim().toUpperCase();

    // Check duplicate employee ID is blocked
    if (!editingAgent) {
      if (agents.some((a) => a.id.toUpperCase() === cleanedEmpId)) {
        alert(`Employee with ID ${cleanedEmpId} is already registered!`);
        return;
      }
    }

    const agentData: Agent = {
      id: cleanedEmpId,
      name: name.trim(),
      department: department.trim() || undefined,
      lastActivity: Date.now()
    };

    try {
      await setDoc(doc(agentsCol, cleanedEmpId), agentData);
      setIsFormOpen(false);
      resetForm();
      onRefresh();
    } catch (error) {
      console.error("Error saving agent: ", error);
      alert("Failed to save agent specifications.");
    }
  };

  const handleDelete = async (id: string) => {
    if (role !== "Admin") {
      alert("Only Admins can delete agents from the system.");
      return;
    }
    if (!window.confirm(`Are you sure you want to de-register employee ${id}? History database logs will remain.`)) {
      return;
    }

    try {
      await deleteDoc(doc(agentsCol, id));
      onRefresh();
    } catch (error) {
      console.error("Error deleting agent: ", error);
      alert("Failed to de-register employee.");
    }
  };

  const filteredAgents = agents.filter((agent) => {
    const term = searchTerm.toLowerCase();
    return (
      agent.id.toLowerCase().includes(term) ||
      agent.name.toLowerCase().includes(term) ||
      (agent.department || "").toLowerCase().includes(term)
    );
  });

  return (
    <div id="agent-master-pane" className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-500" />
            Registered Shift Agents
          </h2>
          <p className="text-slate-500 text-xs mt-1">Enroll and update team members authorized to be issued shift devices.</p>
        </div>
        <div className="flex items-center gap-2 sm:self-end">
          <button
            onClick={onRefresh}
            className="p-2 border border-slate-200 hover:border-indigo-205 rounded-xl bg-white text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/10 transition-colors cursor-pointer border border-slate-200"
            title="Reload Agents"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            id="register-agent-button"
            onClick={handleOpenCreateForm}
            className="flex items-center gap-1.5 px-4 py-2 text-white bg-slate-900 hover:bg-slate-800 font-semibold rounded-xl text-xs tracking-wide shadow-sm transition-all cursor-pointer animate-fadeIn"
          >
            <UserPlus className="w-4 h-4" />
            Enroll New Agent
          </button>
          {role === "Admin" && (
            <button
              id="bulk-csv-upload-button"
              onClick={() => {
                setIsCsvOpen(!isCsvOpen);
                setIsFormOpen(false); // Close individual enroll form
              }}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 hover:border-indigo-500 text-slate-700 bg-white hover:bg-indigo-50/10 font-semibold rounded-xl text-xs tracking-wide shadow-sm transition-all cursor-pointer animate-fadeIn"
            >
              <UploadCloud className="w-4 h-4 text-indigo-500" />
              Upload CSV Roster
            </button>
          )}
        </div>
      </div>

      {role === "Admin" && isCsvOpen && (
        <div id="csv-import-panel" className="mb-6 p-5 border border-dashed border-slate-250 bg-slate-50/40 rounded-2xl animate-fadeIn">
          <div className="flex justify-between items-center mb-3">
            <div>
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <FileSpreadsheet className="w-4.5 h-4.5 text-indigo-505 shrink-0" />
                Bulk Import Authorized Agents from CSV
              </h3>
              <p className="text-[11px] text-slate-500 mt-1 font-medium">
                Upload shift-compliant personnel data from a spreadsheet roster file.
              </p>
            </div>
            <button
              onClick={() => {
                setIsCsvOpen(false);
                setCsvFile(null);
                setParsedAgents([]);
              }}
              className="text-xs text-slate-400 hover:text-slate-650 cursor-pointer font-medium font-sans border border-slate-200 px-2.5 py-1 rounded-lg bg-white"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mt-4">
            <div className="lg:col-span-5 space-y-3">
              <div className="bg-white border border-slate-150 rounded-xl p-4 text-xs text-slate-650 leading-relaxed space-y-2">
                <div className="font-bold text-slate-800 uppercase tracking-widest text-[9.5px]">
                  📋 Required CSV Columns
                </div>
                <div className="flex items-start gap-1">
                  <span className="font-bold text-indigo-650">Column 1:</span>
                  <span><strong>Employee ID / U-Number</strong> (e.g. U1051, EMP002)</span>
                </div>
                <div className="flex items-start gap-1">
                  <span className="font-bold text-indigo-650">Column 2:</span>
                  <span><strong>Full Name</strong></span>
                </div>
                <div className="flex items-start gap-1">
                  <span className="font-bold text-indigo-650">Column 3:</span>
                  <span><strong>Department/Team</strong> (Optional. If omitted or blank, defaults to <strong className="text-amber-700 font-bold bg-amber-50 px-1 border border-amber-100/60 rounded">DELSM</strong>)</span>
                </div>
                <div className="pt-2 border-t border-slate-100 text-slate-400 font-mono text-[9px] flex gap-1 justify-between">
                  <span>Sample:</span>
                  <span className="text-slate-500">U582103, Michael Scott, DELSM</span>
                </div>
              </div>

              {/* Drag and Drop Zone */}
              <div
                className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer relative ${
                  dragActive
                    ? "border-indigo-550 bg-indigo-50/30"
                    : "border-slate-250 hover:border-indigo-500 hover:bg-slate-50/10"
                }`}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => document.getElementById("csv-file-input")?.click()}
              >
                <input
                  type="file"
                  id="csv-file-input"
                  className="hidden"
                  accept=".csv,text/csv"
                  onChange={handleFileSelectChange}
                />
                
                <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-2.5 border border-indigo-100">
                  <UploadCloud className="w-5 h-5 shrink-0" />
                </div>
                <p className="text-xs font-bold text-slate-800">
                  {csvFile ? csvFile.name : "Choose roster file or Drag & Drop"}
                </p>
                <p className="text-[10.5px] text-slate-400 mt-1">
                  {csvFile 
                    ? `Size: ${(csvFile.size / 1024).toFixed(1)} KB` 
                    : "Supports standard comma-separated text files (.csv)"
                  }
                </p>
              </div>
            </div>

            <div className="lg:col-span-7 flex flex-col justify-between border border-slate-150 rounded-xl bg-white p-4">
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-3">
                  <span className="text-[11.5px] font-bold text-slate-700 uppercase tracking-wider">
                    Upload Roster Preview ({parsedAgents.length} agents detected)
                  </span>
                  {parsedAgents.length > 0 && (
                    <button
                      onClick={() => {
                        setCsvFile(null);
                        setParsedAgents([]);
                      }}
                      className="text-[10px] text-rose-500 hover:underline font-bold tracking-wider uppercase cursor-pointer"
                    >
                      Reset Preview
                    </button>
                  )}
                </div>

                <div className="overflow-y-auto max-h-[170px] text-xs space-y-1.5 pr-1 divide-y divide-slate-100">
                  {parsedAgents.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 font-medium italic">
                      No records loaded. Select or drag a valid CSV file to preview.
                    </div>
                  ) : (
                    parsedAgents.map((ag, idx) => (
                      <div key={idx} className="pt-2 first:pt-0 flex items-center justify-between text-[11px] text-slate-700">
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold text-indigo-700 w-16">{ag.id}</span>
                          <span className="font-semibold text-slate-800">{ag.name}</span>
                        </div>
                        <div>
                          {ag.department === "DELSM" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[9px] font-bold uppercase tracking-wider">
                              DELSM (Default)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-650 text-[9px] font-bold uppercase tracking-wider">
                              {ag.department}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {importFeedback && (
                <div id="csv-import-feedback-banner" className={`mt-3 p-3 rounded-xl text-xs font-semibold ${
                  importFeedback.type === "success" 
                    ? "bg-emerald-50 border border-emerald-250 text-emerald-800" 
                    : "bg-rose-50 border border-rose-250 text-rose-800"
                }`}>
                  {importFeedback.type === "success" ? "✅" : "⚠️"} {importFeedback.text}
                </div>
              )}

              <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <span className="text-[10px] text-slate-400 font-semibold leading-normal max-w-sm">
                  {parsedAgents.length > 0 
                    ? "Carefully audit the parsed results. Existing registered IDs will have their specs updated." 
                    : "No file loaded. Ready to receive roster CSV records."
                  }
                </span>

                <button
                  type="button"
                  disabled={parsedAgents.length === 0 || isCsvImporting}
                  onClick={handleCommitCsvImport}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold shadow-sm transition uppercase tracking-wider cursor-pointer text-center ${
                    parsedAgents.length > 0 && !isCsvImporting
                      ? "bg-indigo-600 text-white hover:bg-indigo-700"
                      : "bg-slate-100 text-slate-450 cursor-not-allowed border border-slate-200"
                  }`}
                >
                  {isCsvImporting ? "Importing..." : `Authorize Roster ✅`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isFormOpen && (
        <div className="mb-6 p-5 border border-slate-200 bg-slate-50/40 rounded-2xl animate-fadeIn">
          <h3 className="font-bold text-sm text-slate-900 mb-4">
            {editingAgent ? "✏️ Edit" : "👤 Register"} Employee Profile
          </h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Employee ID * (e.g. EMP106)</label>
              <input
                type="text"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                placeholder="EMPXXX"
                className="w-full px-3.5 py-2 border border-slate-200 bg-white rounded-xl text-sm font-medium focus:ring-1 focus:ring-indigo-500/50 focus:outline-none transition-all uppercase"
                disabled={!!editingAgent}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Full Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Agent full name"
                className="w-full px-3.5 py-2 border border-slate-200 bg-white rounded-xl text-sm font-medium focus:ring-1 focus:ring-indigo-500/50 focus:outline-none transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Department or Team</label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Courier, Delivery, Admin"
                className="w-full px-3.5 py-2 border border-slate-200 bg-white rounded-xl text-sm font-medium focus:ring-1 focus:ring-indigo-500/50 focus:outline-none transition-all"
              />
            </div>

            <div className="md:col-span-3 flex justify-end gap-3 mt-2">
              <button
                type="button"
                onClick={() => {
                  setIsFormOpen(false);
                  resetForm();
                }}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-medium hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl text-xs font-bold shadow-md shadow-indigo-600/10 transition"
              >
                {editingAgent ? "Modify Employee Spec" : "Authorize Employee Profile"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter and Search */}
      <div className="relative mb-4">
        <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
          <Search className="w-4 h-4 text-slate-400" />
        </span>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search Employee ID, Name, Category, or Team..."
          className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-xl bg-white hover:bg-slate-50/50 transition-all focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm("")}
            className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-xs text-slate-400 hover:text-slate-650 cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      {/* Agents Table List */}
      <div className="overflow-x-auto border border-slate-200 rounded-2xl bg-white shadow-xs">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-650 text-xs">
              <th className="p-4">Employee ID</th>
              <th className="p-4">Agent Name</th>
              <th className="p-4">Department / Team</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-slate-700">
            {filteredAgents.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-8 text-center text-slate-400">
                  <Briefcase className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="font-semibold text-sm text-slate-705">No match found.</p>
                  <p className="text-xs text-slate-400 mt-1">Try refining your search keyword or enrolling a new agent.</p>
                </td>
              </tr>
            ) : (
              filteredAgents.map((agent) => (
                <tr key={agent.id} className="hover:bg-slate-50/30 transition-colors">
                  <td className="p-4 font-mono font-bold text-slate-900">{agent.id}</td>
                  <td className="p-4 font-medium text-slate-800">{agent.name}</td>
                  <td className="p-4">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50/40 border border-indigo-100 text-indigo-700 text-[10px] font-bold">
                      {agent.department || "General Shift Operations"}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => handleEdit(agent)}
                        className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-indigo-600 rounded-lg transition-colors border border-transparent hover:border-slate-200 cursor-pointer"
                        title="Edit Agent Details"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(agent.id)}
                        className="p-1.5 hover:bg-rose-50 text-slate-500 hover:text-rose-600 rounded-lg transition-colors border border-transparent hover:border-rose-200 cursor-pointer"
                        title="De-register Agent"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-slate-500 hover:text-rose-600" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
