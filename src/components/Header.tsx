import React, { useState, useEffect } from "react";
import { Laptop, Shield, User, Clock, AlertTriangle } from "lucide-react";

interface HeaderProps {
  role: "Admin" | "Supervisor";
  setRole: (role: "Admin" | "Supervisor") => void;
  activeShift: string;
}

export default function Header({ role, setRole, activeShift }: HeaderProps) {
  const [time, setTime] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatDate = (date: Date) => {
    return date.toLocaleString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  };

  return (
    <header id="app-header" className="bg-white border-b border-slate-200 text-slate-800 px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4 sticky top-0 z-40">
      <div className="flex items-center gap-3">
        <div id="app-logo-container" className="p-2.5 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-100 flex items-center justify-center">
          <Laptop id="app-logo-icon" className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="font-bold text-lg tracking-tight text-slate-900">
            Asset-Link Shift Pro
          </h1>
          <p id="app-subtitle" className="text-xs text-slate-500 font-medium">Shift Asset Issue & Return Control</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {/* Real-time Clock & Active Shift */}
        <div id="header-time-container" className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-1.5 flex items-center gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-1.5 border-r border-slate-200 pr-3">
            <Clock className="w-3.5 h-3.5 text-indigo-500" />
            <span className="font-mono font-medium">{formatDate(time)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-slate-400 font-medium">Shift:</span>
            <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded font-bold uppercase tracking-wider text-[10px]">
              {activeShift}
            </span>
          </div>
        </div>

        {/* Role Toggle Switcher */}
        <div id="role-toggle-container" className="flex items-center bg-slate-100 border border-slate-200 p-1 rounded-xl shadow-xs">
          <button
            id="role-supervisor-btn"
            onClick={() => setRole("Supervisor")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
              role === "Supervisor"
                ? "bg-white text-slate-900 border border-slate-200/50 shadow-xs"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <User className="w-3.5 h-3.5" />
            Supervisor
          </button>
          <button
            id="role-admin-btn"
            onClick={() => setRole("Admin")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
              role === "Admin"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-100"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            Admin (Full Control)
          </button>
        </div>
      </div>
    </header>
  );
}
