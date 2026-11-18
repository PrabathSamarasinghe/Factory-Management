import { Injectable } from '@nestjs/common';
import { ValidationError } from '@galatura/platform-kit';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<
    Array<{
      code: string;
      language: string;
      body: string;
      active: boolean;
      updatedAt: string;
    }>
  > {
    const templates = await this.prisma.smsTemplate.findMany({
      orderBy: [{ code: 'asc' }, { language: 'asc' }],
    });
    return templates.map((template) => ({
      code: template.code,
      language: template.language,
      body: template.body,
      active: template.active,
      updatedAt: template.updatedAt.toISOString(),
    }));
  }

  async update(code: string, language: string, body: string, active: boolean) {
    if (!body.trim() || body.length > 480) {
      throw new ValidationError('Template body must be 1-480 characters.');
    }
    return this.prisma.smsTemplate.upsert({
      where: { code_language: { code, language } },
      create: { code, language, body, active },
      update: { body, active },
    });
  }

  async render(code: string, language: string, variables: Record<string, string>): Promise<string> {
    const template = await this.prisma.smsTemplate.findFirst({
      where: { code, language, active: true },
    });
    if (!template) {
      throw new ValidationError(`No active SMS template for ${code}/${language}.`);
    }

    let body = template.body;
    for (const [key, value] of Object.entries(variables)) {
      body = body.replaceAll(`{{${key}}}`, value);
    }
    if (/\{\{[a-zA-Z0-9_]+\}\}/.test(body)) {
      throw new ValidationError(`Unresolved placeholder in SMS template ${code}/${language}.`);
    }
    if (body.length > 480) {
      throw new ValidationError(
        `Rendered SMS template ${code}/${language} exceeds 480 characters.`,
      );
    }
    return body;
  }
}
