import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '@galatura/mobile-core';
import { Card, Screen, Stat } from '../components/ui';
import { useCachedResource } from '../hooks/useCachedResource';
import { getFinance } from '../api/monitor';

export function FinanceScreen({
  online,
  canViewFinance,
}: {
  online: boolean;
  canViewFinance: boolean;
}) {
  const { data, loading, error, reload } = useCachedResource(
    'monitor.finance',
    async () => {
      if (!canViewFinance) {
        throw new Error('LOCKED');
      }
      return getFinance();
    },
  );

  if (!canViewFinance) {
    return (
      <Screen title="Finance" subtitle="Restricted" online={online}>
        <Card>
          <Text style={styles.lockedTitle}>Access locked</Text>
          <Text style={styles.locked}>
            Finance data requires monitor:finance permission.
          </Text>
        </Card>
      </Screen>
    );
  }

  const currency = data?.currency ?? 'LKR';
  return (
    <Screen
      title="Finance"
      subtitle="Aggregate finance"
      online={online}
      loading={loading}
      error={error === 'LOCKED' ? null : error}
      onRefresh={() => {
        void reload();
      }}
    >
      <Card>
        <View style={styles.row}>
          <Stat
            label="Cash"
            value={
              data?.cashOnHand !== undefined
                ? `${currency} ${data.cashOnHand}`
                : '-'
            }
          />
          <Stat
            label="Receivables"
            value={
              data?.receivables !== undefined
                ? `${currency} ${data.receivables}`
                : '-'
            }
          />
        </View>
        <View style={styles.row}>
          <Stat
            label="Payables"
            value={
              data?.payables !== undefined
                ? `${currency} ${data.payables}`
                : '-'
            }
          />
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  lockedTitle: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  locked: { color: colors.muted, fontSize: 13, lineHeight: 19 },
});
