import { Injectable } from '@nestjs/common';
import { BusinessRuleError } from '@galatura/platform-kit';
import type { EventEnvelope } from '@galatura/platform-kit';
import { AccountsService } from '../accounts/accounts.service';
import { JournalService } from '../journal/journal.service';
import type { RequestContext } from '../common/request';
import {
  dateKey,
  dateOnly,
  money,
  requiredArray,
  requiredString,
  roundMoney,
  uuid,
} from '../common/validation';

interface InventoryLine {
  itemId: string;
  value: string;
  debitAccountId: string;
  creditAccountId: string;
}

@Injectable()
export class InventoryAccountsService {
  constructor(
    private readonly accounts: AccountsService,
    private readonly journal: JournalService,
  ) {}

  async ingestPurchaseReceived(event: EventEnvelope<any>) {
    const payload = event.payload ?? {};
    const receiptId = uuid(payload.receiptId, 'payload.receiptId');
    const vendorId = uuid(payload.vendorId, 'payload.vendorId');
    const entryDate = dateOnly(payload.receivedDate, 'payload.receivedDate');
    const reference = requiredString(payload.reference, 'payload.reference');
    const totalValue = money(payload.totalValue, 'payload.totalValue');
    const approvedBy = uuid(payload.approvedBy, 'payload.approvedBy');
    const lines = await this.lines(payload, 'inventoryAccountCode', 'payableAccountCode');

    const entry = await this.journal.postSystem(
      {
        entryDate: dateKey(entryDate),
        description: `Goods receipt ${reference}`.slice(0, 200),
        sourceType: 'INVENTORY',
        sourceId: receiptId,
        idempotencyKey: `inventory-purchase:${receiptId}`,
        lines: lines.flatMap((line) => [
          {
            accountId: line.debitAccountId,
            debit: line.value,
            credit: '0.00',
            partyType: 'SUPPLIER',
            partyId: vendorId,
            memo: line.itemId,
          },
          {
            accountId: line.creditAccountId,
            debit: '0.00',
            credit: line.value,
            partyType: 'SUPPLIER',
            partyId: vendorId,
            memo: line.itemId,
          },
        ]),
      },
      this.context(event, approvedBy),
    );
    return { journalEntryId: entry.id, status: entry.status, totalValue };
  }

  async ingestIssuePosted(event: EventEnvelope<any>) {
    const payload = event.payload ?? {};
    const issueId = uuid(payload.issueId, 'payload.issueId');
    const issueDate = dateOnly(payload.issueDate, 'payload.issueDate');
    const issuedToType = requiredString(payload.issuedToType, 'payload.issuedToType');
    const issuedToId = uuid(payload.issuedToId, 'payload.issuedToId');
    const purpose = requiredString(payload.purpose, 'payload.purpose');
    const totalValue = money(payload.totalValue, 'payload.totalValue');
    const approvedBy = uuid(payload.approvedBy, 'payload.approvedBy');
    const lines = await this.lines(payload, 'expenseAccountCode', 'inventoryAccountCode');
    const partyType = issuedToType.toUpperCase();

    const entry = await this.journal.postSystem(
      {
        entryDate: dateKey(issueDate),
        description: `Goods issue ${purpose}`.slice(0, 200),
        sourceType: 'INVENTORY',
        sourceId: issueId,
        idempotencyKey: `inventory-issue:${issueId}`,
        lines: lines.flatMap((line) => [
          {
            accountId: line.debitAccountId,
            debit: line.value,
            credit: '0.00',
            partyType,
            partyId: issuedToId,
            memo: line.itemId,
          },
          {
            accountId: line.creditAccountId,
            debit: '0.00',
            credit: line.value,
            partyType,
            partyId: issuedToId,
            memo: line.itemId,
          },
        ]),
      },
      this.context(event, approvedBy),
    );
    return { journalEntryId: entry.id, status: entry.status, totalValue };
  }

  private async lines(
    payload: any,
    debitCodeField: 'inventoryAccountCode' | 'expenseAccountCode',
    creditCodeField: 'payableAccountCode' | 'inventoryAccountCode',
  ): Promise<InventoryLine[]> {
    const rows = requiredArray(payload.lines, 'payload.lines');
    const lines: InventoryLine[] = [];

    for (const row of rows) {
      const item = row as Record<string, unknown>;
      const debitCode = requiredString(item[debitCodeField], `line.${debitCodeField}`);
      const creditCode = requiredString(item[creditCodeField], `line.${creditCodeField}`);
      const resolved = await this.accounts.resolvePostingAccounts({
        eventType:
          debitCodeField === 'inventoryAccountCode'
            ? 'inventory.purchase.received'
            : 'inventory.issue.posted',
        effectiveDate: new Date(
          typeof payload.receivedDate === 'string'
            ? payload.receivedDate
            : typeof payload.issueDate === 'string'
              ? payload.issueDate
              : new Date().toISOString().slice(0, 10),
        ),
        condition: { debitAccountCode: debitCode, creditAccountCode: creditCode },
        fallback: { debitCode, creditCode },
      });
      lines.push({
        itemId: uuid(item.itemId, 'line.itemId'),
        value: money(item.value, 'line.value'),
        debitAccountId: resolved.debitAccountId,
        creditAccountId: resolved.creditAccountId,
      });
    }

    const lineTotal = lines.reduce((sum, line) => sum + Number(line.value), 0);
    const totalValue = money(payload.totalValue, 'payload.totalValue');
    if (roundMoney(lineTotal) !== roundMoney(Number(totalValue))) {
      throw new BusinessRuleError('Inventory event line values must equal totalValue.');
    }
    return lines;
  }

  private context(event: EventEnvelope<any>, approvedBy: string): RequestContext {
    const actorId = typeof event.actor?.id === 'string' ? event.actor.id : approvedBy;
    return { actorId: actorId || approvedBy };
  }
}
