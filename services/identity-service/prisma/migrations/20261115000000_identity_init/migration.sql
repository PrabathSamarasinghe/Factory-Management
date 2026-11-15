-- Initial Identity Service Migration
CREATE SCHEMA IF NOT EXISTS "identity";
CREATE EXTENSION IF NOT EXISTS citext;

-- Enums
CREATE TYPE "identity"."UserStatus" AS ENUM ('ACTIVE', 'LOCKED', 'DISABLED', 'PENDING');
CREATE TYPE "identity"."PermissionScope" AS ENUM ('OWN', 'ROUTE', 'DEPARTMENT', 'ALL');
CREATE TYPE "identity"."OverrideEffect" AS ENUM ('ALLOW', 'DENY');
CREATE TYPE "identity"."ChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "identity"."DeviceStatus" AS ENUM ('ACTIVE', 'REVOKED');
CREATE TYPE "identity"."ServiceClientStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- Users
CREATE TABLE "identity"."users" (
    "id" UUID NOT NULL,
    "person_id" UUID,
    "username" citext NOT NULL,
    "email" citext,
    "phone" TEXT,
    "password_hash" TEXT NOT NULL,
    "status" "identity"."UserStatus" NOT NULL DEFAULT 'PENDING',
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "totp_secret_enc" BYTEA,
    "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- Roles
CREATE TABLE "identity"."roles" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "requires_2fa" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- Permissions
CREATE TABLE "identity"."permissions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- Role Permissions
CREATE TABLE "identity"."role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "scope" "identity"."PermissionScope" NOT NULL DEFAULT 'ALL',

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id"),
    CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "identity"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "identity"."permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- User Roles
CREATE TABLE "identity"."user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "granted_by" UUID,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id"),
    CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "identity"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- User Permission Overrides
CREATE TABLE "identity"."user_permission_overrides" (
    "user_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "effect" "identity"."OverrideEffect" NOT NULL,

    CONSTRAINT "user_permission_overrides_pkey" PRIMARY KEY ("user_id","permission_id"),
    CONSTRAINT "user_permission_overrides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_permission_overrides_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "identity"."permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Permission Change Requests (Maker-Checker)
CREATE TABLE "identity"."permission_change_requests" (
    "id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "change" JSONB NOT NULL,
    "status" "identity"."ChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "approved_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permission_change_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "permission_change_requests_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "identity"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Devices
CREATE TABLE "identity"."devices" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "model" TEXT,
    "app_version" TEXT,
    "push_token" TEXT,
    "attested" BOOLEAN NOT NULL DEFAULT false,
    "status" "identity"."DeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_seen_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Sessions
CREATE TABLE "identity"."sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_id" UUID,
    "refresh_token_hash" TEXT NOT NULL,
    "family_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sessions_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "identity"."devices"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Password Resets
CREATE TABLE "identity"."password_resets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "password_resets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Auth Audit
CREATE TABLE "identity"."auth_audit" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "event" TEXT NOT NULL,
    "ip" TEXT,
    "device_id" UUID,
    "success" BOOLEAN NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_audit_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "auth_audit_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Service Clients
CREATE TABLE "identity"."service_clients" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "public_key" TEXT NOT NULL,
    "allowed_scopes" TEXT[] NOT NULL,
    "status" "identity"."ServiceClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_clients_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "users_username_key" ON "identity"."users"("username");
CREATE UNIQUE INDEX "users_email_key" ON "identity"."users"("email");
CREATE INDEX "users_person_id_idx" ON "identity"."users"("person_id");
CREATE INDEX "users_status_idx" ON "identity"."users"("status");

CREATE UNIQUE INDEX "roles_code_key" ON "identity"."roles"("code");

CREATE UNIQUE INDEX "permissions_code_key" ON "identity"."permissions"("code");
CREATE INDEX "permissions_resource_action_idx" ON "identity"."permissions"("resource", "action");

CREATE INDEX "role_permissions_permission_id_idx" ON "identity"."role_permissions"("permission_id");
CREATE INDEX "user_roles_role_id_idx" ON "identity"."user_roles"("role_id");
CREATE INDEX "user_permission_overrides_permission_id_idx" ON "identity"."user_permission_overrides"("permission_id");

CREATE INDEX "permission_change_requests_role_id_idx" ON "identity"."permission_change_requests"("role_id");
CREATE INDEX "permission_change_requests_status_idx" ON "identity"."permission_change_requests"("status");

CREATE INDEX "devices_user_id_idx" ON "identity"."devices"("user_id");
CREATE INDEX "devices_status_idx" ON "identity"."devices"("status");

CREATE INDEX "sessions_user_id_idx" ON "identity"."sessions"("user_id");
CREATE INDEX "sessions_family_id_idx" ON "identity"."sessions"("family_id");
CREATE INDEX "sessions_refresh_token_hash_idx" ON "identity"."sessions"("refresh_token_hash");
CREATE INDEX "sessions_expires_at_idx" ON "identity"."sessions"("expires_at");

CREATE INDEX "password_resets_user_id_idx" ON "identity"."password_resets"("user_id");
CREATE INDEX "password_resets_token_hash_idx" ON "identity"."password_resets"("token_hash");

CREATE INDEX "auth_audit_user_id_at_idx" ON "identity"."auth_audit"("user_id", "at");
CREATE INDEX "auth_audit_event_at_idx" ON "identity"."auth_audit"("event", "at");

CREATE UNIQUE INDEX "service_clients_name_key" ON "identity"."service_clients"("name");
