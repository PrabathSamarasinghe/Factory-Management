import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '@galatura/mobile-core';
import { Card, Screen, Stat } from '../components/ui';
import { useCachedResource } from '../hooks/useCachedResource';
import { getInventory } from '../api/monitor';

export function InventoryScreen({ online }: { online: boolean }) {
  const { data, loading, error, reload } = useCachedResource(
    'monitor.inventory',
    getInventory,
  );
  return (
    <Screen
      title="Inventory"
      subtitle="Aggregate inventory"
      online={online}
      loading={loading}
      error={error}
      onRefresh={() => {
        void reload();
      }}
    >
      <Card>
        <View style={styles.row}>
          <Stat label="Items" value={data?.items?.length ?? '-'} />
          <Stat label="Low stock" value={data?.lowStockCount ?? '-'} />
        </View>
      </Card>
      {(data?.items ?? []).map((item, idx) => (
        <Card key={`${item.name}-${idx}`}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.meta}>
            {item.quantity} {item.unit}
          </Text>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  name: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: 13 },
});
