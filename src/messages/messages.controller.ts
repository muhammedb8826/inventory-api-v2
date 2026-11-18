import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { ListQueryDto } from '../common/dto/list-query.dto';
import { CreateStaffMessageDto } from './dto/message.dto';
import { MessagesService } from './messages.service';

@Controller('messages')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MessagesController {
  constructor(private readonly service: MessagesService) {}

  @Get('conversations')
  @RequirePermissions('messages.read')
  conversations(@CurrentUser() user: JwtPayload) {
    return this.service.conversations(user.sub);
  }

  @Get('unread-count')
  @RequirePermissions('messages.read')
  unreadCount(@CurrentUser() user: JwtPayload) {
    return this.service.unreadCount(user.sub);
  }

  @Get('thread/:userId')
  @RequirePermissions('messages.read')
  thread(
    @CurrentUser() user: JwtPayload,
    @Param('userId') withUserId: string,
    @Query() query: ListQueryDto,
  ) {
    return this.service.thread(
      user.sub,
      withUserId,
      query.page,
      query.limit,
    );
  }

  @Post()
  @RequirePermissions('messages.write')
  send(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateStaffMessageDto,
  ) {
    return this.service.send(user.sub, dto);
  }

  @Post('thread/:userId/read')
  @RequirePermissions('messages.read')
  markThreadRead(
    @CurrentUser() user: JwtPayload,
    @Param('userId') withUserId: string,
  ) {
    return this.service.markThreadRead(user.sub, withUserId);
  }
}
