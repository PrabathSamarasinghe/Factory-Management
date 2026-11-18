import { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { markManual } from '../api/client';
import { AppButton, Card, Field, Hint } from '../components/ui';
import { colors, spacing } from '../theme';
import { uuidV4 } from '../utils/uuid';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ManualMarkScreen({
  personId,
  deviceId,
  online,
  onBack,
  onMarked,
}: {
  personId: string | null;
  deviceId: string;
  online: boolean;
  onBack: () => void;
  onMarked: () => void;
}) {
  const [employeeId, setEmployeeId] = useState(personId ?? '');
  const [eventType, setEventType] = useState<'CHECK_IN' | 'CHECK_OUT'>('CHECK_IN');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const trimmed = employeeId.trim();
    if (!UUID_PATTERN.test(trimmed)) {
      setError('Enter a valid employee UUID.');
      return;
    }
    if (reason.trim().length < 5) {
      setError('Enter a reason of at least 5 characters.');
      return;
    }
    if (!online) {
      setError('Manual attendance requires a network connection.');
      return;
    }
    setBusy(true);
    try {
      const result = await markManual({
        clientEventId: uuidV4(),
        personId: trimmed,
        deviceId,
        eventType,
        eventAt: new Date().toISOString(),
        reason: reason.trim(),
      });
      Alert.alert(
        'Manual attendance recorded',
        result.day ? `Status: ${result.day.status.replace('_', ' ')}` : undefined,
      );
      onMarked();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Manual attendance failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>SUPERVISOR</Text>
          <Text style={styles.title}>Manual entry</Text>
          <Text style={styles.subtitle}>Fallback when face verification is unavailable</Text>
        </View>
        <AppButton title="Back" variant="ghost" onPress={onBack} />
      </View>

      <Card style={styles.warningCard}>
        <Hint>
          Manual marks require the attendance:manual permission and are written to the
          audit log with your user ID and this device. Use only after a failed or
          unavailable face verification.
        </Hint>
      </Card>

      <Card>
        <Field
          label="Employee ID"
          value={employeeId}
          onChangeText={setEmployeeId}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="00000000-0000-4000-8000-000000000000"
        />

        <Text style={styles.label}>Event type</Text>
        <View style={styles.eventRow}>
          <AppButton
            title="Check in"
            variant={eventType === 'CHECK_IN' ? 'primary' : 'secondary'}
            onPress={() => setEventType('CHECK_IN')}
            style={styles.flex}
          />
          <AppButton
            title="Check out"
            variant={eventType === 'CHECK_OUT' ? 'primary' : 'secondary'}
            onPress={() => setEventType('CHECK_OUT')}
            style={styles.flex}
          />
        </View>

        <Field
          label="Reason"
          value={reason}
          onChangeText={setReason}
          placeholder="Face camera unavailable at gate 2"
          multiline
          maxLength={300}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!online ? (
          <Text style={styles.offline}>Reconnect to record a manual mark.</Text>
        ) : null}

        <AppButton
          title="Record manual mark"
          onPress={() => submit()}
          loading={busy}
          disabled={!online}
        />
      </Card>
    </ScrollView>
  );
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
  warningCard: {
    borderColor: '#EACB8F',
    backgroundColor: '#FFFBF2',
  },
  label: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  eventRow: {
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
  offline: {
    color: '#7A4E08',
    fontSize: 13,
    lineHeight: 19,
  },
});
