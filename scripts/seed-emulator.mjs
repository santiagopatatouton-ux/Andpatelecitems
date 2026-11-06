// Carga datos de prueba en los emuladores locales. Nunca toca producción: habla solo
// con 127.0.0.1 y con el proyecto "demo-". Las cuentas de acá no existen fuera del emulador.
const PROJECT = 'demo-andpatelec';
const AUTH = 'http://127.0.0.1:9399';
const FIRESTORE = `http://127.0.0.1:8085/v1/projects/${PROJECT}/databases/(default)/documents`;
const PASSWORD = 'demo-1234';

const USERS = [
  { email: 'admin@andpatelec.test', displayName: 'Ana Admin', role: 'admin' },
  { email: 'empleado@andpatelec.test', displayName: 'Ernesto Empleado', role: 'employee' },
];

const TREE = {
  Cables: {
    Unipolar: { '1,5mm': ['Rojo', 'Celeste', 'Negro'], '2,5mm': ['Rojo', 'Celeste'] },
    Bipolar: ['3x2,5', '3x4'],
  },
  Protecciones: { Termicas: { Bifasicos: ['10', '16', '25'], Trifasicos: ['16', '25'] } },
  Iluminacion: { Plafones: ['22x22', '40x40'], Tubos: {} },
  Herramientas: ['Pinza', 'Destornillador'],
  'Cajas y gabinetes': {},
  Varios: {},
};

const STOCK = [
  [['Cables', 'Unipolar', '1,5mm', 'Rojo'], 120, 'metro'],
  [['Cables', 'Unipolar', '1,5mm', 'Celeste'], 3.5, 'metro'],
  [['Cables', 'Bipolar', '3x2,5'], 0, 'metro'],
  [['Protecciones', 'Termicas', 'Bifasicos', '10'], 12],
  [['Protecciones', 'Termicas', 'Bifasicos', '16'], 4],
  [['Herramientas', 'Pinza'], 8],
];

const value = (input) => {
  if (Array.isArray(input)) return { arrayValue: { values: input.map(value) } };
  if (typeof input === 'number') {
    return Number.isInteger(input) ? { integerValue: String(input) } : { doubleValue: input };
  }
  if (typeof input === 'string') return { stringValue: input };
  return { mapValue: { fields: fields(input) } };
};
const fields = (object) =>
  Object.fromEntries(Object.entries(object).map(([key, item]) => [key, value(item)]));

async function request(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return response.json();
}

const writeDoc = (path, data) =>
  request(`${FIRESTORE}/${path}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: fields(data) }),
  });

const stockId = (path) => path.join('__').replace(/[/\\.]/g, '_');

for (const user of USERS) {
  const { localId } = await request(
    `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: PASSWORD, returnSecureToken: true }),
    }
  );
  await writeDoc(`users/${localId}`, user);
}

await writeDoc('catalog/tree', TREE);
for (const [path, stock, unitOfMeasure] of STOCK) {
  await writeDoc(`stock/${encodeURIComponent(stockId(path))}`, {
    path,
    stock,
    ...(unitOfMeasure && { unitOfMeasure }),
  });
}

console.log(`Listo. Cuentas: ${USERS.map((user) => user.email).join(', ')} / ${PASSWORD}`);
