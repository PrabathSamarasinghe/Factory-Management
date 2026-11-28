ALTER TABLE "realtime_service"."processed_events" ADD CONSTRAINT "processed_events_pkey" PRIMARY KEY ("id");
ALTER TABLE "realtime_service"."realtime_connections" DROP COLUMN "client_app",
ADD COLUMN     "clientApp" TEXT NOT NULL;
