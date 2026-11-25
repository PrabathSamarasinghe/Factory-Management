require('reflect-metadata');

const { PrismaService } = require('../dist/prisma/prisma.service');
const { AuditService } = require('../dist/audit/audit.service');
const { OutboxService } = require('../dist/outbox/outbox.service');
const { AccountsService } = require('../dist/accounts/accounts.service');
const { JournalService } = require('../dist/journal/journal.service');

async function main() {
  const prisma = new PrismaService();
  try {
    const audit = new AuditService(prisma);
    const outbox = new OutboxService(prisma);
    const accounts = new AccountsService(prisma, audit, outbox);
    const journal = new JournalService(prisma, audit, outbox, accounts);
    const result = await journal.nightlyIntegrity();
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (!result.ok) process.exitCode = 1;
  } finally {
    await prisma.onModuleDestroy();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
