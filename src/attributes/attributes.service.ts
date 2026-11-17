import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { ProductAttribute } from '../database/entities/product-attribute.entity';
import { ProductAttributeValue } from '../database/entities/product-attribute-value.entity';
import {
  CreateAttributeDto,
  CreateAttributeValueDto,
  UpdateAttributeDto,
  UpdateAttributeValueDto,
} from './dto/attribute.dto';

type SeedValue = {
  code: string;
  name: string;
  colorHex?: string;
  sequence: number;
};

type SeedAttribute = {
  code: string;
  name: string;
  description: string;
  displayType: string;
  sequence: number;
  values: SeedValue[];
};

const STANDARD_ATTRIBUTES: SeedAttribute[] = [
  {
    code: 'COLOR',
    name: 'Color',
    description: 'Product color',
    displayType: 'color',
    sequence: 10,
    values: [
      { code: 'BLACK', name: 'Black', colorHex: '#111111', sequence: 10 },
      { code: 'WHITE', name: 'White', colorHex: '#FFFFFF', sequence: 20 },
      { code: 'RED', name: 'Red', colorHex: '#DC2626', sequence: 30 },
      { code: 'BLUE', name: 'Blue', colorHex: '#2563EB', sequence: 40 },
      { code: 'GREEN', name: 'Green', colorHex: '#16A34A', sequence: 50 },
      { code: 'GRAY', name: 'Gray', colorHex: '#6B7280', sequence: 60 },
    ],
  },
  {
    code: 'SIZE',
    name: 'Size',
    description: 'Apparel / general size',
    displayType: 'select',
    sequence: 20,
    values: [
      { code: 'XS', name: 'XS', sequence: 10 },
      { code: 'S', name: 'S', sequence: 20 },
      { code: 'M', name: 'M', sequence: 30 },
      { code: 'L', name: 'L', sequence: 40 },
      { code: 'XL', name: 'XL', sequence: 50 },
      { code: '2XL', name: '2XL', sequence: 60 },
      { code: '3XL', name: '3XL', sequence: 70 },
      { code: '4XL', name: '4XL', sequence: 80 },
    ],
  },
];

@Injectable()
export class AttributesService implements OnModuleInit {
  constructor(
    @InjectRepository(ProductAttribute)
    private readonly attributeRepo: Repository<ProductAttribute>,
    @InjectRepository(ProductAttributeValue)
    private readonly valueRepo: Repository<ProductAttributeValue>,
  ) {}

  async onModuleInit() {
    await this.ensureStandards();
  }

  /** Seed Color/Size only when the catalog is empty so deletes stay deleted. */
  async ensureStandards() {
    const existingCount = await this.attributeRepo.count();
    if (existingCount > 0) return;

    for (const seed of STANDARD_ATTRIBUTES) {
      let attribute = await this.attributeRepo.findOne({
        where: { code: seed.code },
      });
      if (!attribute) {
        attribute = await this.attributeRepo.save(
          this.attributeRepo.create({
            id: randomUUID(),
            code: seed.code,
            name: seed.name,
            description: seed.description,
            displayType: seed.displayType,
            sequence: seed.sequence,
            isActive: true,
          }),
        );
      }

      for (const v of seed.values) {
        const existing = await this.valueRepo.findOne({
          where: { attributeId: attribute.id, code: v.code },
        });
        if (existing) continue;
        await this.valueRepo.save(
          this.valueRepo.create({
            id: randomUUID(),
            attributeId: attribute.id,
            code: v.code,
            name: v.name,
            colorHex: v.colorHex ?? null,
            sequence: v.sequence,
            isActive: true,
          }),
        );
      }
    }
  }

  listAttributes(includeInactive = false) {
    return this.attributeRepo.find({
      where: includeInactive ? {} : { isActive: true },
      relations: { values: true },
      order: { sequence: 'ASC', name: 'ASC', values: { sequence: 'ASC' } },
    });
  }

