import { Injectable } from '@nestjs/common';
import { BusinessRuleError } from '@galatura/platform-kit';
import { BillingService } from '../billing/billing.service';
import { JournalService } from '../journal/journal.service';
import { dateOnly } from '../common/validation';

const REPORT_TYPES = [
  'trial-balance',
  'profit-loss',
  'balance-sheet',
  'cash-flow',
  'supplier-aging',
] as const;
const FORMATS = ['json', 'csv', 'pdf', 'xlsx'] as const;

interface ReportFilters {
  asOf?: Date;
  from?: Date;
  to?: Date;
  periodId?: string;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly journal: JournalService,
    private readonly billing: BillingService,
  ) {}

  trialBalance(filters: ReportFilters) {
    return this.journal.trialBalance(filters.asOf, filters.periodId);
  }

  profitLoss(filters: ReportFilters) {
    return this.journal.profitLoss(filters.from, filters.to);
  }

  balanceSheet(filters: ReportFilters) {
    return this.journal.balanceSheet(filters.asOf);
  }

  cashFlow(filters: ReportFilters) {
    return this.journal.cashFlow(filters.from, filters.to);
  }

  supplierAging(filters: ReportFilters) {
    return this.billing.supplierAging(filters.asOf);
  }

  async export(type: string, format: string, filters: ReportFilters) {
    const reportType = this.oneOf(type, REPORT_TYPES, 'report type');
    const exportFormat = this.oneOf(format, FORMATS, 'format');
    const report = await this.build(reportType, filters);
    const filename = `${reportType}-${new Date().toISOString().slice(0, 10)}.${exportFormat}`;

    if (exportFormat === 'json') {
      return {
        contentType: 'application/json',
        filename,
        content: Buffer.from(JSON.stringify(report, null, 2)),
      };
    }
    const table = this.tableFor(report);
    if (exportFormat === 'csv') {
      return {
        contentType: 'text/csv; charset=utf-8',
        filename,
        content: Buffer.from(this.csv(table), 'utf8'),
      };
    }
    if (exportFormat === 'pdf') {
      return {
        contentType: 'application/pdf',
        filename,
        content: this.pdf(reportType, report, table),
      };
    }
    return {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename,
      content: this.xlsx(reportType, table),
    };
  }

  parseFilters(query: any): ReportFilters {
    return {
      asOf: query?.asOf ? dateOnly(query.asOf, 'asOf') : undefined,
      from: query?.from ? dateOnly(query.from, 'from') : undefined,
      to: query?.to ? dateOnly(query.to, 'to') : undefined,
      periodId: typeof query?.periodId === 'string' ? query.periodId : undefined,
    };
  }

  private async build(type: string, filters: ReportFilters) {
    if (type === 'trial-balance') return this.journal.trialBalance(filters.asOf, filters.periodId);
    if (type === 'profit-loss') return this.journal.profitLoss(filters.from, filters.to);
    if (type === 'balance-sheet') return this.journal.balanceSheet(filters.asOf);
    if (type === 'cash-flow') return this.journal.cashFlow(filters.from, filters.to);
    return this.billing.supplierAging(filters.asOf);
  }

  private oneOf(value: unknown, values: readonly string[], label: string): string {
    const text = typeof value === 'string' ? value : '';
    if (!values.includes(text))
      throw new BusinessRuleError(`${label} must be one of ${values.join(', ')}.`);
    return text;
  }

  private tableFor(report: any): { columns: string[]; rows: any[][] } {
    const rowsSource = report?.rows;
    if (!Array.isArray(rowsSource) || rowsSource.length === 0) {
      const columns = Object.keys(report ?? {}).filter((key) => !Array.isArray(report[key]));
      return { columns, rows: [columns.map((key) => report[key])] };
    }
    const columns = Array.from(new Set(rowsSource.flatMap((row: any) => Object.keys(row ?? {}))));
    return {
      columns,
      rows: rowsSource.map((row: any) => columns.map((column) => row?.[column] ?? '')),
    };
  }

  private csv(table: { columns: string[]; rows: any[][] }): string {
    return [table.columns, ...table.rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
  }

  private pdf(title: string, report: any, table: { columns: string[]; rows: any[][] }): Buffer {
    const safe = (value: unknown) =>
      String(value ?? '')
        .replace(/[^\x20-\x7e]/g, ' ')
        .replace(/([\\()])/g, '\\$1');
    const lines: string[] = [
      title.toUpperCase(),
      ...Object.keys(report ?? {})
        .filter((key) => !Array.isArray(report[key]))
        .map((key) => `${key}: ${safe(report[key])}`),
      '',
    ];
    lines.push(table.columns.join(' | '));
    for (const row of table.rows.slice(0, 60)) {
      lines.push(row.map((value) => String(value ?? '')).join(' | '));
    }

    const objects: string[] = [];
    objects.push('<< /Type /Catalog /Pages 2 0 R >>');
    objects.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    objects.push(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 1191] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    );
    const stream = [
      'BT',
      '/F1 10 Tf',
      '40 1140 Td',
      '13 TL',
      ...lines.map((line) => `(${safe(line)}) Tj T*`),
      'ET',
    ].join('\n');
    objects.push(
      `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    );
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

    let body = '%PDF-1.4\n';
    const offsets: number[] = [];
    for (const [index, object] of objects.entries()) {
      offsets.push(Buffer.byteLength(body, 'latin1'));
      body += `${index + 1} 0 obj\n${object}\nendobj\n`;
    }
    const xref = Buffer.byteLength(body, 'latin1');
    body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets) {
      body += `${offset.toString().padStart(10, '0')} 00000 n \n`;
    }
    body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return Buffer.from(body, 'latin1');
  }

  private xlsx(title: string, table: { columns: string[]; rows: any[][] }): Buffer {
    const escapeXml = (value: unknown) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    const cellRef = (column: number, row: number) => `${String.fromCharCode(65 + column)}${row}`;
    const sheetRows = [table.columns, ...table.rows]
      .map((row, rowIndex) => {
        const cells = row
          .map((value, columnIndex) => {
            const text = escapeXml(value);
            return `<c r="${cellRef(columnIndex, rowIndex + 1)}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
          })
          .join('');
        return `<row r="${rowIndex + 1}">${cells}</row>`;
      })
      .join('');

    const files: Array<[string, string]> = [
      [
        '[Content_Types].xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
      ],
      [
        '_rels/.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      ],
      [
        'xl/workbook.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(title).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ],
      [
        'xl/_rels/workbook.xml.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
      ],
      [
        'xl/worksheets/sheet1.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`,
      ],
    ];

    return this.zip(files);
  }

  private zip(files: Array<[string, string]>): Buffer {
    const crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      crcTable[index] = value >>> 0;
    }
    const crc32 = (buffer: Buffer) => {
      let crc = 0xffffffff;
      for (const byte of buffer) {
        crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
      }
      return (crc ^ 0xffffffff) >>> 0;
    };

    const locals: Buffer[] = [];
    const centrals: Buffer[] = [];
    let offset = 0;
    for (const [name, content] of files) {
      const nameBuffer = Buffer.from(name, 'utf8');
      const data = Buffer.from(content, 'utf8');
      const checksum = crc32(data);

      const local = Buffer.alloc(30 + nameBuffer.length);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4);
      local.writeUInt16LE(0, 6);
      local.writeUInt16LE(0, 8);
      local.writeUInt16LE(0, 10);
      local.writeUInt16LE(0, 12);
      local.writeUInt32LE(checksum, 14);
      local.writeUInt32LE(data.length, 18);
      local.writeUInt32LE(data.length, 22);
      local.writeUInt16LE(nameBuffer.length, 26);
      local.writeUInt16LE(0, 28);
      nameBuffer.copy(local, 30);
      locals.push(local, data);

      const central = Buffer.alloc(46 + nameBuffer.length);
      central.writeUInt32LE(0x02014b50, 0);
      central.writeUInt16LE(20, 4);
      central.writeUInt16LE(20, 6);
      central.writeUInt16LE(0, 8);
      central.writeUInt16LE(0, 10);
      central.writeUInt16LE(0, 12);
      central.writeUInt16LE(0, 14);
      central.writeUInt32LE(checksum, 16);
      central.writeUInt32LE(data.length, 20);
      central.writeUInt32LE(data.length, 24);
      central.writeUInt16LE(nameBuffer.length, 28);
      central.writeUInt16LE(0, 30);
      central.writeUInt16LE(0, 32);
      central.writeUInt16LE(0, 34);
      central.writeUInt16LE(0, 36);
      central.writeUInt32LE(0, 38);
      central.writeUInt32LE(offset, 42);
      nameBuffer.copy(central, 46);
      centrals.push(central);

      offset += local.length + data.length;
    }

    const centralBuffer = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(files.length, 8);
    end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(centralBuffer.length, 12);
    end.writeUInt32LE(offset, 16);
    end.writeUInt16LE(0, 20);

    return Buffer.concat([...locals, centralBuffer, end]);
  }
}
