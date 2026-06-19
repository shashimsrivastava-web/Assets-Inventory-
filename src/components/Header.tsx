import React, { useState, useEffect } from "react";
import { Laptop, Shield, User, Clock, AlertTriangle } from "lucide-react";
import { HOURLY_SHIFTS } from "../utils/shiftConfig";

interface HeaderProps {
  role: "Admin" | "Supervisor";
  setRole: (role: "Admin" | "Supervisor") => void;
  activeShift: string;
  isAgentPortal?: boolean;
  onChangeShift?: (shift: string) => void;
}

// Custom inline high-fidelity mobile smartphone device logo vector
export function SmartphoneLogo({ 
  className = "w-10 h-10", 
  color = "#071d49", 
  bgColor = "#ffffff" 
}: { 
  className?: string; 
  color?: string; 
  bgColor?: string; 
}) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Outer Glow / Soft Background circle if bgColor is provided */}
      {bgColor && <circle cx="50" cy="50" r="48" fill={bgColor} />}
      
      {/* Outer circular blueprint stamp style border */}
      <circle cx="50" cy="50" r="45" stroke={color} strokeWidth="2.5" fill="none" className="opacity-90" />
      
      {/* Smartphone Body */}
      <rect 
        x="32" 
        y="16" 
        width="34" 
        height="66" 
        rx="7" 
        fill={bgColor} 
        stroke={color} 
        strokeWidth="3.5" 
      />
      
      {/* Smartphone Screen Inner */}
      <rect 
        x="36" 
        y="22" 
        width="26" 
        height="47" 
        rx="2.5" 
        fill="#f8fafc" 
        stroke={color} 
        strokeWidth="1.5" 
      />
      
      {/* Smartphone Top Earpiece Speaker */}
      <line 
        x1="45" 
        y1="19.5" 
        x2="53" 
        y2="19.5" 
        stroke={color} 
        strokeWidth="1.5" 
        strokeLinecap="round" 
      />
      
      {/* Phone Screen UI - Checkmark representing check-in/out and transaction completion */}
      <path 
        d="M 42 45 L 47 50 L 56 38" 
        stroke={color} 
        strokeWidth="3" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
      />
      
      {/* Dynamic Screen Accents (Battery bar, Wifi lines) */}
      {/* Battery outline top right */}
      <rect x="55" y="24" width="5" height="2.5" rx="0.5" stroke={color} strokeWidth="0.8" fill="none" />
      <rect x="56" y="24.8" width="3" height="1" fill={color} />
      
      {/* Wifi Indicator top left */}
      <path d="M 39 24.5 A 2 2 0 0 1 41.5 24.5" stroke={color} strokeWidth="0.8" strokeLinecap="round" />
      <circle cx="40" cy="26.5" r="0.5" fill={color} />
      
      {/* Home Button Indicator */}
      <circle cx="49" cy="76" r="2.5" fill={color} />
    </svg>
  );
}

// Keep the old logo name exported pointing to the new smartphone logo to prevent import breakages
export const LufthansaCraneSvg = SmartphoneLogo;

export default function Header({ role, setRole, activeShift, isAgentPortal, onChangeShift }: HeaderProps) {
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
      <div className="flex items-center gap-3.5">
        <div id="app-logo-container" className="flex items-center justify-center shrink-0">
          <SmartphoneLogo className="w-11 h-11" color="#071d49" bgColor="#ffffff" />
        </div>
        <div className="border-l border-slate-200 pl-3.5">
          <h1 className="font-bold text-base md:text-lg tracking-tight text-[#071d49] leading-tight">
            Lufthansa Group DELSM Electronics Devices Inventory Log
          </h1>
          <p id="app-subtitle" className="text-xs text-slate-500 font-semibold mt-0.5">Lufthansa Shift Asset Issue & Return Desk</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {/* Real-time Clock & Active Shift */}
        <div id="header-time-container" className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-1.5 flex items-center gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-1.5 border-r border-slate-200 pr-3">
            <Clock className="w-3.5 h-3.5 text-indigo-500" />
            <span className="font-mono font-medium">{formatDate(time)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-semibold text-[11px] uppercase tracking-wider">Shift:</span>
            {onChangeShift ? (
              <select
                id="header-shift-select"
                value={activeShift}
                onChange={(e) => onChangeShift(e.target.value)}
                className="bg-emerald-55 bg-emerald-50 text-emerald-800 border border-emerald-250 border-emerald-200 px-2 py-1 rounded font-bold uppercase tracking-wide text-[10px] cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
              >
                {HOURLY_SHIFTS.map((shift) => (
                  <option key={shift.value} value={shift.value} className="text-slate-800 font-sans tracking-normal capitalize font-medium text-xs">
                    {shift.label}
                  </option>
                ))}
              </select>
            ) : (
              <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded font-bold uppercase tracking-wider text-[10px]">
                {activeShift}
              </span>
            )}
          </div>
        </div>

        {/* Role Toggle Switcher */}
        {!isAgentPortal && (
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
        )}
      </div>
    </header>
  );
}
