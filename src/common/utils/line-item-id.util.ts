/** Resolve product UUID from common purchase/sale line payload shapes. */
export function resolveLineItemIdFromPayload(
  obj: Record<string, unknown>,
): string | undefined {
  const direct = obj.itemId;
  if (typeof direct === 'string') {
    return direct.trim();
  }

  const nested = obj.item;
  if (nested !== null && typeof nested === 'object' && !Array.isArray(nested)) {
    const nestedId = (nested as Record<string, unknown>).id;
    if (typeof nestedId === 'string') {
      return nestedId.trim();
    }
  }

  const fallbackId = obj.id;
  if (typeof fallbackId === 'string') {
    return fallbackId.trim();
  }

  return undefined;
}
