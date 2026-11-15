import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { DevicesService, RegisterDeviceInput } from './devices.service';

@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post()
  registerDevice(@Body() body: RegisterDeviceInput, @Req() req: Request) {
    const userId = (req.headers['x-user-id'] as string) || '';
    return this.devicesService.registerDevice(userId, body);
  }

  @Post(':id/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeDevice(@Param('id') id: string) {
    await this.devicesService.revokeDevice(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDevice(@Param('id') id: string) {
    await this.devicesService.revokeDevice(id);
  }
}

@Controller('me/devices')
export class MyDevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  listMyDevices(@Req() req: Request) {
    const userId = (req.headers['x-user-id'] as string) || '';
    return this.devicesService.listUserDevices(userId);
  }
}
