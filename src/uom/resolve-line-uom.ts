import { EntityManager } from 'typeorm';
import { Item } from '../database/entities/item.entity';
import { UomConversionService } from './uom-conversion.service';

export type ResolvedLineUom = {
  itemId: string;
  quantity: number;
  uomId: string | null;
  stockQuantity: number;
};

/**
 * Resolve txn UOM + stock quantity for a document line.
 */
export async function resolveLineUom(
  conversion: UomConversionService,
  item: Item,
  preferred: 'sales' | 'purchase' | 'stock',
  quantity: number,
  explicitUomId?: string | null,
): Promise<ResolvedLineUom> {
  const uomId = await conversion.resolveTxnUomId(
    item,
    preferred,
    explicitUomId,
  );
  const stockQuantity = await conversion.toStockQuantity({
    item,
    fromUomId: uomId,
    quantity,
  });
  return {
    itemId: item.id,
    quantity,
    uomId,
    stockQuantity,
  };
}

export async function loadItemForUom(
  manager: EntityManager,
  itemId: string,
): Promise<Item | null> {
  return manager.getRepository(Item).findOne({
    where: { id: itemId },
    relations: {
      stockUom: { category: true },
      salesUom: { category: true },
      purchaseUom: { category: true },
      itemUoms: true,
    },
  });
}