  async findAttribute(id: string) {
    const attribute = await this.attributeRepo.findOne({
      where: { id },
      relations: { values: true },
      order: { values: { sequence: 'ASC', name: 'ASC' } },
    });
    if (!attribute) throw new NotFoundException('Attribute not found');
    return attribute;
  }

  async createAttribute(dto: CreateAttributeDto) {
    const code = dto.code.trim().toUpperCase();
    const exists = await this.attributeRepo.findOne({ where: { code } });
    if (exists) throw new BadRequestException('Attribute code already exists');
    return this.attributeRepo.save(
      this.attributeRepo.create({
        code,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        displayType: dto.displayType ?? 'select',
        sequence: dto.sequence ?? 10,
        isActive: dto.isActive ?? true,
      }),
    );
  }

  async updateAttribute(id: string, dto: UpdateAttributeDto) {
    const row = await this.attributeRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Attribute not found');
    if (dto.code !== undefined) row.code = dto.code.trim().toUpperCase();
    if (dto.name !== undefined) row.name = dto.name.trim();
    if (dto.description !== undefined) {
      row.description = dto.description?.trim() || null;
    }
    if (dto.displayType !== undefined) row.displayType = dto.displayType;
    if (dto.sequence !== undefined) row.sequence = dto.sequence;
    if (dto.isActive !== undefined) row.isActive = dto.isActive;
    return this.attributeRepo.save(row);
  }

  listValues(attributeId?: string, includeInactive = false) {
    return this.valueRepo.find({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        ...(attributeId ? { attributeId } : {}),
      },
      relations: { attribute: true },
      order: { sequence: 'ASC', name: 'ASC' },
    });
  }

  async findValue(id: string) {
    const value = await this.valueRepo.findOne({
      where: { id },
      relations: { attribute: true },
    });
    if (!value) throw new NotFoundException('Attribute value not found');
    return value;
  }

  async createValue(dto: CreateAttributeValueDto) {
    const attribute = await this.attributeRepo.findOne({
      where: { id: dto.attributeId },
    });
    if (!attribute) throw new NotFoundException('Attribute not found');

    const code = dto.code.trim().toUpperCase();
    const exists = await this.valueRepo.findOne({
      where: { attributeId: dto.attributeId, code },
    });
    if (exists) {
      throw new BadRequestException(
        'Value code already exists on this attribute',
      );
    }

    return this.valueRepo.save(
      this.valueRepo.create({
        attributeId: dto.attributeId,
        code,
        name: dto.name.trim(),
        colorHex: normalizeHex(dto.colorHex),
        sequence: dto.sequence ?? 10,
        isActive: dto.isActive ?? true,
      }),
    );
  }

  async updateValue(id: string, dto: UpdateAttributeValueDto) {
    const row = await this.findValue(id);
    if (dto.attributeId !== undefined) row.attributeId = dto.attributeId;
    if (dto.code !== undefined) row.code = dto.code.trim().toUpperCase();
    if (dto.name !== undefined) row.name = dto.name.trim();
    if (dto.colorHex !== undefined) row.colorHex = normalizeHex(dto.colorHex);
    if (dto.sequence !== undefined) row.sequence = dto.sequence;
    if (dto.isActive !== undefined) row.isActive = dto.isActive;
    return this.valueRepo.save(row);
  }

  async deleteValue(id: string) {
    const row = await this.findValue(id);
    await this.valueRepo.remove(row);
    return { success: true };
  }

  async deleteAttribute(id: string) {
    const row = await this.findAttribute(id);
    await this.attributeRepo.remove(row);
    return { success: true };
  }
}

function normalizeHex(raw?: string | null): string | null {
  if (raw === undefined || raw === null) return null;
  const v = raw.trim();
  if (!v) return null;
  const hex = v.startsWith('#') ? v : `#${v}`;
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    throw new BadRequestException('colorHex must be #RRGGBB');
  }
  return hex.toUpperCase();
}
