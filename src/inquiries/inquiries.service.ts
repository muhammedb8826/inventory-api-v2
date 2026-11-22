import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { parseDateRange } from '../common/dto/date-range.dto';
import {
  InquiryAssignmentStatus,
  InquiryPriority,
  InquirySource,
  InquiryStatus,
} from '../common/enums';
import {
  absoluteMediaUrl,
  publicBaseFromConfig,
} from '../common/utils/media-url.util';
import { Customer } from '../database/entities/customer.entity';
import { CustomerInquiryLine } from '../database/entities/customer-inquiry-line.entity';
import { CustomerInquiry } from '../database/entities/customer-inquiry.entity';
import { Item } from '../database/entities/item.entity';
import { Sale } from '../database/entities/sale.entity';
import { User } from '../database/entities/user.entity';
import {
  CreateInquiryDto,
  InquiryLineDto,
  InquiryListQueryDto,
  UpdateInquiryDto,
} from './dto/inquiry.dto';
import { PublicCatalogQueryDto } from './dto/public-catalog-query.dto';

@Injectable()
export class InquiriesService {
  constructor(
    @InjectRepository(CustomerInquiry)
    private readonly repo: Repository<CustomerInquiry>,
    @InjectRepository(CustomerInquiryLine)
    private readonly lineRepo: Repository<CustomerInquiryLine>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Sale)
    private readonly saleRepo: Repository<Sale>,
    private readonly config: ConfigService,
  ) {}

  private assertContactChannel(phone?: string | null, email?: string | null) {
    if (!phone?.trim() && !email?.trim()) {
      throw new BadRequestException('Provide at least a phone or email');
    }
  }

  private resolveLines(
    lines?: InquiryLineDto[],
    itemId?: string | null,
  ): InquiryLineDto[] {
    if (lines?.length) return lines;
    if (itemId) return [{ itemId }];
    return [];
  }

  private async assertLines(lines: InquiryLineDto[]) {
    const seen = new Set<string>();
    for (const line of lines) {
      if (seen.has(line.itemId)) {
        throw new BadRequestException('Duplicate item in inquiry lines');
      }
      seen.add(line.itemId);
      const item = await this.itemRepo.findOne({ where: { id: line.itemId } });
      if (!item) {
        throw new BadRequestException(`Item not found: ${line.itemId}`);
      }
      if (!item.isActive) {
        throw new BadRequestException(
          `Item is inactive: ${item.description ?? line.itemId}`,
        );
      }
    }
  }

  /** List title from catalog lines when staff skip free-text subject. */
  private async subjectFromLines(
    lines: InquiryLineDto[],
    fallback = 'Inquiry',
  ): Promise<string> {
    if (!lines.length) return fallback;
    const names: string[] = [];
    for (const line of lines) {
      const item = await this.itemRepo.findOne({ where: { id: line.itemId } });
      if (item?.description?.trim()) names.push(item.description.trim());
      else if (item?.sku?.trim()) names.push(item.sku.trim());
    }
    if (!names.length) return fallback;
    const joined = names.join(', ');
    return joined.length > 200 ? `${joined.slice(0, 197)}…` : joined;
  }

  private async assertOptionalRefs(opts: {
    customerId?: string | null;
    assignedToUserId?: string | null;
    convertedSaleId?: string | null;
  }) {
    if (opts.customerId) {
      const c = await this.customerRepo.findOne({
        where: { id: opts.customerId },
      });
      if (!c) throw new BadRequestException('Customer not found');
    }
    if (opts.assignedToUserId) {
      const user = await this.userRepo.findOne({
        where: { id: opts.assignedToUserId, isActive: true },
      });
      if (!user) {
        throw new BadRequestException('Assignee not found or inactive');
      }
    }
    if (opts.convertedSaleId) {
      const sale = await this.saleRepo.findOne({
        where: { id: opts.convertedSaleId },
      });
      if (!sale) throw new BadRequestException('Sale not found');
    }
  }

  private mapLineEntities(
    inquiryId: string,
    lines: InquiryLineDto[],
  ): CustomerInquiryLine[] {
    return lines.map((line) =>
      this.lineRepo.create({
        inquiryId,
        itemId: line.itemId,
        quantity: line.quantity !== undefined ? line.quantity.toFixed(3) : null,
        unitPrice:
          line.unitPrice !== undefined && line.unitPrice !== null
            ? Number(line.unitPrice).toFixed(2)
            : null,
        notes: line.notes?.trim() || null,
      }),
    );
  }

  private computeQuoteTotals(lines: InquiryLineDto[]): {
    subtotal: string | null;
    total: string | null;
  } {
    let sum = 0;
    let anyPriced = false;
    for (const line of lines) {
      if (line.unitPrice == null || !Number.isFinite(line.unitPrice)) continue;
      anyPriced = true;
      const qty =
        line.quantity != null && Number.isFinite(line.quantity)
          ? line.quantity
          : 1;
      sum += qty * line.unitPrice;
    }
    if (!anyPriced) return { subtotal: null, total: null };
    const fixed = sum.toFixed(2);
    return { subtotal: fixed, total: fixed };
  }

  /** When marking/keeping QUOTED, every line needs a unit price and validUntil. */
  private assertQuotedOffer(
    status: InquiryStatus,
    lines: InquiryLineDto[],
    validUntil: Date | null | undefined,
  ) {
    if (status !== InquiryStatus.QUOTED) return;
    if (!lines.length) {
      throw new BadRequestException(
        'A quoted inquiry needs at least one priced line',
      );
    }
    for (const line of lines) {
      if (
        line.unitPrice == null ||
        !Number.isFinite(line.unitPrice) ||
        line.unitPrice < 0
      ) {
        throw new BadRequestException(
          'Set a unit price on every line before marking as Quoted',
        );
      }
    }
    if (!validUntil) {
      throw new BadRequestException(
        'Set Valid until (quote expiry) before marking as Quoted',
      );
    }
  }

  private async replaceLines(inquiryId: string, lines: InquiryLineDto[]) {
    await this.assertLines(lines);
    await this.lineRepo.delete({ inquiryId });
    if (lines.length === 0) return;
    await this.lineRepo.save(this.mapLineEntities(inquiryId, lines));
  }

  private linesDtoFromEntities(lines: CustomerInquiryLine[]): InquiryLineDto[] {
    return (lines ?? []).map((line) => ({
      itemId: line.itemId,
      quantity:
        line.quantity != null ? parseFloat(String(line.quantity)) : undefined,
      unitPrice:
        line.unitPrice != null ? parseFloat(String(line.unitPrice)) : undefined,
      notes: line.notes ?? undefined,
    }));
  }

  findAll(query: InquiryListQueryDto) {
    const qb = this.repo
      .createQueryBuilder('i')
      .leftJoinAndSelect('i.customer', 'customer')
      .leftJoinAndSelect('i.lines', 'lines')
      .leftJoinAndSelect('lines.item', 'lineItem')
      .leftJoinAndSelect('i.assignedTo', 'assignedTo')
      .leftJoinAndSelect('i.createdBy', 'createdBy')
      .orderBy('i.createdAt', 'DESC')
      .addOrderBy('lines.id', 'ASC');

    if (query.status) {
      qb.andWhere('i.status = :status', { status: query.status });
    }
    if (query.source) {
      qb.andWhere('i.source = :source', { source: query.source });
    }
    if (query.priority) {
      qb.andWhere('i.priority = :priority', { priority: query.priority });
    }
    if (query.customerId) {
      qb.andWhere('i.customer_id = :customerId', {
        customerId: query.customerId,
      });
    }
    if (query.assignedToUserId) {
      qb.andWhere('i.assigned_to_user_id = :assignedToUserId', {
        assignedToUserId: query.assignedToUserId,
      });
    }
    if (query.createdById) {
      qb.andWhere('i.created_by_id = :createdById', {
        createdById: query.createdById,
      });
    }
    if (query.itemId) {
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM customer_inquiry_lines cil
          WHERE cil.inquiry_id = i.id AND cil.item_id = :itemId
        )`,
        { itemId: query.itemId },
      );
    }
    if (query.assignmentStatus) {
      qb.andWhere('i.assignment_status = :assignmentStatus', {
        assignmentStatus: query.assignmentStatus,
      });
    }

    if (query.search?.trim()) {
      const search = `%${query.search.trim()}%`;
      qb.andWhere(
        `(i.contact_name ILIKE :search
          OR i.email ILIKE :search
          OR i.phone ILIKE :search
          OR i.subject ILIKE :search
          OR i.message ILIKE :search
          OR i.reference ILIKE :search)`,
        { search },
      );
    }

    const { start, end } = parseDateRange(query.from, query.to);
    if (start) qb.andWhere('i.created_at >= :start', { start });
    if (end) qb.andWhere('i.created_at <= :end', { end });

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
    const row = await this.repo.findOne({
      where: { id },
      relations: {
        customer: true,
        lines: { item: true },
        assignedTo: true,
        createdBy: true,
        convertedSale: true,
      },
      order: { lines: { id: 'ASC' } },
    });
    if (!row) throw new NotFoundException('Inquiry not found');
    return row;
  }

  async createInternal(dto: CreateInquiryDto, createdById: string) {
    this.assertContactChannel(dto.phone, dto.email);
    const lines = this.resolveLines(dto.lines, dto.itemId);
    if (!lines.length) {
      throw new BadRequestException('Add at least one item line');
    }
    await this.assertOptionalRefs({
      customerId: dto.customerId,
    });
    await this.assertLines(lines);

    const totals = this.computeQuoteTotals(lines);
    const subject =
      dto.subject?.trim() || (await this.subjectFromLines(lines));
    const now = new Date();
    const draft = this.repo.create({
      contactName: dto.contactName.trim(),
      companyName: dto.companyName?.trim() || null,
      phone: dto.phone?.trim() || null,
      email: dto.email?.trim() || null,
      subject,
      message: dto.message?.trim() || '',
      priority: dto.priority ?? InquiryPriority.NORMAL,
      customerId: dto.customerId ?? null,
      /** Creator owns the quotation — no claim/assign pool. */
      assignedToUserId: createdById,
      assignmentStatus: InquiryAssignmentStatus.ACCEPTED,
      assignedAt: now,
      acceptedAt: now,
      internalNotes: dto.internalNotes?.trim() || null,
      followUpAt: dto.followUpAt ? new Date(dto.followUpAt) : null,
      requiredByAt: dto.requiredByAt ? new Date(dto.requiredByAt) : null,
      validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
      quotedAt: null,
      quoteTerms: dto.quoteTerms?.trim() || null,
      reference: dto.reference?.trim() || null,
      subtotal: totals.subtotal,
      total: totals.total,
      source: InquirySource.INTERNAL,
      status: InquiryStatus.DRAFT,
      createdById,
      convertedSaleId: null,
    });

    const row = await this.repo.save(draft);

    if (lines.length) {
      await this.lineRepo.save(this.mapLineEntities(row.id, lines));
    }

    return this.findOne(row.id);
  }

  async update(id: string, dto: UpdateInquiryDto, _actorUserId: string) {
    const row = await this.findOne(id);

    const nextPhone = dto.phone !== undefined ? dto.phone : row.phone;
    const nextEmail = dto.email !== undefined ? dto.email : row.email;
    if (dto.phone !== undefined || dto.email !== undefined) {
      this.assertContactChannel(nextPhone, nextEmail);
    }

    await this.assertOptionalRefs({
      customerId: dto.customerId,
      convertedSaleId: dto.convertedSaleId,
    });

    if (dto.contactName !== undefined) row.contactName = dto.contactName.trim();
    if (dto.companyName !== undefined) {
      row.companyName = dto.companyName?.trim() || null;
    }
    if (dto.phone !== undefined) row.phone = dto.phone?.trim() || null;
    if (dto.email !== undefined) row.email = dto.email?.trim() || null;
    if (dto.message !== undefined) row.message = dto.message?.trim() || '';
    const previousStatus = row.status;
    if (dto.status !== undefined) row.status = dto.status;
    if (dto.priority !== undefined) row.priority = dto.priority;
    if (dto.customerId !== undefined) row.customerId = dto.customerId;
    if (dto.internalNotes !== undefined) {
      row.internalNotes = dto.internalNotes?.trim() || null;
    }
    if (dto.followUpAt !== undefined) {
      row.followUpAt = dto.followUpAt ? new Date(dto.followUpAt) : null;
    }
    if (dto.requiredByAt !== undefined) {
      row.requiredByAt = dto.requiredByAt ? new Date(dto.requiredByAt) : null;
    }
    if (dto.validUntil !== undefined) {
      row.validUntil = dto.validUntil ? new Date(dto.validUntil) : null;
    }
    if (dto.quoteTerms !== undefined) {
      row.quoteTerms = dto.quoteTerms?.trim() || null;
    }
    if (dto.reference !== undefined) {
      row.reference = dto.reference?.trim() || null;
    }
    if (dto.convertedSaleId !== undefined) {
      row.convertedSaleId = dto.convertedSaleId;
      if (dto.convertedSaleId && dto.status === undefined) {
        row.status = InquiryStatus.ORDERED;
      }
    }

    const nextLinesDto =
      dto.lines !== undefined
        ? dto.lines
        : dto.itemId !== undefined
          ? dto.itemId
            ? [{ itemId: dto.itemId }]
            : []
          : this.linesDtoFromEntities(row.lines ?? []);

    if (dto.subject !== undefined && dto.subject.trim()) {
      row.subject = dto.subject.trim();
    } else if (dto.lines !== undefined || dto.itemId !== undefined) {
      row.subject = await this.subjectFromLines(nextLinesDto, row.subject);
    }

    this.assertQuotedOffer(row.status, nextLinesDto, row.validUntil);

    if (
      row.status === InquiryStatus.QUOTED &&
      previousStatus !== InquiryStatus.QUOTED &&
      !row.quotedAt
    ) {
      row.quotedAt = new Date();
    }

    const totals = this.computeQuoteTotals(nextLinesDto);
    row.subtotal = totals.subtotal;
    row.total = totals.total;

    const { lines: _existingLines, ...header } = row;
    await this.repo.save(header);

    if (dto.lines !== undefined) {
      await this.replaceLines(id, dto.lines);
    } else if (dto.itemId !== undefined) {
      await this.replaceLines(id, dto.itemId ? [{ itemId: dto.itemId }] : []);
    }

    return this.findOne(id);
  }

  async findPublicCatalog(query: PublicCatalogQueryDto) {
    const qb = this.itemRepo
      .createQueryBuilder('item')
      .where('item.is_active = true')
      .orderBy('item.description', 'ASC');

    if (query.search?.trim()) {
      const search = `%${query.search.trim()}%`;
      qb.andWhere(
        '(item.description ILIKE :search OR item.sku ILIKE :search)',
        { search },
      );
    }

    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 50);
    const [rows, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const publicBase = publicBaseFromConfig(this.config);
    return {
      data: rows.map((item) => ({
        id: item.id,
        sku: item.sku,
        description: item.description,
        imageUrl: absoluteMediaUrl(item.imagePath, {
          publicBaseUrl: publicBase,
        }),
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async remove(id: string) {
    const row = await this.findOne(id);
    if (row.status === InquiryStatus.ORDERED) {
      throw new BadRequestException(
        'Ordered quotations cannot be cancelled; mark Lost if the deal is off',
      );
    }
    row.status = InquiryStatus.CANCELLED;
    const { lines: _lines, ...header } = row;
    return this.repo.save(header);
  }
}
