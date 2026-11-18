CREATE SCHEMA IF NOT EXISTS "notification";

CREATE TYPE "notification"."SmsMessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED');

CREATE TABLE "notification"."sms_templates" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification"."sms_messages" (
    "id" UUID NOT NULL,
    "recipient_phone_enc" TEXT NOT NULL,
    "recipient_person_id" UUID,
    "template_code" TEXT NOT NULL,
    "body_rendered" TEXT NOT NULL,
    "related_type" TEXT NOT NULL,
    "related_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "sender_id" TEXT,
    "provider_message_id" TEXT,
    "status" "notification"."SmsMessageStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "cost_estimate" DECIMAL(10,4),
    "next_attempt_at" TIMESTAMPTZ(6),
    "queued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification"."sms_dead_letters" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL,
    "event" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_dead_letters_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification"."sms_processed_events" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_processed_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification"."sms_provider_configs" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "daily_limit" INTEGER NOT NULL,
    "monthly_limit" INTEGER NOT NULL,
    "cost_per_message" DECIMAL(10,4) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_provider_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification"."sms_audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification"."outbox_events" (
    "id" UUID NOT NULL,
    "envelope" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification"."push_notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sms_templates_code_language_key" ON "notification"."sms_templates"("code", "language");
CREATE UNIQUE INDEX "sms_messages_idempotency_key_key" ON "notification"."sms_messages"("idempotency_key");
CREATE INDEX "sms_messages_related_type_related_id_idx" ON "notification"."sms_messages"("related_type", "related_id");
CREATE INDEX "sms_messages_status_next_attempt_at_idx" ON "notification"."sms_messages"("status", "next_attempt_at");
CREATE INDEX "sms_messages_provider_message_id_idx" ON "notification"."sms_messages"("provider_message_id");
CREATE UNIQUE INDEX "sms_dead_letters_message_id_key" ON "notification"."sms_dead_letters"("message_id");
CREATE UNIQUE INDEX "sms_provider_configs_provider_key" ON "notification"."sms_provider_configs"("provider");
CREATE INDEX "sms_audit_logs_entity_type_entity_id_idx" ON "notification"."sms_audit_logs"("entity_type", "entity_id");
CREATE INDEX "push_notifications_user_id_created_at_idx" ON "notification"."push_notifications"("user_id", "created_at");

INSERT INTO "notification"."sms_templates" ("id", "code", "language", "body", "active")
VALUES
    ('019a0000-0000-7000-8000-000000000001', 'collection.finalized', 'en', 'GALATURA: {{supplierName}} - {{totalBags}} bags / {{totalNetKg}} kg collected on {{collectionDate}}. Thank you.', true),
    ('019a0000-0000-7000-8000-000000000002', 'collection.finalized', 'si', 'GALATURA: {{supplierName}} - {{collectionDate}} දින බෑග් {{totalBags}} / බර {{totalNetKg}} කි.ග්‍රෑ. එකතු කරන ලදී. ස්තූතියි.', true),
    ('019a0000-0000-7000-8000-000000000003', 'collection.finalized', 'ta', 'GALATURA: {{supplierName}} - {{collectionDate}} அன்று பைகள் {{totalBags}} / எடை {{totalNetKg}} கி.கி. சேகரிக்கப்பட்டது. நன்றி.', true)
ON CONFLICT ("code", "language") DO NOTHING;

INSERT INTO "notification"."sms_provider_configs" ("id", "provider", "sender_id", "active", "daily_limit", "monthly_limit", "cost_per_message")
VALUES ('019a0000-0000-7000-8000-000000000004', 'FAKE', 'GALATURA', true, 500, 10000, 0.0500)
ON CONFLICT ("provider") DO NOTHING;
