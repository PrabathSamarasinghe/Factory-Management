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
import { CreateDocumentInput, DocumentsService, RecordConsentInput } from './documents.service';

@Controller('persons/:id')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get('documents/upload-url')
  getUploadUrl(
    @Param('id') personId: string,
    @Query('filename') filename: string,
    @Query('mime') mime: string,
  ) {
    return this.documentsService.getUploadPresignedUrl(personId, filename || 'file.bin', mime || 'application/octet-stream');
  }

  @Post('documents')
  addDocument(
    @Param('id') personId: string,
    @Body() body: CreateDocumentInput,
    @Req() req: Request,
  ) {
    const uploaderId = req.headers['x-user-id'] as string | undefined;
    return this.documentsService.addDocument(personId, body, uploaderId);
  }

  @Get('documents')
  listDocuments(@Param('id') personId: string) {
    return this.documentsService.listDocuments(personId);
  }

  @Delete('documents/:documentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDocument(
    @Param('id') personId: string,
    @Param('documentId') documentId: string,
  ) {
    await this.documentsService.deleteDocument(documentId, personId);
  }

  @Post('consents')
  recordConsent(
    @Param('id') personId: string,
    @Body() body: RecordConsentInput,
  ) {
    return this.documentsService.recordConsent(personId, body);
  }

  @Get('consents')
  listConsents(@Param('id') personId: string) {
    return this.documentsService.listConsents(personId);
  }
}
