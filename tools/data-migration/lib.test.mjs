import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPlan,
  parseArgs,
  redactPerson,
  stableKey,
  summarize,
  validateManifest,
} from './lib.mjs';

const SUPPLIER_ID = '00000000-0000-4000-8000-000000000001';
const EMPLOYEE_ID = '00000000-0000-4000-8000-000000000002';

function validManifest() {
  return {
    version: 1,
    environment: 'staging',
    asOfDate: '2026-11-30',
    people: [
      {
        externalId: SUPPLIER_ID,
        personType: 'SUPPLIER',
        code: 'LEGACY-S-1',
        fullName: 'Example Supplier',
        supplierDetails: { smsPhone: '0770000000' },
      },
      {
        externalId: EMPLOYEE_ID,
        personType: 'EMPLOYEE',
        code: 'LEGACY-E-1',
        fullName: 'Example Employee',
        nationalId: '123456789V',
        phonePrimary: '0770000000',
      },
    ],
    balances: [
      {
        partyType: 'SUPPLIER',
        externalId: SUPPLIER_ID,
        accountCode: '1100',
        debit: '100.00',
      },
      {
        partyType: 'EMPLOYEE',
        externalId: EMPLOYEE_ID,
        accountCode: '2010',
        credit: '100.00',
      },
    ],
  };
}

describe('validateManifest', () => {
  it('accepts a valid manifest', () => {
    const result = validateManifest(validManifest());
    assert.deepEqual(result, { ok: true, errors: [] });
  });

  it('rejects missing and malformed fields without echoing values', () => {
    const manifest = validManifest();
    manifest.version = 2;
    manifest.environment = 'development';
    manifest.asOfDate = '2026-13-40';
    delete manifest.people[0].fullName;
    manifest.people[1].externalId = 'not-a-uuid';
    manifest.people[1].nationalId = 'bad';
    manifest.people[1].phonePrimary = '12345';
    manifest.balances[0].accountCode = '';

    const result = validateManifest(manifest);
    assert.equal(result.ok, false);
    for (const label of [
      'version',
      'environment',
      'asOfDate',
      'people[0].fullName',
      'people[1].externalId',
      'people[1].nationalId',
      'people[1].phonePrimary',
      'balances[0].accountCode',
    ]) {
      assert.ok(
        result.errors.some((error) => error.includes(label)),
        `expected an error for ${label}`,
      );
    }
    assert.ok(!result.errors.some((error) => error.includes('Example Employee')));
    assert.ok(!result.errors.some((error) => error.includes('123456789V')));
  });

  it('requires exactly one non-negative decimal amount per balance', () => {
    const manifest = validManifest();
    delete manifest.balances[1].credit;
    assert.ok(
      validateManifest(manifest).errors.some((error) =>
        error.includes('exactly one of debit or credit'),
      ),
    );

    manifest.balances[1].credit = '100.00';
    manifest.balances[1].debit = '10.00';
    assert.ok(
      validateManifest(manifest).errors.some((error) =>
        error.includes('exactly one of debit or credit'),
      ),
    );

    delete manifest.balances[1].debit;
    manifest.balances[1].credit = '100.001';
    assert.ok(
      validateManifest(manifest).errors.some((error) => error.includes('at most 2 places')),
    );

    manifest.balances[1].credit = '-100.00';
    assert.ok(validateManifest(manifest).errors.some((error) => error.includes('non-negative')));
  });

  it('requires balanced debit and credit totals', () => {
    const manifest = validManifest();
    assert.equal(validateManifest(manifest).ok, true);
    manifest.balances[1].credit = '100.01';
    const result = validateManifest(manifest);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes('balance totals must match')));
  });

  it('detects duplicate externalId and personType pairs', () => {
    const manifest = validManifest();
    manifest.people.push({ ...manifest.people[0], fullName: 'Other Name' });
    const result = validateManifest(manifest);
    assert.ok(result.errors.some((error) => error.includes('duplicates externalId+personType')));
  });
});

