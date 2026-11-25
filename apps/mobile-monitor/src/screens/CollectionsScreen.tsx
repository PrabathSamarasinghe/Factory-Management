import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '@galatura/mobile-core';
import { Card, Screen, Stat } from '../components/ui';
import { useCachedResource } from '../hooks/useCachedResource';
import { getCollections } from '../api/monitor';

export function CollectionsScreen({ online }: { online: boolean }) {
  const { data, loading, error, reload } = useCachedResource(
    'monitor.collections',
    getCollections,
  );
  return (
    <Screen
      title="Collections"
      subtitle="Aggregate collections"
      online={online}
      loading={loading}
      error={error}
      onRefresh={() => {
        void reload();
      }}
    >
      <Card>
        <View style={styles.row}>
          <Stat label="Total KG" value={data?.totalKg ?? '-'} />
          <Stat label="Suppliers" value={data?.supplierCount ?? '-'} />
          <Stat label="Routes" value={data?.routeCount ?? '-'} />
        </View>
      </Card>
      {(data?.recent ?? []).map((item, idx) => (
        <Card key={`${item.route}-${idx}`}>
          <Text style={styles.name}>{item.route}</Text>
          <Text style={styles.meta}>{item.kg} kg</Text>
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
