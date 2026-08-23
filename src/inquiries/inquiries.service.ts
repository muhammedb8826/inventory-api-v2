import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { parseDateRange } from '../common/dto/date-range.dto';
import { InquiryPriority, InquirySource, InquiryStatus } from '../common/enums';
import { Customer } from '../database/entities/customer.entity';
import { CustomerInquiryLine } from '../database/entities/customer-inquiry-line.entity';
import { CustomerInquiry } from '../database/entities/customer-inquiry.entity';
import { Item } from '../database/entities/item.entity';
import { Sale } from '../database/entities/sale.entity';
import { User } from '../database/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateInquiryDto,
  InquiryLineDto,
  InquiryListQueryDto,
  PublicCreateInquiryDto,
  UpdateInquiryDto,
} from './dto/inquiry.dto';

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
    private readonly notifications: NotificationsService,
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
        quantity:
          line.quantity !== undefined ? line.quantity.toFixed(3) : null,
        notes: line.notes?.trim() || null,
      }),
    );
  }

  private async replaceLines(inquiryId: string, lines: InquiryLineDto[]) {
    await this.assertLines(lines);
    await this.lineRepo.delete({ inquiryId });
    if (lines.length === 0) return;
    await this.lineRepo.save(this.mapLineEntities(inquiryId, lines));
  }

  private inquiryNotifyPayload(row: CustomerInquiry) {
    return {
      inquiryId: row.id,
      subject: row.subject,
      contactName: row.contactName,
      source: row.source,
      priority: row.priority,
    };
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
    if (query.itemId) {
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM customer_inquiry_lines cil
          WHERE cil.inquiry_id = i.id AND cil.item_id = :itemId
        )`,
        { itemId: query.itemId },
      );
    }

    if (query.search?.trim()) {
      const search = `%${query.search.trim()}%`;
      qb.andWhere(
        `(i.contact_name ILIKE :search
          OR i.email ILIKE :search
          OR i.phone ILIKE :search
          OR i.subject ILIKE :search
          OR i.message ILIKE :search)`,
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

  async createPublic(dto: PublicCreateInquiryDto) {
    this.assertContactChannel(dto.phone, dto.email);
    const lines = this.resolveLines(dto.lines, dto.itemId);
    await this.assertLines(lines);

    const row = await this.repo.save(
      this.repo.create({
        contactName: dto.contactName.trim(),
        phone: dto.phone?.trim() || null,
        email: dto.email?.trim() || null,
        subject: dto.subject.trim(),
        message: dto.message.trim(),
        source: InquirySource.PUBLIC,
        status: InquiryStatus.NEW,
        priority: InquiryPriority.NORMAL,
        customerId: null,
        assignedToUserId: null,
        createdById: null,
        internalNotes: null,
        followUpAt: null,
        convertedSaleId: null,
      }),
    );

    if (lines.length) {
      await this.lineRepo.save(this.mapLineEntities(row.id, lines));
    }

    await this.notifications.onInquirySubmitted(this.inquiryNotifyPayload(row));

    return {
      id: row.id,
      status: row.status,
      message: 'Inquiry submitted successfully',
    };
  }

  async createInternal(dto: CreateInquiryDto, createdById: string) {
    this.assertContactChannel(dto.phone, dto.email);
    const lines = this.resolveLines(dto.lines, dto.itemId);
    await this.assertOptionalRefs({
      customerId: dto.customerId,
      assignedToUserId: dto.assignedToUserId,
    });
    await this.assertLines(lines);

    const row = await this.repo.save(
      this.repo.create({
        contactName: dto.contactName.trim(),
        phone: dto.phone?.trim() || null,
        email: dto.email?.trim() || null,
        subject: dto.subject.trim(),
        message: dto.message.trim(),
        priority: dto.priority ?? InquiryPriority.NORMAL,
        customerId: dto.customerId ?? null,
        assignedToUserId: dto.assignedToUserId ?? null,
        internalNotes: dto.internalNotes?.trim() || null,
        followUpAt: dto.followUpAt ? new Date(dto.followUpAt) : null,
        source: InquirySource.INTERNAL,
        status: InquiryStatus.NEW,
        createdById,
        convertedSaleId: null,
      }),
    );

    if (lines.length) {
      await this.lineRepo.save(this.mapLineEntities(row.id, lines));
    }

    if (row.assignedToUserId) {
      await this.notifications.onInquiryAssignmentChanged({
        ...this.inquiryNotifyPayload(row),
        assigneeUserId: row.assignedToUserId,
        previousAssigneeUserId: null,
        actorUserId: createdById,
      });
    }

    return this.findOne(row.id);
  }

  async update(id: string, dto: UpdateInquiryDto, actorUserId: string) {
    const row = await this.findOne(id);
    const previousAssigneeUserId = row.assignedToUserId;

    const nextPhone = dto.phone !== undefined ? dto.phone : row.phone;
    const nextEmail = dto.email !== undefined ? dto.email : row.email;
    if (dto.phone !== undefined || dto.email !== undefined) {
      this.assertContactChannel(nextPhone, nextEmail);
    }

    await this.assertOptionalRefs({
      customerId: dto.customerId,
      assignedToUserId: dto.assignedToUserId,
      convertedSaleId: dto.convertedSaleId,
    });

    if (dto.contactName !== undefined) row.contactName = dto.contactName.trim();
    if (dto.phone !== undefined) row.phone = dto.phone?.trim() || null;
    if (dto.email !== undefined) row.email = dto.email?.trim() || null;
    if (dto.subject !== undefined) row.subject = dto.subject.trim();
    if (dto.message !== undefined) row.message = dto.message.trim();
    if (dto.status !== undefined) row.status = dto.status;
    if (dto.priority !== undefined) row.priority = dto.priority;
    if (dto.customerId !== undefined) row.customerId = dto.customerId;
    if (dto.assignedToUserId !== undefined) {
      row.assignedToUserId = dto.assignedToUserId;
    }
    if (dto.internalNotes !== undefined) {
      row.internalNotes = dto.internalNotes?.trim() || null;
    }
    if (dto.followUpAt !== undefined) {
      row.followUpAt = dto.followUpAt ? new Date(dto.followUpAt) : null;
    }
    if (dto.convertedSaleId !== undefined) {
      row.convertedSaleId = dto.convertedSaleId;
      if (dto.convertedSaleId && dto.status === undefined) {
        row.status = InquiryStatus.CONVERTED;
      }
    }

    const { lines: _existingLines, ...header } = row;
    await this.repo.save(header);

    if (dto.lines !== undefined) {
      await this.replaceLines(id, dto.lines);
    } else if (dto.itemId !== undefined) {
      await this.replaceLines(
        id,
        dto.itemId ? [{ itemId: dto.itemId }] : [],
      );
    }

    if (dto.assignedToUserId !== undefined) {
      await this.notifications.onInquiryAssignmentChanged({
        ...this.inquiryNotifyPayload(row),
        assigneeUserId: row.assignedToUserId,
        previousAssigneeUserId,
        actorUserId,
      });
    }

    return this.findOne(id);
  }

  async remove(id: string) {
    const row = await this.findOne(id);
    if (row.status === InquiryStatus.CONVERTED) {
      throw new BadRequestException(
        'Converted inquiries cannot be deleted; mark CLOSED instead',
      );
    }
    row.status = InquiryStatus.CANCELLED;
    const { lines: _lines, ...header } = row;
    return this.repo.save(header);
  }
}
