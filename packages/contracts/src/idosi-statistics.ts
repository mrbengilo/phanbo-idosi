import { z } from 'zod';

import { EntityIdSchema, IsoDateSchema, IsoDateTimeSchema, MoneyVndSchema } from './common.js';

const PERIOD_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/u;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export const IdosiStatisticsPeriodSchema = z
  .string()
  .regex(PERIOD_PATTERN, 'Expected a month in YYYY-MM format');
export type IdosiStatisticsPeriod = z.infer<typeof IdosiStatisticsPeriodSchema>;

export const IdosiStatisticsPaymentMethodSchema = z.enum(['cash', 'transfer']);
export type IdosiStatisticsPaymentMethod = z.infer<typeof IdosiStatisticsPaymentMethodSchema>;

export const IdosiStatisticsScopeSchema = z
  .object({
    storeId: EntityIdSchema,
    period: IdosiStatisticsPeriodSchema,
    date: IsoDateSchema.nullable().default(null),
    shiftId: z.string().trim().min(1).max(200).nullable().default(null),
    paymentMethod: IdosiStatisticsPaymentMethodSchema.nullable().default(null),
  })
  .strict()
  .refine((scope) => scope.date === null || scope.date.startsWith(`${scope.period}-`), {
    path: ['date'],
    message: 'Date must belong to the selected period',
  });
export type IdosiStatisticsScope = z.infer<typeof IdosiStatisticsScopeSchema>;

export const GetIdosiStatisticsQuerySchema = IdosiStatisticsScopeSchema;
export type GetIdosiStatisticsQuery = z.infer<typeof GetIdosiStatisticsQuerySchema>;

export const SyncIdosiStatisticsRequestSchema = IdosiStatisticsScopeSchema;
export type SyncIdosiStatisticsRequest = z.infer<typeof SyncIdosiStatisticsRequestSchema>;

const NonNegativeNumberSchema = z.number().finite().nonnegative();
const NonNegativeIntegerSchema = z.number().int().nonnegative().safe();

export const IdosiRevenueByTypeSchema = z
  .object({
    NORMAL: MoneyVndSchema,
    SALE_KG: MoneyVndSchema,
    SALE_PIECE: MoneyVndSchema,
  })
  .strict();

const IdosiWeightBucketSchema = z
  .object({
    actualKg: NonNegativeNumberSchema,
    estimatedKg: NonNegativeNumberSchema,
    knownKg: NonNegativeNumberSchema,
    totalKg: NonNegativeNumberSchema.nullable(),
    isComplete: z.boolean(),
    missingFactorLines: NonNegativeIntegerSchema,
    invalidLines: NonNegativeIntegerSchema,
    unclassifiedOrders: NonNegativeIntegerSchema,
  })
  .passthrough();

export const IdosiWeightSummarySchema = IdosiWeightBucketSchema.extend({
  schemaVersion: z.number().int().positive(),
  unit: z.literal('KG'),
  tableVersion: z.string().trim().min(1).max(128),
  byRevenueType: z
    .object({
      NORMAL: IdosiWeightBucketSchema,
      SALE_KG: IdosiWeightBucketSchema,
      SALE_PIECE: IdosiWeightBucketSchema,
    })
    .strict(),
}).passthrough();
export type IdosiWeightSummary = z.infer<typeof IdosiWeightSummarySchema>;

const IdosiProductItemSchema = z
  .object({
    productId: z.string().trim().min(1).max(200),
    productCode: z.string().trim().max(200).optional(),
    productName: z.string().trim().min(1).max(500),
    quantity: NonNegativeNumberSchema,
    unit: z.enum(['PIECE', 'KG']),
    revenueType: z.enum(['NORMAL', 'SALE_KG', 'SALE_PIECE']),
    orders: NonNegativeIntegerSchema,
    weight: IdosiWeightSummarySchema,
  })
  .passthrough();

const IdosiProductWeightSchema = z
  .object({
    productId: z.string().trim().min(1).max(200),
    productCode: z.string().trim().max(200).optional(),
    productName: z.string().trim().min(1).max(500),
    orders: NonNegativeIntegerSchema,
    totalQuantity: NonNegativeIntegerSchema,
    weight: IdosiWeightSummarySchema,
  })
  .passthrough();

