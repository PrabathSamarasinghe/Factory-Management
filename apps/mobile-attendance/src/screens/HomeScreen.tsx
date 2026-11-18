import { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { enrollmentStatus, listDays } from '../api/client';
import { AppButton, Badge, Card, Hint, SectionTitle } from '../components/ui';
import { colors, spacing } from '../theme';
import type { AttendanceDay } from '../types';
import {
  formatDateLabel,
  formatMinutes,
  formatTime,
  todayIsoDate,
} from '../utils/format';

export function HomeScreen({
  personId,
  pendingCount,
  online,
  syncing,
  onMark,
  onEnrol,
  onHistory,
  onPrivacy,
  onQueue,
  onManual,
  onSettings,
  onSync,
}: {
  personId: string | null;
  pendingCount: number;
  online: boolean;
  syncing: boolean;
  onMark: () => void;
  onEnrol: () => void;
  onHistory: () => void;
  onPrivacy: () => void;
  onQueue: () => void;
  onManual: () => void;
  onSettings: () => void;
  onSync: () => void;
}) {
  const [today, setToday] = useState<AttendanceDay | null>(null);
  const [enrolled, setEnrolled] = useState<boolean | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!personId) {
      setToday(null);
      setEnrolled(null);
      return;
    }
    setError(null);
    const date = todayIsoDate();
    try {
      const [days, status] = await Promise.all([
        listDays(personId, date, date),
        enrollmentStatus(personId).catch(() => null),
      ]);
      setToday(days[0] ?? null);
      if (status) {
        setEnrolled(status.enrolled);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load attendance.');
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

  const statusTone =
    today?.status === 'PRESENT' || today?.status === 'HALF_DAY'
      ? 'success'
      : today?.status === 'ABSENT'
        ? 'danger'
        : today?.status === 'INCOMPLETE'
          ? 'warning'
          : 'info';

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => refresh()} />}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>TODAY</Text>
          <Text style={styles.title}>Attendance</Text>
          <Text style={styles.subtitle}>{formatDateLabel(new Date())}</Text>
        </View>
        <View style={styles.headerActions}>
          <Badge label={online ? 'Online' : 'Offline'} tone={online ? 'success' : 'warning'} />
          <AppButton title="Settings" variant="ghost" onPress={onSettings} />
        </View>
      </View>

      {!online ? (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>
            You are offline. Captured punches will wait safely on this device.
          </Text>
        </View>
      ) : null}

      <Card style={styles.todayCard}>
        {!personId ? (
          <>
            <SectionTitle>Employee ID required</SectionTitle>
            <Hint>
              Set your Galatura employee ID to view daily records and enrol your face.
              You can still mark attendance with face recognition without it.
            </Hint>
            <AppButton title="Set employee ID" variant="secondary" onPress={onSettings} />
          </>
        ) : (
          <>
            <View style={styles.todayHeader}>
              <View>
                <Text style={styles.todayLabel}>Current status</Text>
                <Text style={styles.statusValue}>{today?.status ?? 'NOT MARKED'}</Text>
              </View>
              <Badge label={enrolled ? 'Face enrolled' : 'No face template'} tone={enrolled ? 'success' : 'neutral'} />
            </View>

            <View style={styles.metrics}>
              <Metric label="First in" value={formatTime(today?.firstIn)} />
              <Metric label="Last out" value={formatTime(today?.lastOut)} />
              <Metric label="Worked" value={formatMinutes(today?.workedMinutes ?? 0)} />
              <Metric label="Late" value={formatMinutes(today?.lateMinutes ?? 0)} />
            </View>

            {today?.status ? (
              <Badge label={today.status.replace('_', ' ')} tone={statusTone} />
            ) : (
              <Hint>No punches recorded for today yet.</Hint>
            )}
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <AppButton title="Mark attendance" onPress={onMark} />
        <Hint>
          The camera verifies your face and records check-in or check-out automatically.
        </Hint>
      </Card>

      {pendingCount > 0 ? (
        <Card style={styles.queueCard}>
          <View style={styles.queueHeader}>
            <View style={styles.queueText}>
              <SectionTitle>Pending sync</SectionTitle>
              <Hint>
                {pendingCount} captured {pendingCount === 1 ? 'punch is' : 'punches are'} waiting
                on this device.
              </Hint>
            </View>
            <Badge label={`${pendingCount} queued`} tone="warning" />
          </View>
          <View style={styles.row}>
            <AppButton
              title="Sync now"
              variant="secondary"
              onPress={onSync}
              loading={syncing}
              disabled={!online}
              style={styles.flex}
            />
            <AppButton title="Review" variant="ghost" onPress={onQueue} style={styles.flex} />
          </View>
        </Card>
      ) : null}

      <Card>
        <SectionTitle>Face and records</SectionTitle>
        <AppButton title="Enrol or replace face" variant="secondary" onPress={onEnrol} />
        <AppButton title="Attendance history" variant="secondary" onPress={onHistory} />
        <AppButton title="Supervisor manual entry" variant="ghost" onPress={onManual} />
        <AppButton title="Biometric privacy notice" variant="ghost" onPress={onPrivacy} />
      </Card>
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
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
    fontSize: 30,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
  },
  headerActions: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  offlineBanner: {
    backgroundColor: colors.warningSoft,
    borderRadius: 12,
    padding: spacing.md,
  },
  offlineText: {
    color: '#7A4E08',
    fontSize: 13,
    lineHeight: 19,
  },
  todayCard: {
    gap: spacing.md,
  },
  todayHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  todayLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  statusValue: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '800',
    marginTop: 2,
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metric: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: '#F5F9F7',
    borderRadius: 12,
    padding: spacing.md,
    gap: 3,
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricValue: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '700',
  },
  queueCard: {
    borderColor: '#EACB8F',
    backgroundColor: '#FFFBF2',
  },
  queueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  queueText: {
    flex: 1,
    gap: 3,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
  },
});
