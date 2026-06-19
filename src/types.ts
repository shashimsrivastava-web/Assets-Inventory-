import { collection } from "firebase/firestore";

export enum AssetStatus {
  IN_OFFICE = "In Office",
  ISSUED = "Issued",
  RETURNED = "Returned", // temporary or historical status
  MISSING = "Missing / Not Returned",
  NOT_TAKEN = "Not Taken"
}

export interface Asset {
  id: string; // Asset ID (e.g., AST-001)
  type: "iPad" | "Ingenico" | "Mobile Phone" | string;
  name: string; // Device Name/Number (e.g., iPad Pro 1)
  serialNumber?: string;
  status: AssetStatus;
  currentAssignmentId?: string | null;
  imageUrl?: string;
  lastUpdated?: number;
}

export interface Agent {
  id: string; // Employee ID (e.g., EMP001)
  name: string;
  department?: string;
  lastActivity?: number;
}

export interface Transaction {
  id: string;
  assetId: string;
  assetName: string;
  assetType: string;
  employeeId: string;
  agentName: string;
  department: string;
  issueDate: string; // YYYY-MM-DD
  issueTime: string; // HH:MM
  issueTimestamp: number; // For calculations and sorting
  shift: "Morning" | "Afternoon" | "Night" | string;
  issueRemarks: string;
  returnDate?: string | null;
  returnTime?: string | null;
  returnTimestamp?: number | null;
  returnRemarks?: string | null;
  status: "Issued" | "Returned" | "Missing / Not Returned";
  durationMinutes?: number | null;
}

export interface AlertLog {
  id: string;
  type: "overdue" | "missing" | "duplicate_issue" | "already_returned" | "system";
  title: string;
  message: string;
  timestamp: number;
  resolved: boolean;
  assetId?: string;
}

export interface WebhookConfig {
  teamsUrl?: string;
  emailRecipient?: string;
  enabled: boolean;
}

export interface Handover {
  id: string; // Document ID (usually same as assetId for single active pending handover per device)
  assetId: string;
  assetName: string;
  assetType: string;
  fromAgentId: string;
  fromAgentName: string;
  toAgentId: string;
  toAgentName: string;
  status: "pending" | "completed" | "declined";
  timestamp: number;
  remarks?: string;
}

