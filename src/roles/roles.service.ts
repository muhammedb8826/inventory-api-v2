import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  applyIlikeSearch,
  paginatedQueryBuilder,
} from '../common/utils/query.util';
import { Permission } from '../database/entities/permission.entity';
import { Role } from '../database/entities/role.entity';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { RoleListQueryDto } from './dto/role-list-query.dto';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
  ) {}

  findAll(query: RoleListQueryDto) {
    const qb = this.roleRepo
      .createQueryBuilder('role')
      .leftJoinAndSelect('role.permissions', 'permissions')
      .orderBy('role.name', 'ASC');

    applyIlikeSearch(qb, query.search, ['role.name', 'role.description']);

    return paginatedQueryBuilder(qb, query.page, query.limit);
  }

  async findOne(id: string) {
    const role = await this.roleRepo.findOne({
      where: { id },
      relations: { permissions: true },
    });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  async create(dto: CreateRoleDto) {
    const permissions = await this.permissionRepo.find({
      where: { id: In(dto.permissionIds) },
    });
    const role = this.roleRepo.create({
      name: dto.name,
      description: dto.description ?? null,
      isSystem: false,
      permissions,
    });
    return this.roleRepo.save(role);
  }

  async update(id: string, dto: UpdateRoleDto) {
    const role = await this.findOne(id);
    if (role.isSystem && dto.name && dto.name !== role.name) {
      throw new BadRequestException('Cannot rename system role');
    }
    if (dto.name) role.name = dto.name;
    if (dto.description !== undefined) role.description = dto.description;
    if (dto.permissionIds) {
      role.permissions = await this.permissionRepo.find({
        where: { id: In(dto.permissionIds) },
      });
    }
    return this.roleRepo.save(role);
  }

  async remove(id: string) {
    const role = await this.findOne(id);
    if (role.isSystem) {
      throw new BadRequestException('Cannot delete system role');
    }
    await this.roleRepo.remove(role);
    return { success: true };
  }
}
