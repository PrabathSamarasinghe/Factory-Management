import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { PermissionsService } from './permissions.service';

@Controller()
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get('permissions')
  listPermissions() {
    return this.permissionsService.listPermissions();
  }

  @Get('me')
  getProfile(@Req() req: Request) {
    const userId = (req.headers['x-user-id'] as string) || '';
    return this.permissionsService.getUserProfile(userId);
  }

  @Get('me/permissions')
  getMyPermissions(@Req() req: Request) {
    const userId = (req.headers['x-user-id'] as string) || '';
    return this.permissionsService.getUserPermissions(userId);
  }
}
