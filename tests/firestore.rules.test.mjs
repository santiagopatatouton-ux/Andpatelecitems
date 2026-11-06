// Tests de firestore.rules. Corren contra el emulador local, con un proyecto
// "demo-" que no puede tocar datos reales. Uso: npm run test:rules
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, it } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  setLogLevel,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

const ADMIN = 'admin-uid';
const OTHER_ADMIN = 'other-admin-uid';
const EMPLOYEE = 'employee-uid';
const COWORKER = 'coworker-uid';
const STRANGER = 'stranger-uid';

const PATH = ['Cables', 'Unipolar', '1mm', 'Rojo'];

let env;
const db = (uid) => env.authenticatedContext(uid).firestore();
const anonymousDb = () => env.unauthenticatedContext().firestore();

const movement = (userId, overrides = {}) => ({
  path: PATH,
  action: 'retirar',
  quantity: 2,
  stockBefore: 10,
  stockAfter: 8,
  notes: '',
  timestamp: serverTimestamp(),
  userId,
  userName: 'Nombre',
  ...overrides,
});

const order = (userId, overrides = {}) => ({
  userId,
  userName: 'Nombre',
  items: [{ path: PATH, name: 'Rojo', quantity: 1 }],
  notes: '',
  status: 'pending',
  createdAt: serverTimestamp(),
  ...overrides,
});

const resolution = (uid, status) => ({
  status,
  resolvedBy: uid,
  resolvedByName: 'Admin',
  resolvedAt: serverTimestamp(),
});

