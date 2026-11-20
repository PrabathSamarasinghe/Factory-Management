import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ReportsService } from './reports.service';
import { assertPermission } from '../common/request';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('trial-balance')
  async trialBalance(@Req() req: Request, @Query() query: any) {
    assertPermission(req, 'report:read');
    return { data: this.reports.trialBalance(this.reports.parseFilters(query)) };
  }

  @Get('profit-loss')
  async profitLoss(@Req() req: Request, @Query() query: any) {
    assertPermission(req, 'report:read');
    return { data: this.reports.profitLoss(this.reports.parseFilters(query)) };
  }

  @Get('balance-sheet')
  async balanceSheet(@Req() req: Request, @Query() query: any) {
    assertPermission(req, 'report:read');
    return { data: this.reports.balanceSheet(this.reports.parseFilters(query)) };
  }

  @Get('cash-flow')
  async cashFlow(@Req() req: Request, @Query() query: any) {
    assertPermission(req, 'report:read');
    return { data: this.reports.cashFlow(this.reports.parseFilters(query)) };
  }

  @Get('supplier-aging')
  async supplierAging(@Req() req: Request, @Query() query: any) {
    assertPermission(req, 'report:read');
    return { data: this.reports.supplierAging(this.reports.parseFilters(query)) };
  }

  @Get(':type/export')
  async export(
    @Req() req: Request,
    @Res() res: Response,
    @Param('type') type: string,
    @Query() query: any,
  ) {
    assertPermission(req, 'report:export');
    const exportResult = await this.reports.export(
      type,
      typeof query?.format === 'string' ? query.format : 'csv',
      this.reports.parseFilters(query),
    );
    res.setHeader('Content-Type', exportResult.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
    res.send(exportResult.content);
  }
}
