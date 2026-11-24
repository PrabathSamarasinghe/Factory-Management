import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { assertPermission, contextFrom, requireIdempotencyKey } from '../common/request';
import { StockService } from './stock.service';

@Controller()
export class StockController {
  constructor(private readonly stock: StockService) {}

  @Get('receipts')
  receipts(@Req() req: Request) {
    assertPermission(req, 'receipt:read');
    return { data: this.stock.listReceipts() };
  }

  @Post('receipts')
  createReceipt(@Req() req: Request, @Body() body: any) {
    assertPermission(req, 'receipt:create');
    return { data: this.stock.createReceipt(this.withKey(req, body), contextFrom(req)) };
  }

  @Post('receipts/:id/approve')
  approveReceipt(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    assertPermission(req, 'receipt:approve');
    return { data: this.stock.approveReceipt(id, this.withKey(req, body), contextFrom(req)) };
  }

  @Get('issues')
  issues(@Req() req: Request) {
    assertPermission(req, 'issue:read');
    return { data: this.stock.listIssues() };
  }

  @Post('issues')
  createIssue(@Req() req: Request, @Body() body: any) {
    assertPermission(req, 'issue:create');
    return { data: this.stock.createIssue(this.withKey(req, body), contextFrom(req)) };
  }

  @Post('issues/:id/approve')
  approveIssue(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    assertPermission(req, 'issue:approve');
    return { data: this.stock.approveIssue(id, this.withKey(req, body), contextFrom(req)) };
  }

  @Get('transfers')
  transfers(@Req() req: Request) {
    assertPermission(req, 'transfer:read');
    return { data: this.stock.listTransfers() };
  }

  @Post('transfers')
  createTransfer(@Req() req: Request, @Body() body: any) {
    assertPermission(req, 'transfer:create');
    return { data: this.stock.createTransfer(this.withKey(req, body), contextFrom(req)) };
  }

  @Post('transfers/:id/approve')
  approveTransfer(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    assertPermission(req, 'transfer:approve');
    return { data: this.stock.approveTransfer(id, this.withKey(req, body), contextFrom(req)) };
  }

  @Get('adjustments')
  adjustments(@Req() req: Request) {
    assertPermission(req, 'adjustment:read');
    return { data: this.stock.listAdjustments() };
  }

  @Post('adjustments')
  createAdjustment(@Req() req: Request, @Body() body: any) {
    assertPermission(req, 'adjustment:create');
    return { data: this.stock.createAdjustment(this.withKey(req, body), contextFrom(req)) };
  }

  @Post('adjustments/:id/approve')
  approveAdjustment(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    assertPermission(req, 'adjustment:approve');
    return { data: this.stock.approveAdjustment(id, this.withKey(req, body), contextFrom(req)) };
  }

  @Get('stock-takes')
  stockTakes(@Req() req: Request) {
    assertPermission(req, 'stocktake:read');
    return { data: this.stock.listStockTakes() };
  }

  @Post('stock-takes')
  createStockTake(@Req() req: Request, @Body() body: any) {
    assertPermission(req, 'stocktake:create');
    return { data: this.stock.createStockTake(this.withKey(req, body), contextFrom(req)) };
  }

  @Post('stock-takes/:id/lines')
  addStockTakeLine(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    assertPermission(req, 'stocktake:create');
    return { data: this.stock.addStockTakeLine(id, body, contextFrom(req)) };
  }

  @Post('stock-takes/:id/complete')
  completeStockTake(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    assertPermission(req, 'stocktake:complete');
    return { data: this.stock.completeStockTake(id, this.withKey(req, body), contextFrom(req)) };
  }

  @Get('stock/balances')
  balances(
    @Req() req: Request,
    @Query('itemId') itemId?: string,
    @Query('locationId') locationId?: string,
  ) {
    assertPermission(req, 'stock:read');
    return { data: this.stock.listBalances(itemId, locationId) };
  }

  @Get('stock/movements')
  movements(
    @Req() req: Request,
    @Query('itemId') itemId?: string,
    @Query('locationId') locationId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    assertPermission(req, 'stock:read');
    return { data: this.stock.listMovements(itemId, locationId, from, to) };
  }

  @Get('alerts/low-stock')
  lowStock(@Req() req: Request) {
    assertPermission(req, 'stock:read');
    return { data: this.stock.lowStockAlerts() };
  }

  @Get('reports/valuation')
  valuation(@Req() req: Request, @Query('asOf') asOf?: string) {
    assertPermission(req, 'inventory:report');
    return { data: this.stock.valuation(asOf) };
  }

  private withKey(req: Request, body: any) {
    const key = requireIdempotencyKey(req, body);
    return key ? { ...(body ?? {}), idempotencyKey: key } : (body ?? {});
  }
}
