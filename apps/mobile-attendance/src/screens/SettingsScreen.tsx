import { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { signOut } from '../api/client';
import { AppButton, Card, Field, Hint } from '../components/ui';
import {
  DEFAULT_API_BASE_URL,
  getApiBaseUrl,
  getDeviceId,
  setApiBaseUrl,
  setPersonId,
} from '../storage/appStorage';
import { colors, spacing } from '../theme';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function SettingsScreen({
  personId,
  onBack,
  onPersonChanged,
  onSignedOut,
}: {
  personId: string | null;
  onBack: () => void;
  onPersonChanged: (personId: string | null) => void;
  onSignedOut: () => void;
}) {
  const [personDraft, setPersonDraft] = useState(personId ?? '');
  const [serverDraft, setServerDraft] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getApiBaseUrl(), getDeviceId()]).then(([server, device]) => {
      setServerDraft(server);
      setDeviceId(device);
    });
  }, []);

  async function save() {
    setError(null);
    const trimmedPerson = personDraft.trim();
    if (trimmedPerson && !UUID_PATTERN.test(trimmedPerson)) {
      setError('Employee ID must be a UUID, for example 11111111-1111-4111-8111-111111111111.');
      return;
    }
    if (!/^https?:\/\/\S+$/i.test(serverDraft.trim())) {
      setError('API base URL must start with http:// or https://.');
      return;
    }
    setSaving(true);
    try {
      await Promise.all([
        setPersonId(trimmedPerson || null),
        setApiBaseUrl(serverDraft),
      ]);
      onPersonChanged(trimmedPerson || null);
      Alert.alert('Saved', 'Attendance settings were updated.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  }

  function confirmSignOut() {
    Alert.alert('Sign out?', 'Offline punches on this device will remain queued.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          signOut().finally(onSignedOut);
        },
      },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>SETTINGS</Text>
          <Text style={styles.title}>Device and identity</Text>
          <Text style={styles.subtitle}>Employee ID, server, and session</Text>
        </View>
        <AppButton title="Back" variant="ghost" onPress={onBack} />
      </View>

      <Card>
        <Field
          label="Employee ID"
          value={personDraft}
          onChangeText={setPersonDraft}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="00000000-0000-4000-8000-000000000000"
        />
        <Hint>
          Your Galatura person UUID is used for enrolment and personal attendance
          history. Face matching can still identify you without it.
        </Hint>
        <Field
          label="API base URL"
          value={serverDraft}
          onChangeText={setServerDraft}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder={DEFAULT_API_BASE_URL}
        />
        <Hint>
          Android emulator default: {DEFAULT_API_BASE_URL}. Use your computer's LAN
          address when testing on a physical device.
        </Hint>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <AppButton title="Save settings" onPress={() => save()} loading={saving} />
      </Card>

      <Card>
        <Text style={styles.cardTitle}>This device</Text>
        <Text selectable style={styles.deviceId}>
          {deviceId || 'Loading...'}
        </Text>
        <Hint>
          The device identifier is attached to face verification attempts and audit
          records. It does not contain hardware serial numbers.
        </Hint>
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Session</Text>
        <Hint>
          Signing out clears access and refresh tokens from secure device storage.
          Pending offline punches are not deleted.
        </Hint>
        <AppButton title="Sign out" variant="danger" onPress={confirmSignOut} />
      </Card>

      <Text style={styles.version}>Galatura Attendance 0.0.1</Text>
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
  cardTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  deviceId: {
    color: colors.ink,
    fontSize: 13,
    fontFamily: 'monospace',
    backgroundColor: '#F5F9F7',
    borderRadius: 8,
    padding: spacing.md,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
  },
  version: {
    color: colors.muted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
