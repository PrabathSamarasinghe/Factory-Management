import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, Text } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  configureSessionExpiry,
  hasSession,
  restoreSession,
} from './src/api/client';
import { AuthScreen } from './src/screens/AuthScreen';
import { CameraScreen } from './src/screens/CameraScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { ManualMarkScreen } from './src/screens/ManualMarkScreen';
import { PrivacyScreen } from './src/screens/PrivacyScreen';
import { QueueScreen } from './src/screens/QueueScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { syncQueuedMarks } from './src/offline/sync';
import { getDeviceId, getPersonId } from './src/storage/appStorage';
import { queueCount } from './src/storage/offlineQueue';
import { colors } from './src/theme';

type Route =
  | { name: 'home' }
  | { name: 'camera'; mode: 'mark' | 'enroll' }
  | { name: 'history' }
  | { name: 'queue' }
  | { name: 'manual' }
  | { name: 'privacy' }
  | { name: 'settings' };

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
  const [personId, setPersonIdState] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState('');
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);
  const [route, setRoute] = useState<Route>({ name: 'home' });

  useEffect(() => {
    configureSessionExpiry(() => {
      setSignedIn(false);
      setRoute({ name: 'home' });
    });
    return () => configureSessionExpiry(null);
  }, []);

  useEffect(() => {
    (async () => {
      const [session, storedPerson, device, queued] = await Promise.all([
        restoreSession(),
        getPersonId(),
        getDeviceId(),
        queueCount(),
      ]);
      setSignedIn(session);
      setPersonIdState(storedPerson);
      setDeviceId(device);
      setPendingCount(queued);
      setBooting(false);
    })();
  }, []);

  const syncPending = useCallback(async () => {
    if (!hasSession() || syncingRef.current) {
      return;
    }
    syncingRef.current = true;
    setSyncing(true);
    try {
      await syncQueuedMarks();
      setPendingCount(await queueCount());
    } catch {
      setPendingCount(await queueCount());
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    if (signedIn && online) {
      syncPending();
    }
  }, [online, signedIn, syncPending]);

  async function signedInNow() {
    setSignedIn(true);
    setPendingCount(await queueCount());
    syncPending();
  }

  function signedOutNow() {
    setSignedIn(false);
    setRoute({ name: 'home' });
  }

  async function queueChanged() {
    setPendingCount(await queueCount());
  }

  if (booting) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Loading attendance...</Text>
      </SafeAreaView>
    );
  }

  if (!signedIn) {
    return (
      <SafeAreaView style={styles.safeLight}>
        <StatusBar barStyle="dark-content" />
        <AuthScreen onSignedIn={() => signedInNow()} />
      </SafeAreaView>
    );
  }

  const isCamera = route.name === 'camera';

  return (
    <SafeAreaView style={isCamera ? styles.safeDark : styles.safeLight}>
      <StatusBar barStyle={isCamera ? 'light-content' : 'dark-content'} />
      {route.name === 'home' ? (
        <HomeScreen
          personId={personId}
          pendingCount={pendingCount}
          online={online}
          syncing={syncing}
          onMark={() => setRoute({ name: 'camera', mode: 'mark' })}
          onEnrol={() => setRoute({ name: 'camera', mode: 'enroll' })}
          onHistory={() => setRoute({ name: 'history' })}
          onPrivacy={() => setRoute({ name: 'privacy' })}
          onQueue={() => setRoute({ name: 'queue' })}
          onManual={() => setRoute({ name: 'manual' })}
          onSettings={() => setRoute({ name: 'settings' })}
          onSync={() => syncPending()}
        />
      ) : null}
      {route.name === 'camera' ? (
        <CameraScreen
          mode={route.mode}
          personId={personId}
          deviceId={deviceId}
          onClose={() => setRoute({ name: 'home' })}
          onMarked={() => setRoute({ name: 'home' })}
          onQueued={() => {
            setRoute({ name: 'home' });
            queueChanged();
          }}
        />
      ) : null}
      {route.name === 'history' ? (
        <HistoryScreen
          personId={personId}
          onBack={() => setRoute({ name: 'home' })}
          onOpenSettings={() => setRoute({ name: 'settings' })}
        />
      ) : null}
      {route.name === 'queue' ? (
        <QueueScreen
          online={online}
          onBack={() => setRoute({ name: 'home' })}
          onChanged={() => queueChanged()}
        />
      ) : null}
      {route.name === 'manual' ? (
        <ManualMarkScreen
          personId={personId}
          deviceId={deviceId}
          online={online}
          onBack={() => setRoute({ name: 'home' })}
          onMarked={() => setRoute({ name: 'home' })}
        />
      ) : null}
      {route.name === 'privacy' ? (
        <PrivacyScreen onBack={() => setRoute({ name: 'home' })} />
      ) : null}
      {route.name === 'settings' ? (
        <SettingsScreen
          personId={personId}
          onBack={() => setRoute({ name: 'home' })}
          onPersonChanged={setPersonIdState}
          onSignedOut={signedOutNow}
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
  safeDark: {
    flex: 1,
    backgroundColor: '#000000',
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
