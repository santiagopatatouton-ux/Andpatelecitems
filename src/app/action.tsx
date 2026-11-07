import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { ItemDetails, ItemHistory, SupplierSuggestions } from '@/components/item-extras';
import { useIsWide } from '@/components/layout/app-shell';
import { Screen } from '@/components/layout/screen';
import { ObraPicker } from '@/components/obra-picker';
import { useFeedback } from '@/components/ui/feedback';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Camera,
  ChevronDown,
  CircleAlert,
  Image as ImageIcon,
  PackagePlus,
  ShoppingCart,
  Star,
  Trash2,
} from '@/components/ui/icons';
import {
  AppText,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  IconButton,
  Loading,
  QuantityStepper,
  SectionTitle,
  Segmented,
} from '@/components/ui/primitives';
import { useAuth } from '@/context/auth-context';
import { useCart } from '@/context/cart-context';
import { useCatalog } from '@/context/catalog-context';
import { useFavorites } from '@/hooks/use-favorites';
import type { Obra } from '@/hooks/use-obras';
import { IMAGE_UPLOAD_ENABLED, removeItemImage, uploadItemImage } from '@/services/images';
import {
  applyMovement,
  InsufficientStockError,
  setUnitOfMeasure,
  type MovementAction,
} from '@/services/stock';
import { colors, radius, spacing } from '@/theme/tokens';
import { isItemPath } from '@/utils/catalog-tree';
import {
  formatMoney,
  formatNumber,
  parseNumber,
  roundQuantity,
  stockLevel,
  STOCK_LEVEL_LABELS,
  STOCK_LEVEL_TONES,
} from '@/utils/format';
import { pathToDocId } from '@/utils/paths';
import { rememberRecentItem } from '@/utils/recent-items';
import { getUnit, unitLabel, UNITS } from '@/utils/units';

const ACTIONS: { value: MovementAction; label: string; icon: typeof ArrowUpFromLine }[] = [
  { value: 'retirar', label: 'Retirar', icon: ArrowUpFromLine },
  { value: 'devolver', label: 'Devolver', icon: ArrowDownToLine },
  { value: 'compra', label: 'Compra', icon: PackagePlus },
];

const CONFIRM_LABELS: Record<MovementAction, string> = {
  retirar: 'Confirmar retiro',
  devolver: 'Confirmar devolución',
  compra: 'Registrar compra',
};

const QUICK_AMOUNTS = [5, 10, 50];

const SUCCESS_VERBS: Record<MovementAction, string> = {
  retirar: 'Retirado',
  devolver: 'Devuelto',
  compra: 'Comprado',
};

