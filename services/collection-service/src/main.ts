import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppExceptionFilter } from '@galatura/platform-kit';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('CollectionService');
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));
  app.useGlobalFilters(new AppExceptionFilter());
  app.enableCors();
  app.enableShutdownHooks();

  const port = process.env.PORT || 3005;
  await app.listen(port);
  logger.log(`Collection service listening on port ${port}`);
}

bootstrap();
