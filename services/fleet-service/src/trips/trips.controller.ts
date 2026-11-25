import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { assertPermission, contextFrom } from '../common/request';
import {
  TripsService,
  type AdminOverrideEndTripInput,
  type EndTripInput,
  type StartTripInput,
  type TripEventInput,
  type TripListQuery,
} from './trips.service';

@Controller()
export class TripsController {
  constructor(private readonly trips: TripsService) {}

  @Get('trips/mine/today')
  mineToday(@Req() req: Request) {
    assertPermission(req, 'trip:read-own');
    return this.trips.mineToday(contextFrom(req));
  }

  @Get('master-data/routes')
  masterData(@Query('updatedSince') updatedSince: string | undefined, @Req() req: Request) {
    assertPermission(req, 'trip:read-own');
    return this.trips.masterData(updatedSince);
  }

  @Get('trips')
  list(@Query() query: TripListQuery, @Req() req: Request) {
    assertPermission(req, 'trip:read');
    return this.trips.list(query);
  }

  @Get('trips/:id')
  get(@Param('id') id: string, @Req() req: Request) {
    assertPermission(req, 'trip:read');
    return this.trips.get(id);
  }

  @Post('trips')
  start(@Body() body: StartTripInput, @Req() req: Request) {
    assertPermission(req, 'trip:create');
    return this.trips.start(body, contextFrom(req));
  }

  @Post('trips/:id/events')
  addEvent(@Param('id') id: string, @Body() body: TripEventInput, @Req() req: Request) {
    assertPermission(req, 'trip:update');
    return this.trips.addEvent(id, body, contextFrom(req));
  }

  @Post('trips/:id/arrive-factory')
  arriveFactory(@Param('id') id: string, @Req() req: Request) {
    assertPermission(req, 'trip:update');
    return this.trips.arriveFactory(id, contextFrom(req));
  }

  @Post('trips/:id/end')
  end(@Param('id') id: string, @Body() body: EndTripInput, @Req() req: Request) {
    assertPermission(req, 'trip:end');
    return this.trips.end(id, body, contextFrom(req));
  }

  @Post('trips/:id/override-end')
  overrideEnd(
    @Param('id') id: string,
    @Body() body: AdminOverrideEndTripInput,
    @Req() req: Request,
  ) {
    assertPermission(req, 'trip:override-end');
    return this.trips.overrideEnd(id, body, contextFrom(req));
  }

  @Post('trips/:id/cancel')
  cancel(@Param('id') id: string, @Body() body: { remarks?: unknown }, @Req() req: Request) {
    assertPermission(req, 'trip:cancel');
    return this.trips.cancel(id, body, contextFrom(req));
  }
}
