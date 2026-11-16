import { Injectable } from '@nestjs/common';
import { ConflictError, NotFoundError, ValidationError, uuidv7 } from '@galatura/platform-kit';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../crypto/encryption.service';
import { SupplierRegNoService } from '../suppliers/supplier-reg-no.service';
import { assertValidPersonInputs } from './nic-validator';
import {
  PersonStatus,
  PersonType,
  WageType,
  StaffRole,
  PaymentMethod,
} from '../../generated/prisma';

export interface CreateEmployeeInput {
  department: string;
  designation: string;
  employmentType: string;
  joinDate: string;
  endDate?: string;
  epfNo?: string;
  etfNo?: string;
  wageType: WageType;
  baseRate: number;
  shiftId?: string;
  supervisorPersonId?: string;
}

export interface CreateStaffInput {
  staffRole: StaffRole;
  designation: string;
  joinDate: string;
  endDate?: string;
  epfNo?: string;
  etfNo?: string;
  monthlySalary: number;
  drivingLicenceNo?: string;
  licenceExpiry?: string;
  licenceClasses?: string[];
}

export interface CreateSupplierInput {
  businessName?: string;
  businessRegNo?: string;
  landAreaAcres?: number;
  estateName?: string;
  collectionPoint?: string;
  routeId?: string;
  gpsLat?: number;
  gpsLng?: number;
  teaVariety?: string;
  paymentMethod?: PaymentMethod;
  smsOptIn?: boolean;
  smsPhone?: string;
  joinedOn?: string;
  contractRef?: string;
  barcodeValue?: string;
}

export interface CreateAdminInput {
  adminLevel: string;
  department?: string;
}

export interface CreatePersonInput {
  personType: PersonType;
  code?: string;
  fullName: string;
  preferredName?: string;
  gender?: string;
  dateOfBirth?: string;
  nationalId?: string;
  phonePrimary?: string;
  phoneSecondary?: string;
  email?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  district?: string;
  postalCode?: string;
  photoObjectKey?: string;
  userId?: string;

  employeeDetails?: CreateEmployeeInput;
  staffDetails?: CreateStaffInput;
  supplierDetails?: CreateSupplierInput;
  adminDetails?: CreateAdminInput;
}

export interface UpdatePersonInput {
  fullName?: string;
  preferredName?: string;
  gender?: string;
  dateOfBirth?: string;
  phonePrimary?: string;
  phoneSecondary?: string;
  email?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  district?: string;
  postalCode?: string;
  photoObjectKey?: string;
  userId?: string;

  employeeDetails?: Partial<CreateEmployeeInput>;
  staffDetails?: Partial<CreateStaffInput>;
  supplierDetails?: Partial<CreateSupplierInput>;
  adminDetails?: Partial<CreateAdminInput>;
}

