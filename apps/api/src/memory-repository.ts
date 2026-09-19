import { randomUUID } from 'node:crypto';

import type {
  Account,
  AdminAuditLog,
  AllocationResult,
  AuthenticatedPrincipal,
  CancelInboundReceiptRequest,
  CancelStoreOrderRequest,
  ConfirmReceiptCostsRequest,
  CancelWaitTicketRequest,
  CreateOrderSessionRequest,
  CreateProductConversionRequest,
  CreateProductRequest,
  CreateStoreOrderRequest,
  CreateStoreGroupRequest,
  CreateStoreOutboundRequest,
  CreateStoreRequest,
  CreateAccountRequest,
  CreateInboundReceiptRequest,
  DeclareStoreReceiptRequest,
  DispatchWarehouseOutboundRequest,
  FinalizeReceiptRequest,
  HtkdAssignment,
  InboundReceipt,
  ListOrderSessionsQuery,
  ListAccountsQuery,
  ListAllocationsQuery,
  ListAuditLogsQuery,
  ListInboundReceiptsQuery,
  ListProductsQuery,
  ListPriorityOffersQuery,
  ListReceiptsQuery,
  ListStoreInventoryBagLedgerQuery,
  ListStoreInventoryBagsQuery,
  ListStoreOutboundsQuery,
  ListStoreReceiptSourcesQuery,
  ListProductConversionsQuery,
  ListStoreOrderRequestsQuery,
  ListStoreGroupsQuery,
  ListStoresQuery,
  ListWaitTicketsQuery,
  ListWarehouseOutboundRequestsQuery,
  MonthlyOperationalReport,
  MonthlyOperationalReportQuery,
  IdosiOrderStatisticsPayload,
  IdosiStatisticsAttempt,
  IdosiStatisticsScope,
  IdosiStatisticsSnapshot,
  OperationalSettingsVersion,
  OpenStoreInventoryBagRequest,
  Product,
  ProductConversion,
  PriorityOffer,
  Receipt,
  RespondPriorityOfferRequest,
  ReturnReceiptForCorrectionRequest,
  ResetPasswordRequest,
  ReplaceHtkdAssignmentsRequest,
  ReviewStoreOutboundRequest,
  OrderSession,
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
  UpdateOperationalSettingsRequest,
  UpdateStoreGroupRequest,
  UpdateStoreRequest,
  DeleteProductConversionRequest,
  WaitTicket,
  WaitTicketHistory,
  WarehouseOutboundRequest,
  StoreTransfer,
  ListStoreTransfersQuery,
  CreateStoreTransferRequest,
  DispatchStoreTransferRequest,
  ReceiveStoreTransferRequest,
  CancelStoreTransferRequest,
  WarehouseBalancesResponse,
  CreateWarehouseAdjustmentRequest,
  WarehouseAdjustment,
} from '@idosi/contracts';
import {
  PRODUCT_CONVERSION_SEEDS,
  PRODUCT_SEEDS,
  STORE_GROUP_SEEDS,
  STORE_SEEDS,
} from '@idosi/database/seed-data';
import {
  allocateTransferCostVnd,
  calculateWeightedCostVnd,
  gramsToKilogramsExact,
  idosiStatisticsScopeKey,
  isRequestDeadlineClosed,
  kilogramsToGramsExact,
  summarizeMonthlyReport,
} from '@idosi/database';
import type { MonthlyReportScope } from '@idosi/database';

import { ApiError, conflict, forbidden, notFound, unauthenticated } from './errors.js';
import { sanitizeAuditObject } from './audit-sanitization.js';
import { monthlyOperationalReportDto } from './monthly-report.js';
import type {
  AccountCredentials,
  HtkdAssignmentsState,
  IdosiStatisticsTarget,
  OrderStatistics,
  IdempotentResource,
  Page,
  RequestContext,
  SubmittedOrderRequest,
  WarehouseRepository,
} from './repository.js';
import { assertActiveRetailStore, canAccessStore, pagination, slicePage } from './repository.js';
import { hashPassword, hashSessionToken } from './security.js';

const HO_CHI_MINH_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
});

function hoChiMinhBusinessDate(instant: Date): string {
  const parts = HO_CHI_MINH_DATE_FORMATTER.formatToParts(instant);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) throw new Error('Unable to resolve Asia/Ho_Chi_Minh date');
  return `${year}-${month}-${day}`;
}

export const MEMORY_SEED_IDS = {
  adminAccount: '00000000-0000-4000-8000-000000000001',
  htkdAccount: '00000000-0000-4000-8000-000000000002',
  storeAccount: '00000000-0000-4000-8000-000000000003',
  orderSession: '10000000-0000-4000-8000-000000000001',
  outboundRequest: '11000000-0000-4000-8000-000000000001',
  secondOutboundRequest: '11000000-0000-4000-8000-000000000002',
  reservedOutboundRequest: '11000000-0000-4000-8000-000000000003',
  storeReceipt: '12000000-0000-4000-8000-000000000001',
  waitTicket: '13000000-0000-4000-8000-000000000001',
  cancellableWaitTicket: '13000000-0000-4000-8000-000000000002',
  priorityOffer: '14000000-0000-4000-8000-000000000001',
  operationalSettings: '14500000-0000-4000-8000-000000000001',
  allocationRun: '11000000-0000-4000-8000-100000000001',
  allocationLine: '11000000-0000-4000-8000-300000000001',
  bdAllocationLine: '11000000-0000-4000-8000-300000000004',
  unassignedAllocationLine: '11000000-0000-4000-8000-300000000005',
  htkdNvtAssignment: '14600000-0000-4000-8000-000000000001',
  htkdBdAssignment: '14600000-0000-4000-8000-000000000002',
  inventoryBag: '15000000-0000-4000-8000-000000000001',
  inventoryLedger: '15100000-0000-4000-8000-000000000001',
  sourceReceiptBag: '15200000-0000-4000-8000-000000000001',
  nvtStore: '20000000-0000-4000-8000-000000000007',
  bdStore: '20000000-0000-4000-8000-000000000008',
  ctStore: '20000000-0000-4000-8000-000000000006',
} as const;

interface MutableAccount extends AccountCredentials {
  displayName: string;
  passwordHash: string;
  sessionVersion: number;
  status: 'ACTIVE' | 'LOCKED' | 'DISABLED';
  assignedStoreIds: string[];
  readonly createdAt: string;
  updatedAt: string;
}

interface StoredSession {
  readonly id: string;
  readonly tokenHash: string;
  readonly accountId: string;
  readonly accountSessionVersion: number;
  readonly createdAt: Date;
  lastSeenAt: Date;
  readonly expiresAt: Date;
  revokedAt: Date | null;
}

interface IdempotencyRecord {
  readonly requestHash: string;
  readonly response: StoreOrderRequest;
}

interface SessionMutationIdempotencyRecord {
  readonly requestHash: string;
  readonly response: OrderSession;
}

interface ReceiptIdempotencyRecord {
  readonly requestHash: string;
  readonly response: Receipt;
}

interface InboundReceiptIdempotencyRecord {
  readonly requestHash: string;
  readonly response: InboundReceipt;
}

interface MemoryWarehouseBalance {
  onHandQuantity: number;
  reservedQuantity: number;
  version: number;
  updatedAt: string;
}

interface WaitMutationIdempotencyRecord {
  readonly requestHash: string;
  readonly resourceType: 'WAIT_TICKET' | 'PRIORITY_OFFER';
  readonly resourceId: string;
}

interface InventoryMutationIdempotencyRecord {
  readonly requestHash: string;
  readonly resourceType: 'STORE_INVENTORY_BAG' | 'STORE_OUTBOUND';
  readonly response: StoreInventoryBag | StoreOutbound;
}

interface WarehouseOutboundMutationIdempotencyRecord {
  readonly requestHash: string;
  readonly response: WarehouseOutboundRequest;
}

interface TransferMutationIdempotencyRecord {
  readonly requestHash: string;
  readonly response: StoreTransfer;
}

interface StoreLifecycleIdempotencyRecord {
  readonly requestHash: string;
  readonly response: Store | StoreGroup;
}

interface AuditRecord {
  readonly id: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly actorAccountId: string;
  readonly actorRole: AuthenticatedPrincipal['role'];
  readonly actorStoreId: string | null;
  readonly requestId: string;
  readonly before: unknown;
  readonly after: unknown;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export interface MemoryRepositoryOptions {
  readonly bootstrapPassword?: string;
  readonly now?: () => Date;
}

/** Deterministic in-memory adapter for inject tests and local demos. Never used by default in production. */
export class MemoryWarehouseRepository implements WarehouseRepository {
  private readonly now: () => Date;
  private readonly accounts = new Map<string, MutableAccount>();
  private readonly htkdAssignments = new Map<string, HtkdAssignment>();
  private readonly sessions = new Map<string, StoredSession>();
  private readonly stores = new Map<string, Store>();
  private readonly orderSessions = new Map<string, OrderSession>();
  private readonly products = new Map<string, Product>();
  private readonly allocationResults = new Map<string, AllocationResult>();
  private readonly productConversions = new Map<string, ProductConversion>();
  private readonly orderRequests = new Map<string, StoreOrderRequest>();
  private readonly inboundReceipts = new Map<string, InboundReceipt>();
  private readonly receipts = new Map<string, Receipt>();
  private readonly waitTickets = new Map<string, WaitTicket>();
  private readonly priorityOffers = new Map<string, PriorityOffer>();
  private readonly dispatchedOutbounds = new Map<string, WarehouseOutboundRequest>();
  private readonly idempotency = new Map<string, IdempotencyRecord>();
  private readonly sessionMutationIdempotency = new Map<string, SessionMutationIdempotencyRecord>();
  private readonly receiptIdempotency = new Map<string, ReceiptIdempotencyRecord>();
  private readonly inboundReceiptIdempotency = new Map<string, InboundReceiptIdempotencyRecord>();
  private readonly waitMutationIdempotency = new Map<string, WaitMutationIdempotencyRecord>();
  private readonly inventoryMutationIdempotency = new Map<
    string,
    InventoryMutationIdempotencyRecord
  >();
  private readonly warehouseOutboundMutationIdempotency = new Map<
    string,
    WarehouseOutboundMutationIdempotencyRecord
  >();
  private readonly inventoryBags = new Map<string, StoreInventoryBag>();
  private readonly inventoryBagCosts = new Map<string, bigint>();
  private readonly inventoryLedger = new Map<string, StoreInventoryBagLedgerEntry>();
  private readonly storeOutbounds = new Map<string, StoreOutbound>();
  private readonly storeTransfers = new Map<string, StoreTransfer>();
  private readonly transferMutationIdempotency = new Map<
    string,
    TransferMutationIdempotencyRecord
  >();
  private readonly warehouseBalances = new Map<string, MemoryWarehouseBalance>();
  private readonly storeGroups = new Map<string, StoreGroup>();
  private readonly storeLifecycleIdempotency = new Map<string, StoreLifecycleIdempotencyRecord>();
  private readonly audit: AuditRecord[] = [];
  private readonly operationalSettings: OperationalSettingsVersion[] = [];
  private readonly idosiStatisticsSnapshots = new Map<string, IdosiStatisticsSnapshot>();
  private readonly idosiStatisticsAttempts = new Map<string, IdosiStatisticsAttempt>();

  private constructor(now: () => Date) {
    this.now = now;
  }

  public static async create(
    options: MemoryRepositoryOptions = {},
  ): Promise<MemoryWarehouseRepository> {
    const repository = new MemoryWarehouseRepository(options.now ?? (() => new Date()));
    await repository.seed(options.bootstrapPassword ?? 'IDOSI-local-only-2026!');
    return repository;
  }

  public async ready(): Promise<boolean> {
    return true;
  }

  public async close(): Promise<void> {
    // There are no external resources in memory mode.
  }

  public async findCredentials(username: string): Promise<AccountCredentials | null> {
    const normalized = username.trim();
    return [...this.accounts.values()].find((account) => account.username === normalized) ?? null;
  }

  public async createSession(
    account: AccountCredentials,
    token: string,
    expiresAt: Date,
    _context: RequestContext,
  ): Promise<Session> {
    const createdAt = this.now();
    const stored: StoredSession = {
      id: randomUUID(),
      tokenHash: hashSessionToken(token),
      accountId: account.id,
      accountSessionVersion: account.sessionVersion,
      createdAt,
      lastSeenAt: createdAt,
      expiresAt,
      revokedAt: null,
    };
    this.sessions.set(stored.tokenHash, stored);
    return this.toSession(stored, account);
  }

  public async resolveSession(token: string): Promise<Session> {
    const stored = this.sessions.get(hashSessionToken(token));
    const now = this.now();
    if (!stored || stored.revokedAt !== null || stored.expiresAt.getTime() <= now.getTime()) {
      throw unauthenticated();
    }
    const account = this.accounts.get(stored.accountId);
    if (!account || account.sessionVersion !== stored.accountSessionVersion) {
      throw new ApiError('SESSION_REVOKED', 'Phiên đăng nhập đã bị thu hồi', 401);
    }
    if (account.status !== 'ACTIVE') {
      throw new ApiError('ACCOUNT_INACTIVE', 'Tài khoản đã bị khóa hoặc vô hiệu hóa', 403);
    }
    stored.lastSeenAt = now;
    return this.toSession(stored, account);
  }

  public async revokeSession(token: string, _reason: string): Promise<boolean> {
    const stored = this.sessions.get(hashSessionToken(token));
    if (!stored || stored.revokedAt !== null) return false;
    stored.revokedAt = this.now();
    return true;
  }

  public async authorizeRetailStoreOperation(actor: AuthenticatedPrincipal): Promise<void> {
    const store =
      actor.role === 'STORE' && actor.storeId !== null ? this.stores.get(actor.storeId) : undefined;
    assertActiveRetailStore(store ?? null);
  }

  public async listAccounts(
    actor: AuthenticatedPrincipal,
    query: ListAccountsQuery,
  ): Promise<Page<Account>> {
    requireMemoryAdmin(actor);
    const search = query.search?.toLocaleLowerCase('vi-VN');
    const values = [...this.accounts.values()]
      .filter((account) => query.role === undefined || account.role === query.role)
      .filter((account) => query.status === undefined || account.status === query.status)
      .filter((account) => query.storeId === undefined || account.storeId === query.storeId)
      .filter(
        (account) =>
          search === undefined ||
          account.username.toLocaleLowerCase('vi-VN').includes(search) ||
          account.displayName.toLocaleLowerCase('vi-VN').includes(search),
      )
      .sort((left, right) => left.username.localeCompare(right.username))
      .map(memoryAccountDto);
    return {
      data: slicePage(values, query.page, query.pageSize),
      pagination: pagination(query.page, query.pageSize, values.length),
    };
  }

  public async createAccount(
    actor: AuthenticatedPrincipal,
    input: CreateAccountRequest,
    context: RequestContext,
  ): Promise<Account> {
    requireMemoryAdmin(actor);
    if ([...this.accounts.values()].some((account) => account.username === input.username)) {
      throw conflict('Tên đăng nhập đã tồn tại');
    }
    if (input.role === 'STORE') {
      const store = input.storeId === null ? undefined : this.stores.get(input.storeId);
      if (!store || store.status !== 'ACTIVE')
        throw notFound('Không tìm thấy cửa hàng đang hoạt động');
      if (
        [...this.accounts.values()].some(
          (account) => account.role === 'STORE' && account.storeId === input.storeId,
        )
      ) {
        throw conflict('Cửa hàng đã có tài khoản');
      }
    }
    const now = this.now().toISOString();
    const created: MutableAccount = {
      id: randomUUID(),
      username: input.username,
      displayName: input.displayName,
      role: input.role,
      status: 'ACTIVE',
      storeId: input.storeId,
      passwordHash: await hashPassword(input.password),
      sessionVersion: 0,
      assignedStoreIds: [],
      createdAt: now,
      updatedAt: now,
    };
    this.accounts.set(created.id, created);
    const result = memoryAccountDto(created);
    this.appendAudit(actor, context, 'ACCOUNT_CREATED', 'user', created.id, null, result);
    return result;
  }

  public async updateAccount(
    actor: AuthenticatedPrincipal,
    accountId: string,
    input: UpdateAccountRequest,
    context: RequestContext,
  ): Promise<Account> {
    requireMemoryAdmin(actor);
    const account = this.accounts.get(accountId);
    if (!account) throw notFound('Không tìm thấy tài khoản');
    requireAccountStatusVersion(input.status, input.expectedSessionVersion);
    assertMemoryAccountVersion(account, input.expectedSessionVersion);
    if (accountId === actor.accountId && input.status !== undefined && input.status !== 'ACTIVE') {
      throw forbidden('Không thể tự khóa hoặc vô hiệu hóa tài khoản quản trị đang dùng');
    }

    const before = memoryAccountDto(account);
    const statusChanged = input.status !== undefined && input.status !== account.status;
    const nameChanged =
      input.displayName !== undefined && input.displayName !== account.displayName;
    if (!statusChanged && !nameChanged) return before;

    if (input.displayName !== undefined) account.displayName = input.displayName;
    if (input.status !== undefined) account.status = input.status;
    let sessionsRevoked = 0;
    if (statusChanged) {
      account.sessionVersion += 1;
      sessionsRevoked = this.revokeAccountSessions(accountId);
    }
    account.updatedAt = this.now().toISOString();
    const result = memoryAccountDto(account);
    this.appendAudit(
      actor,
      context,
      statusChanged ? 'ACCOUNT_STATUS_UPDATED' : 'ACCOUNT_UPDATED',
      'user',
      account.id,
      before,
      result,
      { sessionsRevoked },
    );
    return result;
  }

