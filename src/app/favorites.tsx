import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ItemRow } from '@/components/catalog';
import { Screen } from '@/components/layout/screen';
import { useFeedback } from '@/components/ui/feedback';
import { CircleAlert, Star, Trash2 } from '@/components/ui/icons';
import {
  AppText,
  Card,
  Divider,
  EmptyState,
  IconButton,
  Loading,
} from '@/components/ui/primitives';
import { useCatalog } from '@/context/catalog-context';
import { useFavorites, type Favorite } from '@/hooks/use-favorites';
import { colors, spacing } from '@/theme/tokens';
import { pathToDocId } from '@/utils/paths';

export default function FavoritesScreen() {
  const router = useRouter();
  const { favorites, loading, failed, removeFavorite } = useFavorites();
  const { items, loading: catalogLoading, error: catalogError } = useCatalog();
  const { toast } = useFeedback();

  const handleRemove = async (favorite: Favorite) => {
    try {
      await removeFavorite(favorite.id);
    } catch (error) {
      console.error('Error removing favorite:', error);
      toast('No se pudo quitar de favoritos.', 'danger');
    }
  };

  return (
    <Screen
      title="Favoritos"
      subtitle={`${favorites.length} ${favorites.length === 1 ? 'ítem' : 'ítems'}`}
    >
      {loading || catalogLoading ? (
        <Loading label="Cargando favoritos" />
      ) : failed || catalogError ? (
        <EmptyState
          icon={CircleAlert}
          title="No se pudieron cargar los favoritos"
          message="Revisá la conexión y volvé a entrar."
        />
      ) : favorites.length === 0 ? (
        <EmptyState
          icon={Star}
          title="Sin favoritos"
          message="Marcá con la estrella los ítems que usás seguido para tenerlos a mano."
        />
      ) : (
        <Card style={styles.list}>
          {favorites.map((favorite, index) => {
            const item = items.find((entry) => entry.id === pathToDocId(favorite.path));
            return (
              <View key={favorite.id}>
                {index > 0 && <Divider />}
                <View style={styles.entry}>
                  <View style={styles.flex}>
                    {item ? (
                      <ItemRow
                        name={item.name}
                        detail={item.path.slice(0, -1).join(' › ')}
                        stock={item.stock}
                        level={item.level}
                        unit={item.unitOfMeasure}
                        onPress={() =>
                          router.push({
                            pathname: '/action',
                            params: { path: JSON.stringify(item.path) },
                          })
                        }
                      />
                    ) : (
                      <View style={styles.missing}>
                        <AppText variant="bodyStrong">{favorite.name}</AppText>
                        <AppText variant="small" color={colors.textMuted}>
                          Ya no está en el catálogo
                        </AppText>
                      </View>
                    )}
                  </View>
                  <IconButton
                    icon={Trash2}
                    label={`Quitar ${favorite.name} de favoritos`}
                    color={colors.textMuted}
                    onPress={() => handleRemove(favorite)}
                  />
                </View>
              </View>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  list: { padding: 0, overflow: 'hidden' },
  entry: { flexDirection: 'row', alignItems: 'center', paddingRight: spacing.xs },
  missing: { padding: spacing.lg },
});
