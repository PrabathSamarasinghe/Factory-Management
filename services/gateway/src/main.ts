import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import type { Express } from 'express';
import { AppExceptionFilter } from '@galatura/platform-kit';
import { AppModule } from './app.module';
import { GatewayMiddleware } from './middleware/gateway.middleware';
import { ProxyService } from './proxy/proxy.service';

async function bootstrap() {
  const logger = new Logger('GatewayService');
  const app = await NestFactory.create(AppModule);

  app.useGlobalFilters(new AppExceptionFilter());
  app.enableCors();

  const gatewayMiddleware = app.get(GatewayMiddleware);
  const proxyService = app.get(ProxyService);
  const expressApp = app.getHttpAdapter().getInstance() as Express;
  expressApp.use(gatewayMiddleware.use.bind(gatewayMiddleware));
  proxyService.registerProxies(expressApp);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`API Gateway listening on port ${port}`);
}

bootstrap();
