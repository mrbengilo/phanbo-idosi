import { z } from 'zod';

import {
  AuditReasonSchema,
  EntityIdSchema,
  IsoDateTimeSchema,
  KilogramsDecimalSchema,
  PositiveKilogramsDecimalSchema,
  PositiveUnitQuantitySchema,
  UnitQuantitySchema,
} from './common.js';

export const UnitInventoryAmountSchema = z
  .object({ kind: z.literal('UNIT'), quantity: UnitQuantitySchema })
  .strict();
export type UnitInventoryAmount = z.infer<typeof UnitInventoryAmountSchema>;

export const WeightInventoryAmountSchema = z
  .object({
    kind: z.literal('WEIGHT'),
    value: KilogramsDecimalSchema,
    unit: z.literal('kg'),
  })
  .strict();
export type WeightInventoryAmount = z.infer<typeof WeightInventoryAmountSchema>;

export const InventoryAmountSchema = z.discriminatedUnion('kind', [
  UnitInventoryAmountSchema,
  WeightInventoryAmountSchema,
]);
export type InventoryAmount = z.infer<typeof InventoryAmountSchema>;

export const PositiveUnitInventoryAmountSchema = z
  .object({ kind: z.literal('UNIT'), quantity: PositiveUnitQuantitySchema })
  .strict();

export const PositiveWeightInventoryAmountSchema = z
  .object({
    kind: z.literal('WEIGHT'),
    value: PositiveKilogramsDecimalSchema,
    unit: z.literal('kg'),
  })
  .strict();

export const PositiveInventoryAmountSchema = z.discriminatedUnion('kind', [
  PositiveUnitInventoryAmountSchema,
  PositiveWeightInventoryAmountSchema,
]);
export type PositiveInventoryAmount = z.infer<typeof PositiveInventoryAmountSchema>;

export const WarehouseBalanceSchema = z
  .object({
    productId: EntityIdSchema,
    available: InventoryAmountSchema,
    reserved: InventoryAmountSchema,
    version: z.number().int().nonnegative(),
    updatedAt: IsoDateTimeSchema,
  })
  .strict()
  .superRefine((balance, context) => {
    if (balance.available.kind !== balance.reserved.kind) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reserved', 'kind'],
        message: 'Available and reserved amounts must use the same measurement',
      });
    }
  });
export type WarehouseBalance = z.infer<typeof WarehouseBalanceSchema>;

export const WarehouseBalancesResponseSchema = z
  .object({ data: z.array(WarehouseBalanceSchema), asOf: IsoDateTimeSchema })
  .strict();
export type WarehouseBalancesResponse = z.infer<typeof WarehouseBalancesResponseSchema>;

export const WarehouseAdjustmentDirectionSchema = z.enum(['INCREASE', 'DECREASE']);
export type WarehouseAdjustmentDirection = z.infer<typeof WarehouseAdjustmentDirectionSchema>;

export const WarehouseAdjustmentReasonSchema = z.enum([
  'COUNT_CORRECTION',
  'DAMAGE',
  'RETURN',
  'RECEIPT_CORRECTION',
  'OUTBOUND_CORRECTION',
  'OTHER',
]);
export type WarehouseAdjustmentReason = z.infer<typeof WarehouseAdjustmentReasonSchema>;

export const WarehouseAdjustmentRequestLineSchema = z
  .object({
    productId: EntityIdSchema,
    amount: PositiveInventoryAmountSchema,
    expectedVersion: z.number().int().nonnegative(),
  })
  .strict();
export type WarehouseAdjustmentRequestLine = z.infer<typeof WarehouseAdjustmentRequestLineSchema>;

export const CreateWarehouseAdjustmentRequestSchema = z
  .object({
    direction: WarehouseAdjustmentDirectionSchema,
    reasonCode: WarehouseAdjustmentReasonSchema,
    reason: AuditReasonSchema,
    lines: z
      .array(WarehouseAdjustmentRequestLineSchema)
      .min(1)
      .max(500)
      .refine(
        (lines) => new Set(lines.map((line) => line.productId)).size === lines.length,
        'A product may appear only once per adjustment',
      ),
  })
  .strict();
export type CreateWarehouseAdjustmentRequest = z.infer<
  typeof CreateWarehouseAdjustmentRequestSchema
>;

export const WarehouseAdjustmentLineSchema = z
  .object({
    productId: EntityIdSchema,
    before: InventoryAmountSchema,
    change: PositiveInventoryAmountSchema,
    after: InventoryAmountSchema,
    resultingVersion: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((line, context) => {
    const kinds = [line.before.kind, line.change.kind, line.after.kind];
    if (new Set(kinds).size !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['change', 'kind'],
        message: 'Before, change, and after amounts must use the same measurement',
      });
    }
  });
export type WarehouseAdjustmentLine = z.infer<typeof WarehouseAdjustmentLineSchema>;

export const WarehouseAdjustmentSchema = z
  .object({
    id: EntityIdSchema,
    direction: WarehouseAdjustmentDirectionSchema,
    reasonCode: WarehouseAdjustmentReasonSchema,
    reason: AuditReasonSchema,
    lines: z.array(WarehouseAdjustmentLineSchema).min(1),
    createdByAccountId: EntityIdSchema,
    createdAt: IsoDateTimeSchema,
  })
  .strict();
export type WarehouseAdjustment = z.infer<typeof WarehouseAdjustmentSchema>;

export const CreateWarehouseAdjustmentResponseSchema = z
  .object({ data: WarehouseAdjustmentSchema })
  .strict();
export type CreateWarehouseAdjustmentResponse = z.infer<
  typeof CreateWarehouseAdjustmentResponseSchema
>;

export const WarehouseStockInputEntrySchema = z
  .object({
    productId: EntityIdSchema,
    ledgerEntryId: EntityIdSchema,
    onHandQuantity: z.number().int().nonnegative(),
  })
  .strict();
export type WarehouseStockInputEntry = z.infer<typeof WarehouseStockInputEntrySchema>;

export const CreateWarehouseStockInputResponseSchema = z
  .object({
    data: z
      .object({
        adjustmentId: EntityIdSchema,
        entries: z.array(WarehouseStockInputEntrySchema),
      })
      .strict(),
  })
  .strict();
export type CreateWarehouseStockInputResponse = z.infer<
  typeof CreateWarehouseStockInputResponseSchema
>;
