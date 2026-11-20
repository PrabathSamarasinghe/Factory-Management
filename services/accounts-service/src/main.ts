import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppExceptionFilter } from '@galatura/platform-kit';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('AccountsService');
  const app = await NestFactory.create(AppModule);
  app.use(json({ limit: '2mb' }));
  app.use(urlencoded({ extended: true, limit: '2mb' }));
  app.useGlobalFilters(new AppExceptionFilter());
  app.enableCors();
  app.enableShutdownHooks();
  const port = process.env.PORT || 3008;
  await app.listen(port);
  logger.log(`Accounts service listening on port ${port}`);
}

bootstrap();
