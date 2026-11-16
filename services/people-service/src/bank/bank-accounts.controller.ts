import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AddBankAccountInput, BankAccountsService } from './bank-accounts.service';

@Controller()
export class BankAccountsController {
  constructor(private readonly bankAccountsService: BankAccountsService) {}

  @Post('persons/:id/bank-accounts')
  addBankAccount(
    @Param('id') personId: string,
    @Body() body: AddBankAccountInput,
    @Req() req: Request,
  ) {
    const creatorId = req.headers['x-user-id'] as string | undefined;
    return this.bankAccountsService.addBankAccount(personId, body, creatorId);
  }

  @Get('persons/:id/bank-accounts')
  listBankAccounts(@Param('id') personId: string, @Req() req: Request) {
    const permissions = JSON.parse((req.headers['x-permissions'] as string) || '[]');
    const canReadSensitive = permissions.includes('person:read-sensitive') || permissions.includes('bank:write');
    return this.bankAccountsService.listBankAccounts(personId, canReadSensitive);
  }

  @Patch('persons/:id/bank-accounts/:accountId/primary')
  setPrimary(
    @Param('id') personId: string,
    @Param('accountId') accountId: string,
  ) {
    return this.bankAccountsService.setPrimary(accountId, personId);
  }

  @Delete('persons/:id/bank-accounts/:accountId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteBankAccount(
    @Param('id') personId: string,
    @Param('accountId') accountId: string,
  ) {
    await this.bankAccountsService.deleteBankAccount(accountId, personId);
  }

  @Post('bank-accounts/:id/verify')
  verifyBankAccount(@Param('id') id: string, @Req() req: Request) {
    const verifierId = (req.headers['x-user-id'] as string) || '';
    return this.bankAccountsService.verifyBankAccount(id, verifierId);
  }
}
