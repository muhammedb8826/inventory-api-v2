import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LocationType } from '../common/enums';
import {
  applyIlikeSearch,
  paginatedQueryBuilder,
} from '../common/utils/query.util';
import { Location } from '../database/entities/location.entity';
import { CreateLocationDto, UpdateLocationDto } from './dto/location.dto';
import { LocationListQueryDto } from './dto/location-list-query.dto';

@Injectable()
export class LocationsService {
  constructor(
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
  ) {}

  findAll(query: LocationListQueryDto) {
    const qb = this.locationRepo
      .createQueryBuilder('location')
      .orderBy('location.name', 'ASC');

    if (query.type) {
      qb.andWhere('location.type = :type', { type: query.type });
    }
    if (query.includeInactive !== 'true') {
      qb.andWhere('location.is_active = true');
    }
    applyIlikeSearch(qb, query.search, ['location.name']);

    return paginatedQueryBuilder(qb, query.page, query.limit);
  }

  async findOne(id: string) {
    const loc = await this.locationRepo.findOne({ where: { id } });
    if (!loc) throw new NotFoundException('Location not found');
    return loc;
  }

  create(dto: CreateLocationDto) {
    return this.locationRepo.save(this.locationRepo.create(dto));
  }

  async update(id: string, dto: UpdateLocationDto) {
    const loc = await this.findOne(id);
    Object.assign(loc, dto);
    return this.locationRepo.save(loc);
  }

  async remove(id: string) {
    const loc = await this.findOne(id);
    loc.isActive = false;
    return this.locationRepo.save(loc);
  }
}
