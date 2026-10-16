import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC_i-7uv-oDBem62tzUBemFLLM09UJmH1Q",
  authDomain: "andpatelecitems.firebaseapp.com",
  projectId: "andpatelecitems",
  storageBucket: "andpatelecitems.firebasestorage.app",
  messagingSenderId: "654849034296",
  appId: "1:654849034296:web:b6fc7c66c8b71d00107ecd",
  measurementId: "G-QBNYHCMY0F"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function cleanTree(node) {
  if (Array.isArray(node)) {
    return node;
  }
  if (!node || typeof node !== 'object') {
    return node;
  }

  const keys = Object.keys(node);
  if (keys.length === 0) {
    return {};
  }

  // Check if this object is actually a list of final items that got saved as { "item1": [], "item2": [] }
  const allValuesAreEmptyArrays = keys.length > 0 && keys.every(
    (k) => Array.isArray(node[k]) && node[k].length === 0
  );

  if (allValuesAreEmptyArrays) {
    console.log("Converting object of empty arrays to flat array of items:", keys);
    return keys;
  }

  // Otherwise, recursively clean children
  const result = {};
  for (const key of keys) {
    result[key] = cleanTree(node[key]);
  }
  return result;
}

async function fix() {
  const treeRef = doc(db, 'catalog', 'tree');
  const snap = await getDoc(treeRef);
  if (!snap.exists()) {
    console.log("No tree found!");
    return;
  }

  const current = snap.data();
  console.log("Cleaning tree...");
  const cleaned = cleanTree(current);

  console.log("\nCleaned tree preview:");
  console.log(JSON.stringify(cleaned, null, 2));

  await setDoc(treeRef, cleaned);
  console.log("\n✅ Successfully updated Firestore with cleaned structure!");
  process.exit(0);
}

fix().catch((e) => {
  console.error(e);
  process.exit(1);
});
