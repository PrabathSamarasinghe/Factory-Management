# Galatura Attendance App

React Native app for face enrolment, attendance marking, offline capture, attendance history, biometric privacy notice, and supervisor manual fallback.

## Features

- Username/password login with optional TOTP two-factor challenge.
- Access and refresh tokens stored in Keychain/Keystore, never AsyncStorage.
- Front-camera face capture using `react-native-vision-camera` 5.
- Enrolment with 3-5 frames and explicit biometric consent capture in people-service.
- Attendance marking with automatic check-in/check-out inference.
- Offline punch queue with automatic and manual sync.
- Recent attendance history and daily summary.
- Supervisor manual entry for face-verification fallback.
- Biometric privacy notice and consent withdrawal guidance.

## Requirements

- Node.js 22.11 or newer.
- Android Studio/JDK or Xcode with the standard React Native toolchain.
- A running Galatura gateway and attendance-service.
- A physical device or emulator with a front camera for full testing.

## Setup

```powershell
pnpm install
pnpm --filter @galatura/mobile-attendance typecheck
pnpm --filter @galatura/mobile-attendance test
pnpm --filter @galatura/mobile-attendance lint
pnpm --filter @galatura/mobile-attendance start
```

In another terminal:

```powershell
pnpm --filter @galatura/mobile-attendance android
# or
pnpm --filter @galatura/mobile-attendance ios
```

## API configuration

Default API base URL:

- Android emulator: `http://10.0.2.2:3000/api/v1`
- iOS simulator: `http://localhost:3000/api/v1`

Change it in the app under Settings, or at the login screen via Server settings. For a physical device use the computer's LAN address, for example `http://192.168.1.20:3000/api/v1`.

Debug Android builds enable cleartext HTTP through the React Native template. Production must use HTTPS.

## Endpoints used

- `POST /identity/auth/login`
- `POST /identity/auth/2fa/verify`
- `POST /identity/auth/refresh`
- `POST /identity/auth/logout`
- `POST /people/persons/:id/consents`
- `GET /attendance/enrollments/:personId/status`
- `POST /attendance/enrollments`
- `POST /attendance/mark`
- `POST /attendance/mark/manual`
- `GET /attendance/days`

The gateway injects identity and permission headers. The app requires appropriate permissions for enrolment, marking, history, and manual fallback.

## Offline behavior

- A captured face is resized to 640 px JPEG and stored in the device queue only when the network or server is unavailable. Queue contents, including face images, are encrypted with a Keychain/Keystore-held local data key before being written to AsyncStorage.
- Queued marks are sent with the original `clientEventId`, so server-side idempotency prevents duplicate punches.
- Automatic sync runs when connectivity returns and the app is signed in.
- Permanent server rejections are marked in the Pending sync screen for review or deletion.
- The queue is capped at 40 captures.

## Native notes

- `metro.config.js` includes the workspace root and both `node_modules` paths so Metro can resolve pnpm symlinks in this monorepo.
- Android camera permission is declared in `android/app/src/main/AndroidManifest.xml`.
- iOS camera usage text is declared in `ios/GalaturaAttendance/Info.plist`.
- Run `pod install` in `ios/` after installing or changing native dependencies.
- The Vision Camera 5 setup requires `react-native-nitro-modules` and `react-native-nitro-image`.

## Limitations

- Face matching is performed on the server; the app does not provide on-device liveness.
- The backend currently defaults to a development stub face engine unless `ATTENDANCE_FACE_ENGINE=http` is configured.
- Production rollout requires the evaluation and privacy sign-off in `docs/face-model-evaluation.md` and `docs/biometric-privacy.md`.
