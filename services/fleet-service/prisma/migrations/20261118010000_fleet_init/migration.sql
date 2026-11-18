-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "fleet";

SET search_path TO "fleet";

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateEnum
CREATE TYPE "LorryStatus" AS ENUM ('ACTIVE', 'MAINTENANCE', 'RETIRED');

-- CreateEnum
CREATE TYPE "RouteStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'AT_FACTORY', 'WEIGHING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TripEventType" AS ENUM ('STOP_ARRIVED', 'STOP_SKIPPED', 'BREAKDOWN', 'NOTE');

-- CreateTable
CREATE TABLE "lorries" (
    "id" UUID NOT NULL,
    "registration_no" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER,
    "chassis_no" TEXT,
    "engine_no" TEXT,
    "fuel_type" TEXT,
    "capacity_kg" DECIMAL(10,2),
    "tare_weight_kg" DECIMAL(10,2),
    "colour" TEXT,
    "photo_object_key" TEXT,
    "insurance_expiry" DATE,
    "revenue_licence_expiry" DATE,
    "emission_test_expiry" DATE,
    "current_odometer_km" DECIMAL(10,1) NOT NULL DEFAULT 0,
    "status" "LorryStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lorries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "lorries_odometer_check" CHECK ("current_odometer_km" >= 0)
);

-- CreateTable
CREATE TABLE "lorry_documents" (
    "id" UUID NOT NULL,
    "lorry_id" UUID NOT NULL,
    "doc_type" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "issued_on" DATE,
    "expires_on" DATE,
    "uploaded_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lorry_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lorry_maintenance" (
    "id" UUID NOT NULL,
    "lorry_id" UUID NOT NULL,
    "service_date" DATE NOT NULL,
    "odometer_km" DECIMAL(10,1) NOT NULL,
    "description" TEXT NOT NULL,
    "cost" DECIMAL(18,2),
    "vendor" TEXT,
    "next_due_km" DECIMAL(10,1),
    "next_due_date" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lorry_maintenance_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "lorry_maintenance_cost_check" CHECK ("cost" IS NULL OR "cost" >= 0),
    CONSTRAINT "lorry_maintenance_odometer_check" CHECK ("odometer_km" >= 0)
);

-- CreateTable
CREATE TABLE "routes" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "estimated_distance_km" DECIMAL(8,1),
    "status" "RouteStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "routes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "routes_distance_check" CHECK ("estimated_distance_km" IS NULL OR "estimated_distance_km" >= 0)
);

-- CreateTable
CREATE TABLE "route_stops" (
    "id" UUID NOT NULL,
    "route_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "expected_arrival" VARCHAR(8),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "route_stops_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "route_stops_sequence_check" CHECK ("sequence" > 0)
);

-- CreateTable
CREATE TABLE "route_assignments" (
    "id" UUID NOT NULL,
    "route_id" UUID NOT NULL,
    "lorry_id" UUID NOT NULL,
    "driver_id" UUID,
    "helper_id" UUID,
    "supervisor_id" UUID,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "change_reason" TEXT,
    "changed_by" UUID,
    "previous_assignment_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "route_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "route_assignments_date_check" CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from"),
    CONSTRAINT "route_assignments_weekdays_check" CHECK (
        "weekdays" IS NULL OR "weekdays" <@ ARRAY[1,2,3,4,5,6,7]::INTEGER[]
    ),
    CONSTRAINT "route_assignments_no_lorry_overlap" EXCLUDE USING gist (
        "lorry_id" WITH =,
        daterange("effective_from", "effective_to") WITH &&
    ) WHERE ("status" = 'ACTIVE')
);

-- CreateTable
CREATE TABLE "trips" (
    "id" UUID NOT NULL,
    "route_assignment_id" UUID,
    "route_id" UUID NOT NULL,
    "lorry_id" UUID NOT NULL,
    "driver_id" UUID,
    "helper_id" UUID,
    "supervisor_id" UUID,
    "owner_person_id" UUID NOT NULL,
    "trip_date" DATE NOT NULL,
    "status" "TripStatus" NOT NULL DEFAULT 'PLANNED',
    "started_at" TIMESTAMPTZ(6),
    "ended_at" TIMESTAMPTZ(6),
    "start_odometer_km" DECIMAL(10,1) NOT NULL,
    "end_odometer_km" DECIMAL(10,1),
    "distance_km" DECIMAL(10,1) GENERATED ALWAYS AS ("end_odometer_km" - "start_odometer_km") STORED,
    "start_odometer_photo_key" TEXT,
    "end_odometer_photo_key" TEXT,
    "started_by" UUID,
    "ended_by" UUID,
    "start_lat" DECIMAL(9,6),
    "start_lng" DECIMAL(9,6),
    "end_lat" DECIMAL(9,6),
    "end_lng" DECIMAL(9,6),
    "client_trip_id" UUID NOT NULL,
    "remarks" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "trips_odometer_check" CHECK (
        ("start_odometer_km" >= 0)
        AND ("end_odometer_km" IS NULL OR "end_odometer_km" >= "start_odometer_km")
    )
);

