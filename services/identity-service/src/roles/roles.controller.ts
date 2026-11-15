import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { RolePermissionAssignment, RolesService } from './roles.service';
import { PermissionScope } from '../../generated/prisma';

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  listRoles() {
    return this.rolesService.listRoles();
  }

  @Get(':id')
  getRole(@Param('id') id: string) {
    return this.rolesService.getRole(id);
  }

  @Post()
  createRole(
    @Body()
    body: {
      code: string;
      name: string;
      description?: string;
      requires2fa?: boolean;
    },
  ) {
    return this.rolesService.createRole(body);
  }

  @Patch(':id')
  updateRole(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      requires2fa?: boolean;
    },
  ) {
    return this.rolesService.updateRole(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRole(@Param('id') id: string) {
    await this.rolesService.deleteRole(id);
  }

  @Put(':id/permissions')
  requestRolePermissions(
    @Param('id') id: string,
    @Body() body: { permissions: RolePermissionAssignment[] },
    @Req() req: Request,
  ) {
    const requesterId = (req.headers['x-user-id'] as string) || '';
    return this.rolesService.requestRolePermissions(id, body.permissions, requesterId);
  }
}

@Controller('permission-requests')
export class PermissionRequestsController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  listRequests(@Query('status') status?: 'PENDING' | 'APPROVED' | 'REJECTED') {
    return this.rolesService.listChangeRequests(status);
  }

  @Post(':id/approve')
  approveRequest(@Param('id') id: string, @Req() req: Request) {
    const deciderId = (req.headers['x-user-id'] as string) || '';
    return this.rolesService.decideChangeRequest(id, deciderId, 'APPROVE');
  }

  @Post(':id/reject')
  rejectRequest(@Param('id') id: string, @Req() req: Request) {
    const deciderId = (req.headers['x-user-id'] as string) || '';
    return this.rolesService.decideChangeRequest(id, deciderId, 'REJECT');
  }
}
