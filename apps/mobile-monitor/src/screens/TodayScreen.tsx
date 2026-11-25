import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '@galatura/mobile-core';
import { Card, Screen, Stat } from '../components/ui';
import { useCachedResource } from '../hooks/useCachedResource';
import { getToday } from '../api/monitor';

export function TodayScreen({ online }: { online: boolean }) {
  const { data, loading, error, reload } = useCachedResource(
    'monitor.today',
    getToday,
  );
  return (
    <Screen
      title="Today"
      subtitle={data?.date ?? 'Factory overview'}
      online={online}
      loading={loading}
      error={error}
      onRefresh={() => {
        void reload();
      }}
    >
      <Card>
        <Text style={styles.section}>Attendance</Text>
        <View style={styles.row}>
          <Stat label="Present" value={data?.attendance.present ?? '-'} />
          <Stat label="Absent" value={data?.attendance.absent ?? '-'} />
          <Stat label="Late" value={data?.attendance.late ?? '-'} />
        </View>
      </Card>
      <Card>
        <Text style={styles.section}>Collections</Text>
        <View style={styles.row}>
          <Stat label="Total KG" value={data?.collections.totalKg ?? '-'} />
          <Stat label="Suppliers" value={data?.collections.suppliers ?? '-'} />
        </View>
      </Card>
      <Card>
        <Text style={styles.section}>Trips & Alerts</Text>
        <View style={styles.row}>
          <Stat label="Active trips" value={data?.trips.active ?? '-'} />
          <Stat label="Completed" value={data?.trips.completed ?? '-'} />
          <Stat label="Alerts" value={data?.alerts ?? '-'} />
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  row: { flexDirection: 'row', gap: spacing.sm },
});
