import { doc, setDoc, getDocs, writeBatch } from "firebase/firestore";
import { db, assetsCol, agentsCol, transactionsCol } from "../firebase";
import { AssetStatus } from "../types";

const INITIAL_ASSETS = [
  {
    id: "AST-001",
    type: "iPad",
    name: "iPad Air Front Desk #1",
    serialNumber: "SN-IPAD-7762A",
    status: AssetStatus.IN_OFFICE,
    imageUrl: "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3"
  },
  {
    id: "AST-002",
    type: "iPad",
    name: "iPad Pro Delivery #2",
    serialNumber: "SN-IPAD-1193X",
    status: AssetStatus.ISSUED,
    imageUrl: "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    currentAssignmentId: "TX-1002"
  },
  {
    id: "AST-003",
    type: "Ingenico",
    name: "Ingenico Terminal A",
    serialNumber: "SN-ING-10928",
    status: AssetStatus.IN_OFFICE,
    imageUrl: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3"
  },
  {
    id: "AST-004",
    type: "Ingenico",
    name: "Ingenico Terminal B",
    serialNumber: "SN-ING-88271",
    status: AssetStatus.ISSUED,
    imageUrl: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    currentAssignmentId: "TX-1004"
  },
  {
    id: "AST-005",
    type: "Mobile Phone",
    name: "iPhone SE Admin #1",
    serialNumber: "SN-IPH-2281P",
    status: AssetStatus.IN_OFFICE,
    imageUrl: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3"
  },
  {
    id: "AST-006",
    type: "Mobile Phone",
    name: "Samsung A54 Manager #2",
    serialNumber: "SN-SAM-9981S",
    status: AssetStatus.MISSING,
    imageUrl: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    currentAssignmentId: "TX-1005"
  },
  {
    id: "AST-007",
    type: "iPad",
    name: "iPad Air Back Office",
    serialNumber: "SN-IPAD-3382W",
    status: AssetStatus.NOT_TAKEN,
    imageUrl: "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3"
  }
];

const INITIAL_AGENTS = [
  { id: "EMP101", name: "Ravi Kumar", department: "Front Desk & Reception" },
  { id: "EMP102", name: "Sarah Jenkins", department: "Delivery & Courier" },
  { id: "EMP103", name: "Miguel Alvarez", department: "POS Operations" },
  { id: "EMP104", name: "Aria Tan", department: "Supervisor Desk" },
  { id: "EMP105", name: "David Miller", department: "Shift Management" }
];

// Current local time is June 18, 2026.
// Let's seed precalculated times spanning today to make the dashboard look active.
const currentEpoch = new Date("2026-06-18T20:30:00").getTime();

const INITIAL_TRANSACTIONS = [
  {
    id: "TX-1001",
    assetId: "AST-001",
    assetName: "iPad Air Front Desk #1",
    assetType: "iPad",
    employeeId: "EMP101",
    agentName: "Ravi Kumar",
    department: "Front Desk & Reception",
    issueDate: "2026-06-18",
    issueTime: "08:00",
    issueTimestamp: currentEpoch - 12 * 60 * 60 * 1000, // 12h ago
    shift: "Morning",
    issueRemarks: "Morning shift front desk check-in",
    returnDate: "2026-06-18",
    returnTime: "16:15",
    returnTimestamp: currentEpoch - 4 * 60 * 60 * 1000, // 4h ago
    returnRemarks: "Returned pristine, fully charged",
    status: "Returned",
    durationMinutes: 495
  },
  {
    id: "TX-1002",
    assetId: "AST-002",
    assetName: "iPad Pro Delivery #2",
    assetType: "iPad",
    employeeId: "EMP102",
    agentName: "Sarah Jenkins",
    department: "Delivery & Courier",
    issueDate: "2026-06-18",
    issueTime: "15:00",
    issueTimestamp: currentEpoch - 5 * 30 * 60 * 1000, // 2.5 hours ago
    shift: "Afternoon",
    issueRemarks: "Issue for parcel dispatch scanning",
    status: "Issued"
  },
  {
    id: "TX-1003",
    assetId: "AST-003",
    assetName: "Ingenico Terminal A",
    assetType: "Ingenico",
    employeeId: "EMP103",
    agentName: "Miguel Alvarez",
    department: "POS Operations",
    issueDate: "2026-06-18",
    issueTime: "09:00",
    issueTimestamp: currentEpoch - 11 * 60 * 60 * 1000,
    shift: "Morning",
    issueRemarks: "Required at counter A",
    returnDate: "2026-06-18",
    returnTime: "17:00",
    returnTimestamp: currentEpoch - 3 * 30 * 60 * 1000,
    returnRemarks: "Device working normally",
    status: "Returned",
    durationMinutes: 480
  },
  {
    id: "TX-1004",
    assetId: "AST-004",
    assetName: "Ingenico Terminal B",
    assetType: "Ingenico",
    employeeId: "EMP104",
    agentName: "Aria Tan",
    department: "Supervisor Desk",
    issueDate: "2026-06-18",
    issueTime: "15:30",
    issueTimestamp: currentEpoch - 5 * 30 * 60 * 1000,
    shift: "Afternoon",
    issueRemarks: "Temporary deployment near lobby checkout",
    status: "Issued"
  },
  {
    id: "TX-1005",
    assetId: "AST-006",
    assetName: "Samsung A54 Manager #2",
    assetType: "Mobile Phone",
    employeeId: "EMP105",
    agentName: "David Miller",
    department: "Shift Management",
    issueDate: "2026-06-17", // Overdue! Issued yesterday morning and not returned
    issueTime: "07:30",
    issueTimestamp: currentEpoch - 37 * 60 * 60 * 1000,
    shift: "Morning",
    issueRemarks: "Taken for out of office coordinator visit",
    status: "Missing / Not Returned"
  }
];

export async function bootstrapDatabaseIfEmpty() {
  try {
    const assetsSnap = await getDocs(assetsCol);
    if (!assetsSnap.empty) {
      console.log("Database already seeded with assets.");
      return;
    }

    console.log("Seeding database with initial assets, agents and history...");

    // Seed Assets
    for (const asset of INITIAL_ASSETS) {
      await setDoc(doc(assetsCol, asset.id), asset);
    }

    // Seed Agents
    for (const agent of INITIAL_AGENTS) {
      await setDoc(doc(agentsCol, agent.id), agent);
    }

    // Seed Transactions
    for (const tx of INITIAL_TRANSACTIONS) {
      await setDoc(doc(transactionsCol, tx.id), tx);
    }

    console.log("Database seeded successfully!");
  } catch (err) {
    console.error("Error seeding database:", err);
  }
}
