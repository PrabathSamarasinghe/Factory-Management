import { Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { assertPermission } from '../common/request';
import { MasterDataService } from './master-data.service';

@Controller('master-data')
export class MasterDataController {
  constructor(private readonly masterData: MasterDataService) {}

  @Get('pull')
  pull(@Query('since') since: string | undefined, @Req() req: Request) {
    assertPermission(req, 'collection:read');
    return this.masterData.pull(since);
  }
}
