import { TaxMode } from '../enums';

export type TaxComputation = {
  taxPercent: string;
  taxAmount: string;
  total: string;
  taxMode: TaxMode;
};

/** Compute document tax and payable total from subtotal + plan/override. */
export function computeDocumentTax(
  subtotal: number,
  percent: number,
  mode: TaxMode,
  enabled: boolean,
): TaxComputation {
  const pct = !enabled || percent <= 0 ? 0 : percent;
  const taxMode = mode ?? TaxMode.EXCLUSIVE;

  if (pct <= 0) {
    return {
      taxPercent: '0.00',
      taxAmount: '0.00',
      total: subtotal.toFixed(2),
      taxMode,
    };
  }

  let taxAmount: number;
  let total: number;

  if (taxMode === TaxMode.INCLUSIVE) {
    // tax = gross - net = subtotal - subtotal / (1 + r)
    taxAmount = subtotal - subtotal / (1 + pct / 100);
    total = subtotal;
  } else {
    taxAmount = (subtotal * pct) / 100;
    total = subtotal + taxAmount;
  }

  return {
    taxPercent: pct.toFixed(2),
    taxAmount: taxAmount.toFixed(2),
    total: total.toFixed(2),
    taxMode,
  };
}
