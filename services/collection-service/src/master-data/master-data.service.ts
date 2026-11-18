import { Injectable } from '@nestjs/common';
import { DependencyUnavailableError } from '@galatura/platform-kit';
import { dateTime } from '../common/validation';

export interface MasterDataSnapshot {
  suppliers: Array<Record<string, unknown>>;
  routes: Array<Record<string, unknown>>;
  cursor: string;
  serverTime: string;
}

@Injectable()
export class MasterDataService {
  async pull(since: string | undefined): Promise<MasterDataSnapshot> {
    const cursor = since ? dateTime(since, 'since') : undefined;
    const updatedSince = cursor ? cursor.toISOString() : undefined;
    const [suppliers, routes] = await Promise.all([
      this.fetchJson(
        `${this.peopleUrl()}/master-data/suppliers${updatedSince ? `?updatedSince=${encodeURIComponent(updatedSince)}` : ''}`,
        'person:read',
      ),
      this.fetchJson(`${this.fleetUrl()}/routes`, 'route:read'),
    ]);

    return {
      suppliers: (Array.isArray(suppliers) ? suppliers : []).map((supplier: any) => ({
        supplierId: supplier.supplierId,
        code: supplier.code,
        supplierCode: supplier.supplierCode,
        supplierRegNo: supplier.supplierRegNo,
        supplierRegNoNormalized: supplier.supplierRegNoNormalized,
        barcodeValue: supplier.barcodeValue,
        fullName: supplier.fullName,
        preferredName: supplier.preferredName,
        status: supplier.status,
      })),
      routes: (Array.isArray(routes) ? routes : []).map((route: any) => ({
        id: route.id,
        code: route.code,
        name: route.name,
        status: route.status,
        stops: (Array.isArray(route.stops) ? route.stops : []).map((stop: any) => ({
          id: stop.id,
          supplierId: stop.supplierId,
          sequence: stop.sequence,
        })),
      })),
      cursor: new Date().toISOString(),
      serverTime: new Date().toISOString(),
    };
  }

  private peopleUrl(): string {
    return (process.env.PEOPLE_SERVICE_URL || 'http://localhost:3001').replace(/\/$/, '');
  }

  private fleetUrl(): string {
    return (process.env.FLEET_SERVICE_URL || 'http://localhost:3004').replace(/\/$/, '');
  }

  private async fetchJson(url: string, permission: string): Promise<unknown> {
    try {
      const response = await fetch(url, {
        headers: {
          accept: 'application/json',
          'x-permissions': JSON.stringify([permission]),
        },
        signal: AbortSignal.timeout(Number(process.env.MASTER_DATA_TIMEOUT_MS ?? 5000)),
      });
      if (!response.ok) {
        throw new Error(`${permission} upstream returned ${response.status}.`);
      }
      return await response.json();
    } catch (error) {
      throw new DependencyUnavailableError('Master data is currently unavailable.', {
        cause: error,
      });
    }
  }
}
