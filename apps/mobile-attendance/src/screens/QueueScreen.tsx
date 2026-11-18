import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppButton, Badge, Card, Hint } from '../components/ui';
import { syncQueuedMarks } from '../offline/sync';
import {
  clearQueue,
  listQueue,
  removeQueueItem,
  updateQueueItem,
} from '../storage/offlineQueue';
import { colors, spacing } from '../theme';
import type { QueuedMark } from '../types';

export function QueueScreen({
  online,
  onBack,
  onChanged,
}: {
  online: boolean;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<QueuedMark[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setItems(await listQueue());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function sync() {
    setBusy(true);
    setError(null);
    try {
      const result = await syncQueuedMarks();
      await load();
      onChanged();
      if (result.sent > 0) {
        Alert.alert('Sync complete', `${result.sent} punch${result.sent === 1 ? '' : 'es'} uploaded.`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sync failed.');
    } finally {
      setBusy(false);
    }
  }

  async function retry(item: QueuedMark) {
    await updateQueueItem(item.id, { permanent: false, lastError: undefined });
    await load();
    await sync();
  }

  async function remove(item: QueuedMark) {
    await removeQueueItem(item.id);
    await load();
    onChanged();
  }

  function clearAll() {
    Alert.alert('Delete offline punches?', 'Unsent attendance captures will be lost.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete all',
        style: 'destructive',
        onPress: () => {
          clearQueue().then(async () => {
            await load();
            onChanged();
          });
        },
      },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>OFFLINE</Text>
          <Text style={styles.title}>Pending sync</Text>
          <Text style={styles.subtitle}>
            {items.length} {items.length === 1 ? 'capture' : 'captures'} on this device
          </Text>
        </View>
        <AppButton title="Back" variant="ghost" onPress={onBack} />
      </View>

      <View style={styles.actions}>
        <AppButton
          title="Sync all"
          onPress={() => sync()}
          loading={busy}
          disabled={!online || items.length === 0}
          style={styles.flex}
        />
        {items.length > 0 ? (
          <AppButton title="Clear all" variant="ghost" onPress={clearAll} style={styles.flex} />
        ) : null}
      </View>

      {!online ? (
        <Card style={styles.offlineCard}>
          <Hint>Connect to the network to upload queued attendance captures.</Hint>
        </Card>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {items.length === 0 ? (
        <Card>
          <Hint>No offline punches are waiting. Captures sync automatically when online.</Hint>
        </Card>
      ) : null}

      {items.map((item) => (
        <Card key={item.id} style={styles.itemCard}>
          <View style={styles.itemHeader}>
            <View style={styles.itemText}>
              <Text style={styles.itemTitle}>
                {new Date(item.createdAt).toLocaleString()}
              </Text>
              <Text style={styles.itemMeta}>
                {item.payload.personId ? `Person ${item.payload.personId.slice(0, 8)}` : 'Face match'} ·{' '}
                {item.attempts} attempt{item.attempts === 1 ? '' : 's'}
              </Text>
            </View>
            <Badge
              label={item.permanent ? 'Rejected' : 'Queued'}
              tone={item.permanent ? 'danger' : 'warning'}
            />
          </View>
          {item.lastError ? <Text style={styles.itemError}>{item.lastError}</Text> : null}
          <View style={styles.itemActions}>
            <AppButton
              title="Retry"
              variant="secondary"
              onPress={() => retry(item)}
              disabled={!online || busy}
              style={styles.flex}
            />
            <AppButton
              title="Delete"
              variant="ghost"
              onPress={() => remove(item)}
              style={styles.flex}
            />
          </View>
        </Card>
      ))}
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
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  offlineCard: {
    borderColor: '#EACB8F',
    backgroundColor: '#FFFBF2',
  },
  itemCard: {
    gap: spacing.sm,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  itemText: {
    flex: 1,
  },
  itemTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  itemMeta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  itemError: {
    color: colors.danger,
    fontSize: 12,
    lineHeight: 18,
  },
  itemActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
  },
});
