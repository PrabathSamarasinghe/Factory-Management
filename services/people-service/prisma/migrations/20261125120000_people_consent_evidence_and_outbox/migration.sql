CREATE TABLE "people"."consent_evidence" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "consent_type" "people"."ConsentType" NOT NULL,
    "object_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_evidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "people"."outbox_events" (
    "id" UUID NOT NULL,
    "envelope" JSONB NOT NULL,
    "published_at" TIMESTAMPTZ(6),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "consent_evidence_person_id_consent_type_created_at_idx" ON "people"."consent_evidence"("person_id", "consent_type", "created_at");
CREATE INDEX "outbox_events_published_at_created_at_idx" ON "people"."outbox_events"("published_at", "created_at");

ALTER TABLE "people"."consent_evidence" ADD CONSTRAINT "consent_evidence_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"."persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
