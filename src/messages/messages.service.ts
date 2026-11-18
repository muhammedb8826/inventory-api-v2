import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { NotificationType } from '../common/enums';
import { buildMeta } from '../common/utils/query.util';
import { StaffMessage } from '../database/entities/staff-message.entity';
import { User } from '../database/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateStaffMessageDto } from './dto/message.dto';

type ConversationRow = {
  otherUserId: string;
  lastMessageId: string;
  lastBody: string;
  lastCreatedAt: Date;
  lastFromUserId: string;
  unreadCount: string;
};

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(StaffMessage)
    private readonly repo: Repository<StaffMessage>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly notifications: NotificationsService,
  ) {}

  async conversations(userId: string) {
    const rows = (await this.repo.query(
      `
      WITH ranked AS (
        SELECT
          CASE
            WHEN m.from_user_id = $1 THEN m.to_user_id
            ELSE m.from_user_id
          END AS other_user_id,
          m.id,
          m.body,
          m.created_at,
          m.from_user_id,
          ROW_NUMBER() OVER (
            PARTITION BY CASE
              WHEN m.from_user_id = $1 THEN m.to_user_id
              ELSE m.from_user_id
            END
            ORDER BY m.created_at DESC
          ) AS rn
        FROM staff_messages m
        WHERE m.from_user_id = $1 OR m.to_user_id = $1
      ),
      unread AS (
        SELECT from_user_id AS other_user_id, COUNT(*)::int AS unread_count
        FROM staff_messages
        WHERE to_user_id = $1 AND read_at IS NULL
        GROUP BY from_user_id
      )
      SELECT
        r.other_user_id AS "otherUserId",
        r.id AS "lastMessageId",
        r.body AS "lastBody",
        r.created_at AS "lastCreatedAt",
        r.from_user_id AS "lastFromUserId",
        COALESCE(u.unread_count, 0)::text AS "unreadCount"
      FROM ranked r
      LEFT JOIN unread u ON u.other_user_id = r.other_user_id
      WHERE r.rn = 1
      ORDER BY r.created_at DESC
      `,
      [userId],
    )) as ConversationRow[];

    if (rows.length === 0) return [];

    const otherIds = [...new Set(rows.map((r) => r.otherUserId))];
    const users = await this.userRepo
      .createQueryBuilder('user')
      .select(['user.id', 'user.fullName', 'user.email', 'user.isActive'])
      .where('user.id IN (:...ids)', { ids: otherIds })
      .getMany();
    const byId = new Map(users.map((u) => [u.id, u]));

    return rows.map((row) => ({
      otherUser: byId.get(row.otherUserId) ?? {
        id: row.otherUserId,
        fullName: 'Unknown user',
        email: '',
        isActive: false,
      },
      lastMessage: {
        id: row.lastMessageId,
        body: row.lastBody,
        fromUserId: row.lastFromUserId,
        createdAt: row.lastCreatedAt,
      },
      unreadCount: Number(row.unreadCount) || 0,
    }));
  }

  async thread(userId: string, withUserId: string, page = 1, limit = 50) {
    await this.assertActiveUser(withUserId);
    const take = Math.min(Math.max(limit || 50, 1), 100);
    const skip = (Math.max(page || 1, 1) - 1) * take;

    const qb = this.repo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.fromUser', 'fromUser')
      .leftJoinAndSelect('m.toUser', 'toUser')
      .where(
        '(m.from_user_id = :userId AND m.to_user_id = :withUserId) OR (m.from_user_id = :withUserId AND m.to_user_id = :userId)',
        { userId, withUserId },
      )
      .orderBy('m.created_at', 'ASC')
      .skip(skip)
      .take(take);

    const [data, total] = await qb.getManyAndCount();
    return { data, meta: buildMeta(page, take, total) };
  }

  async send(fromUserId: string, dto: CreateStaffMessageDto) {
    const body = dto.body.trim();
    if (!body) throw new BadRequestException('Message body is required');
    if (dto.toUserId === fromUserId) {
      throw new BadRequestException('Cannot send a message to yourself');
    }

    const [fromUser, toUser] = await Promise.all([
      this.userRepo.findOne({ where: { id: fromUserId } }),
      this.assertActiveUser(dto.toUserId),
    ]);
    if (!fromUser) throw new NotFoundException('Sender not found');

    const message = await this.repo.save(
      this.repo.create({
        fromUserId,
        toUserId: dto.toUserId,
        body,
        readAt: null,
      }),
    );

    const preview = body.length > 140 ? `${body.slice(0, 137)}...` : body;
    await this.notifications.create({
      userId: toUser.id,
      module: 'messages',
      type: NotificationType.SYSTEM,
      title: `Message from ${fromUser.fullName}`,
      message: preview,
      entityType: 'staff_message',
      entityId: fromUser.id,
      metadata: {
        messageId: message.id,
        fromUserId: fromUser.id,
        fromUserName: fromUser.fullName,
      },
    });

    return this.repo.findOneOrFail({
      where: { id: message.id },
      relations: { fromUser: true, toUser: true },
    });
  }

  async markThreadRead(userId: string, withUserId: string) {
    const result = await this.repo.update(
      {
        toUserId: userId,
        fromUserId: withUserId,
        readAt: IsNull(),
      },
      { readAt: new Date() },
    );
    return { updated: result.affected ?? 0 };
  }

  async unreadCount(userId: string) {
    const count = await this.repo.count({
      where: { toUserId: userId, readAt: IsNull() },
    });
    return { count };
  }

  private async assertActiveUser(id: string) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user || !user.isActive) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}
