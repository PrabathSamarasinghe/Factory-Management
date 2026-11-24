CREATE SCHEMA IF NOT EXISTS "inventory";

CREATE TYPE "inventory"."ValuationMethod" AS ENUM ('WEIGHTED_AVG', 'FIFO', 'LIFO');
CREATE TYPE "inventory"."DocumentStatus" AS ENUM ('DRAFT', 'APPROVED', 'CANCELLED');
CREATE TYPE "inventory"."StockTakeStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');
CREATE TYPE "inventory"."MovementType" AS ENUM ('RECEIPT', 'ISSUE', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT', 'RETURN');

CREATE TABLE "inventory"."item_categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "item_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory"."units" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory"."items" (
    "id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "barcode" TEXT,
    "reorder_level" DECIMAL(18,3) NOT NULL,
    "reorder_qty" DECIMAL(18,3) NOT NULL,
    "is_batch_tracked" BOOLEAN NOT NULL DEFAULT false,
    "valuation_method" "inventory"."ValuationMethod" NOT NULL DEFAULT 'WEIGHTED_AVG',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory"."warehouses" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory"."stock_locations" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "stock_locations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory"."vendors" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "tax_no" TEXT,
    "bank_details_enc" BYTEA,
    "bank_details_masked" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory"."goods_receipts" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "receipt_date" DATE NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "inventory"."DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "location_id" UUID NOT NULL,
    "received_by_id" UUID,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "idempotency_key" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory"."goods_receipt_lines" (
    "id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "qty" DECIMAL(18,3) NOT NULL,
    "unit_cost" DECIMAL(18,2) NOT NULL,
    "batch_no" TEXT,
    "expiry_date" DATE,
    CONSTRAINT "goods_receipt_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory"."goods_issues" (
    "id" UUID NOT NULL,
    "issue_date" DATE NOT NULL,
    "issued_to_type" TEXT NOT NULL,
    "issued_to_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" "inventory"."DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "issued_by_id" UUID,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "idempotency_key" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "goods_issues_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory"."goods_issue_lines" (
    "id" UUID NOT NULL,
    "issue_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "qty" DECIMAL(18,3) NOT NULL,
    "batch_id" TEXT,
    CONSTRAINT "goods_issue_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory"."transfers" (
    "id" UUID NOT NULL,
    "from_location_id" UUID NOT NULL,
    "to_location_id" UUID NOT NULL,
    "status" "inventory"."DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "idempotency_key" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory"."transfer_lines" (
    "id" UUID NOT NULL,
    "transfer_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "qty" DECIMAL(18,3) NOT NULL,
    "batch_id" TEXT,
    CONSTRAINT "transfer_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory"."adjustments" (
    "id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "qty_delta" DECIMAL(18,3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "inventory"."DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "idempotency_key" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "adjustments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory"."stock_takes" (
    "id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "status" "inventory"."StockTakeStatus" NOT NULL DEFAULT 'OPEN',
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "idempotency_key" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_takes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory"."stock_take_lines" (
    "id" UUID NOT NULL,
    "take_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "system_qty" DECIMAL(18,3) NOT NULL,
    "counted_qty" DECIMAL(18,3) NOT NULL,
    "variance" DECIMAL(18,3) NOT NULL,
    "applied" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "stock_take_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory"."stock_batches" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "batch_no" TEXT NOT NULL,
    "received_on" TIMESTAMPTZ(6) NOT NULL,
    "expiry_date" TIMESTAMPTZ(6),
    "qty_remaining" DECIMAL(18,3) NOT NULL,
    CONSTRAINT "stock_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory"."stock_movements" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "batch_id" TEXT,
    "movement_type" "inventory"."MovementType" NOT NULL,
    "qty" DECIMAL(18,3) NOT NULL,
    "unit_cost" DECIMAL(18,2) NOT NULL,
    "reference_type" TEXT NOT NULL,
    "reference_id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory"."stock_balances" (
    "item_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "qty_on_hand" DECIMAL(18,3) NOT NULL,
    "avg_cost" DECIMAL(18,2) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("item_id", "location_id")
);

CREATE TABLE "inventory"."outbox_events" (
    "id" UUID NOT NULL,
    "envelope" JSONB NOT NULL,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory"."audit_logs" (
    "id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "actor_id" UUID,
    "details" JSONB,
    "trace_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory"."processed_events" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "processed_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "units_code_key" ON "inventory"."units"("code");
CREATE UNIQUE INDEX "items_sku_key" ON "inventory"."items"("sku");
CREATE UNIQUE INDEX "warehouses_name_key" ON "inventory"."warehouses"("name");
CREATE UNIQUE INDEX "stock_locations_warehouse_id_code_key" ON "inventory"."stock_locations"("warehouse_id", "code");
CREATE UNIQUE INDEX "goods_receipts_idempotency_key_key" ON "inventory"."goods_receipts"("idempotency_key");
CREATE UNIQUE INDEX "goods_issues_idempotency_key_key" ON "inventory"."goods_issues"("idempotency_key");
CREATE UNIQUE INDEX "transfers_idempotency_key_key" ON "inventory"."transfers"("idempotency_key");
CREATE UNIQUE INDEX "adjustments_idempotency_key_key" ON "inventory"."adjustments"("idempotency_key");
CREATE UNIQUE INDEX "stock_takes_idempotency_key_key" ON "inventory"."stock_takes"("idempotency_key");
CREATE UNIQUE INDEX "stock_take_lines_take_id_item_id_key" ON "inventory"."stock_take_lines"("take_id", "item_id");
CREATE UNIQUE INDEX "stock_batches_item_id_batch_no_key" ON "inventory"."stock_batches"("item_id", "batch_no");

CREATE INDEX "item_categories_parent_id_idx" ON "inventory"."item_categories"("parent_id");
CREATE INDEX "items_category_id_idx" ON "inventory"."items"("category_id");
CREATE INDEX "items_unit_id_idx" ON "inventory"."items"("unit_id");
CREATE INDEX "stock_locations_warehouse_id_idx" ON "inventory"."stock_locations"("warehouse_id");
CREATE INDEX "goods_receipts_vendor_id_receipt_date_idx" ON "inventory"."goods_receipts"("vendor_id", "receipt_date");
CREATE INDEX "goods_receipts_status_idx" ON "inventory"."goods_receipts"("status");
CREATE INDEX "goods_receipt_lines_receipt_id_idx" ON "inventory"."goods_receipt_lines"("receipt_id");
CREATE INDEX "goods_issues_issue_date_idx" ON "inventory"."goods_issues"("issue_date");
CREATE INDEX "goods_issues_status_idx" ON "inventory"."goods_issues"("status");
CREATE INDEX "goods_issue_lines_issue_id_idx" ON "inventory"."goods_issue_lines"("issue_id");
CREATE INDEX "transfers_from_location_id_to_location_id_idx" ON "inventory"."transfers"("from_location_id", "to_location_id");
CREATE INDEX "transfers_status_idx" ON "inventory"."transfers"("status");
CREATE INDEX "transfer_lines_transfer_id_idx" ON "inventory"."transfer_lines"("transfer_id");
CREATE INDEX "adjustments_location_id_item_id_idx" ON "inventory"."adjustments"("location_id", "item_id");
CREATE INDEX "adjustments_status_idx" ON "inventory"."adjustments"("status");
CREATE INDEX "stock_takes_location_id_status_idx" ON "inventory"."stock_takes"("location_id", "status");
CREATE INDEX "stock_movements_item_id_location_id_idx" ON "inventory"."stock_movements"("item_id", "location_id");
CREATE INDEX "stock_movements_occurred_at_idx" ON "inventory"."stock_movements"("occurred_at");
CREATE INDEX "stock_movements_reference_type_reference_id_idx" ON "inventory"."stock_movements"("reference_type", "reference_id");
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "inventory"."audit_logs"("entity_type", "entity_id");

ALTER TABLE "inventory"."item_categories" ADD CONSTRAINT "item_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "inventory"."item_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory"."items" ADD CONSTRAINT "items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "inventory"."item_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory"."items" ADD CONSTRAINT "items_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "inventory"."units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory"."stock_locations" ADD CONSTRAINT "stock_locations_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "inventory"."warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory"."goods_receipts" ADD CONSTRAINT "goods_receipts_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "inventory"."vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory"."goods_receipts" ADD CONSTRAINT "goods_receipts_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "inventory"."stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory"."goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "inventory"."goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory"."goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory"."items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory"."goods_issue_lines" ADD CONSTRAINT "goods_issue_lines_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "inventory"."goods_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory"."goods_issue_lines" ADD CONSTRAINT "goods_issue_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory"."items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory"."transfers" ADD CONSTRAINT "transfers_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "inventory"."stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory"."transfers" ADD CONSTRAINT "transfers_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "inventory"."stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory"."transfer_lines" ADD CONSTRAINT "transfer_lines_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "inventory"."transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory"."transfer_lines" ADD CONSTRAINT "transfer_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory"."items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory"."adjustments" ADD CONSTRAINT "adjustments_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "inventory"."stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory"."adjustments" ADD CONSTRAINT "adjustments_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory"."items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory"."stock_takes" ADD CONSTRAINT "stock_takes_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "inventory"."stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory"."stock_take_lines" ADD CONSTRAINT "stock_take_lines_take_id_fkey" FOREIGN KEY ("take_id") REFERENCES "inventory"."stock_takes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory"."stock_take_lines" ADD CONSTRAINT "stock_take_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory"."items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory"."stock_batches" ADD CONSTRAINT "stock_batches_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory"."items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory"."stock_movements" ADD CONSTRAINT "stock_movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory"."items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory"."stock_movements" ADD CONSTRAINT "stock_movements_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "inventory"."stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory"."stock_balances" ADD CONSTRAINT "stock_balances_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory"."items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory"."stock_balances" ADD CONSTRAINT "stock_balances_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "inventory"."stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "inventory"."units" ("id", "code", "name") VALUES
    ('00000000-0000-4000-8000-000000000001', 'kg', 'Kilogram'),
    ('00000000-0000-4000-8000-000000000002', 'litre', 'Litre'),
    ('00000000-0000-4000-8000-000000000003', 'pcs', 'Pieces'),
    ('00000000-0000-4000-8000-000000000004', 'bag', 'Bag')
ON CONFLICT ("code") DO NOTHING;

CREATE FUNCTION "inventory"."reject_stock_movement_mutation"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'stock_movements are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "stock_movements_no_update"
BEFORE UPDATE ON "inventory"."stock_movements"
FOR EACH ROW EXECUTE FUNCTION "inventory"."reject_stock_movement_mutation"();

CREATE TRIGGER "stock_movements_no_delete"
BEFORE DELETE ON "inventory"."stock_movements"
FOR EACH ROW EXECUTE FUNCTION "inventory"."reject_stock_movement_mutation"();
