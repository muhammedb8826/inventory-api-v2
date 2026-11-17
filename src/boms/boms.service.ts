import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { BomType } from '../common/enums';
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
import { UomConversionService } from '../uom/uom-conversion.service';
import { resolveLineUom } from '../uom/resolve-line-uom';

@Injectable()
export class BomsService {
  constructor(
    @InjectRepository(Bom)
    private readonly bomRepo: Repository<Bom>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    private readonly uomConversion: UomConversionService,
  ) {}

  private async mapBomLines(lines: BomLineDto[]) {
    const out: Partial<BomLine>[] = [];
    for (const line of lines) {
      const item = await this.itemRepo.findOne({
        where: { id: line.componentItemId },
        relations: {
          stockUom: { category: true },
          itemUoms: true,
        },
      });
      if (!item) {
        throw new BadRequestException(
          `Component item not found: ${line.componentItemId}`,
        );
      }
      const resolved = await resolveLineUom(
        this.uomConversion,
        item,
        'stock',
        line.quantity,
        line.uomId,
      );
      const scrap = line.scrapPercent ?? 0;
      const stockWithScrap = resolved.stockQuantity * (1 + scrap / 100);
      out.push({
        componentItemId: line.componentItemId,
        quantity: line.quantity.toFixed(3),
        uomId: resolved.uomId,
        stockQuantity: stockWithScrap.toFixed(3),
        scrapPercent: scrap.toFixed(2),
      });
    }
    return out;
  }

  /**
   * Catalog for BoM form:
   * - products: templates + standalone (no parent) — Odoo "Product"
   * - components: stockable items (non-templates)
   */
  async catalog() {
    const [products, components, variants] = await Promise.all([
      this.itemRepo.find({
        where: { isActive: true, parentItemId: IsNull() },
        relations: {
          stockUom: true,
          variants: {
            itemAttributeValues: { attributeValue: { attribute: true } },
          },
        },
        order: { description: 'ASC' },
      }),
      this.itemRepo.find({
        where: { isActive: true, isTemplate: false },
        relations: { stockUom: true, parentItem: true },
        order: { description: 'ASC' },
      }),
      this.itemRepo.find({
        where: { isActive: true, isTemplate: false },
        relations: {
          parentItem: true,
          itemAttributeValues: { attributeValue: { attribute: true } },
        },
        order: { description: 'ASC' },
      }),
    ]);

    const attachAttrs = (item: Item) => {
      const links = item.itemAttributeValues ?? [];
      item.attributeValues = links
        .map((l) => l.attributeValue)
        .filter(Boolean);
      return item;
    };

    return {
      products: products.map((p) => {
        if (p.variants) p.variants = p.variants.map(attachAttrs);
        return p;
      }),
      components: components.map(attachAttrs),
      variants: variants
        .filter((v) => Boolean(v.parentItemId))
        .map(attachAttrs),
    };
  }

  findAll(query: BomListQueryDto) {
    const qb = this.bomRepo
      .createQueryBuilder('bom')
      .leftJoinAndSelect('bom.finishedItem', 'finishedItem')
      .leftJoinAndSelect('bom.variantItem', 'variantItem')
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
      'variantItem.description',
      'variantItem.sku',
    ]);

    return paginatedQueryBuilder(qb, query.page, query.limit);
  }

  async findOne(id: string) {
    const bom = await this.bomRepo.findOne({
      where: { id },
      relations: {
        finishedItem: true,
        variantItem: {
          itemAttributeValues: { attributeValue: { attribute: true } },
        },
        lines: {
          componentItem: { stockUom: true },
          uom: true,
        },
      },
    });
    if (!bom) throw new NotFoundException('BOM not found');
    if (bom.variantItem) {
      const links = bom.variantItem.itemAttributeValues ?? [];
      bom.variantItem.attributeValues = links
        .map((l) => l.attributeValue)
        .filter(Boolean);
    }
    return bom;
  }

  async create(dto: CreateBomDto) {
    const finished = await this.assertFinishedItem(dto.finishedItemId);
    const variantItemId = await this.assertVariantItem(
      dto.finishedItemId,
      dto.variantItemId,
    );
    await this.assertLines(dto.finishedItemId, variantItemId, dto.lines);

    const reference =
      dto.name?.trim() ||
      finished.description?.trim() ||
      'BoM';

    const bom = await this.bomRepo.save(
      this.bomRepo.create({
        finishedItemId: dto.finishedItemId,
        variantItemId,
        name: reference.slice(0, 120),
        version: dto.version?.trim() || null,
        quantity: (dto.quantity ?? 1).toFixed(3),
        bomType: dto.bomType ?? BomType.MANUFACTURE,
        notes: dto.notes?.trim() || null,
        isActive: dto.isActive ?? true,
        lines: (await this.mapBomLines(dto.lines)).map((line) =>
          Object.assign(new BomLine(), line),
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

    if (dto.variantItemId !== undefined) {
      bom.variantItemId = await this.assertVariantItem(
        bom.finishedItemId,
        dto.variantItemId,
      );
    }

    if (dto.name !== undefined) bom.name = dto.name.trim();
    if (dto.version !== undefined) bom.version = dto.version?.trim() || null;
    if (dto.quantity !== undefined) bom.quantity = dto.quantity.toFixed(3);
    if (dto.bomType !== undefined) bom.bomType = dto.bomType;
    if (dto.notes !== undefined) bom.notes = dto.notes?.trim() || null;
    if (dto.isActive !== undefined) bom.isActive = dto.isActive;

    const { lines: _lines, ...header } = bom;
    await this.bomRepo.save(header);

    if (dto.lines) {
      await this.assertLines(
        bom.finishedItemId,
        bom.variantItemId,
        dto.lines as BomLineDto[],
      );
      const lineRepo = this.bomRepo.manager.getRepository(BomLine);
      await lineRepo.delete({ bomId: id });
      const mapped = await this.mapBomLines(dto.lines as BomLineDto[]);
      await lineRepo.save(
        mapped.map((line) =>
          lineRepo.create({
            bomId: id,
            ...line,
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
    if (!item) throw new BadRequestException('Product not found');
    if (!item.isActive) {
      throw new BadRequestException('Product is inactive');
    }
    if (item.parentItemId) {
      throw new BadRequestException(
        'Select the product (template), then optionally a product variant',
      );
    }
    return item;
  }

  private async assertVariantItem(
    finishedItemId: string,
    variantItemId?: string | null,
  ): Promise<string | null> {
    if (variantItemId === undefined || variantItemId === null || variantItemId === '') {
      return null;
    }
    const variant = await this.itemRepo.findOne({
      where: { id: variantItemId },
    });
    if (!variant) throw new BadRequestException('Product variant not found');
    if (!variant.isActive) {
      throw new BadRequestException('Product variant is inactive');
    }
    if (variant.parentItemId !== finishedItemId) {
      throw new BadRequestException(
        'Product variant must belong to the selected product',
      );
    }
    return variant.id;
  }

  private async assertLines(
    finishedItemId: string,
    variantItemId: string | null,
    lines: BomLineDto[],
  ) {
    const banned = new Set(
      [finishedItemId, variantItemId].filter(Boolean) as string[],
    );
    const seen = new Set<string>();
    for (const line of lines) {
      if (banned.has(line.componentItemId)) {
        throw new BadRequestException(
          'BOM cannot include the finished product/variant as a component',
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
      if (component.isTemplate) {
        throw new BadRequestException(
          `Use a stockable item (or variant), not template: ${component.description}`,
        );
      }
    }
  }
}
