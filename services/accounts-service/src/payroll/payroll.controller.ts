import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { PayrollService } from './payroll.service';
import { assertPermission, bodyWithIdempotency, contextFrom } from '../common/request';

@Controller()
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get('wage-components')
  components(@Req() req: Request) {
    assertPermission(req, 'payroll:run');
    return { data: this.payroll.listWageComponents() };
  }

  @Post('wage-components')
  createComponent(@Req() req: Request, @Body() body: any) {
    assertPermission(req, 'payroll:run');
    return { data: this.payroll.createWageComponent(body, contextFrom(req)) };
  }

  @Get('payroll-runs')
  runs(@Req() req: Request) {
    assertPermission(req, 'wages:read');
    return { data: this.payroll.listPayrollRuns() };
  }

  @Post('payroll-runs/calculate')
  async calculate(@Req() req: Request, @Body() body: any) {
    assertPermission(req, 'payroll:run');
    return {
      data: await this.payroll.calculatePayroll(bodyWithIdempotency(req, body), contextFrom(req)),
    };
  }

  @Post('payroll-runs/:id/approve')
  async approve(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    assertPermission(req, 'payroll:approve');
    return {
      data: await this.payroll.approvePayrollRun(
        id,
        bodyWithIdempotency(req, body),
        contextFrom(req),
      ),
    };
  }

  @Get('employees/:id/wages-due')
  async wagesDue(@Req() req: Request, @Param('id') id: string) {
    assertPermission(req, 'wages:read');
    return { data: await this.payroll.wagesDue(id) };
  }
}
