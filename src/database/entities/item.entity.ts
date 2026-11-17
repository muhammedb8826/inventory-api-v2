import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  UpdateDateColumn,
} from 'typeorm';
import { DimensionPriceMode, ItemType } from '../../common/enums';
import { StockLevel } from './stock-level.entity';
import { UuidBaseEntity } from './uuid-base.entity';
import { Uom } from './uom.entity';
import { ItemUom } from './item-uom.entity';
import { ItemAttributeValue } from './item-attribute-value.entity';
import { ProductAttributeValue } from './product-attribute-value.entity';

@Entity('items')
export class Item extends UuidBaseEntity {
  @Column({ type: 'varchar', length: 80, nullable: true })
  sku: string | null;

  @Column({ type: 'text' })
  description: string;

  /**
   * Legacy free-text unit label (kept in sync with stock UOM symbol).
   * Prefer `stockUomId` for conversions.
   */
  @Column({ type: 'varchar', length: 40, nullable: true })
  unit: string | null;

  /** Inventory / BOM base UOM — all stock quantities are stored in this unit. */
  @Column({ name: 'stock_uom_id', type: 'uuid', nullable: true })
  stockUomId: string | null;

  @Column({ name: 'sales_uom_id', type: 'uuid', nullable: true })
  salesUomId: string | null;

  @Column({ name: 'purchase_uom_id', type: 'uuid', nullable: true })
  purchaseUomId: string | null;

  /**
   * When stock UOM is Area and txn UOM is Length (or reverse):
   * area = length × uomWidth (width in stock-area base units per length-base unit).
   * Example: fabric width 1.5 → sell 2 m → stock 3 sqm.
   */
  @Column({
    name: 'uom_width',
    type: 'decimal',
    precision: 18,
    scale: 9,
    nullable: true,
  })
  uomWidth: string | null;

  /**
   * Cut-line pricing: AREA (per m²) or PIECE (per piece).
   * Null = dimensions not used; plain qty × price.
   */
  @Column({
    name: 'dimension_price_mode',
    type: 'enum',
    enum: DimensionPriceMode,
    enumName: 'items_dimension_price_mode_enum',
    nullable: true,
  })
  dimensionPriceMode: DimensionPriceMode | null;

  @Column({
    name: 'item_type',
    type: 'enum',
    enum: ItemType,
    enumName: 'items_item_type_enum',
    default: ItemType.OTHER,
  })
  itemType: ItemType;

  /** Relative path e.g. `/uploads/items/item-….webp`. */
  @Column({ name: 'image_path', type: 'varchar', length: 500, nullable: true })
  imagePath: string | null;

  /** Absolute (or relative) URL for API clients — set in service, not persisted. */
  imageUrl?: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  /** Product template that owns attribute value sets (no stock). */
  @Column({ name: 'is_template', default: false })
  isTemplate: boolean;

  /** Variant → template. Null for standalone items and templates. */
  @Column({ name: 'parent_item_id', type: 'uuid', nullable: true })
  parentItemId: string | null;

  /**
   * Stable key for a variant combination:
   * sorted `attributeId:valueId` pairs joined by `|`.
   */
  @Column({ name: 'variant_key', type: 'varchar', length: 200, nullable: true })
  variantKey: string | null;

  @ManyToOne(() => Item, (item) => item.variants, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'parent_item_id' })
  parentItem: Item | null;

  @OneToMany(() => Item, (item) => item.parentItem)
  variants: Item[];

  @ManyToOne(() => Uom, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'stock_uom_id' })
  stockUom: Uom | null;

  @ManyToOne(() => Uom, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sales_uom_id' })
  salesUom: Uom | null;

  @ManyToOne(() => Uom, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'purchase_uom_id' })
  purchaseUom: Uom | null;

  @OneToMany(() => ItemUom, (iu) => iu.item)
  itemUoms: ItemUom[];

  @OneToMany(() => ItemAttributeValue, (iav) => iav.item)
  itemAttributeValues: ItemAttributeValue[];

  /** Flattened selected values — set in inventory service, not a DB column. */
  attributeValues?: ProductAttributeValue[];

  @OneToMany(() => StockLevel, (stock) => stock.item)
  stockLevels: StockLevel[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
