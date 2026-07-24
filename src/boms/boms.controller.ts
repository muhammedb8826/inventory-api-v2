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
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { BomsService } from './boms.service';
import { BomListQueryDto, CreateBomDto, UpdateBomDto } from './dto/bom.dto';

@Controller('boms')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BomsController {
  constructor(private readonly bomsService: BomsService) {}

  @Get()
  @RequirePermissions('bom.read')
  findAll(@Query() query: BomListQueryDto) {
    return this.bomsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('bom.read')
  findOne(@Param('id') id: string) {
    return this.bomsService.findOne(id);
  }

  @Post()
  @RequirePermissions('bom.write')
  create(@Body() dto: CreateBomDto) {
    return this.bomsService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('bom.write')
  update(@Param('id') id: string, @Body() dto: UpdateBomDto) {
    return this.bomsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('bom.write')
  remove(@Param('id') id: string) {
    return this.bomsService.remove(id);
  }
}
