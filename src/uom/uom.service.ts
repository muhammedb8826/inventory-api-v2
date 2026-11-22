import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { Item } from '../database/entities/item.entity';
import { ItemUom } from '../database/entities/item-uom.entity';
import { Uom } from '../database/entities/uom.entity';
import { UomCategory } from '../database/entities/uom-category.entity';
import {
  ConvertQtyDto,
  CreateUomCategoryDto,
  CreateUomDto,
  UpdateUomCategoryDto,
  UpdateUomDto,
  UpsertItemUomDto,
} from './dto/uom.dto';
import { UomConversionService } from './uom-conversion.service';

type SeedUom = {
  code: string;
  name: string;
  symbol: string;
  conversionFactor: number;
  isBase?: boolean;
};

type SeedCategory = {
  code: string;
  name: string;
  description: string;
  hasConstantWidth?: boolean;
  uoms: SeedUom[];
};

const STANDARD_CATEGORIES: SeedCategory[] = [
  {
    code: 'COUNT',
    name: 'Count',
    description: 'Discrete units (pieces, packs, boxes)',
    uoms: [
      {
        code: 'PCS',
        name: 'Piece',
        symbol: 'pcs',
        conversionFactor: 1,
        isBase: true,
      },
      { code: 'PACK', name: 'Pack', symbol: 'pck', conversionFactor: 12 },
      { code: 'DOZEN', name: 'Dozen', symbol: 'dz', conversionFactor: 12 },
      { code: 'BOX', name: 'Box', symbol: 'box', conversionFactor: 24 },
    ],
  },
  {
    code: 'LENGTH',
    name: 'Length',
    description:
      'Linear measure; pair with Area + item width for fabric/carpet',
    uoms: [
      {
        code: 'M',
        name: 'Meter',
        symbol: 'm',
        conversionFactor: 1,
        isBase: true,
      },
      { code: 'CM', name: 'Centimeter', symbol: 'cm', conversionFactor: 0.01 },
      { code: 'MM', name: 'Millimeter', symbol: 'mm', conversionFactor: 0.001 },
      { code: 'FT', name: 'Foot', symbol: 'ft', conversionFactor: 0.3048 },
      { code: 'IN', name: 'Inch', symbol: 'in', conversionFactor: 0.0254 },
    ],
  },
  {
    code: 'AREA',
    name: 'Area',
    description:
      'Surface measure (sqm). Stock fabric/carpet here; sell by Length with uomWidth',
    hasConstantWidth: true,
    uoms: [
      {
        code: 'SQM',
        name: 'Square Meter',
        symbol: 'sqm',
        conversionFactor: 1,
        isBase: true,
      },
      {
        code: 'SQCM',
        name: 'Square Centimeter',
        symbol: 'sqcm',
        conversionFactor: 0.0001,
      },
      {
        code: 'SQFT',
        name: 'Square Foot',
        symbol: 'sqft',
        conversionFactor: 0.09290304,
      },
    ],
  },
  {
    code: 'MASS',
    name: 'Mass',
    description: 'Weight',
    uoms: [
      {
        code: 'KG',
        name: 'Kilogram',
        symbol: 'kg',
        conversionFactor: 1,
        isBase: true,
      },
      { code: 'G', name: 'Gram', symbol: 'g', conversionFactor: 0.001 },
      { code: 'LB', name: 'Pound', symbol: 'lb', conversionFactor: 0.45359237 },
    ],
  },
  {
    code: 'VOLUME',
    name: 'Volume',
    description: 'Liquid / capacity',
    uoms: [
      {
        code: 'L',
        name: 'Liter',
        symbol: 'L',
        conversionFactor: 1,
        isBase: true,
      },
      { code: 'ML', name: 'Milliliter', symbol: 'mL', conversionFactor: 0.001 },
    ],
  },
];

@Injectable()
export class UomService implements OnModuleInit {
  constructor(
    @InjectRepository(UomCategory)
    private readonly categoryRepo: Repository<UomCategory>,
    @InjectRepository(Uom)
    private readonly uomRepo: Repository<Uom>,
    @InjectRepository(ItemUom)
    private readonly itemUomRepo: Repository<ItemUom>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    private readonly conversion: UomConversionService,
  ) {}

  async onModuleInit() {
    await this.ensureStandards();
  }

