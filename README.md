# Stock Management API

NestJS + PostgreSQL backend for multi-location inventory, purchases, sales, banking, expenses, credits, and dynamic role-based access control.

## Features

- JWT auth with refresh tokens and dynamic roles/permissions
- Inventory with Excel bulk import, **reorder points**, **low-stock alerts**, **audited stock adjustments**, **BOM**, **production orders**, and stock transfers
- Purchases and sales (cash, bank, credit) with **atomic DB transactions** and **full PATCH** (line items, payment, stock/ledger reconciliation)
- Automatic stock and bank ledger updates
- Customer/supplier credit tracking with due dates
- Expense management with **bank reversal on delete**
- Dashboard and profit/loss with optional **date ranges**
- Industry-standard reports: financial summary, sales by item, inventory aging, customer/supplier activity, and cash flow
- **In-app notifications** with low-stock / out-of-stock alerts (configurable `reorderPoint` per stock row)
- Paginated list APIs with search on master data

## Prerequisites

- Node.js 18+
- PostgreSQL 14+

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Environment

Copy `.env.example` to `.env` and configure:

| Variable | Description |
|----------|-------------|
| `DB_*` | PostgreSQL connection (`DB_PASSWORD` must be set — empty breaks auth) |
| `PORT` | API port (default `3001`) |
| `JWT_AT_SECRET` / `JWT_RT_SECRET` | Change from placeholders in production |
| `DB_SEED` | `true` on first run to seed roles, admin, warehouse, bank accounts |
| `CORS_ORIGIN` | Comma-separated frontend URLs (e.g. `https://noblestore.net`); `http://localhost:3000` is always allowed |
| `CURRENCY` / `CURRENCY_SYMBOL` | Default `ETB` / `Br` (display only; amounts are ETB) |

### 3. Database

```bash
npm run migration:run
npm run seed
```

**Development only:** `DB_SYNCHRONIZE=true` auto-creates tables from entities.

### 4. Run

```bash
npm run start:dev
```

- API: `http://localhost:3001/api`
- Health: `GET /api/health`
- Default admin (after seed): `admin@stock.local` / `Admin@123`

