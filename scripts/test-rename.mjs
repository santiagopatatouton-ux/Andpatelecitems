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

async function testRename() {
  const treeRef = doc(db, 'catalog', 'tree');
  const snap = await getDoc(treeRef);
  const fullTree = snap.data();

  console.log("Root keys:", Object.keys(fullTree));
  console.log("Canalizaciones keys:", Object.keys(fullTree.Canalizaciones));
  
  // Test rename UCT to UCT_TEST and back
  console.log("Renaming UCT -> UCT_TEST...");
  fullTree.Canalizaciones["UCT_TEST"] = fullTree.Canalizaciones["UCT"];
  delete fullTree.Canalizaciones["UCT"];
  await setDoc(treeRef, fullTree);
  console.log("Renamed to UCT_TEST successfully!");

  // Rename back
  fullTree.Canalizaciones["UCT"] = fullTree.Canalizaciones["UCT_TEST"];
  delete fullTree.Canalizaciones["UCT_TEST"];
  await setDoc(treeRef, fullTree);
  console.log("Renamed back to UCT successfully!");

  process.exit(0);
}

testRename().catch((e) => {
  console.error(e);
  process.exit(1);
});
