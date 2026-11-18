import { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppButton, Badge, Card, Hint, SectionTitle } from '../components/ui';
import {
  getMasterDataCursor,
  getServerTime,
  listRoutes,
  listSuppliers,
} from '../storage/encryptedStore';
import { colors, spacing } from '../theme';

export function HomeScreen({
  online,
  queuedCount,
  syncing,
  refreshing,
  onRefresh,
  onPickup,
  onQueue,
  onManualReport,
  onSmsStatus,
  onSync,
  onSignOut,
}: {
  online: boolean;
  queuedCount: number;
  syncing: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onPickup: () => void;
  onQueue: () => void;
  onManualReport: () => void;
  onSmsStatus: () => void;
  onSync: () => void;
  onSignOut: () => void;
}) {
  const [supplierCount, setSupplierCount] = useState(0);
  const [routeCount, setRouteCount] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [serverTime, setServerTime] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [suppliers, routes, storedCursor, storedServerTime] =
      await Promise.all([
        listSuppliers(),
        listRoutes(),
        getMasterDataCursor(),
        getServerTime(),
      ]);
    setSupplierCount(suppliers.length);
    setRouteCount(routes.length);
    setCursor(storedCursor);
    setServerTime(storedServerTime);
  }, []);

  useEffect(() => {
    load();
  }, [load, queuedCount]);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>FIELD COLLECTION</Text>
          <Text style={styles.title}>Pickups</Text>
          <Text style={styles.subtitle}>
            Record weights at the supplier gate.
          </Text>
        </View>
        <Badge
          label={online ? 'Online' : 'Offline'}
          tone={online ? 'success' : 'warning'}
        />
      </View>

      {!online ? (
        <Card style={styles.offlineCard}>
          <Hint>
            You are offline. Pickups stay encrypted on this device until
            connectivity returns.
          </Hint>
        </Card>
      ) : null}

      <Card>
        <SectionTitle>Cached master data</SectionTitle>
        <View style={styles.metrics}>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{supplierCount}</Text>
            <Text style={styles.metricLabel}>Suppliers</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{routeCount}</Text>
            <Text style={styles.metricLabel}>Routes</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{queuedCount}</Text>
            <Text style={styles.metricLabel}>Queued</Text>
          </View>
        </View>
        <Hint>Cursor: {cursor ?? 'Not synced yet'}</Hint>
        {serverTime ? <Hint>Server time: {serverTime}</Hint> : null}
        <View style={styles.row}>
          <AppButton
            title="Refresh master data"
            variant="secondary"
            onPress={onRefresh}
            loading={refreshing}
            disabled={!online}
            style={styles.flex}
          />
          <AppButton
            title="Sync now"
            onPress={onSync}
            loading={syncing}
            disabled={!online}
            style={styles.flex}
          />
        </View>
      </Card>

      <Card>
        <SectionTitle>Pickup entry</SectionTitle>
        <Hint>
          Scan a supplier barcode or enter the registration number with a manual
          reason.
        </Hint>
        <AppButton title="Record pickup" onPress={onPickup} />
        <AppButton
          title="Review offline queue"
          variant="ghost"
          onPress={onQueue}
        />
        <AppButton
          title="Manual-entry report"
          variant="ghost"
          onPress={onManualReport}
        />
        <AppButton title="SMS status" variant="ghost" onPress={onSmsStatus} />
      </Card>

      <AppButton title="Sign out" variant="ghost" onPress={onSignOut} />
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
    fontSize: 30,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
  },
  offlineCard: {
    borderColor: '#EACB8F',
    backgroundColor: '#FFFBF2',
  },
  metrics: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  metric: {
    flex: 1,
    backgroundColor: '#F5F9F7',
    borderRadius: 12,
    padding: spacing.md,
    gap: 3,
  },
  metricValue: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '800',
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
});
