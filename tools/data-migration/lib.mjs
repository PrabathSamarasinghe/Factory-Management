import { createHash } from 'node:crypto';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NIC_PATTERN = /^(\d{9}[VX]|\d{12})$/;
const PHONE_PATTERN = /^(\+94|94|0)\d{9}$/;
const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ENVIRONMENTS = new Set(['staging', 'production']);
const PERSON_TYPES = new Set(['EMPLOYEE', 'SUPPLIER']);
const SENSITIVE_KEY_PATTERN =
  /nationalid|phone|fullname|preferredname|businessname|displayname|email|address|dateofbirth/i;
const REDACT_KEY_PATTERN = /nationalid|phone/i;
const MASK_KEY_PATTERN = /name/i;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidDate(value) {
  if (!isText(value) || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function parseCents(value) {
  const [whole, fraction = ''] = String(value).split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

function formatCents(cents) {
  const sign = cents < 0n ? '-' : '';
  const absolute = cents < 0n ? -cents : cents;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isObject(value)) {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        throw new Error('Sensitive fields cannot be used in generated keys.');
      }
      result[key] = canonicalize(value[key]);
    }
    return result;
  }
  return value;
}

export function stableKey(parts) {
  if (!Array.isArray(parts)) throw new Error('stableKey expects an array of parts.');
  const canonical = JSON.stringify(canonicalize(parts));
  return createHash('sha256').update(canonical).digest('hex');
}

export function validateManifest(manifest) {
  if (!isObject(manifest)) return { ok: false, errors: ['manifest must be an object.'] };

  const errors = [];
  if (manifest.version !== 1) errors.push('version must be 1.');
  if (!ENVIRONMENTS.has(manifest.environment)) {
    errors.push('environment must be staging or production.');
  }
  if (!isValidDate(manifest.asOfDate)) errors.push('asOfDate must be a valid YYYY-MM-DD date.');
  if (!Array.isArray(manifest.people) || manifest.people.length === 0) {
    errors.push('people must be a non-empty array.');
  }
  if (!Array.isArray(manifest.balances) || manifest.balances.length === 0) {
    errors.push('balances must be a non-empty array.');
  }

  const seenPeople = new Set();
  if (Array.isArray(manifest.people)) {
    manifest.people.forEach((person, index) => {
      const label = `people[${index}]`;
      if (!isObject(person)) {
        errors.push(`${label} must be an object.`);
        return;
      }
      if (!isText(person.externalId) || !UUID_PATTERN.test(person.externalId.trim())) {
        errors.push(`${label}.externalId must be a UUID.`);
      }
      if (!PERSON_TYPES.has(person.personType)) {
        errors.push(`${label}.personType must be EMPLOYEE or SUPPLIER.`);
      }
      if (person.code !== undefined && !isText(person.code)) {
        errors.push(`${label}.code must be a non-empty string when supplied.`);
      }
      if (!isText(person.fullName)) errors.push(`${label}.fullName is required.`);
      if (person.nationalId !== undefined) {
        if (
          typeof person.nationalId !== 'string' ||
          !NIC_PATTERN.test(person.nationalId.trim().toUpperCase())
        ) {
          errors.push(`${label}.nationalId has an invalid format.`);
        }
      }
      if (person.phonePrimary !== undefined) {
        if (
          typeof person.phonePrimary !== 'string' ||
          !PHONE_PATTERN.test(person.phonePrimary.trim())
        ) {
          errors.push(`${label}.phonePrimary has an invalid format.`);
        }
      }
      for (const field of ['employeeDetails', 'supplierDetails']) {
        if (person[field] !== undefined && !isObject(person[field])) {
          errors.push(`${label}.${field} must be an object when supplied.`);
        }
      }
      const identity = `${person.personType}:${String(person.externalId).toLowerCase().trim()}`;
      if (seenPeople.has(identity)) errors.push(`${label} duplicates externalId+personType.`);
      seenPeople.add(identity);
    });
  }

  let debitTotal = 0n;
  let creditTotal = 0n;
  if (Array.isArray(manifest.balances)) {
    manifest.balances.forEach((balance, index) => {
      const label = `balances[${index}]`;
      if (!isObject(balance)) {
        errors.push(`${label} must be an object.`);
        return;
      }
      if (!PERSON_TYPES.has(balance.partyType)) {
        errors.push(`${label}.partyType must be EMPLOYEE or SUPPLIER.`);
      }
      if (!isText(balance.externalId) || !UUID_PATTERN.test(balance.externalId.trim())) {
        errors.push(`${label}.externalId must be a UUID.`);
      }
      if (!isText(balance.accountCode)) errors.push(`${label}.accountCode is required.`);
      if (balance.description !== undefined && typeof balance.description !== 'string') {
        errors.push(`${label}.description must be a string when supplied.`);
      }

      const hasDebit = balance.debit !== undefined && balance.debit !== null;
      const hasCredit = balance.credit !== undefined && balance.credit !== null;
      if (hasDebit === hasCredit) {
        errors.push(`${label} must have exactly one of debit or credit.`);
      }
      for (const field of ['debit', 'credit']) {
        if (balance[field] === undefined || balance[field] === null) continue;
        const value = balance[field];
        if (typeof value !== 'string' || !MONEY_PATTERN.test(value.trim())) {
          errors.push(
            `${label}.${field} must be a non-negative decimal string with at most 2 places.`,
          );
        } else if (field === 'debit') {
          debitTotal += parseCents(value.trim());
        } else {
          creditTotal += parseCents(value.trim());
        }
      }
    });
  }

  if (debitTotal !== creditTotal) {
    errors.push(
      `balance totals must match: debit ${formatCents(debitTotal)} != credit ${formatCents(creditTotal)}.`,
    );
  }

  return { ok: errors.length === 0, errors };
}

