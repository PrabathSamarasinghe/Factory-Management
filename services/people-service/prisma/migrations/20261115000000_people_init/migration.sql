-- Initial People Service Migration
CREATE SCHEMA IF NOT EXISTS "people";

-- Enums
CREATE TYPE "people"."PersonType" AS ENUM ('EMPLOYEE', 'STAFF', 'SUPPLIER', 'ADMIN');
CREATE TYPE "people"."PersonStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'TERMINATED');
CREATE TYPE "people"."WageType" AS ENUM ('DAILY', 'MONTHLY', 'PER_KG', 'PIECE');
CREATE TYPE "people"."StaffRole" AS ENUM ('DRIVER', 'HELPER', 'TRIP_SUPERVISOR', 'CLERK');
CREATE TYPE "people"."PaymentMethod" AS ENUM ('BANK', 'CASH', 'CHEQUE');
CREATE TYPE "people"."BankAccountStatus" AS ENUM ('PENDING_VERIFY', 'VERIFIED', 'INACTIVE');
CREATE TYPE "people"."DocumentType" AS ENUM ('NIC_FRONT', 'NIC_BACK', 'LICENCE', 'CONTRACT', 'PHOTO');
CREATE TYPE "people"."ConsentType" AS ENUM ('BIOMETRIC', 'SMS', 'DATA_PROCESSING');

