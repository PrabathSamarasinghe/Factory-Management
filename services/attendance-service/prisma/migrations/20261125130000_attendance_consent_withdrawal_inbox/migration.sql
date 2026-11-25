CREATE SCHEMA IF NOT EXISTS "attendance";
SET search_path TO "attendance", public;

CREATE TABLE "consent_withdrawal_inbox" (
    "id" TEXT NOT NULL,
    "person_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_withdrawal_inbox_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "consent_withdrawal_inbox_person_id_processed_at_idx" ON "consent_withdrawal_inbox"("person_id", "processed_at");

RESET search_path;
