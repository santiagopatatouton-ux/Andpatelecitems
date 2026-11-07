import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { useFeedback } from '@/components/ui/feedback';
import {
  ChevronRight,
  CircleAlert,
  Copy,
  FileSpreadsheet,
  Folder,
  Package,
  Pencil,
  QrCode,
  Trash2,
  Upload,
} from '@/components/ui/icons';
import {
  AppText,
  Banner,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  Field,
  IconButton,
  Loading,
  SectionTitle,
  Segmented,
} from '@/components/ui/primitives';
import { useAuth } from '@/context/auth-context';
import { useCatalog } from '@/context/catalog-context';
import { countPendingOrdersUnder } from '@/services/orders';
import {
  addCatalogEntries,
  cloneCatalogFolder,
  deleteCatalogEntry,
  importCatalog,
  renameCatalogEntry,
  seedBaseCatalog,
} from '@/services/catalog';
import { colors, iconSize, radius, spacing } from '@/theme/tokens';
import { logAuditEvent, type AuditAction } from '@/utils/audit-log';
import {
  CatalogError,
  countItems,
  flattenTree,
  getChildren,
  getNodeAtPath,
  parseNames,
  type EntryKind,
} from '@/utils/catalog-tree';
import { parseCatalogExcel, type ImportResult } from '@/utils/import-catalog';
import { pickSpreadsheet } from '@/utils/pick-spreadsheet';

const PRESETS = [
  { label: 'Amperajes', value: '10, 16, 25, 32, 40' },
  { label: 'Medidas de caños', value: '3/4, 100, 110, 112, 200' },
  { label: 'Colores de cable', value: 'Rojo, Celeste, Marrón, Negro, Tierra, Blanco' },
  { label: 'Fases', value: 'Bifasicos, Trifasicos' },
  { label: 'Calibres', value: '1mm; 1,5mm; 2,5mm; 4mm; 6mm; 10mm; 16mm' },
];

const KIND_OPTIONS: { value: EntryKind; label: string; icon: typeof Folder }[] = [
  { value: 'subcategory', label: 'Carpeta', icon: Folder },
  { value: 'item', label: 'Ítem', icon: Package },
];

