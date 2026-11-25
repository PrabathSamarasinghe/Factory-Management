import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '@galatura/mobile-core';
import { Card, Screen, Stat } from '../components/ui';
import { useCachedResource } from '../hooks/useCachedResource';
import { getAttendance } from '../api/monitor';

export function AttendanceScreen({ online }: { online: boolean }) {
  const { data, loading, error, reload } = useCachedResource(
    'monitor.attendance',
    getAttendance,
  );
  return (
    <Screen
      title="Attendance"
      subtitle="Aggregate attendance"
      online={online}
      loading={loading}
      error={error}
      onRefresh={() => {
        void reload();
      }}
    >
      <Card>
        <View style={styles.row}>
          <Stat label="Present" value={data?.present ?? '-'} />
          <Stat label="Absent" value={data?.absent ?? '-'} />
          <Stat label="Late" value={data?.late ?? '-'} />
        </View>
      </Card>
      {(data?.shifts ?? []).map(shift => (
        <Card key={shift.name}>
          <Text style={styles.name}>{shift.name}</Text>
          <Text style={styles.meta}>
            {shift.present} / {shift.total} present
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
