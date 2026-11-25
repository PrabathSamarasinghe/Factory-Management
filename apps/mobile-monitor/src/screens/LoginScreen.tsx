import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, radius, spacing } from '@galatura/mobile-core';
import { AppButton, Field, Card, Hint } from '../components/uiForm';
import { signIn } from '../api/client';
import {
  getApiBaseUrl,
  getDeviceId,
  setApiBaseUrl,
} from '../storage/appStorage';

export function LoginScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState('');
  const [showServer, setShowServer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useState(() => {
    void getApiBaseUrl().then(setServer);
  });

  async function submit() {
    setError(null);
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    setBusy(true);
    try {
      await setApiBaseUrl(server);
      const deviceId = await getDeviceId();
      await signIn(username.trim(), password, deviceId);
      onSignedIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>G</Text>
          </View>
          <Text style={styles.title}>Galatura Monitor</Text>
          <Text style={styles.subtitle}>Read-only factory dashboard.</Text>
        </View>
        <Card>
          <Text style={styles.cardTitle}>Sign in</Text>
          <Field
            label="Username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            placeholder="employee.code"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            placeholder="Your password"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <AppButton
            title="Sign in"
            onPress={() => {
              void submit();
            }}
            loading={busy}
          />
          <AppButton
            title={showServer ? 'Hide server settings' : 'Server settings'}
            variant="ghost"
            onPress={() => setShowServer(c => !c)}
          />
          {showServer ? (
            <Field
              label="API base URL"
              value={server}
              onChangeText={setServer}
              autoCapitalize="none"
              keyboardType="url"
            />
          ) : null}
        </Card>
        <Hint>
          C7 monitor is read-only. No offline writes or sensitive payloads are
          stored.
        </Hint>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.xl,
  },
  brand: { alignItems: 'center', gap: spacing.sm },
  logo: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { color: colors.white, fontSize: 30, fontWeight: '800' },
  title: { color: colors.ink, fontSize: 24, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 14 },
  cardTitle: { color: colors.ink, fontSize: 18, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 13 },
});
