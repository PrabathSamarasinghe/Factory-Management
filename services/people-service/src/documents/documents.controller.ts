import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { assertPermission, readActorId } from '../common/request';
import { CreateDocumentInput, DocumentsService, RecordConsentInput } from './documents.service';

@Controller('persons/:id')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get('documents/upload-url')
  getUploadUrl(
    @Param('id') personId: string,
    @Query('filename') filename: string,
    @Query('mime') mime: string,
    @Query('sizeBytes') sizeBytes: string,
    @Req() req: Request,
  ) {
    assertPermission(req, 'document:write');
    return this.documentsService.getUploadPresignedUrl(
      personId,
      filename || 'file.bin',
      mime || 'application/pdf',
      sizeBytes ? Number(sizeBytes) : undefined,
    );
  }

  @Post('documents')
  addDocument(
    @Param('id') personId: string,
    @Body() body: CreateDocumentInput,
    @Req() req: Request,
  ) {
    assertPermission(req, 'document:write');
    return this.documentsService.addDocument(personId, body, readActorId(req));
  }

  @Get('documents')
  listDocuments(@Param('id') personId: string, @Req() req: Request) {
    assertPermission(req, 'document:read');
    return this.documentsService.listDocuments(personId);
  }

  @Delete('documents/:documentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDocument(
    @Param('id') personId: string,
    @Param('documentId') documentId: string,
    @Req() req: Request,
  ) {
    assertPermission(req, 'document:write');
    await this.documentsService.deleteDocument(documentId, personId);
  }

  @Post('consents')
  recordConsent(@Param('id') personId: string, @Body() body: RecordConsentInput, @Req() req: Request) {
    assertPermission(req, 'consent:write');
    return this.documentsService.recordConsent(personId, body, { actorId: readActorId(req) });
  }

  @Get('consents')
  listConsents(@Param('id') personId: string, @Req() req: Request) {
    assertPermission(req, 'consent:read');
    return this.documentsService.listConsents(personId);
  }
}
