-- Provision one schema and login role per database-owning service.
--
-- Run as the Supabase `postgres` role against the project database, using the
-- session pooler (port 5432) or a direct connection. The role creates a private
-- schema for each service and rotates that service role's password.
--
--   export SUPABASE_DB_URL='postgresql://postgres.<project-ref>:<password>@<pooler-host>:5432/postgres?sslmode=require'
--   export PEOPLE_DB_PASSWORD="$(openssl rand -hex 32)"
--   ... (see README.md for all variables)
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -v people_password="$PEOPLE_DB_PASSWORD" \
--     -v attendance_password="$ATTENDANCE_DB_PASSWORD" \
--     -v fleet_password="$FLEET_DB_PASSWORD" \
--     -v collection_password="$COLLECTION_DB_PASSWORD" \
--     -v notification_password="$NOTIFICATION_DB_PASSWORD" \
--     -v realtime_password="$REALTIME_DB_PASSWORD" \
--     -v inventory_password="$INVENTORY_DB_PASSWORD" \
--     -v reporting_password="$REPORTING_DB_PASSWORD" \
--     -v identity_password="$IDENTITY_DB_PASSWORD" \
--     -v accounts_password="$ACCOUNTS_DB_PASSWORD" \
--     -f infra/supabase/provision-schemas.sql
--
-- Never put passwords in this file or in git. The script is safe to re-run:
-- it creates missing roles/schemas and rotates existing role passwords.
--
-- `identity` and `accounts` are schemas in the same Supabase project. They are
-- logically isolated by role grants, not by separate database instances.

\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION public.galatura_provision_service(
  role_name text,
  schema_name text,
  role_password text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
    EXECUTE format(
      'CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
      role_name,
      role_password
    );
  ELSE
    EXECUTE format(
      'ALTER ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
      role_name,
      role_password
    );
  END IF;

  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I AUTHORIZATION %I', schema_name, role_name);
  EXECUTE format('ALTER SCHEMA %I OWNER TO %I', schema_name, role_name);
  EXECUTE format('REVOKE ALL ON SCHEMA %I FROM PUBLIC', schema_name);
  EXECUTE format('GRANT USAGE, CREATE ON SCHEMA %I TO %I', schema_name, role_name);

  -- The service may read shared extension objects but must not create objects
  -- in `public`. Supabase-managed schemas are not granted at all.
  EXECUTE format('REVOKE CREATE ON SCHEMA public FROM %I', role_name);
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', role_name);

  EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), role_name);
  EXECUTE format('ALTER ROLE %I SET search_path = %I, public', role_name, schema_name);
END;
$$;

SELECT public.galatura_provision_service('identity_service', 'identity', :'identity_password');
SELECT public.galatura_provision_service('people_service', 'people', :'people_password');
SELECT public.galatura_provision_service('attendance_service', 'attendance', :'attendance_password');
SELECT public.galatura_provision_service('fleet_service', 'fleet', :'fleet_password');
SELECT public.galatura_provision_service('collection_service', 'collection', :'collection_password');
SELECT public.galatura_provision_service('notification_service', 'notification', :'notification_password');
SELECT public.galatura_provision_service('realtime_service', 'realtime_service', :'realtime_password');
SELECT public.galatura_provision_service('accounts_service', 'accounts', :'accounts_password');
SELECT public.galatura_provision_service('inventory_service', 'inventory', :'inventory_password');
SELECT public.galatura_provision_service('reporting_service', 'reporting', :'reporting_password');

DROP FUNCTION public.galatura_provision_service(text, text, text);

COMMIT;
