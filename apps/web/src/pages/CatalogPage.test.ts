import type { Product, ProductConversion } from '@idosi/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createInitialConversion,
  createNextConversionVersion,
  createProductWithConversion,
  loadCatalogSnapshot,
  loadProductConversionHistory,
  retireProductConversion,
  setProductStatus,
  type CatalogEntry,
} from '../features/catalog/catalogApi';
import { buildCatalogCsv, formatConversionRatios, nextConversionDate } from './CatalogPage';

const productId = '40000000-0000-4000-8000-000000000001';
const conversionId = '50000000-0000-4000-8000-000000000001';
const replacementId = '50000000-0000-4000-8000-000000000002';
const timestamp = '2026-09-17T03:00:00.000Z';

const product: Product = {
  createdAt: timestamp,
  id: productId,
  measurement: 'UNIT',
  name: 'Chăn, ga, bao gối, nệm gòn',
  sku: 'CHAN_GA_BAO_GOI_NEM_GON',
  status: 'ACTIVE',
  unitLabel: 'cái',
  updatedAt: timestamp,
};

const conversion: ProductConversion = {
  createdAt: timestamp,
  createdByAccountId: null,
  effectiveFrom: '2026-09-12',
  effectiveTo: null,
  id: conversionId,
  itemQuantity: 1,
  productId,
  reason: 'Hệ số danh mục ban đầu',
  retiredAt: null,
  retiredByAccountId: null,
  retirementReason: null,
  version: 1,
  weightKilograms: '3.000',
};

const entry: CatalogEntry = {
  conversion,
  historyCount: 1,
  latestConversion: conversion,
  product,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('catalog exact ratio and export helpers', () => {
  it('preserves the special 1 item = 3.000 kg ratio without binary-float drift', () => {
    expect(formatConversionRatios(conversion)).toEqual({
      itemsPerKilogram: '0,33 cái',
      kilogramsPerItem: '3 kg',
    });
  });

  it('requires a replacement to begin after the prior effective date', () => {
    expect(nextConversionDate('2026-09-17', '2026-09-17')).toBe('2026-09-18');
    expect(nextConversionDate('2026-09-12', '2026-09-17')).toBe('2026-09-17');
  });

  it('exports exact source fields and the selected effective date', () => {
    const csv = buildCatalogCsv([entry], '2026-09-17');

    expect(csv).toContain('"3.000"');
    expect(csv).toContain(`"${conversionId}"`);
    expect(csv).toContain('"2026-09-17"');
    expect(csv).toContain('"CHAN_GA_BAO_GOI_NEM_GON"');
  });

  it('neutralizes spreadsheet formulas in database-backed CSV fields', () => {
    const csv = buildCatalogCsv(
      [
        {
          ...entry,
          product: { ...product, name: ' +SUM(1,1)', sku: '=HYPERLINK("bad")' },
        },
      ],
      '2026-09-17',
    );

    expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
    expect(csv).toContain('"\' +SUM(1,1)"');
  });
});

describe('catalog API integration', () => {
  it('loads products, the effective-date projection, and complete history with cookie auth', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(init).toMatchObject({ cache: 'no-store', credentials: 'include' });
      if (url.includes('/products?')) return jsonResponse(page([product]));
      if (url.includes('effectiveAt=2026-09-17')) return jsonResponse(page([conversion]));
      return jsonResponse(page([conversion]));
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadCatalogSnapshot('2026-09-17')).resolves.toEqual({
      effectiveAt: '2026-09-17',
      entries: [entry],
    });

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls).toHaveLength(3);
    expect(urls.some((url) => url.includes('effectiveAt=2026-09-17'))).toBe(true);
    expect(
      urls.some((url) => url.includes('/product-conversions?') && !url.includes('effectiveAt=')),
    ).toBe(true);
  });

  it('queries product conversion history instead of using a disabled placeholder', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(page([conversion])),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadProductConversionHistory(productId)).resolves.toEqual([conversion]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      `/products/${productId}/conversions?page=1&pageSize=100&includeRetired=true`,
    );
  });

  it('creates the product and its initial conversion from sourced API responses', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: product }, 201))
      .mockResolvedValueOnce(jsonResponse({ data: conversion }, 201));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createProductWithConversion(
        {
          measurement: 'UNIT',
          name: product.name,
          sku: product.sku,
          unitLabel: 'cái',
        },
        {
          effectiveFrom: conversion.effectiveFrom,
          effectiveTo: null,
          itemQuantity: conversion.itemQuantity,
          reason: conversion.reason,
          weightKilograms: conversion.weightKilograms,
        },
      ),
    ).resolves.toEqual(entry);

    expect(String(fetchMock.mock.calls[0]?.[0]).endsWith('/products')).toBe(true);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(`/products/${productId}/conversions`);
  });

  it('uses immutable version, retirement, and product status endpoints with concurrency data', async () => {
    const replacement = {
      ...conversion,
      effectiveFrom: '2026-09-18',
      id: replacementId,
      version: 2,
      weightKilograms: '2.500',
    } satisfies ProductConversion;
    const retired = {
      ...replacement,
      effectiveTo: '2026-09-18',
      retiredAt: timestamp,
      retiredByAccountId: '10000000-0000-4000-8000-000000000001',
      retirementReason: 'Ngừng hệ số cũ',
    } satisfies ProductConversion;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: replacement }))
      .mockResolvedValueOnce(jsonResponse({ data: retired }))
      .mockResolvedValueOnce(
        jsonResponse({ data: { ...product, status: 'INACTIVE', updatedAt: timestamp } }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await createNextConversionVersion(productId, conversionId, {
      effectiveFrom: '2026-09-18',
      effectiveTo: null,
      expectedVersion: 1,
      itemQuantity: 1,
      reason: 'Điều chỉnh cân thực tế',
      weightKilograms: '2.500',
    });
    await retireProductConversion(productId, replacementId, {
      expectedVersion: 2,
      reason: 'Ngừng hệ số cũ',
    });
    await setProductStatus(productId, 'INACTIVE');

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'PATCH' });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      expectedVersion: 1,
    });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'DELETE' });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      expectedVersion: 2,
      reason: 'Ngừng hệ số cũ',
    });
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({ status: 'INACTIVE' });
  });

  it('resumes a retired conversion history through compare-and-append POST', async () => {
    const resumed = {
      ...conversion,
      effectiveFrom: '2026-09-19',
      id: replacementId,
      version: 2,
    } satisfies ProductConversion;
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ data: resumed }, 201));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createInitialConversion(productId, {
        effectiveFrom: resumed.effectiveFrom,
        effectiveTo: null,
        expectedVersion: 1,
        itemQuantity: resumed.itemQuantity,
        reason: 'Khôi phục hệ số đã ngừng',
        weightKilograms: resumed.weightKilograms,
      }),
    ).resolves.toEqual(resumed);

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      expectedVersion: 1,
    });
  });

  it('surfaces a network error and never substitutes demo rows in production API helpers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('offline'))),
    );

    await expect(loadCatalogSnapshot('2026-09-17')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      status: 0,
    });
  });
});

function page(data: unknown[]) {
  return {
    data,
    pagination: {
      page: 1,
      pageSize: 100,
      totalItems: data.length,
      totalPages: data.length > 0 ? 1 : 0,
    },
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}
