import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url:
      process.env.DIRECT_URL ||
      process.env.DATABASE_URL ||
      'postgresql://notification_service:password@localhost:5432/postgres?schema=notification',
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
