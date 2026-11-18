import { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { listDays } from '../api/client';
import { AppButton, Badge, Card, Hint } from '../components/ui';
import { colors, spacing } from '../theme';
import type { AttendanceDay } from '../types';
import {
  daysAgoIso,
  formatDateLabel,
  formatMinutes,
  formatTime,
  todayIsoDate,
} from '../utils/format';

export function HistoryScreen({
  personId,
  onBack,
  onOpenSettings,
}: {
  personId: string | null;
  onBack: () => void;
  onOpenSettings: () => void;
}) {
  const [days, setDays] = useState<AttendanceDay[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!personId) {
      return;
    }
    setError(null);
    try {
      setDays(await listDays(personId, daysAgoIso(60), todayIsoDate()));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load attendance history.');
    }
  }, [personId]);

  useEffect(() => {
    load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => refresh()} />}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>RECORDS</Text>
          <Text style={styles.title}>Attendance history</Text>
          <Text style={styles.subtitle}>Last 60 days</Text>
        </View>
        <AppButton title="Back" variant="ghost" onPress={onBack} />
      </View>

      {!personId ? (
        <Card>
          <Hint>Set your employee ID to load your attendance history.</Hint>
          <AppButton title="Open settings" onPress={onOpenSettings} />
        </Card>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {personId && days.length === 0 && !error ? (
        <Card>
          <Hint>No attendance records were found in the last 60 days.</Hint>
        </Card>
      ) : null}

      {days.map((day) => (
        <Card key={day.id} style={styles.dayCard}>
          <View style={styles.dayHeader}>
            <View style={styles.dayDate}>
              <Text style={styles.dayLabel}>{formatDateLabel(day.workDate)}</Text>
              <Text style={styles.dayTimes}>
                {formatTime(day.firstIn)} - {formatTime(day.lastOut)}
              </Text>
            </View>
            <Badge label={day.status.replace('_', ' ')} tone={toneFor(day.status)} />
          </View>
          <View style={styles.metrics}>
            <SmallMetric label="Worked" value={formatMinutes(day.workedMinutes)} />
            <SmallMetric label="Late" value={formatMinutes(day.lateMinutes)} />
            <SmallMetric label="Early" value={formatMinutes(day.earlyLeaveMinutes)} />
            <SmallMetric label="Overtime" value={formatMinutes(day.overtimeMinutes)} />
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function toneFor(status: AttendanceDay['status']): 'neutral' | 'success' | 'danger' | 'warning' | 'info' {
  if (status === 'PRESENT' || status === 'HALF_DAY') {
    return 'success';
  }
  if (status === 'ABSENT') {
    return 'danger';
  }
  if (status === 'INCOMPLETE') {
    return 'warning';
  }
  if (status === 'LEAVE' || status === 'HOLIDAY') {
    return 'info';
  }
  return 'neutral';
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
  },
  dayCard: {
    gap: spacing.sm,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  dayDate: {
    flex: 1,
  },
  dayLabel: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  dayTimes: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2,
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metric: {
    flexBasis: '22%',
    flexGrow: 1,
    backgroundColor: '#F5F9F7',
    borderRadius: 10,
    padding: spacing.sm,
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  metricValue: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 2,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
  },
});
