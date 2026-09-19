import {
  ErrorEnvelopeSchema,
  CancelWaitTicketRequestSchema,
  CancelStoreOrderRequestSchema,
  CreateOrderSessionRequestSchema,
  ListAllocationsResponseSchema,
  ListReceiptsResponseSchema,
  ListPriorityOffersResponseSchema,
  GetSessionResponseSchema,
  ListProductConversionsResponseSchema,
  ListProductsResponseSchema,
  ListOrderSessionsResponseSchema,
  ListStoreOrderRequestsResponseSchema,
  ListStoresResponseSchema,
  WarehouseBalancesResponseSchema,
  ListWaitTicketsResponseSchema,
  LoginResponseSchema,
  LogoutResponseSchema,
  MonthlyOperationalReportResponseSchema,
  OrderSessionResponseSchema,
  ProductConversionResponseSchema,
  ProductResponseSchema,
  RespondPriorityOfferRequestSchema,
  RespondPriorityOfferResponseSchema,
  ReceiptResponseSchema,
  StoreOrderRequestResponseSchema,
  TransitionOrderSessionRequestSchema,
  WaitTicketHistoryResponseSchema,
  WaitTicketResponseSchema,
  type CancelWaitTicketRequest,
  type CancelStoreOrderRequest,
  type AllocationResultStatus,
  type CreateOrderSessionRequest,
  type DeclareStoreReceiptRequest,
  type FinalizeReceiptRequest,
  type CreateProductConversionRequest,
  type CreateStoreOrderRequest,
  type LoginRequest,
  type MonthlyOperationalReport,
  type MonthlyOperationalReportQuery,
  type ListAllocationsResponse,
  type OrderSession,
  type PriorityOffer,
  type PriorityOfferStatus,
  type Receipt,
  type ReceiptStatus,
  type RespondPriorityOfferRequest,
  type ReturnReceiptForCorrectionRequest,
  type Session,
  type WarehouseBalancesResponse,
  type Store,
  type StoreOrderRequest,
  type SubmitStoreReceiptRequest,
  type TransitionOrderSessionRequest,
  type UpdateProductConversionRequest,
  type StoreKind,
  type WaitTicket,
  type WaitTicketHistory,
  type WaitTicketStatus,
} from '@idosi/contracts';
import { businessDate } from './business-time';
import { shouldEnableMockMode } from './runtime-mode';
import { reportUnauthorizedResponse } from './session-expiry';
import type { ProductConversion as CatalogProduct } from './types';

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const apiBaseUrl = (configuredBaseUrl || '/api/v1').replace(/\/$/, '');

export const mockModeEnabled = shouldEnableMockMode(
  import.meta.env.DEV,
  import.meta.env.MODE,
  import.meta.env.VITE_ENABLE_MOCK_FALLBACK,
);

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | undefined;

  constructor(message: string, status: number, code = 'HTTP_ERROR', requestId?: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');
  if (init?.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers,
    });
  } catch {
    throw new ApiClientError(
      'Không thể kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại.',
      0,
      'NETWORK_ERROR',
    );
  }

  reportUnauthorizedResponse(response.status, path);
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = ErrorEnvelopeSchema.safeParse(payload);
    if (parsed.success) {
      throw new ApiClientError(
        parsed.data.error.message,
        response.status,
        parsed.data.error.code,
        parsed.data.error.requestId,
      );
    }
    throw new ApiClientError(`Yêu cầu thất bại (${response.status}).`, response.status);
  }
  return payload;
}

interface ParsedPage<T> {
  readonly data: T[];
  readonly pagination: { readonly totalPages: number };
}

function paginatedQuery(filters: URLSearchParams, page: number): string {
  const query = new URLSearchParams({ page: String(page), pageSize: '100' });
  for (const [key, value] of filters) query.append(key, value);
  return query.toString();
}

