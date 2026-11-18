import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SmsDispatchService } from '../sms/sms-dispatch.service';

@Injectable()
export class SmsWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SmsWorkerService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatch: SmsDispatchService,
  ) {}

  onModuleInit() {
    const intervalMs = Number(process.env.SMS_WORKER_INTERVAL_MS ?? 5000);
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const messages = await this.prisma.smsMessage.findMany({
        where: {
          status: 'QUEUED',
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
        },
        orderBy: { nextAttemptAt: 'asc' },
        take: 20,
      });
      for (const message of messages) {
        await this.dispatch.dispatch(message.id);
      }
    } catch (error) {
      this.logger.warn(`SMS worker tick failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
