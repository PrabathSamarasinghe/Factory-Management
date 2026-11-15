import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppExceptionFilter } from '@galatura/platform-kit';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('IdentityService');
  const app = await NestFactory.create(AppModule);

  app.useGlobalFilters(new AppExceptionFilter());
  app.enableCors();

  const port = process.env.PORT || 3001;
  await app.listen(port);
  logger.log(`Identity service listening on port ${port}`);
}

bootstrap();