  public async resetAccountPassword(
    actor: AuthenticatedPrincipal,
    accountId: string,
    input: ResetPasswordRequest,
    context: RequestContext,
  ): Promise<{ accountId: string; sessionsRevoked: number; sessionVersion: number }> {
    requireMemoryAdmin(actor);
    const account = this.accounts.get(accountId);
    if (!account) throw notFound('Không tìm thấy tài khoản');
    assertMemoryAccountVersion(account, input.expectedSessionVersion);
    const before = memoryAccountDto(account);
    account.passwordHash = await hashPassword(input.newPassword);
    account.sessionVersion += 1;
    account.updatedAt = this.now().toISOString();
    const sessionsRevoked = this.revokeAccountSessions(accountId);
    const after = memoryAccountDto(account);
    this.appendAudit(actor, context, 'ACCOUNT_PASSWORD_RESET', 'user', account.id, before, after, {
      sessionsRevoked,
    });
    return { accountId, sessionsRevoked, sessionVersion: account.sessionVersion };
  }

  public async listHtkdAssignments(
    actor: AuthenticatedPrincipal,
    htkdAccountId: string,
  ): Promise<HtkdAssignmentsState> {
    requireMemoryAdmin(actor);
    return this.htkdAssignmentState(htkdAccountId);
  }

  public async replaceHtkdAssignments(
    actor: AuthenticatedPrincipal,
    htkdAccountId: string,
    input: ReplaceHtkdAssignmentsRequest,
    context: RequestContext,
  ): Promise<HtkdAssignmentsState> {
    requireMemoryAdmin(actor);
    const account = this.requireActiveHtkdAccount(htkdAccountId);
    assertMemoryAccountVersion(account, input.expectedSessionVersion);

    for (const storeId of input.storeIds) {
      const store = this.stores.get(storeId);
      if (!store || store.status !== 'ACTIVE' || store.kind !== 'RETAIL') {
        throw new ApiError(
          'VALIDATION_ERROR',
          'HTKD chỉ được phân công cửa hàng bán lẻ đang hoạt động',
          400,
        );
      }
    }

    const before = this.htkdAssignmentState(htkdAccountId);
    const currentStoreIds = before.assignments.map((assignment) => assignment.storeId).toSorted();
    const nextStoreIds = [...input.storeIds].toSorted();
    if (
      currentStoreIds.length === nextStoreIds.length &&
      currentStoreIds.every((storeId, index) => storeId === nextStoreIds[index])
    ) {
      return before;
    }

    const nextStoreIdSet = new Set(nextStoreIds);
    const currentStoreIdSet = new Set(currentStoreIds);
    const revokedStoreIds = currentStoreIds.filter((storeId) => !nextStoreIdSet.has(storeId));
    const addedStoreIds = nextStoreIds.filter((storeId) => !currentStoreIdSet.has(storeId));
    const now = this.now().toISOString();

    for (const assignment of before.assignments) {
      if (!nextStoreIdSet.has(assignment.storeId)) {
        this.htkdAssignments.set(assignment.id, {
          ...assignment,
          revokedAt: now,
          revokedByAccountId: actor.accountId,
        });
      }
    }
    for (const storeId of addedStoreIds) {
      const assignment: HtkdAssignment = {
        id: randomUUID(),
        htkdAccountId,
        storeId,
        assignedAt: now,
        assignedByAccountId: actor.accountId,
        revokedAt: null,
        revokedByAccountId: null,
      };
      this.htkdAssignments.set(assignment.id, assignment);
    }

    account.assignedStoreIds = nextStoreIds;
    account.sessionVersion += 1;
    account.updatedAt = now;
    const sessionsRevoked = this.revokeAccountSessions(htkdAccountId);
    const after = this.htkdAssignmentState(htkdAccountId);
    this.appendAudit(
      actor,
      context,
      'HTKD_ASSIGNMENTS_REPLACED',
      'user',
      htkdAccountId,
      before,
      after,
      { addedStoreIds, reason: input.reason, revokedStoreIds, sessionsRevoked },
    );
    return after;
  }

  public async listAuditLogs(
    actor: AuthenticatedPrincipal,
    query: ListAuditLogsQuery,
  ): Promise<Page<AdminAuditLog>> {
    requireMemoryAdmin(actor);
    const values = this.audit
      .filter(
        (event) =>
          query.actorAccountId === undefined || event.actorAccountId === query.actorAccountId,
      )
      .filter((event) => query.action === undefined || event.action === query.action)
      .filter((event) => query.entityType === undefined || event.entityType === query.entityType)
      .filter((event) => query.entityId === undefined || event.entityId === query.entityId)
      .filter((event) => query.requestId === undefined || event.requestId === query.requestId)
      .filter((event) => query.createdFrom === undefined || event.createdAt >= query.createdFrom)
      .filter((event) => query.createdTo === undefined || event.createdAt <= query.createdTo)
      .sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
      )
      .map(memoryAuditDto);
    return {
      data: slicePage(values, query.page, query.pageSize),
      pagination: pagination(query.page, query.pageSize, values.length),
    };
  }

  public async getOperationalSettings(
    actor: AuthenticatedPrincipal,
    historyLimit: number,
  ): Promise<{
    readonly current: OperationalSettingsVersion;
    readonly history: readonly OperationalSettingsVersion[];
  }> {
    requireMemoryAdmin(actor);
    const history = this.operationalSettings
      .toSorted((left, right) => right.version - left.version)
      .slice(0, historyLimit)
      .map((settings) => structuredClone(settings));
    const current = history[0];
    if (!current) throw new Error('Operational settings have not been initialized');
    return { current, history };
  }

  public async updateOperationalSettings(
    actor: AuthenticatedPrincipal,
    input: UpdateOperationalSettingsRequest,
    context: RequestContext,
  ): Promise<OperationalSettingsVersion> {
    requireMemoryAdmin(actor);
    const current = this.operationalSettings.toSorted(
      (left, right) => right.version - left.version,
    )[0];
    if (!current) throw new Error('Operational settings have not been initialized');
    if (current.version !== input.expectedVersion) {
      throw operationalSettingsVersionConflict();
    }
    const created: OperationalSettingsVersion = Object.freeze({
      id: randomUUID(),
      version: current.version + 1,
      timezone: input.timezone,
      snapshotTime: input.snapshotTime,
      cutoffTime: input.cutoffTime,
      maxRequestsPerStore: input.maxRequestsPerStore,
      policyVersion: input.policyVersion,
      idosiSyncIntervalMinutes: input.idosiSyncIntervalMinutes,
      createdByAccountId: actor.accountId,
      requestId: context.requestId,
      createdAt: this.now().toISOString(),
    });
    this.operationalSettings.push(created);
    this.appendAudit(
      actor,
      context,
      'OPERATIONAL_SETTINGS_VERSION_CREATED',
      'operational_settings_version',
      created.id,
      current,
      created,
      { previousVersion: current.version, version: created.version },
    );
    return structuredClone(created);
  }

  public async resolveIdosiStatisticsTarget(
    actor: AuthenticatedPrincipal,
    storeId: string,
  ): Promise<IdosiStatisticsTarget> {
    const store = this.stores.get(storeId);
    if (!store) throw notFound('Không tìm thấy cửa hàng');
    if (!canAccessStore(actor, store.id)) throw forbidden('Không có quyền xem cửa hàng này');
    if (store.status !== 'ACTIVE') throw conflict('Cửa hàng đã ngừng hoạt động');
    if (store.kind !== 'RETAIL') {
      throw conflict('Đồng bộ doanh thu chỉ áp dụng cho cửa hàng bán lẻ');
    }
    return { storeId: store.id, storeCode: store.code, storeName: store.name };
  }

  public async getIdosiStatisticsState(actor: AuthenticatedPrincipal, scope: IdosiStatisticsScope) {
    await this.resolveIdosiStatisticsTarget(actor, scope.storeId);
    const key = memoryIdosiScopeKey(scope);
    return {
      snapshot: this.idosiStatisticsSnapshots.get(key) ?? null,
      latestAttempt: this.idosiStatisticsAttempts.get(key) ?? null,
    };
  }

  public async recordIdosiStatisticsSuccess(
    actor: AuthenticatedPrincipal,
    scope: IdosiStatisticsScope,
    payload: IdosiOrderStatisticsPayload,
    startedAt: Date,
    completedAt: Date,
    context: RequestContext,
  ): Promise<void> {
    const target = await this.resolveIdosiStatisticsTarget(actor, scope.storeId);
    assertMemorySyncTimes(startedAt, completedAt);
    const key = memoryIdosiScopeKey(scope);
    const current = this.idosiStatisticsSnapshots.get(key);
    let snapshot = current;
    if (!current || payload.generatedAt >= current.payload.generatedAt) {
      snapshot = Object.freeze({
        id: current?.id ?? randomUUID(),
        storeId: scope.storeId,
        scopeKey: idosiStatisticsScopeKey(scope),
        payload: structuredClone(payload),
        firstSyncedAt: current?.firstSyncedAt ?? completedAt.toISOString(),
        lastSyncedAt: completedAt.toISOString(),
      });
      this.idosiStatisticsSnapshots.set(key, snapshot);
    }
    if (!snapshot) throw new Error('IDOSI memory snapshot was not created');
    const attempt: IdosiStatisticsAttempt = Object.freeze({
      id: randomUUID(),
      source: 'MANUAL',
      status: 'SUCCEEDED',
      errorCode: null,
      errorMessage: null,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
    });
    this.idosiStatisticsAttempts.set(key, attempt);
    this.appendAudit(
      actor,
      context,
      'IDOSI_STATISTICS_SYNC_SUCCEEDED',
      'idosi_statistics_snapshot',
      snapshot.id,
      null,
      {
        storeCode: target.storeCode,
        scopeKey: snapshot.scopeKey,
        source: 'MANUAL',
        sourceGeneratedAt: payload.generatedAt,
        orders: payload.totals.orders,
        revenueVnd: payload.totals.revenue,
      },
      { attemptId: attempt.id },
    );
  }

  public async recordIdosiStatisticsFailure(
    actor: AuthenticatedPrincipal,
    scope: IdosiStatisticsScope,
    errorCode: string,
    errorMessage: string,
    startedAt: Date,
    completedAt: Date,
    context: RequestContext,
  ): Promise<void> {
    const target = await this.resolveIdosiStatisticsTarget(actor, scope.storeId);
    assertMemorySyncTimes(startedAt, completedAt);
    const key = memoryIdosiScopeKey(scope);
    const attempt: IdosiStatisticsAttempt = Object.freeze({
      id: randomUUID(),
      source: 'MANUAL',
      status: 'FAILED',
      errorCode: boundedMemorySyncText(errorCode, 100, 'IDOSI_SYNC_FAILED'),
      errorMessage: boundedMemorySyncText(errorMessage, 1_000, 'Đồng bộ IDOSI thất bại.'),
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
    });
    this.idosiStatisticsAttempts.set(key, attempt);
    this.appendAudit(
      actor,
      context,
      'IDOSI_STATISTICS_SYNC_FAILED',
      'idosi_statistics_sync_attempt',
      attempt.id,
      null,
      {
        storeCode: target.storeCode,
        scopeKey: idosiStatisticsScopeKey(scope),
        source: 'MANUAL',
        errorCode: attempt.errorCode,
      },
    );
  }

  public async listOrderSessions(query: ListOrderSessionsQuery): Promise<Page<OrderSession>> {
    const values = [...this.orderSessions.values()]
      .filter((session) => query.status === undefined || session.status === query.status)
      .filter((session) => query.dateFrom === undefined || session.businessDate >= query.dateFrom)
      .filter((session) => query.dateTo === undefined || session.businessDate <= query.dateTo)
      .sort((left, right) => right.businessDate.localeCompare(left.businessDate));
    return {
      data: slicePage(values, query.page, query.pageSize),
      pagination: pagination(query.page, query.pageSize, values.length),
    };
  }

