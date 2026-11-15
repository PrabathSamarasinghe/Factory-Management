import { Injectable, Logger } from '@nestjs/common';
import type { Express, RequestHandler } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

export interface RouteTarget {
  prefix: string;
  target: string;
  rewritePrefix?: boolean;
  ws?: boolean;
}

@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);

  getTargets(): RouteTarget[] {
    return [
      {
        prefix: '/api/v1/identity',
        target: process.env.IDENTITY_SERVICE_URL || 'http://localhost:3001',
        rewritePrefix: false,
      },
      {
        prefix: '/api/v1/people',
        target: process.env.PEOPLE_SERVICE_URL || 'http://localhost:3002',
        rewritePrefix: false,
      },
      {
        prefix: '/api/v1/attendance',
        target: process.env.ATTENDANCE_SERVICE_URL || 'http://localhost:3003',
        rewritePrefix: false,
      },
      {
        prefix: '/api/v1/fleet',
        target: process.env.FLEET_SERVICE_URL || 'http://localhost:3004',
        rewritePrefix: false,
      },
      {
        prefix: '/api/v1/collection',
        target: process.env.COLLECTION_SERVICE_URL || 'http://localhost:3005',
        rewritePrefix: false,
      },
      {
        prefix: '/api/v1/notification',
        target: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3006',
        rewritePrefix: false,
      },
      {
        prefix: '/api/v1/realtime',
        target: process.env.REALTIME_SERVICE_URL || 'http://localhost:3007',
        rewritePrefix: false,
        ws: true,
      },
      {
        prefix: '/ws',
        target: process.env.REALTIME_SERVICE_URL || 'http://localhost:3007',
        rewritePrefix: false,
        ws: true,
      },
      {
        prefix: '/api/v1/accounts',
        target: process.env.ACCOUNTS_SERVICE_URL || 'http://localhost:3008',
        rewritePrefix: false,
      },
      {
        prefix: '/api/v1/inventory',
        target: process.env.INVENTORY_SERVICE_URL || 'http://localhost:3009',
        rewritePrefix: false,
      },
      {
        prefix: '/api/v1/reporting',
        target: process.env.REPORTING_SERVICE_URL || 'http://localhost:3010',
        rewritePrefix: false,
      },
      {
        prefix: '/api/v1/monitor',
        target: process.env.REPORTING_SERVICE_URL || 'http://localhost:3010',
        rewritePrefix: false,
      },
    ];
  }

  createProxy(target: RouteTarget): RequestHandler {
    return createProxyMiddleware({
      target: target.target,
      changeOrigin: true,
      ws: target.ws ?? false,
      on: {
        error: (err: Error, _req: any, res: any) => {
          this.logger.error(`Proxy error for ${target.prefix}: ${err.message}`);
          if (!res.headersSent && res.status) {
            res.status(503).json({
              error: {
                code: 'DEPENDENCY_UNAVAILABLE',
                message: `Downstream service at ${target.prefix} is unavailable.`,
              },
            });
          }
        },
      },
    }) as unknown as RequestHandler;
  }

  registerProxies(app: Express) {
    for (const route of this.getTargets()) {
      app.use(route.prefix, this.createProxy(route));
      this.logger.log(`Proxy registered: ${route.prefix} -> ${route.target} (ws: ${!!route.ws})`);
    }
  }
}
