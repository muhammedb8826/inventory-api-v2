import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { BanksModule } from './banks/banks.module';
import { BomsModule } from './boms/boms.module';
import { CommonModule } from './common/common.module';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import { CreditsModule } from './credits/credits.module';
import { CustomersModule } from './customers/customers.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DatabaseModule } from './database/database.module';
import { ExpensesModule } from './expenses/expenses.module';
import { InventoryModule } from './inventory/inventory.module';
import { InquiriesModule } from './inquiries/inquiries.module';
import { LocationsModule } from './locations/locations.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PermissionsModule } from './permissions/permissions.module';
import { ProductionModule } from './production/production.module';
import { ProfitLossModule } from './profit-loss/profit-loss.module';
import { PurchasesModule } from './purchases/purchases.module';
import { ReportsModule } from './reports/reports.module';
import { RolesModule } from './roles/roles.module';
import { SalesModule } from './sales/sales.module';
import { SettingsModule } from './settings/settings.module';
import { StockTransfersModule } from './stock-transfers/stock-transfers.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { UsersModule } from './users/users.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, jwtConfig],
    }),
    CommonModule,
    DatabaseModule,
    AuthModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    LocationsModule,
    NotificationsModule,
    InventoryModule,
    BomsModule,
    ProductionModule,
    StockTransfersModule,
    SuppliersModule,
    CustomersModule,
    InquiriesModule,
    PurchasesModule,
    SalesModule,
    CreditsModule,
    ExpensesModule,
    BanksModule,
    DashboardModule,
    ProfitLossModule,
    ReportsModule,
    SettingsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
