CREATE SCHEMA IF NOT EXISTS "accounts";

SET LOCAL search_path TO "accounts";

CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');
CREATE TYPE "NormalBalance" AS ENUM ('DEBIT', 'CREDIT');
CREATE TYPE "FiscalYearStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "FiscalPeriodStatus" AS ENUM ('OPEN', 'SOFT_LOCK', 'LOCKED');
CREATE TYPE "JournalEntryStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');
CREATE TYPE "SupplierBillStatus" AS ENUM ('DRAFT', 'APPROVED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');
CREATE TYPE "AdjustmentType" AS ENUM ('ADVANCE', 'FERTILIZER_LOAN', 'DEDUCTION', 'BONUS');
CREATE TYPE "AdjustmentStatus" AS ENUM ('OPEN', 'RECOVERED', 'CANCELLED');
CREATE TYPE "WageComponentType" AS ENUM ('EARNING', 'DEDUCTION');
CREATE TYPE "PayrollRunType" AS ENUM ('MONTHLY', 'WEEKLY', 'DAILY');
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'CALCULATED', 'APPROVED', 'PAID', 'CANCELLED');
CREATE TYPE "PaymentBatchType" AS ENUM ('SUPPLIER', 'WAGES', 'OTHER');
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_FILE', 'BANK_TRANSFER', 'CASH', 'CHEQUE');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'FAILED', 'CANCELLED');
CREATE TYPE "ReconciliationStatus" AS ENUM ('OPEN', 'MATCHED', 'COMPLETE');

