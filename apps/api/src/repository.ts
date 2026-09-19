import type {
  Account,
  AdminAuditLog,
  AllocationResult,
  AuthenticatedPrincipal,
  CancelInboundReceiptRequest,
  CancelStoreOrderRequest,
  CancelWaitTicketRequest,
  CreateOrderSessionRequest,
  CreateProductConversionRequest,
  CreateProductRequest,
  CreateStoreOrderRequest,
  CreateStoreGroupRequest,
  CreateStoreRequest,
  CreateAccountRequest,
  CreateInboundReceiptRequest,
  DeclareStoreReceiptRequest,
  DispatchWarehouseOutboundRequest,
  FinalizeReceiptRequest,
  ConfirmReceiptCostsRequest,
  ListOrderSessionsQuery,
  ListAccountsQuery,
  ListAllocationsQuery,
  ListAuditLogsQuery,
  ListInboundReceiptsQuery,
  ListProductsQuery,
  ListReceiptsQuery,
  ListStoreInventoryBagLedgerQuery,
  ListStoreInventoryBagsQuery,
  ListStoreOutboundsQuery,
  ListStoreReceiptSourcesQuery,
  ListPriorityOffersQuery,
  ListProductConversionsQuery,
  ListStoreOrderRequestsQuery,
  ListStoreGroupsQuery,
  ListStoresQuery,
  PaginationMeta,
  OrderSession,
  Product,
  ProductConversion,
  PriorityOffer,
  Receipt,
  RespondPriorityOfferRequest,
  ReturnReceiptForCorrectionRequest,
  ResetPasswordRequest,
  ReplaceHtkdAssignmentsRequest,
  Session,
  Store,
  StoreGroup,
  StoreInventoryBag,
  StoreInventoryBagLedgerEntry,
  StoreOrderRequest,
  StoreOutbound,
  StoreReceiptSource,
  SubmitStoreReceiptRequest,
  TransitionOrderSessionRequest,
  UpdateProductRequest,
  UpdateAccountRequest,
  UpdateProductConversionRequest,
  DeleteProductConversionRequest,
  ListWaitTicketsQuery,
  ListWarehouseOutboundRequestsQuery,
  MonthlyOperationalReport,
  MonthlyOperationalReportQuery,
  IdosiOrderStatisticsPayload,
  IdosiStatisticsAttempt,
  IdosiStatisticsScope,
  IdosiStatisticsSnapshot,
  HtkdAssignment,
  InboundReceipt,
  OperationalSettingsVersion,
  WaitTicket,
  WaitTicketHistory,
  WarehouseOutboundRequest,
  OpenStoreInventoryBagRequest,
  CreateStoreOutboundRequest,
  ReviewStoreOutboundRequest,
  StoreTransfer,
  ListStoreTransfersQuery,
  CreateStoreTransferRequest,
  DispatchStoreTransferRequest,
  ReceiveStoreTransferRequest,
  CancelStoreTransferRequest,
  WarehouseBalancesResponse,
  CreateWarehouseAdjustmentRequest,
  WarehouseAdjustment,
  UpdateOperationalSettingsRequest,
  UpdateStoreGroupRequest,
  UpdateStoreRequest,
} from '@idosi/contracts';

import { forbidden } from './errors.js';

