CREATE SCHEMA IF NOT EXISTS "realtime_service";

CREATE TABLE "realtime_service"."realtime_connections" (
    "id" UUID NOT NULL,
    "client_app" TEXT NOT NULL,
    "principal_id" TEXT,
    "channels" JSONB NOT NULL,
    "connected_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnected_at" TIMESTAMPTZ(6),
    CONSTRAINT "realtime_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "realtime_service"."realtime_events" (
    "id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "required_permission" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "realtime_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "realtime_service"."webhook_subscriptions" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "target_url" TEXT NOT NULL,
    "event_types" JSONB NOT NULL,
    "secret_enc" BYTEA NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "webhook_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "realtime_service"."webhook_deliveries" (
    "id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "attempt" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "response_code" INTEGER,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMPTZ(6),
    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "realtime_service"."processed_events" (
    "id" UUID NOT NULL,
    "consumer" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processed_at" TIMESTAMPTZ(6) NOT NULL
);

CREATE TABLE "realtime_service"."push_tokens" (
    "id" UUID NOT NULL,
    "principal_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "realtime_connections_principal_id_idx" ON "realtime_service"."realtime_connections"("principal_id");
CREATE INDEX "realtime_events_channel_created_at_idx" ON "realtime_service"."realtime_events"("channel", "created_at");
CREATE INDEX "realtime_events_expires_at_idx" ON "realtime_service"."realtime_events"("expires_at");
CREATE INDEX "webhook_subscriptions_active_idx" ON "realtime_service"."webhook_subscriptions"("active");
CREATE INDEX "webhook_deliveries_subscription_id_created_at_idx" ON "realtime_service"."webhook_deliveries"("subscription_id", "created_at");
CREATE INDEX "webhook_deliveries_event_id_idx" ON "realtime_service"."webhook_deliveries"("event_id");
CREATE INDEX "processed_events_processed_at_idx" ON "realtime_service"."processed_events"("processed_at");
CREATE UNIQUE INDEX "processed_events_consumer_id_key" ON "realtime_service"."processed_events"("consumer", "id");
CREATE UNIQUE INDEX "push_tokens_principal_id_token_key" ON "realtime_service"."push_tokens"("principal_id", "token");
CREATE INDEX "push_tokens_principal_id_active_idx" ON "realtime_service"."push_tokens"("principal_id", "active");
