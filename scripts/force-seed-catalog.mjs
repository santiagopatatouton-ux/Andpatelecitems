import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";

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

export const CATALOG_TREE = {
  'Canalizaciones': {
    'UCT': ['3/4', '100', '110', '112', '200'],
    'UMT': ['3/4', '100', '110', '112', '200'],
    'URT': ['3/4', '100', '110', '112', '200'],
    'GS': ['3/4', '100', '110', '112', '200'],
    'FT': ['3/4', '100', '110', '112', '200'],
  },
  'Protecciones': {
    'Diyuntores': {
      'Bifasicos': ['10', '16', '25', '32', '40'],
      'Trifasicos': ['10', '16', '25', '32', '40'],
    },
    'Termicas': {
      'Bifasicos': ['10', '16', '25', '32', '40'],
      'Trifasicos': ['10', '16', '25', '32', '40'],
    },
    'Contactores': {
      'Bifasicos': ['10', '16', '25', '32', '40'],
      'Trifasicos': ['10', '16', '25', '32', '40'],
    },
  },
  'Llaves de luz': {
    'Tapas': [
      '4 modulos',
      '3 modulos',
      '2 modulos',
      '1 modulo',
      'Tapa ciega',
      'Tapa mignon',
      'Tapa suplementaria',
      'Bastidores',
    ],
    'Pulsadores': ['De punto', 'Combinado', 'Pulsador'],
    'Bastidores': ['Tecla', 'Caja mignon'],
    'Tomas': {
      'Simples': ['20 amp', '10 amp'],
      'Dobles': ['20 amp', '10 amp'],
    },
  },
  'Cables': {
    'Unipolar': {
      '1mm': ['Rojo', 'Celeste', 'Marron', 'Negro', 'Tierra', 'Blanco'],
      '1,5mm': ['Rojo', 'Celeste', 'Marron', 'Negro', 'Tierra', 'Blanco'],
      '2,5mm': ['Rojo', 'Celeste', 'Marron', 'Negro', 'Tierra', 'Blanco'],
      '4mm': ['Rojo', 'Celeste', 'Marron', 'Negro', 'Tierra', 'Blanco'],
      '6mm': ['Rojo', 'Celeste', 'Marron', 'Negro', 'Tierra', 'Blanco'],
      '10mm': ['Rojo', 'Celeste', 'Marron', 'Negro', 'Tierra', 'Blanco'],
      '16mm': ['Rojo', 'Celeste', 'Marron', 'Negro', 'Tierra', 'Blanco'],
    },
    'Bipolar': ['3x2,5', '3x4', '3x6', '5x2,5', '5x4', '5x6'],
  },
  'Iluminacion': {
    'Plafones': ['17', '22x22', '10x10', '20x20', '40x40'],
    'Tubos': {},
    'Focos': ['Dicroicas', 'De embutir'],
  },
  'Varios': {},
};

async function run() {
  console.log("Checking current catalog...");
  const treeRef = doc(db, 'catalog', 'tree');
  const snap = await getDoc(treeRef);
  if (snap.exists()) {
    console.log("Current data keys:", Object.keys(snap.data()));
    console.log("Canalizaciones in DB:", JSON.stringify(snap.data().Canalizaciones));
  } else {
    console.log("Document does not exist");
  }

  console.log("Writing full CATALOG_TREE to Firestore...");
  await setDoc(treeRef, CATALOG_TREE);
  console.log("✅ Successfully written full CATALOG_TREE to Firestore!");
  process.exit(0);
}

run().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
