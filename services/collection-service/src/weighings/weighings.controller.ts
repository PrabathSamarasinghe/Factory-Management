import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { assertPermission, contextFrom } from '../common/request';
import {
  WeighingsService,
  type ResolveDiscrepancyInput,
  type WeighingInput,
} from './weighings.service';

@Controller()
export class WeighingsController {
  constructor(private readonly weighings: WeighingsService) {}

  @Post('weighings')
  record(@Body() body: WeighingInput, @Req() req: Request) {
    assertPermission(req, 'collection:weigh');
    return this.weighings.record(body, contextFrom(req));
  }

  @Post('trips/:tripId/finalize')
  finalize(@Param('tripId') tripId: string, @Req() req: Request) {
    assertPermission(req, 'collection:finalize');
    return this.weighings.finalize(tripId, contextFrom(req));
  }

  @Get('trips/:tripId/readiness')
  readiness(@Param('tripId') tripId: string, @Req() req: Request) {
    assertPermission(req, 'collection:read');
    return this.weighings.readiness(tripId);
  }

  @Get('weighings/discrepancies')
  discrepancies(@Query('status') status: string | undefined, @Req() req: Request) {
    assertPermission(req, 'collection:review');
    return this.weighings.listDiscrepancies(status);
  }

  @Post('weighings/discrepancies/:id/resolve')
  resolve(
    @Param('id') id: string,
    @Body() body: ResolveDiscrepancyInput,
    @Req() req: Request,
  ) {
    assertPermission(req, 'collection:resolve');
    return this.weighings.resolveDiscrepancy(id, body, contextFrom(req));
  }

  @Get('totals/daily')
  dailyTotals(
    @Query('date') dateValue: string | undefined,
    @Query('supplierId') supplierId: string | undefined,
    @Req() req: Request,
  ) {
    assertPermission(req, 'collection:review');
    return this.weighings.dailyTotals(dateValue, supplierId);
  }

  @Get('suppliers/:id/statement')
  statement(
    @Param('id') id: string,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Req() req: Request,
  ) {
    assertPermission(req, 'collection:review');
    return this.weighings.statement(id, from, to);
  }
}