Set `DB_SEED=false` after the first successful seed.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run start:dev` | Development with watch |
| `npm run build` | Production build |
| `npm run start:prod` | Run compiled app |
| `npm run migration:run` | Run TypeORM migrations |
| `npm run seed` | Seed permissions, roles, admin, default accounts |

## Frontend integration

See **[docs/FRONTEND_API.md](docs/FRONTEND_API.md)** for the full REST contract.

**Important for the Next.js client:**

1. **List responses** use `{ data, meta: { page, limit, total, totalPages } }` on purchases, sales, inventory, credits, expenses, transfers, suppliers, customers, and bank transactions. **Inventory, purchases, sales, expenses, and credits** list endpoints also include **`totals`** summed over the filtered result set (see each section in [docs/FRONTEND_API.md](docs/FRONTEND_API.md)).
2. **CASH and BANK** payments require `bankAccountId` (use the seeded **Cash** account for cash sales/purchases).
3. **PATCH** `/purchases/:id` and `/sales/:id` accept the same fields as create (partial). Line changes reconcile stock and ledger; blocked after credit payments except `notes`.
4. **DELETE** on purchases/sales **voids** the document (does not hard-delete).
5. Optional query params: `page`, `limit`, `from`, `to` (ISO dates), `search` (where supported).
6. Dashboard / P&amp;L accept `?from=&to=` for period filtering.
7. Reports are available under `/reports/*` and require `reports.read`. Use `/reports/summary`, `/reports/sales-by-item`, `/reports/inventory-aging`, `/reports/customer-activity`, `/reports/supplier-activity`, and `/reports/cash-flow`.
8. **Low stock:** set `reorderPoint` on inventory rows (`POST`/`PATCH /inventory`). List alerts at `GET /inventory/low-stock`. Alerts also appear as in-app notifications (`GET /notifications`) for users with `inventory.read` when stock drops after sales, transfers, or manual quantity updates.
9. **Inventory edit:** `PATCH /inventory/:id` updates item name (`description`), `sku`, `unit`, `purchasePrice`, `reorderPoint` — **not quantity**. Change stock via `POST /inventory/adjustments` (`inventory.adjust`) with reason (`DAMAGE`, `LOSS`, `FOUND`, `COUNT`, `OPENING`, `RETURN`, `OTHER`) and direction `in`/`out`. List history at `GET /inventory/adjustments`.
10. **Bank transactions** include `direction` (`in` \| `out`). `amount` is always positive — use `direction` for UI sign. Filter with `?direction=in` or `?direction=out`.
11. **Manufacturing:** define BOMs at `/boms`, then run `/production-orders` (`release` → `issue` → `complete`). Items may set `itemType` (`RAW` \| `SEMI` \| `FINISHED` \| `OTHER`). Permissions: `bom.*`, `production.*`.

### Report examples

**GET /reports/summary?from=2026-01-01&to=2026-01-31**

```json
{
  "currency": { "code": "ETB", "symbol": "Br" },
  "totalRevenue": "125000.00",
  "totalCost": "90000.00",
  "totalExpenses": "15000.00",
  "grossProfit": "35000.00",
  "netProfit": "20000.00",
  "marginPercent": "28.00",
  "period": { "from": "2026-01-01", "to": "2026-01-31" }
}
```

**GET /reports/sales-by-item?from=2026-01-01&to=2026-01-31**

```json
[
  {
    "itemId": "uuid",
    "description": "Widget",
    "quantitySold": "120.000",
    "revenue": "3600.00",
    "cost": "2400.00",
    "profit": "1200.00",
    "marginPercent": "33.33"
  },
  {
    "itemId": "uuid",
    "description": "Gadget",
    "quantitySold": "80.000",
    "revenue": "2800.00",
    "cost": "1800.00",
    "profit": "1000.00",
    "marginPercent": "35.71"
  }
]
```

**GET /reports/inventory-aging**

```json
[
  {
    "itemId": "uuid",
    "itemDescription": "Widget",
    "locationId": "uuid",
    "locationName": "Main Warehouse",
    "quantity": "150.000",
    "purchasePrice": "25.50",
    "inventoryValue": "3825.00",
    "lastUpdated": "2026-06-10T12:34:56.000Z",
    "ageDays": 5
  }
]
```

**GET /reports/customer-activity?from=2026-01-01&to=2026-01-31**

```json
[
  {
    "customerId": "uuid",
    "customerName": "ABC Trading",
    "salesCount": 12,
    "totalSpent": "18000.00"
  }
]
```

**GET /reports/supplier-activity?from=2026-01-01&to=2026-01-31**

```json
[
  {
    "supplierId": "uuid",
    "supplierName": "XYZ Supplies",
    "purchaseCount": 8,
    "totalPurchased": "22000.00"
  }
]
```

**GET /reports/cash-flow?from=2026-01-01&to=2026-01-31**

```json
{
  "period": { "from": "2026-01-01", "to": "2026-01-31" },
  "dailyBalances": [
    { "date": "2026-01-01", "inflow": "2500.00", "outflow": "1500.00", "net": "1000.00" },
    { "date": "2026-01-02", "inflow": "1800.00", "outflow": "1200.00", "net": "600.00" }
  ]
}
```

### Example response shapes

**GET /locations**

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Showroom A",
      "type": "SHOWROOM",
      "address": "123 Main St",
      "isActive": true,
      "createdAt": "2026-06-10T12:34:56.000Z",
      "updatedAt": "2026-06-10T12:34:56.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

**GET /inventory?locationId=uuid**

```json
{
  "data": [
    {
      "id": "uuid",
      "locationId": "uuid",
      "itemId": "uuid",
      "quantity": "100.000",
      "purchasePrice": "25.50",
      "reorderPoint": "20.000",
      "item": { "id": "uuid", "sku": "SKU1", "description": "Widget", "unit": "pcs" },
      "location": { "id": "uuid", "name": "Main Warehouse", "type": "WAREHOUSE" }
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 },
  "totals": { "quantity": "100.000", "inventoryValue": "2550.00" }
}
```

**GET /stock-transfers**

```json
{
  "data": [
    {
      "id": "uuid",
      "fromLocationId": "uuid",
      "toLocationId": "uuid",
      "status": "PENDING",
      "lines": [{ "itemId": "uuid", "quantity": "10.000" }],
      "createdAt": "2026-06-10T12:34:56.000Z",
      "updatedAt": "2026-06-10T12:34:56.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

**GET /suppliers**

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "XYZ Supplies",
      "phone": "0123456789",
      "email": "xyz@example.com",
      "address": "123 Supplier Rd",
      "isActive": true,
      "createdAt": "2026-06-10T12:34:56.000Z",
      "updatedAt": "2026-06-10T12:34:56.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

**GET /purchases**

```json
{
  "data": [
    {
      "id": "uuid",
      "supplierId": "uuid",
      "locationId": "uuid",
      "paymentMethod": "BANK",
      "bankAccountId": "uuid",
      "subtotal": "1000.00",
      "total": "1150.00",
      "status": "ACTIVE",
      "lines": [
        { "itemId": "uuid", "quantity": "50.000", "unitPrice": "20.00", "lineTotal": "1000.00" }
      ],
      "createdAt": "2026-06-10T12:34:56.000Z",
      "updatedAt": "2026-06-10T12:34:56.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 },
  "totals": { "subtotal": "1000.00", "total": "1000.00" }
}

```json
{
  "data": [
    {
      "id": "uuid",
      "customerId": "uuid",
      "locationId": "uuid",
      "paymentMethod": "CASH",
      "bankAccountId": "uuid",
      "subtotal": "70.00",
      "total": "77.00",
      "commissionAmount": "30.00",
      "status": "ACTIVE",
      "lines": [
        { "itemId": "uuid", "quantity": "2.000", "unitPrice": "35.00", "lineTotal": "70.00" }
      ],
      "createdAt": "2026-06-10T12:34:56.000Z",
      "updatedAt": "2026-06-10T12:34:56.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 },
  "totals": { "subtotal": "70.00", "total": "70.00", "commission": "30.00" }
}

```json
{
  "data": [
    {
      "id": "uuid",
      "customerId": "uuid",
      "amount": "500.00",
      "paidAmount": "200.00",
      "balance": "300.00",
      "dueDate": "2026-06-30",
      "status": "OPEN"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 },
  "totals": {
    "amount": "500.00",
    "paidAmount": "200.00",
    "balance": "300.00"
  }
}
```

**GET /expenses**

```json
{
  "data": [
    {
      "id": "uuid",
      "categoryId": "uuid",
      "bankAccountId": "uuid",
      "amount": "150.00",
      "description": "Rent",
      "expenseDate": "2026-05-30",
      "createdAt": "2026-06-10T12:34:56.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 },
  "totals": { "amount": "150.00" }
}

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Main Bank",
      "accountType": "BANK",
      "bankName": "Commercial Bank of Ethiopia",
      "balance": "20000.00",
      "isActive": true
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

**GET /dashboard**

```json
{
  "totalInventoryValue": "125000.00",
  "stockValueByLocation": [
    { "locationId": "uuid", "locationName": "Main Warehouse", "value": "80000.00" }
  ],
  "dailySales": "4500.00",
  "dailyPurchases": "2000.00",
  "profitAndLoss": {
    "revenue": "50000.00",
    "costOfGoodsSold": "35000.00",
    "grossProfit": "15000.00",
    "totalExpenses": "5000.00",
    "netProfit": "10000.00"
  },
  "financialOverview": {
    "cashTotal": "5000.00",
    "bankTotal": "20000.00",
    "totalLiquidity": "25000.00"
  }
}
```

```bash
# Frontend (.env.local)
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

## Project structure

```
src/
  auth/              Login, refresh, JWT
  users/ roles/ permissions/
  locations/ inventory/ stock-transfers/
  boms/ production/
  suppliers/ customers/
  purchases/ sales/ credits/ expenses/ banks/
  dashboard/ profit-loss/
  database/          Entities, seed
  common/            Guards, DTOs, filters, query helpers
database/schema.sql
docs/FRONTEND_API.md
scripts/create-database.ts
```

## Deploy to cPanel (FTP)

GitHub Actions (`.github/workflows/deploy.yml`) builds on CI and uploads **`dist/`** and `package.json` — not TypeScript `src/`.

**GitHub secrets**

| Secret | Example |
|--------|---------|
| `FTP_SERVER` | `ftp.yourdomain.com` |
| `FTP_USERNAME` | cPanel FTP user |
| `FTP_PASSWORD` | FTP password |
| `CPANEL_DIR` | `inventory-api/` — path **relative to FTP home**, must end with `/` |

**Before first deploy**

1. In cPanel **File Manager**, create the folder matching `CPANEL_DIR` (e.g. `inventory-api`).
2. In **Setup Node.js App**, set application root to that folder, startup file **`dist/main.js`**, Node 20.
3. After deploy, run **Run NPM Install** then **Restart** in the Node app panel (or SSH: `npm ci --omit=dev` in that directory).
4. Set environment variables in cPanel (DB_*, JWT_*, `PORT`, `CORS_ORIGIN`, `DB_SEED=false`).

FTP error `553 Can't open that file` usually means `CPANEL_DIR` is wrong, the folder does not exist on the server, or the workflow was uploading `src/` (fixed — use compiled `dist/` only).

## Production checklist

- [ ] Strong JWT secrets and `DB_SYNCHRONIZE=false`
- [ ] Run `database/schema.sql` (do not rely on sync)
- [ ] Set `DB_SEED=false` after initial seed
- [ ] Configure `CORS_ORIGIN` for your frontend domain
- [ ] Use HTTPS reverse proxy (nginx, etc.)

## Migrations

Run:

```bash
npm run migration:run
```

## Recent improvements

- Database transactions on purchases, sales, transfers, expenses, and credit payments
- Expense delete reverses the linked bank transaction
- CASH purchases debit bank when `bankAccountId` is provided
- Validated DTOs for suppliers, customers, banks, and expenses
- Paginated lists, date filters, and search on key endpoints
- Seed creates default **Main Bank** and **Cash** accounts
- Global HTTP exception filter
- Full CRUD on purchases/sales: PATCH reconciles lines/payment/stock/bank/credit; DELETE voids with reversal
- Soft DELETE on suppliers, customers, locations; expense PATCH; stock transfer void
- Reorder points and low-stock alerts (`GET /inventory/low-stock`, in-app `LOW_STOCK` notifications)
- Inventory PATCH updates item name (`description`), SKU, and unit in addition to stock fields
- Audited stock adjustments (`POST/GET /inventory/adjustments`) with reason codes; PATCH no longer sets quantity
- BOM and production orders (`/boms`, `/production-orders`) with material issue and FG receipt

## License

UNLICENSED — private project.
