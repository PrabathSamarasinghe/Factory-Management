import { Injectable } from '@nestjs/common';
import { BusinessRuleError, DependencyUnavailableError } from '@galatura/platform-kit';

export interface CollectionReadiness {
  ready: boolean;
  totalsFinalized: boolean;
  pendingSupplierIds: string[];
}

@Injectable()
export class CollectionReadinessClient {
  private readonly baseUrl = process.env.COLLECTION_SERVICE_URL || 'http://localhost:3005';

  async check(tripId: string): Promise<CollectionReadiness> {
    let response: Response;
    try {
      response = await fetch(
        `${this.baseUrl.replace(/\/$/, '')}/trips/${encodeURIComponent(tripId)}/readiness`,
        {
          headers: { 'x-permissions': JSON.stringify(['collection:read']) },
          signal: AbortSignal.timeout(Number(process.env.COLLECTION_TIMEOUT_MS ?? 5_000)),
        },
      );
    } catch (error) {
      throw new DependencyUnavailableError(
        'The collection service is unavailable; the trip cannot be ended yet.',
        { cause: error },
      );
    }

    if (response.status === 404) {
      throw new BusinessRuleError(
        'The collection service has no readiness record for this trip; record and finalise the weighing first.',
      );
    }
    if (!response.ok) {
      throw new DependencyUnavailableError(
        `The collection service returned HTTP ${response.status} while checking trip readiness.`,
      );
    }

    const body = (await response.json()) as Partial<CollectionReadiness>;
    return {
      ready: body.ready === true,
      totalsFinalized: body.totalsFinalized === true,
      pendingSupplierIds: Array.isArray(body.pendingSupplierIds) ? body.pendingSupplierIds : [],
    };
  }
}
