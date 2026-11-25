import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { JournalService } from './journal.service';
import { assertPermission, bodyWithIdempotency, contextFrom } from '../common/request';
import { optionalDateOnly } from '../common/validation';

@Controller()
export class JournalController {
  constructor(private readonly journal: JournalService) {}

  @Get('journal-entries')
  async entries(
    @Req() req: Request,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('source') source?: string,
  ) {
    assertPermission(req, 'ledger:read');
    const rows = await this.journal.listEntries(source);
    const fromDate = optionalDateOnly(from, 'from');
    const toDate = optionalDateOnly(to, 'to');
    const data = rows.filter((row: any) => {
      const date = row.entryDate ? new Date(`${row.entryDate}T00:00:00.000Z`) : null;
      if (!date) return true;
      if (fromDate && date < fromDate) return false;
      if (toDate && date > toDate) return false;
      return true;
    });
    return { data };
  }

  @Get('journal-entries/:id')
  async entry(@Req() req: Request, @Param('id') id: string) {
    assertPermission(req, 'ledger:read');
    return { data: await this.journal.getEntry(id) };
  }

  @Get('journal-entries/:id/source')
  async source(@Req() req: Request, @Param('id') id: string) {
    assertPermission(req, 'ledger:read');
    return { data: await this.journal.sourceDocument(id) };
  }

  @Post('journal-entries/opening')
  async opening(@Req() req: Request, @Body() body: any) {
    assertPermission(req, 'ledger:opening');
    return {
      data: await this.journal.postOpening(bodyWithIdempotency(req, body), contextFrom(req)),
    };
  }

  @Post('opening-balances')
  async openingBalances(@Req() req: Request, @Body() body: any) {
    assertPermission(req, 'ledger:opening');
    return {
      data: await this.journal.postOpening(bodyWithIdempotency(req, body), contextFrom(req)),
    };
  }

  @Post('journal-entries')
  async createDraft(@Req() req: Request, @Body() body: any) {
    assertPermission(req, 'ledger:draft');
    return {
      data: await this.journal.createDraft(bodyWithIdempotency(req, body), contextFrom(req)),
    };
  }

  @Post('journal-entries/:id/post')
  async post(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    assertPermission(req, 'ledger:post');
    return { data: await this.journal.post(id, bodyWithIdempotency(req, body), contextFrom(req)) };
  }

  @Post('journal-entries/:id/reverse')
  async reverse(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    assertPermission(req, 'ledger:reverse');
    return {
      data: await this.journal.reverse(
        id,
        { ...body, idempotencyKey: body?.idempotencyKey ?? `reversal:${id}` },
        contextFrom(req),
      ),
    };
  }

  @Get('ledger/:accountId')
  async ledger(
    @Req() req: Request,
    @Param('accountId') accountId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('asOf') asOf?: string,
    @Query('partyId') partyId?: string,
  ) {
    assertPermission(req, 'ledger:read');
    return {
      data: await this.journal.ledger(accountId, {
        from: optionalDateOnly(from, 'from'),
        to: optionalDateOnly(to, 'to'),
        asOf: optionalDateOnly(asOf, 'asOf'),
        partyId,
      }),
    };
  }

  @Get('t-accounts/:accountId')
  async tAccount(
    @Req() req: Request,
    @Param('accountId') accountId: string,
    @Query('asOf') asOf?: string,
  ) {
    assertPermission(req, 'ledger:read');
    return { data: await this.journal.tAccount(accountId, optionalDateOnly(asOf, 'asOf')) };
  }

  @Get('ledger/:accountId/t-account')
  async ledgerTAccount(
    @Req() req: Request,
    @Param('accountId') accountId: string,
    @Query('asOf') asOf?: string,
  ) {
    assertPermission(req, 'ledger:read');
    return { data: await this.journal.tAccount(accountId, optionalDateOnly(asOf, 'asOf')) };
  }

  @Post('year-end/close')
  async closeYear(@Req() req: Request, @Body() body: any) {
    assertPermission(req, 'period:close');
    return { data: await this.journal.closeFiscalYear(body, contextFrom(req)) };
  }
}
