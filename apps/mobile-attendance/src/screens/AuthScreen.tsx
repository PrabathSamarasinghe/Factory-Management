import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { signIn, verifyTwoFactor } from '../api/client';
import { AppButton, Card, Field, Hint } from '../components/ui';
import {
  getApiBaseUrl,
  getDeviceId,
  setApiBaseUrl,
} from '../storage/appStorage';
import { colors, radius, spacing } from '../theme';

export function AuthScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [server, setServer] = useState('');
  const [showServer, setShowServer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getApiBaseUrl().then(setServer);
  }, []);

  async function submit() {
    setError(null);
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    if (challengeToken && code.trim().length < 6) {
      setError('Enter the 6-digit authenticator code.');
      return;
    }
    setBusy(true);
    try {
      await setApiBaseUrl(server);
      const deviceId = await getDeviceId();
      const result = challengeToken
        ? await verifyTwoFactor(challengeToken, code.trim(), deviceId)
        : await signIn(username.trim(), password, deviceId);
      if (result.requires2fa && result.challengeToken) {
        setChallengeToken(result.challengeToken);
        setCode('');
        return;
      }
      if (!result.tokens) {
        setError('The server did not return an access token.');
        return;
      }
      onSignedIn();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign-in failed.');
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
          <Text style={styles.title}>Galatura Attendance</Text>
          <Text style={styles.subtitle}>
            Secure face attendance for factory teams.
          </Text>
        </View>

        <Card>
          {challengeToken ? (
            <>
              <Text style={styles.cardTitle}>Two-factor verification</Text>
              <Hint>
                Open your authenticator app and enter the current 6-digit code.
              </Hint>
              <Field
                label="Authenticator code"
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                maxLength={8}
                placeholder="000000"
              />
            </>
          ) : (
            <>
              <Text style={styles.cardTitle}>Sign in</Text>
              <Field
                label="Username"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="employee.code"
              />
              <Field
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Your password"
              />
            </>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <AppButton
            title={challengeToken ? 'Verify and continue' : 'Sign in'}
            onPress={() => submit()}
            loading={busy}
          />

          {challengeToken ? (
            <AppButton
              title="Use a different account"
              variant="ghost"
              onPress={() => {
                setChallengeToken(null);
                setError(null);
              }}
            />
          ) : (
            <AppButton
              title={showServer ? 'Hide server settings' : 'Server settings'}
              variant="ghost"
              onPress={() => setShowServer((current) => !current)}
            />
          )}

          {showServer && !challengeToken ? (
            <Field
              label="API base URL"
              value={server}
              onChangeText={setServer}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="http://10.0.2.2:3000/api/v1"
            />
          ) : null}
        </Card>

        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            Face images are used only for attendance verification. Templates are
            encrypted on the server and raw images are not retained.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.xl,
  },
  brand: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: colors.white,
    fontSize: 30,
    fontWeight: '800',
  },
  title: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    textAlign: 'center',
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '700',
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
  },
  notice: {
    paddingHorizontal: spacing.md,
  },
  noticeText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});
