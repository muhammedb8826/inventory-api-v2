import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { paginatedRepositoryFind } from '../common/utils/query.util';
import { Supplier } from '../database/entities/supplier.entity';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(Supplier)
    private readonly repo: Repository<Supplier>,
  ) {}

  findAll(query: { page?: number; limit?: number; search?: string }) {
    const qb = this.repo
      .createQueryBuilder('s')
      .where('s.is_active = true')
      .orderBy('s.name', 'ASC');

    if (query.search?.trim()) {
      qb.andWhere(
        '(s.name ILIKE :search OR s.email ILIKE :search OR s.phone ILIKE :search)',
        { search: `%${query.search.trim()}%` },
      );
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    return qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount()
      .then(([data, total]) => ({
        data,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 1,
        },
      }));
  }

  async findOne(id: string) {
    const s = await this.repo.findOne({ where: { id } });
    if (!s) throw new NotFoundException('Supplier not found');
    return s;
  }

  create(dto: CreateSupplierDto) {
    return this.repo.save(this.repo.create(dto));
  }

  async update(id: string, dto: UpdateSupplierDto) {
    const s = await this.findOne(id);
    Object.assign(s, dto);
    return this.repo.save(s);
  }

  async remove(id: string) {
    const s = await this.findOne(id);
    s.isActive = false;
    return this.repo.save(s);
  }
}
