// Tests de la lógica pura: árbol del catálogo, importación de Excel y formato.
// Uso: npm test
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { describe, it } from 'node:test';

// El código de src importa sin extensión, como lo resuelve Metro.
registerHooks({
  resolve(specifier, context, nextResolve) {
    const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
    const hasExtension = /\.[cm]?[jt]sx?$/.test(specifier);
    return nextResolve(isRelative && !hasExtension ? `${specifier}.ts` : specifier, context);
  },
});

const XLSX = (await import('xlsx')).default ?? (await import('xlsx'));
const { parseCatalogExcel } = await import('../src/utils/import-catalog.ts');
const {
  CatalogError,
  addEntries,
  cloneInto,
  countItems,
  getChildren,
  mergeTrees,
  parseNames,
  removeEntry,
  renameEntry,
  stockPathsUnder,
} = await import('../src/utils/catalog-tree.ts');
const {
  formatDateTime,
  isInRange,
  matchesSearch,
  monthRange,
  parseDateInput,
  parseNumber,
  roundQuantity,
  stockLevel,
} = await import('../src/utils/format.ts');
const { parseCountExcel } = await import('../src/utils/import-count.ts');

function workbook(rows) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Hoja');
  return XLSX.write(book, { type: 'array', bookType: 'xlsx' });
}

describe('importación de Excel', () => {
  it('guarda varios ítems de una carpeta como ítems, no como carpetas', () => {
    const result = parseCatalogExcel(
      workbook([
        ['C1', 'C2', 'C3', 'Ítem'],
        ['Cables', 'Unipolar', '1mm', 'Rojo'],
        ['Cables', 'Unipolar', '1mm', 'Azul'],
        ['Cables', 'Unipolar', '1mm', 'Verde'],
        ['Cables', 'Bipolar', '', '3x2,5'],
      ])
    );
    assert.deepEqual(result.tree, {
      Cables: { Unipolar: { '1mm': ['Rojo', 'Azul', 'Verde'] }, Bipolar: ['3x2,5'] },
    });
    assert.equal(result.itemCount, 4);
    assert.equal(countItems(result.tree), 4);
    assert.deepEqual(result.errors, []);
  });

  it('informa la fila que mezcla ítems y subcarpetas, y sigue con el resto', () => {
    const result = parseCatalogExcel(
      workbook([
        ['C1', 'C2', 'Ítem'],
        ['A', 'B', 'x'],
        ['A', 'B', 'C', 'y'],
        ['A', 'D', 'z'],
      ])
    );
    assert.deepEqual(result.tree, { A: { B: ['x'], D: ['z'] } });
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /Fila 3/);
  });

  it('conserva la coma decimal de las celdas numéricas', () => {
    assert.deepEqual(parseCatalogExcel(workbook([['C', 'I'], ['Cables', 2.5]])).tree, {
      Cables: ['2,5'],
    });
  });

  it('convierte celdas numéricas a texto y rechaza archivos sin datos', () => {
    assert.deepEqual(parseCatalogExcel(workbook([['C', 'I'], ['Termicas', 10]])).tree, {
      Termicas: ['10'],
    });
    assert.equal(parseCatalogExcel(workbook([['Solo encabezado']])).errors.length, 1);
  });
});

describe('importación de conteos', () => {
  const sheet = (rows) =>
    workbook([['Categoría', 'Ítem', 'Código', 'Stock', 'Unidad'], ...rows]);

  it('lee la planilla de stock y arma las rutas', () => {
    const { entries, errors } = parseCountExcel(
      sheet([
        ['Cables > Unipolar > 1mm', 'Rojo', '', 12, 'u'],
        ['Canalizaciones', 2.5, '', '3,5', 'm'],
      ])
    );
    assert.deepEqual(entries, [
      { path: ['Cables', 'Unipolar', '1mm', 'Rojo'], counted: 12 },
      { path: ['Canalizaciones', '2,5'], counted: 3.5 },
    ]);
    assert.deepEqual(errors, []);
  });

  it('ignora filas sin cantidad e informa las inválidas', () => {
    const { entries, errors } = parseCountExcel(
      sheet([
        ['Cables', 'Rojo', '', '', 'u'],
        ['Cables', 'Azul', '', 'mucho', 'u'],
      ])
    );
    assert.deepEqual(entries, []);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /Fila 3/);
  });

  it('lee tildes de un CSV en UTF-8 y en formato de Windows', () => {
    const utf8 = new TextEncoder().encode('Categoría,Ítem,Stock\nCaños,Unión,3\n').buffer;
    const latin = Uint8Array.from('Categoría;Ítem;Stock\nCaños;Unión;3\n', (c) =>
      c.charCodeAt(0)
    ).buffer;
    for (const csv of [utf8, latin]) {
      assert.deepEqual(parseCountExcel(csv).entries, [{ path: ['Caños', 'Unión'], counted: 3 }]);
    }
  });

  it('rechaza una planilla sin las columnas necesarias', () => {
    assert.equal(parseCountExcel(workbook([['A', 'B'], [1, 2]])).errors.length, 1);
  });
});

