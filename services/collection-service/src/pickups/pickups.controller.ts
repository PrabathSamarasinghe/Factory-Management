import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { assertPermission, contextFrom } from '../common/request';
import { PickupsService, type PickupInput } from './pickups.service';

@Controller()
export class PickupsController {
  constructor(private readonly pickups: PickupsService) {}

  @Post('pickups')
  create(@Body() body: PickupInput, @Req() req: Request) {
    assertPermission(req, 'collection:record');
    return this.pickups.create(body, contextFrom(req));
  }

  @Post('pickups/:id/correct')
  correct(@Param('id') id: string, @Body() body: PickupInput, @Req() req: Request) {
    assertPermission(req, 'collection:correct');
    return this.pickups.correct(id, body, contextFrom(req));
  }

  @Get('trips/:tripId/pickups')
  listForTrip(@Param('tripId') tripId: string, @Req() req: Request) {
    assertPermission(req, 'collection:read');
    return this.pickups.listForTrip(tripId);
  }

  @Get('suppliers/:id/scan-preview')
  scanPreview(@Param('id') id: string, @Req() req: Request) {
    assertPermission(req, 'collection:record');
    return this.pickups.scanPreview(id);
  }

  @Get('reports/manual-entries')
  manualEntries(
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Req() req: Request,
  ) {
    assertPermission(req, 'collection:review');
    return this.pickups.manualEntries(from, to);
  }
}
