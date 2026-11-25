import { StyleSheet, Text } from 'react-native';
import { colors } from '@galatura/mobile-core';
import { Card, Screen, Stat } from '../components/ui';
import { useCachedResource } from '../hooks/useCachedResource';
import { getToday } from '../api/monitor';
import { View } from 'react-native';
import { spacing } from '@galatura/mobile-core';

export function AlertsScreen({ online }: { online: boolean }) {
  const { data, loading, error, reload } = useCachedResource(
    'monitor.today',
    getToday,
  );
  const alerts = data?.alerts ?? 0;
  return (
    <Screen
      title="Alerts"
      subtitle="Aggregate alerts"
      online={online}
      loading={loading}
      error={error}
      onRefresh={() => {
        void reload();
      }}
    >
      <Card>
        <View style={styles.row}>
          <Stat label="Open alerts" value={alerts} />
        </View>
      </Card>
      <Card>
        <Text style={styles.meta}>
          {alerts > 0
            ? 'Alerts require attention in operational systems. Details are not shown in C7.'
            : 'No active alerts reported.'}
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  meta: { color: colors.muted, fontSize: 13, lineHeight: 19 },
});
