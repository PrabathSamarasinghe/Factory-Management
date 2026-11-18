import {
  DependencyUnavailableError,
  ForbiddenError,
  NotFoundError,
} from '@galatura/platform-kit';
import { Injectable } from '@nestjs/common';

interface ConsentRecord {
  consentType?: string;
  granted?: boolean;
  revokedAt?: string | null;
  grantedAt?: string;
}

interface PersonRecord {
  id?: string;
  status?: string;
  consents?: ConsentRecord[];
}

@Injectable()
export class PeopleConsentClient {
  private readonly baseUrl = process.env.PEOPLE_SERVICE_URL || 'http://localhost:3002';

  async assertBiometricConsent(personId: string): Promise<ConsentRecord> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/persons/${personId}`, {
        headers: {
          'x-permissions': JSON.stringify(['person:read']),
        },
        signal: AbortSignal.timeout(5_000),
      });
    } catch (error) {
      throw new DependencyUnavailableError('The people service is unavailable.', { cause: error });
    }

    if (response.status === 404) {
      throw new NotFoundError(`Person "${personId}" was not found.`);
    }
    if (!response.ok) {
      throw new DependencyUnavailableError(
        `The people service returned HTTP ${response.status} while checking biometric consent.`,
      );
    }

    const person = (await response.json()) as PersonRecord;
    if (person.status && person.status !== 'ACTIVE') {
      throw new ForbiddenError('Biometric enrolment requires an active person record.');
    }

    const consent = (person.consents ?? []).find(
      (record) =>
        record.consentType === 'BIOMETRIC' && record.granted === true && !record.revokedAt,
    );
    if (!consent) {
      throw new ForbiddenError('Biometric consent is required before face enrolment.');
    }
    return consent;
  }
}
