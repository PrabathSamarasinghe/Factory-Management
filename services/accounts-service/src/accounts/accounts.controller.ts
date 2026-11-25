import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ValidationError } from '@galatura/platform-kit';
import { AccountsService } from './accounts.service';
import { assertPermission, contextFrom } from '../common/request';

@Controller()
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get('accounts/tree')
  tree(@Req() req: Request) {
    assertPermission(req, 'coa:read');
    return { data: this.accounts.listAccounts() };
  }

  @Post('accounts')
  createAccount(@Req() req: Request, @Body() body: any) {
    assertPermission(req, 'coa:create');
    return { data: this.accounts.createAccount(body, contextFrom(req)) };
  }

  @Get('parties')
  parties(@Req() req: Request, @Query('partyType') partyType?: string) {
    assertPermission(req, 'ledger:opening');
    return { data: this.accounts.listParties(partyType) };
  }

  @Post('parties')
  upsertParty(@Req() req: Request, @Body() body: any) {
    assertPermission(req, 'ledger:opening');
    return { data: this.accounts.upsertParty(body, contextFrom(req)) };
  }

  @Patch('accounts/:id')
  updateAccount(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    assertPermission(req, 'coa:update');
    return { data: this.accounts.updateAccount(id, body, contextFrom(req)) };
  }

  @Post('accounts/:id/deactivate')
  deactivateAccount(@Req() req: Request, @Param('id') id: string) {
    assertPermission(req, 'coa:deactivate');
    return { data: this.accounts.deactivateAccount(id, contextFrom(req)) };
  }

  @Delete('accounts/:id')
  deleteAccount(@Req() req: Request, @Param('id') id: string) {
    assertPermission(req, 'coa:deactivate');
    return { data: this.accounts.deleteAccount(id, contextFrom(req)) };
  }

  @Get('fiscal-years')
  fiscalYears(@Req() req: Request) {
    assertPermission(req, 'coa:read');
    return { data: this.accounts.listFiscalYears() };
  }

  @Post('fiscal-years')
  createFiscalYear(@Req() req: Request, @Body() body: any) {
    assertPermission(req, 'period:lock');
    return { data: this.accounts.createFiscalYear(body, contextFrom(req)) };
  }

  @Get('fiscal-periods')
  fiscalPeriods(@Req() req: Request) {
    assertPermission(req, 'coa:read');
    return { data: this.accounts.listFiscalPeriods() };
  }

  @Post('fiscal-periods')
  createFiscalPeriod(@Req() req: Request, @Body() body: any) {
    assertPermission(req, 'period:lock');
    return { data: this.accounts.createFiscalPeriod(body, contextFrom(req)) };
  }

  @Get('periods')
  periods(@Req() req: Request) {
    assertPermission(req, 'period:lock');
    return { data: this.accounts.listFiscalPeriods() };
  }

  @Post('periods/:id/lock')
  lockPeriod(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    assertPermission(req, 'period:lock');
    return { data: this.accounts.lockPeriod(id, body ?? {}, contextFrom(req)) };
  }

  @Post('periods/:id/close')
  closePeriod(@Req() req: Request, @Param('id') id: string) {
    assertPermission(req, 'period:close');
    return { data: this.accounts.closePeriod(id, contextFrom(req)) };
  }

  @Get('posting-rules')
  postingRules(@Req() req: Request, @Query('eventType') eventType?: string) {
    assertPermission(req, 'rules:read');
    return { data: this.accounts.listPostingRules(eventType) };
  }

  @Post('posting-rules')
  createPostingRule(@Req() req: Request, @Body() body: any) {
    assertPermission(req, 'rules:write');
    return { data: this.accounts.createPostingRule(body, contextFrom(req)) };
  }

  @Get('posting-rules/resolve')
  resolvePostingRule(@Req() req: Request, @Query() query: any) {
    assertPermission(req, 'rules:read');
    let condition: unknown;
    if (typeof query?.condition === 'string' && query.condition) {
      try {
        condition = JSON.parse(query.condition);
      } catch {
        throw new ValidationError('condition must be valid JSON.');
      }
    }
    return {
      data: this.accounts.resolvePostingRule({
        eventType: query?.eventType,
        effectiveDate: query?.effectiveDate ?? new Date().toISOString().slice(0, 10),
        version: query?.version === undefined ? undefined : Number(query.version),
        condition,
      }),
    };
  }

  @Post('posting-rules/:id/approve')
  approvePostingRule(@Req() req: Request, @Param('id') id: string) {
    assertPermission(req, 'rules:write');
    return { data: this.accounts.approvePostingRule(id, contextFrom(req)) };
  }

  @Post('posting-rules/:id/disable')
  disablePostingRule(@Req() req: Request, @Param('id') id: string) {
    assertPermission(req, 'rules:write');
    return { data: this.accounts.disablePostingRule(id, contextFrom(req)) };
  }

  @Get('report-sections')
  reportSections(@Req() req: Request, @Query('statement') statement?: string) {
    assertPermission(req, 'report:read');
    return { data: this.accounts.listReportSections(statement) };
  }

  @Put('report-sections/:code')
  updateReportSection(@Req() req: Request, @Param('code') code: string, @Body() body: any) {
    assertPermission(req, 'report:configure');
    return { data: this.accounts.upsertReportSection(code, body, contextFrom(req)) };
  }

  @Get('budgets')
  budgets(@Req() req: Request) {
    assertPermission(req, 'budget:read');
    return { data: this.accounts.listBudgets() };
  }

  @Post('budgets')
  createBudget(@Req() req: Request, @Body() body: any) {
    assertPermission(req, 'budget:write');
    return { data: this.accounts.createBudget(body, contextFrom(req)) };
  }

  @Get('integrity')
  integrity(@Req() req: Request) {
    assertPermission(req, 'report:read');
    return { data: this.accounts.integrityCheck() };
  }
}
