import { Injectable, Logger } from '@nestjs/common';
import { DependencyUnavailableError } from '@galatura/platform-kit';

export interface MasterSupplier {
  supplierId: string;
  fullName: string;
  preferredName?: string | null;
  phonePrimary?: string | null;
  smsPhone?: string | null;
  smsOptIn?: boolean | null;
}

@Injectable()
export class PeopleService {
  private readonly logger = new Logger(PeopleService.name);

  async getSupplier(supplierId: string): Promise<MasterSupplier | null> {
    const base = process.env.PEOPLE_SERVICE_URL || 'http://localhost:3003';
    try {
      const response = await fetch(`${base}/persons/master-data/suppliers`, {
        headers: {
          'content-type': 'application/json',
          'x-permissions': JSON.stringify(['person:read']),
          'x-service': 'notification-service',
        },
        signal: AbortSignal.timeout(Number(process.env.SERVICE_TIMEOUT_MS ?? 5000)),
      });
      if (!response.ok) {
        throw new Error(`people service returned ${response.status}`);
      }
      const suppliers = (await response.json()) as MasterSupplier[];
      return suppliers.find((supplier) => supplier.supplierId === supplierId) ?? null;
    } catch (error) {
      this.logger.warn(`Could not load supplier master data: ${(error as Error).message}`);
      throw new DependencyUnavailableError('Supplier master data is unavailable.');
    }
  }
}
