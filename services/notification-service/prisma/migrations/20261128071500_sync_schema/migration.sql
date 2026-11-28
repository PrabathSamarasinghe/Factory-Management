ALTER TABLE "notification"."sms_messages" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "notification"."sms_provider_configs" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "notification"."sms_templates" ALTER COLUMN "updated_at" DROP DEFAULT;
