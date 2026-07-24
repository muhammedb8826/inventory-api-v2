# Frontend API Contract — Stock Management System

This document is the **canonical REST contract** for the NestJS backend (`inventory-api`). The Next.js frontend consumes these endpoints via `NEXT_PUBLIC_API_URL`.

**Base URL:** `http://localhost:3001/api` (backend `PORT`; frontend override: `NEXT_PUBLIC_API_URL` in `.env.local`)

### Currency

All monetary amounts are **numbers in Ethiopian Birr (ETB)** unless you override server env. There is no multi-currency conversion — values are stored and returned as decimals (e.g. `"1250.00"`).

| Env | Default | Meaning |
|-----|---------|---------|
| `CURRENCY` | `ETB` | ISO 4217 code for labels |
| `CURRENCY_SYMBOL` | `Br` | Short symbol for UI (e.g. `Br 1,250.00`) |

`GET /health` and dashboard / P&amp;L summary include:

```json
"currency": { "code": "ETB", "symbol": "Br" }
```

Format amounts on the frontend using `currency.code` or `currency.symbol`.

---

## Authentication

All protected routes require:

```
Authorization: Bearer <accessToken>
```

### POST `/auth/login`

**Body**

```json
{
  "email": "admin@stock.local",
  "password": "Admin@123"
}
```

**Response `200`**

```json
{
  "user": {
    "id": "uuid",
    "email": "admin@stock.local",
    "fullName": "System Administrator",
    "role": {
      "id": "uuid",
      "name": "Admin",
      "permissions": ["inventory.read", "..."]
    }
  },
  "accessToken": "jwt",
  "refreshToken": "jwt"
}
```

### POST `/auth/refresh`

```json
{ "refreshToken": "jwt" }
```

Returns the same shape as login (new token pair).

### POST `/auth/logout`

```json
{ "refreshToken": "jwt" }
```

### GET `/auth/me`

Returns the current user profile and permission codes.

### PATCH `/auth/me`

Update the authenticated user's own profile (`fullName`, `email`). Role and active status cannot be changed here — use admin `PATCH /users/:id`.

```json
{
  "fullName": "Jane Doe",
  "email": "jane@example.com"
}
```

Returns the same shape as `GET /auth/me`.

### PATCH `/auth/me/password`

Change password. Requires the current password. All active refresh tokens are revoked (user must sign in again on other devices).

```json
{
  "currentPassword": "OldPass@123",
  "newPassword": "NewSecurePass1"
}
```

- `newPassword` — minimum 8 characters.
- `400` if current password is wrong or new password equals current.
- Response: `{ "success": true }`

---

## Authorization model

- **Roles** are dynamic (CRUD at `/roles`).
- **Permissions** are a catalog at `/permissions`; assign to roles via `permissionIds` on create/update.
- Each endpoint declares required permission codes (e.g. `inventory.read`).
- The frontend hides navigation and actions using `user.role.permissions` from login/me.

### Default system roles (seeded)

| Role | Typical access |
|------|----------------|
| Admin | All permissions |
| Sales Representative | Sales, customers, inquiries, bank, credits, dashboard |
| Purchaser | Purchases, suppliers, credits |
| Stock Keeper | Inventory, stock transfers |

Permission `sales.negative_stock` is required to set `allowNegativeStock: true` on sales.

Permission `sales.on_behalf` is required to set `soldByUserId` to someone other than the logged-in user (Admin has this after seed).

---

## Common enums

```ts
type LocationType = 'WAREHOUSE' | 'SHOWROOM';
type PaymentMethod = 'CASH' | 'BANK' | 'CREDIT';
type TransferStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED';
type CreditStatus = 'OPEN' | 'PARTIAL' | 'PAID';
type InquirySource = 'PUBLIC' | 'INTERNAL';
type InquiryStatus = 'NEW' | 'IN_PROGRESS' | 'QUOTED' | 'CONVERTED' | 'CLOSED' | 'CANCELLED';
type InquiryPriority = 'LOW' | 'NORMAL' | 'HIGH';
```

---

## List pagination and filters

Many list endpoints return:

```json
{
  "data": [ /* items */ ],
  "meta": { "page": 1, "limit": 20, "total": 100, "totalPages": 5 }
}
```

| Query param | Description |
|-------------|-------------|
| `page` | Page number (default `1`) |
| `limit` | Page size (default `20`, max `100`) |
| `from` / `to` | ISO date range on list `createdAt` (or `expenseDate` for expenses) |
| `search` | Case-insensitive text search (fields vary per endpoint — see below) |

**Paginated** `{ data, meta }`: `/purchases`, `/sales`, `/inventory`, `/stock-transfers`, `/credits/customers`, `/credits/suppliers`, `/expenses`, `/suppliers`, `/customers`, `/inquiries`, `/banks/transactions`, `/users`, `/roles`, `/locations`.

**List totals:** These endpoints also return a **`totals`** object summed over the **full filtered result** (not just the current page): `/inventory`, `/purchases`, `/sales`, `/expenses`, `/credits/customers`, `/credits/suppliers`.

**Plain arrays** (no pagination): `/banks/accounts`, `/permissions`.

### Reports

All report endpoints require `reports.read`. Optional query filters on date-based reports: `from`, `to`, and where noted `locationId`, `supplierId`, `customerId`, `categoryId`, `soldByUserId`.