async function listAllPages<T>(
  path: string,
  filters: URLSearchParams,
  parse: (payload: unknown) => ParsedPage<T>,
): Promise<T[]> {
  const first = parse(await request(`${path}?${paginatedQuery(filters, 1)}`));
  if (first.pagination.totalPages <= 1) return first.data;
  const remaining = await Promise.all(
    Array.from({ length: first.pagination.totalPages - 1 }, async (_, index) =>
      parse(await request(`${path}?${paginatedQuery(filters, index + 2)}`)),
    ),
  );
  return [first, ...remaining].flatMap((page) => page.data);
}

export async function getSession(): Promise<Session | null> {
  try {
    const payload = await request('/auth/session');
    return GetSessionResponseSchema.parse(payload).data;
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) return null;
    throw error;
  }
}

export async function login(credentials: LoginRequest): Promise<Session> {
  const payload = await request('/auth/login', {
    body: JSON.stringify(credentials),
    method: 'POST',
  });
  return LoginResponseSchema.parse(payload).data;
}

export async function logout(): Promise<void> {
  const payload = await request('/auth/logout', { method: 'POST' });
  LogoutResponseSchema.parse(payload);
}

export async function listCatalog(): Promise<CatalogProduct[]> {
  const effectiveAt = businessDate();
  const [products, conversions] = await Promise.all([
    listAllPages('/products', new URLSearchParams(), (payload) =>
      ListProductsResponseSchema.parse(payload),
    ),
    listAllPages(
      '/product-conversions',
      new URLSearchParams({ effectiveAt, includeRetired: 'false' }),
      (payload) => ListProductConversionsResponseSchema.parse(payload),
    ),
  ]);

  return products.map((product) => {
    const conversion = conversions
      .filter((candidate) => candidate.productId === product.id)
      .toSorted((left, right) => right.version - left.version)[0];
    return {
      id: product.id,
      sku: product.sku,
      name: product.name,
      itemQuantity: conversion?.itemQuantity ?? null,
      weightKilograms: conversion?.weightKilograms ?? null,
      ...(conversion
        ? {
            conversionId: conversion.id,
            conversionVersion: conversion.version,
            effectiveDate: conversion.effectiveFrom,
          }
        : { conversionMissing: true, effectiveDate: '' }),
      status: product.status,
    } satisfies CatalogProduct;
  });
}

interface SaveCatalogProductInput {
  name: string;
  itemQuantity: number;
  weightKilograms: string;
  effectiveFrom: string;
}

function catalogSku(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 56);
  return `WEB-${slug || 'ITEM'}-${Date.now().toString(36).toUpperCase()}`;
}

export async function saveCatalogProduct(
  input: SaveCatalogProductInput,
  current?: CatalogProduct,
): Promise<void> {
  let productId = current?.id;
  if (current) {
    const productPayload = await request(`/products/${encodeURIComponent(current.id)}`, {
      body: JSON.stringify({ name: input.name }),
      method: 'PATCH',
    });
    ProductResponseSchema.parse(productPayload);
  } else {
    const productPayload = await request('/products', {
      body: JSON.stringify({
        measurement: 'UNIT',
        name: input.name,
        sku: catalogSku(input.name),
        unitLabel: 'cái',
      }),
      method: 'POST',
    });
    productId = ProductResponseSchema.parse(productPayload).data.id;
  }

  if (!productId) throw new ApiClientError('Không xác định được mặt hàng vừa lưu.', 0);
  const conversionInput: CreateProductConversionRequest = {
    effectiveFrom: input.effectiveFrom,
    effectiveTo: null,
    itemQuantity: input.itemQuantity,
    reason: current ? 'Cập nhật tỷ lệ quy đổi từ giao diện' : 'Tạo tỷ lệ quy đổi từ giao diện',
    weightKilograms: input.weightKilograms,
  };
  const path = current?.conversionId
    ? `/products/${encodeURIComponent(productId)}/conversions/${encodeURIComponent(current.conversionId)}`
    : `/products/${encodeURIComponent(productId)}/conversions`;
  const conversionPayload = await request(path, {
    body: JSON.stringify(
      current?.conversionId
        ? ({
            ...conversionInput,
            expectedVersion: current.conversionVersion ?? 1,
          } satisfies UpdateProductConversionRequest)
        : conversionInput,
    ),
    method: current?.conversionId ? 'PATCH' : 'POST',
  });
  ProductConversionResponseSchema.parse(conversionPayload);
}