describe('stableKey', () => {
  it('hashes canonical JSON deterministically', () => {
    assert.equal(stableKey([{ b: 2, a: 1 }, 'x']), stableKey([{ a: 1, b: 2 }, 'x']));
    assert.notEqual(stableKey(['a']), stableKey(['b']));
    assert.match(stableKey(['a']), /^[0-9a-f]{64}$/);
  });

  it('refuses PII-bearing parts', () => {
    assert.throws(
      () => stableKey([{ fullName: 'Example Employee' }]),
      /Sensitive fields cannot be used/,
    );
    assert.throws(() => stableKey([{ nationalId: '123456789V' }]), /Sensitive fields/);
  });
});

describe('redactPerson', () => {
  it('removes identity and phone fields and masks names recursively', () => {
    const person = validManifest().people[1];
    person.supplierDetails = { smsPhone: '0770000000', businessName: 'Example Business' };
    const redacted = redactPerson(person);

    assert.equal(redacted.fullName, '***');
    assert.equal(redacted.supplierDetails.businessName, '***');
    assert.ok(!('nationalId' in redacted));
    assert.ok(!('phonePrimary' in redacted));
    assert.ok(!('smsPhone' in redacted.supplierDetails));
    assert.equal(redacted.personType, 'EMPLOYEE');
    assert.equal(person.fullName, 'Example Employee');
  });
});

describe('buildPlan and summarize', () => {
  it('builds person, party and journal steps with stable PII-free keys', () => {
    const manifest = validManifest();
    const plan = buildPlan(manifest);

    assert.equal(plan.personUpserts.length, 2);
    assert.equal(plan.partyUpserts.length, 2);
    assert.equal(plan.openingJournal.lines.length, 2);
    assert.equal(plan.openingJournal.entryDate, manifest.asOfDate);
    assert.equal(plan.partyUpserts[0].displayName, manifest.people[0].fullName);
    assert.equal(plan.openingJournal.lines[0].debit, '100.00');
    assert.equal(plan.openingJournal.lines[1].debit, '0.00');

    const changedName = validManifest();
    changedName.people[0].fullName = 'Completely Different Name';
    const otherPlan = buildPlan(changedName);
    assert.deepEqual(
      plan.personUpserts[0].idempotencyKey,
      otherPlan.personUpserts[0].idempotencyKey,
    );
    assert.deepEqual(plan.openingJournal.idempotencyKey, otherPlan.openingJournal.idempotencyKey);

    const summary = summarize(plan);
    assert.equal(summary.people, 2);
    assert.equal(summary.parties, 2);
    assert.equal(summary.openingJournalLines, 2);
    assert.equal(summary.debitTotal, '100.00');
    assert.equal(summary.creditTotal, '100.00');
    assert.equal(summary.balanced, true);
    assert.equal(JSON.stringify(summary).includes('Example Employee'), false);
  });

  it('throws for an invalid manifest', () => {
    assert.throws(() => buildPlan({ version: 1 }), /Invalid manifest/);
  });
});

describe('parseArgs', () => {
  it('defaults to validate mode and maps flag names', () => {
    const options = parseArgs(['--manifest', 'migration.json']);
    assert.equal(options.manifest, 'migration.json');
    assert.equal(options.validate, true);
    assert.equal(options.dryRun, false);
    assert.equal(options.apply, false);
    assert.equal(options.json, false);
  });

  it('parses value flags with inline values and booleans', () => {
    const options = parseArgs([
      '--apply',
      '--people-url=https://people.example',
      '--accounts-url',
      'https://accounts.example',
      '--token-env=MIGRATION_TOKEN',
      '--json',
      '--out=result.json',
    ]);
    assert.equal(options.apply, true);
    assert.equal(options.validate, false);
    assert.equal(options.peopleUrl, 'https://people.example');
    assert.equal(options.accountsUrl, 'https://accounts.example');
    assert.equal(options.tokenEnv, 'MIGRATION_TOKEN');
    assert.equal(options.json, true);
    assert.equal(options.out, 'result.json');
  });

  it('rejects unknown, missing and conflicting arguments', () => {
    assert.throws(() => parseArgs(['--unknown']), /Unknown argument/);
    assert.throws(() => parseArgs(['--manifest']), /requires a value/);
    assert.throws(() => parseArgs(['--json=true']), /does not take a value/);
    assert.throws(() => parseArgs(['--apply', '--dry-run']), /mutually exclusive/);
  });
});
