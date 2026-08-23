import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  applyIlikeSearch,
  paginatedQueryBuilder,
} from '../common/utils/query.util';
import { BomLine } from '../database/entities/bom-line.entity';
import { Bom } from '../database/entities/bom.entity';
import { Item } from '../database/entities/item.entity';
import {
  BomListQueryDto,
  BomLineDto,
  CreateBomDto,
  UpdateBomDto,
} from './dto/bom.dto';

@Injectable()
export class BomsService {
  constructor(
    @InjectRepository(Bom)
    private readonly bomRepo: Repository<Bom>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
  ) {}

  findAll(query: BomListQueryDto) {
    const qb = this.bomRepo
      .createQueryBuilder('bom')
      .leftJoinAndSelect('bom.finishedItem', 'finishedItem')
      .leftJoinAndSelect('bom.lines', 'lines')
      .leftJoinAndSelect('lines.componentItem', 'componentItem')
      .orderBy('bom.updated_at', 'DESC');

    if (query.finishedItemId) {
      qb.andWhere('bom.finished_item_id = :finishedItemId', {
        finishedItemId: query.finishedItemId,
      });
    }
    if (query.isActive === 'true') {
      qb.andWhere('bom.is_active = true');
    } else if (query.isActive === 'false') {
      qb.andWhere('bom.is_active = false');
    }
    applyIlikeSearch(qb, query.search, [
      'bom.name',
      'bom.version',
      'finishedItem.description',
      'finishedItem.sku',
    ]);

    return paginatedQueryBuilder(qb, query.page, query.limit);
  }

  async findOne(id: string) {
    const bom = await this.bomRepo.findOne({
      where: { id },
      relations: {
        finishedItem: true,
        lines: { componentItem: true },
      },
    });
    if (!bom) throw new NotFoundException('BOM not found');
    return bom;
  }

  async create(dto: CreateBomDto) {
    await this.assertFinishedItem(dto.finishedItemId);
    await this.assertLines(dto.finishedItemId, dto.lines);

    const bom = await this.bomRepo.save(
      this.bomRepo.create({
        finishedItemId: dto.finishedItemId,
        name: dto.name.trim(),
        version: dto.version?.trim() || null,
        notes: dto.notes?.trim() || null,
        isActive: true,
        lines: dto.lines.map((line) =>
          Object.assign(new BomLine(), {
            componentItemId: line.componentItemId,
            quantity: line.quantity.toFixed(3),
            scrapPercent: (line.scrapPercent ?? 0).toFixed(2),
          }),
        ),
      }),
    );
    return this.findOne(bom.id);
  }

  async update(id: string, dto: UpdateBomDto) {
    const bom = await this.findOne(id);

    if (dto.finishedItemId !== undefined) {
      await this.assertFinishedItem(dto.finishedItemId);
      bom.finishedItemId = dto.finishedItemId;
    }

    if (dto.name !== undefined) bom.name = dto.name.trim();
    if (dto.version !== undefined) bom.version = dto.version?.trim() || null;
    if (dto.notes !== undefined) bom.notes = dto.notes?.trim() || null;
    if (dto.isActive !== undefined) bom.isActive = dto.isActive;

    const { lines: _lines, ...header } = bom;
    await this.bomRepo.save(header);

    if (dto.lines) {
      await this.assertLines(bom.finishedItemId, dto.lines as BomLineDto[]);
      const lineRepo = this.bomRepo.manager.getRepository(BomLine);
      await lineRepo.delete({ bomId: id });
      await lineRepo.save(
        dto.lines.map((line) =>
          lineRepo.create({
            bomId: id,
            componentItemId: line.componentItemId,
            quantity: line.quantity.toFixed(3),
            scrapPercent: (line.scrapPercent ?? 0).toFixed(2),
          }),
        ),
      );
    }

    return this.findOne(id);
  }

  async remove(id: string) {
    const bom = await this.findOne(id);
    bom.isActive = false;
    await this.bomRepo.save(bom);
    return { success: true };
  }

  private async assertFinishedItem(finishedItemId: string) {
    const item = await this.itemRepo.findOne({ where: { id: finishedItemId } });
    if (!item) throw new BadRequestException('Finished item not found');
    if (!item.isActive) {
      throw new BadRequestException('Finished item is inactive');
    }
  }

  private async assertLines(finishedItemId: string, lines: BomLineDto[]) {
    const seen = new Set<string>();
    for (const line of lines) {
      if (line.componentItemId === finishedItemId) {
        throw new BadRequestException(
          'BOM cannot include the finished item as a component',
        );
      }
      if (seen.has(line.componentItemId)) {
        throw new BadRequestException('Duplicate component in BOM lines');
      }
      seen.add(line.componentItemId);

      const component = await this.itemRepo.findOne({
        where: { id: line.componentItemId },
      });
      if (!component) {
        throw new BadRequestException(
          `Component item not found: ${line.componentItemId}`,
        );
      }
      if (!component.isActive) {
        throw new BadRequestException(
          `Component item is inactive: ${component.description}`,
        );
      }
    }
  }
}
