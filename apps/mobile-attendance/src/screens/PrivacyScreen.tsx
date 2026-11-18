import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton, Card, Hint } from '../components/ui';
import { colors, spacing } from '../theme';

const sections = [
  {
    title: 'What we collect',
    body:
      'A face image frame captured when you enrol or mark attendance, the resulting encrypted face template, your employee ID, device identifier, and the time and location of the attendance event.',
  },
  {
    title: 'Why we use it',
    body:
      'Biometric data is used only to verify that the person marking attendance is you. It is not used for productivity scoring, emotion detection, advertising, or sale to third parties.',
  },
  {
    title: 'How it is protected',
    body:
      'Raw images are processed for verification and are not retained by the attendance service. Templates are encrypted with AES-GCM using keys held by the platform. Access is restricted to authorised attendance and audit roles.',
  },
  {
    title: 'Retention',
    body:
      'Face templates are retained only while your biometric consent is active. When consent is withdrawn or enrolment is revoked, active templates are cleared. Attendance events and audit records follow the company attendance and legal retention policy.',
  },
  {
    title: 'Offline captures',
    body:
      'If the device is offline, the captured frame and attendance details are stored in the app queue on this device. They are removed after successful synchronisation. You can delete an unsent punch from the Pending sync screen.',
  },
  {
    title: 'Your choices',
    body:
      'You may refuse or withdraw biometric consent. Withdrawal stops face-based attendance and may require an alternative method such as a manual supervisor mark. Contact HR or your administrator to request access, correction, or deletion.',
  },
  {
    title: 'Security incidents',
    body:
      'Suspected biometric data misuse or a lost device should be reported to the factory administrator immediately. Sessions can be revoked and face templates disabled from the attendance administration tools.',
  },
];

export function PrivacyScreen({ onBack }: { onBack: () => void }) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>PRIVACY</Text>
          <Text style={styles.title}>Biometric notice</Text>
          <Text style={styles.subtitle}>How face data is used and protected</Text>
        </View>
        <AppButton title="Back" variant="ghost" onPress={onBack} />
      </View>

      <Card>
        <Hint>
          This notice summarises the biometric processing performed by the Galatura
          Attendance App. Your employer's biometric policy and applicable law take
          precedence where they provide stronger protections.
        </Hint>
      </Card>

      {sections.map((section) => (
        <Card key={section.title}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <Text style={styles.body}>{section.body}</Text>
        </Card>
      ))}

      <Card>
        <Text style={styles.sectionTitle}>Contact</Text>
        <Text style={styles.body}>
          Contact your HR administrator or the Galatura platform administrator for
          privacy requests, consent withdrawal, or questions about attendance records.
        </Text>
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
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  body: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
  },
});