export function CatalogAdmin() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const { tree, loading, error } = useCatalog();
  const { toast, confirm } = useFeedback();

  const [path, setPath] = useState<string[]>([]);
  const [names, setNames] = useState('');
  const [kind, setKind] = useState<EntryKind>('subcategory');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [showClone, setShowClone] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<ImportResult | null>(null);

  if (loading) return <Loading label="Cargando catálogo" />;
  if (error || !tree) {
    return (
      <EmptyState
        icon={CircleAlert}
        title="No se pudo cargar el catálogo"
        message="Revisá la conexión y volvé a entrar."
      />
    );
  }

  const current = getNodeAtPath(tree, path);
  const children = getChildren(current);
  const isRoot = path.length === 0;
  const location = path.join(' › ') || 'Raíz';
  // Una carpeta no mezcla ítems y subcarpetas: solo la vacía deja elegir.
  const fixedKind: EntryKind | null =
    isRoot || children.type === 'categories'
      ? 'subcategory'
      : children.type === 'items'
        ? 'item'
        : null;
  const entryKind: EntryKind = fixedKind ?? kind;

  const audit = (action: AuditAction, target: string, details: string) =>
    logAuditEvent({
      action,
      adminId: userProfile?.uid ?? '',
      adminName: userProfile?.displayName ?? '',
      target,
      details,
    });

  /** Corre una escritura mostrando el error de negocio si lo hay. */
  const run = async (write: () => Promise<void>) => {
    setSaving(true);
    try {
      await write();
    } catch (error) {
      if (error instanceof CatalogError) toast(error.message, 'warning');
      else {
        console.error('Catalog error:', error);
        toast('No se pudo guardar el cambio.', 'danger');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = () => {
    const parsed = parseNames(names);
    if (!parsed.length) {
      toast('Escribí al menos un nombre.', 'warning');
      return;
    }
    return run(async () => {
      await addCatalogEntries(path, parsed, entryKind);
      await audit(
        entryKind === 'subcategory' ? 'add_category' : 'add_item',
        parsed.join(', '),
        `Ruta: ${location}`
      );
      setNames('');
      toast(parsed.length === 1 ? `"${parsed[0]}" agregado.` : `${parsed.length} elementos agregados.`);
    });
  };

  /** Renombrar o borrar deja sin stock a los pedidos pendientes que usan esa ruta. */
  const confirmPendingOrders = async (name: string) => {
    const pending = await countPendingOrdersUnder([...path, name]);
    if (!pending) return true;
    return confirm({
      title: 'Hay pedidos pendientes',
      message: `${pending === 1 ? '1 pedido pendiente usa' : `${pending} pedidos pendientes usan`} "${name}". Después no se van a poder aprobar: conviene resolverlos antes.`,
      confirmLabel: 'Continuar igual',
      destructive: true,
    });
  };

  const handleRename = (oldName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) {
      setEditing(null);
      return;
    }
    return run(async () => {
      if (!(await confirmPendingOrders(oldName))) return;
      await renameCatalogEntry(path, oldName, trimmed);
      await audit('rename_item', `${oldName} → ${trimmed}`, `Ruta: ${location}`);
      setEditing(null);
      toast('Renombrado. El stock se mantuvo.');
    });
  };

  const handleDelete = async (name: string) => {
    const entryPath = [...path, name];
    const entries = flattenTree(getNodeAtPath(tree, entryPath), entryPath);
    const itemCount = children.type === 'items' ? 1 : entries.filter((e) => e.type === 'item').length;

    const accepted = await confirm({
      title: `Eliminar "${name}"`,
      message:
        itemCount > 0
          ? `Se ${itemCount === 1 ? 'va a borrar 1 ítem' : `van a borrar ${itemCount} ítems`} con su stock. El historial de movimientos se conserva.`
          : 'La carpeta está vacía.',
      confirmLabel: 'Eliminar',
      destructive: true,
    });
    if (!accepted) return;

    await run(async () => {
      if (!(await confirmPendingOrders(name))) return;
      await deleteCatalogEntry(path, name);
      await audit(
        children.type === 'items' ? 'delete_item' : 'delete_category',
        name,
        `Ruta: ${entryPath.join(' › ')}`
      );
      toast(`"${name}" eliminado.`);
    });
  };

  const handleClone = async (sourcePath: string[]) => {
    const copied = countItems(getNodeAtPath(tree, sourcePath));
    const accepted = await confirm({
      title: 'Copiar carpeta',
      message: `Se van a copiar ${copied} ${copied === 1 ? 'ítem' : 'ítems'} de ${sourcePath.join(' › ')} a ${location}. El stock no se copia.`,
      confirmLabel: 'Copiar',
    });
    if (!accepted) return;
    await run(async () => {
      await cloneCatalogFolder(path, sourcePath);
      await audit('bulk_import', location, `Estructura copiada de ${sourcePath.join(' › ')}`);
      setShowClone(false);
      toast('Contenido copiado.');
    });
  };

  const handlePickFile = async () => {
    setImporting(true);
    try {
      const picked = await pickSpreadsheet();
      if (picked) setPreview(parseCatalogExcel(picked.data, picked.isBase64));
    } catch (error) {
      console.error('Error reading file:', error);
      toast('No se pudo leer el archivo.', 'danger');
    } finally {
      setImporting(false);
    }
  };

  const handleImport = () => {
    if (!preview) return;
    return run(async () => {
      const conflicts = await importCatalog(preview.tree);
      await audit(
        'bulk_import',
        'Catálogo',
        `${preview.categoryCount} carpetas, ${preview.itemCount} ítems`
      );
      setPreview(null);
      if (conflicts.length) {
        toast(`Importado, salvo: ${conflicts.join(', ')}. Mezclaban ítems y carpetas.`, 'warning');
      } else {
        toast('Importación completa.');
      }
    });
  };

  const handleSeed = async () => {
    const accepted = await confirm({
      title: 'Cargar catálogo base',
      message: 'Se va a crear el catálogo inicial. Solo funciona si el catálogo está vacío.',
      confirmLabel: 'Cargar',
    });
    if (!accepted) return;
    await run(async () => {
      await seedBaseCatalog();
      await audit('bulk_import', 'Catálogo', 'Carga del catálogo base');
      toast('Catálogo base cargado.');
    });
  };

  const cloneSources = flattenTree(tree).filter(
    (entry) =>
      entry.type === 'category' &&
      !entry.path.every((name, index) => path[index] === name) &&
      getChildren(getNodeAtPath(tree, entry.path)).type !== 'empty'
  );

  return (
    <>
      {!isRoot && <Breadcrumbs root="Raíz" path={path} onNavigate={setPath} />}
      <SectionTitle
        title={isRoot ? 'Carpetas principales' : path[path.length - 1]}
        hint={`${children.names.length} ${children.names.length === 1 ? 'elemento' : 'elementos'}`}
      />

      {children.names.length === 0 ? (
        <Card>
          <EmptyState
            icon={Folder}
            title={isRoot ? 'Catálogo vacío' : 'Carpeta vacía'}
            message="Agregá elementos con el formulario de abajo."
            action={
              isRoot ? (
                <Button label="Cargar catálogo base" variant="secondary" onPress={handleSeed} />
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Card style={styles.list}>
          {children.names.map((name, index) => {
            const isFolder = children.type === 'categories';
            const Icon = isFolder ? Folder : Package;
            const entryPath = [...path, name];
            const detail = isFolder
              ? `${countItems(getNodeAtPath(tree, entryPath))} ítems`
              : undefined;

            return (
              <View key={name}>
                {index > 0 && <Divider />}
                {editing === name ? (
                  <View style={styles.renameRow}>
                    <Field
                      label={`Nuevo nombre para ${name}`}
                      value={newName}
                      onChangeText={setNewName}
                      autoFocus
                      onSubmitEditing={() => handleRename(name)}
                    />
                    <View style={styles.actions}>
                      <Button label="Cancelar" variant="secondary" onPress={() => setEditing(null)} />
                      <Button label="Guardar" loading={saving} onPress={() => handleRename(name)} />
                    </View>
                  </View>
                ) : (
                  <View style={styles.row}>
                    <Pressable
                      accessibilityRole={isFolder ? 'button' : undefined}
                      accessibilityLabel={isFolder ? `Abrir ${name}` : undefined}
                      disabled={!isFolder}
                      onPress={() => setPath(entryPath)}
                      style={styles.rowMain}
                    >
                      <Icon size={iconSize.md} color={colors.textMuted} strokeWidth={2} />
                      <View style={styles.flex}>
                        <AppText variant="bodyStrong" numberOfLines={1}>
                          {name}
                        </AppText>
                        {detail ? (
                          <AppText variant="small" color={colors.textMuted}>
                            {detail}
                          </AppText>
                        ) : null}
                      </View>
                      {isFolder && (
                        <ChevronRight size={iconSize.md} color={colors.textSubtle} strokeWidth={2} />
                      )}
                    </Pressable>
                    <IconButton
                      icon={Pencil}
                      label={`Renombrar ${name}`}
                      onPress={() => {
                        setEditing(name);
                        setNewName(name);
                      }}
                    />
                    <IconButton
                      icon={Trash2}
                      label={`Eliminar ${name}`}
                      color={colors.danger}
                      onPress={() => handleDelete(name)}
                    />
                  </View>
                )}
              </View>
            );
          })}
        </Card>
      )}

      {countItems(current) > 0 && (
        <View style={styles.actions}>
          <Button
            label="Etiquetas QR"
            variant="secondary"
            icon={QrCode}
            onPress={() =>
              router.push({ pathname: '/labels', params: { path: JSON.stringify(path) } } as never)
            }
          />
        </View>
      )}

      <Card style={styles.section}>
        <SectionTitle title="Agregar" hint={`En ${location}`} />
        {!fixedKind && <Segmented options={KIND_OPTIONS} value={kind} onChange={setKind} />}
        <Field
          label="Nombres"
          value={names}
          onChangeText={setNames}
          placeholder="Separados por coma, punto y coma o renglón"
          hint="Dejá un espacio después de cada coma. 1,5mm queda como un solo nombre."
          multiline
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presets}>
          {PRESETS.map((preset) => (
            <Chip key={preset.label} label={preset.label} onPress={() => setNames(preset.value)} />
          ))}
        </ScrollView>
        <View style={styles.actions}>
          {!isRoot && (
            <Button
              label={showClone ? 'Ocultar copia' : 'Copiar de otra carpeta'}
              variant="secondary"
              icon={Copy}
              onPress={() => setShowClone(!showClone)}
            />
          )}
          <Button label="Agregar" loading={saving} onPress={handleAdd} />
        </View>

        {showClone && !isRoot && (
          <ScrollView style={styles.cloneList} nestedScrollEnabled>
            {cloneSources.map((source) => (
              <Pressable
                key={source.path.join('/')}
                accessibilityRole="button"
                onPress={() => handleClone(source.path)}
                style={styles.cloneRow}
              >
                <Folder size={iconSize.sm} color={colors.textMuted} strokeWidth={2} />
                <AppText variant="small" style={styles.flex} numberOfLines={1}>
                  {source.path.join(' › ')}
                </AppText>
                <AppText variant="smallStrong" color={colors.info}>
                  Copiar
                </AppText>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </Card>

      {isRoot && (
        <Card style={styles.section}>
          <SectionTitle
            title="Importar desde Excel"
            hint="Columnas: Categoría 1, Categoría 2, ..., Ítem. Se fusiona con el catálogo sin borrar nada."
          />
          {preview ? (
            <>
              <AppText>{`${preview.categoryCount} carpetas y ${preview.itemCount} ítems`}</AppText>
              {preview.errors.map((message) => (
                <Banner key={message} tone="warning" icon={CircleAlert}>
                  {message}
                </Banner>
              ))}
              <View style={styles.actions}>
                <Button label="Cancelar" variant="secondary" onPress={() => setPreview(null)} />
                <Button
                  label="Importar"
                  icon={Upload}
                  loading={saving}
                  disabled={!preview.itemCount && !preview.categoryCount}
                  onPress={handleImport}
                />
              </View>
            </>
          ) : (
            <View style={styles.actions}>
              <Button
                label="Elegir archivo"
                variant="secondary"
                icon={FileSpreadsheet}
                loading={importing}
                onPress={handlePickFile}
              />
            </View>
          )}
        </Card>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  list: { padding: 0, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingRight: spacing.xs },
  rowMain: {
    flex: 1,
    minWidth: 0,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  renameRow: { gap: spacing.md, padding: spacing.lg },
  section: { gap: spacing.md },
  presets: { gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: spacing.sm },
  cloneList: {
    maxHeight: 260,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  cloneRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
});
