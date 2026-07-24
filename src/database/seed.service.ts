import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_DEFINITIONS,
} from './constants/permissions';
import { BankAccount } from './entities/bank-account.entity';
import { Location } from './entities/location.entity';
import { Permission } from './entities/permission.entity';
import { Role } from './entities/role.entity';
import { User } from './entities/user.entity';
import { BankAccountType, LocationType } from '../common/enums';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
    @InjectRepository(BankAccount)
    private readonly bankRepo: Repository<BankAccount>,
  ) {}

  async onModuleInit() {
    if (process.env.DB_SEED !== 'true') return;
    await this.seed();
  }

  async seed() {
    this.logger.log('Seeding database...');

    const permissions: Permission[] = [];
    for (const def of PERMISSION_DEFINITIONS) {
      let perm = await this.permissionRepo.findOne({
        where: { code: def.code },
      });
      if (!perm) {
        perm = this.permissionRepo.create(def);
        await this.permissionRepo.save(perm);
      }
      permissions.push(perm);
    }

    const permByCode = new Map(permissions.map((p) => [p.code, p]));

    for (const [roleName, codes] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      let role = await this.roleRepo.findOne({
        where: { name: roleName },
        relations: { permissions: true },
      });
      if (!role) {
        role = this.roleRepo.create({
          name: roleName,
          description: `System role: ${roleName}`,
          isSystem: true,
          permissions: codes.map((c) => permByCode.get(c)!),
        });
      } else {
        role.permissions = codes.map((c) => permByCode.get(c)!);
      }
      await this.roleRepo.save(role);
    }

    const adminRole = await this.roleRepo.findOne({ where: { name: 'Admin' } });
    const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@stock.local';
    const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123';

    let admin = await this.userRepo.findOne({ where: { email: adminEmail } });
    if (!admin && adminRole) {
      admin = this.userRepo.create({
        email: adminEmail,
        fullName: 'System Administrator',
        passwordHash: await bcrypt.hash(adminPassword, 10),
        roleId: adminRole.id,
        isActive: true,
      });
      await this.userRepo.save(admin);
      this.logger.log(`Admin user created: ${adminEmail}`);
    }

    const warehouseCount = await this.locationRepo.count({
      where: { type: LocationType.WAREHOUSE },
    });
    if (warehouseCount === 0) {
      await this.locationRepo.save(
        this.locationRepo.create({
          name: 'Main Warehouse',
          type: LocationType.WAREHOUSE,
          address: 'Default warehouse',
        }),
      );
      this.logger.log('Default warehouse location created');
    }

    const bankCount = await this.bankRepo.count();
    if (bankCount === 0) {
      await this.bankRepo.save([
        this.bankRepo.create({
          name: 'Main Bank',
          accountType: BankAccountType.BANK,
          bankName: 'Main Bank Account',
          accountHolderName: 'Main Account',
          accountNumber: 'MAIN-001',
          balance: '0',
        }),
        this.bankRepo.create({
          name: 'Cash',
          accountType: BankAccountType.CASH,
          bankName: null,
          accountHolderName: 'Main Account',
          accountNumber: 'CASH-001',
          balance: '0',
        }),
      ]);
      this.logger.log('Default bank accounts created (Main Bank, Cash)');
    }

    this.logger.log('Seeding complete');
  }
}
