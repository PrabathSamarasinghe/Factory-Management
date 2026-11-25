SET search_path TO "fleet", public;

ALTER TABLE "trips"
    ADD COLUMN "override_kind" TEXT,
    ADD COLUMN "override_reason" TEXT,
    ADD COLUMN "override_by" UUID,
    ADD COLUMN "override_at" TIMESTAMPTZ(6);

ALTER TABLE "trips" ADD CONSTRAINT "trips_override_fields_check" CHECK (
    (
        "override_kind" IS NULL
        AND "override_reason" IS NULL
        AND "override_by" IS NULL
        AND "override_at" IS NULL
    )
    OR (
        "override_kind" = 'END_AFTER_TOTALS'
        AND length(btrim("override_reason")) > 0
        AND "override_by" IS NOT NULL
        AND "override_at" IS NOT NULL
    )
);

CREATE INDEX "trips_override_at_idx" ON "trips"("override_at");

RESET search_path;
