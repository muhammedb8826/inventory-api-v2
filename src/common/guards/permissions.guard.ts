import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { User } from '../../database/entities/user.entity';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user?.sub) throw new ForbiddenException('Not authenticated');

    const dbUser = await this.userRepo.findOne({
      where: { id: user.sub, isActive: true },
      relations: { role: { permissions: true } },
    });
    if (!dbUser?.role) throw new ForbiddenException('No role assigned');

    const codes = new Set(dbUser.role.permissions?.map((p) => p.code) ?? []);
    const hasAll = required.every((p) => codes.has(p));
    if (!hasAll) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const request = context.switchToHttp().getRequest();
    request.permissions = [...codes];
    return true;
  }
}
