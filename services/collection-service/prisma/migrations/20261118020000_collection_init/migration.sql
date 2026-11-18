-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "collection";

SET search_path TO "collection";

-- CreateEnum
CREATE TYPE "ScanMethod" AS ENUM ('BARCODE', 'REG_NO');
CREATE TYPE "PickupStatus" AS ENUM ('RECORDED', 'VOID', 'SUPERSEDED');
CREATE TYPE "WeighingStatus" AS ENUM ('RECORDED', 'VOID');
CREATE TYPE "DiscrepancyStatus" AS ENUM ('OPEN', 'ACCEPTED', 'DISPUTED', 'RESOLVED');
CREATE TYPE "SmsStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "collection"."pickups" (
    "id" UUID NOT NULL,
    "client_pickup_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "route_stop_id" UUID,
    "supplier_id" UUID NOT NULL,
    "supplier_reg_no" TEXT NOT NULL,
    "supplier_barcode" TEXT,
    "gross_weight_kg" DECIMAL(10,3) NOT NULL,
    "bags_count" INTEGER NOT NULL,
    "tare_kg" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "moisture_deduction_kg" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "quality_grade" TEXT,
    "recorded_by" UUID NOT NULL,
    "recorded_at_device" TIMESTAMPTZ(6) NOT NULL,
    "received_at_server" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gps_lat" DECIMAL(9,6),
    "gps_lng" DECIMAL(9,6),
    "scan_method" "ScanMethod" NOT NULL,
    "manual_reason" TEXT,
    "status" "PickupStatus" NOT NULL DEFAULT 'RECORDED',
    "supersedes_id" UUID,
    "device_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pickups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "collection"."factory_weighings" (
    "id" UUID NOT NULL,
    "client_weighing_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "pickup_id" UUID,
    "net_weight_kg" DECIMAL(10,3) NOT NULL,
    "gross_weight_kg" DECIMAL(10,3) NOT NULL,
    "tare_kg" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "bags_count" INTEGER NOT NULL,
    "deductions_kg" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "quality_grade" TEXT,
    "scale_id" TEXT NOT NULL,
    "weighed_by" UUID NOT NULL,
    "weighed_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "WeighingStatus" NOT NULL DEFAULT 'RECORDED',
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "factory_weighings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "collection"."daily_supplier_totals" (
    "id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "collection_date" DATE NOT NULL,
    "total_net_kg" DECIMAL(10,3) NOT NULL,
    "total_bags" INTEGER NOT NULL,
    "trip_id" UUID NOT NULL,
    "finalized" BOOLEAN NOT NULL DEFAULT false,
    "finalized_at" TIMESTAMPTZ(6),
    "finalized_by" UUID,
    "sms_status" "SmsStatus" NOT NULL DEFAULT 'PENDING',
    "sms_message_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_supplier_totals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "collection"."weight_discrepancies" (
    "id" UUID NOT NULL,
    "pickup_id" UUID NOT NULL,
    "weighing_id" UUID NOT NULL,
    "field_kg" DECIMAL(10,3) NOT NULL,
    "factory_kg" DECIMAL(10,3) NOT NULL,
    "diff_kg" DECIMAL(10,3) NOT NULL,
    "diff_pct" DECIMAL(10,3) NOT NULL,
    "status" "DiscrepancyStatus" NOT NULL DEFAULT 'OPEN',
    "resolved_by" UUID,
    "note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weight_discrepancies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "collection"."sync_batches" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "item_count" INTEGER NOT NULL,
    "accepted" INTEGER NOT NULL,
    "rejected" INTEGER NOT NULL,
    "errors" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "collection"."scales" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "calibrated_on" DATE,
    "calibration_due" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scales_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "collection"."outbox_events" (
    "id" UUID NOT NULL,
    "envelope" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "collection"."collection_audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "metadata" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pickups_client_pickup_id_key" ON "collection"."pickups"("client_pickup_id");
CREATE INDEX "pickups_trip_id_idx" ON "collection"."pickups"("trip_id");
CREATE INDEX "pickups_supplier_id_idx" ON "collection"."pickups"("supplier_id");
CREATE INDEX "pickups_recorded_by_idx" ON "collection"."pickups"("recorded_by");
CREATE INDEX "pickups_status_idx" ON "collection"."pickups"("status");

CREATE UNIQUE INDEX "factory_weighings_client_weighing_id_key" ON "collection"."factory_weighings"("client_weighing_id");
CREATE UNIQUE INDEX "factory_weighings_trip_id_supplier_id_key" ON "collection"."factory_weighings"("trip_id", "supplier_id");
CREATE INDEX "factory_weighings_pickup_id_idx" ON "collection"."factory_weighings"("pickup_id");
CREATE INDEX "factory_weighings_weighed_by_idx" ON "collection"."factory_weighings"("weighed_by");

CREATE UNIQUE INDEX "daily_supplier_totals_supplier_id_collection_date_key" ON "collection"."daily_supplier_totals"("supplier_id", "collection_date");
CREATE INDEX "daily_supplier_totals_trip_id_idx" ON "collection"."daily_supplier_totals"("trip_id");
CREATE INDEX "daily_supplier_totals_sms_status_idx" ON "collection"."daily_supplier_totals"("sms_status");

CREATE UNIQUE INDEX "weight_discrepancies_pickup_id_weighing_id_key" ON "collection"."weight_discrepancies"("pickup_id", "weighing_id");
CREATE INDEX "weight_discrepancies_status_idx" ON "collection"."weight_discrepancies"("status");
CREATE INDEX "sync_batches_device_id_idx" ON "collection"."sync_batches"("device_id");
CREATE INDEX "collection_audit_logs_entity_type_entity_id_idx" ON "collection"."collection_audit_logs"("entity_type", "entity_id");
