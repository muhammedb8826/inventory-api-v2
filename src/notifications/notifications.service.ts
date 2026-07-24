import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationType } from '../common/enums';
import {
  applyDateRangeToQb,
  applyIlikeSearch,
  paginatedQueryBuilder,
} from '../common/utils/query.util';
import { Notification } from '../database/entities/notification.entity';
import { User } from '../database/entities/user.entity';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationListQueryDto } from './dto/notification-list-query.dto';

export type NotifyManyInput = Omit<CreateNotificationDto, 'userId'>;

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly repo: Repository<Notification>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async findAll(userId: string, query: NotificationListQueryDto) {
    const qb = this.repo
      .createQueryBuilder('n')
      .where('n.user_id = :userId', { userId })
      .orderBy('n.created_at', 'DESC');

    if (query.isRead === 'true') {
      qb.andWhere('n.is_read = true');
    } else if (query.isRead === 'false') {
      qb.andWhere('n.is_read = false');
    }

    if (query.module?.trim()) {
      qb.andWhere('n.module = :module', { module: query.module.trim() });
    }

    applyDateRangeToQb(qb, 'n.created_at', query.from, query.to);
    applyIlikeSearch(qb, query.search, ['n.title', 'n.message']);

    return paginatedQueryBuilder(qb, query.page, query.limit);
  }

  async unreadCount(userId: string) {
    const count = await this.repo.count({
      where: { userId, isRead: false },
    });
    return { count };
  }

  findOne(userId: string, id: string) {
    return this.findOwned(userId, id);
  }

  async markRead(userId: string, id: string) {
    const notification = await this.findOwned(userId, id);
    if (!notification.isRead) {
      notification.isRead = true;
      notification.readAt = new Date();
      await this.repo.save(notification);
    }
    return notification;
  }

  async markAllRead(userId: string) {
    const result = await this.repo.update(
      { userId, isRead: false },
      { isRead: true, readAt: new Date() },
    );
    return { updated: result.affected ?? 0 };
  }

  async remove(userId: string, id: string) {
    const notification = await this.findOwned(userId, id);
    await this.repo.remove(notification);
    return { success: true };
  }

  /** Create a notification for one user (internal / future event hooks). */
  create(dto: CreateNotificationDto) {
    return this.repo.save(
      this.repo.create({
        userId: dto.userId,
        module: dto.module,
        type: dto.type,
        title: dto.title,
        message: dto.message,
        entityType: dto.entityType ?? null,
        entityId: dto.entityId ?? null,
        metadata: dto.metadata ?? null,
      }),
    );
  }

  /** Notify every active user who has a given permission code. */
  async notifyUsersWithPermission(
    permissionCode: string,
    input: NotifyManyInput,
    excludeUserIds: string[] = [],
  ) {
    const exclude = new Set(excludeUserIds);
    const users = await this.userRepo
      .createQueryBuilder('user')
      .innerJoin('user.role', 'role')
      .innerJoin('role.permissions', 'permission')
      .where('user.is_active = true')
      .andWhere('permission.code = :code', { code: permissionCode })
      .getMany();

    const targets = users.filter((user) => !exclude.has(user.id));
    if (targets.length === 0) return [];

    const rows = targets.map((user) =>
      this.repo.create({
        userId: user.id,
        module: input.module,
        type: input.type,
        title: input.title,
        message: input.message,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        metadata: input.metadata ?? null,
      }),
    );
    return this.repo.save(rows);
  }

  /** Notify a list of user IDs (deduplicated). */
  async notifyUsers(userIds: string[], input: NotifyManyInput) {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return [];

    const rows = unique.map((userId) =>
      this.repo.create({
        userId,
        module: input.module,
        type: input.type,
        title: input.title,
        message: input.message,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        metadata: input.metadata ?? null,
      }),
    );
    return this.repo.save(rows);
  }

  async onSaleRecorded(params: {
    saleId: string;
    total: string;
    actorUserId?: string | null;
    soldByUserId?: string | null;
    stockWarnings?: string[];
    creditDueDate?: string | null;
  }) {
    const recipients = new Set<string>();
    if (params.actorUserId) recipients.add(params.actorUserId);
    if (params.soldByUserId) recipients.add(params.soldByUserId);

    const saleNotice: NotifyManyInput = {
      module: 'sales',
      type: NotificationType.SALE,
      title: 'Sale recorded',
      message: `Sale of Br ${params.total} has been recorded`,
      entityType: 'sale',
      entityId: params.saleId,
      metadata: { total: params.total },
    };

    if (recipients.size > 0) {
      await this.notifyUsers([...recipients], saleNotice);
    } else {
      await this.notifyUsersWithPermission('sales.read', saleNotice);
    }

    if (params.stockWarnings?.length) {
      await this.notifyUsersWithPermission('inventory.read', {
        module: 'inventory',
        type: NotificationType.LOW_STOCK,
        title: 'Negative stock on sale',
        message: params.stockWarnings.join('; '),
        entityType: 'sale',
        entityId: params.saleId,
        metadata: { warnings: params.stockWarnings },
      });
    }

    if (params.creditDueDate) {
      await this.notifyUsersWithPermission('credit.read', {
        module: 'credit',
        type: NotificationType.CREDIT_DUE,
        title: 'Credit sale recorded',
        message: `Credit sale of Br ${params.total} due ${params.creditDueDate}`,
        entityType: 'sale',
        entityId: params.saleId,
        metadata: { total: params.total, dueDate: params.creditDueDate },
      });
    }
  }

  async onPurchaseRecorded(params: {
    purchaseId: string;
    total: string;
    actorUserId?: string | null;
    creditDueDate?: string | null;
  }) {
    const purchaseNotice: NotifyManyInput = {
      module: 'purchase',
      type: NotificationType.PURCHASE,
      title: 'Purchase recorded',
      message: `Purchase of Br ${params.total} has been recorded`,
      entityType: 'purchase',
      entityId: params.purchaseId,
      metadata: { total: params.total },
    };

    if (params.actorUserId) {
      await this.notifyUsers([params.actorUserId], purchaseNotice);
    } else {
      await this.notifyUsersWithPermission('purchase.read', purchaseNotice);
    }

    if (params.creditDueDate) {
      await this.notifyUsersWithPermission('credit.read', {
        module: 'credit',
        type: NotificationType.CREDIT_DUE,
        title: 'Supplier credit recorded',
        message: `Purchase credit of Br ${params.total} due ${params.creditDueDate}`,
        entityType: 'purchase',
        entityId: params.purchaseId,
        metadata: { total: params.total, dueDate: params.creditDueDate },
      });
    }
  }

  async onStockTransferCompleted(params: {
    transferId: string;
    fromLocationName: string;
    toLocationName: string;
    lineCount: number;
    actorUserId?: string | null;
  }) {
    const transferNotice: NotifyManyInput = {
      module: 'stock_transfer',
      type: NotificationType.STOCK_TRANSFER,
      title: 'Stock transfer completed',
      message: `${params.lineCount} item(s) moved from ${params.fromLocationName} to ${params.toLocationName}`,
      entityType: 'stock_transfer',
      entityId: params.transferId,
      metadata: {
        fromLocation: params.fromLocationName,
        toLocation: params.toLocationName,
        lineCount: params.lineCount,
      },
    };

    if (params.actorUserId) {
      await this.notifyUsers([params.actorUserId], transferNotice);
    }
    await this.notifyUsersWithPermission(
      'stock_transfer.read',
      transferNotice,
      params.actorUserId ? [params.actorUserId] : [],
    );
  }

  private async findOwned(userId: string, id: string) {
    const notification = await this.repo.findOne({ where: { id, userId } });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    return notification;
  }
}
