import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError, ValidationError } from '@galatura/platform-kit';
import { PersonsService } from '../src/persons/persons.service';
import { EncryptionService } from '../src/crypto/encryption.service';
import { SupplierRegNoService } from '../src/suppliers/supplier-reg-no.service';
import { PaymentMethod, PersonStatus, PersonType } from '../generated/prisma';

function buildPrisma() {
  const people = new Map<string, any>();
  const employees = new Map<string, any>();
  const staff = new Map<string, any>();
  const suppliers = new Map<string, any>();
  const admins = new Map<string, any>();
  const changeLog: any[] = [];

  const attach = (person: any) => ({
    ...person,
    employeeDetails: employees.get(person.id) ?? null,
    staffDetails: staff.get(person.id) ?? null,
    supplierDetails: suppliers.get(person.id) ?? null,
    adminDetails: admins.get(person.id) ?? null,
    bankAccounts: [],
    documents: [],
    consents: [],
  });

  const prisma: any = {
    person: {
      count: async () => people.size,
      findUnique: async (args: any) => {
        if (args.where.id) {
          const found = people.get(args.where.id);
          return found ? attach(found) : null;
        }
        if (args.where.code) {
          return [...people.values()].find((p) => p.code === args.where.code) ?? null;
        }
        return null;
      },
      findFirst: async (args: any) => {
        if (args.where.nationalIdHash) {
          return (
            [...people.values()].find(
              (p) => p.nationalIdHash === args.where.nationalIdHash && p.deletedAt === null,
            ) ?? null
          );
        }
        return null;
      },
      findMany: async () => [...people.values()].map(attach),
      create: async (args: any) => {
        const row = { ...args.data, deletedAt: null };
        people.set(row.id, row);
        return row;
      },
      update: async (args: any) => {
        const row = { ...people.get(args.where.id), ...args.data };
        people.set(args.where.id, row);
        return row;
      },
    },
    employeeDetails: {
      create: async (args: any) => {
        employees.set(args.data.personId, args.data);
        return args.data;
      },
      update: async (args: any) => {
        const row = { ...employees.get(args.where.personId), ...args.data };
        employees.set(args.where.personId, row);
        return row;
      },
    },
    staffDetails: {
      create: async (args: any) => {
        staff.set(args.data.personId, args.data);
        return args.data;
      },
      update: async (args: any) => {
        const row = { ...staff.get(args.where.personId), ...args.data };
        staff.set(args.where.personId, row);
        return row;
      },
    },
    supplierDetails: {
      create: async (args: any) => {
        suppliers.set(args.data.personId, args.data);
        return args.data;
      },
      update: async (args: any) => {
        const row = { ...suppliers.get(args.where.personId), ...args.data };
        suppliers.set(args.where.personId, row);
        return row;
      },
      findUnique: async (args: any) => {
        const rows = [...suppliers.values()];
        const match = args.where.barcodeValue
          ? rows.find((s) => s.barcodeValue === args.where.barcodeValue)
          : rows.find((s) => s.supplierRegNoNormalized === args.where.supplierRegNoNormalized);
        if (!match) return null;
        return { ...match, person: people.get(match.personId) };
      },
      findMany: async () =>
        [...suppliers.values()].map((s) => ({
          ...s,
          person: people.get(s.personId),
        })),
    },
    adminDetails: {
      create: async (args: any) => {
        admins.set(args.data.personId, args.data);
        return args.data;
      },
      update: async (args: any) => {
        const row = { ...admins.get(args.where.personId), ...args.data };
        admins.set(args.where.personId, row);
        return row;
      },
    },
    personChangeLog: {
      create: async (args: any) => {
        changeLog.push(args.data);
        return args.data;
      },
      findMany: async () => changeLog,
    },
    supplierRegSequence: {
      upsert: async (args: any) => {
        const year = args.where.year;
        const last = prisma.__sequences.get(year) ?? 0;
        const next = last + 1;
        prisma.__sequences.set(year, next);
        return { year, lastSeq: next };
      },
    },
    __sequences: new Map<number, number>(),
    __people: people,
    __changeLog: changeLog,
    $transaction: async (fn: any) => fn(prisma),
  };

  return prisma;
}

