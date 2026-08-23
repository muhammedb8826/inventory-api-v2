# Frontend guide

Practical guide for integrating the Next.js (or any) client with this Stock Management API.

**Full REST contract:** [FRONTEND_API.md](./FRONTEND_API.md)  
**API base URL:** `http://localhost:3001/api` (override with `NEXT_PUBLIC_API_URL`)

---

## Quick start

1. Point the frontend at the API:

```bash
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

2. Ensure the backend allows your origin via `CORS_ORIGIN` (comma-separated).  
   `http://localhost:3000` is always allowed.

3. Sign in with the seeded admin (after backend seed):

| Email | Password |
|-------|----------|
| `admin@stock.local` | `Admin@123` |

4. Store `accessToken` and `refreshToken` from login. Send:

```http
Authorization: Bearer <accessToken>
```

on every protected request. Use `POST /auth/refresh` when the access token expires; call `POST /auth/logout` with the refresh token on sign-out.

---

## Auth & permissions

- Login / refresh / logout / me: `/auth/*` (see [FRONTEND_API.md](./FRONTEND_API.md#authentication)).
- Hide nav and actions using `user.role.permissions` from login or `GET /auth/me`.
- Endpoints require codes such as `inventory.read`, `sales.write`, `inquiries.read`. Missing permission → `403`.

### Default roles (seeded)

| Role | Typical UI areas |
|------|------------------|
| Admin | Everything |
| Sales Representative | Sales, customers, **inquiries**, bank, credits, dashboard |
| Purchaser | Purchases, suppliers, credits |
| Stock Keeper | Inventory, BOM, production, transfers |

---

## Response conventions

### Paginated lists

Most list endpoints return:

```json
{
  "data": [ /* items */ ],
  "meta": { "page": 1, "limit": 20, "total": 100, "totalPages": 5 }
}
```

Common query params: `page`, `limit`, `from`, `to` (ISO dates), `search`.

Some lists also include **`totals`** over the full filtered set (not just the page): inventory, purchases, sales, expenses, credits.

### Errors

```json
{
  "statusCode": 400,
  "message": "Human-readable or validation array",
  "error": "Bad Request"
}
```

### Currency

Amounts are decimal strings in ETB (e.g. `"1250.00"`). Use `currency` from `/health`, dashboard, or P&L (`code` / `symbol`) for display.

---

## UI → API map

| UI route (suggested) | Primary API |
|----------------------|-------------|
| `/login` | `POST /auth/login` |
| `/dashboard` | `GET /dashboard` |
| `/inventory` | `/inventory`, `/inventory/adjustments`, import |
| `/boms` | `/boms` |
| `/production-orders` | `/production-orders` |
| `/stock-transfers` | `/stock-transfers` |
| `/purchases` | `/purchases` |
| `/sales` | `/sales` |
| `/credits` | `/credits/*` |
| `/expenses` | `/expenses` |
| `/banks` | `/banks/*` |
| `/profit-loss` | `/profit-loss/*` |
| `/reports` | `/reports/*` |
| `/locations`, `/suppliers`, `/customers` | master data CRUD |
| `/inquiries` | `/inquiries` (staff) |
| Contact / landing form | `POST /public/inquiries` (no auth) |
| `/users`, `/roles` | admin CRUD |
| Notification bell | `/notifications` |

---

## Customer inquiries

### Public website form (no JWT)

Use on marketing / contact pages:

```http
POST /api/public/inquiries
Content-Type: application/json
```

```json
{
  "contactName": "Sara Bekele",
  "phone": "0911234567",
  "email": "sara@example.com",
  "subject": "Custom dining table",
  "message": "Need a quote for an 8-seater",
  "lines": [
    { "itemId": "uuid", "quantity": 1, "notes": "Oak finish" },
    { "itemId": "uuid", "quantity": 6 }
  ]
}
```

- Require at least **phone or email**.
- Optional `lines` for multiple catalog items (or legacy single `itemId`).
- Response: `{ "id", "status": "NEW", "message": "Inquiry submitted successfully" }`.
- Ensure the site origin is listed in backend `CORS_ORIGIN`.

### Internal CRM (authenticated)

| Action | Method | Path | Permission |
|--------|--------|------|------------|
| List | GET | `/inquiries` | `inquiries.read` |
| Detail | GET | `/inquiries/:id` | `inquiries.read` |
| Create (walk-in / phone) | POST | `/inquiries` | `inquiries.write` |
| Update / assign / status | PATCH | `/inquiries/:id` | `inquiries.write` |
| Cancel | DELETE | `/inquiries/:id` | `inquiries.write` |

**List filters:** `status`, `source` (`PUBLIC` \| `INTERNAL`), `priority`, `customerId`, `assignedToUserId`, `itemId`, `search`, `from`, `to`.

**Statuses:** `NEW` → `IN_PROGRESS` → `QUOTED` → `CONVERTED` / `CLOSED` / `CANCELLED`.

Setting `convertedSaleId` on PATCH marks the inquiry `CONVERTED` if status is omitted. DELETE soft-cancels; converted rows cannot be deleted — close them instead.

Suggested UI:

1. **Public:** contact form → `POST /public/inquiries`.
2. **Staff inbox:** table of `/inquiries` with filters by status/source; badge for `NEW`.
3. **Detail drawer:** assign user, set priority/follow-up, link customer or sale, internal notes.

**Notifications (automatic):**

- Public submit → all users with `inquiries.read` get an in-app notification.
- Assign / reassign → new assignee is notified; previous assignee is notified on reassignment/unassignment.
- Self-assignment does **not** notify the actor (standard CRM behavior).
- Deep-link: `entityType: "inquiry"` + `entityId` → `/inquiries/:id`.

---

## Important client rules

1. **CASH / BANK payments** need `bankAccountId` (use seeded **Cash** for cash sales/purchases).
2. **PATCH** purchases/sales can change lines and payment; stock and ledger are reconciled. Blocked after credit payments except `notes`.
3. **DELETE** purchase/sale **voids** the document (not a hard delete).
4. **Inventory quantity** is not changed via `PATCH /inventory/:id` — use `/inventory/adjustments`.
5. **Bank `amount`** is always positive; use `direction` (`in` \| `out`) for sign in the UI.
6. **Manufacturing:** BOMs → production orders (`release` → `issue` → `complete`).
7. **Reports** under `/reports/*` need `reports.read`.
8. **Notifications** are user-scoped; poll or refresh unread count for the bell.

---

## Docs index

| Doc | Purpose |
|-----|---------|
| [FRONTEND_API.md](./FRONTEND_API.md) | Canonical endpoint reference, payloads, enums, errors |
| This README | Frontend-oriented overview and integration checklist |

For endpoint-level detail (every field and example), always prefer **FRONTEND_API.md**.
