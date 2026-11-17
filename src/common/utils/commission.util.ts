import { CommissionBasis } from '../enums';

export type CommissionLineInput = {
  quantity: string | number;
  /** Qty in stock UOM; required for correct COGS when txn UOM differs. */
  stockQuantity?: string | number | null;
  lineTotal?: string;
  unitPrice?: string | number;
  /** Cost per stock UOM unit. */
  purchaseCost: string | number;
};

function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0;
  return typeof v === 'string' ? parseFloat(v) : v;
}

/** Qty used for cost (stock UOM). Falls back to txn qty for legacy rows. */
export function stockQtyForCost(line: {
  quantity: string | number;
  stockQuantity?: string | number | null;
}): number {
  if (line.stockQuantity != null && line.stockQuantity !== '') {
    return num(line.stockQuantity);
  }
  return num(line.quantity);
}

/** Gross profit from sale lines (revenue minus cost at time of sale). */
export function computeSaleProfit(lines: CommissionLineInput[]): number {
  let profit = 0;
  for (const line of lines) {
    const stockQty = stockQtyForCost(line);
    const purchaseCost = num(line.purchaseCost);
    const revenue =
      line.lineTotal !== undefined
        ? num(line.lineTotal)
        : num(line.quantity) * num(line.unitPrice);
    profit += revenue - stockQty * purchaseCost;
  }
  return profit;
}

/** Commission amount from basis, subtotal/profit, and percentage (e.g. 10 = 10%). */
export function computeCommissionAmount(
  basis: CommissionBasis,
  subtotal: number,
  profit: number,
  commissionPercent: number,
): string {
  if (commissionPercent <= 0) return '0.00';
  const base = basis === CommissionBasis.SALES ? subtotal : Math.max(0, profit);
  const amount = (base * commissionPercent) / 100;
  return amount.toFixed(2);
}
