import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, ValidationError } from '@galatura/platform-kit';
import { REG_NO_ALPHABET, SupplierRegNoService } from '../src/suppliers/supplier-reg-no.service';

describe('SupplierRegNoService', () => {
  let service: SupplierRegNoService;
  let sequences: Map<number, number>;
  let mockPrisma: any;

  beforeEach(() => {
    sequences = new Map();
    mockPrisma = {
      supplierRegSequence: {
        upsert: async (args: any) => {
          const year = args.where.year;
          const current = sequences.get(year) ?? 0;
          const next = current + 1;
          sequences.set(year, next);
          return { year, lastSeq: next };
        },
      },
    };
    service = new SupplierRegNoService(mockPrisma);
  });

  it('computes a deterministic check letter from the alphabet without I/O/Q/L', () => {
    const letterA = service.calculateCheckLetter('260554');
    const letterB = service.calculateCheckLetter('260554');
    expect(letterA).toBe(letterB);
    expect(REG_NO_ALPHABET).not.toMatch(/[IOQL]/);
    expect(REG_NO_ALPHABET).toContain(letterA);
  });

  it('rejects check letter calculation for non 6-digit input', () => {
    expect(() => service.calculateCheckLetter('12345')).toThrow(ValidationError);
    expect(() => service.calculateCheckLetter('abcdef')).toThrow(ValidationError);
  });

  it('normalises typed registration numbers', () => {
    expect(service.normalize(' 26-0554 x ')).toBe('260554X');
    expect(service.normalize('260554x')).toBe('260554X');
    expect(service.normalize('')).toBe('');
  });

  it('validates a well-formed registration number', () => {
    const letter = service.calculateCheckLetter('260554');
    const result = service.validateRegNo(`26-0554${letter.toLowerCase()}`);
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe(`260554${letter}`);
  });

  it('rejects wrong length, non-numeric prefix and bad check letter', () => {
    const letter = service.calculateCheckLetter('260554');
    expect(service.validateRegNo('260554').valid).toBe(false);
    expect(service.validateRegNo('26A554' + letter).valid).toBe(false);

    const badLetter = letter === 'A' ? 'B' : 'A';
    const wrongChecksum = service.validateRegNo(`260554${badLetter}`);
    expect(wrongChecksum.valid).toBe(false);
    expect(wrongChecksum.error).toContain('Check letter mismatch');
  });

  it('rejects disallowed letters such as I, O, Q and L', () => {
    for (const letter of ['I', 'O', 'Q', 'L']) {
      const result = service.validateRegNo(`260554${letter}`);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not valid');
    }
  });

  it('generates sequential YYNNNNL numbers per year', async () => {
    const first = await service.generateNext(undefined, 26);
    const second = await service.generateNext(undefined, 26);

    expect(first.regSeq).toBe(1);
    expect(first.supplierRegNo).toBe(`260001${service.calculateCheckLetter('260001')}`);
    expect(second.regSeq).toBe(2);
    expect(second.supplierRegNo).toBe(`260002${service.calculateCheckLetter('260002')}`);
    expect(first.supplierRegNoNormalized).toBe(first.supplierRegNo);
    expect(service.validateRegNo(first.supplierRegNo).valid).toBe(true);
  });

  it('keeps separate sequences per year', async () => {
    const y25 = await service.generateNext(undefined, 25);
    const y26 = await service.generateNext(undefined, 26);
    expect(y25.regYear).toBe(25);
    expect(y26.regYear).toBe(26);
    expect(y25.regSeq).toBe(1);
    expect(y26.regSeq).toBe(1);
  });

  it('throws when the annual sequence is exhausted', async () => {
    sequences.set(26, 9999);
    await expect(service.generateNext(undefined, 26)).rejects.toThrow(ConflictError);
  });
});
