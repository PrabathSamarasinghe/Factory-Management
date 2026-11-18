export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  mustChangePassword: boolean;
}

export interface LoginResult {
  requires2fa: boolean;
  challengeToken?: string;
  tokens?: AuthTokens;
}

export interface AttendanceEvent {
  id: string;
  personId: string;
  eventType: 'CHECK_IN' | 'CHECK_OUT';
  eventAt: string;
  workDate: string;
  method: string;
}

export interface AttendanceDay {
  id: string;
  personId: string;
  workDate: string;
  firstIn: string | null;
  lastOut: string | null;
  workedMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  status: 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'LEAVE' | 'HOLIDAY' | 'INCOMPLETE';
  approved: boolean;
  closedAt?: string | null;
}

export interface MarkResult {
  duplicate: boolean;
  matched: boolean;
  personId: string;
  event: AttendanceEvent;
  day: AttendanceDay | null;
}

export interface EnrolResult {
  personId: string;
  templateCount: number;
  enrolledAt: string;
}

export interface EnrollmentStatus {
  personId: string;
  enrolled: boolean;
  templateCount: number;
  enrolledAt: string | null;
}

export interface QueuedMark {
  id: string;
  clientEventId: string;
  createdAt: string;
  attempts: number;
  lastError?: string;
  permanent?: boolean;
  payload: {
    personId?: string;
    deviceId?: string;
    imageBase64: string;
    capturedAt: string;
  };
}