-- Persons Table
CREATE TABLE "people"."persons" (
    "id" UUID NOT NULL,
    "person_type" "people"."PersonType" NOT NULL,
    "code" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "preferred_name" TEXT,
    "gender" TEXT,
    "date_of_birth" DATE,
    "national_id_enc" TEXT,
    "national_id_hash" TEXT,
    "phone_primary" TEXT,
    "phone_secondary" TEXT,
    "email" TEXT,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "district" TEXT,
    "postal_code" TEXT,
    "photo_object_key" TEXT,
    "status" "people"."PersonStatus" NOT NULL DEFAULT 'ACTIVE',
    "user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

-- Employee Details
CREATE TABLE "people"."employee_details" (
    "person_id" UUID NOT NULL,
    "department" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "employment_type" TEXT NOT NULL,
    "join_date" DATE NOT NULL,
    "end_date" DATE,
    "epf_no" TEXT,
    "etf_no" TEXT,
    "wage_type" "people"."WageType" NOT NULL,
    "base_rate" DECIMAL(12,2) NOT NULL,
    "shift_id" UUID,
    "supervisor_person_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_details_pkey" PRIMARY KEY ("person_id"),
    CONSTRAINT "employee_details_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"."persons"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Staff Details
CREATE TABLE "people"."staff_details" (
    "person_id" UUID NOT NULL,
    "staff_role" "people"."StaffRole" NOT NULL,
    "designation" TEXT NOT NULL,
    "join_date" DATE NOT NULL,
    "end_date" DATE,
    "epf_no" TEXT,
    "etf_no" TEXT,
    "monthly_salary" DECIMAL(12,2) NOT NULL,
    "driving_licence_no_enc" TEXT,
    "licence_expiry" DATE,
    "licence_classes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_details_pkey" PRIMARY KEY ("person_id"),
    CONSTRAINT "staff_details_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"."persons"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Supplier Details
CREATE TABLE "people"."supplier_details" (
    "person_id" UUID NOT NULL,
    "supplier_reg_no" TEXT NOT NULL,
    "supplier_reg_no_normalized" TEXT NOT NULL,
    "reg_year" SMALLINT NOT NULL,
    "reg_seq" INTEGER NOT NULL,
    "supplier_code" TEXT NOT NULL,
    "barcode_value" TEXT NOT NULL,
    "business_name" TEXT,
    "business_reg_no" TEXT,
    "land_area_acres" DECIMAL(8,2),
    "estate_name" TEXT,
    "collection_point" TEXT,
    "route_id" UUID,
    "gps_lat" DECIMAL(9,6),
    "gps_lng" DECIMAL(9,6),
    "tea_variety" TEXT,
    "payment_method" "people"."PaymentMethod" NOT NULL DEFAULT 'BANK',
    "sms_opt_in" BOOLEAN NOT NULL DEFAULT true,
    "sms_phone" TEXT,
    "joined_on" DATE NOT NULL DEFAULT CURRENT_DATE,
    "contract_ref" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_details_pkey" PRIMARY KEY ("person_id"),
    CONSTRAINT "supplier_details_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"."persons"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Admin Details
CREATE TABLE "people"."admin_details" (
    "person_id" UUID NOT NULL,
    "admin_level" TEXT NOT NULL,
    "department" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_details_pkey" PRIMARY KEY ("person_id"),
    CONSTRAINT "admin_details_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"."persons"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Supplier Registration Sequence
CREATE TABLE "people"."supplier_reg_sequences" (
    "year" SMALLINT NOT NULL,
    "last_seq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "supplier_reg_sequences_pkey" PRIMARY KEY ("year")
);

-- Bank Accounts
CREATE TABLE "people"."bank_accounts" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "bank_name" TEXT NOT NULL,
    "bank_code" TEXT,
    "branch_name" TEXT,
    "branch_code" TEXT,
    "account_holder_name" TEXT NOT NULL,
    "account_number_enc" TEXT NOT NULL,
    "account_number_hash" TEXT NOT NULL,
    "account_last4" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT true,
    "status" "people"."BankAccountStatus" NOT NULL DEFAULT 'PENDING_VERIFY',
    "verified_by" UUID,
    "verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bank_accounts_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"."persons"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Emergency Contacts
CREATE TABLE "people"."emergency_contacts" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emergency_contacts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "emergency_contacts_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"."persons"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Person Documents
CREATE TABLE "people"."person_documents" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "doc_type" "people"."DocumentType" NOT NULL,
    "object_key" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "expires_on" DATE,
    "uploaded_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "person_documents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "person_documents_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"."persons"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Consents
CREATE TABLE "people"."consents" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "consent_type" "people"."ConsentType" NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT true,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "evidence_object_key" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "consents_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"."persons"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Person Change Log
CREATE TABLE "people"."person_change_log" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "field" TEXT NOT NULL,
    "old_value_masked" TEXT,
    "new_value_masked" TEXT,
    "changed_by" UUID,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "person_change_log_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "person_change_log_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"."persons"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Indexes
CREATE UNIQUE INDEX "persons_code_key" ON "people"."persons"("code");
CREATE INDEX "persons_person_type_idx" ON "people"."persons"("person_type");
CREATE INDEX "persons_status_idx" ON "people"."persons"("status");
CREATE INDEX "persons_national_id_hash_idx" ON "people"."persons"("national_id_hash");
CREATE INDEX "persons_phone_primary_idx" ON "people"."persons"("phone_primary");
CREATE INDEX "persons_user_id_idx" ON "people"."persons"("user_id");

CREATE UNIQUE INDEX "supplier_details_supplier_reg_no_key" ON "people"."supplier_details"("supplier_reg_no");
CREATE UNIQUE INDEX "supplier_details_supplier_reg_no_normalized_key" ON "people"."supplier_details"("supplier_reg_no_normalized");
CREATE UNIQUE INDEX "supplier_details_supplier_code_key" ON "people"."supplier_details"("supplier_code");
CREATE UNIQUE INDEX "supplier_details_barcode_value_key" ON "people"."supplier_details"("barcode_value");
CREATE UNIQUE INDEX "supplier_details_reg_year_reg_seq_key" ON "people"."supplier_details"("reg_year", "reg_seq");
CREATE INDEX "supplier_details_route_id_idx" ON "people"."supplier_details"("route_id");
CREATE INDEX "supplier_details_collection_point_idx" ON "people"."supplier_details"("collection_point");

CREATE INDEX "bank_accounts_person_id_idx" ON "people"."bank_accounts"("person_id");
CREATE INDEX "bank_accounts_account_number_hash_idx" ON "people"."bank_accounts"("account_number_hash");

CREATE INDEX "emergency_contacts_person_id_idx" ON "people"."emergency_contacts"("person_id");
CREATE INDEX "person_documents_person_id_idx" ON "people"."person_documents"("person_id");
CREATE UNIQUE INDEX "consents_person_id_consent_type_key" ON "people"."consents"("person_id", "consent_type");
CREATE INDEX "person_change_log_person_id_changed_at_idx" ON "people"."person_change_log"("person_id", "changed_at");
