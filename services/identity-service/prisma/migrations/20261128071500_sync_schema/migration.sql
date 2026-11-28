ALTER TABLE "identity"."devices" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "identity"."permission_change_requests" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "identity"."permissions" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "identity"."roles" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "identity"."service_clients" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "identity"."sessions" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "identity"."users" ALTER COLUMN "username" SET DATA TYPE TEXT,
ALTER COLUMN "email" SET DATA TYPE TEXT,
ALTER COLUMN "updated_at" DROP DEFAULT;