describe('fusión de catálogos', () => {
  it('une ítems sin duplicar y conserva lo existente', () => {
    const { tree, conflicts } = mergeTrees(
      { Cables: { '1mm': ['Rojo', 'Negro'] }, Varios: {} },
      { Cables: { '1mm': ['Rojo', 'Azul'], '2mm': ['Rojo'] }, Varios: ['Cinta'] }
    );
    assert.deepEqual(tree, {
      Cables: { '1mm': ['Rojo', 'Negro', 'Azul'], '2mm': ['Rojo'] },
      Varios: ['Cinta'],
    });
    assert.deepEqual(conflicts, []);
  });

  it('rechaza nombres que caerían en el mismo documento de stock', () => {
    const existing = { Caños: ['3/4'] };
    const { tree, conflicts } = mergeTrees(existing, { Caños: ['3_4'] });
    assert.deepEqual(tree, existing);
    assert.deepEqual(conflicts, ['Caños']);
  });

  it('no destruye ítems si el archivo trae carpetas en el mismo lugar', () => {
    const existing = { Cables: ['Rojo'] };
    const { tree, conflicts } = mergeTrees(existing, { Cables: { Unipolar: ['Azul'] } });
    assert.deepEqual(tree, existing);
    assert.deepEqual(conflicts, ['Cables']);
  });
});

describe('edición del árbol', () => {
  const tree = { Cables: { Unipolar: ['Rojo', 'Negro'], Bipolar: [] }, Varios: {} };

  it('no modifica el árbol original', () => {
    const snapshot = JSON.stringify(tree);
    addEntries(tree, ['Cables', 'Unipolar'], ['Azul'], 'item');
    renameEntry(tree, ['Cables'], 'Unipolar', 'Uni');
    removeEntry(tree, ['Cables', 'Unipolar'], 'Rojo');
    assert.equal(JSON.stringify(tree), snapshot);
  });

  it('agrega ítems a una carpeta vacía y sin duplicar', () => {
    assert.deepEqual(addEntries(tree, ['Varios'], ['Cinta', 'Cinta'], 'item').Varios, ['Cinta']);
    assert.deepEqual(
      addEntries(tree, ['Cables', 'Unipolar'], ['Rojo', 'Azul'], 'item').Cables.Unipolar,
      ['Rojo', 'Negro', 'Azul']
    );
  });

  it('no mezcla ítems y carpetas', () => {
    assert.throws(() => addEntries(tree, ['Cables'], ['x'], 'item'), CatalogError);
    assert.throws(() => addEntries(tree, ['Cables', 'Unipolar'], ['x'], 'subcategory'), CatalogError);
    assert.throws(() => addEntries(tree, [], ['x'], 'item'), CatalogError);
  });

  it('rechaza nombres que caerían en el mismo documento de stock', () => {
    const measures = { Caños: ['3/4'] };
    assert.throws(() => addEntries(measures, ['Caños'], ['3_4'], 'item'), /se confunde/);
  });

  it('renombra ítems y carpetas, y rechaza duplicados', () => {
    assert.deepEqual(renameEntry(tree, ['Cables', 'Unipolar'], 'Rojo', 'Bordo').Cables.Unipolar, [
      'Bordo',
      'Negro',
    ]);
    assert.ok(renameEntry(tree, [], 'Varios', 'Otros').Otros);
    assert.throws(() => renameEntry(tree, ['Cables'], 'Unipolar', 'Bipolar'), /Ya existe/);
    assert.throws(() => renameEntry(tree, ['Cables'], 'Nada', 'Algo'), /ya no existe/);
  });

  it('borra entradas', () => {
    assert.deepEqual(removeEntry(tree, ['Cables', 'Unipolar'], 'Rojo').Cables.Unipolar, ['Negro']);
    assert.equal(removeEntry(tree, [], 'Cables').Cables, undefined);
  });

  it('copia contenido sin perder lo que ya hay, y no dentro de sí misma', () => {
    const source = { A: { X: ['1'] }, B: { Y: ['2'] } };
    assert.deepEqual(cloneInto(source, ['B'], ['A']).B, { Y: ['2'], X: ['1'] });
    const nested = { A: { B: {} } };
    assert.throws(() => cloneInto(nested, ['A', 'B'], ['A']), /sí misma/);
  });

  it('lista las rutas de stock que cuelgan de una carpeta', () => {
    assert.deepEqual(stockPathsUnder(tree, ['Cables', 'Unipolar']), [
      ['Cables', 'Unipolar'],
      ['Cables', 'Unipolar', 'Negro'],
      ['Cables', 'Unipolar', 'Rojo'],
    ]);
  });

  it('ordena carpetas por nombre y número', () => {
    assert.deepEqual(getChildren({ b: {}, a10: {}, a2: {} }).names, ['a2', 'a10', 'b']);
  });

  it('ordena medidas por su valor, sin tocar el array guardado', () => {
    const sizes = ['10mm', '1,5mm', '1mm', '2,5mm'];
    assert.deepEqual(getChildren(sizes).names, ['1mm', '1,5mm', '2,5mm', '10mm']);
    assert.deepEqual(sizes, ['10mm', '1,5mm', '1mm', '2,5mm']);
    assert.deepEqual(getChildren(['2"', '1 1/2"', '3/4"', '1"']).names, ['3/4"', '1"', '1 1/2"', '2"']);
    assert.deepEqual(getChildren(['4 modulos', '1 modulo', 'Tapa ciega']).names, [
      '1 modulo',
      '4 modulos',
      'Tapa ciega',
    ]);
  });

  it('no permite copiar una carpeta dentro de una de sus subcarpetas', () => {
    const nested = { Cables: { Unipolar: { '1mm': ['Rojo'], '2mm': ['Rojo'] } } };
    assert.throws(() => cloneInto(nested, ['Cables', 'Unipolar', '1mm'], ['Cables', 'Unipolar']), /sí misma/);
  });

  it('separa nombres cargados a mano', () => {
    assert.deepEqual(parseNames('a, b;c\nd,, a'), ['a', 'b', 'c', 'd']);
    assert.deepEqual(parseNames('1mm; 2 mm'), ['1mm', '2 mm']);
    assert.deepEqual(parseNames('1mm; 1,5mm; 2,5mm'), ['1mm', '1,5mm', '2,5mm']);
    assert.deepEqual(parseNames('10, 16, 25'), ['10', '16', '25']);
  });
});