describe('PersonsService', () => {
  let service: PersonsService;
  let prisma: any;
  let encryption: EncryptionService;

  beforeEach(() => {
    prisma = buildPrisma();
    encryption = new EncryptionService();
    const regNo = new SupplierRegNoService(prisma);
    service = new PersonsService(prisma, encryption, regNo);
  });

  it('registers an employee with auto-generated code and employee details', async () => {
    const person = await service.createPerson({
      personType: PersonType.EMPLOYEE,
      fullName: 'Nimal Perera',
      employeeDetails: {
        department: 'Field',
        designation: 'Plucker',
        employmentType: 'PERMANENT',
        joinDate: '2025-01-15',
        wageType: 'DAILY' as any,
        baseRate: 1500,
      },
    });

    expect(person.code).toBe('EMP-0001');
    expect(person.personType).toBe(PersonType.EMPLOYEE);
    expect(person.status).toBe(PersonStatus.ACTIVE);
    expect(person.employeeDetails?.designation).toBe('Plucker');
    expect(prisma.__changeLog).toHaveLength(1);
  });

  it('registers a supplier and generates a valid YYNNNNL registration number', async () => {
    const person = await service.createPerson({
      personType: PersonType.SUPPLIER,
      fullName: 'Sunil Silva',
      phonePrimary: '0712345678',
      supplierDetails: {
        estateName: 'Green Estate',
        collectionPoint: 'CP-1',
        paymentMethod: PaymentMethod.BANK,
      },
    });

    const supplier = person.supplierDetails;
    expect(supplier).toBeTruthy();
    expect(supplier.supplierRegNo).toMatch(/^\d{6}[A-Z]$/);
    expect(supplier.supplierRegNoNormalized).toBe(supplier.supplierRegNo);
    expect(supplier.supplierCode).toBe(`SUP-${supplier.supplierRegNo}`);
    expect(supplier.barcodeValue).toBe(supplier.supplierRegNo);
    expect(supplier.regSeq).toBe(1);
  });

  it('encrypts the national id and stores a blind index', async () => {
    const person = await service.createPerson({
      personType: PersonType.ADMIN,
      fullName: 'Admin User',
      nationalId: '199012345678',
      adminDetails: { adminLevel: 'FACTORY', department: 'Ops' },
    });

    const stored = prisma.__people.get(person.id);
    expect(stored.nationalIdEnc).toBeTruthy();
    expect(stored.nationalIdEnc).not.toBe('199012345678');
    expect(stored.nationalIdHash).toBe(encryption.computeBlindIndex('199012345678'));
    expect(person.nationalId).toBe('********XXXX');
  });

  it('reveals the decrypted national id only when explicitly allowed', async () => {
    const person = await service.createPerson({
      personType: PersonType.ADMIN,
      fullName: 'Admin User',
      nationalId: '199012345678',
      adminDetails: { adminLevel: 'FACTORY' },
    });

    const sensitive = await service.getPersonById(person.id, true);
    expect(sensitive.nationalId).toBe('199012345678');
  });

  it('rejects a duplicate national id', async () => {
    await service.createPerson({
      personType: PersonType.ADMIN,
      fullName: 'Admin One',
      nationalId: '199012345678',
      adminDetails: { adminLevel: 'FACTORY' },
    });

    await expect(
      service.createPerson({
        personType: PersonType.ADMIN,
        fullName: 'Admin Two',
        nationalId: '199012345678',
        adminDetails: { adminLevel: 'FACTORY' },
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('rejects invalid NIC during registration', async () => {
    await expect(
      service.createPerson({
        personType: PersonType.ADMIN,
        fullName: 'Bad NIC',
        nationalId: 'invalid',
        adminDetails: { adminLevel: 'FACTORY' },
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('looks up a supplier by registration number (normalised)', async () => {
    const person = await service.createPerson({
      personType: PersonType.SUPPLIER,
      fullName: 'Sunil Silva',
      supplierDetails: { estateName: 'Green Estate' },
    });
    const regNo = person.supplierDetails.supplierRegNo;

    const found = await service.getSupplierByRegNo(
      ` ${regNo.slice(0, 3)}-${regNo.slice(3)} `.toLowerCase(),
    );
    expect(found.personId).toBe(person.id);

    await expect(service.getSupplierByRegNo('26-0000A')).rejects.toThrow(ValidationError);
  });

  it('looks up a supplier by barcode and errors when unknown', async () => {
    const person = await service.createPerson({
      personType: PersonType.SUPPLIER,
      fullName: 'Sunil Silva',
      supplierDetails: { estateName: 'Green Estate' },
    });
    const barcode = person.supplierDetails.barcodeValue;

    const found = await service.getSupplierByBarcode(barcode);
    expect(found.personId).toBe(person.id);

    await expect(service.getSupplierByBarcode('UNKNOWN')).rejects.toThrow(NotFoundError);
  });

  it('returns suppliers for the offline master-data delta download', async () => {
    await service.createPerson({
      personType: PersonType.SUPPLIER,
      fullName: 'Sunil Silva',
      phonePrimary: '0712345678',
      supplierDetails: { estateName: 'Green Estate', collectionPoint: 'CP-1' },
    });

    const rows = await service.getMasterDataSuppliers();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      fullName: 'Sunil Silva',
      phonePrimary: '0712345678',
      collectionPoint: 'CP-1',
    });
    expect(rows[0].supplierRegNo).toMatch(/^\d{6}[A-Z]$/);
  });

  it('paginates the person list', async () => {
    await service.createPerson({
      personType: PersonType.ADMIN,
      fullName: 'Admin One',
      adminDetails: { adminLevel: 'FACTORY' },
    });

    const result = await service.listPersons({ page: 1, limit: 10 });
    expect(result.data).toHaveLength(1);
    expect(result.page.total).toBe(1);
    expect(result.page.current).toBe(1);
  });

  it('updates status and records a change-log entry', async () => {
    const person = await service.createPerson({
      personType: PersonType.ADMIN,
      fullName: 'Admin One',
      adminDetails: { adminLevel: 'FACTORY' },
    });

    const updated = await service.updateStatus(person.id, PersonStatus.SUSPENDED, 'user-1');
    expect(updated.status).toBe(PersonStatus.SUSPENDED);
    const logs = prisma.__changeLog;
    expect(logs[logs.length - 1]).toMatchObject({
      field: 'status',
      oldValueMasked: PersonStatus.ACTIVE,
      newValueMasked: PersonStatus.SUSPENDED,
      changedBy: 'user-1',
    });
  });
});