export async function setCatalogProductStatus(
  productId: string,
  status: 'ACTIVE' | 'INACTIVE',
): Promise<void> {
  const payload = await request(`/products/${encodeURIComponent(productId)}`, {
    body: JSON.stringify({ status }),
    method: 'PATCH',
  });
  ProductResponseSchema.parse(payload);
}

export async function getStoreKind(storeId: string): Promise<StoreKind> {
  const stores = await listAccessibleStores();
  const store = stores.find((candidate) => candidate.id === storeId);
  if (!store) throw new ApiClientError('Không tìm thấy cửa hàng của tài khoản.', 404, 'NOT_FOUND');
  return store.kind;
}

export async function listAccessibleStores(): Promise<Store[]> {
  return listAllPages('/stores', new URLSearchParams(), (payload) =>
    ListStoresResponseSchema.parse(payload),
  );
}

export async function getMonthlyOperationalReport(
  input: MonthlyOperationalReportQuery,
): Promise<MonthlyOperationalReport> {
  const query = new URLSearchParams({
    month: String(input.month),
    scopeKind: input.scopeKind,
    year: String(input.year),
  });
  if (input.scopeId) query.set('scopeId', input.scopeId);
  const payload = await request(`/reports/monthly?${query.toString()}`);
  return MonthlyOperationalReportResponseSchema.parse(payload).data;
}

export async function listOpenOrderSessions(): Promise<OrderSession[]> {
  return listAllPages('/order-sessions', new URLSearchParams({ status: 'OPEN' }), (payload) =>
    ListOrderSessionsResponseSchema.parse(payload),
  );
}

export async function listOrderSessions(): Promise<OrderSession[]> {
  return listAllPages('/order-sessions', new URLSearchParams(), (payload) =>
    ListOrderSessionsResponseSchema.parse(payload),
  );
}

export interface AllocationResultFilters {
  readonly page?: number;
  readonly pageSize?: number;
  readonly sessionId?: string;
  readonly status?: AllocationResultStatus;
  readonly storeId?: string;
}

export async function listAllocationResults(
  filters: AllocationResultFilters = {},
): Promise<ListAllocationsResponse> {
  const query = new URLSearchParams({
    page: String(filters.page ?? 1),
    pageSize: String(filters.pageSize ?? 20),
  });
  if (filters.sessionId) query.set('sessionId', filters.sessionId);
  if (filters.status) query.set('status', filters.status);
  if (filters.storeId) query.set('storeId', filters.storeId);
  const payload = await request(`/allocations?${query.toString()}`);
  return ListAllocationsResponseSchema.parse(payload);
}

export async function createOrderSession(
  input: CreateOrderSessionRequest,
  idempotencyKey: string,
): Promise<OrderSession> {
  const validated = CreateOrderSessionRequestSchema.parse(input);
  const payload = await request('/order-sessions', {
    body: JSON.stringify(validated),
    headers: { 'idempotency-key': idempotencyKey },
    method: 'POST',
  });
  return OrderSessionResponseSchema.parse(payload).data;
}

export async function transitionOrderSession(
  sessionId: string,
  input: TransitionOrderSessionRequest,
  idempotencyKey: string,
): Promise<OrderSession> {
  const validated = TransitionOrderSessionRequestSchema.parse(input);
  const payload = await request(`/order-sessions/${encodeURIComponent(sessionId)}/transition`, {
    body: JSON.stringify(validated),
    headers: { 'idempotency-key': idempotencyKey },
    method: 'POST',
  });
  return OrderSessionResponseSchema.parse(payload).data;
}

