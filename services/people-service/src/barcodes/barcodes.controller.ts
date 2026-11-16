import { Controller, Get, Header, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { NotFoundError } from '@galatura/platform-kit';
import { BarcodesService } from './barcodes.service';
import { PersonsService } from '../persons/persons.service';

@Controller()
export class BarcodesController {
  constructor(
    private readonly barcodesService: BarcodesService,
    private readonly personsService: PersonsService,
  ) {}

  @Get('barcodes/svg')
  @Header('Content-Type', 'image/svg+xml')
  getBarcodeSvg(@Query('text') text: string, @Query('type') type?: 'code128' | 'qrcode') {
    return this.barcodesService.generateSvg(text || 'SUP-000000A', type || 'code128');
  }

  @Get('barcodes/png')
  async getBarcodePng(
    @Query('text') text: string,
    @Query('type') type: 'code128' | 'qrcode' | undefined,
    @Res() res: Response,
  ) {
    const pngBuffer = await this.barcodesService.generatePng(
      text || 'SUP-000000A',
      type || 'code128',
    );
    res.setHeader('Content-Type', 'image/png');
    res.send(pngBuffer);
  }

  @Get('suppliers/:id/barcode')
  async getSupplierBarcodeCard(@Param('id') id: string) {
    const person = await this.personsService.getPersonById(id, false);
    const supplier = person.supplierDetails;
    if (!supplier) {
      throw new NotFoundError(`Person ${id} is not a supplier.`);
    }

    const svgBarcode = await this.barcodesService.generateSvg(supplier.barcodeValue, 'code128');
    const svgQr = await this.barcodesService.generateSvg(supplier.supplierRegNo, 'qrcode');

    return {
      personId: person.id,
      supplierCode: supplier.supplierCode,
      supplierRegNo: supplier.supplierRegNo,
      supplierRegNoNormalized: supplier.supplierRegNoNormalized,
      barcodeValue: supplier.barcodeValue,
      fullName: person.fullName,
      preferredName: person.preferredName,
      phonePrimary: person.phonePrimary,
      estateName: supplier.estateName,
      collectionPoint: supplier.collectionPoint,
      svgBarcode,
      svgQr,
    };
  }
}
