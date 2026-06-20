import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, getDocs, updateDoc, addDoc, query, orderBy, onSnapshot } from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Export common refs
export const assetsCol = collection(db, "assets");
export const agentsCol = collection(db, "agents");
export const transactionsCol = collection(db, "transactions");
export const handoversCol = collection(db, "handovers");
export const deviceTypesCol = collection(db, "deviceTypes");