| Endpoint | Filters | Description |
|----------|---------|-------------|
| `/reports/summary` | `from`, `to`, filters | Revenue, purchases, expenses, gross/net profit |
| `/reports/sales` | `from`, `to`, `locationId`, `customerId`, `soldByUserId` | Sales totals, by payment method, by location |
| `/reports/purchases` | `from`, `to`, `locationId`, `supplierId` | Purchase totals, by payment method, by location |
| `/reports/expenses` | `from`, `to`, `categoryId` | Expense totals, by category |
| `/reports/sales-by-item` | `from`, `to`, `locationId` | Item-level sales revenue, cost, profit, margin |
| `/reports/purchases-by-item` | `from`, `to`, `locationId`, `supplierId` | Item-level purchase quantities and spend |
| `/reports/inventory-aging` | none | Current stock value and age by item/location |
| `/reports/customer-activity` | `from`, `to`, `customerId` | Customer spend and sale count |
| `/reports/supplier-activity` | `from`, `to`, `supplierId` | Supplier purchase count and spend |
| `/reports/commissions` | `from`, `to`, `soldByUserId` | Sales rep commission totals |
| `/reports/credits` | none | Outstanding customer receivables and supplier payables |
| `/reports/cash-flow` | `from`, `to` | Daily and total cash inflow/outflow |

### Endpoint-specific filters

| Endpoint | Extra query params |
|----------|-------------------|
| `/inventory` | `locationId`, `search` (item description, SKU) |
| `/inventory/adjustments` | `locationId`, `itemId`, `direction` (`in` \| `out`), `reason`, `search` |
| `/suppliers`, `/customers` | `search` (name, email, phone) |
| `/inquiries` | `search` (name, email, phone, subject, message), `status`, `source`, `priority`, `customerId`, `assignedToUserId`, `itemId` |
| `/purchases` | `includeVoided`, `supplierId`, `locationId`, `paymentMethod`, `search` (notes, supplier name) |
| `/sales` | `includeVoided`, `soldByUserId`, `customerId`, `locationId`, `paymentMethod`, `search` (notes, customer name) |
| `/expenses` | `categoryId`, `bankAccountId`, `search` (description, category name) |
| `/credits/customers` | `status`, `customerId`, `search` (customer name, phone) |
| `/credits/suppliers` | `status`, `supplierId`, `search` (supplier name, phone) |
| `/stock-transfers` | `fromLocationId`, `toLocationId`, `status`, `search` (notes) |
| `/banks/accounts` | `type` (`CASH` \| `BANK`), `includeInactive`, `search` (name, bank, account number) |
| `/banks/transactions` | `bankAccountId`, `type`, `direction` (`in` \| `out`), `search` (description) |
| `/locations` | `type`, `includeInactive`, `search` (name) |
| `/users` | `roleId`, `isActive` (`true` \| `false`), `search` (email, full name) |
| `/roles` | `search` (name, description) |
| `/permissions` | `module`, `search` (code, name, module) |

`paymentMethod`: `CASH` \| `BANK` \| `CREDIT`. Credit `status`: `OPEN` \| `PARTIAL` \| `PAID`. Transfer `status`: `PENDING` \| `COMPLETED` \| `CANCELLED`.

---

## Reports

| Method | Path | Permission |
|--------|------|------------|
| GET | `/reports/summary` | `reports.read` |
| GET | `/reports/sales` | `reports.read` |
| GET | `/reports/purchases` | `reports.read` |
| GET | `/reports/expenses` | `reports.read` |
| GET | `/reports/sales-by-item` | `reports.read` |
| GET | `/reports/purchases-by-item` | `reports.read` |
| GET | `/reports/inventory-aging` | `reports.read` |
| GET | `/reports/customer-activity` | `reports.read` |
| GET | `/reports/supplier-activity` | `reports.read` |
| GET | `/reports/commissions` | `reports.read` |
| GET | `/reports/credits` | `reports.read` |
| GET | `/reports/cash-flow` | `reports.read` |

### Example: `/reports/sales?from=2026-06-01&to=2026-06-30`

```json
{
  "currency": { "code": "ETB", "symbol": "Br" },
  "period": { "from": "2026-06-01", "to": "2026-06-30" },
  "totals": { "count": 42, "subtotal": "85000.00", "total": "85000.00", "commission": "4250.00" },
  "byPaymentMethod": [
    { "paymentMethod": "CASH", "count": 30, "total": "60000.00" },
    { "paymentMethod": "CREDIT", "count": 12, "total": "25000.00" }
  ],
  "byLocation": [
    { "locationId": "uuid", "locationName": "Showroom A", "count": 42, "total": "85000.00" }
  ]
}
```

### Example: `/reports/expenses?from=2026-06-01&to=2026-06-30`

```json
{
  "currency": { "code": "ETB", "symbol": "Br" },
  "period": { "from": "2026-06-01", "to": "2026-06-30" },
  "totals": { "count": 8, "total": "12000.00" },
  "byCategory": [
    { "categoryId": "uuid", "categoryName": "Rent", "count": 1, "total": "5000.00" },
    { "categoryId": "uuid", "categoryName": "Utilities", "count": 3, "total": "3500.00" }
  ]
}
```

### Example response: `/reports/summary`

```json
{
  "currency": { "code": "ETB", "symbol": "Br" },
  "totalRevenue": "125000.00",
  "totalPurchases": "90000.00",
  "totalExpenses": "15000.00",
  "grossProfit": "35000.00",
  "netProfit": "20000.00",
  "marginPercent": "28.00",
  "period": { "from": "2026-01-01", "to": "2026-01-31" }
}
```

## Locations

| Method | Path | Permission |
| GET | `/locations?type=SHOWROOM&includeInactive=true` | `locations.read` |
| GET | `/locations/:id` | `locations.read` |
| POST | `/locations` | `locations.write` |
| PATCH | `/locations/:id` | `locations.write` |

**Create body**

```json
{
  "name": "Showroom A",
  "type": "SHOWROOM",
  "address": "optional"
}
```

