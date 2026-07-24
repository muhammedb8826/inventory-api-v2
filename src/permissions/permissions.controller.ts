import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { applyIlikeSearch } from '../common/utils/query.util';
import { Permission } from '../database/entities/permission.entity';
import { PermissionListQueryDto } from './dto/permission-list-query.dto';

@Controller('permissions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PermissionsController {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
  ) {}

  @Get()
  @RequirePermissions('roles.read')
  findAll(@Query() query: PermissionListQueryDto) {
    const qb = this.permissionRepo
      .createQueryBuilder('permission')
      .orderBy('permission.module', 'ASC')
      .addOrderBy('permission.code', 'ASC');

    if (query.module?.trim()) {
      qb.andWhere('permission.module = :module', {
        module: query.module.trim(),
      });
    }
    applyIlikeSearch(qb, query.search, [
      'permission.code',
      'permission.name',
      'permission.module',
    ]);

    return qb.getMany();
  }
}
