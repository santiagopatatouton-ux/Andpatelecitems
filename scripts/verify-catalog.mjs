import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";

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

async function verify() {
  const treeRef = doc(db, 'catalog', 'tree');
  const snap = await getDoc(treeRef);
  if (snap.exists()) {
    const data = snap.data();
    console.log("=== FIRESTORE CATALOG TREE VERIFICATION ===");
    for (const key of Object.keys(data)) {
      console.log(`\n📁 [${key}]:`);
      console.log(JSON.stringify(data[key], null, 2));
    }
  } else {
    console.log("No catalog found in Firestore!");
  }
  process.exit(0);
}

verify().catch((e) => {
  console.error(e);
  process.exit(1);
});
