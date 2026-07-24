import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import {
  CreateInquiryDto,
  InquiryListQueryDto,
  UpdateInquiryDto,
} from './dto/inquiry.dto';
import { InquiriesService } from './inquiries.service';

@Controller('inquiries')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InquiriesController {
  constructor(private readonly service: InquiriesService) {}

  @Get()
  @RequirePermissions('inquiries.read')
  findAll(@Query() query: InquiryListQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('inquiries.read')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions('inquiries.write')
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateInquiryDto) {
    return this.service.createInternal(dto, user.sub);
  }

  @Patch(':id')
  @RequirePermissions('inquiries.write')
  update(@Param('id') id: string, @Body() dto: UpdateInquiryDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('inquiries.write')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
