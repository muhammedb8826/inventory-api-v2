import { Controller, Get, Query } from '@nestjs/common';
import { PublicCatalogQueryDto } from './dto/public-catalog-query.dto';
import { InquiriesService } from './inquiries.service';

/** Public catalog only — website inquiry submissions are staff-created. */
@Controller('public')
export class PublicInquiriesController {
  constructor(private readonly service: InquiriesService) {}

  /** Active catalog for public product browsing (no prices / stock). */
  @Get('catalog')
  catalog(@Query() query: PublicCatalogQueryDto) {
    return this.service.findPublicCatalog(query);
  }
}