const IdosiTotalsSchema = z
  .object({
    orders: NonNegativeIntegerSchema,
    cash: MoneyVndSchema,
    transfer: MoneyVndSchema,
    revenue: MoneyVndSchema,
    cashOrders: NonNegativeIntegerSchema,
    transferOrders: NonNegativeIntegerSchema,
    revenueByType: IdosiRevenueByTypeSchema,
    weight: IdosiWeightSummarySchema,
  })
  .passthrough();

export interface IdosiOrderStatisticsPayload {
  readonly ok: true;
  readonly apiVersion: 1;
  readonly storeId: string;
  readonly currency: 'VND';
  readonly timezone: 'Asia/Ho_Chi_Minh';
  readonly revenueBasis: 'ACTIVE_ORDER_AMOUNT';
  readonly generatedAt: string;
  readonly store: { readonly id: string; readonly name: string; readonly [key: string]: unknown };
  readonly filters: {
    readonly period: string;
    readonly date: string | null;
    readonly shiftId: string | null;
    readonly paymentMethod: string | null;
    readonly [key: string]: unknown;
  };
  readonly totals: z.infer<typeof IdosiTotalsSchema>;
  readonly products: {
    readonly totalQuantity: number;
    readonly totalWeightKg: number;
    readonly productTypes: number;
    readonly ordersWithItems: number;
    readonly unclassifiedOrders: number;
    readonly items: readonly z.infer<typeof IdosiProductItemSchema>[];
    readonly weight: IdosiWeightSummary;
    readonly weightByProduct: readonly z.infer<typeof IdosiProductWeightSchema>[];
    readonly [key: string]: unknown;
  };
  readonly groups: {
    readonly shift: readonly Record<string, unknown>[];
    readonly day: readonly Record<string, unknown>[];
    readonly month: readonly Record<string, unknown>[];
    readonly [key: string]: unknown;
  };
  readonly serverTime: string;
  readonly requestId: string;
  readonly [key: string]: unknown;
}

export const IdosiOrderStatisticsPayloadSchema: z.ZodType<IdosiOrderStatisticsPayload> = z
  .object({
    ok: z.literal(true),
    apiVersion: z.literal(1),
    storeId: z.string().trim().min(1).max(200),
    currency: z.literal('VND'),
    timezone: z.literal('Asia/Ho_Chi_Minh'),
    revenueBasis: z.literal('ACTIVE_ORDER_AMOUNT'),
    generatedAt: IsoDateTimeSchema,
    store: z
      .object({
        id: z.string().trim().min(1).max(200),
        name: z.string().trim().min(1).max(500),
      })
      .passthrough(),
    filters: z
      .object({
        period: IdosiStatisticsPeriodSchema,
        date: IsoDateSchema.nullable(),
        shiftId: z.string().trim().min(1).max(200).nullable(),
        paymentMethod: z.string().trim().min(1).max(100).nullable(),
      })
      .passthrough(),
    totals: IdosiTotalsSchema,
    products: z
      .object({
        totalQuantity: NonNegativeIntegerSchema,
        totalWeightKg: NonNegativeNumberSchema,
        productTypes: NonNegativeIntegerSchema,
        ordersWithItems: NonNegativeIntegerSchema,
        unclassifiedOrders: NonNegativeIntegerSchema,
        items: z.array(IdosiProductItemSchema),
        weight: IdosiWeightSummarySchema,
        weightByProduct: z.array(IdosiProductWeightSchema),
      })
      .passthrough(),
    groups: z
      .object({
        shift: z.array(z.record(z.string(), z.unknown())),
        day: z.array(z.record(z.string(), z.unknown())),
        month: z.array(z.record(z.string(), z.unknown())),
      })
      .passthrough(),
    serverTime: IsoDateTimeSchema,
    requestId: z.string().trim().min(1).max(200),
  })
  .passthrough()
  .superRefine((payload, context) => {
    const byType = payload.totals.revenueByType;
    if (byType.NORMAL + byType.SALE_KG + byType.SALE_PIECE !== payload.totals.revenue) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['totals', 'revenue'],
        message: 'Revenue must equal NORMAL + SALE_KG + SALE_PIECE',
      });
    }
  });

export interface IdosiStatisticsAttempt {
  readonly id: string;
  readonly source: 'MANUAL' | 'SCHEDULED';
  readonly status: 'SUCCEEDED' | 'FAILED';
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly startedAt: string;
  readonly completedAt: string;
}

