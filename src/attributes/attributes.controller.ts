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
import {
  CreateAttributeDto,
  CreateAttributeValueDto,
  UpdateAttributeDto,
  UpdateAttributeValueDto,
} from './dto/attribute.dto';
import { AttributesService } from './attributes.service';

@Controller('attributes')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttributesController {
  constructor(private readonly service: AttributesService) {}

  @Get()
  @RequirePermissions('attributes.read')
  list(@Query('includeInactive') includeInactive?: string) {
    return this.service.listAttributes(includeInactive === 'true');
  }

  @Post('values')
  @RequirePermissions('attributes.write')
  createValue(@Body() dto: CreateAttributeValueDto) {
    return this.service.createValue(dto);
  }

  @Patch('values/:valueId')
  @RequirePermissions('attributes.write')
  updateValue(
    @Param('valueId') valueId: string,
    @Body() dto: UpdateAttributeValueDto,
  ) {
    return this.service.updateValue(valueId, dto);
  }

  @Delete('values/:valueId')
  @RequirePermissions('attributes.write')
  deleteValue(@Param('valueId') valueId: string) {
    return this.service.deleteValue(valueId);
  }

  @Get(':id/values')
  @RequirePermissions('attributes.read')
  values(
    @Param('id') id: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.service.listValues(id, includeInactive === 'true');
  }

  @Get(':id')
  @RequirePermissions('attributes.read')
  one(@Param('id') id: string) {
    return this.service.findAttribute(id);
  }

  @Post()
  @RequirePermissions('attributes.write')
  create(@Body() dto: CreateAttributeDto) {
    return this.service.createAttribute(dto);
  }

  @Patch(':id')
  @RequirePermissions('attributes.write')
  update(@Param('id') id: string, @Body() dto: UpdateAttributeDto) {
    return this.service.updateAttribute(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('attributes.write')
  remove(@Param('id') id: string) {
    return this.service.deleteAttribute(id);
  }
}
