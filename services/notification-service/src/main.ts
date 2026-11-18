import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppExceptionFilter } from '@galatura/platform-kit';
import { json, urlencoded, type Request } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('NotificationService');
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  app.use(
    json({
      limit: '64kb',
      verify: (req, _res, buffer) => {
        (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
      },
    }),
  );
  app.use(urlencoded({ extended: true, limit: '64kb' }));
  app.useGlobalFilters(new AppExceptionFilter());
  app.enableCors();
  app.enableShutdownHooks();

  const port = process.env.PORT || 3006;
  await app.listen(port);
  logger.log(`Notification service listening on port ${port}`);
}

bootstrap();