  public async listAllocations(
    actor: AuthenticatedPrincipal,
    query: ListAllocationsQuery,
  ): Promise<Page<AllocationResult>> {
    if (query.storeId !== undefined && !canAccessStore(actor, query.storeId)) throw forbidden();
    const values = [...this.allocationResults.values()]
      .filter((result) => canAccessStore(actor, result.storeId))
      .filter((result) => query.sessionId === undefined || result.sessionId === query.sessionId)
      .filter((result) => query.storeId === undefined || result.storeId === query.storeId)
      .filter((result) => query.productId === undefined || result.productId === query.productId)
      .filter((result) => query.status === undefined || result.status === query.status)
      .filter((result) => query.priority === undefined || result.priority === query.priority)
      .sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id),
      );
    return {
      data: slicePage(values, query.page, query.pageSize).map((result) => structuredClone(result)),
      pagination: pagination(query.page, query.pageSize, values.length),
    };
  }

  public async createOrderSession(
    actor: AuthenticatedPrincipal,
    input: CreateOrderSessionRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<OrderSession>> {
    requireMemoryAdmin(actor);
    const scopedKey = `${actor.accountId}:order-session:create:${idempotencyKey}`;
    const replay = this.replaySessionMutation(scopedKey, requestHash);
    if (replay) return { data: replay, replayed: true };
    if (
      [...this.orderSessions.values()].some(
        (session) => session.businessDate === input.businessDate && session.status !== 'CANCELLED',
      )
    ) {
      throw conflict('Ngày nghiệp vụ đã có một phiên đặt hàng đang hoạt động');
    }
    const now = this.now().toISOString();
    const created: OrderSession = {
      id: randomUUID(),
      businessDate: input.businessDate,
      status: 'SCHEDULED',
      requestOpensAt: input.requestOpensAt,
      requestClosesAt: input.requestClosesAt,
      allocationStartsAt: input.allocationStartsAt,
      policyVersion: input.policyVersion,
      version: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.orderSessions.set(created.id, created);
    this.rememberSessionMutation(scopedKey, requestHash, created);
    this.appendAudit(
      actor,
      context,
      'ORDER_SESSION_CREATED',
      'order_session',
      created.id,
      null,
      created,
    );
    return { data: structuredClone(created), replayed: false };
  }

  public async transitionOrderSession(
    actor: AuthenticatedPrincipal,
    sessionId: string,
    input: TransitionOrderSessionRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<OrderSession>> {
    requireMemoryAdmin(actor);
    const scopedKey = `${actor.accountId}:order-session:transition:${sessionId}:${idempotencyKey}`;
    const replay = this.replaySessionMutation(scopedKey, requestHash);
    if (replay) return { data: replay, replayed: true };
    const current = this.orderSessions.get(sessionId);
    if (!current) throw notFound('Không tìm thấy phiên đặt hàng');
    if (current.version !== input.expectedVersion) throw versionConflict();
    const allowed =
      (current.status === 'SCHEDULED' && ['OPEN', 'CANCELLED'].includes(input.status)) ||
      (current.status === 'OPEN' && ['OPEN', 'CLOSED', 'CANCELLED'].includes(input.status)) ||
      (current.status === 'CLOSED' && ['CLOSED', 'CANCELLED'].includes(input.status));
    if (!allowed) {
      throw new ApiError(
        'INVALID_STATE_TRANSITION',
        `Không thể chuyển phiên từ ${current.status} sang ${input.status}`,
        409,
      );
    }
    const now = this.now();
    if (
      input.status === 'OPEN' &&
      (now.getTime() < Date.parse(current.requestOpensAt) ||
        now.getTime() >= Date.parse(current.requestClosesAt))
    ) {
      throw new ApiError(
        'INVALID_STATE_TRANSITION',
        'Phiên nằm ngoài thời gian nhận yêu cầu đã cấu hình',
        409,
      );
    }
    const updated: OrderSession =
      current.status === input.status
        ? current
        : {
            ...current,
            status: input.status,
            version: current.version + 1,
            updatedAt: now.toISOString(),
          };
    this.orderSessions.set(updated.id, updated);
    this.rememberSessionMutation(scopedKey, requestHash, updated);
    if (updated !== current) {
      this.appendAudit(
        actor,
        context,
        `ORDER_SESSION_${input.status}`,
        'order_session',
        updated.id,
        current,
        updated,
        input.reason ? { reason: input.reason } : {},
      );
    }
    return { data: structuredClone(updated), replayed: false };
  }

  public async createWarehouseAdjustment(
    actor: AuthenticatedPrincipal,
    input: CreateWarehouseAdjustmentRequest,
    _idempotencyKey: string,
    _context: RequestContext,
  ): Promise<WarehouseAdjustment> {
    if (actor.role !== 'ADMIN') throw forbidden('Chỉ Admin được điều chỉnh kho tổng');
    const now = this.now().toISOString();
    const adjustment: WarehouseAdjustment = {
      id: `adj-${randomUUID()}`,
      direction: input.direction,
      reasonCode: input.reasonCode,
      reason: input.reason,
      lines: [],
      createdByAccountId: actor.accountId,
      createdAt: now,
    };
    for (const line of input.lines) {
      const balance = this.warehouseBalances.get(line.productId) ?? {
        onHandQuantity: 0,
        reservedQuantity: 0,
        version: 0,
        updatedAt: now,
      };
      const delta = input.direction === 'INCREASE' ? 1 : -1;
      const quantity =
        line.amount.kind === 'UNIT' ? line.amount.quantity : Math.round(Number(line.amount.value));
      const onHandQuantity = balance.onHandQuantity + delta * quantity;
      if (onHandQuantity < 0) throw conflict('Warehouse adjustment would produce negative stock.');
      this.warehouseBalances.set(line.productId, {
        onHandQuantity,
        reservedQuantity: balance.reservedQuantity,
        version: balance.version + 1,
        updatedAt: now,
      });
    }
    return adjustment;
  }

  public async listWarehouseBalances(
    actor: AuthenticatedPrincipal,
  ): Promise<WarehouseBalancesResponse> {
    this.assertWarehouseActor(actor);
    const asOf = this.now().toISOString();
    return {
      data: [...this.products.values()]
        .sort((left, right) => left.sku.localeCompare(right.sku))
        .map((product) => {
          const balance = this.warehouseBalances.get(product.id) ?? {
            onHandQuantity: 0,
            reservedQuantity: 0,
            version: 0,
            updatedAt: asOf,
          };
          return {
            productId: product.id,
            available: {
              kind: 'UNIT' as const,
              quantity: balance.onHandQuantity - balance.reservedQuantity,
            },
            reserved: { kind: 'UNIT' as const, quantity: balance.reservedQuantity },
            version: balance.version,
            updatedAt: balance.updatedAt,
          };
        }),
      asOf,
    };
  }

  public async listInboundReceipts(
    actor: AuthenticatedPrincipal,
    query: ListInboundReceiptsQuery,
  ): Promise<Page<InboundReceipt>> {
    this.assertWarehouseActor(actor);
    const supplier = query.supplier?.toLocaleLowerCase('vi-VN');
    const values = [...this.inboundReceipts.values()]
      .filter((receipt) => query.status === undefined || receipt.status === query.status)
      .filter(
        (receipt) => query.receivedFrom === undefined || receipt.receivedAt >= query.receivedFrom,
      )
      .filter((receipt) => query.receivedTo === undefined || receipt.receivedAt <= query.receivedTo)
      .filter(
        (receipt) =>
          supplier === undefined ||
          receipt.supplierName.toLocaleLowerCase('vi-VN').includes(supplier),
      )
      .sort(
        (left, right) =>
          right.receivedAt.localeCompare(left.receivedAt) || right.id.localeCompare(left.id),
      );
    return {
      data: structuredClone(slicePage(values, query.page, query.pageSize)),
      pagination: pagination(query.page, query.pageSize, values.length),
    };
  }

  public async getInboundReceipt(
    actor: AuthenticatedPrincipal,
    receiptId: string,
  ): Promise<InboundReceipt> {
    this.assertWarehouseActor(actor);
    const receipt = this.inboundReceipts.get(receiptId);
    if (!receipt) throw notFound('Không tìm thấy phiếu nhập nhà cung cấp');
    return structuredClone(receipt);
  }

  public async receiveSupplierInbound(
    actor: AuthenticatedPrincipal,
    input: CreateInboundReceiptRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<InboundReceipt>> {
    this.assertWarehouseActor(actor);
    const scopedKey = `${actor.accountId}:supplier-inbound:receive:${idempotencyKey}`;
    const replay = this.replayInboundReceipt(scopedKey, requestHash);
    if (replay) return { data: replay, replayed: true };
    if (
      [...this.inboundReceipts.values()].some(
        (receipt) => receipt.referenceCode === input.referenceCode,
      )
    ) {
      throw conflict('Mã tham chiếu phiếu nhập đã tồn tại');
    }
    const existingBagCodes = new Set(
      [...this.inboundReceipts.values()].flatMap((receipt) =>
        receipt.bags.map((bag) => bag.bagCode),
      ),
    );
    if (input.bags.some((bag) => existingBagCodes.has(bag.bagCode))) {
      throw conflict('Mã bao đã tồn tại trong phiếu nhập khác');
    }
    for (const bag of input.bags) {
      const product = this.products.get(bag.productId);
      if (!product || product.status !== 'ACTIVE') {
        throw notFound('Phiếu nhập chứa mặt hàng không hoạt động');
      }
    }

    const now = this.now().toISOString();
    const id = randomUUID();
    const totalWeightGrams = input.bags.reduce(
      (total, bag) => total + kilogramsToGramsExact(bag.weightKg),
      0n,
    );
    const receipt: InboundReceipt = {
      id,
      referenceCode: input.referenceCode,
      supplierName: input.supplierName,
      status: 'COST_PENDING',
      bags: input.bags.map((bag) => ({
        id: randomUUID(),
        receiptId: id,
        productId: bag.productId,
        bagCode: bag.bagCode,
        weightKg: gramsToKilogramsExact(kilogramsToGramsExact(bag.weightKg)),
        createdAt: now,
      })),
      totalWeightKg: gramsToKilogramsExact(totalWeightGrams),
      cost: null,
      version: 0,
      receivedByAccountId: actor.accountId,
      receivedAt: input.receivedAt,
      createdAt: now,
      updatedAt: now,
    };

    const quantityByProduct = new Map<string, number>();
    for (const bag of input.bags) {
      quantityByProduct.set(bag.productId, (quantityByProduct.get(bag.productId) ?? 0) + 1);
    }
    for (const [productId, quantity] of quantityByProduct) {
      const current = this.warehouseBalances.get(productId) ?? {
        onHandQuantity: 0,
        reservedQuantity: 0,
        version: 0,
        updatedAt: now,
      };
      this.warehouseBalances.set(productId, {
        ...current,
        onHandQuantity: current.onHandQuantity + quantity,
        version: current.version + 1,
        updatedAt: now,
      });
    }
    this.inboundReceipts.set(id, receipt);
    this.rememberInboundReceipt(scopedKey, requestHash, receipt);
    this.appendAudit(
      actor,
      context,
      'SUPPLIER_INBOUND_RECEIVED',
      'supplier_inbound_receipt',
      id,
      null,
      receipt,
      { bagCount: receipt.bags.length },
    );
    return { data: structuredClone(receipt), replayed: false };
  }

  public async confirmSupplierInboundCosts(
    actor: AuthenticatedPrincipal,
    receiptId: string,
    input: ConfirmReceiptCostsRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<InboundReceipt>> {
    this.assertWarehouseActor(actor);
    const scopedKey = `${actor.accountId}:supplier-inbound:cost:${receiptId}:${idempotencyKey}`;
    const replay = this.replayInboundReceipt(scopedKey, requestHash);
    if (replay) return { data: replay, replayed: true };
    const current = this.inboundReceipts.get(receiptId);
    if (!current) throw notFound('Không tìm thấy phiếu nhập nhà cung cấp');
    if (current.version !== input.expectedVersion) throw versionConflict();
    if (current.status !== 'COST_PENDING') {
      throw new ApiError('INVALID_STATE_TRANSITION', 'Phiếu nhập không còn chờ chốt chi phí', 409);
    }
    const receiptProductIds = new Set(current.bags.map((bag) => bag.productId));
    const suppliedProductIds = new Set(input.productCosts.map((cost) => cost.productId));
    if (
      receiptProductIds.size !== suppliedProductIds.size ||
      [...receiptProductIds].some((productId) => !suppliedProductIds.has(productId))
    ) {
      throw new ApiError(
        'VALIDATION_ERROR',
        'Chi phí phải bao gồm đúng mỗi mặt hàng trong phiếu nhập',
        400,
      );
    }
    const priceByProduct = new Map(
      input.productCosts.map((cost) => [cost.productId, BigInt(cost.priceVndPerKg)]),
    );
    const goodsCostVnd = current.bags.reduce((total, bag) => {
      const price = priceByProduct.get(bag.productId);
      if (price === undefined) throw new Error('Validated supplier cost lost a product price.');
      return total + calculateWeightedCostVnd(bag.weightKg, price);
    }, 0n);
    const totalCostVnd =
      goodsCostVnd + BigInt(input.transportationFeeVnd) + BigInt(input.handlingFeeVnd);
    if (
      goodsCostVnd > BigInt(Number.MAX_SAFE_INTEGER) ||
      totalCostVnd > BigInt(Number.MAX_SAFE_INTEGER)
    ) {
      throw new ApiError('VALIDATION_ERROR', 'Tổng chi phí vượt giới hạn VND an toàn', 400);
    }
    const now = this.now().toISOString();
    const updated: InboundReceipt = {
      ...current,
      status: 'COST_CONFIRMED',
      cost: {
        productCosts: input.productCosts,
        transportationFeeVnd: input.transportationFeeVnd,
        handlingFeeVnd: input.handlingFeeVnd,
        goodsCostVnd: Number(goodsCostVnd),
        totalCostVnd: Number(totalCostVnd),
        confirmedByAccountId: actor.accountId,
        confirmedAt: now,
      },
      version: current.version + 1,
      updatedAt: now,
    };
    this.inboundReceipts.set(receiptId, updated);
    this.rememberInboundReceipt(scopedKey, requestHash, updated);
    this.appendAudit(
      actor,
      context,
      'SUPPLIER_INBOUND_COST_CONFIRMED',
      'supplier_inbound_receipt',
      receiptId,
      current,
      updated,
    );
    return { data: structuredClone(updated), replayed: false };
  }

  public async cancelSupplierInbound(
    actor: AuthenticatedPrincipal,
    receiptId: string,
    input: CancelInboundReceiptRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<InboundReceipt>> {
    this.assertWarehouseActor(actor);
    const scopedKey = `${actor.accountId}:supplier-inbound:cancel:${receiptId}:${idempotencyKey}`;
    const replay = this.replayInboundReceipt(scopedKey, requestHash);
    if (replay) return { data: replay, replayed: true };
    const current = this.inboundReceipts.get(receiptId);
    if (!current) throw notFound('Không tìm thấy phiếu nhập nhà cung cấp');
    if (current.version !== input.expectedVersion) throw versionConflict();
    if (current.status !== 'COST_PENDING') {
      throw new ApiError(
        'INVALID_STATE_TRANSITION',
        'Chỉ phiếu đang chờ chốt chi phí mới có thể hủy',
        409,
      );
    }
    const quantityByProduct = new Map<string, number>();
    for (const bag of current.bags) {
      quantityByProduct.set(bag.productId, (quantityByProduct.get(bag.productId) ?? 0) + 1);
    }
    for (const [productId, quantity] of quantityByProduct) {
      const balance = this.warehouseBalances.get(productId);
      if (!balance || balance.onHandQuantity - quantity < balance.reservedQuantity) {
        throw conflict('Đã có tồn kho được giữ hoặc sử dụng; không thể hủy phiếu');
      }
    }
    const now = this.now().toISOString();
    for (const [productId, quantity] of quantityByProduct) {
      const balance = this.warehouseBalances.get(productId);
      if (!balance) throw new Error('Validated warehouse balance disappeared.');
      this.warehouseBalances.set(productId, {
        ...balance,
        onHandQuantity: balance.onHandQuantity - quantity,
        version: balance.version + 1,
        updatedAt: now,
      });
    }
    const updated: InboundReceipt = {
      ...current,
      status: 'CANCELLED',
      version: current.version + 1,
      updatedAt: now,
    };
    this.inboundReceipts.set(receiptId, updated);
    this.rememberInboundReceipt(scopedKey, requestHash, updated);
    this.appendAudit(
      actor,
      context,
      'SUPPLIER_INBOUND_CANCELLED',
      'supplier_inbound_receipt',
      receiptId,
      current,
      updated,
      { reason: input.reason },
    );
    return { data: structuredClone(updated), replayed: false };
  }

  public async listProducts(query: ListProductsQuery): Promise<Page<Product>> {
    const search = query.search?.toLocaleLowerCase('vi-VN');
    const values = [...this.products.values()]
      .filter((product) => query.status === undefined || product.status === query.status)
      .filter(
        (product) => query.measurement === undefined || product.measurement === query.measurement,
      )
      .filter(
        (product) =>
          search === undefined ||
          product.name.toLocaleLowerCase('vi-VN').includes(search) ||
          product.sku.toLocaleLowerCase('en-US').includes(search),
      )
      .sort((left, right) => left.sku.localeCompare(right.sku));
    return {
      data: slicePage(values, query.page, query.pageSize),
      pagination: pagination(query.page, query.pageSize, values.length),
    };
  }

  public async createProduct(
    actor: AuthenticatedPrincipal,
    input: CreateProductRequest,
    context: RequestContext,
  ): Promise<Product> {
    if ([...this.products.values()].some((product) => product.sku === input.sku)) {
      throw conflict('Mã SKU đã tồn tại');
    }
    const now = this.now().toISOString();
    const product: Product = {
      id: randomUUID(),
      ...input,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };
    this.products.set(product.id, product);
    this.appendAudit(actor, context, 'PRODUCT_CREATED', 'product', product.id, null, product);
    return product;
  }

  public async updateProduct(
    actor: AuthenticatedPrincipal,
    productId: string,
    input: UpdateProductRequest,
    context: RequestContext,
  ): Promise<Product> {
    const current = this.products.get(productId);
    if (!current) throw notFound('Không tìm thấy mặt hàng');
    const updated: Product = {
      ...current,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.unitLabel !== undefined ? { unitLabel: input.unitLabel } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      updatedAt: this.now().toISOString(),
    };
    this.products.set(productId, updated);
    this.appendAudit(actor, context, 'PRODUCT_UPDATED', 'product', productId, current, updated);
    return updated;
  }

  public async listProductConversions(
    productId: string,
    query: ListProductConversionsQuery,
  ): Promise<Page<ProductConversion>> {
    if (!this.products.has(productId)) throw notFound('Không tìm thấy mặt hàng');
    const values = [...this.productConversions.values()]
      .filter((conversion) => conversion.productId === productId)
      .filter(
        (conversion) =>
          query.includeRetired || query.effectiveAt !== undefined || conversion.retiredAt === null,
      )
      .filter(
        (conversion) =>
          query.effectiveAt === undefined ||
          (conversion.effectiveFrom <= query.effectiveAt &&
            (conversion.effectiveTo === null || query.effectiveAt < conversion.effectiveTo)),
      )
      .sort((left, right) => right.version - left.version);
    return {
      data: slicePage(values, query.page, query.pageSize),
      pagination: pagination(query.page, query.pageSize, values.length),
    };
  }

  public async listAllProductConversions(
    query: ListProductConversionsQuery,
  ): Promise<Page<ProductConversion>> {
    const values = [...this.productConversions.values()]
      .filter(
        (conversion) =>
          query.includeRetired || query.effectiveAt !== undefined || conversion.retiredAt === null,
      )
      .filter(
        (conversion) =>
          query.effectiveAt === undefined ||
          (conversion.effectiveFrom <= query.effectiveAt &&
            (conversion.effectiveTo === null || query.effectiveAt < conversion.effectiveTo)),
      )
      .sort(
        (left, right) =>
          left.productId.localeCompare(right.productId) || right.version - left.version,
      );
    return {
      data: slicePage(values, query.page, query.pageSize),
      pagination: pagination(query.page, query.pageSize, values.length),
    };
  }

  public async createProductConversion(
    actor: AuthenticatedPrincipal,
    productId: string,
    input: CreateProductConversionRequest,
    context: RequestContext,
  ): Promise<ProductConversion> {
    if (!this.products.has(productId)) throw notFound('Không tìm thấy mặt hàng');
    const latest = [...this.productConversions.values()]
      .filter((item) => item.productId === productId)
      .sort((left, right) => right.version - left.version)[0];
    if (!latest && input.expectedVersion !== undefined && input.expectedVersion !== 0) {
      throw new ApiError('VERSION_CONFLICT', 'Phiên bản tỷ lệ quy đổi đã thay đổi', 409);
    }
    if (latest) {
      if (input.expectedVersion !== latest.version) {
        throw new ApiError('VERSION_CONFLICT', 'Phiên bản tỷ lệ quy đổi đã thay đổi', 409);
      }
      if (latest.retiredAt === null) {
        throw conflict(
          'Tỷ lệ quy đổi hiện tại vẫn hoạt động; hãy tạo phiên bản kế tiếp bằng PATCH',
        );
      }
      if (
        input.effectiveFrom <= latest.effectiveFrom ||
        (latest.effectiveTo !== null && input.effectiveFrom < latest.effectiveTo)
      ) {
        throw new ApiError(
          'VALIDATION_ERROR',
          'Ngày hiệu lực phải sau phiên bản gần nhất và không trước ngày phiên bản đó kết thúc',
          400,
        );
      }
    }
    const conversion: ProductConversion = {
      id: randomUUID(),
      productId,
      version: (latest?.version ?? 0) + 1,
      itemQuantity: input.itemQuantity,
      weightKilograms: input.weightKilograms,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      reason: input.reason,
      createdByAccountId: actor.accountId,
      createdAt: this.now().toISOString(),
      retiredAt: null,
      retiredByAccountId: null,
      retirementReason: null,
    };
    this.productConversions.set(conversion.id, conversion);
    this.appendAudit(
      actor,
      context,
      latest ? 'PRODUCT_CONVERSION_APPENDED' : 'PRODUCT_CONVERSION_CREATED',
      'product_conversion',
      conversion.id,
      latest ?? null,
      conversion,
    );
    return conversion;
  }

  public async replaceProductConversion(
    actor: AuthenticatedPrincipal,
    productId: string,
    conversionId: string,
    input: UpdateProductConversionRequest,
    context: RequestContext,
  ): Promise<ProductConversion> {
    const current = this.productConversions.get(conversionId);
    if (!current || current.productId !== productId) throw notFound('Không tìm thấy tỷ lệ quy đổi');
    if (current.version !== input.expectedVersion) {
      throw new ApiError('VERSION_CONFLICT', 'Phiên bản tỷ lệ quy đổi đã thay đổi', 409);
    }
    if (current.retiredAt !== null)
      throw conflict('Tỷ lệ quy đổi đã được thay thế hoặc ngừng dùng');
    if (input.effectiveFrom <= current.effectiveFrom) {
      throw new ApiError(
        'VALIDATION_ERROR',
        'Ngày hiệu lực của phiên bản mới phải sau phiên bản hiện tại',
        400,
      );
    }
    const retired: ProductConversion = {
      ...current,
      effectiveTo: input.effectiveFrom,
      retiredAt: this.now().toISOString(),
      retiredByAccountId: actor.accountId,
      retirementReason: input.reason,
    };
    const replacement: ProductConversion = {
      id: randomUUID(),
      productId,
      version: current.version + 1,
      itemQuantity: input.itemQuantity,
      weightKilograms: input.weightKilograms,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      reason: input.reason,
      createdByAccountId: actor.accountId,
      createdAt: this.now().toISOString(),
      retiredAt: null,
      retiredByAccountId: null,
      retirementReason: null,
    };
    this.productConversions.set(current.id, retired);
    this.productConversions.set(replacement.id, replacement);
    this.appendAudit(
      actor,
      context,
      'PRODUCT_CONVERSION_REPLACED',
      'product_conversion',
      replacement.id,
      current,
      replacement,
    );
    return replacement;
  }

  public async retireProductConversion(
    actor: AuthenticatedPrincipal,
    productId: string,
    conversionId: string,
    input: DeleteProductConversionRequest,
    context: RequestContext,
  ): Promise<ProductConversion> {
    const current = this.productConversions.get(conversionId);
    if (!current || current.productId !== productId) throw notFound('Không tìm thấy tỷ lệ quy đổi');
    if (current.version !== input.expectedVersion) {
      throw new ApiError('VERSION_CONFLICT', 'Phiên bản tỷ lệ quy đổi đã thay đổi', 409);
    }
    if (current.retiredAt !== null) return current;
    const retired: ProductConversion = {
      ...current,
      effectiveTo: retirementDate(current.effectiveFrom, this.now()),
      retiredAt: this.now().toISOString(),
      retiredByAccountId: actor.accountId,
      retirementReason: input.reason,
    };
    this.productConversions.set(current.id, retired);
    this.appendAudit(
      actor,
      context,
      'PRODUCT_CONVERSION_RETIRED',
      'product_conversion',
      current.id,
      current,
      retired,
    );
    return retired;
  }

  public async listStores(
    actor: AuthenticatedPrincipal,
    query: ListStoresQuery,
  ): Promise<Page<Store>> {
    const search = query.search?.toLocaleLowerCase('vi-VN');
    const values = [...this.stores.values()]
      .filter((store) => canAccessStore(actor, store.id))
      .filter((store) => query.status === undefined || store.status === query.status)
      .filter((store) => query.kind === undefined || store.kind === query.kind)
      .filter((store) => query.groupId === undefined || store.groupId === query.groupId)
      .filter(
        (store) =>
          search === undefined ||
          store.name.toLocaleLowerCase('vi-VN').includes(search) ||
          store.code.toLocaleLowerCase('en-US').includes(search),
      )
      .sort((left, right) => left.code.localeCompare(right.code));
    return {
      data: slicePage(values, query.page, query.pageSize),
      pagination: pagination(query.page, query.pageSize, values.length),
    };
  }

  public async listStoreGroups(
    actor: AuthenticatedPrincipal,
    query: ListStoreGroupsQuery,
  ): Promise<Page<StoreGroup>> {
    requireMemoryAdmin(actor);
    const search = query.search?.toLocaleLowerCase('vi-VN');
    const values = [...this.storeGroups.values()]
      .filter((group) => query.status === undefined || group.status === query.status)
      .filter(
        (group) =>
          search === undefined ||
          group.name.toLocaleLowerCase('vi-VN').includes(search) ||
          group.code.toLocaleLowerCase('en-US').includes(search),
      )
      .sort((left, right) => left.code.localeCompare(right.code));
    return {
      data: slicePage(values, query.page, query.pageSize),
      pagination: pagination(query.page, query.pageSize, values.length),
    };
  }

  public async createStoreGroup(
    actor: AuthenticatedPrincipal,
    input: CreateStoreGroupRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<StoreGroup>> {
    requireMemoryAdmin(actor);
    const replay = this.replayStoreLifecycle<StoreGroup>(
      'STORE_GROUP_CREATE',
      actor,
      idempotencyKey,
      requestHash,
    );
    if (replay) return replay;
    if ([...this.storeGroups.values()].some((group) => group.code === input.code)) {
      throw conflict('Mã nhóm cửa hàng đã tồn tại');
    }
    const now = this.now().toISOString();
    const group: StoreGroup = {
      id: randomUUID(),
      code: input.code,
      name: input.name,
      status: 'ACTIVE',
      version: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.storeGroups.set(group.id, group);
    this.appendAudit(actor, context, 'STORE_GROUP_CREATED', 'store_group', group.id, null, group);
    this.rememberStoreLifecycle('STORE_GROUP_CREATE', actor, idempotencyKey, requestHash, group);
    return { data: group, replayed: false };
  }

  public async updateStoreGroup(
    actor: AuthenticatedPrincipal,
    groupId: string,
    input: UpdateStoreGroupRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<StoreGroup>> {
    requireMemoryAdmin(actor);
    const replay = this.replayStoreLifecycle<StoreGroup>(
      'STORE_GROUP_UPDATE',
      actor,
      idempotencyKey,
      requestHash,
    );
    if (replay) return replay;
    const current = this.storeGroups.get(groupId);
    if (!current) throw notFound('Không tìm thấy nhóm cửa hàng');
    if (current.version !== input.expectedVersion) throw storeLifecycleVersionConflict();
    if (
      input.status === 'INACTIVE' &&
      current.status !== 'INACTIVE' &&
      [...this.stores.values()].some(
        (store) => store.groupId === groupId && store.status === 'ACTIVE',
      )
    ) {
      throw conflict('Không thể vô hiệu hóa nhóm còn cửa hàng hoạt động');
    }
    const updated: StoreGroup = {
      ...current,
      name: input.name ?? current.name,
      status: input.status ?? current.status,
      version: current.version + 1,
      updatedAt: this.now().toISOString(),
    };
    this.storeGroups.set(groupId, updated);
    this.appendAudit(
      actor,
      context,
      'STORE_GROUP_UPDATED',
      'store_group',
      groupId,
      current,
      updated,
    );
    this.rememberStoreLifecycle('STORE_GROUP_UPDATE', actor, idempotencyKey, requestHash, updated);
    return { data: updated, replayed: false };
  }

  public async createStore(
    actor: AuthenticatedPrincipal,
    input: CreateStoreRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<Store>> {
    requireMemoryAdmin(actor);
    const replay = this.replayStoreLifecycle<Store>(
      'STORE_CREATE',
      actor,
      idempotencyKey,
      requestHash,
    );
    if (replay) return replay;
    const group = this.storeGroups.get(input.groupId);
    if (!group || group.status !== 'ACTIVE') {
      throw new ApiError('VALIDATION_ERROR', 'Cửa hàng phải thuộc một nhóm hợp lệ', 400, {
        field: 'groupId',
      });
    }
    if ([...this.stores.values()].some((store) => store.code === input.code)) {
      throw conflict('Mã cửa hàng đã tồn tại');
    }
    const now = this.now().toISOString();
    const store: Store = {
      id: randomUUID(),
      code: input.code,
      name: input.name,
      groupId: input.groupId,
      kind: input.kind,
      address: input.address,
      status: 'ACTIVE',
      version: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.stores.set(store.id, store);
    this.appendAudit(actor, context, 'STORE_CREATED', 'store', store.id, null, store);
    this.rememberStoreLifecycle('STORE_CREATE', actor, idempotencyKey, requestHash, store);
    return { data: store, replayed: false };
  }

  public async updateStore(
    actor: AuthenticatedPrincipal,
    storeId: string,
    input: UpdateStoreRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<Store>> {
    requireMemoryAdmin(actor);
    const replay = this.replayStoreLifecycle<Store>(
      'STORE_UPDATE',
      actor,
      idempotencyKey,
      requestHash,
    );
    if (replay) return replay;
    const current = this.stores.get(storeId);
    if (!current) throw notFound('Không tìm thấy cửa hàng');
    if (current.version !== input.expectedVersion) throw storeLifecycleVersionConflict();
    const targetGroup = this.storeGroups.get(input.groupId ?? current.groupId);
    const targetStatus = input.status ?? current.status;
    if (
      !targetGroup ||
      ((input.groupId !== undefined || targetStatus === 'ACTIVE') &&
        targetGroup.status !== 'ACTIVE')
    ) {
      throw new ApiError(
        'VALIDATION_ERROR',
        'Cửa hàng hoạt động phải thuộc một nhóm đang hoạt động',
        400,
        { field: 'groupId' },
      );
    }
    const updated: Store = {
      ...current,
      name: input.name ?? current.name,
      groupId: input.groupId ?? current.groupId,
      kind: input.kind ?? current.kind,
      status: targetStatus,
      address: input.address === undefined ? current.address : input.address,
      version: current.version + 1,
      updatedAt: this.now().toISOString(),
    };
    this.stores.set(storeId, updated);
    this.appendAudit(actor, context, 'STORE_UPDATED', 'store', storeId, current, updated);
    this.rememberStoreLifecycle('STORE_UPDATE', actor, idempotencyKey, requestHash, updated);
    return { data: updated, replayed: false };
  }

  public async listOrderRequests(
    actor: AuthenticatedPrincipal,
    query: ListStoreOrderRequestsQuery,
  ): Promise<Page<StoreOrderRequest>> {
    if (query.storeId !== undefined && !canAccessStore(actor, query.storeId)) throw forbidden();
    const values = [...this.orderRequests.values()]
      .filter((request) => canAccessStore(actor, request.storeId))
      .filter((request) => query.storeId === undefined || request.storeId === query.storeId)
      .filter((request) => query.sessionId === undefined || request.sessionId === query.sessionId)
      .filter((request) => query.status === undefined || request.status === query.status)
      .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));
    return {
      data: slicePage(values, query.page, query.pageSize),
      pagination: pagination(query.page, query.pageSize, values.length),
    };
  }

  public async submitOrderRequest(
    actor: AuthenticatedPrincipal,
    input: CreateStoreOrderRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<SubmittedOrderRequest> {
    if (actor.role === 'STORE') await this.authorizeRetailStoreOperation(actor);
    if (!canAccessStore(actor, input.storeId))
      throw forbidden('Không có quyền gửi cho cửa hàng này');
    const targetStore = this.stores.get(input.storeId);
    if (!targetStore) throw notFound('Không tìm thấy cửa hàng');
    if (targetStore.status !== 'ACTIVE') throw forbidden();
    const session = this.orderSessions.get(input.businessSessionId);
    if (
      !session ||
      session.status !== 'OPEN' ||
      Date.parse(session.requestClosesAt) <= this.now().getTime()
    ) {
      throw new ApiError('SESSION_NOT_OPEN', 'Phiên đặt hàng chưa mở hoặc đã đóng', 409);
    }
    for (const item of input.items) {
      const product = this.products.get(item.productId);
      if (!product || product.status !== 'ACTIVE')
        throw notFound('Có mặt hàng không tồn tại hoặc đã ngừng dùng');
    }

    const scopedKey = `${actor.accountId}:${idempotencyKey}`;
    const previous = this.idempotency.get(scopedKey);
    if (previous) {
      if (previous.requestHash !== requestHash) {
        throw new ApiError(
          'IDEMPOTENCY_CONFLICT',
          'Khóa idempotency đã được dùng cho nội dung khác',
          409,
        );
      }
      return { data: previous.response, replayed: true };
    }

    // No await occurs between counting and insertion: this is one atomic event-loop turn.
    const existing = [...this.orderRequests.values()].filter(
      (request) =>
        request.sessionId === input.businessSessionId && request.storeId === input.storeId,
    );
    if (existing.length >= 2) {
      throw new ApiError(
        'REQUEST_LIMIT_REACHED',
        'Mỗi cửa hàng chỉ được gửi tối đa hai yêu cầu trong một phiên',
        409,
      );
    }

    const now = this.now().toISOString();
    const request: StoreOrderRequest = {
      id: randomUUID(),
      sessionId: input.businessSessionId,
      storeId: input.storeId,
      requestSequence: existing.some((item) => item.requestSequence === 1) ? 2 : 1,
      status: 'SUBMITTED',
      lines: input.items.map((item) => ({
        productId: item.productId,
        requested: { kind: 'UNIT', quantity: item.quantity },
        priority: 'P1',
        ...(item.note ? { note: item.note } : {}),
      })),
      submittedByAccountId: actor.accountId,
      submittedAt: now,
      cancelledAt: null,
      cancellationReason: null,
    };
    this.orderRequests.set(request.id, request);
    this.idempotency.set(scopedKey, { requestHash, response: request });
    this.appendAudit(
      actor,
      context,
      'ORDER_REQUEST_SUBMITTED',
      'order_request',
      request.id,
      null,
      request,
    );
    return { data: request, replayed: false };
  }

  public async cancelOrderRequest(
    actor: AuthenticatedPrincipal,
    requestId: string,
    input: CancelStoreOrderRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<StoreOrderRequest>> {
    const scopedKey = `${actor.accountId}:order-request:cancel:${requestId}:${idempotencyKey}`;
    const previous = this.idempotency.get(scopedKey);
    if (previous) {
      if (previous.requestHash !== requestHash) {
        throw new ApiError(
          'IDEMPOTENCY_CONFLICT',
          'Khóa idempotency đã được dùng cho nội dung khác',
          409,
        );
      }
      return { data: structuredClone(previous.response), replayed: true };
    }

    const current = this.orderRequests.get(requestId);
    if (!current) throw notFound('Không tìm thấy yêu cầu đặt hàng');
    if (!canAccessStore(actor, current.storeId)) throw forbidden();
    if (current.status !== 'SUBMITTED') {
      throw conflict('Chỉ có thể hủy yêu cầu chưa được gộp hoặc phân bổ');
    }

    const session = this.orderSessions.get(current.sessionId);
    const now = this.now();
    if (
      !session ||
      session.status !== 'OPEN' ||
      isRequestDeadlineClosed(new Date(session.requestClosesAt), now)
    ) {
      throw conflict('Đã quá thời hạn hủy yêu cầu trong phiên đặt hàng');
    }

    const updated: StoreOrderRequest = {
      ...current,
      status: 'CANCELLED',
      cancelledAt: now.toISOString(),
      cancellationReason: input.reason,
    };
    this.orderRequests.set(requestId, updated);
    this.idempotency.set(scopedKey, { requestHash, response: updated });
    this.appendAudit(
      actor,
      context,
      'ORDER_REQUEST_CANCELLED',
      'order_request',
      requestId,
      current,
      updated,
      { reason: input.reason },
    );
    return { data: structuredClone(updated), replayed: false };
  }

  public async listWarehouseOutboundRequests(
    actor: AuthenticatedPrincipal,
    query: ListWarehouseOutboundRequestsQuery,
  ): Promise<Page<WarehouseOutboundRequest>> {
    if (query.storeId !== undefined && !canAccessStore(actor, query.storeId)) throw forbidden();
    const values = [...this.dispatchedOutbounds.values()]
      .filter((outbound) => canAccessStore(actor, outbound.storeId))
      .filter((outbound) => query.storeId === undefined || outbound.storeId === query.storeId)
      .filter((outbound) => query.status === undefined || outbound.status === query.status)
      .filter(
        (outbound) =>
          query.allocationRunId === undefined || outbound.allocationRunId === query.allocationRunId,
      )
      .sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
      )
      .map((outbound) => structuredClone(outbound));
    return {
      data: slicePage(values, query.page, query.pageSize),
      pagination: pagination(query.page, query.pageSize, values.length),
    };
  }

  public async dispatchWarehouseOutboundRequest(
    actor: AuthenticatedPrincipal,
    outboundRequestId: string,
    input: DispatchWarehouseOutboundRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<WarehouseOutboundRequest>> {
    if (actor.role === 'STORE') throw forbidden();
    const scopedKey = `${actor.accountId}:warehouse-outbound:dispatch:${outboundRequestId}:${idempotencyKey}`;
    const replay = this.replayWarehouseOutboundMutation(scopedKey, requestHash);
    if (replay) return { data: replay, replayed: true };
    const current = this.dispatchedOutbounds.get(outboundRequestId);
    if (!current) throw notFound('Không tìm thấy lệnh xuất kho');
    if (!canAccessStore(actor, current.storeId)) throw forbidden();
    if (current.status !== 'RESERVED' || current.version !== input.expectedVersion) {
      throw versionConflict();
    }
    if (
      current.lines.some(
        (line) =>
          line.approvedUnits <= 0 ||
          line.reservedUnits !== line.approvedUnits ||
          line.dispatchedUnits !== 0,
      )
    ) {
      throw new ApiError(
        'INVALID_STATE_TRANSITION',
        'Lệnh xuất chưa được giữ đủ hàng để giao',
        409,
      );
    }
    const now = this.now().toISOString();
    const updated: WarehouseOutboundRequest = {
      ...current,
      status: 'DISPATCHED',
      dispatchedByAccountId: actor.accountId,
      lines: current.lines.map((line) => ({
        ...line,
        dispatchedUnits: line.approvedUnits,
      })),
      version: current.version + 1,
      notes: input.dispatchNote ?? current.notes,
      dispatchedAt: now,
      updatedAt: now,
    };
    this.dispatchedOutbounds.set(updated.id, updated);
    this.rememberWarehouseOutboundMutation(scopedKey, requestHash, updated);
    this.appendAudit(
      actor,
      context,
      'OUTBOUND_REQUEST_DISPATCHED',
      'outbound_request',
      updated.id,
      current,
      updated,
      input.dispatchNote ? { dispatchNote: input.dispatchNote } : {},
    );
    return { data: structuredClone(updated), replayed: false };
  }

  public async listStoreReceiptSources(
    actor: AuthenticatedPrincipal,
    query: ListStoreReceiptSourcesQuery,
  ): Promise<Page<StoreReceiptSource>> {
    if (query.storeId !== undefined && !canAccessStore(actor, query.storeId)) throw forbidden();
    const declaredOutboundIds = new Set(
      [...this.receipts.values()].map((receipt) => receipt.outboundRequestId),
    );
    const values = [...this.dispatchedOutbounds.entries()]
      .filter(([outboundRequestId]) => !declaredOutboundIds.has(outboundRequestId))
      .filter(([, outbound]) => outbound.status === 'DISPATCHED')
      .filter(([, outbound]) => canAccessStore(actor, outbound.storeId))
      .filter(([, outbound]) => query.storeId === undefined || outbound.storeId === query.storeId)
      .sort(
        ([leftId, left], [rightId, right]) =>
          (right.dispatchedAt ?? '').localeCompare(left.dispatchedAt ?? '') ||
          rightId.localeCompare(leftId),
      )
      .map(([id, outbound]): StoreReceiptSource => ({
        id,
        requestNumber: outbound.requestNumber,
        storeId: outbound.storeId,
        dispatchedAt: outbound.dispatchedAt!,
        lines: outbound.lines.map((line) => ({
          productId: line.productId,
          approvedUnits: line.approvedUnits,
          dispatchedUnits: line.dispatchedUnits,
        })),
      }));
    return {
      data: slicePage(values, query.page, query.pageSize),
      pagination: pagination(query.page, query.pageSize, values.length),
    };
  }

  public async listReceipts(
    actor: AuthenticatedPrincipal,
    query: ListReceiptsQuery,
  ): Promise<Page<Receipt>> {
    if (query.storeId !== undefined && !canAccessStore(actor, query.storeId)) throw forbidden();
    const values = [...this.receipts.values()]
      .filter((receipt) => canAccessStore(actor, receipt.storeId))
      .filter((receipt) => query.storeId === undefined || receipt.storeId === query.storeId)
      .filter(
        (receipt) =>
          query.outboundRequestId === undefined ||
          receipt.outboundRequestId === query.outboundRequestId,
      )
      .filter((receipt) => query.status === undefined || receipt.status === query.status)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return {
      data: slicePage(values, query.page, query.pageSize),
      pagination: pagination(query.page, query.pageSize, values.length),
    };
  }

  public async getReceipt(actor: AuthenticatedPrincipal, receiptId: string): Promise<Receipt> {
    const receipt = this.receipts.get(receiptId);
    if (!receipt) throw notFound('Không tìm thấy phiếu nhận hàng');
    if (!canAccessStore(actor, receipt.storeId)) throw forbidden();
    return structuredClone(receipt);
  }

  public async declareStoreReceipt(
    actor: AuthenticatedPrincipal,
    input: DeclareStoreReceiptRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<Receipt>> {
    await this.authorizeRetailStoreOperation(actor);
    if (actor.role !== 'STORE' || actor.storeId !== input.storeId) throw forbidden();
    const scopedKey = `${actor.accountId}:receipt:declare:${input.outboundRequestId}:${idempotencyKey}`;
    const replay = this.replayReceipt(scopedKey, requestHash);
    if (replay) return { data: replay, replayed: true };
    const outbound = this.dispatchedOutbounds.get(input.outboundRequestId);
    if (!outbound || outbound.storeId !== input.storeId) {
      throw new ApiError('INVALID_STATE_TRANSITION', 'Phiếu xuất chưa sẵn sàng để nhận', 409);
    }
    if (
      [...this.receipts.values()].some(
        (receipt) => receipt.outboundRequestId === input.outboundRequestId,
      )
    ) {
      throw conflict('Phiếu xuất đã có phiếu nhận hàng');
    }
    validateMemoryDeclaration(input.lines, outbound.lines, input.discrepancyNote);
    const now = this.now().toISOString();
    const receipt: Receipt = {
      id: randomUUID(),
      receiptNumber: `SR-${input.outboundRequestId.slice(0, 8)}`,
      storeId: input.storeId,
      outboundRequestId: input.outboundRequestId,
      declaredByAccountId: actor.accountId,
      lines: input.lines.map((line) => ({
        approvedUnits: line.approvedUnits,
        bagWeightsKg: [],
        pricePerKgVnd: null,
        productId: line.productId,
        receivedUnits: line.receivedUnits,
      })),
      discrepancyNote: input.discrepancyNote,
      status: 'DRAFT',
      freightVnd: 0,
      handlingVnd: 0,
      totalCostVnd: null,
      reviewedByAccountId: null,
      reviewNote: null,
      version: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.receipts.set(receipt.id, receipt);
    this.rememberReceipt(scopedKey, requestHash, receipt);
    this.appendAudit(
      actor,
      context,
      'STORE_RECEIPT_DECLARED',
      'store_receipt',
      receipt.id,
      null,
      receipt,
    );
    return { data: structuredClone(receipt), replayed: false };
  }

  public async submitStoreReceipt(
    actor: AuthenticatedPrincipal,
    receiptId: string,
    input: SubmitStoreReceiptRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<Receipt>> {
    await this.authorizeRetailStoreOperation(actor);
    const scopedKey = `${actor.accountId}:receipt:submit:${receiptId}:${idempotencyKey}`;
    const replay = this.replayReceipt(scopedKey, requestHash);
    if (replay) return { data: replay, replayed: true };
    const current = this.requireMutableReceipt(actor, receiptId, ['DRAFT', 'RETURNED'], true);
    if (current.version !== input.expectedVersion) throw versionConflict();
    validateMemoryDeclaration(input.lines, current.lines, input.discrepancyNote);
    const updated: Receipt = {
      ...current,
      declaredByAccountId: actor.accountId,
      discrepancyNote: input.discrepancyNote,
      lines: input.lines.map((line) => ({
        approvedUnits: line.approvedUnits,
        bagWeightsKg: [],
        pricePerKgVnd: null,
        productId: line.productId,
        receivedUnits: line.receivedUnits,
      })),
      reviewNote: null,
      reviewedByAccountId: null,
      status: 'PENDING_HTKD',
      updatedAt: this.now().toISOString(),
      version: current.version + 1,
    };
    this.receipts.set(receiptId, updated);
    this.rememberReceipt(scopedKey, requestHash, updated);
    this.appendAudit(
      actor,
      context,
      'STORE_RECEIPT_SUBMITTED',
      'store_receipt',
      receiptId,
      current,
      updated,
    );
    return { data: structuredClone(updated), replayed: false };
  }

  public async returnStoreReceiptForCorrection(
    actor: AuthenticatedPrincipal,
    receiptId: string,
    input: ReturnReceiptForCorrectionRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<Receipt>> {
    const scopedKey = `${actor.accountId}:receipt:return:${receiptId}:${idempotencyKey}`;
    const replay = this.replayReceipt(scopedKey, requestHash);
    if (replay) return { data: replay, replayed: true };
    const current = this.requireMutableReceipt(actor, receiptId, ['PENDING_HTKD'], false);
    if (current.version !== input.expectedVersion) throw versionConflict();
    const updated: Receipt = {
      ...current,
      reviewNote: input.reason,
      reviewedByAccountId: actor.accountId,
      status: 'RETURNED',
      updatedAt: this.now().toISOString(),
      version: current.version + 1,
    };
    this.receipts.set(receiptId, updated);
    this.rememberReceipt(scopedKey, requestHash, updated);
    this.appendAudit(
      actor,
      context,
      'STORE_RECEIPT_RETURNED',
      'store_receipt',
      receiptId,
      current,
      updated,
    );
    return { data: structuredClone(updated), replayed: false };
  }

  public async finalizeStoreReceipt(
    actor: AuthenticatedPrincipal,
    receiptId: string,
    input: FinalizeReceiptRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<Receipt>> {
    const scopedKey = `${actor.accountId}:receipt:finalize:${receiptId}:${idempotencyKey}`;
    const replay = this.replayReceipt(scopedKey, requestHash);
    if (replay) return { data: replay, replayed: true };
    const current = this.requireMutableReceipt(actor, receiptId, ['PENDING_HTKD'], false);
    if (current.version !== input.expectedVersion) throw versionConflict();
    validateMemoryFinalization(input, current);
    const goodsCostVnd = input.lines.reduce(
      (total, line) =>
        total +
        line.bagWeightsKg.reduce(
          (lineTotal, weight) =>
            lineTotal + calculateWeightedCostVnd(weight, BigInt(line.pricePerKgVnd ?? 0)),
          0n,
        ),
      0n,
    );
    const totalCostVnd = goodsCostVnd + BigInt(input.freightVnd) + BigInt(input.handlingVnd);
    if (totalCostVnd > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new ApiError('VALIDATION_ERROR', 'Tổng giá vốn vượt giới hạn an toàn', 400);
    }
    const updated: Receipt = {
      ...current,
      freightVnd: input.freightVnd,
      handlingVnd: input.handlingVnd,
      lines: input.lines,
      reviewedByAccountId: actor.accountId,
      status: 'FINALIZED',
      totalCostVnd: Number(totalCostVnd),
      updatedAt: this.now().toISOString(),
      version: current.version + 1,
    };
    this.receipts.set(receiptId, updated);
    this.rememberReceipt(scopedKey, requestHash, updated);
    this.appendAudit(
      actor,
      context,
      'STORE_RECEIPT_FINALIZED',
      'store_receipt',
      receiptId,
      current,
      updated,
    );
    return { data: structuredClone(updated), replayed: false };
  }

  public async listStoreInventoryBags(
    actor: AuthenticatedPrincipal,
    query: ListStoreInventoryBagsQuery,
  ): Promise<Page<StoreInventoryBag>> {
    this.assertRequestedStoreScope(actor, query.storeId);
    const values = [...this.inventoryBags.values()]
      .filter((bag) => canAccessStore(actor, bag.storeId))
      .filter((bag) => query.storeId === undefined || bag.storeId === query.storeId)
      .filter((bag) => query.productId === undefined || bag.productId === query.productId)
      .filter((bag) => query.status === undefined || bag.status === query.status)
      .filter(
        (bag) =>
          query.bagCode === undefined ||
          bag.bagCode.toLocaleLowerCase('vi').includes(query.bagCode.toLocaleLowerCase('vi')),
      )
      .sort(
        (left, right) =>
          (right.receivedAt ?? '').localeCompare(left.receivedAt ?? '') ||
          left.bagCode.localeCompare(right.bagCode),
      );
    return {
      data: structuredClone(slicePage(values, query.page, query.pageSize)),
      pagination: pagination(query.page, query.pageSize, values.length),
    };
  }

  public async listStoreInventoryBagLedger(
    actor: AuthenticatedPrincipal,
    bagId: string,
    query: ListStoreInventoryBagLedgerQuery,
  ): Promise<Page<StoreInventoryBagLedgerEntry>> {
    const bag = this.requireInventoryBag(bagId);
    if (!canAccessStore(actor, bag.storeId)) throw forbidden();
    this.assertRequestedStoreScope(actor, query.storeId);
    if (
      (query.storeId !== undefined && query.storeId !== bag.storeId) ||
      (query.productId !== undefined && query.productId !== bag.productId)
    ) {
      return { data: [], pagination: pagination(query.page, query.pageSize, 0) };
    }
    const values = [...this.inventoryLedger.values()]
      .filter((entry) => entry.bagId === bag.id)
      .sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
      );
    return {
      data: structuredClone(slicePage(values, query.page, query.pageSize)),
      pagination: pagination(query.page, query.pageSize, values.length),
    };
  }

  public async openStoreInventoryBag(
    actor: AuthenticatedPrincipal,
    bagId: string,
    input: OpenStoreInventoryBagRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<StoreInventoryBag>> {
    await this.authorizeRetailStoreOperation(actor);
    const scopedKey = `${actor.accountId}:inventory:open:${bagId}:${idempotencyKey}`;
    const replay = this.replayInventoryMutation(scopedKey, requestHash, 'STORE_INVENTORY_BAG');
    if (replay) return { data: replay as StoreInventoryBag, replayed: true };
    const current = this.requireInventoryBag(bagId);
    if (current.storeId !== actor.storeId) throw forbidden();
    if (current.version !== input.expectedVersion || current.status !== 'AVAILABLE') {
      throw versionConflict('Bao tồn kho đã thay đổi hoặc không thể mở');
    }
    const updated: StoreInventoryBag = {
      ...current,
      status: 'OPEN',
      updatedAt: this.now().toISOString(),
      version: current.version + 1,
    };
    this.inventoryBags.set(updated.id, updated);
    this.rememberInventoryMutation(scopedKey, requestHash, 'STORE_INVENTORY_BAG', updated);
    this.appendAudit(
      actor,
      context,
      'STORE_INVENTORY_BAG_OPENED',
      'store_inventory_bag',
      updated.id,
      current,
      updated,
    );
    return { data: structuredClone(updated), replayed: false };
  }

  public async listStoreOutbounds(
    actor: AuthenticatedPrincipal,
    query: ListStoreOutboundsQuery,
  ): Promise<Page<StoreOutbound>> {
    this.assertRequestedStoreScope(actor, query.storeId);
    const values = [...this.storeOutbounds.values()]
      .filter((outbound) => canAccessStore(actor, outbound.storeId))
      .filter((outbound) => query.storeId === undefined || outbound.storeId === query.storeId)
      .filter(
        (outbound) =>
          query.inventoryLotId === undefined || outbound.inventoryLotId === query.inventoryLotId,
      )
      .filter((outbound) => query.status === undefined || outbound.status === query.status)
      .filter((outbound) => query.reason === undefined || outbound.reason === query.reason)
      .sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
      );
    return {
      data: structuredClone(slicePage(values, query.page, query.pageSize)),
      pagination: pagination(query.page, query.pageSize, values.length),
    };
  }

  public async createStoreOutbound(
    actor: AuthenticatedPrincipal,
    input: CreateStoreOutboundRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<StoreOutbound>> {
    await this.authorizeRetailStoreOperation(actor);
    if (actor.storeId !== input.storeId) throw forbidden();
    const scopedKey = `${actor.accountId}:outbound:create:${input.storeId}:${idempotencyKey}`;
    const replay = this.replayInventoryMutation(scopedKey, requestHash, 'STORE_OUTBOUND');
    if (replay) return { data: replay as StoreOutbound, replayed: true };
    const bag = this.requireInventoryBag(input.inventoryLotId);
    if (bag.storeId !== input.storeId) throw forbidden();
    if (
      bag.version !== input.expectedInventoryVersion ||
      (bag.status !== 'AVAILABLE' && bag.status !== 'OPEN')
    ) {
      throw versionConflict('Bao tồn kho đã thay đổi hoặc không còn khả dụng');
    }
    if (kilogramsToGramsExact(input.weightKg) > kilogramsToGramsExact(bag.remainingWeightKg)) {
      throw insufficientStock();
    }
    const now = this.now().toISOString();
    const created: StoreOutbound = {
      id: randomUUID(),
      storeId: input.storeId,
      inventoryLotId: bag.id,
      weightKg: input.weightKg,
      reason: input.reason,
      revenueVnd: input.revenueVnd,
      status: 'PENDING',
      createdByAccountId: actor.accountId,
      reviewedByAccountId: null,
      reviewNote: null,
      version: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.storeOutbounds.set(created.id, created);
    this.rememberInventoryMutation(scopedKey, requestHash, 'STORE_OUTBOUND', created);
    this.appendAudit(
      actor,
      context,
      'STORE_OUTBOUND_CREATED',
      'store_outbound',
      created.id,
      null,
      created,
    );
    return { data: structuredClone(created), replayed: false };
  }

  public async reviewStoreOutbound(
    actor: AuthenticatedPrincipal,
    outboundId: string,
    input: ReviewStoreOutboundRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<StoreOutbound>> {
    if (actor.role === 'STORE') throw forbidden();
    const scopedKey = `${actor.accountId}:outbound:review:${outboundId}:${idempotencyKey}`;
    const replay = this.replayInventoryMutation(scopedKey, requestHash, 'STORE_OUTBOUND');
    if (replay) return { data: replay as StoreOutbound, replayed: true };
    const current = this.storeOutbounds.get(outboundId);
    if (!current) throw notFound('Không tìm thấy phiếu xuất tại cửa hàng');
    if (!canAccessStore(actor, current.storeId)) throw forbidden();
    if (current.version !== input.expectedVersion || current.status !== 'PENDING') {
      throw versionConflict('Phiếu xuất đã thay đổi hoặc không còn chờ duyệt');
    }
    if (input.decision === 'REJECT' && input.note === null) {
      throw new ApiError('VALIDATION_ERROR', 'Từ chối phiếu xuất phải có lý do', 400);
    }

    if (input.decision === 'APPROVE') {
      const bag = this.requireInventoryBag(current.inventoryLotId);
      if (
        bag.storeId !== current.storeId ||
        (bag.status !== 'AVAILABLE' && bag.status !== 'OPEN')
      ) {
        throw versionConflict('Bao tồn kho không còn khả dụng');
      }
      const beforeGrams = kilogramsToGramsExact(bag.remainingWeightKg);
      const outboundGrams = kilogramsToGramsExact(current.weightKg);
      if (outboundGrams > beforeGrams) throw insufficientStock();
      const afterGrams = beforeGrams - outboundGrams;
      const now = this.now().toISOString();
      const updatedBag: StoreInventoryBag = {
        ...bag,
        remainingWeightKg: gramsToKilogramsExact(afterGrams),
        status: afterGrams === 0n ? 'EMPTY' : 'OPEN',
        updatedAt: now,
        version: bag.version + 1,
      };
      this.inventoryBags.set(updatedBag.id, updatedBag);
      const ledger: StoreInventoryBagLedgerEntry = {
        id: randomUUID(),
        bagId: bag.id,
        operation: 'CONSUME',
        beforeWeightKg: bag.remainingWeightKg,
        afterWeightKg: updatedBag.remainingWeightKg,
        reason: `Duyệt phiếu xuất ${current.reason}`,
        actorAccountId: actor.accountId,
        createdAt: now,
      };
      this.inventoryLedger.set(ledger.id, ledger);
    }

    const updated: StoreOutbound = {
      ...current,
      status: input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      reviewedByAccountId: actor.accountId,
      reviewNote: input.note,
      updatedAt: this.now().toISOString(),
      version: current.version + 1,
    };
    this.storeOutbounds.set(updated.id, updated);
    this.rememberInventoryMutation(scopedKey, requestHash, 'STORE_OUTBOUND', updated);
    this.appendAudit(
      actor,
      context,
      updated.status === 'APPROVED' ? 'STORE_OUTBOUND_APPROVED' : 'STORE_OUTBOUND_REJECTED',
      'store_outbound',
      updated.id,
      current,
      updated,
    );
    return { data: structuredClone(updated), replayed: false };
  }

  public async listStoreTransfers(
    actor: AuthenticatedPrincipal,
    query: ListStoreTransfersQuery,
  ): Promise<Page<StoreTransfer>> {
    for (const requestedStoreId of [query.storeId, query.sourceStoreId, query.destinationStoreId]) {
      this.assertRequestedStoreScope(actor, requestedStoreId);
    }
    const values = [...this.storeTransfers.values()]
      .filter(
        (transfer) =>
          canAccessStore(actor, transfer.sourceStoreId) ||
          canAccessStore(actor, transfer.destinationStoreId),
      )
      .filter(
        (transfer) =>
          query.storeId === undefined ||
          transfer.sourceStoreId === query.storeId ||
          transfer.destinationStoreId === query.storeId,
      )
      .filter(
        (transfer) =>
          query.sourceStoreId === undefined || transfer.sourceStoreId === query.sourceStoreId,
      )
      .filter(
        (transfer) =>
          query.destinationStoreId === undefined ||
          transfer.destinationStoreId === query.destinationStoreId,
      )
      .filter((transfer) => query.productId === undefined || transfer.productId === query.productId)
      .filter((transfer) => query.status === undefined || transfer.status === query.status)
      .sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) ||
          right.transferNumber.localeCompare(left.transferNumber),
      );
    return {
      data: structuredClone(slicePage(values, query.page, query.pageSize)),
      pagination: pagination(query.page, query.pageSize, values.length),
    };
  }

  public async listStoreTransferDestinations(
    actor: AuthenticatedPrincipal,
  ): Promise<readonly Store[]> {
    await this.authorizeRetailStoreOperation(actor);
    return structuredClone(
      [...this.stores.values()]
        .filter(
          (store) =>
            store.id !== actor.storeId && store.kind === 'RETAIL' && store.status === 'ACTIVE',
        )
        .sort((left, right) => left.code.localeCompare(right.code)),
    );
  }

  public async createStoreTransfer(
    actor: AuthenticatedPrincipal,
    input: CreateStoreTransferRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<StoreTransfer>> {
    await this.authorizeRetailStoreOperation(actor);
    if (actor.storeId !== input.sourceStoreId) throw forbidden();
    const scopedKey = `${actor.accountId}:transfer:create:${input.sourceStoreId}:${idempotencyKey}`;
    const replay = this.replayTransferMutation(scopedKey, requestHash);
    if (replay) return { data: replay, replayed: true };
    if (input.sourceStoreId === input.destinationStoreId) {
      throw new ApiError('VALIDATION_ERROR', 'Cửa hàng nguồn và đích phải khác nhau', 400);
    }
    const destination = this.stores.get(input.destinationStoreId);
    if (!destination || destination.status !== 'ACTIVE' || destination.kind !== 'RETAIL') {
      throw new ApiError(
        'VALIDATION_ERROR',
        'Cửa hàng đích phải là cửa hàng lẻ đang hoạt động',
        400,
      );
    }
    const bag = this.requireInventoryBag(input.sourceInventoryBagId);
    if (bag.storeId !== input.sourceStoreId) throw forbidden();
    if (
      bag.version !== input.expectedSourceBagVersion ||
      (bag.status !== 'AVAILABLE' && bag.status !== 'OPEN')
    ) {
      throw versionConflict('Bao nguồn đã thay đổi hoặc không còn khả dụng');
    }
    if (kilogramsToGramsExact(input.weightKg) > kilogramsToGramsExact(bag.remainingWeightKg)) {
      throw insufficientStock();
    }
    const now = this.now().toISOString();
    const transfer: StoreTransfer = {
      id: randomUUID(),
      transferNumber: `TR-${now.slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`,
      sourceStoreId: input.sourceStoreId,
      destinationStoreId: input.destinationStoreId,
      sourceInventoryBagId: bag.id,
      destinationInventoryBagId: null,
      productId: bag.productId,
      weightKg: input.weightKg,
      costVnd: null,
      status: 'DRAFT',
      note: input.note,
      cancellationReason: null,
      version: 0,
      createdByAccountId: actor.accountId,
      dispatchedByAccountId: null,
      receivedByAccountId: null,
      createdAt: now,
      dispatchedAt: null,
      receivedAt: null,
      cancelledAt: null,
      updatedAt: now,
    };
    this.storeTransfers.set(transfer.id, transfer);
    this.rememberTransferMutation(scopedKey, requestHash, transfer);
    this.appendAudit(
      actor,
      context,
      'STORE_TRANSFER_CREATED',
      'store_transfer',
      transfer.id,
      null,
      transfer,
    );
    return { data: structuredClone(transfer), replayed: false };
  }

  public async dispatchStoreTransfer(
    actor: AuthenticatedPrincipal,
    transferId: string,
    input: DispatchStoreTransferRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<StoreTransfer>> {
    await this.authorizeRetailStoreOperation(actor);
    const scopedKey = `${actor.accountId}:transfer:dispatch:${transferId}:${idempotencyKey}`;
    const replay = this.replayTransferMutation(scopedKey, requestHash);
    if (replay) return { data: replay, replayed: true };
    const current = this.requireTransfer(transferId);
    if (actor.storeId !== current.sourceStoreId) throw forbidden();
    if (current.status !== 'DRAFT' || current.version !== input.expectedVersion) {
      throw versionConflict('Phiếu chuyển đã thay đổi hoặc không thể xuất');
    }
    const bag = this.requireInventoryBag(current.sourceInventoryBagId);
    if (
      bag.storeId !== current.sourceStoreId ||
      bag.version !== input.expectedSourceBagVersion ||
      (bag.status !== 'AVAILABLE' && bag.status !== 'OPEN')
    ) {
      throw versionConflict('Bao nguồn đã thay đổi hoặc không còn khả dụng');
    }
    const beforeGrams = kilogramsToGramsExact(bag.remainingWeightKg);
    const movedGrams = kilogramsToGramsExact(current.weightKg);
    if (movedGrams > beforeGrams) throw insufficientStock();
    const sourceCost = this.inventoryBagCosts.get(bag.id) ?? 0n;
    const { movedCostVnd: transferCost, remainingCostVnd } = allocateTransferCostVnd(
      sourceCost,
      beforeGrams,
      movedGrams,
    );
    if (transferCost > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new ApiError('VALIDATION_ERROR', 'Giá vốn chuyển vượt giới hạn an toàn', 400);
    }
    const afterGrams = beforeGrams - movedGrams;
    const now = this.now().toISOString();
    const updatedBag: StoreInventoryBag = {
      ...bag,
      remainingWeightKg: gramsToKilogramsExact(afterGrams),
      status: afterGrams === 0n ? 'EMPTY' : 'OPEN',
      version: bag.version + 1,
      updatedAt: now,
    };
    this.inventoryBags.set(bag.id, updatedBag);
    this.inventoryBagCosts.set(bag.id, remainingCostVnd);
    const ledger: StoreInventoryBagLedgerEntry = {
      id: randomUUID(),
      bagId: bag.id,
      operation: 'CONSUME',
      beforeWeightKg: bag.remainingWeightKg,
      afterWeightKg: updatedBag.remainingWeightKg,
      reason: `Chuyển kho đến ${current.destinationStoreId}`,
      actorAccountId: actor.accountId,
      createdAt: now,
    };
    this.inventoryLedger.set(ledger.id, ledger);
    const updated: StoreTransfer = {
      ...current,
      costVnd: Number(transferCost),
      status: 'IN_TRANSIT',
      dispatchedByAccountId: actor.accountId,
      dispatchedAt: now,
      version: current.version + 1,
      updatedAt: now,
    };
    this.storeTransfers.set(updated.id, updated);
    this.rememberTransferMutation(scopedKey, requestHash, updated);
    this.appendAudit(
      actor,
      context,
      'STORE_TRANSFER_DISPATCHED',
      'store_transfer',
      updated.id,
      current,
      updated,
      {
        sourceInventoryBagVersion: updatedBag.version,
        remainingSourceCostVnd: remainingCostVnd.toString(),
      },
    );
    return { data: structuredClone(updated), replayed: false };
  }

  public async receiveStoreTransfer(
    actor: AuthenticatedPrincipal,
    transferId: string,
    input: ReceiveStoreTransferRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<StoreTransfer>> {
    await this.authorizeRetailStoreOperation(actor);
    const scopedKey = `${actor.accountId}:transfer:receive:${transferId}:${idempotencyKey}`;
    const replay = this.replayTransferMutation(scopedKey, requestHash);
    if (replay) return { data: replay, replayed: true };
    const current = this.requireTransfer(transferId);
    if (actor.storeId !== current.destinationStoreId) throw forbidden();
    if (
      current.status !== 'IN_TRANSIT' ||
      current.version !== input.expectedVersion ||
      current.costVnd === null
    ) {
      throw versionConflict('Phiếu chuyển đã thay đổi hoặc không thể nhận');
    }
    const now = this.now().toISOString();
    const destinationBagId = randomUUID();
    const destinationBag: StoreInventoryBag = {
      id: destinationBagId,
      storeId: current.destinationStoreId,
      productId: current.productId,
      sourceReceiptBagId: null,
      outboundOrderId: null,
      sourceTransferId: current.id,
      sourceInventoryBagId: current.sourceInventoryBagId,
      bagCode: `TR-${current.transferNumber}-${destinationBagId.slice(0, 8).toUpperCase()}`,
      originalWeightKg: current.weightKg,
      receivedWeightKg: current.weightKg,
      remainingWeightKg: current.weightKg,
      status: 'AVAILABLE',
      version: 0,
      receivedAt: now,
      updatedAt: now,
    };
    this.inventoryBags.set(destinationBag.id, destinationBag);
    this.inventoryBagCosts.set(destinationBag.id, BigInt(current.costVnd));
    const ledger: StoreInventoryBagLedgerEntry = {
      id: randomUUID(),
      bagId: destinationBag.id,
      operation: 'RECEIVE',
      beforeWeightKg: '0.000',
      afterWeightKg: destinationBag.remainingWeightKg,
      reason: `Nhận chuyển kho từ ${current.sourceStoreId}`,
      actorAccountId: actor.accountId,
      createdAt: now,
    };
    this.inventoryLedger.set(ledger.id, ledger);
    const updated: StoreTransfer = {
      ...current,
      destinationInventoryBagId: destinationBag.id,
      status: 'RECEIVED',
      receivedByAccountId: actor.accountId,
      receivedAt: now,
      version: current.version + 1,
      updatedAt: now,
    };
    this.storeTransfers.set(updated.id, updated);
    this.rememberTransferMutation(scopedKey, requestHash, updated);
    this.appendAudit(
      actor,
      context,
      'STORE_TRANSFER_RECEIVED',
      'store_transfer',
      updated.id,
      current,
      updated,
    );
    return { data: structuredClone(updated), replayed: false };
  }

  public async cancelStoreTransfer(
    actor: AuthenticatedPrincipal,
    transferId: string,
    input: CancelStoreTransferRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<StoreTransfer>> {
    await this.authorizeRetailStoreOperation(actor);
    const scopedKey = `${actor.accountId}:transfer:cancel:${transferId}:${idempotencyKey}`;
    const replay = this.replayTransferMutation(scopedKey, requestHash);
    if (replay) return { data: replay, replayed: true };
    const current = this.requireTransfer(transferId);
    if (actor.storeId !== current.sourceStoreId) throw forbidden();
    if (current.status !== 'DRAFT' || current.version !== input.expectedVersion) {
      throw versionConflict('Chỉ có thể hủy phiếu chuyển nháp hiện hành');
    }
    const now = this.now().toISOString();
    const updated: StoreTransfer = {
      ...current,
      status: 'CANCELLED',
      cancellationReason: input.reason,
      cancelledAt: now,
      version: current.version + 1,
      updatedAt: now,
    };
    this.storeTransfers.set(updated.id, updated);
    this.rememberTransferMutation(scopedKey, requestHash, updated);
    this.appendAudit(
      actor,
      context,
      'STORE_TRANSFER_CANCELLED',
      'store_transfer',
      updated.id,
      current,
      updated,
      { reason: input.reason },
    );
    return { data: structuredClone(updated), replayed: false };
  }

  public async listWaitTickets(
    actor: AuthenticatedPrincipal,
    query: ListWaitTicketsQuery,
  ): Promise<Page<WaitTicket>> {
    if (query.storeId !== undefined && !canAccessStore(actor, query.storeId)) throw forbidden();
    const values = [...this.waitTickets.values()]
      .map((ticket) => this.effectiveWaitTicket(ticket))
      .filter((ticket) => canAccessStore(actor, ticket.storeId))
      .filter((ticket) => query.storeId === undefined || ticket.storeId === query.storeId)
      .filter((ticket) => query.sessionId === undefined || ticket.sessionId === query.sessionId)
      .filter((ticket) => query.productId === undefined || ticket.productId === query.productId)
      .filter((ticket) => query.priority === undefined || ticket.priority === query.priority)
      .filter((ticket) => query.status === undefined || ticket.status === query.status)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return {
      data: slicePage(values, query.page, query.pageSize),
      pagination: pagination(query.page, query.pageSize, values.length),
    };
  }

  public async getWaitTicketHistory(
    actor: AuthenticatedPrincipal,
    waitTicketId: string,
    limit: number,
  ): Promise<WaitTicketHistory> {
    const stored = this.waitTickets.get(waitTicketId);
    if (!stored) throw notFound('Không tìm thấy phiếu chờ');
    if (!canAccessStore(actor, stored.storeId)) throw forbidden();
    const offers = [...this.priorityOffers.values()]
      .filter((offer) => offer.waitTicketId === waitTicketId)
      .map((offer) => this.effectivePriorityOffer(offer))
      .sort((left, right) => right.offeredAt.localeCompare(left.offeredAt))
      .slice(0, limit);
    const offerIds = new Set(offers.map((offer) => offer.id));
    const audit = this.audit
      .filter(
        (event) =>
          (event.entityType === 'wait_ticket' && event.entityId === waitTicketId) ||
          (event.entityType === 'priority_offer' && offerIds.has(event.entityId)),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .map((event) => ({
        id: event.id,
        requestId: event.requestId,
        actorAccountId: event.actorAccountId,
        actorRole: event.actorRole,
        actorStoreId: event.actorStoreId,
        action: event.action,
        entityType:
          event.entityType === 'priority_offer'
            ? ('PRIORITY_OFFER' as const)
            : ('WAIT_TICKET' as const),
        entityId: event.entityId,
        before: auditSnapshot(event.before),
        after: auditSnapshot(event.after),
        metadata: { ...event.metadata },
        createdAt: event.createdAt,
      }));
    return {
      ticket: this.effectiveWaitTicket(stored),
      offers,
      audit,
    };
  }

  public async cancelWaitTicket(
    actor: AuthenticatedPrincipal,
    waitTicketId: string,
    input: CancelWaitTicketRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<WaitTicket>> {
    await this.authorizeRetailStoreOperation(actor);
    const current = this.waitTickets.get(waitTicketId);
    if (!current) throw notFound('Không tìm thấy phiếu chờ');
    if (!canAccessStore(actor, current.storeId)) throw forbidden();
    const scopedKey = `${actor.accountId}:wait-ticket:cancel:${waitTicketId}:${idempotencyKey}`;
    const replay = this.replayWaitMutation(scopedKey, requestHash, 'WAIT_TICKET');
    if (replay) {
      const replayed = this.waitTickets.get(replay.resourceId);
      if (!replayed) throw notFound('Không tìm thấy phiếu chờ');
      return { data: this.effectiveWaitTicket(replayed), replayed: true };
    }
    const effective = this.effectiveWaitTicket(current);
    if (!['WAITING', 'OFFERED', 'PARTIALLY_FULFILLED'].includes(effective.status)) {
      throw conflict('Chỉ có thể hủy phiếu chờ đang hoạt động');
    }
    const relatedOffers = [...this.priorityOffers.values()].filter(
      (offer) => offer.waitTicketId === waitTicketId,
    );
    if (relatedOffers.some((offer) => offer.status === 'ACCEPTED')) {
      throw conflict('Phiếu chờ đã nhận ưu tiên không thể hủy');
    }

    const now = this.now().toISOString();
    const updated: WaitTicket = { ...current, status: 'CANCELLED', updatedAt: now };
    this.waitTickets.set(waitTicketId, updated);
    for (const offer of relatedOffers) {
      if (this.effectivePriorityOffer(offer).status !== 'PENDING') continue;
      this.priorityOffers.set(offer.id, {
        ...offer,
        status: 'CANCELLED',
        respondedAt: now,
        accepted: null,
      });
    }
    this.waitMutationIdempotency.set(scopedKey, {
      requestHash,
      resourceType: 'WAIT_TICKET',
      resourceId: waitTicketId,
    });
    this.appendAudit(
      actor,
      context,
      'WAIT_TICKET_CANCELLED',
      'wait_ticket',
      waitTicketId,
      current,
      { ...updated, reason: input.reason },
    );
    return { data: structuredClone(updated), replayed: false };
  }

  public async listPriorityOffers(
    actor: AuthenticatedPrincipal,
    query: ListPriorityOffersQuery,
  ): Promise<Page<PriorityOffer>> {
    if (query.storeId !== undefined && !canAccessStore(actor, query.storeId)) throw forbidden();
    const values = [...this.priorityOffers.values()]
      .map((offer) => this.effectivePriorityOffer(offer))
      .filter((offer) => canAccessStore(actor, offer.storeId))
      .filter((offer) => query.storeId === undefined || offer.storeId === query.storeId)
      .filter(
        (offer) => query.waitTicketId === undefined || offer.waitTicketId === query.waitTicketId,
      )
      .filter((offer) => query.status === undefined || offer.status === query.status)
      .sort((left, right) => right.offeredAt.localeCompare(left.offeredAt));
    return {
      data: slicePage(values, query.page, query.pageSize),
      pagination: pagination(query.page, query.pageSize, values.length),
    };
  }

  public async respondPriorityOffer(
    actor: AuthenticatedPrincipal,
    offerId: string,
    input: RespondPriorityOfferRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<PriorityOffer>> {
    await this.authorizeRetailStoreOperation(actor);
    const current = this.priorityOffers.get(offerId);
    if (!current) throw notFound('Không tìm thấy đề nghị ưu tiên');
    if (actor.role !== 'STORE' || actor.storeId !== current.storeId) throw forbidden();
    const scopedKey = `${actor.accountId}:priority-offer:respond:${offerId}:${idempotencyKey}`;
    const replay = this.replayWaitMutation(scopedKey, requestHash, 'PRIORITY_OFFER');
    if (replay) {
      const replayed = this.priorityOffers.get(replay.resourceId);
      if (!replayed) throw notFound('Không tìm thấy đề nghị ưu tiên');
      return { data: this.effectivePriorityOffer(replayed), replayed: true };
    }
    if (this.effectivePriorityOffer(current).status !== 'PENDING') {
      throw conflict('Đề nghị ưu tiên đã hết hạn hoặc đã được phản hồi');
    }
    const ticket = this.waitTickets.get(current.waitTicketId);
    if (!ticket || !['WAITING', 'OFFERED', 'PARTIALLY_FULFILLED'].includes(ticket.status)) {
      throw conflict('Phiếu chờ không còn hoạt động');
    }
    if (
      input.action === 'ACCEPT' &&
      (input.accepted.kind !== 'UNIT' ||
        current.offered.kind !== 'UNIT' ||
        input.accepted.quantity !== current.offered.quantity)
    ) {
      throw new ApiError('VALIDATION_ERROR', 'Phải nhận đủ toàn bộ số lượng đã được đề nghị', 400);
    }

    const now = this.now().toISOString();
    const updated: PriorityOffer = {
      ...current,
      status: input.action === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED',
      respondedAt: now,
      accepted: input.action === 'ACCEPT' ? input.accepted : null,
    };
    this.priorityOffers.set(offerId, updated);
    this.waitMutationIdempotency.set(scopedKey, {
      requestHash,
      resourceType: 'PRIORITY_OFFER',
      resourceId: offerId,
    });
    this.appendAudit(
      actor,
      context,
      input.action === 'ACCEPT' ? 'PRIORITY_OFFER_ACCEPTED' : 'PRIORITY_OFFER_DECLINED',
      'priority_offer',
      offerId,
      current,
      updated,
    );
    return { data: structuredClone(updated), replayed: false };
  }

  public async getMonthlyOperationalReport(
    actor: AuthenticatedPrincipal,
    query: MonthlyOperationalReportQuery,
  ): Promise<MonthlyOperationalReport> {
    let scope: MonthlyReportScope;
    if (query.scopeKind === 'ALL') {
      scope = { kind: 'ALL' };
    } else {
      if (!query.scopeId) {
        throw new ApiError('VALIDATION_ERROR', 'Phạm vi báo cáo thiếu mã định danh', 400);
      }
      scope = { kind: query.scopeKind, id: query.scopeId };
    }
    if (scope.kind === 'ALL' && actor.role !== 'ADMIN') throw forbidden();
    if (scope.kind === 'GROUP') {
      if (actor.role !== 'ADMIN') throw forbidden();
      if (!this.storeGroups.has(scope.id)) throw notFound('Không tìm thấy nhóm cửa hàng');
    }
    if (scope.kind === 'STORE') {
      if (!canAccessStore(actor, scope.id)) throw forbidden();
      if (!this.stores.has(scope.id)) throw notFound('Không tìm thấy cửa hàng');
    }
    return monthlyOperationalReportDto(
      summarizeMonthlyReport(
        { year: query.year, month: query.month, scope },
        {
          inboundSource: scope.kind === 'ALL' ? 'WAREHOUSE_RECEIPTS' : 'STORE_RECEIPTS',
          inboundHeaders: [],
          inboundProducts: [],
          sales: [],
          outboundOrderIds: [],
          allocationRunIds: [],
          waitTicketIds: [],
        },
        this.now(),
      ),
    );
  }

  public async getOrderStatistics(
    actor: AuthenticatedPrincipal,
    storeCode: string,
    from: string,
    to: string,
  ): Promise<OrderStatistics> {
    const store = [...this.stores.values()].find((candidate) => candidate.code === storeCode);
    if (!store) throw notFound('Không tìm thấy cửa hàng');
    if (!canAccessStore(actor, store.id)) throw forbidden('Không có quyền xem cửa hàng này');
    return emptyStatistics(storeCode, from, to, this.now());
  }

  /** Test/admin helper that models token-version revocation when account state changes. */
  public setAccountStatus(accountId: string, status: MutableAccount['status']): void {
    const account = this.accounts.get(accountId);
    if (!account) throw notFound('Không tìm thấy tài khoản');
    account.status = status;
    account.sessionVersion += 1;
  }

  /** Test/admin helper for exercising current store metadata authorization. */
  public setStoreOperationEligibility(
    storeId: string,
    eligibility: Partial<Pick<Store, 'kind' | 'status'>>,
  ): void {
    const store = this.stores.get(storeId);
    if (!store) throw notFound('Không tìm thấy cửa hàng');
    this.stores.set(storeId, {
      ...store,
      ...eligibility,
      updatedAt: this.now().toISOString(),
    });
  }

  private assertRequestedStoreScope(
    actor: AuthenticatedPrincipal,
    requestedStoreId: string | undefined,
  ): void {
    if (requestedStoreId !== undefined && !canAccessStore(actor, requestedStoreId)) {
      throw forbidden();
    }
  }

  private assertWarehouseActor(actor: AuthenticatedPrincipal): void {
    if (actor.role === 'STORE') throw forbidden();
  }

  private replayInboundReceipt(scopedKey: string, requestHash: string): InboundReceipt | null {
    const previous = this.inboundReceiptIdempotency.get(scopedKey);
    if (!previous) return null;
    if (previous.requestHash !== requestHash) {
      throw new ApiError(
        'IDEMPOTENCY_CONFLICT',
        'Khóa idempotency đã được dùng cho nội dung khác',
        409,
      );
    }
    return structuredClone(previous.response);
  }

  private rememberInboundReceipt(
    scopedKey: string,
    requestHash: string,
    receipt: InboundReceipt,
  ): void {
    this.inboundReceiptIdempotency.set(scopedKey, {
      requestHash,
      response: structuredClone(receipt),
    });
  }

  private requireInventoryBag(bagId: string): StoreInventoryBag {
    const bag = this.inventoryBags.get(bagId);
    if (!bag) throw notFound('Không tìm thấy bao tồn kho');
    return bag;
  }

  private requireTransfer(transferId: string): StoreTransfer {
    const transfer = this.storeTransfers.get(transferId);
    if (!transfer) throw notFound('Không tìm thấy phiếu chuyển kho');
    return transfer;
  }

  private replayTransferMutation(scopedKey: string, requestHash: string): StoreTransfer | null {
    const previous = this.transferMutationIdempotency.get(scopedKey);
    if (!previous) return null;
    if (previous.requestHash !== requestHash) {
      throw new ApiError(
        'IDEMPOTENCY_CONFLICT',
        'Khóa idempotency đã được dùng cho nội dung khác',
        409,
      );
    }
    return structuredClone(previous.response);
  }

  private rememberTransferMutation(
    scopedKey: string,
    requestHash: string,
    response: StoreTransfer,
  ): void {
    this.transferMutationIdempotency.set(scopedKey, {
      requestHash,
      response: structuredClone(response),
    });
  }

  private replayInventoryMutation(
    scopedKey: string,
    requestHash: string,
    resourceType: InventoryMutationIdempotencyRecord['resourceType'],
  ): StoreInventoryBag | StoreOutbound | null {
    const previous = this.inventoryMutationIdempotency.get(scopedKey);
    if (!previous) return null;
    if (previous.requestHash !== requestHash || previous.resourceType !== resourceType) {
      throw new ApiError(
        'IDEMPOTENCY_CONFLICT',
        'Khóa idempotency đã được dùng cho nội dung khác',
        409,
      );
    }
    return structuredClone(previous.response);
  }

  private rememberInventoryMutation(
    scopedKey: string,
    requestHash: string,
    resourceType: InventoryMutationIdempotencyRecord['resourceType'],
    response: StoreInventoryBag | StoreOutbound,
  ): void {
    this.inventoryMutationIdempotency.set(scopedKey, {
      requestHash,
      resourceType,
      response: structuredClone(response),
    });
  }

  private replayReceipt(scopedKey: string, requestHash: string): Receipt | null {
    const previous = this.receiptIdempotency.get(scopedKey);
    if (!previous) return null;
    if (previous.requestHash !== requestHash) {
      throw new ApiError(
        'IDEMPOTENCY_CONFLICT',
        'Khóa idempotency đã được dùng cho nội dung khác',
        409,
      );
    }
    return structuredClone(previous.response);
  }

  private replaySessionMutation(scopedKey: string, requestHash: string): OrderSession | null {
    const previous = this.sessionMutationIdempotency.get(scopedKey);
    if (!previous) return null;
    if (previous.requestHash !== requestHash) {
      throw new ApiError(
        'IDEMPOTENCY_CONFLICT',
        'Khóa idempotency đã được dùng cho nội dung khác',
        409,
      );
    }
    return structuredClone(previous.response);
  }

  private replayWarehouseOutboundMutation(
    scopedKey: string,
    requestHash: string,
  ): WarehouseOutboundRequest | null {
    const previous = this.warehouseOutboundMutationIdempotency.get(scopedKey);
    if (!previous) return null;
    if (previous.requestHash !== requestHash) {
      throw new ApiError(
        'IDEMPOTENCY_CONFLICT',
        'Khóa idempotency đã được dùng cho nội dung khác',
        409,
      );
    }
    return structuredClone(previous.response);
  }

  private rememberWarehouseOutboundMutation(
    scopedKey: string,
    requestHash: string,
    response: WarehouseOutboundRequest,
  ): void {
    this.warehouseOutboundMutationIdempotency.set(scopedKey, {
      requestHash,
      response: structuredClone(response),
    });
  }

  private rememberSessionMutation(
    scopedKey: string,
    requestHash: string,
    response: OrderSession,
  ): void {
    this.sessionMutationIdempotency.set(scopedKey, {
      requestHash,
      response: structuredClone(response),
    });
  }

  private rememberReceipt(scopedKey: string, requestHash: string, receipt: Receipt): void {
    this.receiptIdempotency.set(scopedKey, {
      requestHash,
      response: structuredClone(receipt),
    });
  }

  private replayWaitMutation(
    scopedKey: string,
    requestHash: string,
    resourceType: WaitMutationIdempotencyRecord['resourceType'],
  ): WaitMutationIdempotencyRecord | null {
    const previous = this.waitMutationIdempotency.get(scopedKey);
    if (!previous) return null;
    if (previous.requestHash !== requestHash || previous.resourceType !== resourceType) {
      throw new ApiError(
        'IDEMPOTENCY_CONFLICT',
        'Khóa idempotency đã được dùng cho nội dung khác',
        409,
      );
    }
    return previous;
  }

  private effectivePriorityOffer(offer: PriorityOffer): PriorityOffer {
    if (offer.status !== 'PENDING' || Date.parse(offer.expiresAt) > this.now().getTime()) {
      return structuredClone(offer);
    }
    return { ...structuredClone(offer), status: 'EXPIRED', accepted: null };
  }

  private effectiveWaitTicket(ticket: WaitTicket): WaitTicket {
    if (['FULFILLED', 'CANCELLED', 'EXPIRED'].includes(ticket.status)) {
      return structuredClone(ticket);
    }
    const hasOpenOffer = [...this.priorityOffers.values()].some(
      (offer) =>
        offer.waitTicketId === ticket.id && this.effectivePriorityOffer(offer).status === 'PENDING',
    );
    return {
      ...structuredClone(ticket),
      status: hasOpenOffer
        ? 'OFFERED'
        : ticket.fulfilled.kind === 'UNIT' && ticket.fulfilled.quantity > 0
          ? 'PARTIALLY_FULFILLED'
          : 'WAITING',
    };
  }

  private requireActiveHtkdAccount(htkdAccountId: string): MutableAccount {
    const account = this.accounts.get(htkdAccountId);
    if (!account) throw notFound('Không tìm thấy tài khoản HTKD');
    if (account.role !== 'HTKD' || account.status !== 'ACTIVE') {
      throw conflict('Chỉ tài khoản HTKD đang hoạt động mới có thể được phân công cửa hàng');
    }
    return account;
  }

  private htkdAssignmentState(htkdAccountId: string): HtkdAssignmentsState {
    const account = this.requireActiveHtkdAccount(htkdAccountId);
    const assignments = [...this.htkdAssignments.values()]
      .filter(
        (assignment) => assignment.htkdAccountId === htkdAccountId && assignment.revokedAt === null,
      )
      .toSorted((left, right) => left.storeId.localeCompare(right.storeId))
      .map((assignment) => structuredClone(assignment));
    return { assignments, htkdAccountId, sessionVersion: account.sessionVersion };
  }

  private requireMutableReceipt(
    actor: AuthenticatedPrincipal,
    receiptId: string,
    statuses: readonly Receipt['status'][],
    storeOnly: boolean,
  ): Receipt {
    const receipt = this.receipts.get(receiptId);
    if (!receipt) throw notFound('Không tìm thấy phiếu nhận hàng');
    if (!canAccessStore(actor, receipt.storeId)) throw forbidden();
    if (storeOnly && (actor.role !== 'STORE' || actor.storeId !== receipt.storeId)) {
      throw forbidden();
    }
    if (!storeOnly && actor.role === 'STORE') throw forbidden();
    if (!statuses.includes(receipt.status)) {
      throw new ApiError('INVALID_STATE_TRANSITION', 'Trạng thái phiếu không hợp lệ', 409);
    }
    return receipt;
  }

  private async seed(password: string): Promise<void> {
    const passwordHash = await hashPassword(password);
    const currentTime = this.now();
    const now = currentTime.toISOString();
    const sessionBusinessDate = hoChiMinhBusinessDate(currentTime);
    const sessionOpen = new Date(`${sessionBusinessDate}T00:00:00+07:00`);
    const sessionClose = new Date(`${sessionBusinessDate}T23:59:59.998+07:00`);
    const allocationStart = new Date(`${sessionBusinessDate}T23:59:59.999+07:00`);
    this.orderSessions.set(MEMORY_SEED_IDS.orderSession, {
      id: MEMORY_SEED_IDS.orderSession,
      businessDate: sessionBusinessDate,
      status: 'OPEN',
      requestOpensAt: sessionOpen.toISOString(),
      requestClosesAt: sessionClose.toISOString(),
      allocationStartsAt: allocationStart.toISOString(),
      policyVersion: 'idosi-round-robin-p0a-p3-v1',
      version: 0,
      createdAt: now,
      updatedAt: now,
    });
    const groupIdByCode = new Map<string, string>();
    const groupKindByCode = new Map<string, 'RETAIL' | 'WHOLESALE'>();
    STORE_GROUP_SEEDS.forEach((group, index) => {
      const id = `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
      groupIdByCode.set(group.code, id);
      groupKindByCode.set(group.code, group.kind === 'wholesale' ? 'WHOLESALE' : 'RETAIL');
      this.storeGroups.set(id, {
        id,
        code: group.code,
        name: group.name,
        status: 'ACTIVE',
        version: 0,
        createdAt: now,
        updatedAt: now,
      });
    });

    STORE_SEEDS.forEach((seed, index) => {
      const id = `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
      const groupId = groupIdByCode.get(seed.groupCode);
      if (!groupId) throw new Error(`Unknown seed store group ${seed.groupCode}`);
      const kind = groupKindByCode.get(seed.groupCode);
      if (!kind) throw new Error(`Unknown seed store kind ${seed.groupCode}`);
      this.stores.set(id, {
        id,
        code: seed.code,
        name: seed.name,
        groupId,
        kind,
        status: 'ACTIVE',
        address: null,
        version: 0,
        createdAt: now,
        updatedAt: now,
      });
    });

    PRODUCT_SEEDS.forEach((seed, index) => {
      const id = `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
      this.products.set(id, {
        id,
        sku: seed.sku,
        name: seed.name,
        measurement: 'UNIT',
        unitLabel: 'bao',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      });
      this.warehouseBalances.set(id, {
        onHandQuantity: 0,
        reservedQuantity: 0,
        version: 0,
        updatedAt: now,
      });
    });

    PRODUCT_CONVERSION_SEEDS.forEach((seed, index) => {
      const product = [...this.products.values()].find(
        (candidate) => candidate.sku === seed.productSku,
      );
      if (!product) throw new Error(`Unknown seed product ${seed.productSku}`);
      const id = `50000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
      this.productConversions.set(id, {
        id,
        productId: product.id,
        version: seed.version,
        itemQuantity: seed.itemQuantity,
        weightKilograms: seed.weightKilograms,
        effectiveFrom: seed.effectiveFrom,
        effectiveTo: seed.effectiveTo,
        reason: seed.reason,
        createdByAccountId: null,
        createdAt: now,
        retiredAt: null,
        retiredByAccountId: null,
        retirementReason: null,
      });
    });

    const nvtId = this.storeIdByCode('DS_NVT');
    const bdId = this.storeIdByCode('DS_BD');
    const ctId = this.storeIdByCode('DS_CT');
    const seededProducts = [...this.products.values()].sort((left, right) =>
      left.sku.localeCompare(right.sku),
    );
    const firstProduct = seededProducts[0];
    const secondProduct = seededProducts[1];
    if (!firstProduct || !secondProduct) throw new Error('Memory catalog requires two products');
    const allocationResults: AllocationResult[] = [
      {
        id: MEMORY_SEED_IDS.allocationLine,
        allocationRunId: MEMORY_SEED_IDS.allocationRun,
        sessionId: MEMORY_SEED_IDS.orderSession,
        mergedOrderId: '11000000-0000-4000-8000-400000000001',
        storeId: nvtId,
        productId: firstProduct.id,
        priority: 'P1',
        roundNumber: 1,
        sequenceInRound: 1,
        requestedQuantity: 5,
        allocatedQuantity: 5,
        waitlistedQuantity: 0,
        status: 'ALLOCATED',
        reasonCode: 'ALLOCATED_BY_PRIORITY_ROUND_ROBIN',
        createdAt: now,
      },
      {
        id: MEMORY_SEED_IDS.bdAllocationLine,
        allocationRunId: MEMORY_SEED_IDS.allocationRun,
        sessionId: MEMORY_SEED_IDS.orderSession,
        mergedOrderId: '11000000-0000-4000-8000-400000000002',
        storeId: bdId,
        productId: secondProduct.id,
        priority: 'P2',
        roundNumber: 1,
        sequenceInRound: 2,
        requestedQuantity: 3,
        allocatedQuantity: 2,
        waitlistedQuantity: 1,
        status: 'PARTIAL',
        reasonCode: 'PARTIAL_SNAPSHOT_STOCK',
        createdAt: now,
      },
      {
        id: MEMORY_SEED_IDS.unassignedAllocationLine,
        allocationRunId: MEMORY_SEED_IDS.allocationRun,
        sessionId: MEMORY_SEED_IDS.orderSession,
        mergedOrderId: '11000000-0000-4000-8000-400000000003',
        storeId: ctId,
        productId: firstProduct.id,
        priority: 'P3',
        roundNumber: 1,
        sequenceInRound: 3,
        requestedQuantity: 4,
        allocatedQuantity: 0,
        waitlistedQuantity: 4,
        status: 'WAITLISTED',
        reasonCode: 'INSUFFICIENT_SNAPSHOT_STOCK',
        createdAt: now,
      },
    ];
    for (const result of allocationResults) this.allocationResults.set(result.id, result);
    this.dispatchedOutbounds.set(MEMORY_SEED_IDS.outboundRequest, {
      id: MEMORY_SEED_IDS.outboundRequest,
      storeId: nvtId,
      requestNumber: 'OUT-MEMORY-001',
      orderSessionId: MEMORY_SEED_IDS.orderSession,
      allocationRunId: MEMORY_SEED_IDS.allocationRun,
      status: 'DISPATCHED',
      requestedByAccountId: MEMORY_SEED_IDS.storeAccount,
      dispatchedByAccountId: MEMORY_SEED_IDS.htkdAccount,
      dispatchedAt: now,
      lines: [
        {
          id: '11000000-0000-4000-8000-200000000001',
          allocationLineId: MEMORY_SEED_IDS.allocationLine,
          productId: firstProduct.id,
          requestedUnits: 5,
          approvedUnits: 5,
          reservedUnits: 5,
          dispatchedUnits: 5,
          receivedUnits: 0,
        },
      ],
      version: 1,
      notes: null,
      createdAt: now,
      updatedAt: now,
    });
    this.dispatchedOutbounds.set(MEMORY_SEED_IDS.secondOutboundRequest, {
      id: MEMORY_SEED_IDS.secondOutboundRequest,
      storeId: nvtId,
      requestNumber: 'OUT-MEMORY-002',
      orderSessionId: MEMORY_SEED_IDS.orderSession,
      allocationRunId: MEMORY_SEED_IDS.allocationRun,
      status: 'DISPATCHED',
      requestedByAccountId: MEMORY_SEED_IDS.storeAccount,
      dispatchedByAccountId: MEMORY_SEED_IDS.htkdAccount,
      dispatchedAt: now,
      lines: [
        {
          id: '11000000-0000-4000-8000-200000000002',
          allocationLineId: '11000000-0000-4000-8000-300000000002',
          productId: secondProduct.id,
          requestedUnits: 2,
          approvedUnits: 2,
          reservedUnits: 2,
          dispatchedUnits: 2,
          receivedUnits: 0,
        },
      ],
      version: 1,
      notes: null,
      createdAt: now,
      updatedAt: now,
    });
    this.dispatchedOutbounds.set(MEMORY_SEED_IDS.reservedOutboundRequest, {
      id: MEMORY_SEED_IDS.reservedOutboundRequest,
      storeId: nvtId,
      requestNumber: 'OUT-MEMORY-003',
      orderSessionId: MEMORY_SEED_IDS.orderSession,
      allocationRunId: MEMORY_SEED_IDS.allocationRun,
      status: 'RESERVED',
      requestedByAccountId: MEMORY_SEED_IDS.storeAccount,
      dispatchedByAccountId: null,
      dispatchedAt: null,
      lines: [
        {
          id: '11000000-0000-4000-8000-200000000003',
          allocationLineId: '11000000-0000-4000-8000-300000000003',
          productId: secondProduct.id,
          requestedUnits: 3,
          approvedUnits: 3,
          reservedUnits: 3,
          dispatchedUnits: 0,
          receivedUnits: 0,
        },
      ],
      version: 0,
      notes: 'Materialized from allocation',
      createdAt: now,
      updatedAt: now,
    });
    this.receipts.set(MEMORY_SEED_IDS.storeReceipt, {
      id: MEMORY_SEED_IDS.storeReceipt,
      receiptNumber: 'SR-MEMORY-001',
      storeId: nvtId,
      outboundRequestId: MEMORY_SEED_IDS.outboundRequest,
      declaredByAccountId: MEMORY_SEED_IDS.storeAccount,
      lines: [
        {
          productId: firstProduct.id,
          approvedUnits: 5,
          receivedUnits: 4,
          bagWeightsKg: [],
          pricePerKgVnd: null,
        },
      ],
      discrepancyNote: 'Thiếu một bao khi giao nhận',
      status: 'DRAFT',
      freightVnd: 0,
      handlingVnd: 0,
      totalCostVnd: null,
      reviewedByAccountId: null,
      reviewNote: null,
      version: 0,
      createdAt: now,
      updatedAt: now,
    });
    this.waitTickets.set(MEMORY_SEED_IDS.waitTicket, {
      id: MEMORY_SEED_IDS.waitTicket,
      sessionId: MEMORY_SEED_IDS.orderSession,
      mergedOrderId: null,
      storeId: nvtId,
      productId: firstProduct.id,
      priority: 'P0A',
      requested: { kind: 'UNIT', quantity: 3 },
      fulfilled: { kind: 'UNIT', quantity: 0 },
      remaining: { kind: 'UNIT', quantity: 3 },
      status: 'OFFERED',
      createdAt: now,
      updatedAt: now,
    });
    this.waitTickets.set(MEMORY_SEED_IDS.cancellableWaitTicket, {
      id: MEMORY_SEED_IDS.cancellableWaitTicket,
      sessionId: MEMORY_SEED_IDS.orderSession,
      mergedOrderId: null,
      storeId: nvtId,
      productId: secondProduct.id,
      priority: 'P1',
      requested: { kind: 'UNIT', quantity: 2 },
      fulfilled: { kind: 'UNIT', quantity: 0 },
      remaining: { kind: 'UNIT', quantity: 2 },
      status: 'WAITING',
      createdAt: now,
      updatedAt: now,
    });
    this.priorityOffers.set(MEMORY_SEED_IDS.priorityOffer, {
      id: MEMORY_SEED_IDS.priorityOffer,
      waitTicketId: MEMORY_SEED_IDS.waitTicket,
      storeId: nvtId,
      productId: firstProduct.id,
      offered: { kind: 'UNIT', quantity: 3 },
      status: 'PENDING',
      offeredAt: now,
      expiresAt: new Date(this.now().getTime() + 2 * 60 * 60 * 1_000).toISOString(),
      respondedAt: null,
      accepted: null,
    });
    const seededAccounts: MutableAccount[] = [
      {
        id: MEMORY_SEED_IDS.adminAccount,
        username: 'admin',
        displayName: 'Quản trị IDOSI',
        role: 'ADMIN',
        status: 'ACTIVE',
        storeId: null,
        passwordHash,
        sessionVersion: 0,
        assignedStoreIds: [],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: MEMORY_SEED_IDS.htkdAccount,
        username: 'htkd',
        displayName: 'Điều phối HTKD',
        role: 'HTKD',
        status: 'ACTIVE',
        storeId: null,
        passwordHash,
        sessionVersion: 0,
        assignedStoreIds: [nvtId, bdId],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: MEMORY_SEED_IDS.storeAccount,
        username: 'ds_nvt',
        displayName: 'Cửa hàng DS NVT',
        role: 'STORE',
        status: 'ACTIVE',
        storeId: nvtId,
        passwordHash,
        sessionVersion: 0,
        assignedStoreIds: [],
        createdAt: now,
        updatedAt: now,
      },
    ];
    for (const account of seededAccounts) this.accounts.set(account.id, account);
    for (const assignment of [
      {
        id: MEMORY_SEED_IDS.htkdNvtAssignment,
        htkdAccountId: MEMORY_SEED_IDS.htkdAccount,
        storeId: nvtId,
        assignedAt: now,
        assignedByAccountId: MEMORY_SEED_IDS.adminAccount,
        revokedAt: null,
        revokedByAccountId: null,
      },
      {
        id: MEMORY_SEED_IDS.htkdBdAssignment,
        htkdAccountId: MEMORY_SEED_IDS.htkdAccount,
        storeId: bdId,
        assignedAt: now,
        assignedByAccountId: MEMORY_SEED_IDS.adminAccount,
        revokedAt: null,
        revokedByAccountId: null,
      },
    ] satisfies HtkdAssignment[]) {
      this.htkdAssignments.set(assignment.id, assignment);
    }

    this.operationalSettings.push(
      Object.freeze({
        id: MEMORY_SEED_IDS.operationalSettings,
        version: 1,
        timezone: 'Asia/Ho_Chi_Minh',
        snapshotTime: '08:00',
        cutoffTime: '09:00',
        maxRequestsPerStore: 2,
        policyVersion: 'ALLOC-v1.2',
        idosiSyncIntervalMinutes: 15,
        createdByAccountId: null,
        requestId: 'memory-seed',
        createdAt: now,
      }),
    );

    this.inventoryBags.set(MEMORY_SEED_IDS.inventoryBag, {
      id: MEMORY_SEED_IDS.inventoryBag,
      storeId: nvtId,
      productId: firstProduct.id,
      sourceReceiptBagId: MEMORY_SEED_IDS.sourceReceiptBag,
      outboundOrderId: MEMORY_SEED_IDS.outboundRequest,
      sourceTransferId: null,
      sourceInventoryBagId: null,
      bagCode: 'BAG-MEMORY-001',
      originalWeightKg: '25.000',
      receivedWeightKg: '24.500',
      remainingWeightKg: '24.500',
      status: 'AVAILABLE',
      version: 0,
      receivedAt: now,
      updatedAt: now,
    });
    this.inventoryBagCosts.set(MEMORY_SEED_IDS.inventoryBag, 2_450_000n);
    this.inventoryLedger.set(MEMORY_SEED_IDS.inventoryLedger, {
      id: MEMORY_SEED_IDS.inventoryLedger,
      bagId: MEMORY_SEED_IDS.inventoryBag,
      operation: 'RECEIVE',
      beforeWeightKg: '0',
      afterWeightKg: '24.500',
      reason: 'Nhập kho từ phiếu nhận đã hoàn tất',
      actorAccountId: MEMORY_SEED_IDS.storeAccount,
      createdAt: now,
    });
  }

  private storeIdByCode(code: string): string {
    const store = [...this.stores.values()].find((candidate) => candidate.code === code);
    if (!store) throw new Error(`Unknown seed store ${code}`);
    return store.id;
  }

  private toSession(stored: StoredSession, account: AccountCredentials): Session {
    return {
      id: stored.id,
      principal: {
        accountId: account.id,
        username: account.username,
        displayName: account.displayName,
        role: account.role,
        status: 'ACTIVE',
        storeId: account.storeId,
        assignedStoreIds: [...account.assignedStoreIds],
      },
      createdAt: stored.createdAt.toISOString(),
      lastSeenAt: stored.lastSeenAt.toISOString(),
      expiresAt: stored.expiresAt.toISOString(),
    };
  }

  private appendAudit(
    actor: AuthenticatedPrincipal,
    context: RequestContext,
    action: string,
    entityType: string,
    entityId: string,
    before: unknown,
    after: unknown,
    metadata: Readonly<Record<string, unknown>> = {},
  ): void {
    this.audit.push(
      Object.freeze({
        id: randomUUID(),
        action,
        entityType,
        entityId,
        actorAccountId: actor.accountId,
        actorRole: actor.role,
        actorStoreId: actor.storeId,
        requestId: context.requestId,
        before: structuredClone(before),
        after: structuredClone(after),
        metadata: structuredClone(metadata),
        createdAt: this.now().toISOString(),
      }),
    );
  }

  private replayStoreLifecycle<T extends Store | StoreGroup>(
    action: string,
    actor: AuthenticatedPrincipal,
    idempotencyKey: string,
    requestHash: string,
  ): IdempotentResource<T> | null {
    const previous = this.storeLifecycleIdempotency.get(
      `${action}:${actor.accountId}:${idempotencyKey}`,
    );
    if (!previous) return null;
    if (previous.requestHash !== requestHash) {
      throw new ApiError(
        'IDEMPOTENCY_CONFLICT',
        'Khóa idempotency đã được dùng cho nội dung khác',
        409,
      );
    }
    return { data: structuredClone(previous.response) as T, replayed: true };
  }

  private rememberStoreLifecycle(
    action: string,
    actor: AuthenticatedPrincipal,
    idempotencyKey: string,
    requestHash: string,
    response: Store | StoreGroup,
  ): void {
    this.storeLifecycleIdempotency.set(`${action}:${actor.accountId}:${idempotencyKey}`, {
      requestHash,
      response: structuredClone(response),
    });
  }

  private revokeAccountSessions(accountId: string): number {
    let revoked = 0;
    const now = this.now();
    for (const session of this.sessions.values()) {
      if (session.accountId !== accountId || session.revokedAt !== null) continue;
      session.revokedAt = now;
      revoked += 1;
    }
    return revoked;
  }
}

function memoryAccountDto(account: MutableAccount): Account {
  return {
    id: account.id,
    username: account.username,
    displayName: account.displayName,
    role: account.role,
    status: account.status,
    storeId: account.storeId,
    sessionVersion: account.sessionVersion,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

function memoryAuditDto(event: AuditRecord): AdminAuditLog {
  return {
    id: event.id,
    requestId: event.requestId,
    actorAccountId: event.actorAccountId,
    actorRole: event.actorRole,
    actorStoreId: event.actorStoreId,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    before: sanitizeAuditObject(event.before),
    after: sanitizeAuditObject(event.after),
    metadata: sanitizeAuditObject(event.metadata) ?? {},
    createdAt: event.createdAt,
  };
}

function requireMemoryAdmin(actor: AuthenticatedPrincipal): void {
  if (actor.role !== 'ADMIN') throw forbidden();
}

function operationalSettingsVersionConflict(): ApiError {
  return new ApiError('VERSION_CONFLICT', 'Cấu hình vận hành đã thay đổi, vui lòng tải lại', 409);
}

function storeLifecycleVersionConflict(): ApiError {
  return new ApiError('VERSION_CONFLICT', 'Dữ liệu cửa hàng đã thay đổi, vui lòng tải lại', 409);
}

function assertMemoryAccountVersion(
  account: MutableAccount,
  expectedSessionVersion: number | undefined,
): void {
  if (expectedSessionVersion !== undefined && account.sessionVersion !== expectedSessionVersion) {
    throw new ApiError('VERSION_CONFLICT', 'Tài khoản đã thay đổi, vui lòng tải lại', 409);
  }
}

function requireAccountStatusVersion(
  status: UpdateAccountRequest['status'],
  expectedSessionVersion: number | undefined,
): void {
  if (status !== undefined && expectedSessionVersion === undefined) {
    throw new ApiError(
      'VALIDATION_ERROR',
      'Cần phiên bản hiện tại khi thay đổi trạng thái tài khoản',
      400,
    );
  }
}

function emptyStatistics(storeCode: string, from: string, to: string, now: Date): OrderStatistics {
  return {
    storeCode,
    period: { from, to },
    totals: {
      revenueByType: { NORMAL: 0, SALE_KG: 0, SALE_PIECE: 0 },
      revenue: 0,
      weight: { actualKg: '0.000', estimatedKg: '0.000', totalKg: '0.000', isComplete: true },
    },
    products: [],
    generatedAt: now.toISOString(),
  };
}

function memoryIdosiScopeKey(scope: IdosiStatisticsScope): string {
  return `${scope.storeId}:${idosiStatisticsScopeKey(scope)}`;
}

function assertMemorySyncTimes(startedAt: Date, completedAt: Date): void {
  if (
    Number.isNaN(startedAt.getTime()) ||
    Number.isNaN(completedAt.getTime()) ||
    completedAt < startedAt
  ) {
    throw new RangeError('IDOSI sync attempt timestamps are invalid');
  }
}

function boundedMemorySyncText(value: string, maximum: number, fallback: string): string {
  return (value.trim() || fallback).slice(0, maximum);
}

function retirementDate(effectiveFrom: string, now: Date): string {
  const today = now.toISOString().slice(0, 10);
  return today > effectiveFrom ? today : effectiveFrom;
}

function validateMemoryDeclaration(
  lines: DeclareStoreReceiptRequest['lines'],
  dispatchedLines: readonly { readonly productId: string; readonly approvedUnits: number }[],
  discrepancyNote: string | null,
): void {
  const dispatched = new Map(
    dispatchedLines.map((line) => [line.productId, line.approvedUnits] as const),
  );
  if (lines.length !== dispatched.size) {
    throw new ApiError('VALIDATION_ERROR', 'Phiếu nhận phải có đủ mặt hàng đã xuất', 400);
  }
  let hasShortage = false;
  for (const line of lines) {
    const approvedUnits = dispatched.get(line.productId);
    if (approvedUnits === undefined || approvedUnits !== line.approvedUnits) {
      throw new ApiError('VALIDATION_ERROR', 'Số lượng duyệt không khớp phiếu xuất', 400);
    }
    hasShortage ||= line.receivedUnits < approvedUnits;
  }
  if (hasShortage && discrepancyNote === null) {
    throw new ApiError('VALIDATION_ERROR', 'Nhận thiếu phải có ghi chú chênh lệch', 400);
  }
}

function validateMemoryFinalization(input: FinalizeReceiptRequest, current: Receipt): void {
  const currentLines = new Map(current.lines.map((line) => [line.productId, line] as const));
  if (input.lines.length !== currentLines.size) {
    throw new ApiError('VALIDATION_ERROR', 'Chi tiết giá vốn không khớp phiếu nhận', 400);
  }
  for (const line of input.lines) {
    const persisted = currentLines.get(line.productId);
    if (
      !persisted ||
      persisted.approvedUnits !== line.approvedUnits ||
      persisted.receivedUnits !== line.receivedUnits
    ) {
      throw new ApiError('VALIDATION_ERROR', 'Số lượng thực nhận đã thay đổi', 400);
    }
  }
}

function versionConflict(message = 'Phiếu nhận đã thay đổi, vui lòng tải lại'): ApiError {
  return new ApiError('VERSION_CONFLICT', message, 409);
}

function insufficientStock(): ApiError {
  return new ApiError('INSUFFICIENT_STOCK', 'Khối lượng xuất vượt quá tồn kho còn lại', 409);
}

function auditSnapshot(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return structuredClone(value) as Record<string, unknown>;
}
