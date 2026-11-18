import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppButton, Badge, Card, Hint } from '../components/ui';
import {
  listOutbox,
  removeOutboxItems,
  updateOutboxItem,
} from '../storage/encryptedStore';
import { colors, spacing } from '../theme';
import type { OutboxItem } from '../types';

export function QueueScreen({
  online,
  syncing,
  onBack,
  onSync,
  onChanged,
}: {
  online: boolean;
  syncing: boolean;
  onBack: () => void;
  onSync: () => void;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<OutboxItem[]>([]);

  const load = useCallback(async () => {
    setItems(await listOutbox());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function retry(item: OutboxItem) {
    await updateOutboxItem(item.id, {
      attempts: 0,
      lastError: undefined,
      nextAttemptAt: new Date().toISOString(),
      permanent: false,
    });
    await load();
    onSync();
  }

  async function remove(item: OutboxItem) {
    await removeOutboxItems([item.id]);
    await load();
    onChanged();
  }

  function clearAll() {
    Alert.alert('Delete queued pickups?', 'Unsent pickups will be lost.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete all',
        style: 'destructive',
        onPress: () => {
          removeOutboxItems(items.map((item) => item.id)).then(async () => {
            await load();
            onChanged();
          });
        },
      },
    ]);
  }

  function sync() {
    onSync();
    setTimeout(() => load(), 500);
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>OFFLINE</Text>
          <Text style={styles.title}>Pickup queue</Text>
          <Text style={styles.subtitle}>
            {items.length} {items.length === 1 ? 'pickup' : 'pickups'} on this device
          </Text>
        </View>
        <AppButton title="Back" variant="ghost" onPress={onBack} />
      </View>

      <View style={styles.actions}>
        <AppButton
          title="Sync all"
          onPress={() => sync()}
          loading={syncing}
          disabled={!online || items.length === 0}
          style={styles.flex}
        />
        {items.length > 0 ? (
          <AppButton title="Clear all" variant="ghost" onPress={clearAll} style={styles.flex} />
        ) : null}
      </View>

      {!online ? (
        <Card style={styles.offlineCard}>
          <Hint>Connect to the network to upload queued pickups.</Hint>
        </Card>
      ) : null}

      {items.length === 0 ? (
        <Card>
          <Hint>No pickups are waiting. Captured pickups sync automatically when online.</Hint>
        </Card>
      ) : null}

      {items.map((item) => (
        <Card key={item.id} style={styles.itemCard}>
          <View style={styles.itemHeader}>
            <View style={styles.itemText}>
              <Text style={styles.itemTitle}>{item.payload.supplierRegNo}</Text>
              <Text style={styles.itemMeta}>
                {item.payload.grossWeightKg} kg · {item.payload.bagsCount} bags ·{' '}
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
              disabled={!online || syncing}
              style={styles.flex}
            />
            <AppButton title="Delete" variant="ghost" onPress={() => remove(item)} style={styles.flex} />
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
});
