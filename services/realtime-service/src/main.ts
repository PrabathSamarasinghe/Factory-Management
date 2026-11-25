import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppExceptionFilter } from '@galatura/platform-kit';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('RealtimeService');
  const app = await NestFactory.create(AppModule);
  app.use(
    json({
      limit: '2mb',
      verify: (req, _res, buffer) => {
        (req as any).rawBody = Buffer.from(buffer);
      },
    }),
  );
  app.use(urlencoded({ extended: true, limit: '2mb' }));
  app.useGlobalFilters(new AppExceptionFilter());
  app.enableCors();
  app.enableShutdownHooks();
  const port = process.env.PORT || 3007;
  await app.listen(port);
  logger.log(`Realtime service listening on port ${port}`);
}

bootstrap();
