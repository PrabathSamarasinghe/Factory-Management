import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
} from 'react-native-vision-camera';
import {
  ApiError,
  enrolFace,
  isNetworkError,
  markAttendance,
  recordBiometricConsent,
} from '../api/client';
import { prepareFaceImage } from '../camera/prepareFaceImage';
import { AppButton, Card, Hint } from '../components/ui';
import { enqueueMark } from '../storage/offlineQueue';
import { colors, radius, spacing } from '../theme';
import { uuidV4 } from '../utils/uuid';

type Mode = 'mark' | 'enroll';

export function CameraScreen({
  mode,
  personId,
  deviceId,
  onClose,
  onMarked,
  onQueued,
}: {
  mode: Mode;
  personId: string | null;
  deviceId: string;
  onClose: () => void;
  onMarked: () => void;
  onQueued: () => void;
}) {
  const [stage, setStage] = useState<'notice' | 'capture'>(
    mode === 'enroll' ? 'notice' : 'capture',
  );
  const [consent, setConsent] = useState(false);
  const [frames, setFrames] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const device = useCameraDevice('front');
  const photoOutput = usePhotoOutput({ qualityPrioritization: 'balanced' });
  const { hasPermission, requestPermission } = useCameraPermission();

  async function capture() {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const photo = await photoOutput.capturePhotoToFile(
        { enableShutterSound: false },
        {},
      );
      const base64 = await prepareFaceImage(photo.filePath);
      if (mode === 'mark') {
        await submitMark(base64);
      } else {
        setFrames((current) => [...current, base64].slice(0, 5));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Camera capture failed.');
    } finally {
      setBusy(false);
    }
  }

  async function submitMark(imageBase64: string) {
    const clientEventId = uuidV4();
    const capturedAt = new Date().toISOString();
    try {
      const result = await markAttendance({
        clientEventId,
        personId: personId ?? undefined,
        deviceId,
        imageBase64,
        capturedAt,
      });
      const label =
        result.event.eventType === 'CHECK_IN' ? 'Check-in recorded' : 'Check-out recorded';
      Alert.alert(label, result.day ? `Status: ${result.day.status.replace('_', ' ')}` : undefined);
      onMarked();
    } catch (caught) {
      const shouldQueue =
        isNetworkError(caught) ||
        (caught instanceof ApiError && caught.status >= 500);
      if (!shouldQueue) {
        throw caught;
      }
      await enqueueMark({
        id: uuidV4(),
        clientEventId,
        createdAt: capturedAt,
        attempts: 0,
        payload: {
          personId: personId ?? undefined,
          deviceId,
          imageBase64,
          capturedAt,
        },
      });
      Alert.alert(
        'Saved offline',
        'The punch is stored on this device and will sync when you are online.',
      );
      onQueued();
    }
  }

  async function submitEnrollment() {
    if (!personId) {
      setError('Set your employee ID before enrolling your face.');
      return;
    }
    if (frames.length < 3) {
      setError('Capture at least 3 frames with good lighting.');
      return;
    }
    if (!consent) {
      setError('Confirm the biometric consent notice before enrolling.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await recordBiometricConsent(personId);
      const result = await enrolFace(personId, frames);
      Alert.alert(
        'Face enrolled',
        `${result.templateCount} encrypted face templates were created.`,
      );
      onMarked();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Face enrolment failed.');
    } finally {
      setBusy(false);
    }
  }

  if (!hasPermission) {
    return (
      <View style={styles.permission}>
        <Card>
          <Text style={styles.permissionTitle}>Camera permission</Text>
          <Hint>
            Camera access is required to capture a face frame for attendance verification.
          </Hint>
          <AppButton title="Allow camera" onPress={() => requestPermission()} />
          <AppButton title="Close" variant="ghost" onPress={onClose} />
        </Card>
      </View>
    );
  }

  if (stage === 'notice') {
    return (
      <ScrollView contentContainerStyle={styles.noticeContent}>
        <View style={styles.noticeHeader}>
          <Text style={styles.noticeTitle}>Biometric face enrolment</Text>
          <AppButton title="Cancel" variant="ghost" onPress={onClose} />
        </View>
        <Card>
          <Hint>
            Galatura uses your face to verify attendance. Up to five face images are
            converted into mathematical templates, encrypted on the server, and never
            stored as raw photographs. Your camera frames are sent only for this purpose.
          </Hint>
          <Hint>
            You can withdraw biometric consent by asking HR or by revoking your face
            enrolment. Withdrawal stops face marking but may require another attendance
            method.
          </Hint>
          <Hint>
            Templates are retained only while your biometric consent is active. Security
            logs and attendance events are retained under the company attendance policy.
          </Hint>
        </Card>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: consent }}
          onPress={() => setConsent((current) => !current)}
          style={styles.consentRow}
        >
          <View style={[styles.checkbox, consent && styles.checkboxChecked]}>
            {consent ? <Text style={styles.checkmark}>OK</Text> : null}
          </View>
          <Text style={styles.consentText}>
            I have read the notice and consent to biometric face enrolment for attendance.
          </Text>
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <AppButton title="Continue to camera" onPress={() => setStage('capture')} disabled={!consent} />
      </ScrollView>
    );
  }

  if (!device) {
    return (
      <View style={styles.permission}>
        <Card>
          <Text style={styles.permissionTitle}>Front camera unavailable</Text>
          <Hint>Use a device with a working front camera to verify attendance.</Hint>
          <AppButton title="Close" onPress={onClose} />
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive
        outputs={[photoOutput]}
      />
      <View style={styles.scrimTop}>
        <Pressable onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
        <Text style={styles.cameraTitle}>
          {mode === 'mark' ? 'Verify face' : 'Enrol face'}
        </Text>
        <View style={styles.closeButtonSpacer} />
      </View>

      <View style={styles.faceGuide} pointerEvents="none" />

      <View style={styles.scrimBottom}>
        {mode === 'enroll' ? (
          <>
            <View style={styles.frameDots}>
              {[0, 1, 2, 3, 4].map((index) => (
                <View
                  key={index}
                  style={[styles.dot, index < frames.length && styles.dotFilled]}
                />
              ))}
            </View>
            <Text style={styles.helperText}>
              {frames.length < 3
                ? `Capture ${3 - frames.length} more frame${frames.length === 2 ? '' : 's'} in even lighting.`
                : `${frames.length} frames ready. Look straight ahead with a neutral expression.`}
            </Text>
          </>
        ) : (
          <Text style={styles.helperText}>
            Centre your face in the oval. Good lighting improves verification.
          </Text>
        )}

        {error ? <Text style={styles.cameraError}>{error}</Text> : null}

        <View style={styles.controls}>
          <View style={styles.controlSide}>
            {mode === 'enroll' && frames.length > 0 ? (
              <Pressable
                onPress={() => setFrames([])}
                style={styles.secondaryControl}
                disabled={busy}
              >
                <Text style={styles.secondaryText}>Clear</Text>
              </Pressable>
            ) : null}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Capture face"
            onPress={() => capture()}
            disabled={busy || (mode === 'enroll' && frames.length >= 5)}
            style={[styles.shutter, (busy || frames.length >= 5) && styles.shutterDisabled]}
          >
            {busy ? <ActivityIndicator color={colors.primary} /> : null}
          </Pressable>

          <View style={styles.controlSide}>
            {mode === 'enroll' && frames.length >= 3 ? (
              <Pressable
                onPress={() => submitEnrollment()}
                style={styles.secondaryControl}
                disabled={busy}
              >
                <Text style={styles.secondaryText}>Enrol</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  permission: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  permissionTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '800',
  },
  noticeContent: {
    padding: spacing.lg,
    gap: spacing.lg,
    backgroundColor: colors.background,
    flexGrow: 1,
  },
  noticeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  noticeTitle: {
    flex: 1,
    color: colors.ink,
    fontSize: 24,
    fontWeight: '800',
  },
  consentRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
  },
  checkmark: {
    color: colors.white,
    fontSize: 9,
    fontWeight: '900',
  },
  consentText: {
    flex: 1,
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
  },
  scrimTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    minHeight: 88,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  cameraTitle: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  closeButton: {
    width: 64,
    paddingVertical: 8,
  },
  closeButtonSpacer: {
    width: 64,
  },
  closeText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  faceGuide: {
    position: 'absolute',
    alignSelf: 'center',
    top: '22%',
    width: '66%',
    aspectRatio: 0.78,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.75)',
  },
  scrimBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  frameDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.white,
  },
  dotFilled: {
    backgroundColor: colors.white,
  },
  helperText: {
    color: colors.white,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 19,
  },
  cameraError: {
    color: '#FFD6D0',
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 19,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  controlSide: {
    width: 72,
    alignItems: 'center',
  },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.white,
    borderWidth: 5,
    borderColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterDisabled: {
    opacity: 0.55,
  },
  secondaryControl: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  secondaryText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 13,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
  },
});
