# Andpatelec · Control de stock

App interna de materiales: catálogo, stock, compras, retiros, pedidos con aprobación,
historial y exportes a Excel. Hecha con Expo (web, Android e iOS) y Firebase.
Publicada en https://andpatelecitems.web.app

## Desarrollo local

La app local usa emuladores y un proyecto `demo-`, así que no toca datos reales.
Necesita Java para el emulador de Firestore.

```bash
npm install
npm run dev:emulators   # en una terminal
npm run dev:seed        # una vez, con los emuladores corriendo
npm run dev:web         # en otra terminal: http://localhost:8089
```

Las cuentas de prueba están en `scripts/seed-emulator.mjs` y solo existen en el emulador.

No uses `EXPO_PUBLIC_USE_EMULATORS` en un archivo `.env`: también afectaría al build de producción.

## Tests

```bash
npm test             # lógica del catálogo, importación de Excel y formato
npm run test:rules   # reglas de Firestore contra el emulador
npm run lint
```

## Publicar

Primero Hosting y después las reglas, si un cambio de reglas depende del código nuevo.

```bash
npm run build
npm run deploy
npx firebase-tools deploy --only firestore:rules --project andpatelecitems
```

## Estructura

- `src/app`: pantallas, una por ruta.
- `src/features/admin`: secciones de Administración.
- `src/components`: kit de interfaz y layout. Los colores y tamaños salen de `src/theme/tokens.ts`.
- `src/services`: escrituras a Firebase. El stock se mueve siempre con transacciones.
- `src/context`: sesión, catálogo y carrito.
- `src/utils/catalog-tree.ts`: lógica pura del árbol del catálogo.
- `firestore.rules`: permisos por rol. Sin perfil en `users/{uid}` no hay acceso.

## Notas

- `xlsx` se instala desde `vendor/`: la versión de npm tiene vulnerabilidades sin parche.
- Las imágenes de ítems están apagadas porque Firebase Storage no está activado. Ver `src/services/images.ts`.
- El id de cada documento de stock sale de la ruta del ítem. Renombrar desde Administración mueve el stock.
- Las etiquetas QR apuntan a `andpatelecitems.web.app`. Si cambia el dominio, hay que reimprimirlas.
- Desactivar un usuario conserva su cuenta y su historial. Las reglas le cortan todo el acceso.
- Los ajustes por conteo y las anulaciones son movimientos: el historial no se edita ni se borra.
