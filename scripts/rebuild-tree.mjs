import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, collection, getDocs, getDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC_i-7uv-oDBem62tzUBemFLLM09UJmH1Q",
  authDomain: "andpatelecitems.firebaseapp.com",
  projectId: "andpatelecitems"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function rebuild() {
  console.log("Fetching all stock items...");
  const snap = await getDocs(collection(db, 'stock'));
  
  const newTree = {};
  
  snap.forEach(docSnap => {
    const data = docSnap.data();
    if (!data.path || !Array.isArray(data.path) || data.path.length === 0) return;
    
    // Example: ["Canalizaciones", "Daisa", "3/4", "Caños"]
    // "Canalizaciones" -> object
    // "Daisa" -> object
    // "3/4" -> array (because it contains "Caños")
    // "Caños" -> string inside the array

    if (data.path.length === 1) {
      console.warn("Item at root level not supported:", data.path);
      return;
    }

    let current = newTree;
    // Go up to the second to last part (all these should be objects)
    for (let i = 0; i < data.path.length - 2; i++) {
      const part = data.path[i];
      if (!current[part]) {
        current[part] = {};
      } else if (Array.isArray(current[part])) {
        // If it was somehow initialized as an array, make it an object
        const newObj = {};
        for (const item of current[part]) {
            newObj[item] = [];
        }
        current[part] = newObj;
      }
      current = current[part];
    }
    
    // The parent of the item
    const parentName = data.path[data.path.length - 2];
    const itemName = data.path[data.path.length - 1];

    if (!current[parentName]) {
      current[parentName] = [];
    } else if (typeof current[parentName] === 'object' && !Array.isArray(current[parentName])) {
      // It was an object but needs to be an array for items
      // This means we have a conflict (mixed items and subcategories).
      // We will assume the stock items take precedence and convert the keys to an array?
      // Wait, if it's an object, it has subcategories.
      // Let's just push to a special array inside it to avoid losing data?
      // For now, if we are rebuilding from stock, this conflict shouldn't happen unless the user's tree had mixed types.
      // Let's just convert it to an array of its keys if this happens.
      current[parentName] = Object.keys(current[parentName]);
    }

    if (Array.isArray(current[parentName])) {
      if (!current[parentName].includes(itemName)) {
        current[parentName].push(itemName);
      }
    }
  });

  // Now, merge with the existing tree to preserve empty categories that have no stock
  console.log("Fetching current tree...");
  const treeRef = doc(db, 'catalog', 'tree');
  const treeSnap = await getDoc(treeRef);
  let currentTree = {};
  if (treeSnap.exists()) {
    currentTree = treeSnap.data();
  }

  // Simple recursive merge (newTree takes precedence)
  function merge(target, source) {
    for (const key of Object.keys(source)) {
      if (source[key] instanceof Object && !Array.isArray(source[key]) &&
          target[key] instanceof Object && !Array.isArray(target[key])) {
        merge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
    return target;
  }

  const finalTree = merge(currentTree, newTree);

  // Write to DB
  console.log("Saving rebuilt tree...");
  await setDoc(treeRef, finalTree);
  console.log("✅ Tree successfully rebuilt and saved!");
  process.exit(0);
}

rebuild().catch(e => {
  console.error(e);
  process.exit(1);
});
