import { StyleSheet, View } from 'react-native';
import { spacing } from '@galatura/mobile-core';
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
          <Stat label="Receipts" value={data?.receiptCount ?? '-'} />
          <Stat label="Issues" value={data?.issueCount ?? '-'} />
        </View>
        <View style={styles.row}>
          <Stat label="Purchase value" value={data?.purchaseValue ?? '-'} />
          <Stat label="Issue value" value={data?.issueValue ?? '-'} />
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
});