export function buildPlan(manifest) {
  const validation = validateManifest(manifest);
  if (!validation.ok) throw new Error(`Invalid manifest: ${validation.errors.join(' ')}`);

  const { environment, asOfDate } = manifest;
  const personUpserts = manifest.people.map((person) => {
    const externalId = person.externalId.trim().toLowerCase();
    return {
      ...person,
      externalId,
      idempotencyKey: stableKey(['person', environment, asOfDate, externalId, person.personType]),
    };
  });

  const partyUpserts = manifest.people.map((person) => {
    const externalId = person.externalId.trim().toLowerCase();
    return {
      partyType: person.personType,
      externalId,
      displayName: person.fullName,
      ...(person.code === undefined ? {} : { code: person.code }),
      idempotencyKey: stableKey(['party', environment, asOfDate, externalId, person.personType]),
    };
  });

  const lines = manifest.balances.map((balance, index) => {
    const externalId = balance.externalId.trim().toLowerCase();
    return {
      accountCode: balance.accountCode.trim(),
      partyType: balance.partyType,
      externalId,
      debit: balance.debit === undefined || balance.debit === null ? '0.00' : balance.debit.trim(),
      credit:
        balance.credit === undefined || balance.credit === null ? '0.00' : balance.credit.trim(),
      ...(balance.description === undefined ? {} : { memo: balance.description }),
      idempotencyKey: stableKey([
        'opening-line',
        environment,
        asOfDate,
        externalId,
        balance.partyType,
        balance.accountCode.trim(),
        index,
      ]),
    };
  });

  return {
    version: 1,
    environment,
    asOfDate,
    personUpserts,
    partyUpserts,
    openingJournal: {
      entryDate: asOfDate,
      description: `Opening balances as of ${asOfDate}`,
      sourceType: 'OPENING',
      idempotencyKey: stableKey([
        'opening-journal',
        environment,
        asOfDate,
        lines.map((line) => line.idempotencyKey),
      ]),
      lines,
    },
  };
}

function redactValue(value) {
  if (Array.isArray(value)) return value.map(redactValue);
  if (isObject(value)) {
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      if (REDACT_KEY_PATTERN.test(key)) continue;
      result[key] = MASK_KEY_PATTERN.test(key) ? '***' : redactValue(item);
    }
    return result;
  }
  return value;
}

export function redactPerson(person) {
  return redactValue(person);
}

export function summarize(plan) {
  const lines = plan?.openingJournal?.lines ?? [];
  let debitTotal = 0n;
  let creditTotal = 0n;
  for (const line of lines) {
    debitTotal += parseCents(line.debit ?? '0.00');
    creditTotal += parseCents(line.credit ?? '0.00');
  }

  const countByType = (rows, field) =>
    rows.reduce((counts, row) => {
      const type = row[field];
      counts[type] = (counts[type] ?? 0) + 1;
      return counts;
    }, {});

  return {
    environment: plan?.environment ?? null,
    asOfDate: plan?.asOfDate ?? null,
    people: plan?.personUpserts?.length ?? 0,
    peopleByType: countByType(plan?.personUpserts ?? [], 'personType'),
    parties: plan?.partyUpserts?.length ?? 0,
    partiesByType: countByType(plan?.partyUpserts ?? [], 'partyType'),
    openingJournalLines: lines.length,
    debitTotal: formatCents(debitTotal),
    creditTotal: formatCents(creditTotal),
    balanced: debitTotal === creditTotal,
    idempotencyKeys: {
      people: (plan?.personUpserts ?? []).map((row) => row.idempotencyKey),
      parties: (plan?.partyUpserts ?? []).map((row) => row.idempotencyKey),
      openingJournal: plan?.openingJournal?.idempotencyKey ?? null,
    },
  };
}

export function parseArgs(argv = process.argv.slice(2)) {
  const valueFlags = new Map([
    ['--manifest', 'manifest'],
    ['--people-url', 'peopleUrl'],
    ['--accounts-url', 'accountsUrl'],
    ['--token-env', 'tokenEnv'],
    ['--out', 'out'],
  ]);
  const booleanFlags = new Map([
    ['--validate', 'validate'],
    ['--dry-run', 'dryRun'],
    ['--apply', 'apply'],
    ['--json', 'json'],
  ]);
  const options = {
    manifest: undefined,
    validate: false,
    dryRun: false,
    apply: false,
    peopleUrl: undefined,
    accountsUrl: undefined,
    tokenEnv: undefined,
    json: false,
    out: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const separator = token.indexOf('=');
    const flag = separator === -1 ? token : token.slice(0, separator);
    const inline = separator === -1 ? undefined : token.slice(separator + 1);

    if (valueFlags.has(flag)) {
      const value = inline ?? argv[++index];
      if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) {
        throw new Error(`${flag} requires a value.`);
      }
      options[valueFlags.get(flag)] = value;
      continue;
    }
    if (booleanFlags.has(flag)) {
      if (inline !== undefined) throw new Error(`${flag} does not take a value.`);
      options[booleanFlags.get(flag)] = true;
      continue;
    }
    throw new Error(`Unknown argument: ${flag}`);
  }

  if (options.apply && options.dryRun) {
    throw new Error('--apply and --dry-run are mutually exclusive.');
  }
  options.validate = options.validate || (!options.apply && !options.dryRun);
  return options;
}
