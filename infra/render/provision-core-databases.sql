-- Bootstrap the shared core Postgres instance.
--
-- Render creates one database and one login role per Postgres instance. The
-- core instance hosts separate logical databases for most services, so this
-- script creates each service's database and role. identity and accounts have
-- their own Render instances and do not use this script.
--
-- Run as the core instance's default/admin user with psql:
--
--   export CORE_DATABASE_URL='postgresql://core_owner:...@.../galatura_core'
--   export PEOPLE_DB_PASSWORD="$(openssl rand -hex 32)"
--   ... (see README.md for the full command)
--   psql "$CORE_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -v people_password="$PEOPLE_DB_PASSWORD" \
--     -v attendance_password="$ATTENDANCE_DB_PASSWORD" \
--     -v fleet_password="$FLEET_DB_PASSWORD" \
--     -v collection_password="$COLLECTION_DB_PASSWORD" \
--     -v notification_password="$NOTIFICATION_DB_PASSWORD" \
--     -v realtime_password="$REALTIME_DB_PASSWORD" \
--     -v inventory_password="$INVENTORY_DB_PASSWORD" \
--     -v reporting_password="$REPORTING_DB_PASSWORD" \
--     -f infra/render/provision-core-databases.sql
--
-- Never put passwords in this file or in git. The psql variables are only
-- used to create/rotate the service roles. Store each resulting connection URL
-- as a secret in Render (service env var or scoped environment group).
--
-- The script is safe to re-run: it creates missing roles/databases and rotates
-- the role passwords to the supplied values.

\set ON_ERROR_STOP on

-- people-service
SELECT format(
  'CREATE ROLE people_service LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD %L',
  :'people_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'people_service') \gexec
ALTER ROLE people_service WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD :'people_password';
SELECT 'CREATE DATABASE galatura_people OWNER people_service'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'galatura_people') \gexec
REVOKE ALL ON DATABASE galatura_people FROM PUBLIC;
GRANT CONNECT ON DATABASE galatura_people TO people_service;

-- attendance-service
SELECT format(
  'CREATE ROLE attendance_service LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD %L',
  :'attendance_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'attendance_service') \gexec
ALTER ROLE attendance_service WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD :'attendance_password';
SELECT 'CREATE DATABASE galatura_attendance OWNER attendance_service'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'galatura_attendance') \gexec
REVOKE ALL ON DATABASE galatura_attendance FROM PUBLIC;
GRANT CONNECT ON DATABASE galatura_attendance TO attendance_service;

-- fleet-service
SELECT format(
  'CREATE ROLE fleet_service LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD %L',
  :'fleet_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fleet_service') \gexec
ALTER ROLE fleet_service WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD :'fleet_password';
SELECT 'CREATE DATABASE galatura_fleet OWNER fleet_service'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'galatura_fleet') \gexec
REVOKE ALL ON DATABASE galatura_fleet FROM PUBLIC;
GRANT CONNECT ON DATABASE galatura_fleet TO fleet_service;

-- collection-service
SELECT format(
  'CREATE ROLE collection_service LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD %L',
  :'collection_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'collection_service') \gexec
ALTER ROLE collection_service WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD :'collection_password';
SELECT 'CREATE DATABASE galatura_collection OWNER collection_service'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'galatura_collection') \gexec
REVOKE ALL ON DATABASE galatura_collection FROM PUBLIC;
GRANT CONNECT ON DATABASE galatura_collection TO collection_service;

-- notification-service
SELECT format(
  'CREATE ROLE notification_service LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD %L',
  :'notification_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'notification_service') \gexec
ALTER ROLE notification_service WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD :'notification_password';
SELECT 'CREATE DATABASE galatura_notification OWNER notification_service'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'galatura_notification') \gexec
REVOKE ALL ON DATABASE galatura_notification FROM PUBLIC;
GRANT CONNECT ON DATABASE galatura_notification TO notification_service;

-- realtime-service
SELECT format(
  'CREATE ROLE realtime_service LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD %L',
  :'realtime_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'realtime_service') \gexec
ALTER ROLE realtime_service WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD :'realtime_password';
SELECT 'CREATE DATABASE galatura_realtime OWNER realtime_service'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'galatura_realtime') \gexec
REVOKE ALL ON DATABASE galatura_realtime FROM PUBLIC;
GRANT CONNECT ON DATABASE galatura_realtime TO realtime_service;

-- inventory-service
SELECT format(
  'CREATE ROLE inventory_service LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD %L',
  :'inventory_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'inventory_service') \gexec
ALTER ROLE inventory_service WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD :'inventory_password';
SELECT 'CREATE DATABASE galatura_inventory OWNER inventory_service'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'galatura_inventory') \gexec
REVOKE ALL ON DATABASE galatura_inventory FROM PUBLIC;
GRANT CONNECT ON DATABASE galatura_inventory TO inventory_service;

-- reporting-service (read models and projections only)
SELECT format(
  'CREATE ROLE reporting_service LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD %L',
  :'reporting_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'reporting_service') \gexec
ALTER ROLE reporting_service WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD :'reporting_password';
SELECT 'CREATE DATABASE galatura_reporting OWNER reporting_service'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'galatura_reporting') \gexec
REVOKE ALL ON DATABASE galatura_reporting FROM PUBLIC;
GRANT CONNECT ON DATABASE galatura_reporting TO reporting_service;
