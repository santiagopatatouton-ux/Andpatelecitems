import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useFeedback } from '@/components/ui/feedback';
import { CircleAlert, HardHat } from '@/components/ui/icons';
import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Loading,
  SectionTitle,
} from '@/components/ui/primitives';
import { useCatalog } from '@/context/catalog-context';
import { useObras, type Obra } from '@/hooks/use-obras';
import {
  createObra,
  loadObraConsumption,
  setObraActive,
  type ObraConsumption,
} from '@/services/obras';
import { colors, spacing } from '@/theme/tokens';
import { formatNumber } from '@/utils/format';
import { pathToDocId } from '@/utils/paths';
import { getUnit } from '@/utils/units';

function ObraCard({ obra }: { obra: Obra }) {
  const { stockById } = useCatalog();
  const { toast } = useFeedback();
  const [consumption, setConsumption] = useState<ObraConsumption[] | null>(null);
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    try {
      await setObraActive(obra.id, !obra.activa);
    } catch (error) {
      console.error('Error updating obra:', error);
      toast('No se pudo actualizar la obra.', 'danger');
    }
  };

  const handleConsumption = async () => {
    if (consumption) {
      setConsumption(null);
      return;
    }
    setLoading(true);
    try {
      setConsumption(await loadObraConsumption(obra.id));
    } catch (error) {
      console.error('Error loading consumption:', error);
      toast('No se pudo cargar el consumo.', 'danger');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <AppText variant="bodyStrong" style={styles.flex} numberOfLines={2}>
          {obra.nombre}
        </AppText>
        <Badge label={obra.activa ? 'Activa' : 'Cerrada'} tone={obra.activa ? 'success' : 'neutral'} />
      </View>

      {consumption &&
        (consumption.length === 0 ? (
          <AppText variant="small" color={colors.textMuted}>
            Todavía no tiene material asignado.
          </AppText>
        ) : (
          consumption.map((entry) => (
            <View key={entry.path.join('/')} style={styles.header}>
              <AppText variant="small" style={styles.flex} numberOfLines={1}>
                {entry.path.join(' › ')}
              </AppText>
              <AppText variant="smallStrong" tabular>
                {`${formatNumber(entry.quantity)} ${
                  getUnit(stockById[pathToDocId(entry.path)]?.unitOfMeasure).short
                }`}
              </AppText>
            </View>
          ))
        ))}

      <View style={styles.actions}>
        <Button
          label={obra.activa ? 'Cerrar obra' : 'Reabrir obra'}
          variant="ghost"
          onPress={handleToggle}
        />
        <Button
          label={consumption ? 'Ocultar consumo' : 'Ver consumo'}
          variant="secondary"
          loading={loading}
          onPress={handleConsumption}
        />
      </View>
    </Card>
  );
}

export function ObrasAdmin() {
  const { obras, loading, failed } = useObras();
  const { toast } = useFeedback();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  if (loading) return <Loading label="Cargando obras" />;
  if (failed) {
    return (
      <EmptyState
        icon={CircleAlert}
        title="No se pudieron cargar las obras"
        message="Revisá la conexión y volvé a entrar."
      />
    );
  }

  const handleCreate = async () => {
    const nombre = name.trim();
    if (!nombre) {
      toast('Escribí el nombre de la obra.', 'warning');
      return;
    }
    if (obras.some((obra) => obra.nombre.toLowerCase() === nombre.toLowerCase())) {
      toast('Ya existe una obra con ese nombre.', 'warning');
      return;
    }
    setSaving(true);
    try {
      await createObra(nombre);
      setName('');
      toast('Obra creada.');
    } catch (error) {
      console.error('Error creating obra:', error);
      toast('No se pudo crear la obra.', 'danger');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SectionTitle
        title="Obras"
        hint="Las obras activas se pueden elegir al retirar material o armar un pedido."
      />
      {obras.length === 0 ? (
        <Card>
          <EmptyState icon={HardHat} title="Sin obras" />
        </Card>
      ) : (
        obras.map((obra) => <ObraCard key={obra.id} obra={obra} />)
      )}

      <Card style={styles.card}>
        <Field label="Nueva obra" value={name} onChangeText={setName} placeholder="Nombre de la obra" />
        <View style={styles.actions}>
          <Button label="Crear obra" loading={saving} onPress={handleCreate} />
        </View>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  card: { gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: spacing.sm },
});
