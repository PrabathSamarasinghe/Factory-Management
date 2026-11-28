import { Controller, Get, Module } from '@nestjs/common';
import { RateLimiterService } from './middleware/rate-limiter.service';
import { JwtVerifierService } from './middleware/jwt-verifier.service';
import { RoutePolicyService } from './middleware/route-policy.service';
import { GatewayMiddleware } from './middleware/gateway.middleware';
import { ProxyService } from './proxy/proxy.service';

@Controller()
export class HealthController {
  @Get('healthz')
  getHealth() {
    return { status: 'healthy', timestamp: new Date().toISOString() };
  }
}

@Module({
  controllers: [HealthController],
  providers: [
    RateLimiterService,
    JwtVerifierService,
    RoutePolicyService,
    ProxyService,
    GatewayMiddleware,
  ],
  exports: [
    RateLimiterService,
    JwtVerifierService,
    RoutePolicyService,
    ProxyService,
    GatewayMiddleware,
  ],
})
export class AppModule {}
