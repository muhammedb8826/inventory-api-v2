import { CommissionBasis } from '../enums';

export type CommissionLineInput = {
  quantity: string | number;
  lineTotal?: string;
  unitPrice?: string | number;
  purchaseCost: string | number;
};

/** Gross profit from sale lines (revenue minus cost at time of sale). */
export function computeSaleProfit(lines: CommissionLineInput[]): number {
  let profit = 0;
  for (const line of lines) {
    const qty =
      typeof line.quantity === 'string'
        ? parseFloat(line.quantity)
        : line.quantity;
    const purchaseCost =
      typeof line.purchaseCost === 'string'
        ? parseFloat(line.purchaseCost)
        : line.purchaseCost;
    const revenue =
      line.lineTotal !== undefined
        ? parseFloat(line.lineTotal)
        : qty *
          (typeof line.unitPrice === 'string'
            ? parseFloat(line.unitPrice)
            : (line.unitPrice ?? 0));
    profit += revenue - qty * purchaseCost;
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