  /**
   * Seed ERP-standard categories only on an empty catalog so user deletes stay gone.
   */
  async ensureStandards() {
    const existingCount = await this.categoryRepo.count();
    if (existingCount === 0) {
      for (const cat of STANDARD_CATEGORIES) {
        const category = await this.categoryRepo.save(
          this.categoryRepo.create({
            id: randomUUID(),
            code: cat.code,
            name: cat.name,
            description: cat.description,
            isActive: true,
            hasConstantWidth: Boolean(cat.hasConstantWidth),
          }),
        );

        for (const u of cat.uoms) {
          await this.uomRepo.save(
            this.uomRepo.create({
              id: randomUUID(),
              categoryId: category.id,
              code: u.code,
              name: u.name,
              symbol: u.symbol,
              conversionFactor: u.conversionFactor.toFixed(9),
              isBase: Boolean(u.isBase),
              isActive: true,
            }),
          );
        }
      }
    }

    // Backfill items that only have free-text unit
    const pcs = await this.uomRepo.findOne({ where: { code: 'PCS' } });
    if (pcs) {
      await this.itemRepo
        .createQueryBuilder()
        .update(Item)
        .set({
          stockUomId: pcs.id,
          salesUomId: pcs.id,
          purchaseUomId: pcs.id,
          unit: pcs.symbol,
        })
        .where('stock_uom_id IS NULL')
        .execute();
    }
  }

  listCategories(includeInactive = false) {
    return this.categoryRepo.find({
      where: includeInactive ? {} : { isActive: true },
      relations: { uoms: true },
      order: { name: 'ASC', uoms: { conversionFactor: 'ASC', symbol: 'ASC' } },
    });
  }

  async findCategory(id: string, includeInactiveUoms = true) {
    const category = await this.categoryRepo.findOne({
      where: { id },
      relations: { uoms: true },
      order: { uoms: { conversionFactor: 'ASC', symbol: 'ASC' } },
    });
    if (!category) throw new NotFoundException('Category not found');
    if (!includeInactiveUoms) {
      category.uoms = (category.uoms ?? []).filter((u) => u.isActive);
    }
    return category;
  }