-- CreateTable
CREATE TABLE "trip_events" (
    "id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "event_type" "TripEventType" NOT NULL,
    "route_stop_id" UUID,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "note" TEXT,
    "client_event_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fleet_audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "actor_type" TEXT NOT NULL DEFAULT 'USER',
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "metadata" JSONB,
    "ip" TEXT,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fleet_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "envelope" JSONB NOT NULL,
    "published_at" TIMESTAMPTZ(6),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lorries_registration_no_key" ON "lorries"("registration_no");
CREATE INDEX "lorries_status_idx" ON "lorries"("status");

CREATE INDEX "lorry_documents_lorry_id_expires_on_idx" ON "lorry_documents"("lorry_id", "expires_on");

CREATE INDEX "lorry_maintenance_lorry_id_service_date_idx" ON "lorry_maintenance"("lorry_id", "service_date");
CREATE INDEX "lorry_maintenance_next_due_date_idx" ON "lorry_maintenance"("next_due_date");

CREATE UNIQUE INDEX "routes_code_key" ON "routes"("code");
CREATE INDEX "routes_status_idx" ON "routes"("status");

CREATE UNIQUE INDEX "route_stops_route_id_sequence_key" ON "route_stops"("route_id", "sequence");
CREATE UNIQUE INDEX "route_stops_route_id_supplier_id_key" ON "route_stops"("route_id", "supplier_id");
CREATE INDEX "route_stops_supplier_id_idx" ON "route_stops"("supplier_id");

CREATE INDEX "route_assignments_route_id_effective_from_idx" ON "route_assignments"("route_id", "effective_from");
CREATE INDEX "route_assignments_lorry_id_effective_from_idx" ON "route_assignments"("lorry_id", "effective_from");
CREATE INDEX "route_assignments_status_idx" ON "route_assignments"("status");

CREATE UNIQUE INDEX "trips_client_trip_id_key" ON "trips"("client_trip_id");
CREATE INDEX "trips_trip_date_status_idx" ON "trips"("trip_date", "status");
CREATE INDEX "trips_route_id_trip_date_idx" ON "trips"("route_id", "trip_date");
CREATE INDEX "trips_lorry_id_trip_date_idx" ON "trips"("lorry_id", "trip_date");
CREATE INDEX "trips_owner_person_id_trip_date_idx" ON "trips"("owner_person_id", "trip_date");
CREATE INDEX "trips_status_idx" ON "trips"("status");
CREATE UNIQUE INDEX "trips_one_active_per_lorry" ON "trips"("lorry_id")
    WHERE "status" IN ('IN_PROGRESS', 'AT_FACTORY', 'WEIGHING');

CREATE UNIQUE INDEX "trip_events_client_event_id_key" ON "trip_events"("client_event_id");
CREATE INDEX "trip_events_trip_id_occurred_at_idx" ON "trip_events"("trip_id", "occurred_at");

CREATE INDEX "fleet_audit_logs_entity_type_entity_id_at_idx" ON "fleet_audit_logs"("entity_type", "entity_id", "at");
CREATE INDEX "fleet_audit_logs_action_at_idx" ON "fleet_audit_logs"("action", "at");

CREATE INDEX "outbox_events_published_at_created_at_idx" ON "outbox_events"("published_at", "created_at");

-- AddForeignKey
ALTER TABLE "lorry_documents" ADD CONSTRAINT "lorry_documents_lorry_id_fkey" FOREIGN KEY ("lorry_id") REFERENCES "lorries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lorry_maintenance" ADD CONSTRAINT "lorry_maintenance_lorry_id_fkey" FOREIGN KEY ("lorry_id") REFERENCES "lorries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "route_assignments" ADD CONSTRAINT "route_assignments_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "route_assignments" ADD CONSTRAINT "route_assignments_lorry_id_fkey" FOREIGN KEY ("lorry_id") REFERENCES "lorries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trips" ADD CONSTRAINT "trips_route_assignment_id_fkey" FOREIGN KEY ("route_assignment_id") REFERENCES "route_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "trips" ADD CONSTRAINT "trips_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trips" ADD CONSTRAINT "trips_lorry_id_fkey" FOREIGN KEY ("lorry_id") REFERENCES "lorries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trip_events" ADD CONSTRAINT "trip_events_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trip_events" ADD CONSTRAINT "trip_events_route_stop_id_fkey" FOREIGN KEY ("route_stop_id") REFERENCES "route_stops"("id") ON DELETE SET NULL ON UPDATE CASCADE;
