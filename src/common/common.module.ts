import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../database/entities/user.entity';
import { PermissionsGuard } from './guards/permissions.guard';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [PermissionsGuard],
  exports: [PermissionsGuard, TypeOrmModule],
})
export class CommonModule {}
