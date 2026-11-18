import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { assertPermission, readActorId, readIp } from '../common/request';
import { DevicesService, type CreateDeviceInput } from './devices.service';

@Controller('devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  list(@Req() req: Request) {
    assertPermission(req, 'device:read');
    return this.devices.listDevices();
  }

  @Post()
  create(@Body() body: CreateDeviceInput, @Req() req: Request) {
    assertPermission(req, 'device:manage');
    return this.devices.createDevice(body, {
      actorId: readActorId(req),
      ip: readIp(req),
    });
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: 'ACTIVE' | 'DISABLED' | 'REVOKED' },
    @Req() req: Request,
  ) {
    assertPermission(req, 'device:manage');
    return this.devices.updateStatus(id, body.status, {
      actorId: readActorId(req),
      ip: readIp(req),
    });
  }
}
