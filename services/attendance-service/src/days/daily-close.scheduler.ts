import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { addDays, formatDateOnly, timezoneOffsetMinutes, workDateFor } from '../common/date';
import { DailyAttendanceService } from './daily-attendance.service';

@Injectable()
export class DailyCloseScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DailyCloseScheduler.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly daily: DailyAttendanceService) {}

  onApplicationBootstrap(): void {
    if (process.env.ATTENDANCE_DAILY_CLOSE_ENABLED !== 'true') {
      return;
    }
    this.scheduleNext();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext(): void {
    const offset = timezoneOffsetMinutes();
    const now = Date.now();
    const local = new Date(now + offset * 60_000);
    const afterCloseTime =
      local.getUTCHours() > 0 || (local.getUTCHours() === 0 && local.getUTCMinutes() >= 5);
    const nextLocal = Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate() + (afterCloseTime ? 1 : 0),
      0,
      5,
    );
    const delay = Math.max(1000, nextLocal - offset * 60_000 - now);

    this.timer = setTimeout(() => {
      void this.run();
      this.scheduleNext();
    }, delay);
    this.timer.unref();
  }

  private async run(): Promise<void> {
    const workDate = formatDateOnly(addDays(workDateFor(new Date()), -1));
    try {
      const result = await this.daily.closeDate(workDate);
      this.logger.log(
        `Closed attendance for ${workDate}: ${result.closed} closed, ${result.skipped} skipped.`,
      );
    } catch (error) {
      this.logger.error(
        `Attendance close failed for ${workDate}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
