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

function renameInTree(tree, path, oldName, newName) {
  if (path.length === 0) {
    if (tree[oldName] !== undefined) {
      tree[newName] = tree[oldName];
      delete tree[oldName];
      return true;
    }
    return false;
  }

  let current = tree;
  for (let i = 0; i < path.length; i++) {
    const seg = path[i];
    if (current && typeof current === 'object' && !Array.isArray(current)) {
      current = current[seg];
    } else {
      return false;
    }
  }

  if (Array.isArray(current)) {
    const idx = current.indexOf(oldName);
    if (idx !== -1) {
      current[idx] = newName;
      return true;
    }
  } else if (current && typeof current === 'object') {
    if (current[oldName] !== undefined) {
      current[newName] = current[oldName];
      delete current[oldName];
      return true;
    }
  }

  return false;
}

async function test() {
  const treeRef = doc(db, 'catalog', 'tree');
  const snap = await getDoc(treeRef);
  const fullTree = snap.data();

  console.log("Current full tree structure:");
  console.log(JSON.stringify(fullTree, null, 2));

  // Test renaming "Daisa" to "Daisa_Test" inside Canalizaciones
  console.log("\nTesting rename Daisa -> Daisa_Test in Canalizaciones...");
  const success = renameInTree(fullTree, ['Canalizaciones'], 'Daisa', 'Daisa_Test');
  console.log("Rename result:", success);
  if (success) {
    await setDoc(treeRef, fullTree);
    console.log("Saved to Firestore successfully!");

    // Rename back
    renameInTree(fullTree, ['Canalizaciones'], 'Daisa_Test', 'Daisa');
    await setDoc(treeRef, fullTree);
    console.log("Renamed back to Daisa and saved successfully!");
  }
}

test().catch(console.error);
