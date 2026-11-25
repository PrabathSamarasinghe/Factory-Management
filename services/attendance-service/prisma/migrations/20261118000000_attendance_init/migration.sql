-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "attendance";
SET search_path TO "attendance", public;

-- CreateEnum
CREATE TYPE "AttendanceEventType" AS ENUM ('CHECK_IN', 'CHECK_OUT');

-- CreateEnum
CREATE TYPE "AttendanceMethod" AS ENUM ('FACE', 'MANUAL', 'IMPORT');

-- CreateEnum
CREATE TYPE "AttendanceDayStatus" AS ENUM ('PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'HOLIDAY', 'INCOMPLETE');

-- CreateEnum
CREATE TYPE "CorrectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DeviceKind" AS ENUM ('KIOSK', 'PERSONAL');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ACTIVE', 'DISABLED', 'REVOKED');

-- CreateTable
CREATE TABLE "face_templates" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "template_enc" TEXT NOT NULL,
    "enc_key_id" TEXT NOT NULL,
    "model_name" TEXT NOT NULL,
    "model_version" TEXT NOT NULL,
    "embedding_dim" INTEGER NOT NULL,
    "quality_score" DECIMAL(5,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "enrolled_by" UUID,
    "enrolled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "revoke_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "face_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "face_verification_attempts" (
    "id" UUID NOT NULL,
    "device_id" UUID,
    "person_id" UUID,
    "matched" BOOLEAN NOT NULL,
    "similarity" DECIMAL(5,4),
    "threshold" DECIMAL(5,4) NOT NULL,
    "liveness_score" DECIMAL(5,4),
    "liveness_passed" BOOLEAN NOT NULL,
    "model_version" TEXT NOT NULL,
    "failure_reason" TEXT,
    "captured_at" TIMESTAMPTZ(6) NOT NULL,
    "ip" TEXT,
    "frame_object_key" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "face_verification_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    "grace_minutes" INTEGER NOT NULL DEFAULT 0,
    "break_minutes" INTEGER NOT NULL DEFAULT 0,
    "crosses_midnight" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_assignments" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "shift_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_events" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "event_type" "AttendanceEventType" NOT NULL,
    "event_at" TIMESTAMPTZ(6) NOT NULL,
    "work_date" DATE NOT NULL,
    "method" "AttendanceMethod" NOT NULL,
    "verification_attempt_id" UUID,
    "device_id" UUID,
    "location_id" UUID,
    "gps_lat" DECIMAL(9,6),
    "gps_lng" DECIMAL(9,6),
    "manual_reason" TEXT,
    "entered_by" UUID,
    "client_event_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_days" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "first_in" TIMESTAMPTZ(6),
    "last_out" TIMESTAMPTZ(6),
    "worked_minutes" INTEGER NOT NULL DEFAULT 0,
    "late_minutes" INTEGER NOT NULL DEFAULT 0,
    "early_leave_minutes" INTEGER NOT NULL DEFAULT 0,
    "overtime_minutes" INTEGER NOT NULL DEFAULT 0,
    "status" "AttendanceDayStatus" NOT NULL,
    "shift_id" UUID,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "approved_by" UUID,
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attendance_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_corrections" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "requested_by" UUID NOT NULL,
    "proposed_in" TIMESTAMPTZ(6),
    "proposed_out" TIMESTAMPTZ(6),
    "reason" TEXT NOT NULL,
    "status" "CorrectionStatus" NOT NULL DEFAULT 'PENDING',
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attendance_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "annual_quota" DECIMAL(6,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "leave_type_id" UUID NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "days" DECIMAL(6,2) NOT NULL,
    "reason" TEXT,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_locations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "gps_lat" DECIMAL(9,6),
    "gps_lng" DECIMAL(9,6),
    "radius_m" INTEGER NOT NULL DEFAULT 100,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attendance_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registered_devices" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "location_id" UUID,
    "kind" "DeviceKind" NOT NULL,
    "status" "DeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "api_key_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "registered_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "actor_type" TEXT NOT NULL DEFAULT 'USER',
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "metadata" JSONB,
    "ip" TEXT,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_audit_logs_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "face_templates_person_id_is_active_idx" ON "face_templates"("person_id", "is_active");

-- CreateIndex
CREATE INDEX "face_verification_attempts_person_id_captured_at_idx" ON "face_verification_attempts"("person_id", "captured_at");

-- CreateIndex
CREATE INDEX "face_verification_attempts_device_id_captured_at_idx" ON "face_verification_attempts"("device_id", "captured_at");

-- CreateIndex
CREATE INDEX "face_verification_attempts_created_at_idx" ON "face_verification_attempts"("created_at");

-- CreateIndex
CREATE INDEX "shifts_active_idx" ON "shifts"("active");

-- CreateIndex
CREATE INDEX "shift_assignments_person_id_effective_from_idx" ON "shift_assignments"("person_id", "effective_from");

-- CreateIndex
CREATE INDEX "shift_assignments_shift_id_idx" ON "shift_assignments"("shift_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_events_client_event_id_key" ON "attendance_events"("client_event_id");

-- CreateIndex
CREATE INDEX "attendance_events_person_id_event_at_idx" ON "attendance_events"("person_id", "event_at");

-- CreateIndex
CREATE INDEX "attendance_events_work_date_idx" ON "attendance_events"("work_date");

-- CreateIndex
CREATE INDEX "attendance_events_device_id_idx" ON "attendance_events"("device_id");

-- CreateIndex
CREATE INDEX "attendance_days_work_date_status_idx" ON "attendance_days"("work_date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_days_person_id_work_date_key" ON "attendance_days"("person_id", "work_date");

-- CreateIndex
CREATE INDEX "attendance_corrections_person_id_work_date_idx" ON "attendance_corrections"("person_id", "work_date");

-- CreateIndex
CREATE INDEX "attendance_corrections_status_idx" ON "attendance_corrections"("status");

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_code_key" ON "leave_types"("code");

-- CreateIndex
CREATE INDEX "leave_requests_person_id_from_date_idx" ON "leave_requests"("person_id", "from_date");

-- CreateIndex
CREATE INDEX "leave_requests_status_idx" ON "leave_requests"("status");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_date_key" ON "holidays"("date");

-- CreateIndex
CREATE UNIQUE INDEX "registered_devices_api_key_hash_key" ON "registered_devices"("api_key_hash");

-- CreateIndex
CREATE INDEX "registered_devices_location_id_idx" ON "registered_devices"("location_id");

-- CreateIndex
CREATE INDEX "attendance_audit_logs_entity_type_entity_id_at_idx" ON "attendance_audit_logs"("entity_type", "entity_id", "at");

-- CreateIndex
CREATE INDEX "attendance_audit_logs_action_at_idx" ON "attendance_audit_logs"("action", "at");

-- CreateIndex
CREATE INDEX "outbox_events_published_at_created_at_idx" ON "outbox_events"("published_at", "created_at");

RESET search_path;