export async function listStoreOrderRequests(
  storeId: string,
  sessionId: string,
): Promise<StoreOrderRequest[]> {
  const query = new URLSearchParams({
    page: '1',
    pageSize: '100',
    sessionId,
    storeId,
  });
  const payload = await request(`/order-requests?${query.toString()}`);
  return ListStoreOrderRequestsResponseSchema.parse(payload).data;
}

export async function submitStoreOrderRequest(
  input: CreateStoreOrderRequest,
  idempotencyKey: string,
): Promise<StoreOrderRequest> {
  const payload = await request('/order-requests', {
    body: JSON.stringify(input),
    headers: { 'idempotency-key': idempotencyKey },
    method: 'POST',
  });
  return StoreOrderRequestResponseSchema.parse(payload).data;
}

export async function cancelStoreOrderRequest(
  requestId: string,
  input: CancelStoreOrderRequest,
  idempotencyKey: string,
): Promise<StoreOrderRequest> {
  const validated = CancelStoreOrderRequestSchema.parse(input);
  const payload = await request(`/order-requests/${encodeURIComponent(requestId)}/cancel`, {
    body: JSON.stringify(validated),
    headers: { 'idempotency-key': idempotencyKey },
    method: 'POST',
  });
  return StoreOrderRequestResponseSchema.parse(payload).data;
}

interface WaitTicketFilters {
  readonly priority?: WaitTicket['priority'];
  readonly productId?: string;
  readonly sessionId?: string;
  readonly status?: WaitTicketStatus;
  readonly storeId?: string;
}

export async function listWaitTickets(filters: WaitTicketFilters = {}): Promise<WaitTicket[]> {
  const query = new URLSearchParams();
  if (filters.priority) query.set('priority', filters.priority);
  if (filters.productId) query.set('productId', filters.productId);
  if (filters.sessionId) query.set('sessionId', filters.sessionId);
  if (filters.status) query.set('status', filters.status);
  if (filters.storeId) query.set('storeId', filters.storeId);
  return listAllPages('/wait-tickets', query, (payload) =>
    ListWaitTicketsResponseSchema.parse(payload),
  );
}

interface PriorityOfferFilters {
  readonly status?: PriorityOfferStatus;
  readonly storeId?: string;
  readonly waitTicketId?: string;
}

export async function listPriorityOffers(
  filters: PriorityOfferFilters = {},
): Promise<PriorityOffer[]> {
  const query = new URLSearchParams();
  if (filters.status) query.set('status', filters.status);
  if (filters.storeId) query.set('storeId', filters.storeId);
  if (filters.waitTicketId) query.set('waitTicketId', filters.waitTicketId);
  return listAllPages('/priority-offers', query, (payload) =>
    ListPriorityOffersResponseSchema.parse(payload),
  );
}

export async function getWaitTicketHistory(
  waitTicketId: string,
  limit = 100,
): Promise<WaitTicketHistory> {
  const query = new URLSearchParams({ limit: String(limit) });
  const payload = await request(
    `/wait-tickets/${encodeURIComponent(waitTicketId)}/history?${query.toString()}`,
  );
  return WaitTicketHistoryResponseSchema.parse(payload).data;
}

export async function cancelWaitTicket(
  waitTicketId: string,
  input: CancelWaitTicketRequest,
  idempotencyKey: string,
): Promise<WaitTicket> {
  const validated = CancelWaitTicketRequestSchema.parse(input);
  const payload = await request(`/wait-tickets/${encodeURIComponent(waitTicketId)}/cancel`, {
    body: JSON.stringify(validated),
    headers: { 'idempotency-key': idempotencyKey },
    method: 'POST',
  });
  return WaitTicketResponseSchema.parse(payload).data;
}

