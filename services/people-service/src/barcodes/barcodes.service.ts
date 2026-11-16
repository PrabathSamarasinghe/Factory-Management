import { Injectable } from '@nestjs/common';
import bwipjs from 'bwip-js';

@Injectable()
export class BarcodesService {
  /**
   * Generates a Code128 barcode or QR code as an SVG string.
   */
  async generateSvg(text: string, type: 'code128' | 'qrcode' = 'code128'): Promise<string> {
    return bwipjs.toSVG(this.buildOptions(text, type));
  }

  /**
   * Generates a Code128 barcode or QR code as a PNG Buffer.
   */
  async generatePng(text: string, type: 'code128' | 'qrcode' = 'code128'): Promise<Buffer> {
    return bwipjs.toBuffer(this.buildOptions(text, type));
  }

  private buildOptions(
    text: string,
    type: 'code128' | 'qrcode',
  ): Parameters<typeof bwipjs.toSVG>[0] {
    const isQr = type === 'qrcode';
    const options: Parameters<typeof bwipjs.toSVG>[0] = {
      bcid: type,
      text,
      scale: 3,
      height: isQr ? 50 : 12,
      includetext: !isQr,
      textxalign: 'center',
    };
    if (isQr) {
      options.width = 50;
    }
    return options;
  }
}
