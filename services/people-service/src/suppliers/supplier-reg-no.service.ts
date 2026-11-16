import { Injectable } from '@nestjs/common';
import { ConflictError, ValidationError } from '@galatura/platform-kit';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 22-character alphabet excluding I, O, Q, and L to avoid confusion with 1, 0, etc.
 */
export const REG_NO_ALPHABET = 'ABCDEFGHJKMNPRSTUVWXYZ';
const WEIGHTS = [7, 3, 1, 5, 2, 4];

export interface GeneratedRegNo {
  supplierRegNo: string;
  supplierRegNoNormalized: string;
  regYear: number;
  regSeq: number;
}

@Injectable()
export class SupplierRegNoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculates the check letter for a 6-digit numeric string (YYNNNN).
   */
  calculateCheckLetter(digits: string): string {
    if (!/^\d{6}$/.test(digits)) {
      throw new ValidationError(`Digits must be exactly 6 numeric characters, received "${digits}".`);
    }

    let sum = 0;
    for (let i = 0; i < 6; i++) {
      sum += parseInt(digits[i], 10) * WEIGHTS[i];
    }

    const index = sum % REG_NO_ALPHABET.length;
    return REG_NO_ALPHABET[index];
  }

  /**
   * Normalizes a typed registration number (uppercase, strips whitespace and dashes).
   */
  normalize(regNo: string): string {
    if (!regNo) return '';
    return regNo.trim().toUpperCase().replace(/[\s\-_]/g, '');
  }

  /**
   * Validates format and checksum letter of a supplier registration number.
   */
  validateRegNo(regNo: string): { valid: boolean; normalized: string; error?: string } {
    const normalized = this.normalize(regNo);

    if (normalized.length !== 7) {
      return { valid: false, normalized, error: 'Registration number must be exactly 7 characters (YYNNNNL).' };
    }

    const digits = normalized.slice(0, 6);
    const letter = normalized[6];

    if (!/^\d{6}$/.test(digits)) {
      return { valid: false, normalized, error: 'First 6 characters must be numeric digits.' };
    }

    if (!REG_NO_ALPHABET.includes(letter)) {
      return {
        valid: false,
        normalized,
        error: `Letter "${letter}" is not valid (letters I, O, Q, and L are not allowed).`,
      };
    }

    const expectedLetter = this.calculateCheckLetter(digits);
    if (letter !== expectedLetter) {
      return {
        valid: false,
        normalized,
        error: `Check letter mismatch. Expected "${expectedLetter}" for "${digits}", but got "${letter}".`,
      };
    }

    return { valid: true, normalized };
  }

  /**
   * Atomically generates the next unique supplier registration number (YYNNNNL).
   */
  async generateNext(txPrisma?: any, overrideYear?: number): Promise<GeneratedRegNo> {
    const client = txPrisma || this.prisma;
    const year = overrideYear !== undefined ? overrideYear : new Date().getFullYear() % 100;

    const sequence = await client.supplierRegSequence.upsert({
      where: { year },
      update: { lastSeq: { increment: 1 } },
      create: { year, lastSeq: 1 },
    });

    const seq = sequence.lastSeq;
    if (seq > 9999) {
      throw new ConflictError(`Supplier registration sequence exceeded annual capacity of 9999 for year ${year}.`);
    }

    const yearPrefix = year.toString().padStart(2, '0');
    const seqStr = seq.toString().padStart(4, '0');
    const digits = `${yearPrefix}${seqStr}`;
    const checkLetter = this.calculateCheckLetter(digits);
    const regNo = `${digits}${checkLetter}`;

    return {
      supplierRegNo: regNo,
      supplierRegNoNormalized: regNo,
      regYear: year,
      regSeq: seq,
    };
  }
}
