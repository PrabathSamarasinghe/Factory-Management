import {
  Controller,
  Get,
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
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
  ],
  exports: [
    RateLimiterService,
    JwtVerifierService,
    RoutePolicyService,
    ProxyService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(GatewayMiddleware).forRoutes('*');
  }
}
