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
  listSuppliers,
  listSyncedDailyTotals,
} from '../storage/encryptedStore';
import { colors, spacing } from '../theme';
import type { DailySupplierTotal, SmsStatus, Supplier } from '../types';

function statusTone(
  status: SmsStatus,
): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'SENT') return 'success';
  if (status === 'PENDING') return 'warning';
  if (status === 'FAILED') return 'danger';
  return 'info';
}

export function SmsStatusScreen({
  online,
  syncing,
  onBack,
  onSync,
}: {
  online: boolean;
  syncing: boolean;
  onBack: () => void;
  onSync: () => void;
}) {
  const [totals, setTotals] = useState<DailySupplierTotal[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const load = useCallback(async () => {
    const [storedTotals, storedSuppliers] = await Promise.all([
      listSyncedDailyTotals(),
      listSuppliers(),
    ]);
    setTotals(storedTotals);
    setSuppliers(storedSuppliers);
  }, []);

  useEffect(() => {
    load();
  }, [load, syncing]);

  const supplierName = (supplierId: string) => {
    const supplier = suppliers.find(row => row.supplierId === supplierId);
    return (
      supplier?.preferredName ||
      supplier?.fullName ||
      supplier?.code ||
      supplierId
    );
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={syncing}
          onRefresh={onSync}
          enabled={online}
        />
      }
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>FIELD COLLECTION</Text>
          <Text style={styles.title}>SMS status</Text>
          <Text style={styles.subtitle}>
            Read-only delivery status from the last successful sync.
          </Text>
        </View>
      </View>

      <Card>
        <Hint>
          Finalised collection notices are sent by the factory. Resends are
          handled in C4 only. Pull-to-refresh syncs the latest status when
          online.
        </Hint>
        <AppButton
          title="Sync now"
          variant="secondary"
          onPress={onSync}
          loading={syncing}
          disabled={!online}
        />
        <AppButton title="Back" variant="ghost" onPress={onBack} />
      </Card>

      <Card>
        <SectionTitle>Finalised supplier totals</SectionTitle>
        {totals.length === 0 ? (
          <Hint>No finalised totals have been synced yet.</Hint>
        ) : (
          totals.map(total => (
            <View key={total.id} style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={styles.supplier}>
                  {supplierName(total.supplierId)}
                </Text>
                <Text style={styles.detail}>
                  {total.collectionDate || '-'} · {total.totalBags} bags ·{' '}
                  {total.totalNetKg} kg
                </Text>
              </View>
              <Badge
                label={total.smsStatus}
                tone={statusTone(total.smsStatus)}
              />
            </View>
          ))
        )}
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
    fontSize: 30,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowMain: {
    flex: 1,
    gap: 2,
  },
  supplier: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  detail: {
    color: colors.muted,
    fontSize: 12,
  },
});