export async function respondPriorityOffer(
  offerId: string,
  input: RespondPriorityOfferRequest,
  idempotencyKey: string,
): Promise<PriorityOffer> {
  const validated = RespondPriorityOfferRequestSchema.parse(input);
  const payload = await request(`/priority-offers/${encodeURIComponent(offerId)}/respond`, {
    body: JSON.stringify(validated),
    headers: { 'idempotency-key': idempotencyKey },
    method: 'POST',
  });
  return RespondPriorityOfferResponseSchema.parse(payload).data;
}

interface ReceiptFilters {
  readonly status?: ReceiptStatus;
  readonly storeId?: string;
}

export async function listStoreReceipts(filters: ReceiptFilters = {}): Promise<Receipt[]> {
  const query = new URLSearchParams();
  if (filters.status) query.set('status', filters.status);
  if (filters.storeId) query.set('storeId', filters.storeId);
  return listAllPages('/store-receipts', query, (payload) =>
    ListReceiptsResponseSchema.parse(payload),
  );
}

export async function getStoreReceipt(receiptId: string): Promise<Receipt> {
  const payload = await request(`/store-receipts/${encodeURIComponent(receiptId)}`);
  return ReceiptResponseSchema.parse(payload).data;
}

async function mutateStoreReceipt(
  path: string,
  input: unknown,
  idempotencyKey: string,
): Promise<Receipt> {
  const payload = await request(path, {
    body: JSON.stringify(input),
    headers: { 'idempotency-key': idempotencyKey },
    method: 'POST',
  });
  return ReceiptResponseSchema.parse(payload).data;
}

export function declareStoreReceipt(
  input: DeclareStoreReceiptRequest,
  idempotencyKey: string,
): Promise<Receipt> {
  return mutateStoreReceipt('/store-receipts', input, idempotencyKey);
}

export function submitStoreReceipt(
  receiptId: string,
  input: SubmitStoreReceiptRequest,
  idempotencyKey: string,
): Promise<Receipt> {
  return mutateStoreReceipt(
    `/store-receipts/${encodeURIComponent(receiptId)}/submit`,
    input,
    idempotencyKey,
  );
}

export function returnStoreReceiptForCorrection(
  receiptId: string,
  input: ReturnReceiptForCorrectionRequest,
  idempotencyKey: string,
): Promise<Receipt> {
  return mutateStoreReceipt(
    `/store-receipts/${encodeURIComponent(receiptId)}/return`,
    input,
    idempotencyKey,
  );
}

export function finalizeStoreReceipt(
  receiptId: string,
  input: FinalizeReceiptRequest,
  idempotencyKey: string,
): Promise<Receipt> {
  return mutateStoreReceipt(
    `/store-receipts/${encodeURIComponent(receiptId)}/finalize`,
    input,
    idempotencyKey,
  );
}

export async function listWarehouseBalances(): Promise<WarehouseBalancesResponse> {
  const payload = await request('/warehouse-balances', {
    cache: 'no-store',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  return WarehouseBalancesResponseSchema.parse(payload);
}

export async function createWarehouseAdjustment(
  input: {
    direction: 'INCREASE' | 'DECREASE';
    reasonCode:
      | 'COUNT_CORRECTION'
      | 'DAMAGE'
      | 'RETURN'
      | 'RECEIPT_CORRECTION'
      | 'OUTBOUND_CORRECTION'
      | 'OTHER';
    reason: string;
    lines: readonly {
      readonly productId: string;
      readonly amount: { readonly kind: 'UNIT'; readonly quantity: number };
      readonly expectedVersion: number;
    }[];
  },
  idempotencyKey: string,
): Promise<{
  data: {
    adjustmentId: string;
    entries: readonly { productId: string; ledgerEntryId: string; onHandQuantity: number }[];
  };
}> {
  const payload = await request('/warehouse-adjustments', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
    body: JSON.stringify(input),
  });
  return payload as {
    data: {
      adjustmentId: string;
      entries: readonly { productId: string; ledgerEntryId: string; onHandQuantity: number }[];
    };
  };
}