function parsePath(raw: string | undefined): string[] {
  try {
    const value = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export default function ItemScreen() {
  const params = useLocalSearchParams<{ path: string }>();
  const path = useMemo(() => parsePath(params.path), [params.path]);
  const { userProfile } = useAuth();
  const { tree, loading, error, stockById } = useCatalog();
  const { addItem } = useCart();
  const { favorites, addFavorite, removeFavorite } = useFavorites();
  const { toast, confirm } = useFeedback();
  const wide = useIsWide();

  const [action, setAction] = useState<MovementAction>('retirar');
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');
  const [price, setPrice] = useState('');
  const [supplier, setSupplier] = useState('');
  const [obra, setObra] = useState<Obra | null>(null);
  const [quantityError, setQuantityError] = useState('');
  const [priceError, setPriceError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showUnits, setShowUnits] = useState(false);
  const [uploading, setUploading] = useState(false);

  const name = path[path.length - 1] ?? 'Ítem';
  const info = stockById[pathToDocId(path)];
  const stock = info?.stock ?? 0;
  const unit = getUnit(info?.unitOfMeasure);
  const level = stockLevel(stock, info?.minStock);
  const favorite = favorites.find((item) => item.path.join('\u0000') === path.join('\u0000'));
  const exists = !!tree && path.length > 0 && isItemPath(tree, path);
  const uid = userProfile?.uid;

  useEffect(() => {
    if (uid && exists) rememberRecentItem(uid, path);
  }, [uid, exists, path]);

  if (loading) {
    return (
      <Screen title={name} backTo="/">
        <Loading label="Cargando ítem" />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen title={name} backTo="/">
        <EmptyState
          icon={CircleAlert}
          title="No se pudo cargar el ítem"
          message="Revisá la conexión y volvé a entrar."
        />
      </Screen>
    );
  }

  if (!tree || !path.length || !isItemPath(tree, path)) {
    return (
      <Screen title="Ítem no encontrado" backTo="/">
        <EmptyState
          icon={CircleAlert}
          title="Este ítem ya no está en el catálogo"
          message="Puede haber sido renombrado o eliminado."
        />
      </Screen>
    );
  }

  const readQuantity = () => {
    const value = parseNumber(quantity);
    if (value === null || value <= 0) {
      setQuantityError('Ingresá una cantidad mayor a 0.');
      return null;
    }
    if (!unit.decimal && !Number.isInteger(value)) {
      setQuantityError(`En ${unit.plural.toLowerCase()} la cantidad va sin decimales.`);
      return null;
    }
    setQuantityError('');
    return value;
  };

  const handleSubmit = async () => {
    const amount = readQuantity();
    if (amount === null || !userProfile) return;

    let unitCost: number | null = null;
    if (action === 'compra' && price.trim()) {
      unitCost = parseNumber(price);
      if (unitCost === null) {
        setPriceError('Ingresá un precio válido o dejalo vacío.');
        return;
      }
    }
    setPriceError('');

    setSubmitting(true);
    try {
      const stockAfter = await applyMovement({
        path,
        action,
        quantity: amount,
        notes: notes.trim(),
        unitCost,
        supplier: action === 'compra' ? supplier.trim() || null : null,
        obra: action === 'retirar' ? obra : null,
        userId: userProfile.uid,
        userName: userProfile.displayName,
      });
      toast(
        `${SUCCESS_VERBS[action]}: ${formatNumber(amount)} ${unitLabel(unit, amount)} de ${name}. Stock: ${formatNumber(stockAfter)}.`
      );
      setQuantity('1');
      setNotes('');
      setPrice('');
      setSupplier('');
    } catch (error) {
      if (error instanceof InsufficientStockError) {
        setQuantityError(`Solo hay ${formatNumber(error.available)} disponibles.`);
      } else {
        console.error('Error applying movement:', error);
        toast('No se pudo registrar el movimiento. Revisá la conexión.', 'danger');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddToCart = () => {
    const amount = readQuantity();
    if (amount === null) return;
    addItem({ path, name, quantity: amount, unit: unit.value });
    toast(`${formatNumber(amount)} ${unitLabel(unit, amount)} de ${name} en el carrito.`);
  };

  const handleToggleFavorite = async () => {
    try {
      if (favorite) await removeFavorite(favorite.id);
      else await addFavorite(path);
    } catch (error) {
      console.error('Error toggling favorite:', error);
      toast('No se pudo actualizar favoritos.', 'danger');
    }
  };

  const handleChangeUnit = async (value: string) => {
    setShowUnits(false);
    if (value === unit.value) return;
    const accepted = await confirm({
      title: 'Cambiar unidad',
      message: `${name} va a pasar a contarse en ${getUnit(value).plural.toLowerCase()} para todos. La cantidad no cambia.`,
      confirmLabel: 'Cambiar',
    });
    if (!accepted) return;
    try {
      await setUnitOfMeasure(path, value);
    } catch (error) {
      console.error('Error changing unit:', error);
      toast('No se pudo cambiar la unidad.', 'danger');
    }
  };

  const pickImage = async (source: 'library' | 'camera') => {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast('Falta permiso para acceder a las imágenes.', 'warning');
      return;
    }

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || !result.assets[0]) return;

    setUploading(true);
    try {
      await uploadItemImage(path, result.assets[0].uri);
      toast('Imagen guardada.');
    } catch (error) {
      console.error('Error uploading image:', error);
      toast('No se pudo subir la imagen.', 'danger');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveImage = async () => {
    const accepted = await confirm({
      title: 'Quitar imagen',
      message: `¿Quitar la imagen de ${name}?`,
      confirmLabel: 'Quitar',
      destructive: true,
    });
    if (!accepted) return;
    try {
      await removeItemImage(path);
    } catch (error) {
      console.error('Error removing image:', error);
      toast('No se pudo quitar la imagen.', 'danger');
    }
  };

  // Abajo del formulario en el teléfono: registrar un movimiento es lo más usado.
  const extras = (
    <>
      <ItemDetails
        key={`${info?.code ?? ''}-${info?.minStock ?? ''}`}
        path={path}
        code={info?.code}
        minStock={info?.minStock}
      />
      <ItemHistory path={path} />
    </>
  );

  const summary = (
    <View style={[styles.column, wide && styles.columnWide]}>
      <Card style={styles.stockCard}>
        <AppText variant="smallStrong" color={colors.textMuted}>
          Stock actual
        </AppText>
        <View style={styles.stockRow}>
          <AppText variant="display" style={styles.stockNumber} tabular>
            {formatNumber(stock)}
          </AppText>
          <Button
            label={stock === 1 ? unit.label : unit.plural}
            variant="secondary"
            icon={ChevronDown}
            onPress={() => setShowUnits(!showUnits)}
            accessibilityLabel="Cambiar unidad de medida"
          />
        </View>
        <Badge label={STOCK_LEVEL_LABELS[level]} tone={STOCK_LEVEL_TONES[level]} />
        {showUnits && (
          <View style={styles.units}>
            {UNITS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={option.value === unit.value}
                onPress={() => handleChangeUnit(option.value)}
              />
            ))}
          </View>
        )}
        {info?.unitCost != null && info.unitCost > 0 && (
          <AppText variant="small" color={colors.textMuted}>
            {`Último precio: ${formatMoney(info.unitCost)} / ${unit.short}`}
          </AppText>
        )}
      </Card>

      {(info?.imageUrl || IMAGE_UPLOAD_ENABLED) && (
        <Card style={styles.imageCard}>
          {info?.imageUrl ? (
            <Image
              source={{ uri: info.imageUrl }}
              style={styles.image}
              resizeMode="cover"
              accessibilityLabel={`Foto de ${name}`}
            />
          ) : (
            <AppText color={colors.textMuted}>Sin imagen</AppText>
          )}
          {IMAGE_UPLOAD_ENABLED && (
            <View style={styles.imageActions}>
              <Button
                label="Galería"
                variant="secondary"
                icon={ImageIcon}
                loading={uploading}
                onPress={() => pickImage('library')}
              />
              <Button
                label="Cámara"
                variant="secondary"
                icon={Camera}
                disabled={uploading}
                onPress={() => pickImage('camera')}
              />
              {info?.imageUrl ? (
                <IconButton
                  icon={Trash2}
                  label="Quitar imagen"
                  color={colors.danger}
                  onPress={handleRemoveImage}
                />
              ) : null}
            </View>
          )}
        </Card>
      )}

      {wide && extras}
    </View>
  );

  const form = (
    <Card style={[styles.column, wide && styles.columnWide]}>
      <SectionTitle title="Registrar movimiento" />
      <Segmented options={ACTIONS} value={action} onChange={setAction} />

      <View style={styles.field}>
        <AppText variant="smallStrong">{`Cantidad (${unit.plural.toLowerCase()})`}</AppText>
        <QuantityStepper
          value={quantity}
          decimal={unit.decimal}
          onChange={(value) => {
            setQuantity(value);
            setQuantityError('');
          }}
        />
        <View style={styles.quickAmounts}>
          {QUICK_AMOUNTS.map((amount) => (
            <Chip
              key={amount}
              label={`+${amount}`}
              onPress={() => {
                const next = roundQuantity((parseNumber(quantity) ?? 0) + amount);
                setQuantity(String(next).replace('.', ','));
                setQuantityError('');
              }}
            />
          ))}
        </View>
        {quantityError ? (
          <AppText variant="small" color={colors.danger} accessibilityLiveRegion="polite">
            {quantityError}
          </AppText>
        ) : null}
      </View>

      {action === 'retirar' && <ObraPicker value={obra} onChange={setObra} />}

      {action === 'compra' && (
        <>
          <SupplierSuggestions
            path={path}
            onPick={(picked) => {
              setSupplier(picked.name);
              if (picked.price) setPrice(String(picked.price).replace('.', ','));
            }}
          />
          <Field
            label={`Precio por ${unit.label.toLowerCase()} (opcional)`}
            value={price}
            onChangeText={(text) => {
              setPrice(text);
              setPriceError('');
            }}
            placeholder="1500,50"
            keyboardType="decimal-pad"
            error={priceError}
          />
          <Field
            label="Proveedor (opcional)"
            value={supplier}
            onChangeText={setSupplier}
            placeholder="Nombre del proveedor"
          />
        </>
      )}

      <Field
        label="Notas (opcional)"
        value={notes}
        onChangeText={setNotes}
        placeholder="Destino o detalle"
        multiline
      />

      <Button
        label={CONFIRM_LABELS[action]}
        size="lg"
        loading={submitting}
        disabled={action === 'retirar' && stock <= 0}
        onPress={handleSubmit}
        fullWidth
      />
      <Button
        label="Agregar al carrito"
        variant="secondary"
        icon={ShoppingCart}
        onPress={handleAddToCart}
        fullWidth
      />
    </Card>
  );

  return (
    <Screen
      title={name}
      backTo="/"
      actions={
        <IconButton
          icon={Star}
          label={favorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
          color={favorite ? colors.warning : colors.text}
          filled={!!favorite}
          onPress={handleToggleFavorite}
          accessibilityState={{ selected: !!favorite }}
        />
      }
    >
      <AppText variant="smallStrong" color={colors.textMuted}>
        {path.slice(0, -1).join(' › ')}
      </AppText>
      <View style={[styles.layout, wide && styles.layoutWide]}>
        {summary}
        {form}
        {!wide && extras}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  layout: { gap: spacing.lg },
  layoutWide: { flexDirection: 'row', alignItems: 'flex-start' },
  column: { minWidth: 0, gap: spacing.lg },
  columnWide: { flex: 1 },
  field: { gap: 6 },
  stockCard: { gap: spacing.sm },
  stockRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stockNumber: { flex: 1, fontSize: 40, lineHeight: 46 },
  units: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  quickAmounts: { flexDirection: 'row', gap: spacing.sm },
  imageCard: { gap: spacing.md, alignItems: 'center' },
  image: { width: '100%', aspectRatio: 1, borderRadius: radius.md },
  imageActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
