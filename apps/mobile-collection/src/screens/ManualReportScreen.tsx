import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { fetchManualEntries } from '../api/client';
import { AppButton, Card, Field, Hint, SectionTitle } from '../components/ui';
import { colors, spacing } from '../theme';
import type { ManualEntryGroup } from '../types';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ManualReportScreen({ onBack }: { onBack: () => void }) {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [groups, setGroups] = useState<ManualEntryGroup[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      setGroups(await fetchManualEntries(from, to));
      setLoaded(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not load manual-entry report.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>COMPLIANCE</Text>
          <Text style={styles.title}>Manual entries</Text>
          <Text style={styles.subtitle}>
            Review typed registration-number pickups.
          </Text>
        </View>
        <AppButton title="Back" variant="ghost" onPress={onBack} />
      </View>

      <Card>
        <Field
          label="From"
          value={from}
          onChangeText={setFrom}
          placeholder="YYYY-MM-DD"
        />
        <Field
          label="To"
          value={to}
          onChangeText={setTo}
          placeholder="YYYY-MM-DD"
        />
        <AppButton title="Load report" onPress={() => load()} loading={busy} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </Card>

      {loaded ? (
        <Card>
          <SectionTitle>Grouped by helper</SectionTitle>
          {groups.length === 0 ? (
            <Hint>No manual entries in this date range.</Hint>
          ) : null}
          {groups.map(group => (
            <View key={group.helperId} style={styles.group}>
              <Text style={styles.groupTitle}>
                {group.helperId} · {group.count}
              </Text>
              {group.entries.map(entry => (
                <View key={entry.clientPickupId} style={styles.entry}>
                  <Text style={styles.entryTitle}>{entry.supplierRegNo}</Text>
                  <Text style={styles.entryDetail}>
                    Reason: {entry.manualReason || 'Not supplied'}
                  </Text>
                  <Text style={styles.entryDetail}>
                    {entry.grossWeightKg} kg · {entry.bagsCount} bags ·{' '}
                    {entry.recordedAtDevice}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </Card>
      ) : null}
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
  group: {
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  groupTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  entry: {
    backgroundColor: '#F5F9F7',
    borderRadius: 10,
    padding: spacing.sm,
    gap: 2,
  },
  entryTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  entryDetail: {
    color: colors.muted,
    fontSize: 12,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
  },
});