export const IdosiStatisticsAttemptSchema: z.ZodType<IdosiStatisticsAttempt> = z
  .object({
    id: EntityIdSchema,
    source: z.enum(['MANUAL', 'SCHEDULED']),
    status: z.enum(['SUCCEEDED', 'FAILED']),
    errorCode: z.string().trim().min(1).max(100).nullable(),
    errorMessage: z.string().trim().min(1).max(1_000).nullable(),
    startedAt: IsoDateTimeSchema,
    completedAt: IsoDateTimeSchema,
  })
  .strict();

export interface IdosiStatisticsSnapshot {
  readonly id: string;
  readonly storeId: string;
  readonly scopeKey: string;
  readonly payload: IdosiOrderStatisticsPayload;
  readonly firstSyncedAt: string;
  readonly lastSyncedAt: string;
}

export const IdosiStatisticsSnapshotSchema: z.ZodType<IdosiStatisticsSnapshot> = z
  .object({
    id: EntityIdSchema,
    storeId: EntityIdSchema,
    scopeKey: z.string().trim().min(1).max(500),
    payload: IdosiOrderStatisticsPayloadSchema,
    firstSyncedAt: IsoDateTimeSchema,
    lastSyncedAt: IsoDateTimeSchema,
  })
  .strict();

export interface IdosiStatisticsState {
  readonly scope: IdosiStatisticsScope;
  readonly integrationStatus: 'CONFIGURED' | 'NOT_CONFIGURED';
  readonly freshness: 'CURRENT' | 'STALE' | 'EMPTY';
  readonly snapshot: IdosiStatisticsSnapshot | null;
  readonly latestAttempt: IdosiStatisticsAttempt | null;
}

export const IdosiStatisticsStateSchema: z.ZodType<IdosiStatisticsState, z.ZodTypeDef, unknown> = z
  .object({
    scope: IdosiStatisticsScopeSchema,
    integrationStatus: z.enum(['CONFIGURED', 'NOT_CONFIGURED']),
    freshness: z.enum(['CURRENT', 'STALE', 'EMPTY']),
    snapshot: IdosiStatisticsSnapshotSchema.nullable(),
    latestAttempt: IdosiStatisticsAttemptSchema.nullable(),
  })
  .strict();

export interface IdosiStatisticsStateResponse {
  readonly data: IdosiStatisticsState;
}

export const IdosiStatisticsStateResponseSchema: z.ZodType<
  IdosiStatisticsStateResponse,
  z.ZodTypeDef,
  unknown
> = z.object({ data: IdosiStatisticsStateSchema }).strict();

export type IdosiFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface FetchIdosiStatisticsOptions {
  readonly endpoint: string;
  readonly secret: string;
  readonly storeCode: string;
  readonly scope: Omit<IdosiStatisticsScope, 'storeId'>;
  readonly requestId: string;
  readonly fetch?: IdosiFetch;
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
}

export type IdosiGatewayErrorCode =
  'IDOSI_REQUEST_FAILED' | 'IDOSI_RESPONSE_INVALID' | 'IDOSI_RESPONSE_TOO_LARGE';

export const IdosiUpstreamErrorEnvelopeSchema = z
  .object({
    ok: z.literal(false),
    error: z.object({
      code: z.string().trim().min(1).max(128),
      message: z.string().trim().min(1).max(1_000),
    }),
  })
  .passthrough();

export class IdosiGatewayError extends Error {
  public constructor(
    public readonly code: IdosiGatewayErrorCode,
    message: string,
    public readonly upstreamStatus: number | null = null,
    public readonly upstreamCode: string | null = null,
  ) {
    super(message);
    this.name = 'IdosiGatewayError';
  }
}

