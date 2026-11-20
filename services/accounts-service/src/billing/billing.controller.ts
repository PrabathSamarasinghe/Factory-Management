import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { BillingService } from './billing.service';
import { assertPermission, bodyWithIdempotency, contextFrom } from '../common/request';
import { optionalDateOnly } from '../common/validation';

@Controller()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('rates')
  rates(@Req() req: Request) {
    assertPermission(req, 'rate:read');
    return { data: this.billing.listRates() };
  }

  @Post('rates')
  createRate(@Req() req: Request, @Body() body: any) {
    assertPermission(req, 'rate:write');
    return { data: this.billing.createRate(body, contextFrom(req)) };
  }

  @Patch('rates/:id')
  updateRate(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    assertPermission(req, 'rate:write');
    return { data: this.billing.updateRate(id, body, contextFrom(req)) };
  }

  @Get('supplier-bills')
  bills(@Req() req: Request) {
    assertPermission(req, 'payable:read');
    return { data: this.billing.listBills() };
  }

  @Post('supplier-bills/generate')
  async generateBills(@Req() req: Request, @Body() body: any) {
    assertPermission(req, 'bill:generate');
    return {
      data: await this.billing.generateBills(bodyWithIdempotency(req, body), contextFrom(req)),
    };
  }

  @Post('supplier-bills/:id/approve')
  async approveBill(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    assertPermission(req, 'bill:approve');
    return {
      data: await this.billing.approveBill(id, bodyWithIdempotency(req, body), contextFrom(req)),
    };
  }

  @Get('suppliers/:id/payable')
  async payable(@Req() req: Request, @Param('id') id: string, @Query('asOf') asOf?: string) {
    assertPermission(req, 'payable:read');
    return { data: await this.billing.supplierPayable(id, optionalDateOnly(asOf, 'asOf')) };
  }

  @Get('supplier-adjustments')
  adjustments(@Req() req: Request) {
    assertPermission(req, 'payable:read');
    return { data: this.billing.listAdjustments() };
  }

  @Post('supplier-adjustments')
  createAdjustment(@Req() req: Request, @Body() body: any) {
    assertPermission(req, 'adjustment:create');
    return { data: this.billing.createAdjustment(body, contextFrom(req)) };
  }

  @Post('supplier-adjustments/:id/recover')
  async recoverAdjustment(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    assertPermission(req, 'adjustment:recover');
    return {
      data: await this.billing.recoverAdjustment(
        id,
        bodyWithIdempotency(req, body),
        contextFrom(req),
      ),
    };
  }
}
