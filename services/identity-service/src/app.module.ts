import { Module } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { RedisService } from './redis/redis.service';
import { AuthService } from './auth/auth.service';
import { AuthController } from './auth/auth.controller';
import { RolesService } from './roles/roles.service';
import { RolesController, PermissionRequestsController } from './roles/roles.controller';
import { PermissionsService } from './permissions/permissions.service';
import { PermissionsController } from './permissions/permissions.controller';
import { DevicesService } from './devices/devices.service';
import { DevicesController, MyDevicesController } from './devices/devices.controller';
import { UsersService } from './users/users.service';
import { UsersController } from './users/users.controller';
import { AuditService } from './audit/audit.service';
import { AuditController } from './audit/audit.controller';

@Module({
  imports: [],
  controllers: [
    AuthController,
    RolesController,
    PermissionRequestsController,
    PermissionsController,
    DevicesController,
    MyDevicesController,
    UsersController,
    AuditController,
  ],
  providers: [
    PrismaService,
    RedisService,
    AuthService,
    RolesService,
    PermissionsService,
    DevicesService,
    UsersService,
    AuditService,
  ],
  exports: [
    PrismaService,
    RedisService,
    AuthService,
    RolesService,
    PermissionsService,
    DevicesService,
    UsersService,
    AuditService,
  ],
})
export class AppModule {}
