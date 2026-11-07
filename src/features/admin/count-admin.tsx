import React, { useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { useFeedback } from '@/components/ui/feedback';
import { CircleAlert, FileSpreadsheet, Folder, Upload } from '@/components/ui/icons';
import {
  AppText,
  Banner,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  Loading,
  QuantityStepper,
  SectionTitle,
} from '@/components/ui/primitives';
import { useAuth } from '@/context/auth-context';
import { useCatalog } from '@/context/catalog-context';
import { saveCount, type CountEntry } from '@/services/stock';
import { colors, spacing } from '@/theme/tokens';
import { getChildren, getNodeAtPath } from '@/utils/catalog-tree';
import { exportFilename } from '@/utils/export-excel';
import { exportStockExcel } from '@/utils/export-stock';
import { formatNumber, parseNumber } from '@/utils/format';
import { parseCountExcel } from '@/utils/import-count';
import { pathToDocId } from '@/utils/paths';
import { pickSpreadsheet } from '@/utils/pick-spreadsheet';
import { shareExcel } from '@/utils/share-file';
import { getUnit } from '@/utils/units';

const PREVIEW_ROWS = 20;

interface Difference extends CountEntry {
  id: string;
  name: string;
  stock: number;
}

export function CountAdmin() {
  const { userProfile } = useAuth();
  const { tree, items, loading } = useCatalog();
  const { toast, confirm } = useFeedback();

  const [path, setPath] = useState<string[]>([]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<Difference[] | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  if (loading || !tree) return <Loading label="Cargando catálogo" />;

  const itemsById = new Map(items.map((item) => [item.id, item]));
  const children = getChildren(getNodeAtPath(tree, path));

  const typed: Difference[] = items.flatMap((item) => {
    const counted = counts[item.id] ? parseNumber(counts[item.id]) : null;
    return counted === null || counted === item.stock
      ? []
      : [{ id: item.id, name: item.name, path: item.path, stock: item.stock, counted }];
  });

  const apply = async (entries: Difference[], onDone: () => void) => {
    if (!userProfile) return;
    const accepted = await confirm({
      title: 'Guardar conteo',
      message: `Se va a ajustar el stock de ${entries.length} ${entries.length === 1 ? 'ítem' : 'ítems'}. Cada ajuste queda en el historial.`,
      confirmLabel: 'Guardar',
    });
    if (!accepted) return;

    setSaving(true);
    try {
      const changed = await saveCount(entries, userProfile);
      onDone();
      toast(`Conteo guardado: ${changed} ${changed === 1 ? 'ajuste' : 'ajustes'}.`);
    } catch (error) {
      console.error('Error saving count:', error);
      toast('No se pudo guardar el conteo. Revisá la conexión.', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async () => {
    try {
      const filename = exportFilename('conteo');
      const base64 = exportStockExcel(items, filename);
      if (Platform.OS === 'web') toast('Planilla descargada.');
      else if (base64) await shareExcel(base64, filename, 'Planilla de conteo');
    } catch (error) {
      console.error('Export error:', error);
      toast('No se pudo generar la planilla.', 'danger');
    }
  };

  const handleUpload = async () => {
    setImporting(true);
    try {
      const picked = await pickSpreadsheet();
      if (!picked) return;
      const { entries, errors } = parseCountExcel(picked.data, picked.isBase64);

      const unknown: string[] = [];
      const differences = entries.flatMap((entry) => {
        const id = pathToDocId(entry.path);
        const item = itemsById.get(id);
        if (!item) {
          unknown.push(`No está en el catálogo: ${entry.path.join(' › ')}`);
          return [];
        }
        return item.stock === entry.counted
          ? []
          : [{ ...entry, id, name: item.name, stock: item.stock }];
      });
      setImported(differences);
      setImportErrors([...errors, ...unknown]);
    } catch (error) {
      console.error('Error reading count:', error);
      toast('No se pudo leer el archivo.', 'danger');
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      {path.length > 0 && <Breadcrumbs root="Catálogo" path={path} onNavigate={setPath} />}
      <SectionTitle
        title={path[path.length - 1] ?? 'Conteo físico'}
        hint="Entrá a una carpeta y escribí lo que hay. Lo que dejes vacío no se toca."
      />

      {children.type === 'empty' && (
        <Card>
          <EmptyState icon={Folder} title="Carpeta vacía" />
        </Card>
      )}

      {children.type === 'categories' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {children.names.map((name) => (
            <Chip key={name} label={name} icon={Folder} onPress={() => setPath([...path, name])} />
          ))}
        </ScrollView>
      )}

      {children.type === 'items' && (
        <Card style={styles.list}>
          {children.names.map((name, index) => {
            const id = pathToDocId([...path, name]);
            const item = itemsById.get(id);
            const unit = getUnit(item?.unitOfMeasure);
            return (
              <View key={id}>
                {index > 0 && <Divider />}
                <View style={styles.row}>
                  <View style={styles.rowText}>
                    <AppText variant="bodyStrong" numberOfLines={2}>
                      {name}
                    </AppText>
                    <AppText variant="small" color={colors.textMuted}>
                      {`En sistema: ${formatNumber(item?.stock ?? 0)} ${unit.short}`}
                    </AppText>
                  </View>
                  <QuantityStepper
                    compact
                    label={`Conteo de ${name}`}
                    value={counts[id] ?? ''}
                    decimal={unit.decimal}
                    onChange={(value) => setCounts({ ...counts, [id]: value })}
                  />
                </View>
              </View>
            );
          })}
        </Card>
      )}

      {typed.length > 0 && (
        <Button
          label={`Guardar conteo (${typed.length})`}
          size="lg"
          fullWidth
          loading={saving}
          onPress={() => apply(typed, () => setCounts({}))}
        />
      )}

      <Card style={styles.section}>
        <SectionTitle
          title="Conteo con planilla"
          hint="Bajá la planilla, corregí la columna Stock y volvé a cargarla."
        />
        <View style={styles.actions}>
          <Button
            label="Bajar planilla"
            variant="secondary"
            icon={FileSpreadsheet}
            onPress={handleDownload}
          />
          <Button
            label="Cargar planilla"
            variant="secondary"
            icon={Upload}
            loading={importing}
            onPress={handleUpload}
          />
        </View>

        {importErrors.map((message) => (
          <Banner key={message} tone="warning" icon={CircleAlert}>
            {message}
          </Banner>
        ))}

        {imported && (
          <>
            <AppText variant="bodyStrong">
              {imported.length
                ? `${imported.length} ${imported.length === 1 ? 'diferencia' : 'diferencias'}`
                : 'La planilla coincide con el sistema.'}
            </AppText>
            {imported.slice(0, PREVIEW_ROWS).map((entry) => (
              <View key={entry.id} style={styles.diff}>
                <AppText style={styles.flex} numberOfLines={1}>
                  {entry.path.join(' › ')}
                </AppText>
                <AppText variant="smallStrong" tabular>
                  {`${formatNumber(entry.stock)} → ${formatNumber(entry.counted)}`}
                </AppText>
              </View>
            ))}
            {imported.length > PREVIEW_ROWS && (
              <AppText variant="small" color={colors.textMuted}>
                {`Y ${imported.length - PREVIEW_ROWS} más.`}
              </AppText>
            )}
            <View style={styles.actions}>
              <Button
                label="Descartar"
                variant="secondary"
                onPress={() => {
                  setImported(null);
                  setImportErrors([]);
                }}
              />
              {imported.length > 0 && (
                <Button
                  label="Aplicar conteo"
                  loading={saving}
                  onPress={() =>
                    apply(imported, () => {
                      setImported(null);
                      setImportErrors([]);
                    })
                  }
                />
              )}
            </View>
          </>
        )}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  chips: { gap: spacing.sm },
  list: { padding: 0, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  rowText: { flexGrow: 1, flexBasis: 160, minWidth: 0 },
  section: { gap: spacing.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: spacing.sm },
  diff: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
