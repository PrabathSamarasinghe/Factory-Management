import {
  Body,
  Controller,
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
import { CreateUserInput, UsersService } from './users.service';
import { RolesService } from '../roles/roles.service';
import { UserStatus } from '../../generated/prisma';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService,
  ) {}

  @Get()
  listUsers(
    @Query('query') query?: string,
    @Query('status') status?: UserStatus,
    @Query('limit') limit?: string,
  ) {
    return this.usersService.listUsers({
      query,
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  getUser(@Param('id') id: string) {
    return this.usersService.getUser(id);
  }

  @Post()
  createUser(@Body() body: CreateUserInput, @Req() req: Request) {
    const creatorId = (req.headers['x-user-id'] as string) || '';
    return this.usersService.createUser(body, creatorId);
  }

  @Patch(':id')
  updateUser(
    @Param('id') id: string,
    @Body() body: { email?: string; phone?: string; status?: UserStatus },
  ) {
    return this.usersService.updateUser(id, body);
  }

  @Post(':id/lock')
  @HttpCode(HttpStatus.OK)
  lockUser(@Param('id') id: string, @Body() body?: { durationMinutes?: number }) {
    return this.usersService.lockUser(id, body?.durationMinutes);
  }

  @Post(':id/unlock')
  @HttpCode(HttpStatus.OK)
  unlockUser(@Param('id') id: string) {
    return this.usersService.unlockUser(id);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Param('id') id: string, @Body() body?: { newPassword?: string }) {
    return this.usersService.resetPassword(id, body?.newPassword);
  }

  @Put(':id/roles')
  @HttpCode(HttpStatus.OK)
  async assignRoles(
    @Param('id') id: string,
    @Body() body: { roleIds: string[] },
    @Req() req: Request,
  ) {
    const grantedBy = (req.headers['x-user-id'] as string) || '';
    await this.rolesService.assignUserRoles(id, body.roleIds, grantedBy);
    return { success: true };
  }
}