export interface RequestContext {
  readonly requestId: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

export interface AccountCredentials {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly role: AuthenticatedPrincipal['role'];
  readonly status: 'ACTIVE' | 'LOCKED' | 'DISABLED';
  readonly storeId: string | null;
  readonly passwordHash: string;
  readonly sessionVersion: number;
  readonly assignedStoreIds: readonly string[];
}

export interface Page<T> {
  readonly data: readonly T[];
  readonly pagination: PaginationMeta;
}

export interface CreatedSession {
  readonly token: string;
  readonly session: Session;
}

export interface SubmittedOrderRequest {
  readonly data: StoreOrderRequest;
  readonly replayed: boolean;
}

export interface IdempotentResource<T> {
  readonly data: T;
  readonly replayed: boolean;
}

export interface OrderStatistics {
  readonly storeCode: string;
  readonly period: { readonly from: string; readonly to: string };
  readonly totals: {
    readonly revenueByType: {
      readonly NORMAL: number;
      readonly SALE_KG: number;
      readonly SALE_PIECE: number;
    };
    readonly revenue: number;
    readonly weight: {
      readonly actualKg: string;
      readonly estimatedKg: string;
      readonly totalKg: string;
      readonly isComplete: boolean;
    };
  };
  readonly products: readonly {
    readonly productId: string;
    readonly sku: string;
    readonly name: string;
    readonly revenueVnd: number;
    readonly weightKg: string;
  }[];
  readonly generatedAt: string;
}

export const RETAIL_STORE_OPERATION_FORBIDDEN_MESSAGE =
  'Nghiệp vụ này chỉ dành cho cửa hàng bán lẻ đang hoạt động';

export interface StoreOperationEligibility {
  readonly kind: Store['kind'];
  readonly status: Store['status'];
}

/**
 * Keeps the public API response identical across repository implementations.
 * Callers must load the current store row instead of trusting session claims.
 */
export function assertActiveRetailStore(
  store: StoreOperationEligibility | null,
): asserts store is StoreOperationEligibility & { kind: 'RETAIL'; status: 'ACTIVE' } {
  if (store?.kind !== 'RETAIL' || store.status !== 'ACTIVE') {
    throw forbidden(RETAIL_STORE_OPERATION_FORBIDDEN_MESSAGE);
  }
}

export interface OperationalSettingsState {
  readonly current: OperationalSettingsVersion;
  readonly history: readonly OperationalSettingsVersion[];
}

export interface HtkdAssignmentsState {
  readonly htkdAccountId: string;
  readonly sessionVersion: number;
  readonly assignments: readonly HtkdAssignment[];
}

export interface IdosiStatisticsTarget {
  readonly storeId: string;
  readonly storeCode: string;
  readonly storeName: string;
}

export interface PersistedIdosiStatisticsState {
  readonly snapshot: IdosiStatisticsSnapshot | null;
  readonly latestAttempt: IdosiStatisticsAttempt | null;
}

export interface WarehouseRepository {
  ready(): Promise<boolean>;
  close(): Promise<void>;

  findCredentials(username: string): Promise<AccountCredentials | null>;
  createSession(
    account: AccountCredentials,
    token: string,
    expiresAt: Date,
    context: RequestContext,
  ): Promise<Session>;
  resolveSession(token: string): Promise<Session>;
  revokeSession(token: string, reason: string): Promise<boolean>;

  /** Revalidates the STORE principal against the current store kind and status. */
  authorizeRetailStoreOperation(actor: AuthenticatedPrincipal): Promise<void>;

  listAccounts(actor: AuthenticatedPrincipal, query: ListAccountsQuery): Promise<Page<Account>>;
  createAccount(
    actor: AuthenticatedPrincipal,
    input: CreateAccountRequest,
    context: RequestContext,
  ): Promise<Account>;
  updateAccount(
    actor: AuthenticatedPrincipal,
    accountId: string,
    input: UpdateAccountRequest,
    context: RequestContext,
  ): Promise<Account>;
  resetAccountPassword(
    actor: AuthenticatedPrincipal,
    accountId: string,
    input: ResetPasswordRequest,
    context: RequestContext,
  ): Promise<{
    readonly accountId: string;
    readonly sessionsRevoked: number;
    readonly sessionVersion: number;
  }>;
  listHtkdAssignments(
    actor: AuthenticatedPrincipal,
    htkdAccountId: string,
  ): Promise<HtkdAssignmentsState>;
  replaceHtkdAssignments(
    actor: AuthenticatedPrincipal,
    htkdAccountId: string,
    input: ReplaceHtkdAssignmentsRequest,
    context: RequestContext,
  ): Promise<HtkdAssignmentsState>;
  listAuditLogs(
    actor: AuthenticatedPrincipal,
    query: ListAuditLogsQuery,
  ): Promise<Page<AdminAuditLog>>;
  getOperationalSettings(
    actor: AuthenticatedPrincipal,
    historyLimit: number,
  ): Promise<OperationalSettingsState>;
  updateOperationalSettings(
    actor: AuthenticatedPrincipal,
    input: UpdateOperationalSettingsRequest,
    context: RequestContext,
  ): Promise<OperationalSettingsVersion>;

  resolveIdosiStatisticsTarget(
    actor: AuthenticatedPrincipal,
    storeId: string,
  ): Promise<IdosiStatisticsTarget>;
  getIdosiStatisticsState(
    actor: AuthenticatedPrincipal,
    scope: IdosiStatisticsScope,
  ): Promise<PersistedIdosiStatisticsState>;
  recordIdosiStatisticsSuccess(
    actor: AuthenticatedPrincipal,
    scope: IdosiStatisticsScope,
    payload: IdosiOrderStatisticsPayload,
    startedAt: Date,
    completedAt: Date,
    context: RequestContext,
  ): Promise<void>;
  recordIdosiStatisticsFailure(
    actor: AuthenticatedPrincipal,
    scope: IdosiStatisticsScope,
    errorCode: string,
    errorMessage: string,
    startedAt: Date,
    completedAt: Date,
    context: RequestContext,
  ): Promise<void>;