describe('formato', () => {
  it('interpreta números escritos a mano', () => {
    assert.equal(parseNumber('1500,50'), 1500.5);
    assert.equal(parseNumber('1.500,50'), 1500.5);
    assert.equal(parseNumber('1500.50'), 1500.5);
    assert.equal(parseNumber('1.500'), 1500);
    assert.equal(parseNumber('$ 2.000'), 2000);
    assert.equal(parseNumber('abc'), null);
    assert.equal(parseNumber(''), null);
    assert.equal(parseNumber('-3'), null);
  });

  it('busca por palabras sueltas, sin tildes ni mayúsculas', () => {
    assert.ok(matchesSearch('Cables Unipolar 2,5mm Marron', 'cable marrón 2,5'));
    assert.ok(matchesSearch('Iluminacion Focos', 'iluminación'));
    assert.ok(!matchesSearch('Cables Unipolar 2,5mm Rojo', 'cable marron'));
    assert.ok(matchesSearch('Cualquier texto', '  '));
  });

  it('evita errores de coma flotante', () => {
    assert.equal(roundQuantity(0.1 + 0.2), 0.3);
  });

  it('clasifica el nivel de stock', () => {
    assert.equal(stockLevel(0), 'out');
    assert.equal(stockLevel(5), 'low');
    assert.equal(stockLevel(6), 'available');
  });

  it('usa el mínimo propio del ítem cuando lo tiene', () => {
    assert.equal(stockLevel(6, 10), 'low');
    assert.equal(stockLevel(3, 2), 'available');
    assert.equal(stockLevel(0, 0), 'out');
  });

  it('interpreta fechas dd/mm/aaaa y rechaza las que no existen', () => {
    assert.equal(parseDateInput('05/11/2026').getDate(), 5);
    assert.equal(parseDateInput('5/11/26').getFullYear(), 2026);
    assert.equal(parseDateInput('31/02/2026'), null);
    assert.equal(parseDateInput('hoy'), null);
  });

  it('incluye el último día completo de un rango', () => {
    const range = monthRange(-1, new Date(2026, 10, 6));
    assert.equal(range.from.getMonth(), 9);
    assert.equal(range.to.getDate(), 31);
    assert.ok(isInRange(new Date(2026, 9, 31, 23, 59).getTime(), range));
    assert.ok(!isInRange(new Date(2026, 10, 1).getTime(), range));
    assert.ok(!isInRange(new Date(2026, 8, 30).getTime(), range));
    assert.ok(isInRange(0, { from: null, to: null }));
  });

  it('acepta fechas viejas guardadas como texto', () => {
    assert.notEqual(formatDateTime('2026-07-23T17:04:47.488Z'), 'Sin fecha');
    assert.equal(formatDateTime(null), 'Sin fecha');
  });
});
