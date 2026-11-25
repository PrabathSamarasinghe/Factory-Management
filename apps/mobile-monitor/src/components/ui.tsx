import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, radius, spacing } from '@galatura/mobile-core';

export function Screen({
  title,
  subtitle,
  online,
  loading,
  error,
  onRefresh,
  children,
}: {
  title: string;
  subtitle?: string;
  online: boolean;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  children: ReactNode;
}) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {onRefresh ? (
          <Pressable onPress={onRefresh} style={styles.refresh}>
            <Text style={styles.refreshText}>Refresh</Text>
          </Pressable>
        ) : null}
      </View>
      {!online ? (
        <View style={styles.offline}>
          <Text style={styles.offlineText}>
            Offline - showing last cached view
          </Text>
        </View>
      ) : null}
      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {children}
    </ScrollView>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function Stat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  headerText: { flex: 1, gap: 2 },
  title: { color: colors.ink, fontSize: 24, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 13 },
  refresh: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  refreshText: { color: colors.primaryDark, fontWeight: '700', fontSize: 12 },
  offline: {
    backgroundColor: colors.warningSoft,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  offlineText: { color: '#7A4E08', fontSize: 13 },
  error: { color: colors.danger, fontSize: 13 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  stat: {
    flex: 1,
    backgroundColor: '#F5F9F7',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  statValue: { color: colors.ink, fontSize: 20, fontWeight: '800' },
  statLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});