export async function fetchIdosiOrderStatistics(
  options: FetchIdosiStatisticsOptions,
): Promise<IdosiOrderStatisticsPayload> {
  const secret = options.secret.trim();
  if (!secret) throw new TypeError('IDOSI integration secret is required');
  const endpoint = new URL(options.endpoint);
  const storeCode = options.storeCode.trim();
  if (!storeCode) throw new TypeError('IDOSI store code is required');
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxResponseBytes = options.maxResponseBytes ?? MAX_RESPONSE_BYTES;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('IDOSI request timeout must be a positive safe integer');
  }
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes <= 0) {
    throw new RangeError('IDOSI response limit must be a positive safe integer');
  }

  endpoint.search = '';
  endpoint.searchParams.set('storeId', storeCode);
  endpoint.searchParams.set('period', options.scope.period);
  if (options.scope.date !== null) endpoint.searchParams.set('date', options.scope.date);
  if (options.scope.shiftId !== null) endpoint.searchParams.set('shiftId', options.scope.shiftId);
  if (options.scope.paymentMethod !== null) {
    endpoint.searchParams.set('paymentMethod', options.scope.paymentMethod);
  }

  let response: Response;
  try {
    response = await (options.fetch ?? globalThis.fetch)(endpoint, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${secret}`,
        'X-Request-ID': options.requestId,
      },
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new IdosiGatewayError('IDOSI_REQUEST_FAILED', 'Không thể kết nối API thống kê IDOSI.');
  }

  if (!response.ok) {
    const upstream = await readUpstreamError(response);
    throw new IdosiGatewayError(
      'IDOSI_REQUEST_FAILED',
      upstream
        ? `API thống kê IDOSI từ chối yêu cầu (${upstream.code}): ${upstream.message}`
        : `API thống kê IDOSI phản hồi HTTP ${response.status}.`,
      response.status,
      upstream?.code ?? null,
    );
  }

  const payload = await readBoundedJson(response, maxResponseBytes);
  const parsed = IdosiOrderStatisticsPayloadSchema.safeParse(payload);
  if (!parsed.success || !matchesRequestedScope(parsed.data, storeCode, options.scope)) {
    throw new IdosiGatewayError(
      'IDOSI_RESPONSE_INVALID',
      'API thống kê IDOSI trả về dữ liệu không hợp lệ hoặc sai phạm vi.',
      response.status,
    );
  }
  return parsed.data;
}

const UPSTREAM_ERROR_MAX_BYTES = 8_192;

/** Surfaces the upstream error envelope ({ok:false,error:{code,message}}) when idosi.io.vn rejects a call. */
async function readUpstreamError(
  response: Response,
): Promise<{ readonly code: string; readonly message: string } | null> {
  try {
    const payload = await readBoundedJson(response, UPSTREAM_ERROR_MAX_BYTES);
    const parsed = IdosiUpstreamErrorEnvelopeSchema.safeParse(payload);
    if (!parsed.success) return null;
    return parsed.data.error;
  } catch {
    return null;
  }
}

async function readBoundedJson(response: Response, maxBytes: number): Promise<unknown> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new IdosiGatewayError(
      'IDOSI_RESPONSE_TOO_LARGE',
      'API thống kê IDOSI trả về dữ liệu vượt giới hạn.',
      response.status,
    );
  }
  if (!response.body) {
    throw new IdosiGatewayError(
      'IDOSI_RESPONSE_INVALID',
      'API thống kê IDOSI trả về response rỗng.',
      response.status,
    );
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new IdosiGatewayError(
          'IDOSI_RESPONSE_TOO_LARGE',
          'API thống kê IDOSI trả về dữ liệu vượt giới hạn.',
          response.status,
        );
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new IdosiGatewayError(
      'IDOSI_RESPONSE_INVALID',
      'API thống kê IDOSI trả về JSON không hợp lệ.',
      response.status,
    );
  }
}

function matchesRequestedScope(
  payload: IdosiOrderStatisticsPayload,
  storeCode: string,
  scope: Omit<IdosiStatisticsScope, 'storeId'>,
): boolean {
  return (
    payload.storeId === storeCode &&
    payload.store.id === storeCode &&
    payload.filters.period === scope.period &&
    payload.filters.date === scope.date &&
    payload.filters.shiftId === scope.shiftId &&
    (scope.paymentMethod === null ||
      normalizePaymentMethod(payload.filters.paymentMethod) === scope.paymentMethod)
  );
}

function normalizePaymentMethod(value: string | null): IdosiStatisticsPaymentMethod | null {
  if (value === null) return null;
  const normalized = value
    .trim()
    .toLocaleLowerCase('vi-VN')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[\s_-]+/gu, '');
  if (normalized === 'cash' || normalized === 'tienmat') return 'cash';
  if (
    normalized === 'transfer' ||
    normalized === 'chuyenkhoan' ||
    normalized === 'banktransfer' ||
    normalized === 'bank'
  ) {
    return 'transfer';
  }
  return null;
}
