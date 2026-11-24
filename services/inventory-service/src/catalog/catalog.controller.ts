import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { assertPermission, contextFrom } from '../common/request';
import { CatalogService } from './catalog.service';

@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('categories')
  categories(@Req() req: Request) {
    assertPermission(req, 'category:read');
    return { data: this.catalog.listCategories() };
  }

  @Post('categories')
  createCategory(@Req() req: Request, @Body() body: any) {
    assertPermission(req, 'category:write');
    return { data: this.catalog.createCategory(body, contextFrom(req)) };
  }

  @Patch('categories/:id')
  updateCategory(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    assertPermission(req, 'category:write');
    return { data: this.catalog.updateCategory(id, body, contextFrom(req)) };
  }

  @Get('units')
  units(@Req() req: Request) {
    assertPermission(req, 'unit:read');
    return { data: this.catalog.listUnits() };
  }

  @Post('units')
  createUnit(@Req() req: Request, @Body() body: any) {
    assertPermission(req, 'unit:write');
    return { data: this.catalog.createUnit(body, contextFrom(req)) };
  }

  @Get('items')
  items(@Req() req: Request) {
    assertPermission(req, 'item:read');
    return { data: this.catalog.listItems() };
  }

  @Post('items')
  createItem(@Req() req: Request, @Body() body: any) {
    assertPermission(req, 'item:create');
    return { data: this.catalog.createItem(body, contextFrom(req)) };
  }

  @Patch('items/:id')
  updateItem(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    assertPermission(req, 'item:update');
    return { data: this.catalog.updateItem(id, body, contextFrom(req)) };
  }

  @Post('items/:id/deactivate')
  deactivateItem(@Req() req: Request, @Param('id') id: string) {
    assertPermission(req, 'item:deactivate');
    return { data: this.catalog.deactivateItem(id, contextFrom(req)) };
  }

  @Get('warehouses')
  warehouses(@Req() req: Request) {
    assertPermission(req, 'warehouse:read');
    return { data: this.catalog.listWarehouses() };
  }

  @Post('warehouses')
  createWarehouse(@Req() req: Request, @Body() body: any) {
    assertPermission(req, 'warehouse:write');
    return { data: this.catalog.createWarehouse(body, contextFrom(req)) };
  }

  @Patch('warehouses/:id')
  updateWarehouse(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    assertPermission(req, 'warehouse:write');
    return { data: this.catalog.updateWarehouse(id, body, contextFrom(req)) };
  }

  @Get('locations')
  locations(@Req() req: Request) {
    assertPermission(req, 'warehouse:read');
    return { data: this.catalog.listLocations() };
  }

  @Post('locations')
  createLocation(@Req() req: Request, @Body() body: any) {
    assertPermission(req, 'warehouse:write');
    return { data: this.catalog.createLocation(body, contextFrom(req)) };
  }

  @Get('vendors')
  vendors(@Req() req: Request) {
    assertPermission(req, 'vendor:read');
    return { data: this.catalog.listVendors() };
  }

  @Post('vendors')
  createVendor(@Req() req: Request, @Body() body: any) {
    assertPermission(req, 'vendor:write');
    return { data: this.catalog.createVendor(body, contextFrom(req)) };
  }

  @Patch('vendors/:id')
  updateVendor(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    assertPermission(req, 'vendor:write');
    return { data: this.catalog.updateVendor(id, body, contextFrom(req)) };
  }
}
