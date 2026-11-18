import { Module } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { EncryptionService } from './crypto/encryption.service';
import { AttendanceAuditService } from './audit/audit.service';
import { OutboxService } from './outbox/outbox.service';
import { PeopleConsentClient } from './people/people-consent.client';
import { FACE_ENGINE } from './face/face-engine';
import { createFaceEngine } from './face/face-engine.provider';
import { EnrollmentsController } from './enrollments/enrollments.controller';
import { EnrollmentsService } from './enrollments/enrollments.service';
import { MarkingController } from './marking/marking.controller';
import { MarkingService } from './marking/marking.service';
import { VerificationRateLimiter } from './marking/verification-rate-limiter';
import { DaysController } from './days/days.controller';
import { DailyAttendanceService } from './days/daily-attendance.service';
import { DailyCloseScheduler } from './days/daily-close.scheduler';
import { ShiftsController } from './shifts/shifts.controller';
import { ShiftsService } from './shifts/shifts.service';
import { CorrectionsController } from './corrections/corrections.controller';
import { CorrectionsService } from './corrections/corrections.service';
import { LeaveController } from './leave/leave.controller';
import { LeaveService } from './leave/leave.service';
import { DevicesController } from './devices/devices.controller';
import { DevicesService } from './devices/devices.service';

@Module({
  controllers: [
    EnrollmentsController,
    MarkingController,
    DaysController,
    ShiftsController,
    CorrectionsController,
    LeaveController,
    DevicesController,
  ],
  providers: [
    PrismaService,
    EncryptionService,
    AttendanceAuditService,
    OutboxService,
    PeopleConsentClient,
    VerificationRateLimiter,
    DailyAttendanceService,
    DailyCloseScheduler,
    EnrollmentsService,
    MarkingService,
    ShiftsService,
    CorrectionsService,
    LeaveService,
    DevicesService,
    {
      provide: FACE_ENGINE,
      useFactory: createFaceEngine,
    },
  ],
})
export class AppModule {}