**Example response**

```json
{
  "id": "uuid",
  "name": "Showroom A",
  "type": "SHOWROOM",
  "address": "123 Main St",
  "isActive": true,
  "createdAt": "2026-06-10T12:34:56.000Z",
  "updatedAt": "2026-06-10T12:34:56.000Z"
}
```

---

## Inventory (warehouse / per-location stock)

| Method | Path | Permission |
|--------|------|------------|
| GET | `/inventory?locationId=` | `inventory.read` |
| GET | `/inventory/low-stock?locationId=` | `inventory.read` |
| GET | `/inventory/adjustments` | `inventory.read` |
| POST | `/inventory/adjustments` | `inventory.adjust` |
| GET | `/inventory/:id` | `inventory.read` |
| POST | `/inventory` | `inventory.write` |
| PATCH | `/inventory/:id` | `inventory.write` |
| DELETE | `/inventory/:id` | `inventory.delete` |
| POST | `/inventory/import?locationId=` | `inventory.import` |

**Stock record** (response item):

```json
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
```

**Low stock list** — items where `quantity <= reorderPoint` (when set) or `quantity <= 0`:

```json
{
  "data": [
    {
      "id": "uuid",
      "locationId": "uuid",
      "itemId": "uuid",
      "quantity": "5.000",
      "reorderPoint": "20.000",
      "purchasePrice": "25.50",
      "status": "LOW_STOCK",
      "shortage": "15.000",
      "item": { "id": "uuid", "sku": "SKU1", "description": "Widget", "unit": "pcs" },
      "location": { "id": "uuid", "name": "Main Warehouse", "type": "WAREHOUSE" }
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

`status`: `LOW_STOCK` (at/below reorder point) or `OUT_OF_STOCK` (quantity ≤ 0).

**List totals** (`GET /inventory`): `{ "quantity": "1250.000", "inventoryValue": "31875.00" }` — total units and stock value (qty × purchase price) for the filtered rows. Respects `locationId` and `search`.

**Create**

```json
{
  "description": "Widget",
  "locationId": "uuid",
  "quantity": 100,
  "purchasePrice": 25.5,
  "reorderPoint": 20,
  "sku": "optional",
  "unit": "pcs"
}
```

**Update** (`PATCH /inventory/:id`)

```json
{
  "description": "Widget Pro",
  "sku": "SKU-001",
  "unit": "pcs",
  "purchasePrice": 26.0,
  "reorderPoint": 20
}
```

- `description` — item name (cannot be empty)
- `sku` — string or `null` to clear; must be unique across items (`409` if taken)
- `unit` — string or `null` to clear
- `purchasePrice`, `reorderPoint` — stock-level fields (`reorderPoint` may be `null` to clear)

**Quantity is not editable via PATCH.** Use stock adjustments below.

Item fields (`description`, `sku`, `unit`) update the shared catalog item (all locations that use that item).

### Stock adjustments (audited qty changes)

Professional inventory systems do not silently overwrite quantity. Use adjustments for damage, loss, cycle count, found stock, opening balance, etc.

**Create** `POST /inventory/adjustments` — `inventory.adjust`

```json
{
  "locationId": "uuid",
  "itemId": "uuid",
  "direction": "out",
  "quantity": 5,
  "reason": "DAMAGE",
  "notes": "Broken in transit",
  "reference": "COUNT-2026-06"
}
```

| Field | Notes |
|-------|--------|
| `direction` | `in` (increase) or `out` (decrease) |
| `quantity` | Positive amount to move |
| `reason` | `DAMAGE` \| `LOSS` \| `FOUND` \| `COUNT` \| `OPENING` \| `RETURN` \| `OTHER` |
| `notes` / `reference` | Optional audit text |
| `purchasePrice` | Optional; only for `in` (updates weighted avg cost) |

Rules:
- `DAMAGE` / `LOSS` require `direction: "out"`
- `FOUND` / `OPENING` require `direction: "in"`
- `out` fails with `400` if available stock is insufficient
- Response includes `quantityBefore`, `quantityAfter`, `createdBy`

**List** `GET /inventory/adjustments` — filters: `locationId`, `itemId`, `direction`, `reason`, `search`, `from`/`to`, `page`/`limit`

```json
{
  "data": [
    {
      "id": "uuid",
      "locationId": "uuid",
      "itemId": "uuid",
      "direction": "out",
      "quantity": "5.000",
      "quantityBefore": "100.000",
      "quantityAfter": "95.000",
      "reason": "DAMAGE",
      "notes": "Broken in transit",
      "reference": "COUNT-2026-06",
      "createdById": "uuid",
      "createdAt": "2026-06-20T12:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

**Excel import** — `multipart/form-data`, field name `file`.

Expected columns (case-insensitive): `description`, `quantity`, `purchasePrice` / `purchase_price` / `price`, optional `sku`, optional `reorderPoint` / `reorder_point`, optional `itemType` (`RAW` \| `SEMI` \| `FINISHED` \| `OTHER`).

Item create/update also accepts `itemType` for manufacturing classification.

---

## Bills of materials (BOM)

| Method | Path | Permission |
|--------|------|------------|
| GET | `/boms` | `bom.read` |
| GET | `/boms/:id` | `bom.read` |
| POST | `/boms` | `bom.write` |
| PATCH | `/boms/:id` | `bom.write` |
| DELETE | `/boms/:id` | `bom.write` (soft-deactivate) |

**Create**

```json
{
  "finishedItemId": "uuid",
  "name": "Standard chair",
  "version": "1.0",
  "notes": "optional",
  "lines": [
    { "componentItemId": "uuid", "quantity": 4, "scrapPercent": 2 },
    { "componentItemId": "uuid", "quantity": 1 }
  ]
}
```

`quantity` is per **1 finished unit**. `scrapPercent` increases required material (e.g. 2% scrap).

List filters: `finishedItemId`, `isActive` (`true`\|`false`), `search`, `page`, `limit`.

---

## Production orders

| Method | Path | Permission |
|--------|------|------------|
| GET | `/production-orders` | `production.read` |
| GET | `/production-orders/:id` | `production.read` |
| POST | `/production-orders` | `production.write` |
| POST | `/production-orders/:id/release` | `production.write` |
| POST | `/production-orders/:id/issue` | `production.write` |
| POST | `/production-orders/:id/complete` | `production.write` |
| POST | `/production-orders/:id/cancel` | `production.write` |

**Lifecycle:** `DRAFT` → `RELEASED` → `IN_PROGRESS` → `COMPLETED` (or `CANCELLED`).

**Create** — snapshots BOM lines into the order (required qty = BOM qty × planned × scrap factor):

```json
{
  "bomId": "uuid",
  "locationId": "uuid",
  "quantityPlanned": 10,
  "notes": "optional"
}
```

**Issue materials** — body optional; omit `lines` to issue all remaining:

```json
{
  "lines": [{ "componentItemId": "uuid", "quantity": 20 }]
}
```

**Complete** — receive finished goods; defaults to auto-issuing any shortfall:

```json
{ "quantity": 10, "autoIssue": true }
```

Finished-good unit cost is set from consumed component costs (weighted). Cancel returns issued (but not completed) materials to stock.

List filters: `locationId`, `finishedItemId`, `bomId`, `status`, `search`, `from`/`to`, `page`/`limit`.

---

## Stock transfers

| Method | Path | Permission |
|--------|------|------------|
| GET | `/stock-transfers` | `stock_transfer.read` |
| GET | `/stock-transfers/:id` | `stock_transfer.read` |
| POST | `/stock-transfers` | `stock_transfer.write` |
| DELETE | `/stock-transfers/:id` | `stock_transfer.write` (void completed transfer) |

```json
{
  "fromLocationId": "uuid",
  "toLocationId": "uuid",
  "notes": "optional",
  "lines": [{ "itemId": "uuid", "quantity": 10 }]
}
```

**Example response**

```json
{
  "id": "uuid",
  "fromLocationId": "uuid",
  "toLocationId": "uuid",
  "notes": "optional",
  "status": "PENDING",
  "lines": [{ "itemId": "uuid", "quantity": "10.000" }],
  "createdAt": "2026-06-10T12:34:56.000Z",
  "updatedAt": "2026-06-10T12:34:56.000Z"
}
```

---

## Suppliers & customers

| Resource | GET list | GET one | POST | PATCH | DELETE |
|----------|----------|---------|------|-------|--------|
| `/suppliers` | `suppliers.read` | `suppliers.read` | `suppliers.write` | `suppliers.write` | `suppliers.write` |
| `/customers` | `customers.read` | `customers.read` | `customers.write` | `customers.write` | `customers.write` |

Body fields: `name`, `phone`, `email`, `address`, `isActive` (PATCH).

**Example response**

```json
{
  "id": "uuid",
  "name": "ABC Trading",
  "phone": "0123456789",
  "email": "abc@example.com",
  "address": "123 Business Ave",
  "isActive": true,
  "createdAt": "2026-06-10T12:34:56.000Z",
  "updatedAt": "2026-06-10T12:34:56.000Z"
}
```

---

## Customer inquiries

Track leads / product questions from the website (**public**) and from staff (**internal**).

### Public (no auth)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/public/inquiries` | Submit from website / landing page |

**Body**

| Field | Required | Notes |
|-------|----------|-------|
| `contactName` | yes | |
| `subject` | yes | |
| `message` | yes | |
| `phone` | one of phone/email | |
| `email` | one of phone/email | |
| `itemId` | no | Optional catalog item interest |

**Response** (`201`)

```json
{
  "id": "uuid",
  "status": "NEW",
  "message": "Inquiry submitted successfully"
}
```

CORS must allow the marketing/site origin via `CORS_ORIGIN`.

### Internal (JWT + permissions)

| Method | Path | Permission |
|--------|------|------------|
| GET | `/inquiries` | `inquiries.read` |
| GET | `/inquiries/:id` | `inquiries.read` |
| POST | `/inquiries` | `inquiries.write` |
| PATCH | `/inquiries/:id` | `inquiries.write` |
| DELETE | `/inquiries/:id` | `inquiries.write` |

**List query:** `page`, `limit`, `from`, `to`, `search` (name, email, phone, subject, message), `status`, `source` (`PUBLIC` \| `INTERNAL`), `priority`, `customerId`, `assignedToUserId`, `itemId`.

**Create body (internal):** same contact fields as public, plus optional `priority`, `customerId`, `assignedToUserId`, `internalNotes`, `followUpAt`. Source is always `INTERNAL`; `createdById` is the logged-in user.

**PATCH body:** any of `contactName`, `phone`, `email`, `subject`, `message`, `status`, `priority`, `customerId`, `itemId`, `assignedToUserId`, `internalNotes`, `followUpAt`, `convertedSaleId`. Setting `convertedSaleId` auto-sets `status` to `CONVERTED` if status is omitted.

**DELETE** soft-cancels (`status = CANCELLED`). Converted inquiries cannot be deleted — set `CLOSED` instead.

**Example inquiry**

```json
{
  "id": "uuid",
  "contactName": "Sara Bekele",
  "phone": "0911234567",
  "email": "sara@example.com",
  "subject": "Custom dining table",
  "message": "Need quote for 8-seater oak table",
  "status": "NEW",
  "priority": "NORMAL",
  "source": "PUBLIC",
  "customerId": null,
  "itemId": null,
  "assignedToUserId": null,
  "createdById": null,
  "internalNotes": null,
  "followUpAt": null,
  "convertedSaleId": null,
  "createdAt": "2026-07-24T10:00:00.000Z",
  "updatedAt": "2026-07-24T10:00:00.000Z"
}
```

---

## CRUD coverage by resource

| Resource | List | Get | Create | Update | Delete / void |
|----------|------|-----|--------|--------|----------------|
| Users | ✓ | ✓ | ✓ | ✓ | ✓ (soft) |
| Roles | ✓ | ✓ | ✓ | ✓ | ✓ |
| Locations | ✓ | ✓ | ✓ | ✓ | ✓ (soft `isActive`) |
| Inventory | ✓ | ✓ | ✓ | ✓ | ✓ |
| Stock transfers | ✓ | ✓ | ✓ | — | ✓ (void, reverses stock) |
| Suppliers / customers | ✓ | ✓ | ✓ | ✓ | ✓ (soft) |
| Inquiries | ✓ | ✓ | ✓ | ✓ | ✓ (cancel) |
| **Purchases** | ✓ | ✓ | ✓ | ✓ (full document) | ✓ (void) |
| **Sales** | ✓ | ✓ | ✓ | ✓ (full document) | ✓ (void) |
| Expenses | ✓ | — | ✓ | ✓ (metadata) | ✓ (reverses bank) |
| Bank accounts | ✓ | ✓ | ✓ | ✓ | — |
| Credits | ✓ | — | pay only | — | — |
| Dashboard / P&amp;L | read only | | | | |

**PATCH** on purchases/sales accepts the same fields as **POST** (all optional). Omitting `lines` keeps existing line items. Sending `lines` replaces all lines. Stock, bank, and credit records are reconciled in one transaction. If credit payments exist (`paidAmount` > 0), only `notes` may be updated. Use **DELETE** to void when reversal is not enough.

---

## Purchases

| Method | Path | Permission |
|--------|------|------------|
| GET | `/purchases?includeVoided=true` | `purchase.read` |
| GET | `/purchases/:id` | `purchase.read` |
| POST | `/purchases` | `purchase.write` |
| PATCH | `/purchases/:id` | `purchase.write` |
| DELETE | `/purchases/:id` | `purchase.write` (void) |

**List totals** (`GET /purchases`): `{ "subtotal": "1000.00", "total": "1000.00" }` — summed over filtered rows (`supplierId`, `locationId`, `paymentMethod`, `search`, dates, etc.).

```json
{
  "supplierId": "uuid",
  "locationId": "uuid",
  "paymentMethod": "BANK",
  "bankAccountId": "uuid",
  "notes": "optional",
  "creditDueDate": "2026-06-30",
  "lines": [
    { "itemId": "uuid", "quantity": 50, "unitPrice": 20 }
  ]
}
```

**Example response**

```json
{
  "id": "uuid",
  "supplierId": "uuid",
  "locationId": "uuid",
  "paymentMethod": "BANK",
  "bankAccountId": "uuid",
  "notes": "optional",
  "creditDueDate": "2026-06-30",
  "subtotal": "1000.00",
  "total": "1150.00",
  "status": "ACTIVE",
  "lines": [
    { "itemId": "uuid", "quantity": "50.000", "unitPrice": "20.00", "lineTotal": "1000.00" }
  ],
  "createdAt": "2026-06-10T12:34:56.000Z",
  "updatedAt": "2026-06-10T12:34:56.000Z"
}
```

**Line `itemId`:** Must be the **product** UUID (`inventory.itemId` or `inventory.item.id` from `GET /inventory`). Do **not** send SKU, numeric ids, or empty strings. The stock row’s own `id` is only valid if it equals `itemId` (it usually does not).

- `BANK` / `CASH`: require `bankAccountId`. **CASH** must use an account with `accountType: "CASH"`; **BANK** must use `accountType: "BANK"` (API returns `400` if mismatched).
- `CREDIT`: creates supplier credit record; optional `creditDueDate`.
- Stock increases at `locationId` (weighted average purchase price).
- All steps run in a single database transaction.

**PATCH** `/purchases/:id` — partial body; reconciles stock/bank/credit when any field other than `notes` alone changes. Blocked when linked supplier credit has payments (notes-only then).

**DELETE** `/purchases/:id` — voids document (`status: VOIDED`), reverses stock and bank, removes unpaid credit.

---

## Sales

| Method | Path | Permission |
|--------|------|------------|
| GET | `/sales?includeVoided=true&soldByUserId=uuid` | `sales.read` |
| GET | `/sales/commissions/summary?from=&to=&soldByUserId=` | `sales.read` |
| GET | `/sales/:id` | `sales.read` |
| POST | `/sales` | `sales.write` |
| PATCH | `/sales/:id` | `sales.write` |
| DELETE | `/sales/:id` | `sales.write` (void) |

**List totals** (`GET /sales`): `{ "subtotal": "700.00", "total": "700.00", "commission": "30.00" }` — summed over filtered rows (`customerId`, `locationId`, `soldByUserId`, `paymentMethod`, `search`, dates, etc.).

```json
{
  "customerId": "uuid",
  "locationId": "uuid",
  "paymentMethod": "CASH",
  "bankAccountId": "uuid",
  "allowNegativeStock": false,
  "creditDueDate": "2026-06-30",
  "soldByUserId": "uuid",
  "commissionPercent": 10,
  "commissionBasis": "PROFIT",
  "lines": [{ "itemId": "uuid", "quantity": 2, "unitPrice": 35 }]
}
```

**Example response**

```json
{
  "id": "uuid",
  "customerId": "uuid",
  "locationId": "uuid",
  "paymentMethod": "CASH",
  "bankAccountId": "uuid",
  "allowNegativeStock": false,
  "creditDueDate": "2026-06-30",
  "soldByUserId": "uuid",
  "commissionPercent": "10.00",
  "commissionBasis": "PROFIT",
  "commissionAmount": "30.00",
  "subtotal": "70.00",
  "total": "77.00",
  "status": "ACTIVE",
  "lines": [
    { "itemId": "uuid", "quantity": "2.000", "unitPrice": "35.00", "lineTotal": "70.00" }
  ],
  "createdAt": "2026-06-10T12:34:56.000Z",
  "updatedAt": "2026-06-10T12:34:56.000Z"
}
```

**Commission / sales rep**

| Field | Default | Meaning |
|--------|---------|---------|
| `soldByUserId` | creator | User credited for the sale |
| `commissionPercent` | `10` | 0–100 rate applied to the commission base |
| `commissionBasis` | `"PROFIT"` | `"PROFIT"` or `"SALES"` — what the percent applies to |

**Commission bases**

| `commissionBasis` | Base amount | Formula |
|-------------------|-------------|---------|
| `PROFIT` (default) | Gross profit on the sale | `Σ (lineTotal − quantity × purchaseCost)` per line; negative profit is treated as `0` |
| `SALES` | Sale subtotal | Sum of line totals (same as `subtotal`) |

Examples (default `commissionPercent: 10`, `commissionBasis: "PROFIT"`):

- Subtotal `1000`, cost `700` → profit `300` → `commissionAmount: "30.00"`
- Same sale with `"commissionBasis": "SALES"` → `commissionAmount: "100.00"`

Sale responses include `soldByUserId`, `commissionPercent`, `commissionBasis`, `commissionAmount`, and nested `soldByUser` (`id`, `fullName`, `email`).

**GET** `/sales/commissions/summary` — per-rep totals for active sales:

```json
[
  {
    "soldByUserId": "uuid",
    "soldByUserName": "Jane Rep",
    "saleCount": 12,
    "totalSubtotal": "45000.00",
    "totalCommission": "2250.00"
  }
]
```

**Behavior**

- If stock is insufficient and `allowNegativeStock` is false → `400` with message.
- If `allowNegativeStock` is true → requires `sales.negative_stock` permission; response may include `stockWarnings` array.
- `CREDIT` requires `customerId`; creates customer credit; optional `creditDueDate`.
- `BANK` / `CASH` require `bankAccountId`; account type must match payment method (see purchases).
- All steps run in a single database transaction.

**PATCH** `/sales/:id` — same rules as purchases; optional `soldByUserId`, `commissionPercent`, and `commissionBasis` (metadata-only patch without `lines` recalculates commission from existing line profit/subtotal). May return `stockWarnings` when `allowNegativeStock` is true. Requires `sales.negative_stock` when enabling negative stock on update.

**DELETE** `/sales/:id` — voids document, reverses stock and bank, removes unpaid customer credit.

---

## Credits

| Method | Path | Permission |
|--------|------|------------|
| GET | `/credits/customers` | `credit.read` |
| GET | `/credits/suppliers` | `credit.read` |
| POST | `/credits/customers/:id/payments` | `credit.write` |
| POST | `/credits/suppliers/:id/payments` | `credit.write` |

**List query params:** `page`, `limit`, `from`, `to`, `status` (`OPEN` \| `PARTIAL` \| `PAID`), `search`, plus `customerId` on `/credits/customers` or `supplierId` on `/credits/suppliers`.

**List response** — paginated rows plus **`totals`** summed across the **filtered** result set (not just the current page):

```json
{
  "data": [],
  "meta": { "page": 1, "limit": 20, "total": 6, "totalPages": 1 },
  "totals": {
    "amount": "504000.00",
    "paidAmount": "435500.00",
    "balance": "68500.00"
  }
}
```

- `totals.amount` — sum of original credit amounts
- `totals.paidAmount` — sum of payments applied
- `totals.balance` — sum of outstanding balances

Example: `GET /credits/suppliers?supplierId=uuid&status=OPEN` returns totals for that supplier’s open credits only.

**Payment body**

```json
{
  "amount": 500,
  "bankAccountId": "uuid"
}
```

**Example response**

```json
{
  "id": "uuid",
  "creditId": "uuid",
  "amount": "500.00",
  "bankAccountId": "uuid",
  "type": "CREDIT_RECEIPT",
  "description": "Customer credit payment",
  "createdAt": "2026-06-10T12:34:56.000Z"
}
```

Customer payment = money in; supplier payment = money out.

---

## Expenses

| Method | Path | Permission |
|--------|------|------------|
| GET | `/expenses/categories` | `expense.read` |
| POST | `/expenses/categories` | `expense.write` |
| GET | `/expenses` | `expense.read` |
| POST | `/expenses` | `expense.write` |
| PATCH | `/expenses/:id` | `expense.write` |
| DELETE | `/expenses/:id` | `expense.write` |

**List totals** (`GET /expenses`): `{ "amount": "1500.00" }` — summed over filtered rows (`categoryId`, `bankAccountId`, `search`, `from`/`to` on `expenseDate`).

```json
{
  "categoryId": "uuid",
  "bankAccountId": "uuid",
  "amount": 150,
  "description": "Rent",
  "expenseDate": "2026-05-30"
}
```

**Example response**

```json
{
  "id": "uuid",
  "categoryId": "uuid",
  "bankAccountId": "uuid",
  "amount": "150.00",
  "description": "Rent",
  "expenseDate": "2026-05-30",
  "createdAt": "2026-06-10T12:34:56.000Z"
}
```

Reduces bank balance automatically (transactional).

**DELETE** `/expenses/:id` — removes the expense and **reverses** the linked bank transaction.

---

## Bank accounts

| Method | Path | Permission |
|--------|------|------------|
| GET | `/banks/accounts?type=CASH\|BANK` | `bank.read` |
| GET | `/banks/liquidity` | `bank.read` |
| GET | `/banks/accounts/:id` | `bank.read` |
| POST | `/banks/accounts` | `bank.write` |
| PATCH | `/banks/accounts/:id` | `bank.write` |
| GET | `/banks/transactions?bankAccountId=` | `bank.read` |
| POST | `/banks/transactions/adjustment` | `bank.write` |

**Account fields**

| Field | Required | Purpose |
|-------|----------|---------|
| `name` | yes | Short **display label** in dropdowns (e.g. `"Main Bank"`, `"Cash"`) |
| `accountType` | yes on create | `CASH` = cash till / petty cash; `BANK` = real bank account |
| `bankName` | no | **Provider / institution** (e.g. `"Commercial Bank of Ethiopia"`) |
| `accountHolderName` | no | **Name on the account** (business or person) |
| `accountNumber` | no | Account number at the bank |
| `balance` | no | Opening balance on create only (default `0`) |
| `isActive` | no | PATCH only — set `false` to soft-deactivate |

**Create / update body**

```json
{
  "name": "Main Bank",
  "accountType": "BANK",
  "bankName": "Commercial Bank of Ethiopia",
  "accountHolderName": "Noble Store PLC",
  "accountNumber": "1000123456789",
  "balance": 0
}
```

**Payment account picker (purchases / sales)**

| `paymentMethod` | Call `GET /banks/accounts?type=` |
|-----------------|----------------------------------|
| `CASH` | `type=CASH` only |
| `BANK` | `type=BANK` only |
| `CREDIT` | no account |

**GET `/banks/liquidity`** — accounts plus totals:

```json
{
  "accounts": [
    { "id": "uuid", "name": "Cash", "accountType": "CASH", "balance": "5000.00" }
  ],
  "totals": {
    "cashTotal": "5000.00",
    "bankTotal": "25000.00",
    "totalLiquidity": "30000.00"
  }
}
```

**Example account response**

```json
{
  "id": "uuid",
  "name": "Main Bank",
  "accountType": "BANK",
  "bankName": "Commercial Bank of Ethiopia",
  "accountHolderName": "Noble Store PLC",
  "accountNumber": "1000123456789",
  "balance": "20000.00",
  "isActive": true,
  "createdAt": "2026-06-10T12:34:56.000Z"
}
```

**GET `/banks/transactions`** — paginated ledger rows. Query: `bankAccountId`, `type`, `direction` (`in` \| `out`), `search`, `from`/`to`, `page`/`limit`.

```json
{
  "data": [
    {
      "id": "uuid",
      "bankAccountId": "uuid",
      "type": "SALE",
      "direction": "in",
      "amount": "10000.00",
      "balanceAfter": "15000.00",
      "description": "Sale …",
      "refType": "sale",
      "refId": "uuid",
      "createdAt": "2026-06-20T06:26:18.156Z",
      "bankAccount": { "id": "uuid", "name": "Main Bank", "accountType": "CASH" }
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

| `direction` | Meaning |
|-------------|---------|
| `in` | Money into the account (sale, customer credit receipt, purchase void reversal, opening/manual deposit) |
| `out` | Money out of the account (purchase, expense, supplier credit payment, sale void reversal) |

`amount` is always positive; use `direction` for sign in the UI.

**Adjustment**

```json
{
  "bankAccountId": "uuid",
  "amount": 1000,
  "direction": "in",
  "description": "Opening balance"
}
```

---

## Dashboard

### GET `/dashboard` — `dashboard.read`

Optional query: `?from=2026-05-01&to=2026-05-31` filters the `profitAndLoss` block (daily sales/purchases remain today-only).

```json
{
  "totalInventoryValue": "125000.00",
  "stockValueByLocation": [
    { "locationId": "uuid", "locationName": "Main Warehouse", "value": "80000.00" }
  ],
  "showroomCount": 3,
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
    "totalLiquidity": "25000.00",
    "totalBankBalance": "25000.00",
    "bankAccounts": [
      { "id": "uuid", "name": "Cash", "accountType": "CASH", "bankName": null, "balance": "5000.00" },
      { "id": "uuid", "name": "Main Bank", "accountType": "BANK", "bankName": "CBE", "balance": "20000.00" }
    ]
  }
}
```

`totalLiquidity` = `cashTotal` + `bankTotal`. `totalBankBalance` is kept for older clients (same as `totalLiquidity`).

---

## Profit & loss

| Method | Path | Permission |
|--------|------|------------|
| GET | `/profit-loss/summary?from=&to=` | `profit_loss.read` |
| GET | `/profit-loss/by-item?from=&to=` | `profit_loss.read` |

**Per-item row**: `itemId`, `description`, `quantitySold`, `revenue`, `cost`, `profit`, `marginPercent`.

**Example response**

```json
{
  "itemId": "uuid",
  "description": "Widget",
  "quantitySold": "120.000",
  "revenue": "3600.00",
  "cost": "2400.00",
  "profit": "1200.00",
  "marginPercent": "33.33"
}
```

---

## Notifications (in-app)

User-scoped in-app notifications. Any authenticated user can manage **their own** notifications — no extra permission required. Poll `GET /notifications/unread-count` for badge counts (no WebSocket/SSE yet).

Notifications are created automatically when you record a **sale**, **purchase**, or **stock transfer**. **Low-stock alerts** fire when quantity crosses at or below `reorderPoint` (or hits zero), and go to users with `inventory.read`.

| Method | Path | Auth |
|--------|------|------|
| GET | `/notifications` | Bearer token |
| GET | `/notifications/unread-count` | Bearer token |
| GET | `/notifications/:id` | Bearer token |
| PATCH | `/notifications/read-all` | Bearer token |
| PATCH | `/notifications/:id/read` | Bearer token |
| DELETE | `/notifications/:id` | Bearer token |

**List query params:** `page`, `limit`, `search`, `from`, `to`, `isRead` (`true`|`false`), `module` (e.g. `sales`, `inventory`).

**List response**

```json
{
  "data": [
    {
      "id": "uuid",
      "userId": "uuid",
      "module": "sales",
      "type": "SALE",
      "title": "Sale completed",
      "message": "Sale #1234 recorded at Main Showroom",
      "entityType": "sale",
      "entityId": "uuid",
      "isRead": false,
      "readAt": null,
      "metadata": { "total": "1250.00" },
      "createdAt": "2026-06-10T12:34:56.000Z",
      "updatedAt": "2026-06-10T12:34:56.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

**Unread count:** `{ "count": 3 }`

**Mark all read:** `{ "updated": 3 }`

**Dismiss:** `{ "success": true }`

### Notification types (`type` field)

| Value | Typical use |
|-------|-------------|
| `LOW_STOCK` | Quantity at/below reorder point or out of stock |
| `STOCK_TRANSFER` | Transfer completed / pending |
| `SALE` | Sale events |
| `PURCHASE` | Purchase events |
| `CREDIT_DUE` | Credit payment reminders |
| `EXPENSE` | Expense events |
| `SYSTEM` | General system messages |

Use `entityType` + `entityId` to deep-link in the UI (e.g. `/sales/:entityId`).

---

## Users & roles (admin)

| Method | Path | Permission |
|--------|------|------------|
| GET/POST/PATCH/DELETE | `/users` | `users.read` / `users.write` |
| GET/POST/PATCH/DELETE | `/roles` | `roles.read` / `roles.write` |
| GET | `/permissions` | `roles.read` |

**Create role**

```json
{
  "name": "Accountant",
  "description": "Finance only",
  "permissionIds": ["uuid", "uuid"]
}
```

**Example response**

```json
{
  "id": "uuid",
  "name": "Accountant",
  "description": "Finance only",
  "permissions": [
    { "code": "purchase.read", "name": "View purchases" },
    { "code": "bank.read", "name": "View bank accounts" }
  ],
  "createdAt": "2026-06-10T12:34:56.000Z",
  "updatedAt": "2026-06-10T12:34:56.000Z"
}
```

**Create user**

```json
{
  "email": "user@example.com",
  "password": "secret123",
  "fullName": "Jane Doe",
  "roleId": "uuid"
}
```

**Update user** (PATCH `/users/:id`)

```json
{
  "fullName": "Jane Doe",
  "roleId": "uuid",
  "password": "optional-new-password"
}
```

---

## Error format

NestJS default:

```json
{
  "statusCode": 400,
  "message": "Stock unavailable: ...",
  "error": "Bad Request"
}
```

| Code | Meaning |
|------|---------|
| 401 | Missing/invalid token |
| 403 | Missing permission |
| 404 | Resource not found |
| 409 | Conflict (e.g. duplicate email) |

---

## Health

`GET /api/health` — no auth.

```json
{
  "status": "ok",
  "service": "inventory-api",
  "currency": { "code": "ETB", "symbol": "Br" }
}
```

---

## Setup checklist

### Backend (this repo)

1. `npm run db:create` (or create `stock_management` in Postgres manually).
2. Run `database/schema.sql` **or** set `DB_SYNCHRONIZE=true` for dev only.
3. Set `.env` (`DB_PASSWORD` must be a string; empty breaks pg SASL auth).
4. `DB_SEED=true` on first run → roles, permissions, admin, default warehouse, **Main Bank** + **Cash** accounts.
5. `npm run start:dev` → `http://localhost:3001/api`

Default admin: `admin@stock.local` / `Admin@123` (override with `SEED_ADMIN_*`).

**CORS:** Set `CORS_ORIGIN` to your production frontend URL(s), comma-separated (e.g. `https://noblestore.net`). `http://localhost:3000` is always allowed so local Next.js dev can call the deployed API.

### Frontend (Next.js)

```bash
cp .env.example .env.local
# NEXT_PUBLIC_API_URL=http://localhost:3001/api
npm install && npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Frontend route map

| UI route | Primary API |
|----------|-------------|
| `/login` | `POST /auth/login` |
| `/dashboard` | `GET /dashboard` |
| `/inventory` | `/inventory`, import, `/inventory/adjustments` |
| `/boms` | `/boms` |
| `/production-orders` | `/production-orders` |
| `/stock-transfers`, `/stock-transfers/[id]` | `/stock-transfers` |
| `/purchases`, `/purchases/new`, `/purchases/[id]` | `/purchases` |
| `/sales`, `/sales/new`, `/sales/[id]` | `/sales` |
| `/credits` | `/credits/*` |
| `/expenses` | `/expenses` |
| `/banks` | `/banks/*` |
| `/profit-loss` | `/profit-loss/*` |
| `/locations`, `/suppliers`, `/customers` | master data + PATCH |
| `/inquiries`, `/public/inquiries` | customer inquiries (staff + public submit) |
| `/users`, `/roles` | admin CRUD |
| `/notifications` | in-app notification bell |