  listUoms(categoryId?: string, includeInactive = false) {
    return this.uomRepo.find({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        ...(categoryId ? { categoryId } : {}),
      },
      relations: { category: true },
      order: { symbol: 'ASC' },
    });
  }

  async findUom(id: string) {
    const uom = await this.uomRepo.findOne({
      where: { id },
      relations: { category: true },
    });
    if (!uom) throw new NotFoundException('UOM not found');
    return uom;
  }

  async findByCode(code: string) {
    return this.uomRepo.findOne({
      where: { code: code.trim().toUpperCase() },
      relations: { category: true },
    });
  }

  async createCategory(dto: CreateUomCategoryDto) {
    const code = dto.code.trim().toUpperCase();
    const exists = await this.categoryRepo.findOne({ where: { code } });
    if (exists) throw new BadRequestException('Category code already exists');
    return this.categoryRepo.save(
      this.categoryRepo.create({
        code,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        isActive: dto.isActive ?? true,
        hasConstantWidth: dto.hasConstantWidth ?? false,
      }),
    );
  }

  async updateCategory(id: string, dto: UpdateUomCategoryDto) {
    const row = await this.categoryRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Category not found');
    if (dto.code !== undefined) {
      row.code = dto.code.trim().toUpperCase();
    }
    if (dto.name !== undefined) row.name = dto.name.trim();
    if (dto.description !== undefined) {
      row.description = dto.description?.trim() || null;
    }
    if (dto.isActive !== undefined) row.isActive = dto.isActive;
    if (dto.hasConstantWidth !== undefined) {
      row.hasConstantWidth = dto.hasConstantWidth;
    }
    return this.categoryRepo.save(row);
  }

  async deleteCategory(id: string) {
    const category = await this.findCategory(id, true);
    const units = category.uoms ?? [];
    for (const uom of units) {
      await this.assertUomUnused(uom.id);
    }
    if (units.length) {
      await this.uomRepo.remove(units);
    }
    await this.categoryRepo.remove(category);
    return { success: true };
  }

  async createUom(dto: CreateUomDto) {
    const category = await this.categoryRepo.findOne({
      where: { id: dto.categoryId },
    });
    if (!category) throw new NotFoundException('Category not found');

    const code = dto.code.trim().toUpperCase();
    const exists = await this.uomRepo.findOne({ where: { code } });
    if (exists) throw new BadRequestException('UOM code already exists');

    if (dto.isBase) {
      await this.uomRepo.update(
        { categoryId: dto.categoryId, isBase: true },
        { isBase: false },
      );
    }

    return this.uomRepo.save(
      this.uomRepo.create({
        categoryId: dto.categoryId,
        code,
        name: dto.name.trim(),
        symbol: dto.symbol.trim(),
        conversionFactor: dto.conversionFactor.toFixed(9),
        isBase: Boolean(dto.isBase),
        isActive: dto.isActive ?? true,
      }),
    );
  }

  async updateUom(id: string, dto: UpdateUomDto) {
    const row = await this.findUom(id);
    if (dto.categoryId !== undefined) row.categoryId = dto.categoryId;
    if (dto.code !== undefined) row.code = dto.code.trim().toUpperCase();
    if (dto.name !== undefined) row.name = dto.name.trim();
    if (dto.symbol !== undefined) row.symbol = dto.symbol.trim();
    if (dto.conversionFactor !== undefined) {
      row.conversionFactor = dto.conversionFactor.toFixed(9);
    }
    if (dto.isActive !== undefined) row.isActive = dto.isActive;
    if (dto.isBase === true) {
      await this.uomRepo.update(
        { categoryId: row.categoryId, isBase: true },
        { isBase: false },
      );
      row.isBase = true;
    } else if (dto.isBase === false) {
      row.isBase = false;
    }
    return this.uomRepo.save(row);
  }

  async deleteUom(id: string) {
    const row = await this.findUom(id);
    await this.assertUomUnused(id);
    await this.uomRepo.remove(row);
    return { success: true };
  }

  private async assertUomUnused(id: string) {
    const usage = await this.uomRepo.query(
      `
      SELECT (
        (SELECT COUNT(*)::int FROM items
          WHERE stock_uom_id = $1 OR sales_uom_id = $1 OR purchase_uom_id = $1)
        + (SELECT COUNT(*)::int FROM item_uoms WHERE uom_id = $1)
        + (SELECT COUNT(*)::int FROM sale_lines WHERE uom_id = $1)
        + (SELECT COUNT(*)::int FROM purchase_lines WHERE uom_id = $1)
        + (SELECT COUNT(*)::int FROM bom_lines WHERE uom_id = $1)
      ) AS count
      `,
      [id],
    );
    const count = Number(usage?.[0]?.count ?? 0);
    if (count > 0) {
      throw new BadRequestException(
        'Cannot delete because this unit is used on items or documents',
      );
    }
  }

  async listItemUoms(itemId: string) {
    return this.itemUomRepo.find({
      where: { itemId },
      relations: { uom: { category: true } },
      order: { createdAt: 'ASC' },
    });
  }

  async upsertItemUom(itemId: string, dto: UpsertItemUomDto) {
    const item = await this.itemRepo.findOne({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Item not found');
    await this.findUom(dto.uomId);

    let row = await this.itemUomRepo.findOne({
      where: { itemId, uomId: dto.uomId },
    });
    if (!row) {
      row = this.itemUomRepo.create({
        itemId,
        uomId: dto.uomId,
        conversionFactor: dto.conversionFactor.toFixed(9),
      });
    } else {
      row.conversionFactor = dto.conversionFactor.toFixed(9);
    }
    return this.itemUomRepo.save(row);
  }

  async removeItemUom(itemId: string, uomId: string) {
    const row = await this.itemUomRepo.findOne({ where: { itemId, uomId } });
    if (!row) throw new NotFoundException('Item UOM not found');
    await this.itemUomRepo.remove(row);
    return { success: true };
  }

  async convert(dto: ConvertQtyDto) {
    const item = await this.itemRepo.findOne({
      where: { id: dto.itemId },
      relations: {
        stockUom: { category: true },
        itemUoms: true,
      },
    });
    if (!item) throw new NotFoundException('Item not found');

    const stockQty = await this.conversion.toStockQuantity({
      item,
      fromUomId: dto.fromUomId,
      quantity: dto.quantity,
    });

    if (!dto.toUomId || dto.toUomId === item.stockUomId) {
      return {
        quantity: stockQty,
        uomId: item.stockUomId,
        stockQuantity: stockQty,
      };
    }

    const converted = await this.conversion.fromStockQuantity(
      item,
      dto.toUomId,
      stockQty,
    );
    return {
      quantity: converted,
      uomId: dto.toUomId,
      stockQuantity: stockQty,
    };
  }
}