CREATE TABLE "fiscal_years" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "FiscalYearStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fiscal_years_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fiscal_periods" (
    "id" UUID NOT NULL,
    "fiscal_year_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "FiscalPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closed_at" TIMESTAMPTZ(6),
    "closed_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "fiscal_periods_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "account_type" "AccountType" NOT NULL,
    "normal_balance" "NormalBalance" NOT NULL,
    "parent_id" UUID,
    "is_postable" BOOLEAN NOT NULL DEFAULT true,
    "is_control" BOOLEAN NOT NULL DEFAULT false,
    "party_type" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "statement" TEXT,
    "section_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "cash_flow_category" TEXT,
    "is_cash_account" BOOLEAN NOT NULL DEFAULT false,
    "allow_manual_posting" BOOLEAN NOT NULL DEFAULT true,
    "deactivated_at" TIMESTAMPTZ(6),
    "opening_balance_entry_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "journal_entries" (
    "id" UUID NOT NULL,
    "entry_no" TEXT NOT NULL,
    "entry_date" DATE NOT NULL,
    "period_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "source_type" TEXT NOT NULL DEFAULT 'MANUAL',
    "source_id" UUID,
    "status" "JournalEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "reversal_of_id" UUID,
    "reversal_reason" TEXT,
    "posted_by" UUID,
    "posted_at" TIMESTAMPTZ(6),
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "idempotency_key" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "journal_lines" (
    "id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "debit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "party_type" TEXT,
    "party_id" UUID,
    "cost_centre_id" UUID,
    "memo" TEXT,
    "line_no" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "account_period_balances" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "party_id" UUID,
    "opening_balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "period_debit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "period_credit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "closing_balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "account_period_balances_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tea_rates" (
    "id" UUID NOT NULL,
    "grade" TEXT NOT NULL,
    "rate_per_kg" DECIMAL(12,2) NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "approver" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tea_rates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplier_adjustments" (
    "id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "adjustment_type" "AdjustmentType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "adjustment_date" DATE NOT NULL,
    "description" TEXT,
    "recovered_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "AdjustmentStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "supplier_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplier_bills" (
    "id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "period_from" DATE NOT NULL,
    "period_to" DATE NOT NULL,
    "total_kg" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "gross_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "deductions_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "net_payable" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "SupplierBillStatus" NOT NULL DEFAULT 'DRAFT',
    "journal_entry_id" UUID,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "supplier_bills_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplier_bill_lines" (
    "id" UUID NOT NULL,
    "bill_id" UUID NOT NULL,
    "collection_date" DATE NOT NULL,
    "total_net_kg" DECIMAL(12,3) NOT NULL,
    "rate_per_kg" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "daily_total_id" UUID NOT NULL,
    CONSTRAINT "supplier_bill_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "wage_components" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "component_type" "WageComponentType" NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT false,
    "formula" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wage_components_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payroll_runs" (
    "id" UUID NOT NULL,
    "period_from" DATE NOT NULL,
    "period_to" DATE NOT NULL,
    "run_type" "PayrollRunType" NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "gross_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "deduction_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "net_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "employer_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "journal_entry_id" UUID,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payroll_items" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "days_worked" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "overtime_hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "gross_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "epf_employee" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "epf_employer" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "etf" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "other_deductions" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "net_pay" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "payment_status" TEXT NOT NULL DEFAULT 'PENDING',
    "bank_snapshot_masked" TEXT,
    CONSTRAINT "payroll_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payroll_item_lines" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "component_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    CONSTRAINT "payroll_item_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_batches" (
    "id" UUID NOT NULL,
    "batch_type" "PaymentBatchType" NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "total_amount" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "reference" TEXT,
    "created_by" UUID,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "file_object_key" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "payment_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "batch_id" UUID,
    "payee_type" TEXT NOT NULL,
    "payee_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
    "reference" TEXT,
    "bill_id" UUID,
    "payroll_item_id" UUID,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paid_date" DATE,
    "paid_by" UUID,
    "journal_entry_id" UUID,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "company_bank_accounts" (
    "id" UUID NOT NULL,
    "bank_name" TEXT NOT NULL,
    "branch" TEXT,
    "account_number_enc" TEXT NOT NULL,
    "account_number_masked" TEXT NOT NULL,
    "ledger_account_id" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "company_bank_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bank_reconciliations" (
    "id" UUID NOT NULL,
    "bank_account_id" UUID NOT NULL,
    "statement_date" DATE NOT NULL,
    "statement_balance" DECIMAL(18,2) NOT NULL,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "bank_reconciliations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bank_statement_lines" (
    "id" UUID NOT NULL,
    "reconciliation_id" UUID NOT NULL,
    "statement_line_date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "direction" TEXT NOT NULL,
    "matched_journal_line_id" UUID,
    CONSTRAINT "bank_statement_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "posting_rules" (
    "id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "effective_from" DATE NOT NULL,
    "debit_account_id" UUID NOT NULL,
    "credit_account_id" UUID NOT NULL,
    "condition_json" JSONB,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "approver" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "posting_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "report_sections" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent_code" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "sign" INTEGER NOT NULL DEFAULT 1,
    "is_subtotal" BOOLEAN NOT NULL DEFAULT false,
    "formula" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "report_sections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "parties" (
    "id" UUID NOT NULL,
    "party_type" TEXT NOT NULL,
    "external_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "code" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "parties_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "budgets" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "fiscal_period_id" UUID NOT NULL,
    "total_amount" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "year_end_closings" (
    "id" UUID NOT NULL,
    "fiscal_year_id" UUID NOT NULL,
    "journal_entry_id" UUID NOT NULL,
    "profit_for_year" DECIMAL(18,2) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "year_end_closings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "accounts_audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "accounts_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "envelope" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "processed_events" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fiscal_years_name_key" ON "fiscal_years"("name");
CREATE INDEX "fiscal_periods_start_date_end_date_idx" ON "fiscal_periods"("start_date", "end_date");
CREATE UNIQUE INDEX "fiscal_periods_fiscal_year_id_name_key" ON "fiscal_periods"("fiscal_year_id", "name");
CREATE UNIQUE INDEX "accounts_code_key" ON "accounts"("code");
CREATE INDEX "accounts_parent_id_idx" ON "accounts"("parent_id");
CREATE INDEX "accounts_statement_section_id_idx" ON "accounts"("statement", "section_id");
CREATE UNIQUE INDEX "journal_entries_entry_no_key" ON "journal_entries"("entry_no");
CREATE UNIQUE INDEX "journal_entries_idempotency_key_key" ON "journal_entries"("idempotency_key");
CREATE INDEX "journal_entries_entry_date_idx" ON "journal_entries"("entry_date");
CREATE INDEX "journal_entries_period_id_status_idx" ON "journal_entries"("period_id", "status");
CREATE INDEX "journal_entries_source_type_source_id_idx" ON "journal_entries"("source_type", "source_id");
CREATE INDEX "journal_lines_entry_id_idx" ON "journal_lines"("entry_id");
CREATE INDEX "journal_lines_account_id_party_id_idx" ON "journal_lines"("account_id", "party_id");
CREATE UNIQUE INDEX "account_period_balances_account_id_period_id_party_id_key" ON "account_period_balances"("account_id", "period_id", "party_id");
CREATE INDEX "tea_rates_grade_effective_from_effective_to_idx" ON "tea_rates"("grade", "effective_from", "effective_to");
CREATE UNIQUE INDEX "tea_rates_grade_effective_from_key" ON "tea_rates"("grade", "effective_from");

CREATE TABLE "collected_totals" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "collection_date" DATE NOT NULL,
    "total_net_kg" DECIMAL(12,3) NOT NULL,
    "grade" TEXT,
    "daily_total_id" UUID,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "collected_totals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "attendance_days" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "worked_minutes" INTEGER NOT NULL DEFAULT 0,
    "overtime_minutes" INTEGER NOT NULL DEFAULT 0,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attendance_days_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "collected_totals_event_id_key" ON "collected_totals"("event_id");
CREATE INDEX "collected_totals_supplier_id_collection_date_idx" ON "collected_totals"("supplier_id", "collection_date");
CREATE INDEX "collected_totals_processed_idx" ON "collected_totals"("processed");
CREATE UNIQUE INDEX "attendance_days_event_id_key" ON "attendance_days"("event_id");
CREATE INDEX "attendance_days_person_id_work_date_idx" ON "attendance_days"("person_id", "work_date");
CREATE INDEX "attendance_days_work_date_approved_idx" ON "attendance_days"("work_date", "approved");
CREATE INDEX "supplier_adjustments_supplier_id_status_idx" ON "supplier_adjustments"("supplier_id", "status");
CREATE UNIQUE INDEX "supplier_bills_idempotency_key_key" ON "supplier_bills"("idempotency_key");
CREATE INDEX "supplier_bills_supplier_id_period_to_idx" ON "supplier_bills"("supplier_id", "period_to");
CREATE UNIQUE INDEX "supplier_bill_lines_bill_id_daily_total_id_key" ON "supplier_bill_lines"("bill_id", "daily_total_id");
CREATE UNIQUE INDEX "wage_components_code_key" ON "wage_components"("code");
CREATE UNIQUE INDEX "payroll_runs_idempotency_key_key" ON "payroll_runs"("idempotency_key");
CREATE INDEX "payroll_runs_period_from_period_to_idx" ON "payroll_runs"("period_from", "period_to");
CREATE INDEX "payroll_items_run_id_idx" ON "payroll_items"("run_id");
CREATE UNIQUE INDEX "payroll_items_run_id_person_id_key" ON "payroll_items"("run_id", "person_id");
CREATE INDEX "payroll_item_lines_item_id_idx" ON "payroll_item_lines"("item_id");
CREATE INDEX "payment_batches_status_idx" ON "payment_batches"("status");
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");
CREATE INDEX "payments_batch_id_idx" ON "payments"("batch_id");
CREATE INDEX "payments_payee_type_payee_id_idx" ON "payments"("payee_type", "payee_id");
CREATE INDEX "bank_reconciliations_bank_account_id_statement_date_idx" ON "bank_reconciliations"("bank_account_id", "statement_date");
CREATE INDEX "bank_statement_lines_reconciliation_id_idx" ON "bank_statement_lines"("reconciliation_id");
CREATE UNIQUE INDEX "posting_rules_event_type_version_effective_from_key" ON "posting_rules"("event_type", "version", "effective_from");
CREATE UNIQUE INDEX "report_sections_code_key" ON "report_sections"("code");
CREATE INDEX "report_sections_statement_parent_code_idx" ON "report_sections"("statement", "parent_code");
CREATE UNIQUE INDEX "parties_party_type_external_id_key" ON "parties"("party_type", "external_id");
CREATE UNIQUE INDEX "year_end_closings_fiscal_year_id_key" ON "year_end_closings"("fiscal_year_id");
CREATE INDEX "accounts_audit_logs_entity_type_entity_id_idx" ON "accounts_audit_logs"("entity_type", "entity_id");

ALTER TABLE "journal_lines"
    ADD CONSTRAINT "journal_lines_debit_xor_credit_check"
    CHECK (("debit" > 0 AND "credit" = 0) OR ("credit" > 0 AND "debit" = 0));

CREATE OR REPLACE FUNCTION "check_journal_balance"() RETURNS TRIGGER AS $$
DECLARE
    difference NUMERIC;
BEGIN
    SELECT COALESCE(SUM("debit" - "credit"), 0)
    INTO difference
    FROM "journal_lines"
    WHERE "entry_id" = COALESCE(NEW."entry_id", OLD."entry_id");

    IF difference <> 0 THEN
        RAISE EXCEPTION 'Journal entry is unbalanced';
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "journal_lines_balanced"
AFTER INSERT OR UPDATE OR DELETE ON "journal_lines"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "check_journal_balance"();

CREATE OR REPLACE FUNCTION "prevent_posted_journal_mutation"() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD."status" = 'POSTED' THEN
            RAISE EXCEPTION 'Posted journal entries are immutable';
        END IF;
        RETURN OLD;
    END IF;

    IF OLD."status" = 'POSTED' AND NEW."status" <> 'REVERSED' THEN
        RAISE EXCEPTION 'Posted journal entries are immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "journal_entries_immutable"
BEFORE UPDATE OR DELETE ON "journal_entries"
FOR EACH ROW EXECUTE FUNCTION "prevent_posted_journal_mutation"();

CREATE OR REPLACE FUNCTION "prevent_posted_line_mutation"() RETURNS TRIGGER AS $$
DECLARE
    entry_status "JournalEntryStatus";
BEGIN
    SELECT "status" INTO entry_status
    FROM "journal_entries"
    WHERE "id" = COALESCE(NEW."entry_id", OLD."entry_id");

    IF entry_status = 'POSTED' THEN
        RAISE EXCEPTION 'Lines of posted journal entries are immutable';
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "journal_lines_immutable"
BEFORE UPDATE OR DELETE ON "journal_lines"
FOR EACH ROW EXECUTE FUNCTION "prevent_posted_line_mutation"();

CREATE MATERIALIZED VIEW "account_balances_mv" AS
SELECT
    "account_id",
    SUM("debit") AS "total_debit",
    SUM("credit") AS "total_credit",
    SUM("debit" - "credit") AS "balance"
FROM "journal_lines"
GROUP BY "account_id";

CREATE UNIQUE INDEX "account_balances_mv_account_id_key" ON "account_balances_mv"("account_id");

CREATE MATERIALIZED VIEW "party_balances_mv" AS
SELECT
    "party_type",
    "party_id",
    SUM("debit" - "credit") AS "balance"
FROM "journal_lines"
WHERE "party_id" IS NOT NULL
GROUP BY "party_type", "party_id";

CREATE UNIQUE INDEX "party_balances_mv_party_key" ON "party_balances_mv"("party_type", "party_id");

INSERT INTO "accounts" (
    "id", "code", "name", "account_type", "normal_balance", "statement", "section_id",
    "sort_order", "cash_flow_category", "is_cash_account", "updated_at"
) VALUES
    (gen_random_uuid(), '1000', 'Cash', 'ASSET', 'DEBIT', 'BALANCE_SHEET', 'CURRENT_ASSETS', 100, 'OPERATING', true, CURRENT_TIMESTAMP),
    (gen_random_uuid(), '1010', 'Bank', 'ASSET', 'DEBIT', 'BALANCE_SHEET', 'CURRENT_ASSETS', 110, 'OPERATING', true, CURRENT_TIMESTAMP),
    (gen_random_uuid(), '1100', 'Supplier advances', 'ASSET', 'DEBIT', 'BALANCE_SHEET', 'CURRENT_ASSETS', 120, 'OPERATING', false, CURRENT_TIMESTAMP),
    (gen_random_uuid(), '1110', 'Employee advances', 'ASSET', 'DEBIT', 'BALANCE_SHEET', 'CURRENT_ASSETS', 130, 'OPERATING', false, CURRENT_TIMESTAMP),
    (gen_random_uuid(), '1200', 'Made tea inventory', 'ASSET', 'DEBIT', 'BALANCE_SHEET', 'INVENTORY', 200, 'OPERATING', false, CURRENT_TIMESTAMP),
    (gen_random_uuid(), '1210', 'Stores and packing inventory', 'ASSET', 'DEBIT', 'BALANCE_SHEET', 'INVENTORY', 210, 'OPERATING', false, CURRENT_TIMESTAMP),
    (gen_random_uuid(), '1300', 'Trade receivables', 'ASSET', 'DEBIT', 'BALANCE_SHEET', 'CURRENT_ASSETS', 300, 'OPERATING', false, CURRENT_TIMESTAMP),
    (gen_random_uuid(), '1400', 'Vehicles', 'ASSET', 'DEBIT', 'BALANCE_SHEET', 'FIXED_ASSETS', 400, 'INVESTING', false, CURRENT_TIMESTAMP),
    (gen_random_uuid(), '1410', 'Plant and machinery', 'ASSET', 'DEBIT', 'BALANCE_SHEET', 'FIXED_ASSETS', 410, 'INVESTING', false, CURRENT_TIMESTAMP),
    (gen_random_uuid(), '1420', 'Accumulated depreciation', 'ASSET', 'CREDIT', 'BALANCE_SHEET', 'FIXED_ASSETS', 420, NULL, false, CURRENT_TIMESTAMP),
    (gen_random_uuid(), '2000', 'Supplier payable', 'LIABILITY', 'CREDIT', 'BALANCE_SHEET', 'CURRENT_LIABILITIES', 500, 'OPERATING', false, CURRENT_TIMESTAMP),
    (gen_random_uuid(), '2010', 'Wages payable', 'LIABILITY', 'CREDIT', 'BALANCE_SHEET', 'CURRENT_LIABILITIES', 510, 'OPERATING', false, CURRENT_TIMESTAMP),
    (gen_random_uuid(), '2020', 'EPF payable', 'LIABILITY', 'CREDIT', 'BALANCE_SHEET', 'CURRENT_LIABILITIES', 520, 'OPERATING', false, CURRENT_TIMESTAMP),
    (gen_random_uuid(), '2030', 'ETF payable', 'LIABILITY', 'CREDIT', 'BALANCE_SHEET', 'CURRENT_LIABILITIES', 530, 'OPERATING', false, CURRENT_TIMESTAMP),
    (gen_random_uuid(), '2040', 'PAYE payable', 'LIABILITY', 'CREDIT', 'BALANCE_SHEET', 'CURRENT_LIABILITIES', 540, 'OPERATING', false, CURRENT_TIMESTAMP),
    (gen_random_uuid(), '2050', 'Trade payables', 'LIABILITY', 'CREDIT', 'BALANCE_SHEET', 'CURRENT_LIABILITIES', 550, 'OPERATING', false, CURRENT_TIMESTAMP),
    (gen_random_uuid(), '2100', 'Loans', 'LIABILITY', 'CREDIT', 'BALANCE_SHEET', 'LONG_TERM_LIABILITIES', 600, 'FINANCING', false, CURRENT_TIMESTAMP),
    (gen_random_uuid(), '3000', 'Capital', 'EQUITY', 'CREDIT', 'BALANCE_SHEET', 'EQUITY', 700, 'FINANCING', false, CURRENT_TIMESTAMP),
    (gen_random_uuid(), '3010', 'Retained earnings', 'EQUITY', 'CREDIT', 'BALANCE_SHEET', 'EQUITY', 710, 'FINANCING', false, CURRENT_TIMESTAMP),
    (gen_random_uuid(), '3020', 'Opening balance equity', 'EQUITY', 'CREDIT', 'BALANCE_SHEET', 'EQUITY', 720, NULL, false, CURRENT_TIMESTAMP),
    (gen_random_uuid(), '4000', 'Made tea sales', 'INCOME', 'CREDIT', 'PROFIT_LOSS', 'INCOME', 800, 'OPERATING', false, CURRENT_TIMESTAMP),
    (gen_random_uuid(), '4010', 'Other income', 'INCOME', 'CREDIT', 'PROFIT_LOSS', 'INCOME', 810, 'OPERATING', false, CURRENT_TIMESTAMP),
    (gen_random_uuid(), '5000', 'Green leaf purchases', 'EXPENSE', 'DEBIT', 'PROFIT_LOSS', 'DIRECT_COSTS', 900, 'OPERATING', false, CURRENT_TIMESTAMP),
    (gen_random_uuid(), '5010', 'Direct factory labour', 'EXPENSE', 'DEBIT', 'PROFIT_LOSS', 'DIRECT_COSTS', 910, 'OPERATING', false, CURRENT_TIMESTAMP),
    (gen_random_uuid(), '5020', 'Factory fuel and power', 'EXPENSE', 'DEBIT', 'PROFIT_LOSS', 'DIRECT_COSTS', 920, 'OPERATING', false, CURRENT_TIMESTAMP),
    (gen_random_uuid(), '5030', 'Factory consumables', 'EXPENSE', 'DEBIT', 'PROFIT_LOSS', 'DIRECT_COSTS', 930, 'OPERATING', false, CURRENT_TIMESTAMP),
    (gen_random_uuid(), '5040', 'Transport', 'EXPENSE', 'DEBIT', 'PROFIT_LOSS', 'DIRECT_COSTS', 940, 'OPERATING', false, CURRENT_TIMESTAMP),
    (gen_random_uuid(), '5100', 'Administrative salaries and wages', 'EXPENSE', 'DEBIT', 'PROFIT_LOSS', 'ADMIN', 950, 'OPERATING', false, CURRENT_TIMESTAMP),
    (gen_random_uuid(), '5110', 'Employer EPF expense', 'EXPENSE', 'DEBIT', 'PROFIT_LOSS', 'ADMIN', 960, 'OPERATING', false, CURRENT_TIMESTAMP),
    (gen_random_uuid(), '5120', 'Employer ETF expense', 'EXPENSE', 'DEBIT', 'PROFIT_LOSS', 'ADMIN', 970, 'OPERATING', false, CURRENT_TIMESTAMP),
    (gen_random_uuid(), '5130', 'Depreciation', 'EXPENSE', 'DEBIT', 'PROFIT_LOSS', 'ADMIN', 980, NULL, false, CURRENT_TIMESTAMP),
    (gen_random_uuid(), '5140', 'Bank charges and interest', 'EXPENSE', 'DEBIT', 'PROFIT_LOSS', 'ADMIN', 990, 'FINANCING', false, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

UPDATE "accounts"
SET "is_control" = true,
    "allow_manual_posting" = false,
    "party_type" = 'SUPPLIER'
WHERE "code" = '2000';

UPDATE "accounts"
SET "is_control" = true,
    "allow_manual_posting" = false,
    "party_type" = 'EMPLOYEE'
WHERE "code" = '2010';

INSERT INTO "wage_components" ("id", "code", "name", "component_type", "taxable", "formula")
VALUES
    (gen_random_uuid(), 'BASIC', 'Basic wages', 'EARNING', true, '{"basis":"DAILY"}'),
    (gen_random_uuid(), 'OVERTIME', 'Overtime', 'EARNING', true, '{"multiplier":1.5}'),
    (gen_random_uuid(), 'EPF_EMPLOYEE', 'Employee EPF', 'DEDUCTION', false, '{"rate":0.08}'),
    (gen_random_uuid(), 'ETF', 'ETF', 'DEDUCTION', false, '{"rate":0.03}')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "report_sections" ("id", "code", "statement", "name", "parent_code", "sort_order", "sign", "is_subtotal")
VALUES
    (gen_random_uuid(), 'CURRENT_ASSETS', 'BALANCE_SHEET', 'Current assets', NULL, 100, 1, true),
    (gen_random_uuid(), 'INVENTORY', 'BALANCE_SHEET', 'Inventory', NULL, 200, 1, true),
    (gen_random_uuid(), 'FIXED_ASSETS', 'BALANCE_SHEET', 'Fixed assets', NULL, 300, 1, true),
    (gen_random_uuid(), 'CURRENT_LIABILITIES', 'BALANCE_SHEET', 'Current liabilities', NULL, 400, -1, true),
    (gen_random_uuid(), 'LONG_TERM_LIABILITIES', 'BALANCE_SHEET', 'Long-term liabilities', NULL, 500, -1, true),
    (gen_random_uuid(), 'EQUITY', 'BALANCE_SHEET', 'Equity', NULL, 600, -1, true),
    (gen_random_uuid(), 'INCOME', 'PROFIT_LOSS', 'Income', NULL, 100, -1, true),
    (gen_random_uuid(), 'DIRECT_COSTS', 'PROFIT_LOSS', 'Direct costs', NULL, 200, 1, true),
    (gen_random_uuid(), 'ADMIN', 'PROFIT_LOSS', 'Administrative expenses', NULL, 300, 1, true)
ON CONFLICT ("code") DO NOTHING;
