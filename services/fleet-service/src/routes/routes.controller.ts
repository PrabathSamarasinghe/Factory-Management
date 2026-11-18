import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { assertPermission, contextFrom } from '../common/request';
import { RoutesService, type CreateRouteInput, type RouteStopInput } from './routes.service';

@Controller()
export class RoutesController {
  constructor(private readonly routes: RoutesService) {}

  @Get('routes')
  list(
    @Query('status') status: string | undefined,
    @Query('q') q: string | undefined,
    @Req() req: Request,
  ) {
    assertPermission(req, 'route:read');
    return this.routes.list({ status, q });
  }

  @Get('routes/:id')
  get(@Param('id') id: string, @Req() req: Request) {
    assertPermission(req, 'route:read');
    return this.routes.get(id);
  }

  @Post('routes')
  create(@Body() body: CreateRouteInput, @Req() req: Request) {
    assertPermission(req, 'route:create');
    return this.routes.create(body, contextFrom(req));
  }

  @Patch('routes/:id')
  update(@Param('id') id: string, @Body() body: CreateRouteInput, @Req() req: Request) {
    assertPermission(req, 'route:update');
    return this.routes.update(id, body, contextFrom(req));
  }

  @Put('routes/:id/stops')
  replaceStops(
    @Param('id') id: string,
    @Body() body: { stops?: RouteStopInput[] },
    @Req() req: Request,
  ) {
    assertPermission(req, 'route:update');
    return this.routes.replaceStops(id, body.stops ?? [], contextFrom(req));
  }
}
