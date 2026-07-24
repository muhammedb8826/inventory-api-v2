import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../database/entities/customer.entity';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly repo: Repository<Customer>,
  ) {}

  findAll(query: { page?: number; limit?: number; search?: string }) {
    const qb = this.repo
      .createQueryBuilder('c')
      .where('c.is_active = true')
      .orderBy('c.name', 'ASC');

    if (query.search?.trim()) {
      qb.andWhere(
        '(c.name ILIKE :search OR c.email ILIKE :search OR c.phone ILIKE :search)',
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
    const c = await this.repo.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Customer not found');
    return c;
  }

  create(dto: CreateCustomerDto) {
    return this.repo.save(this.repo.create(dto));
  }

  async update(id: string, dto: UpdateCustomerDto) {
    const c = await this.findOne(id);
    Object.assign(c, dto);
    return this.repo.save(c);
  }

  async remove(id: string) {
    const c = await this.findOne(id);
    c.isActive = false;
    return this.repo.save(c);
  }
}
