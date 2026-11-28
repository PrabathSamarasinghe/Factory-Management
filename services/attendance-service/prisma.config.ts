import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url:
      process.env.DIRECT_URL ||
      process.env.DATABASE_URL ||
      'postgresql://attendance_service:password@localhost:5432/postgres?schema=attendance',
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
