ALTER TABLE "people"."admin_details" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "people"."bank_accounts" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "people"."consents" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "people"."emergency_contacts" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "people"."employee_details" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "people"."person_documents" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "people"."persons" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "people"."staff_details" ALTER COLUMN "licence_classes" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "people"."supplier_details" ALTER COLUMN "joined_on" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "updated_at" DROP DEFAULT;
