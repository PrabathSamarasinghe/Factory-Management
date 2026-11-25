import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import NetInfo, { useNetInfo } from '@react-native-community/netinfo';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  RealtimeClient,
  registerForPushNotifications,
  colors,
  spacing,
  radius,
} from '@galatura/mobile-core';
import {
  apiClient,
  configureSessionExpiry,
  decodePermissions,
  hasSession,
  restoreSession,
  signOut,
} from './src/api/client';
import { getApiBaseUrl } from './src/storage/appStorage';
import { LoginScreen } from './src/screens/LoginScreen';
import { TodayScreen } from './src/screens/TodayScreen';
import { TripsScreen } from './src/screens/TripsScreen';
import { AttendanceScreen } from './src/screens/AttendanceScreen';
import { CollectionsScreen } from './src/screens/CollectionsScreen';
import { InventoryScreen } from './src/screens/InventoryScreen';
import { FinanceScreen } from './src/screens/FinanceScreen';
import { AlertsScreen } from './src/screens/AlertsScreen';
import { emitRefresh } from './src/refresh';

type Tab =
  | 'Today'
  | 'Trips'
  | 'Attendance'
  | 'Collections'
  | 'Inventory'
  | 'Finance'
  | 'Alerts';
const TABS: Tab[] = [
  'Today',
  'Trips',
  'Attendance',
  'Collections',
  'Inventory',
  'Finance',
  'Alerts',
];
const CHANNELS = ['monitor.today', 'trips.live', 'weighing.live'];

export default function App() {
  return (
    <SafeAreaProvider>
      <AppShell />
    </SafeAreaProvider>
  );
}

function AppShell() {
  const net = useNetInfo();
  const [online, setOnline] = useState(net.isConnected !== false);
  const [booting, setBooting] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [tab, setTab] = useState<Tab>('Today');
  const [permissions, setPermissions] = useState<string[]>([]);
  const realtimeRef = useRef<RealtimeClient | null>(null);

  useEffect(() => {
    const sub = NetInfo.addEventListener(state =>
      setOnline(state.isConnected !== false),
    );
    return () => sub();
  }, []);

  useEffect(() => {
    configureSessionExpiry(() => {
      setSignedIn(false);
    });
    return () => configureSessionExpiry(null);
  }, []);

  const refreshPermissions = useCallback(() => {
    setPermissions(
      decodePermissions(apiClient.getSessionTokens()?.accessToken),
    );
  }, []);

  useEffect(() => {
    (async () => {
      const ok = await restoreSession();
      setSignedIn(ok);
      if (ok) refreshPermissions();
      setBooting(false);
    })();
  }, [refreshPermissions]);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    let unregisterPush: () => void = () => undefined;
    (async () => {
      unregisterPush = await registerForPushNotifications(() => {
        emitRefresh();
      });
      if (cancelled) return;
      const client = new RealtimeClient({
        baseUrl: getApiBaseUrl,
        channels: CHANNELS,
        request: (path, init) => apiClient.request(path, init),
        onEvent: () => emitRefresh(),
        onStatus: () => undefined,
      });
      realtimeRef.current = client;
      client.start();
    })();
    return () => {
      cancelled = true;
      unregisterPush();
      realtimeRef.current?.stop();
      realtimeRef.current = null;
    };
  }, [signedIn]);

  async function handleSignedIn() {
    setSignedIn(true);
    refreshPermissions();
    emitRefresh();
  }

  async function handleSignOut() {
    await signOut();
    setSignedIn(false);
  }

  if (booting) {
    return (
      <SafeAreaView style={styles.loading}>
        <Text style={styles.loadingText}>Loading monitor...</Text>
      </SafeAreaView>
    );
  }

  if (!signedIn || !hasSession()) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />
        <LoginScreen
          onSignedIn={() => {
            void handleSignedIn();
          }}
        />
      </SafeAreaView>
    );
  }

  const canViewFinance = permissions.includes('monitor:finance');

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.topBar}>
        <Text style={styles.appTitle}>C7 Monitor</Text>
        <Pressable
          onPress={() => {
            void handleSignOut();
          }}
        >
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>
      {!online ? (
        <View style={styles.offline}>
          <Text style={styles.offlineText}>
            Offline - showing last cached view
          </Text>
        </View>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}
      >
        {TABS.map(t => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            style={[styles.tab, tab === t && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.body}>
        {tab === 'Today' ? <TodayScreen online={online} /> : null}
        {tab === 'Trips' ? <TripsScreen online={online} /> : null}
        {tab === 'Attendance' ? <AttendanceScreen online={online} /> : null}
        {tab === 'Collections' ? <CollectionsScreen online={online} /> : null}
        {tab === 'Inventory' ? <InventoryScreen online={online} /> : null}
        {tab === 'Finance' ? (
          <FinanceScreen online={online} canViewFinance={canViewFinance} />
        ) : null}
        {tab === 'Alerts' ? <AlertsScreen online={online} /> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  loadingText: { color: colors.muted },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  appTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  signOut: { color: colors.primary, fontWeight: '700' },
  offline: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    backgroundColor: colors.warningSoft,
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  offlineText: { color: '#7A4E08', fontSize: 12 },
  tabs: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primarySoft,
  },
  tabText: { color: colors.muted, fontWeight: '700', fontSize: 12 },
  tabTextActive: { color: colors.primaryDark },
  body: { flex: 1 },
});
