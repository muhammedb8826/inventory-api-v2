import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { PublicCreateInquiryDto } from './dto/inquiry.dto';
import { PublicCatalogQueryDto } from './dto/public-catalog-query.dto';
import { InquiriesService } from './inquiries.service';

/** Unauthenticated website / landing-page submissions. */
@Controller('public')
export class PublicInquiriesController {
  constructor(private readonly service: InquiriesService) {}

  @Post('inquiries')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: PublicCreateInquiryDto) {
    return this.service.createPublic(dto);
  }

  /** Active catalog for public inquiry product picker (no prices / stock). */
  @Get('catalog')
  catalog(@Query() query: PublicCatalogQueryDto) {
    return this.service.findPublicCatalog(query);
  }
}