  listOrderSessions(query: ListOrderSessionsQuery): Promise<Page<OrderSession>>;
  listAllocations(
    actor: AuthenticatedPrincipal,
    query: ListAllocationsQuery,
  ): Promise<Page<AllocationResult>>;
  createOrderSession(
    actor: AuthenticatedPrincipal,
    input: CreateOrderSessionRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<OrderSession>>;
  transitionOrderSession(
    actor: AuthenticatedPrincipal,
    sessionId: string,
    input: TransitionOrderSessionRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<OrderSession>>;

  listWarehouseBalances(actor: AuthenticatedPrincipal): Promise<WarehouseBalancesResponse>;
  createWarehouseAdjustment(
    actor: AuthenticatedPrincipal,
    input: CreateWarehouseAdjustmentRequest,
    idempotencyKey: string,
    context: RequestContext,
  ): Promise<WarehouseAdjustment>;
  listInboundReceipts(
    actor: AuthenticatedPrincipal,
    query: ListInboundReceiptsQuery,
  ): Promise<Page<InboundReceipt>>;
  getInboundReceipt(actor: AuthenticatedPrincipal, receiptId: string): Promise<InboundReceipt>;
  receiveSupplierInbound(
    actor: AuthenticatedPrincipal,
    input: CreateInboundReceiptRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<InboundReceipt>>;
  confirmSupplierInboundCosts(
    actor: AuthenticatedPrincipal,
    receiptId: string,
    input: ConfirmReceiptCostsRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<InboundReceipt>>;
  cancelSupplierInbound(
    actor: AuthenticatedPrincipal,
    receiptId: string,
    input: CancelInboundReceiptRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<InboundReceipt>>;

  listProducts(query: ListProductsQuery): Promise<Page<Product>>;
  createProduct(
    actor: AuthenticatedPrincipal,
    input: CreateProductRequest,
    context: RequestContext,
  ): Promise<Product>;
  updateProduct(
    actor: AuthenticatedPrincipal,
    productId: string,
    input: UpdateProductRequest,
    context: RequestContext,
  ): Promise<Product>;
  listProductConversions(
    productId: string,
    query: ListProductConversionsQuery,
  ): Promise<Page<ProductConversion>>;
  listAllProductConversions(query: ListProductConversionsQuery): Promise<Page<ProductConversion>>;
  /** Creates v1, or atomically appends after the latest version has been explicitly retired. */
  createProductConversion(
    actor: AuthenticatedPrincipal,
    productId: string,
    input: CreateProductConversionRequest,
    context: RequestContext,
  ): Promise<ProductConversion>;
  replaceProductConversion(
    actor: AuthenticatedPrincipal,
    productId: string,
    conversionId: string,
    input: UpdateProductConversionRequest,
    context: RequestContext,
  ): Promise<ProductConversion>;
  retireProductConversion(
    actor: AuthenticatedPrincipal,
    productId: string,
    conversionId: string,
    input: DeleteProductConversionRequest,
    context: RequestContext,
  ): Promise<ProductConversion>;

  listStores(actor: AuthenticatedPrincipal, query: ListStoresQuery): Promise<Page<Store>>;
  listStoreGroups(
    actor: AuthenticatedPrincipal,
    query: ListStoreGroupsQuery,
  ): Promise<Page<StoreGroup>>;
  createStoreGroup(
    actor: AuthenticatedPrincipal,
    input: CreateStoreGroupRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<StoreGroup>>;
  updateStoreGroup(
    actor: AuthenticatedPrincipal,
    groupId: string,
    input: UpdateStoreGroupRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<StoreGroup>>;
  createStore(
    actor: AuthenticatedPrincipal,
    input: CreateStoreRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<Store>>;
  updateStore(
    actor: AuthenticatedPrincipal,
    storeId: string,
    input: UpdateStoreRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<Store>>;

  listOrderRequests(
    actor: AuthenticatedPrincipal,
    query: ListStoreOrderRequestsQuery,
  ): Promise<Page<StoreOrderRequest>>;
  submitOrderRequest(
    actor: AuthenticatedPrincipal,
    input: CreateStoreOrderRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<SubmittedOrderRequest>;
  cancelOrderRequest(
    actor: AuthenticatedPrincipal,
    requestId: string,
    input: CancelStoreOrderRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<StoreOrderRequest>>;

  listWarehouseOutboundRequests(
    actor: AuthenticatedPrincipal,
    query: ListWarehouseOutboundRequestsQuery,
  ): Promise<Page<WarehouseOutboundRequest>>;
  dispatchWarehouseOutboundRequest(
    actor: AuthenticatedPrincipal,
    outboundRequestId: string,
    input: DispatchWarehouseOutboundRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<WarehouseOutboundRequest>>;

  listReceipts(actor: AuthenticatedPrincipal, query: ListReceiptsQuery): Promise<Page<Receipt>>;
  listStoreReceiptSources(
    actor: AuthenticatedPrincipal,
    query: ListStoreReceiptSourcesQuery,
  ): Promise<Page<StoreReceiptSource>>;
  getReceipt(actor: AuthenticatedPrincipal, receiptId: string): Promise<Receipt>;
  declareStoreReceipt(
    actor: AuthenticatedPrincipal,
    input: DeclareStoreReceiptRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<Receipt>>;
  submitStoreReceipt(
    actor: AuthenticatedPrincipal,
    receiptId: string,
    input: SubmitStoreReceiptRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<Receipt>>;
  returnStoreReceiptForCorrection(
    actor: AuthenticatedPrincipal,
    receiptId: string,
    input: ReturnReceiptForCorrectionRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<Receipt>>;
  finalizeStoreReceipt(
    actor: AuthenticatedPrincipal,
    receiptId: string,
    input: FinalizeReceiptRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<Receipt>>;

  listStoreInventoryBags(
    actor: AuthenticatedPrincipal,
    query: ListStoreInventoryBagsQuery,
  ): Promise<Page<StoreInventoryBag>>;
  listStoreInventoryBagLedger(
    actor: AuthenticatedPrincipal,
    bagId: string,
    query: ListStoreInventoryBagLedgerQuery,
  ): Promise<Page<StoreInventoryBagLedgerEntry>>;
  openStoreInventoryBag(
    actor: AuthenticatedPrincipal,
    bagId: string,
    input: OpenStoreInventoryBagRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<StoreInventoryBag>>;
  listStoreOutbounds(
    actor: AuthenticatedPrincipal,
    query: ListStoreOutboundsQuery,
  ): Promise<Page<StoreOutbound>>;
  createStoreOutbound(
    actor: AuthenticatedPrincipal,
    input: CreateStoreOutboundRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<StoreOutbound>>;
  reviewStoreOutbound(
    actor: AuthenticatedPrincipal,
    outboundId: string,
    input: ReviewStoreOutboundRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<StoreOutbound>>;

  listStoreTransfers(
    actor: AuthenticatedPrincipal,
    query: ListStoreTransfersQuery,
  ): Promise<Page<StoreTransfer>>;
  listStoreTransferDestinations(actor: AuthenticatedPrincipal): Promise<readonly Store[]>;
  createStoreTransfer(
    actor: AuthenticatedPrincipal,
    input: CreateStoreTransferRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<StoreTransfer>>;
  dispatchStoreTransfer(
    actor: AuthenticatedPrincipal,
    transferId: string,
    input: DispatchStoreTransferRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<StoreTransfer>>;
  receiveStoreTransfer(
    actor: AuthenticatedPrincipal,
    transferId: string,
    input: ReceiveStoreTransferRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<StoreTransfer>>;
  cancelStoreTransfer(
    actor: AuthenticatedPrincipal,
    transferId: string,
    input: CancelStoreTransferRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<StoreTransfer>>;

  listWaitTickets(
    actor: AuthenticatedPrincipal,
    query: ListWaitTicketsQuery,
  ): Promise<Page<WaitTicket>>;
  getWaitTicketHistory(
    actor: AuthenticatedPrincipal,
    waitTicketId: string,
    limit: number,
  ): Promise<WaitTicketHistory>;
  cancelWaitTicket(
    actor: AuthenticatedPrincipal,
    waitTicketId: string,
    input: CancelWaitTicketRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<WaitTicket>>;
  listPriorityOffers(
    actor: AuthenticatedPrincipal,
    query: ListPriorityOffersQuery,
  ): Promise<Page<PriorityOffer>>;
  respondPriorityOffer(
    actor: AuthenticatedPrincipal,
    offerId: string,
    input: RespondPriorityOfferRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<PriorityOffer>>;

  getMonthlyOperationalReport(
    actor: AuthenticatedPrincipal,
    query: MonthlyOperationalReportQuery,
  ): Promise<MonthlyOperationalReport>;

  getOrderStatistics(
    actor: AuthenticatedPrincipal,
    storeCode: string,
    from: string,
    to: string,
  ): Promise<OrderStatistics>;
}

export function canAccessStore(principal: AuthenticatedPrincipal, storeId: string): boolean {
  if (principal.role === 'ADMIN') return true;
  if (principal.role === 'STORE') return principal.storeId === storeId;
  return principal.assignedStoreIds.includes(storeId);
}

export function pagination(page: number, pageSize: number, totalItems: number): PaginationMeta {
  return {
    page,
    pageSize,
    totalItems,
    totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize),
  };
}

export function slicePage<T>(values: readonly T[], page: number, pageSize: number): readonly T[] {
  const start = (page - 1) * pageSize;
  return values.slice(start, start + pageSize);
}
