CREATE SCHEMA IF NOT EXISTS "reporting";

CREATE TABLE "reporting"."processed_events" (
    "id" UUID NOT NULL,
    "consumer" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processed_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reporting"."rpt_daily_summary" (
    "date" DATE NOT NULL,
    "attendance_present" INTEGER NOT NULL,
    "attendance_late" INTEGER NOT NULL,
    "attendance_absent" INTEGER NOT NULL,
    "trips_started" INTEGER NOT NULL,
    "trips_ended" INTEGER NOT NULL,
    "kg_collected" DECIMAL(18,3) NOT NULL,
    "kg_weighed" DECIMAL(18,3) NOT NULL,
    "suppliers_paid_decimal" DECIMAL(18,2) NOT NULL,
    "sms_queued" INTEGER NOT NULL,
    "sms_sent" INTEGER NOT NULL,
    "sms_delivered" INTEGER NOT NULL,
    "sms_failed" INTEGER NOT NULL,
    "source_event_ids" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "rpt_daily_summary_pkey" PRIMARY KEY ("date")
);

CREATE TABLE "reporting"."rpt_trip_live" (
    "trip_id" UUID NOT NULL,
    "route_id" UUID,
    "lorry_id" UUID,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(6),
    "ended_at" TIMESTAMPTZ(6),
    "last_event_id" UUID NOT NULL,
    "source_event_ids" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "rpt_trip_live_pkey" PRIMARY KEY ("trip_id")
);

CREATE TABLE "reporting"."rpt_supplier_daily" (
    "id" TEXT NOT NULL,
    "supplier_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "collection_kg" DECIMAL(18,3) NOT NULL,
    "collection_bags" INTEGER NOT NULL,
    "paid_amount" DECIMAL(18,2) NOT NULL,
    "source_event_ids" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "rpt_supplier_daily_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reporting"."rpt_finance_snapshot" (
    "id" TEXT NOT NULL,
    "cash_in" DECIMAL(18,2) NOT NULL,
    "cash_out" DECIMAL(18,2) NOT NULL,
    "payables" DECIMAL(18,2) NOT NULL,
    "journal_posted_total" DECIMAL(18,2) NOT NULL,
    "payroll_approved_total" DECIMAL(18,2) NOT NULL,
    "payment_paid_total" DECIMAL(18,2) NOT NULL,
    "source_event_ids" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "rpt_finance_snapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reporting"."rpt_inventory_snapshot" (
    "id" TEXT NOT NULL,
    "purchase_qty" DECIMAL(18,3) NOT NULL,
    "purchase_value" DECIMAL(18,2) NOT NULL,
    "issue_qty" DECIMAL(18,3) NOT NULL,
    "issue_value" DECIMAL(18,2) NOT NULL,
    "receipt_count" INTEGER NOT NULL,
    "issue_count" INTEGER NOT NULL,
    "source_event_ids" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "rpt_inventory_snapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reporting"."ingest_audit" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ingest_audit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "processed_events_consumer_id_key" ON "reporting"."processed_events"("consumer", "id");
CREATE INDEX "processed_events_type_idx" ON "reporting"."processed_events"("type");
CREATE INDEX "rpt_trip_live_status_idx" ON "reporting"."rpt_trip_live"("status");
CREATE UNIQUE INDEX "rpt_supplier_daily_supplier_id_date_key" ON "reporting"."rpt_supplier_daily"("supplier_id", "date");
CREATE INDEX "rpt_supplier_daily_date_idx" ON "reporting"."rpt_supplier_daily"("date");
CREATE INDEX "ingest_audit_event_id_idx" ON "reporting"."ingest_audit"("event_id");
CREATE INDEX "ingest_audit_status_idx" ON "reporting"."ingest_audit"("status");

INSERT INTO "reporting"."rpt_finance_snapshot" (
    "id", "cash_in", "cash_out", "payables", "journal_posted_total",
    "payroll_approved_total", "payment_paid_total", "source_event_ids", "updated_at"
) VALUES (
    'finance-current', 0, 0, 0, 0, 0, 0, '[]'::jsonb, CURRENT_TIMESTAMP
) ON CONFLICT ("id") DO NOTHING;

INSERT INTO "reporting"."rpt_inventory_snapshot" (
    "id", "purchase_qty", "purchase_value", "issue_qty", "issue_value",
    "receipt_count", "issue_count", "source_event_ids", "updated_at"
) VALUES (
    'inventory-current', 0, 0, 0, 0, 0, 0, '[]'::jsonb, CURRENT_TIMESTAMP
) ON CONFLICT ("id") DO NOTHING;
