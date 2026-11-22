export enum LocationType {
  WAREHOUSE = 'WAREHOUSE',
  SHOWROOM = 'SHOWROOM',
}

export enum PaymentMethod {
  CASH = 'CASH',
  BANK = 'BANK',
  CREDIT = 'CREDIT',
}

/** Ledger account: physical cash till vs real bank account. */
export enum BankAccountType {
  CASH = 'CASH',
  BANK = 'BANK',
}

export enum BankTransactionType {
  SALE = 'SALE',
  PURCHASE = 'PURCHASE',
  EXPENSE = 'EXPENSE',
  CREDIT_PAYMENT = 'CREDIT_PAYMENT',
  CREDIT_RECEIPT = 'CREDIT_RECEIPT',
  ADJUSTMENT = 'ADJUSTMENT',
  OPENING = 'OPENING',
}

/** Money movement relative to the bank/cash account. */
export enum BankTransactionDirection {
  IN = 'in',
  OUT = 'out',
}

export enum CreditType {
  CUSTOMER = 'CUSTOMER',
  SUPPLIER = 'SUPPLIER',
}

/** How a credit balance was created. OPENING is cutover AR/AP with no sale/purchase. */
export enum CreditSource {
  SALE = 'SALE',
  PURCHASE = 'PURCHASE',
  OPENING = 'OPENING',
}

export enum CreditStatus {
  OPEN = 'OPEN',
  PARTIAL = 'PARTIAL',
  PAID = 'PAID',
}

export enum TransferStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum DocumentStatus {
  ACTIVE = 'ACTIVE',
  VOIDED = 'VOIDED',
}

/** Whether commission is calculated on sale profit or gross subtotal. */
export enum CommissionBasis {
  PROFIT = 'PROFIT',
  SALES = 'SALES',
}

export const DEFAULT_COMMISSION_PERCENT = 10;

/** Inventory stock adjustment reasons (manual qty changes with audit). */
export enum StockAdjustmentReason {
  DAMAGE = 'DAMAGE',
  LOSS = 'LOSS',
  FOUND = 'FOUND',
  COUNT = 'COUNT',
  OPENING = 'OPENING',
  RETURN = 'RETURN',
  OTHER = 'OTHER',
}

/** Stock quantity movement for adjustments. */
export enum StockAdjustmentDirection {
  IN = 'in',
  OUT = 'out',
}

/** Catalog classification for manufacturing / BOM. */
export enum ItemType {
  RAW = 'RAW',
  SEMI = 'SEMI',
  FINISHED = 'FINISHED',
  OTHER = 'OTHER',
}

/** Bill of Materials type. */
export enum BomType {
  MANUFACTURE = 'MANUFACTURE',
  KIT = 'KIT',
}

/**
 * When sale/purchase lines carry W×H cuts:
 * AREA = unitPrice is per stock-area unit (m²); PIECE = unitPrice is per piece.
 * Null on item = non-dimensional (plain qty × price).
 */
export enum DimensionPriceMode {
  AREA = 'AREA',
  PIECE = 'PIECE',
}

export enum ProductionOrderStatus {
  DRAFT = 'DRAFT',
  RELEASED = 'RELEASED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/** In-app notification categories (matches permission modules where applicable). */
export enum NotificationType {
  LOW_STOCK = 'LOW_STOCK',
  STOCK_TRANSFER = 'STOCK_TRANSFER',
  SALE = 'SALE',
  PURCHASE = 'PURCHASE',
  CREDIT_DUE = 'CREDIT_DUE',
  EXPENSE = 'EXPENSE',
  SYSTEM = 'SYSTEM',
  INQUIRY = 'INQUIRY',
  PRODUCTION = 'PRODUCTION',
}

/** How a customer inquiry entered the system. */
export enum InquirySource {
  PUBLIC = 'PUBLIC',
  INTERNAL = 'INTERNAL',
}

/** Quotation lifecycle (Odoo / ERPNext-style). */
export enum InquiryStatus {
  DRAFT = 'DRAFT',
  QUOTED = 'QUOTED',
  ORDERED = 'ORDERED',
  LOST = 'LOST',
  CANCELLED = 'CANCELLED',
}

export enum InquiryPriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

/**
 * CRM-style ownership of an inquiry assignment.
 * Assign → PENDING (assignee must Accept or Decline).
 * Self-assign / Claim → ACCEPTED immediately.
 */
export enum InquiryAssignmentStatus {
  UNASSIGNED = 'UNASSIGNED',
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
}
