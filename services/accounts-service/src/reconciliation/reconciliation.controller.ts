import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ReconciliationService } from './reconciliation.service';
import { assertPermission, contextFrom } from '../common/request';

@Controller()
export class ReconciliationController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  @Get('bank-accounts')
  bankAccounts(@Req() req: Request) {
    assertPermission(req, 'bank:read');
    return { data: this.reconciliation.listBankAccounts() };
  }

  @Post('bank-accounts')
  createBankAccount(@Req() req: Request, @Body() body: any) {
    assertPermission(req, 'bank:write');
    return { data: this.reconciliation.createBankAccount(body, contextFrom(req)) };
  }

  @Get('reconciliations')
  reconciliations(@Req() req: Request) {
    assertPermission(req, 'recon:read');
    return { data: this.reconciliation.listReconciliations() };
  }

  @Post('reconciliations')
  createReconciliation(@Req() req: Request, @Body() body: any) {
    assertPermission(req, 'recon:write');
    return { data: this.reconciliation.createReconciliation(body, contextFrom(req)) };
  }

  @Post('reconciliations/:id/lines')
  addLine(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    assertPermission(req, 'recon:write');
    return { data: this.reconciliation.addReconciliationLine(id, body, contextFrom(req)) };
  }

  @Post('reconciliations/:id/match')
  match(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    assertPermission(req, 'recon:write');
    return { data: this.reconciliation.matchReconciliation(id, body, contextFrom(req)) };
  }
}