export interface ListPersonsQuery {
  type?: PersonType;
  status?: PersonStatus;
  q?: string;
  routeId?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class PersonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly supplierRegNoService: SupplierRegNoService,
  ) {}

  async createPerson(input: CreatePersonInput, creatorId?: string) {
    assertValidPersonInputs({
      nationalId: input.nationalId,
      phonePrimary: input.phonePrimary,
      phoneSecondary: input.phoneSecondary,
    });

    let nationalIdEnc: string | null = null;
    let nationalIdHash: string | null = null;

    if (input.nationalId) {
      const cleanNic = input.nationalId.trim().toUpperCase();
      nationalIdHash = this.encryption.computeBlindIndex(cleanNic);
      nationalIdEnc = await this.encryption.encrypt(cleanNic);

      const existing = await this.prisma.person.findFirst({
        where: { nationalIdHash, deletedAt: null },
      });
      if (existing) {
        throw new ConflictError('A person with this National ID already exists.');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const personId = uuidv7();

      let code = input.code;
      if (!code) {
        const count = await tx.person.count({
          where: { personType: input.personType },
        });
        const prefix =
          input.personType === PersonType.EMPLOYEE
            ? 'EMP'
            : input.personType === PersonType.STAFF
              ? 'STF'
              : input.personType === PersonType.SUPPLIER
                ? 'SUP'
                : 'ADM';
        code = `${prefix}-${(count + 1).toString().padStart(4, '0')}`;
      }

      // Check code uniqueness
      const existingCode = await tx.person.findUnique({ where: { code } });
      if (existingCode) {
        throw new ConflictError(`Person code "${code}" already exists.`);
      }

      const person = await tx.person.create({
        data: {
          id: personId,
          personType: input.personType,
          code,
          fullName: input.fullName,
          preferredName: input.preferredName,
          gender: input.gender,
          dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
          nationalIdEnc,
          nationalIdHash,
          phonePrimary: input.phonePrimary,
          phoneSecondary: input.phoneSecondary,
          email: input.email,
          addressLine1: input.addressLine1,
          addressLine2: input.addressLine2,
          city: input.city,
          district: input.district,
          postalCode: input.postalCode,
          photoObjectKey: input.photoObjectKey,
          userId: input.userId,
          status: PersonStatus.ACTIVE,
        },
      });

      if (input.personType === PersonType.EMPLOYEE && input.employeeDetails) {
        await tx.employeeDetails.create({
          data: {
            personId,
            department: input.employeeDetails.department,
            designation: input.employeeDetails.designation,
            employmentType: input.employeeDetails.employmentType,
            joinDate: new Date(input.employeeDetails.joinDate),
            endDate: input.employeeDetails.endDate ? new Date(input.employeeDetails.endDate) : null,
            epfNo: input.employeeDetails.epfNo,
            etfNo: input.employeeDetails.etfNo,
            wageType: input.employeeDetails.wageType,
            baseRate: input.employeeDetails.baseRate,
            shiftId: input.employeeDetails.shiftId,
            supervisorPersonId: input.employeeDetails.supervisorPersonId,
          },
        });
      } else if (input.personType === PersonType.STAFF && input.staffDetails) {
        let drivingLicenceNoEnc: string | null = null;
        if (input.staffDetails.drivingLicenceNo) {
          drivingLicenceNoEnc = await this.encryption.encrypt(input.staffDetails.drivingLicenceNo);
        }
        await tx.staffDetails.create({
          data: {
            personId,
            staffRole: input.staffDetails.staffRole,
            designation: input.staffDetails.designation,
            joinDate: new Date(input.staffDetails.joinDate),
            endDate: input.staffDetails.endDate ? new Date(input.staffDetails.endDate) : null,
            epfNo: input.staffDetails.epfNo,
            etfNo: input.staffDetails.etfNo,
            monthlySalary: input.staffDetails.monthlySalary,
            drivingLicenceNoEnc,
            licenceExpiry: input.staffDetails.licenceExpiry
              ? new Date(input.staffDetails.licenceExpiry)
              : null,
            licenceClasses: input.staffDetails.licenceClasses || [],
          },
        });
      } else if (input.personType === PersonType.SUPPLIER) {
        const details = input.supplierDetails || {};
        const generatedReg = await this.supplierRegNoService.generateNext(tx);

        const barcodeValue = details.barcodeValue || generatedReg.supplierRegNo;
        const supplierCode = `SUP-${generatedReg.supplierRegNo}`;

        await tx.supplierDetails.create({
          data: {
            personId,
            supplierRegNo: generatedReg.supplierRegNo,
            supplierRegNoNormalized: generatedReg.supplierRegNoNormalized,
            regYear: generatedReg.regYear,
            regSeq: generatedReg.regSeq,
            supplierCode,
            barcodeValue,
            businessName: details.businessName,
            businessRegNo: details.businessRegNo,
            landAreaAcres: details.landAreaAcres,
            estateName: details.estateName,
            collectionPoint: details.collectionPoint,
            routeId: details.routeId,
            gpsLat: details.gpsLat,
            gpsLng: details.gpsLng,
            teaVariety: details.teaVariety,
            paymentMethod: details.paymentMethod || PaymentMethod.BANK,
            smsOptIn: details.smsOptIn ?? true,
            smsPhone: details.smsPhone || input.phonePrimary,
            joinedOn: details.joinedOn ? new Date(details.joinedOn) : new Date(),
            contractRef: details.contractRef,
          },
        });
      } else if (input.personType === PersonType.ADMIN && input.adminDetails) {
        await tx.adminDetails.create({
          data: {
            personId,
            adminLevel: input.adminDetails.adminLevel,
            department: input.adminDetails.department,
          },
        });
      }

      await tx.personChangeLog.create({
        data: {
          id: uuidv7(),
          personId,
          field: 'person_created',
          oldValueMasked: null,
          newValueMasked: `${input.personType}: ${input.fullName} (${code})`,
          changedBy: creatorId || null,
        },
      });

      return this.getPersonById(personId, false, tx);
    });
  }

  async getPersonById(personId: string, canReadSensitive = false, txPrisma?: any) {
    const client = txPrisma || this.prisma;
    const person = await client.person.findUnique({
      where: { id: personId },
      include: {
        employeeDetails: true,
        staffDetails: true,
        supplierDetails: true,
        adminDetails: true,
        bankAccounts: { where: { status: 'VERIFIED' } },
        documents: true,
        consents: true,
      },
    });

    if (!person || person.deletedAt) {
      throw new NotFoundError(`Person with ID "${personId}" not found.`);
    }

    let nationalId: string | undefined;
    if (canReadSensitive && person.nationalIdEnc) {
      nationalId = await this.encryption.decrypt(person.nationalIdEnc);
    } else if (person.nationalIdEnc) {
      nationalId = this.encryption.maskSensitive('XXXXXXXXXXXX');
    }

    let drivingLicenceNo: string | undefined;
    if (canReadSensitive && person.staffDetails?.drivingLicenceNoEnc) {
      drivingLicenceNo = await this.encryption.decrypt(person.staffDetails.drivingLicenceNoEnc);
    }

    return {
      ...person,
      nationalId,
      staffDetails: person.staffDetails
        ? {
            ...person.staffDetails,
            drivingLicenceNo,
          }
        : null,
    };
  }

  async listPersons(query: ListPersonsQuery) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 20;
    const skip = (page - 1) * limit;

    const where: any = { deletedAt: null };

    if (query.type) {
      where.personType = query.type;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.q) {
      where.OR = [
        { fullName: { contains: query.q, mode: 'insensitive' } },
        { preferredName: { contains: query.q, mode: 'insensitive' } },
        { code: { contains: query.q, mode: 'insensitive' } },
        { phonePrimary: { contains: query.q } },
      ];
    }
    if (query.routeId) {
      where.supplierDetails = { routeId: query.routeId };
    }

    const [total, data] = await Promise.all([
      this.prisma.person.count({ where }),
      this.prisma.person.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          employeeDetails: true,
          staffDetails: true,
          supplierDetails: true,
          adminDetails: true,
        },
      }),
    ]);

    return {
      data,
      page: {
        current: page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updatePerson(personId: string, input: UpdatePersonInput, updaterId?: string) {
    const person = await this.prisma.person.findUnique({
      where: { id: personId, deletedAt: null },
      include: {
        employeeDetails: true,
        staffDetails: true,
        supplierDetails: true,
        adminDetails: true,
      },
    });
    if (!person) throw new NotFoundError(`Person ${personId} not found.`);

    assertValidPersonInputs({
      phonePrimary: input.phonePrimary,
      phoneSecondary: input.phoneSecondary,
    });

    return this.prisma.$transaction(async (tx) => {
      await tx.person.update({
        where: { id: personId },
        data: {
          fullName: input.fullName,
          preferredName: input.preferredName,
          gender: input.gender,
          dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
          phonePrimary: input.phonePrimary,
          phoneSecondary: input.phoneSecondary,
          email: input.email,
          addressLine1: input.addressLine1,
          addressLine2: input.addressLine2,
          city: input.city,
          district: input.district,
          postalCode: input.postalCode,
          photoObjectKey: input.photoObjectKey,
          userId: input.userId,
        },
      });

      if (person.personType === PersonType.EMPLOYEE && input.employeeDetails) {
        await tx.employeeDetails.update({
          where: { personId },
          data: {
            department: input.employeeDetails.department,
            designation: input.employeeDetails.designation,
            employmentType: input.employeeDetails.employmentType,
            joinDate: input.employeeDetails.joinDate
              ? new Date(input.employeeDetails.joinDate)
              : undefined,
            endDate: input.employeeDetails.endDate
              ? new Date(input.employeeDetails.endDate)
              : undefined,
            epfNo: input.employeeDetails.epfNo,
            etfNo: input.employeeDetails.etfNo,
            wageType: input.employeeDetails.wageType,
            baseRate: input.employeeDetails.baseRate,
            shiftId: input.employeeDetails.shiftId,
            supervisorPersonId: input.employeeDetails.supervisorPersonId,
          },
        });
      } else if (person.personType === PersonType.SUPPLIER && input.supplierDetails) {
        await tx.supplierDetails.update({
          where: { personId },
          data: {
            businessName: input.supplierDetails.businessName,
            businessRegNo: input.supplierDetails.businessRegNo,
            landAreaAcres: input.supplierDetails.landAreaAcres,
            estateName: input.supplierDetails.estateName,
            collectionPoint: input.supplierDetails.collectionPoint,
            routeId: input.supplierDetails.routeId,
            gpsLat: input.supplierDetails.gpsLat,
            gpsLng: input.supplierDetails.gpsLng,
            teaVariety: input.supplierDetails.teaVariety,
            paymentMethod: input.supplierDetails.paymentMethod,
            smsOptIn: input.supplierDetails.smsOptIn,
            smsPhone: input.supplierDetails.smsPhone,
            contractRef: input.supplierDetails.contractRef,
          },
        });
      }

      await tx.personChangeLog.create({
        data: {
          id: uuidv7(),
          personId,
          field: 'person_updated',
          oldValueMasked: null,
          newValueMasked: `Updated profile details`,
          changedBy: updaterId || null,
        },
      });

      return this.getPersonById(personId, false, tx);
    });
  }

  async updateStatus(personId: string, status: PersonStatus, updaterId?: string) {
    const person = await this.prisma.person.findUnique({
      where: { id: personId, deletedAt: null },
    });
    if (!person) throw new NotFoundError(`Person ${personId} not found.`);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.person.update({
        where: { id: personId },
        data: { status },
      });

      await tx.personChangeLog.create({
        data: {
          id: uuidv7(),
          personId,
          field: 'status',
          oldValueMasked: person.status,
          newValueMasked: status,
          changedBy: updaterId || null,
        },
      });

      return updated;
    });
  }

  async getSupplierByBarcode(barcodeValue: string) {
    if (!barcodeValue) {
      throw new ValidationError('Barcode value is required.');
    }

    const supplierDetails = await this.prisma.supplierDetails.findUnique({
      where: { barcodeValue },
      include: {
        person: true,
      },
    });

    if (!supplierDetails || supplierDetails.person.deletedAt) {
      throw new NotFoundError(`Supplier with barcode "${barcodeValue}" not found.`);
    }

    return supplierDetails;
  }

  async getSupplierByRegNo(regNo: string) {
    const { valid, normalized, error } = this.supplierRegNoService.validateRegNo(regNo);

    if (!valid) {
      throw new ValidationError(error || 'Invalid supplier registration number.');
    }

    const supplierDetails = await this.prisma.supplierDetails.findUnique({
      where: { supplierRegNoNormalized: normalized },
      include: {
        person: true,
      },
    });

    if (!supplierDetails || supplierDetails.person.deletedAt) {
      throw new NotFoundError(`Supplier with registration number "${normalized}" not found.`);
    }

    return supplierDetails;
  }

  async getMasterDataSuppliers(updatedSince?: string) {
    const where: any = {
      person: {
        status: PersonStatus.ACTIVE,
        deletedAt: null,
      },
    };

    if (updatedSince) {
      where.updatedAt = { gte: new Date(updatedSince) };
    }

    const suppliers = await this.prisma.supplierDetails.findMany({
      where,
      include: {
        person: {
          select: {
            id: true,
            code: true,
            fullName: true,
            preferredName: true,
            phonePrimary: true,
            status: true,
          },
        },
      },
      orderBy: { supplierRegNo: 'asc' },
    });

    return suppliers.map((s) => ({
      supplierId: s.personId,
      personId: s.personId,
      code: s.person.code,
      supplierCode: s.supplierCode,
      supplierRegNo: s.supplierRegNo,
      supplierRegNoNormalized: s.supplierRegNoNormalized,
      barcodeValue: s.barcodeValue,
      fullName: s.person.fullName,
      preferredName: s.person.preferredName,
      phonePrimary: s.person.phonePrimary,
      routeId: s.routeId,
      collectionPoint: s.collectionPoint,
      smsOptIn: s.smsOptIn,
      smsPhone: s.smsPhone,
    }));
  }
}
