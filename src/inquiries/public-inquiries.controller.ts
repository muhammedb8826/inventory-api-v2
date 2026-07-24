import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { PublicCreateInquiryDto } from './dto/inquiry.dto';
import { InquiriesService } from './inquiries.service';

/** Unauthenticated website / landing-page submissions. */
@Controller('public/inquiries')
export class PublicInquiriesController {
  constructor(private readonly service: InquiriesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: PublicCreateInquiryDto) {
    return this.service.createPublic(dto);
  }
}
