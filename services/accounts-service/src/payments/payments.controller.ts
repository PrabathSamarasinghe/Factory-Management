import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { PaymentsService } from './payments.service';
import { assertPermission, bodyWithIdempotency, contextFrom } from '../common/request';

@Controller()
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @Get('payment-batches')
  batches(@Req() req: Request) {
    assertPermission(req, 'payment:read');
    return { data: this.service.listBatches() };
  }

  @Post('payment-batches')
  createBatch(@Req() req: Request, @Body() body: any) {
    assertPermission(req, 'payment:create');
    return { data: this.service.createBatch(body, contextFrom(req)) };
  }

  @Post('payment-batches/:id/approve')
  async approveBatch(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    assertPermission(req, 'payment:approve');
    return {
      data: await this.service.approveBatch(id, bodyWithIdempotency(req, body), contextFrom(req)),
    };
  }

  @Get('payment-batches/:id/bank-file')
  async bankFile(@Req() req: Request, @Param('id') id: string) {
    assertPermission(req, 'payment:export');
    return { data: await this.service.bankFile(id) };
  }

  @Get('payments')
  payments(@Req() req: Request) {
    assertPermission(req, 'payment:read');
    return { data: this.service.listPayments() };
  }

  @Post('payments')
  async createPayment(@Req() req: Request, @Body() body: any) {
    assertPermission(req, 'payment:create');
    return {
      data: await this.service.createPayment(bodyWithIdempotency(req, body), contextFrom(req)),
    };
  }

  @Post('payments/:id/mark-paid')
  async markPaid(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    assertPermission(req, 'payment:mark-paid');
    return {
      data: await this.service.markPaymentPaid(
        id,
        bodyWithIdempotency(req, body),
        contextFrom(req),
      ),
    };
  }
}
