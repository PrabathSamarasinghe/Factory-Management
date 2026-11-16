import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { PersonsService, type CreatePersonInput, type UpdatePersonInput } from './persons.service';
import { PersonStatus, PersonType } from '../../generated/prisma';

function readPermissions(req: Request): string[] {
  try {
    return JSON.parse((req.headers['x-permissions'] as string) || '[]');
  } catch {
    return [];
  }
}

@Controller()
export class PersonsController {
  constructor(private readonly personsService: PersonsService) {}

  @Post('persons')
  createPerson(@Body() body: CreatePersonInput, @Req() req: Request) {
    const creatorId = req.headers['x-user-id'] as string | undefined;
    return this.personsService.createPerson(body, creatorId);
  }

  @Get('persons')
  listPersons(
    @Query('type') type?: PersonType,
    @Query('status') status?: PersonStatus,
    @Query('q') q?: string,
    @Query('route') routeId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.personsService.listPersons({
      type,
      status,
      q,
      routeId,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('persons/:id')
  getPerson(@Param('id') id: string, @Req() req: Request) {
    const canReadSensitive = readPermissions(req).includes('person:read-sensitive');
    return this.personsService.getPersonById(id, canReadSensitive);
  }

  @Patch('persons/:id')
  updatePerson(@Param('id') id: string, @Body() body: UpdatePersonInput, @Req() req: Request) {
    const updaterId = req.headers['x-user-id'] as string | undefined;
    return this.personsService.updatePerson(id, body, updaterId);
  }

  @Post('persons/:id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: PersonStatus },
    @Req() req: Request,
  ) {
    const updaterId = req.headers['x-user-id'] as string | undefined;
    return this.personsService.updateStatus(id, body.status, updaterId);
  }

  @Get('suppliers/by-barcode/:value')
  getSupplierByBarcode(@Param('value') value: string) {
    return this.personsService.getSupplierByBarcode(value);
  }

  @Get('suppliers/by-reg-no/:regNo')
  getSupplierByRegNo(@Param('regNo') regNo: string) {
    return this.personsService.getSupplierByRegNo(regNo);
  }

  @Get('master-data/suppliers')
  getMasterDataSuppliers(@Query('updatedSince') updatedSince?: string) {
    return this.personsService.getMasterDataSuppliers(updatedSince);
  }
}
