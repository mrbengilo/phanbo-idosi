import { describe, expect, it, vi } from 'vitest';

import {
  fetchIdosiOrderStatistics,
  IdosiGatewayError,
  IdosiOrderStatisticsPayloadSchema,
  SyncIdosiStatisticsRequestSchema,
} from '../src/index.js';

const bucket = {
  actualKg: 0,
  estimatedKg: 0,
  knownKg: 0,
  totalKg: 0,
  isComplete: true,
  missingFactorLines: 0,
  invalidLines: 0,
  unclassifiedOrders: 0,
};
const weight = {
  ...bucket,
  actualKg: 2.5,
  estimatedKg: 5,
  knownKg: 7.5,
  totalKg: 7.5,
  schemaVersion: 1,
  unit: 'KG' as const,
  tableVersion: 'IDOSI-2026-09-15-v2',
  byRevenueType: { NORMAL: bucket, SALE_KG: bucket, SALE_PIECE: bucket },
};
const payload = {
  ok: true as const,
  apiVersion: 1 as const,
  storeId: 'S01',
  currency: 'VND' as const,
  timezone: 'Asia/Ho_Chi_Minh' as const,
  revenueBasis: 'ACTIVE_ORDER_AMOUNT' as const,
  generatedAt: '2026-09-17T02:00:00.000Z',
  store: { id: 'S01', name: 'Cửa hàng 01' },
  filters: { period: '2026-09', date: null, shiftId: null, paymentMethod: null },
  totals: {
    orders: 2,
    cash: 100_000,
    transfer: 200_000,
    revenue: 300_000,
    cashOrders: 1,
    transferOrders: 1,
    revenueByType: { NORMAL: 200_000, SALE_KG: 100_000, SALE_PIECE: 0 },
    weight,
  },
  products: {
    totalQuantity: 15,
    totalWeightKg: 2.5,
    productTypes: 1,
    ordersWithItems: 2,
    unclassifiedOrders: 0,
    items: [
      {
        productId: 'P01',
        productCode: 'DO-NAM',
        productName: 'Đồ nam',
        quantity: 15,
        unit: 'PIECE' as const,
        revenueType: 'NORMAL' as const,
        orders: 2,
        weight,
      },
    ],
    weight,
    weightByProduct: [
      {
        productId: 'P01',
        productCode: 'DO-NAM',
        productName: 'Đồ nam',
        orders: 2,
        totalQuantity: 15,
        weight,
      },
    ],
  },
  groups: { shift: [], day: [], month: [] },
  serverTime: '2026-09-17T02:00:00.000Z',
  requestId: 'idosi-request-1',
  futureCompatibleField: true,
};

describe('IDOSI statistics contracts and gateway', () => {
  it('validates the official aggregate while accepting additive v1 fields', () => {
    expect(IdosiOrderStatisticsPayloadSchema.parse(payload)).toMatchObject({
      futureCompatibleField: true,
      totals: { revenue: 300_000 },
    });
  });

  it('rejects inconsistent revenue and dates outside the selected period', () => {
    expect(
      IdosiOrderStatisticsPayloadSchema.safeParse({
        ...payload,
        totals: { ...payload.totals, revenue: 300_001 },
      }).success,
    ).toBe(false);
    expect(
      SyncIdosiStatisticsRequestSchema.safeParse({
        storeId: '20000000-0000-4000-8000-000000000001',
        period: '2026-09',
        date: '2026-10-01',
        shiftId: null,
        paymentMethod: null,
      }).success,
    ).toBe(false);
  });

  it('keeps the secret in a server Authorization header and validates scope', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.searchParams.get('storeId')).toBe('S01');
      expect(url.searchParams.get('period')).toBe('2026-09');
      expect(url.toString()).not.toContain('server-secret');
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer server-secret');
      return new Response(JSON.stringify(payload));
    });

    await expect(
      fetchIdosiOrderStatistics({
        endpoint: 'https://idosi.io.vn/api/integrations/warehouse/v1/order-statistics',
        secret: 'server-secret',
        storeCode: 'S01',
        scope: { period: '2026-09', date: null, shiftId: null, paymentMethod: null },
        requestId: 'warehouse-request-1',
        fetch: fetchMock,
      }),
    ).resolves.toMatchObject({ storeId: 'S01', totals: { revenue: 300_000 } });
  });

  it('fails closed on an oversized or mismatched response', async () => {
    await expect(
      fetchIdosiOrderStatistics({
        endpoint: 'https://idosi.io.vn/api/integrations/warehouse/v1/order-statistics',
        secret: 'server-secret',
        storeCode: 'S02',
        scope: { period: '2026-09', date: null, shiftId: null, paymentMethod: null },
        requestId: 'warehouse-request-2',
        fetch: async () => new Response(JSON.stringify(payload)),
      }),
    ).rejects.toBeInstanceOf(IdosiGatewayError);

    await expect(
      fetchIdosiOrderStatistics({
        endpoint: 'https://idosi.io.vn/api/integrations/warehouse/v1/order-statistics',
        secret: 'server-secret',
        storeCode: 'S01',
        scope: { period: '2026-09', date: null, shiftId: null, paymentMethod: null },
        requestId: 'warehouse-request-3',
        maxResponseBytes: 8,
        fetch: async () => new Response(JSON.stringify(payload)),
      }),
    ).rejects.toMatchObject({ code: 'IDOSI_RESPONSE_TOO_LARGE' });
  });

  it('surfaces the upstream error envelope when idosi.io.vn rejects the call', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ok: false,
            error: {
              code: 'WAREHOUSE_API_NOT_CONFIGURED',
              message: 'API thống kê kho chưa được cấu hình khóa bảo mật.',
            },
            serverTime: '2026-09-19T09:22:54.009Z',
            requestId: 'idosi-request-4',
          }),
          { status: 503 },
        ),
    );

    await expect(
      fetchIdosiOrderStatistics({
        endpoint: 'https://idosi.io.vn/api/integrations/warehouse/v1/order-statistics',
        secret: 'server-secret',
        storeCode: 'S01',
        scope: { period: '2026-09', date: null, shiftId: null, paymentMethod: null },
        requestId: 'warehouse-request-4',
        fetch: fetchMock,
      }),
    ).rejects.toMatchObject({
      code: 'IDOSI_REQUEST_FAILED',
      upstreamStatus: 503,
      upstreamCode: 'WAREHOUSE_API_NOT_CONFIGURED',
      message: expect.stringContaining('chưa được cấu hình khóa bảo mật'),
    });
  });
});