before(async () => {
  setLogLevel('error');
  env = await initializeTestEnvironment({
    projectId: 'demo-andpatelec',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

after(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const seed = context.firestore();
    await setDoc(doc(seed, 'users', ADMIN), { displayName: 'Admin', role: 'admin' });
    await setDoc(doc(seed, 'users', OTHER_ADMIN), { displayName: 'Otro', role: 'admin' });
    await setDoc(doc(seed, 'users', EMPLOYEE), { displayName: 'Emp', role: 'employee' });
    await setDoc(doc(seed, 'users', COWORKER), { displayName: 'Comp', role: 'employee' });
    await setDoc(doc(seed, 'catalog', 'tree'), { Cables: {} });
    await setDoc(doc(seed, 'stock', 'item'), { path: PATH, stock: 10 });
    await setDoc(doc(seed, 'orders', 'pending'), order(EMPLOYEE, { createdAt: 1 }));
    await setDoc(doc(seed, 'movements', 'mine'), movement(EMPLOYEE, { timestamp: 1 }));
    await setDoc(doc(seed, 'movements', 'theirs'), movement(COWORKER, { timestamp: 1 }));
    await setDoc(doc(seed, 'audit_log', 'event'), { adminId: ADMIN, timestamp: 1 });
    await setDoc(doc(seed, 'users', EMPLOYEE, 'favorites', 'fav'), { path: PATH });
  });
});

describe('sin login', () => {
  it('no lee ni escribe nada', async () => {
    await assertFails(getDoc(doc(anonymousDb(), 'catalog', 'tree')));
    await assertFails(getDocs(collection(anonymousDb(), 'users')));
    await assertFails(getDocs(collection(anonymousDb(), 'stock')));
    await assertFails(setDoc(doc(anonymousDb(), 'stock', 'item'), { path: PATH, stock: 1 }));
  });
});

describe('cuenta autoregistrada sin perfil', () => {
  it('no accede a ningún dato', async () => {
    const stranger = db(STRANGER);
    await assertFails(getDoc(doc(stranger, 'catalog', 'tree')));
    await assertFails(getDocs(collection(stranger, 'stock')));
    await assertFails(getDocs(collection(stranger, 'orders')));
    await assertFails(getDocs(collection(stranger, 'movements')));
    await assertFails(getDocs(collection(stranger, 'users')));
    await assertFails(getDoc(doc(stranger, 'audit_log', 'event')));
    await assertFails(setDoc(doc(stranger, 'stock', 'item'), { path: PATH, stock: 999 }));
    await assertFails(addDoc(collection(stranger, 'orders'), order(STRANGER)));
    await assertFails(addDoc(collection(stranger, 'movements'), movement(STRANGER)));
  });

  it('no puede crearse un perfil', async () => {
    await assertFails(
      setDoc(doc(db(STRANGER), 'users', STRANGER), { displayName: 'X', role: 'admin' })
    );
    await assertFails(
      setDoc(doc(db(STRANGER), 'users', STRANGER), { displayName: 'X', role: 'employee' })
    );
  });

  it('puede consultar su propio perfil inexistente, como hace el login', async () => {
    await assertSucceeds(getDoc(doc(db(STRANGER), 'users', STRANGER)));
  });
});

describe('empleado', () => {
  it('lee el catálogo pero no lo edita', async () => {
    await assertSucceeds(getDoc(doc(db(EMPLOYEE), 'catalog', 'tree')));
    await assertFails(setDoc(doc(db(EMPLOYEE), 'catalog', 'tree'), {}));
  });

  it('ve solo su perfil y no se sube el rol', async () => {
    await assertSucceeds(getDoc(doc(db(EMPLOYEE), 'users', EMPLOYEE)));
    await assertFails(getDoc(doc(db(EMPLOYEE), 'users', COWORKER)));
    await assertFails(getDocs(collection(db(EMPLOYEE), 'users')));
    await assertFails(updateDoc(doc(db(EMPLOYEE), 'users', EMPLOYEE), { role: 'admin' }));
    await assertFails(updateDoc(doc(db(EMPLOYEE), 'users', COWORKER), { role: 'admin' }));
    await assertFails(deleteDoc(doc(db(EMPLOYEE), 'users', COWORKER)));
  });

  it('mueve stock como la pantalla de ítem', async () => {
    const ref = doc(db(EMPLOYEE), 'stock', 'item');
    await assertSucceeds(getDocs(collection(db(EMPLOYEE), 'stock')));
    await assertSucceeds(
      setDoc(ref, { path: PATH, stock: 8, lastUpdated: serverTimestamp() }, { merge: true })
    );
    await assertSucceeds(
      setDoc(ref, { path: PATH, unitOfMeasure: 'metro', lastUpdated: serverTimestamp() }, { merge: true })
    );
    await assertSucceeds(
      setDoc(ref, { imageUrl: null, lastUpdated: serverTimestamp() }, { merge: true })
    );
    await assertSucceeds(
      setDoc(doc(db(EMPLOYEE), 'stock', 'nuevo'), { path: PATH, stock: 3, unitCost: 10.5 }, { merge: true })
    );
  });

  it('no deja stock inválido ni borra documentos de stock', async () => {
    const ref = doc(db(EMPLOYEE), 'stock', 'item');
    await assertFails(setDoc(ref, { path: PATH, stock: -1 }, { merge: true }));
    await assertFails(setDoc(ref, { path: PATH, stock: 'mucho' }, { merge: true }));
    await assertFails(setDoc(doc(db(EMPLOYEE), 'stock', 'sin-path'), { stock: 1 }));
    await assertFails(deleteDoc(ref));
  });

  it('registra movimientos propios y no los altera', async () => {
    const movements = collection(db(EMPLOYEE), 'movements');
    await assertSucceeds(addDoc(movements, movement(EMPLOYEE)));
    await assertSucceeds(
      addDoc(movements, movement(EMPLOYEE, { action: 'compra', unitCost: 5, totalCost: 10, supplier: 'S' }))
    );
    await assertFails(addDoc(movements, movement(COWORKER)));
    await assertFails(addDoc(movements, movement(EMPLOYEE, { quantity: 0 })));
    await assertFails(addDoc(movements, movement(EMPLOYEE, { action: 'robar' })));
    await assertFails(addDoc(movements, movement(EMPLOYEE, { timestamp: new Date(0) })));
    await assertFails(updateDoc(doc(db(EMPLOYEE), 'movements', 'mine'), { quantity: 1 }));
    await assertFails(deleteDoc(doc(db(EMPLOYEE), 'movements', 'mine')));
  });

  it('ve su historial con la consulta de la app, no el de otros', async () => {
    const movements = collection(db(EMPLOYEE), 'movements');
    await assertSucceeds(getDocs(query(movements, where('userId', '==', EMPLOYEE))));
    await assertFails(getDocs(query(movements)));
    await assertFails(getDocs(query(movements, where('userId', '==', COWORKER))));
    await assertFails(getDoc(doc(db(EMPLOYEE), 'movements', 'theirs')));
  });

  it('crea pedidos propios y lee los pedidos como hoy', async () => {
    const orders = collection(db(EMPLOYEE), 'orders');
    await assertSucceeds(addDoc(orders, order(EMPLOYEE)));
    await assertSucceeds(getDocs(query(orders)));
    await assertSucceeds(getDocs(query(orders, where('status', '==', 'pending'))));
    await assertFails(addDoc(orders, order(COWORKER)));
    await assertFails(addDoc(orders, order(EMPLOYEE, { status: 'approved' })));
    await assertFails(addDoc(orders, order(EMPLOYEE, { items: [] })));
  });

  it('no aprueba, rechaza ni borra pedidos', async () => {
    const ref = doc(db(EMPLOYEE), 'orders', 'pending');
    await assertFails(updateDoc(ref, resolution(EMPLOYEE, 'approved')));
    await assertFails(updateDoc(ref, resolution(EMPLOYEE, 'rejected')));
    await assertFails(deleteDoc(ref));
  });

  it('no accede a la auditoría', async () => {
    await assertFails(getDoc(doc(db(EMPLOYEE), 'audit_log', 'event')));
    await assertFails(
      addDoc(collection(db(EMPLOYEE), 'audit_log'), { adminId: EMPLOYEE, timestamp: serverTimestamp() })
    );
    await assertFails(deleteDoc(doc(db(EMPLOYEE), 'audit_log', 'event')));
  });

  it('maneja solo sus favoritos', async () => {
    const mine = collection(db(EMPLOYEE), 'users', EMPLOYEE, 'favorites');
    await assertSucceeds(getDocs(mine));
    await assertSucceeds(addDoc(mine, { path: PATH, name: 'Rojo', addedAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(doc(db(EMPLOYEE), 'users', EMPLOYEE, 'favorites', 'fav')));
    await assertFails(getDocs(collection(db(COWORKER), 'users', EMPLOYEE, 'favorites')));
    await assertFails(addDoc(collection(db(COWORKER), 'users', EMPLOYEE, 'favorites'), { path: PATH }));
  });

  it('pierde todo el acceso al borrarse su perfil', async () => {
    await assertSucceeds(deleteDoc(doc(db(ADMIN), 'users', EMPLOYEE)));
    await assertFails(getDoc(doc(db(EMPLOYEE), 'catalog', 'tree')));
    await assertFails(setDoc(doc(db(EMPLOYEE), 'stock', 'item'), { path: PATH, stock: 1 }));
  });
});

describe('admin', () => {
  it('edita el catálogo', async () => {
    await assertSucceeds(setDoc(doc(db(ADMIN), 'catalog', 'tree'), { Cables: { Unipolar: {} } }));
  });

  it('administra usuarios', async () => {
    await assertSucceeds(getDocs(collection(db(ADMIN), 'users')));
    await assertSucceeds(
      setDoc(doc(db(ADMIN), 'users', 'new-uid'), {
        displayName: 'Nuevo',
        email: 'nuevo@example.com',
        role: 'employee',
        createdAt: new Date().toISOString(),
        createdBy: ADMIN,
      })
    );
    await assertFails(setDoc(doc(db(ADMIN), 'users', 'bad-uid'), { displayName: 'X', role: 'dueño' }));
    await assertSucceeds(updateDoc(doc(db(ADMIN), 'users', EMPLOYEE), { role: 'admin' }));
    await assertSucceeds(updateDoc(doc(db(ADMIN), 'users', COWORKER), { displayName: 'Otro nombre' }));
    await assertSucceeds(deleteDoc(doc(db(ADMIN), 'users', COWORKER)));
  });

  it('edita su nombre, pero no su rol ni su perfil', async () => {
    const self = doc(db(ADMIN), 'users', ADMIN);
    await assertSucceeds(updateDoc(self, { displayName: 'Nuevo nombre' }));
    await assertFails(updateDoc(self, { role: 'employee' }));
    await assertFails(deleteDoc(self));
  });

  it('aprueba un pedido con el batch de la app', async () => {
    const admin = db(ADMIN);
    const batch = writeBatch(admin);
    batch.set(
      doc(admin, 'stock', 'item'),
      { path: PATH, stock: 9, lastUpdated: serverTimestamp() },
      { merge: true }
    );
    batch.set(doc(collection(admin, 'movements')), movement(EMPLOYEE, { quantity: 1 }));
    batch.update(doc(admin, 'orders', 'pending'), resolution(ADMIN, 'approved'));
    await assertSucceeds(batch.commit());
  });

  it('no aprueba dos veces el mismo pedido', async () => {
    const ref = doc(db(ADMIN), 'orders', 'pending');
    await assertSucceeds(updateDoc(ref, resolution(ADMIN, 'approved')));
    await assertFails(updateDoc(doc(db(OTHER_ADMIN), 'orders', 'pending'), resolution(OTHER_ADMIN, 'approved')));
  });

  it('rechaza con motivo, sin alterar el contenido del pedido', async () => {
    const ref = doc(db(ADMIN), 'orders', 'pending');
    await assertFails(updateDoc(ref, { ...resolution(ADMIN, 'rejected'), items: [] }));
    await assertFails(updateDoc(ref, resolution(OTHER_ADMIN, 'rejected')));
    await assertSucceeds(updateDoc(ref, { ...resolution(ADMIN, 'rejected'), rejectionReason: 'Sin stock' }));
  });

  it('ve todos los movimientos, sin poder alterarlos', async () => {
    await assertSucceeds(getDocs(collection(db(ADMIN), 'movements')));
    await assertFails(updateDoc(doc(db(ADMIN), 'movements', 'mine'), { quantity: 1 }));
    await assertFails(deleteDoc(doc(db(ADMIN), 'movements', 'mine')));
  });

  it('lee y agrega auditoría, sin editarla ni firmar por otro', async () => {
    const auditLog = collection(db(ADMIN), 'audit_log');
    await assertSucceeds(getDocs(query(auditLog, orderBy('timestamp', 'desc'), limit(100))));
    await assertSucceeds(
      addDoc(auditLog, { action: 'add_item', adminId: ADMIN, adminName: 'Admin', target: 'x', timestamp: serverTimestamp() })
    );
    await assertFails(addDoc(auditLog, { adminId: OTHER_ADMIN, timestamp: serverTimestamp() }));
    await assertFails(addDoc(auditLog, { adminId: ADMIN, timestamp: new Date(0) }));
    await assertFails(updateDoc(doc(db(ADMIN), 'audit_log', 'event'), { target: 'y' }));
    await assertFails(deleteDoc(doc(db(ADMIN), 'audit_log', 'event')));
  });
});
