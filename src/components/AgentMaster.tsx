import React, { useState } from "react";
import { Agent } from "../types";
import { Plus, Edit2, Trash2, Users, Search, RefreshCw, Briefcase, UserPlus } from "lucide-react";
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

  const resetForm = () => {
    setEmployeeId("");
    setName("");
    setDepartment("");
    setEditingAgent(null);
  };

  const handleOpenCreateForm = () => {
    resetForm();
    setIsFormOpen(true);
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
        </div>
      </div>

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
