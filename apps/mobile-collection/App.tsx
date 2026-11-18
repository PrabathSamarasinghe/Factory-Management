import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StatusBar,
  StyleSheet,
  Text,
} from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  configureSessionExpiry,
  hasSession,
  restoreSession,
  signOut,
} from './src/api/client';
import { refreshMasterData } from './src/offline/masterData';
import { syncCollection } from './src/offline/sync';
import { AuthScreen } from './src/screens/AuthScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { ManualReportScreen } from './src/screens/ManualReportScreen';
import { PickupScreen } from './src/screens/PickupScreen';
import { QueueScreen } from './src/screens/QueueScreen';
import { SmsStatusScreen } from './src/screens/SmsStatusScreen';
import { getDeviceId } from './src/storage/appStorage';
import { listOutbox } from './src/storage/encryptedStore';
import { colors } from './src/theme';

type Route =
  | { name: 'home' }
  | { name: 'pickup' }
  | { name: 'queue' }
  | { name: 'manual-report' }
  | { name: 'sms-status' };

export default function App() {
  return (
    <SafeAreaProvider>
      <AppShell />
    </SafeAreaProvider>
  );
}

function AppShell() {
  const net = useNetInfo();
  const online = net.isConnected !== false;
  const [booting, setBooting] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [queuedCount, setQueuedCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const syncingRef = useRef(false);
  const refreshingRef = useRef(false);

  useEffect(() => {
    configureSessionExpiry(() => {
      setSignedIn(false);
      setRoute({ name: 'home' });
    });
    return () => configureSessionExpiry(null);
  }, []);

  useEffect(() => {
    (async () => {
      const [session, device, outbox] = await Promise.all([
        restoreSession(),
        getDeviceId(),
        listOutbox(),
      ]);
      setSignedIn(session);
      setDeviceId(device);
      setQueuedCount(outbox.length);
      setBooting(false);
    })();
  }, []);

  const updateQueuedCount = useCallback(async () => {
    setQueuedCount((await listOutbox()).length);
  }, []);

  const refresh = useCallback(async (silent = false) => {
    if (!hasSession() || refreshingRef.current) {
      return;
    }
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      await refreshMasterData();
    } catch (caught) {
      if (!silent) {
        Alert.alert(
          'Master data refresh failed',
          caught instanceof Error
            ? caught.message
            : 'Could not refresh master data.',
        );
      }
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, []);

  const syncPending = useCallback(
    async (silent = false) => {
      if (!hasSession() || !deviceId || syncingRef.current) {
        return;
      }
      syncingRef.current = true;
      setSyncing(true);
      try {
        await syncCollection(deviceId);
      } catch (caught) {
        if (!silent) {
          Alert.alert(
            'Sync failed',
            caught instanceof Error
              ? caught.message
              : 'Could not sync pickups.',
          );
        }
      } finally {
        await updateQueuedCount();
        syncingRef.current = false;
        setSyncing(false);
      }
    },
    [deviceId, updateQueuedCount],
  );

  useEffect(() => {
    if (signedIn && online) {
      refresh(true);
      syncPending(true);
    }
  }, [signedIn, online, refresh, syncPending]);

  async function signedOutNow() {
    await signOut();
    setSignedIn(false);
    setRoute({ name: 'home' });
  }

  if (booting) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Loading collection...</Text>
      </SafeAreaView>
    );
  }

  if (!signedIn) {
    return (
      <SafeAreaView style={styles.safeLight}>
        <StatusBar barStyle="dark-content" />
        <AuthScreen onSignedIn={() => setSignedIn(true)} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeLight}>
      <StatusBar barStyle="dark-content" />
      {route.name === 'home' ? (
        <HomeScreen
          online={online}
          queuedCount={queuedCount}
          syncing={syncing}
          refreshing={refreshing}
          onRefresh={() => refresh()}
          onPickup={() => setRoute({ name: 'pickup' })}
          onQueue={() => setRoute({ name: 'queue' })}
          onManualReport={() => setRoute({ name: 'manual-report' })}
          onSmsStatus={() => setRoute({ name: 'sms-status' })}
          onSync={() => syncPending()}
          onSignOut={() => signedOutNow()}
        />
      ) : null}
      {route.name === 'pickup' ? (
        <PickupScreen
          deviceId={deviceId}
          online={online}
          queuedCount={queuedCount}
          onBack={() => setRoute({ name: 'home' })}
          onQueued={() => updateQueuedCount()}
          onSync={() => syncPending()}
        />
      ) : null}
      {route.name === 'queue' ? (
        <QueueScreen
          online={online}
          syncing={syncing}
          onBack={() => setRoute({ name: 'home' })}
          onSync={() => syncPending()}
          onChanged={() => updateQueuedCount()}
        />
      ) : null}
      {route.name === 'manual-report' ? (
        <ManualReportScreen onBack={() => setRoute({ name: 'home' })} />
      ) : null}
      {route.name === 'sms-status' ? (
        <SmsStatusScreen
          online={online}
          syncing={syncing}
          onBack={() => setRoute({ name: 'home' })}
          onSync={() => syncPending()}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeLight: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loading: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: colors.muted,
    fontSize: 14,
  },
});
