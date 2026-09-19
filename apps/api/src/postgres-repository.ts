import { randomUUID } from 'node:crypto';

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
  CreateStoreOutboundRequest,
  CreateStoreRequest,
  CreateAccountRequest,
  CreateInboundReceiptRequest,
  DeclareStoreReceiptRequest,
  DispatchWarehouseOutboundRequest,
  ConfirmReceiptCostsRequest,
  FinalizeReceiptRequest,
  HtkdAssignment,
  ListOrderSessionsQuery,
  ListAccountsQuery,
  ListAllocationsQuery,
  ListAuditLogsQuery,
  ListInboundReceiptsQuery,
  ListPriorityOffersQuery,
  ListProductsQuery,
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
  IdosiStatisticsScope,
  InboundReceipt,
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
} from '@idosi/contracts';
import {
  type CreateWarehouseAdjustmentRequest,
  type WarehouseAdjustment,
  StoreGroupSchema,
  StoreSchema,
} from '@idosi/contracts';
import {
  ActiveWaitTicketExistsError,
  auditLogs,
  cancelWaitTicket as cancelDatabaseWaitTicket,
  cancelSupplierInbound as cancelDatabaseSupplierInbound,
  closeDatabase,
  createOrderSession as createDatabaseOrderSession,
  confirmSupplierInboundCosts as confirmDatabaseSupplierInboundCosts,
  createStoreOutbound as createDatabaseStoreOutbound,
  dailyPriorityOffers,
  declareStoreReceipt as declareDatabaseStoreReceipt,
  db,
  htkdAssignments,
  IdempotencyConflictError,
  IdempotencyInProgressError,
  finalizeStoreReceipt as finalizeDatabaseStoreReceipt,
  dispatchWarehouseOutboundRequest as dispatchDatabaseWarehouseOutboundRequest,
  getWarehouseOutboundRequest as getDatabaseWarehouseOutboundRequest,
  gramsToKilogramsExact,
  kilogramsToGramsExact,
  getWaitTicketHistory as getDatabaseWaitTicketHistory,
  listPriorityOffers as listDatabasePriorityOffers,
  listAllocationResults as listDatabaseAllocationResults,
  listStoreInventoryBags as listDatabaseStoreInventoryBags,
  listStoreInventoryLedger as listDatabaseStoreInventoryLedger,
  listStoreOutbounds as listDatabaseStoreOutbounds,
  listStoreReceiptSources as listDatabaseStoreReceiptSources,
  listWaitTickets as listDatabaseWaitTickets,
  listWarehouseOutboundRequests as listDatabaseWarehouseOutboundRequests,
  loadMonthlyOperationalReport,
  loadIdosiStatisticsState as loadDatabaseIdosiStatisticsState,
  isRequestDeadlineClosed,
  openStoreInventoryBag as openDatabaseStoreInventoryBag,
  orderRequestItems,
  orderRequests,
  orderSessions,
  operationalSettingsVersions,
  outboundRequestLines,
  OrderRequestAuthorizationError,
  OrderSessionAuthorizationError,
  OrderSessionConflictError,
  OrderSessionNotFoundError,
  OrderSessionUnavailableError,
  OrderSessionValidationError,
  pool,
  productConversions,
  products,
  recordIdosiStatisticsFailure as recordDatabaseIdosiStatisticsFailure,
  recordIdosiStatisticsSuccess as recordDatabaseIdosiStatisticsSuccess,
  receiptBagWeights,
  receiptItems,
  receipts,
  receiveSupplierInbound as receiveDatabaseSupplierInbound,
  RequestLimitExceededError,
  respondPriorityOffer as respondDatabasePriorityOffer,
  reviewStoreOutbound as reviewDatabaseStoreOutbound,
  sessions,
  StoreOperationConflictError,
  StoreInventoryAuthorizationError,
  StoreOperationValidationError,
  StoreReceiptAuthorizationError,
  SupplierInboundAuthorizationError,
  SupplierInboundConflictError,
  SupplierInboundNotFoundError,
  SupplierInboundValidationError,
  storeReceiptBags,
  storeReceiptLines,
  storeReceipts,
  storeGroups,
  storeInventoryBags,
  storeOutbounds,
  stores,
  submitOrderRequest as submitDatabaseOrderRequest,
  transitionOrderSession as transitionDatabaseOrderSession,
  submitStoreReceipt as submitDatabaseStoreReceipt,
  users,
  warehouseBalances,
  returnStoreReceiptForCorrection as returnDatabaseStoreReceiptForCorrection,
  PriorityOfferConflictError,
  PriorityOfferNotFoundError,
  WaitTicketAuthorizationError,
  WaitTicketConflictError,
  WaitTicketNotFoundError,
  WaitTicketValidationError,
  WarehouseOutboundAuthorizationError,
  WarehouseOutboundConflictError,
  WarehouseOutboundNotFoundError,
  WarehouseOutboundValidationError,
  cancelStoreTransfer as cancelDatabaseStoreTransfer,
  createStoreTransfer as createDatabaseStoreTransfer,
  dispatchStoreTransfer as dispatchDatabaseStoreTransfer,
  listStoreTransfers as listDatabaseStoreTransfers,
  receiveStoreTransfer as receiveDatabaseStoreTransfer,
  StoreTransferAuthorizationError,
  StoreTransferNotFoundError,
  storeTransfers,
  applyWarehouseMovement,
  withAdvisoryLock,
  withIdempotency,
  withSerializableTransaction,
  type JsonObject,
  type AllocationResultDatabaseStatus,
  type AllocationResultRecord,
  type MonthlyReportScope,
  type PriorityOfferRecord,
  type StoreReceiptSourceRecord,
  type StoreInventoryBagRecord,
  type StoreInventoryLedgerRecord,
  type WaitTicketDatabaseStatus,
  type WaitTicketEffectiveStatus,
  type WaitTicketRecord,
  type WarehouseOutboundDatabaseStatus,
  type WarehouseOutboundRequestRecord,
} from '@idosi/database';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';

import { sanitizeAuditObject } from './audit-sanitization.js';
import { ApiError, conflict, forbidden, notFound, unauthenticated } from './errors.js';
import { monthlyOperationalReportDto } from './monthly-report.js';
import type {
  AccountCredentials,
  HtkdAssignmentsState,
  IdosiStatisticsTarget,
  IdempotentResource,
  OrderStatistics,
  Page,
  RequestContext,
  SubmittedOrderRequest,
  WarehouseRepository,
} from './repository.js';
import { assertActiveRetailStore, canAccessStore, pagination, slicePage } from './repository.js';
import { hashPassword, hashSessionToken } from './security.js';
import { asiaHoChiMinhDateRange } from './time.js';

export class PostgresWarehouseRepository implements WarehouseRepository {
  public async ready(): Promise<boolean> {
    try {
      await pool.query('select 1');
      return true;
    } catch {
      return false;
    }
  }

  public async close(): Promise<void> {
    await closeDatabase();
  }

  public async findCredentials(username: string): Promise<AccountCredentials | null> {
    const [account] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, username.trim()), isNull(users.deletedAt)))
      .limit(1);
    if (!account) return null;
    return this.credentialsFromRow(account);
  }

  public async createSession(
    account: AccountCredentials,
    token: string,
    expiresAt: Date,
    context: RequestContext,
  ): Promise<Session> {
    return db.transaction(async (tx) => {
      const now = new Date();
      const [created] = await tx
        .insert(sessions)
        .values({
          userId: account.id,
          tokenHash: hashSessionToken(token),
          userTokenVersion: account.sessionVersion,
          expiresAt,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        })
        .returning();
      if (!created) throw new Error('Session insert did not return a row');
      await tx
        .update(users)
        .set({ lastLoginAt: now, updatedAt: now })
        .where(eq(users.id, account.id));
      return sessionDto(created, account);
    });
  }

  public async resolveSession(token: string): Promise<Session> {
    const tokenHash = hashSessionToken(token);
    const [row] = await db
      .select({ session: sessions, account: users })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.tokenHash, tokenHash), isNull(users.deletedAt)))
      .limit(1);
    if (!row || row.session.expiresAt.getTime() <= Date.now()) throw unauthenticated();
    if (
      row.session.revokedAt !== null ||
      row.account.tokenVersion !== row.session.userTokenVersion
    ) {
      throw new ApiError('SESSION_REVOKED', 'Phiên đăng nhập đã bị thu hồi', 401);
    }
    if (row.account.status !== 'active') {
      throw new ApiError('ACCOUNT_INACTIVE', 'Tài khoản đã bị khóa hoặc vô hiệu hóa', 403);
    }
    const credentials = await this.credentialsFromRow(row.account);
    const now = new Date();
    await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, row.session.id));
    return sessionDto({ ...row.session, lastSeenAt: now }, credentials);
  }

  public async revokeSession(token: string, reason: string): Promise<boolean> {
    const revoked = await db
      .update(sessions)
      .set({ revokedAt: new Date(), revokeReason: reason })
      .where(and(eq(sessions.tokenHash, hashSessionToken(token)), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });
    return revoked.length > 0;
  }

  public async authorizeRetailStoreOperation(actor: AuthenticatedPrincipal): Promise<void> {
    const [store] =
      actor.role === 'STORE' && actor.storeId !== null
        ? await db
            .select({ kind: stores.kind, isActive: stores.isActive })
            .from(stores)
            .where(and(eq(stores.id, actor.storeId), isNull(stores.deletedAt)))
            .limit(1)
        : [];
    assertActiveRetailStore(
      store
        ? {
            kind: store.kind === 'retail' ? 'RETAIL' : 'WHOLESALE',
            status: store.isActive ? 'ACTIVE' : 'INACTIVE',
          }
        : null,
    );
  }

  public async listAccounts(
    actor: AuthenticatedPrincipal,
    query: ListAccountsQuery,
  ): Promise<Page<Account>> {
    requirePostgresAdmin(actor);
    const predicates: SQL[] = [isNull(users.deletedAt)];
    if (query.role !== undefined) {
      predicates.push(eq(users.role, databaseAccountRole(query.role)));
    }
    if (query.status !== undefined) {
      predicates.push(eq(users.status, databaseAccountStatus(query.status)));
    }
    if (query.storeId !== undefined) predicates.push(eq(users.storeId, query.storeId));
    if (query.search !== undefined) {
      const pattern = `%${query.search.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
      predicates.push(or(ilike(users.email, pattern), ilike(users.displayName, pattern))!);
    }
    const where = and(...predicates);
    const [totalRow] = await db.select({ value: count() }).from(users).where(where);
    const rows = await db
      .select()
      .from(users)
      .where(where)
      .orderBy(asc(users.email), asc(users.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    return {
      data: rows.map(accountDto),
      pagination: pagination(query.page, query.pageSize, totalRow?.value ?? 0),
    };
  }

  public async createAccount(
    actor: AuthenticatedPrincipal,
    input: CreateAccountRequest,
    context: RequestContext,
  ): Promise<Account> {
    requirePostgresAdmin(actor);
    const passwordHash = await hashPassword(input.password);
    try {
      return await db.transaction(async (tx) => {
        if (input.role === 'STORE') {
          if (input.storeId === null) {
            throw new ApiError('VALIDATION_ERROR', 'Tài khoản cửa hàng thiếu mã cửa hàng', 400);
          }
          const [store] = await tx
            .select({ id: stores.id })
            .from(stores)
            .where(
              and(
                eq(stores.id, input.storeId),
                eq(stores.isActive, true),
                isNull(stores.deletedAt),
              ),
            )
            .limit(1);
          if (!store) throw notFound('Không tìm thấy cửa hàng đang hoạt động');
        }
        const [created] = await tx
          .insert(users)
          .values({
            email: input.username,
            passwordHash,
            displayName: input.displayName,
            role: databaseAccountRole(input.role),
            status: 'active',
            storeId: input.storeId,
          })
          .returning();
        if (!created) throw new Error('Account insert did not return a row');
        const result = accountDto(created);
        await tx
          .insert(auditLogs)
          .values(
            auditValue(
              actor,
              context,
              'ACCOUNT_CREATED',
              'user',
              created.id,
              null,
              accountJson(result),
            ),
          );
        return result;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict('Tên đăng nhập hoặc cửa hàng đã có tài khoản');
      throw error;
    }
  }

  public async updateAccount(
    actor: AuthenticatedPrincipal,
    accountId: string,
    input: UpdateAccountRequest,
    context: RequestContext,
  ): Promise<Account> {
    requirePostgresAdmin(actor);
    requireAccountStatusVersion(input.status, input.expectedSessionVersion);
    if (accountId === actor.accountId && input.status !== undefined && input.status !== 'ACTIVE') {
      throw forbidden('Không thể tự khóa hoặc vô hiệu hóa tài khoản quản trị đang dùng');
    }
    return db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(users)
        .where(and(eq(users.id, accountId), isNull(users.deletedAt)))
        .for('update')
        .limit(1);
      if (!current) throw notFound('Không tìm thấy tài khoản');
      assertPostgresAccountVersion(current.tokenVersion, input.expectedSessionVersion);
      const currentDto = accountDto(current);
      const nextDisplayName = input.displayName ?? currentDto.displayName;
      const nextStatus = input.status ?? currentDto.status;
      const statusChanged = nextStatus !== currentDto.status;
      if (nextDisplayName === currentDto.displayName && !statusChanged) return currentDto;

      const now = new Date();
      const nextVersion = current.tokenVersion + (statusChanged ? 1 : 0);
      const [updated] = await tx
        .update(users)
        .set({
          displayName: nextDisplayName,
          status: databaseAccountStatus(nextStatus),
          tokenVersion: nextVersion,
          updatedAt: now,
        })
        .where(and(eq(users.id, accountId), eq(users.tokenVersion, current.tokenVersion)))
        .returning();
      if (!updated) throw accountVersionConflict();

      const sessionsRevoked = statusChanged
        ? (
            await tx
              .update(sessions)
              .set({ revokedAt: now, revokeReason: 'account_status_changed' })
              .where(and(eq(sessions.userId, accountId), isNull(sessions.revokedAt)))
              .returning({ id: sessions.id })
          ).length
        : 0;
      const result = accountDto(updated);
      await tx.insert(auditLogs).values({
        ...auditValue(
          actor,
          context,
          statusChanged ? 'ACCOUNT_STATUS_UPDATED' : 'ACCOUNT_UPDATED',
          'user',
          accountId,
          accountJson(currentDto),
          accountJson(result),
        ),
        metadata: { sessionsRevoked },
      });
      return result;
    });
  }

  public async resetAccountPassword(
    actor: AuthenticatedPrincipal,
    accountId: string,
    input: ResetPasswordRequest,
    context: RequestContext,
  ): Promise<{ accountId: string; sessionsRevoked: number; sessionVersion: number }> {
    requirePostgresAdmin(actor);
    const passwordHash = await hashPassword(input.newPassword);
    return db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(users)
        .where(and(eq(users.id, accountId), isNull(users.deletedAt)))
        .for('update')
        .limit(1);
      if (!current) throw notFound('Không tìm thấy tài khoản');
      assertPostgresAccountVersion(current.tokenVersion, input.expectedSessionVersion);

      const now = new Date();
      const nextVersion = current.tokenVersion + 1;
      const [updated] = await tx
        .update(users)
        .set({ passwordHash, tokenVersion: nextVersion, updatedAt: now })
        .where(and(eq(users.id, accountId), eq(users.tokenVersion, current.tokenVersion)))
        .returning();
      if (!updated) throw accountVersionConflict();
      const sessionsRevoked = (
        await tx
          .update(sessions)
          .set({ revokedAt: now, revokeReason: 'admin_password_reset' })
          .where(and(eq(sessions.userId, accountId), isNull(sessions.revokedAt)))
          .returning({ id: sessions.id })
      ).length;
      await tx.insert(auditLogs).values({
        ...auditValue(
          actor,
          context,
          'ACCOUNT_PASSWORD_RESET',
          'user',
          accountId,
          accountJson(accountDto(current)),
          accountJson(accountDto(updated)),
        ),
        metadata: { sessionsRevoked },
      });
      return { accountId, sessionsRevoked, sessionVersion: updated.tokenVersion };
    });
  }

  public async listHtkdAssignments(
    actor: AuthenticatedPrincipal,
    htkdAccountId: string,
  ): Promise<HtkdAssignmentsState> {
    requirePostgresAdmin(actor);
    return db.transaction(
      async (tx) => {
        const [account] = await tx
          .select()
          .from(users)
          .where(and(eq(users.id, htkdAccountId), isNull(users.deletedAt)))
          .limit(1);
        if (!account) throw notFound('Không tìm thấy tài khoản HTKD');
        requireActiveHtkdTarget(account);
        const rows = await tx
          .select()
          .from(htkdAssignments)
          .where(and(eq(htkdAssignments.userId, htkdAccountId), isNull(htkdAssignments.revokedAt)))
          .orderBy(asc(htkdAssignments.storeId), asc(htkdAssignments.id));
        return {
          assignments: rows.map(htkdAssignmentDto),
          htkdAccountId,
          sessionVersion: account.tokenVersion,
        };
      },
      { accessMode: 'read only', isolationLevel: 'repeatable read' },
    );
  }

  public async replaceHtkdAssignments(
    actor: AuthenticatedPrincipal,
    htkdAccountId: string,
    input: ReplaceHtkdAssignmentsRequest,
    context: RequestContext,
  ): Promise<HtkdAssignmentsState> {
    requirePostgresAdmin(actor);
    return db.transaction(async (tx) => {
      const [account] = await tx
        .select()
        .from(users)
        .where(and(eq(users.id, htkdAccountId), isNull(users.deletedAt)))
        .for('update')
        .limit(1);
      if (!account) throw notFound('Không tìm thấy tài khoản HTKD');
      requireActiveHtkdTarget(account);
      assertPostgresAccountVersion(account.tokenVersion, input.expectedSessionVersion);

      if (input.storeIds.length > 0) {
        const validStores = await tx
          .select({ id: stores.id })
          .from(stores)
          .where(
            and(
              inArray(stores.id, input.storeIds),
              eq(stores.kind, 'retail'),
              eq(stores.isActive, true),
              isNull(stores.deletedAt),
            ),
          );
        if (validStores.length !== input.storeIds.length) {
          throw new ApiError(
            'VALIDATION_ERROR',
            'HTKD chỉ được phân công cửa hàng bán lẻ đang hoạt động',
            400,
          );
        }
      }

      const currentRows = await tx
        .select()
        .from(htkdAssignments)
        .where(and(eq(htkdAssignments.userId, htkdAccountId), isNull(htkdAssignments.revokedAt)))
        .orderBy(asc(htkdAssignments.storeId), asc(htkdAssignments.id))
        .for('update');
      const before: HtkdAssignmentsState = {
        assignments: currentRows.map(htkdAssignmentDto),
        htkdAccountId,
        sessionVersion: account.tokenVersion,
      };
      const currentStoreIds = before.assignments.map((assignment) => assignment.storeId).toSorted();
      const nextStoreIds = [...input.storeIds].toSorted();
      if (
        currentStoreIds.length === nextStoreIds.length &&
        currentStoreIds.every((storeId, index) => storeId === nextStoreIds[index])
      ) {
        return before;
      }

      const currentStoreIdSet = new Set(currentStoreIds);
      const nextStoreIdSet = new Set(nextStoreIds);
      const revokedRows = currentRows.filter((row) => !nextStoreIdSet.has(row.storeId));
      const revokedStoreIds = revokedRows.map((row) => row.storeId);
      const addedStoreIds = nextStoreIds.filter((storeId) => !currentStoreIdSet.has(storeId));
      const now = new Date();

      // Revoke first so the assignment trigger's token-version bump cannot claim these sessions
      // with the generic user_security_changed reason before we can count and label them.
      const sessionsRevoked = (
        await tx
          .update(sessions)
          .set({ revokedAt: now, revokeReason: 'htkd_assignments_changed' })
          .where(and(eq(sessions.userId, htkdAccountId), isNull(sessions.revokedAt)))
          .returning({ id: sessions.id })
      ).length;
      if (revokedRows.length > 0) {
        await tx
          .update(htkdAssignments)
          .set({ revokedAt: now, revokedByUserId: actor.accountId })
          .where(
            inArray(
              htkdAssignments.id,
              revokedRows.map((row) => row.id),
            ),
          );
      }
      if (addedStoreIds.length > 0) {
        await tx.insert(htkdAssignments).values(
          addedStoreIds.map((storeId) => ({
            assignedAt: now,
            assignedByUserId: actor.accountId,
            storeId,
            userId: htkdAccountId,
          })),
        );
      }
      if (revokedRows.length === 0) {
        await tx
          .update(users)
          .set({ tokenVersion: account.tokenVersion + 1, updatedAt: now })
          .where(and(eq(users.id, htkdAccountId), eq(users.tokenVersion, account.tokenVersion)));
      } else {
        await tx.update(users).set({ updatedAt: now }).where(eq(users.id, htkdAccountId));
      }

      const [updatedAccount] = await tx
        .select({ tokenVersion: users.tokenVersion })
        .from(users)
        .where(eq(users.id, htkdAccountId))
        .limit(1);
      if (!updatedAccount) throw notFound('Không tìm thấy tài khoản HTKD');
      const updatedRows = await tx
        .select()
        .from(htkdAssignments)
        .where(and(eq(htkdAssignments.userId, htkdAccountId), isNull(htkdAssignments.revokedAt)))
        .orderBy(asc(htkdAssignments.storeId), asc(htkdAssignments.id));
      const after: HtkdAssignmentsState = {
        assignments: updatedRows.map(htkdAssignmentDto),
        htkdAccountId,
        sessionVersion: updatedAccount.tokenVersion,
      };
      await tx.insert(auditLogs).values({
        ...auditValue(
          actor,
          context,
          'HTKD_ASSIGNMENTS_REPLACED',
          'user',
          htkdAccountId,
          htkdAssignmentsJson(before),
          htkdAssignmentsJson(after),
        ),
        metadata: { addedStoreIds, reason: input.reason, revokedStoreIds, sessionsRevoked },
      });
      return after;
    });
  }

  public async listAuditLogs(
    actor: AuthenticatedPrincipal,
    query: ListAuditLogsQuery,
  ): Promise<Page<AdminAuditLog>> {
    requirePostgresAdmin(actor);
    const predicates: SQL[] = [];
    if (query.actorAccountId !== undefined) {
      predicates.push(eq(auditLogs.actorUserId, query.actorAccountId));
    }
    if (query.action !== undefined) predicates.push(eq(auditLogs.action, query.action));
    if (query.entityType !== undefined) {
      predicates.push(eq(auditLogs.entityType, query.entityType));
    }
    if (query.entityId !== undefined) predicates.push(eq(auditLogs.entityId, query.entityId));
    if (query.requestId !== undefined) predicates.push(eq(auditLogs.requestId, query.requestId));
    if (query.createdFrom !== undefined) {
      predicates.push(gte(auditLogs.createdAt, new Date(query.createdFrom)));
    }
    if (query.createdTo !== undefined) {
      predicates.push(lte(auditLogs.createdAt, new Date(query.createdTo)));
    }
    const where = predicates.length > 0 ? and(...predicates) : undefined;
    const [totalRow] = await db.select({ value: count() }).from(auditLogs).where(where);
    const rows = await db
      .select()
      .from(auditLogs)
      .where(where)
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    return {
      data: rows.map(adminAuditDto),
      pagination: pagination(query.page, query.pageSize, totalRow?.value ?? 0),
    };
  }

  public async getOperationalSettings(
    actor: AuthenticatedPrincipal,
    historyLimit: number,
  ): Promise<{
    readonly current: OperationalSettingsVersion;
    readonly history: readonly OperationalSettingsVersion[];
  }> {
    requirePostgresAdmin(actor);
    const rows = await db
      .select()
      .from(operationalSettingsVersions)
      .orderBy(desc(operationalSettingsVersions.version))
      .limit(historyLimit);
    const history = rows.map(operationalSettingsDto);
    const current = history[0];
    if (!current) throw new Error('Operational settings have not been initialized');
    return { current, history };
  }

  public async updateOperationalSettings(
    actor: AuthenticatedPrincipal,
    input: UpdateOperationalSettingsRequest,
    context: RequestContext,
  ): Promise<OperationalSettingsVersion> {
    requirePostgresAdmin(actor);
    return db.transaction((tx) =>
      withAdvisoryLock(tx, 'operational-settings', 'current', async () => {
        const [currentRow] = await tx
          .select()
          .from(operationalSettingsVersions)
          .orderBy(desc(operationalSettingsVersions.version))
          .limit(1);
        if (!currentRow) throw new Error('Operational settings have not been initialized');
        if (currentRow.version !== input.expectedVersion) {
          throw operationalSettingsVersionConflict();
        }

        const [createdRow] = await tx
          .insert(operationalSettingsVersions)
          .values({
            version: currentRow.version + 1,
            timezone: input.timezone,
            snapshotTime: input.snapshotTime,
            cutoffTime: input.cutoffTime,
            maxRequestsPerStore: input.maxRequestsPerStore,
            policyVersion: input.policyVersion,
            idosiSyncIntervalMinutes: input.idosiSyncIntervalMinutes,
            createdByUserId: actor.accountId,
            requestId: context.requestId,
          })
          .returning();
        if (!createdRow) throw new Error('Operational settings insert did not return a row');

        const current = operationalSettingsDto(currentRow);
        const created = operationalSettingsDto(createdRow);
        await tx
          .insert(auditLogs)
          .values(
            auditValue(
              actor,
              context,
              'OPERATIONAL_SETTINGS_VERSION_CREATED',
              'operational_settings_version',
              created.id,
              operationalSettingsJson(current),
              operationalSettingsJson(created),
            ),
          );
        return created;
      }),
    );
  }

  public async resolveIdosiStatisticsTarget(
    actor: AuthenticatedPrincipal,
    storeId: string,
  ): Promise<IdosiStatisticsTarget> {
    const [store] = await db
      .select({
        id: stores.id,
        code: stores.code,
        name: stores.name,
        kind: stores.kind,
        isActive: stores.isActive,
      })
      .from(stores)
      .where(and(eq(stores.id, storeId), isNull(stores.deletedAt)))
      .limit(1);
    if (!store) throw notFound('Không tìm thấy cửa hàng');
    if (!canAccessStore(actor, store.id)) throw forbidden('Không có quyền xem cửa hàng này');
    if (!store.isActive) throw conflict('Cửa hàng đã ngừng hoạt động');
    if (store.kind !== 'retail') {
      throw conflict('Đồng bộ doanh thu chỉ áp dụng cho cửa hàng bán lẻ');
    }
    return { storeId: store.id, storeCode: store.code, storeName: store.name };
  }

  public async getIdosiStatisticsState(actor: AuthenticatedPrincipal, scope: IdosiStatisticsScope) {
    await this.resolveIdosiStatisticsTarget(actor, scope.storeId);
    return loadDatabaseIdosiStatisticsState(db, scope);
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
    await recordDatabaseIdosiStatisticsSuccess(db, {
      target,
      scope,
      payload,
      source: 'MANUAL',
      startedAt,
      completedAt,
      context: {
        actor: {
          userId: actor.accountId,
          role: databaseAccountRole(actor.role),
          storeId: actor.storeId,
        },
        ...context,
      },
    });
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
    await recordDatabaseIdosiStatisticsFailure(db, {
      target,
      scope,
      source: 'MANUAL',
      errorCode,
      errorMessage,
      startedAt,
      completedAt,
      context: {
        actor: {
          userId: actor.accountId,
          role: databaseAccountRole(actor.role),
          storeId: actor.storeId,
        },
        ...context,
      },
    });
  }

  public async listOrderSessions(query: ListOrderSessionsQuery): Promise<Page<OrderSession>> {
    const predicates = [isNull(orderSessions.deletedAt)];
    if (query.status !== undefined) {
      predicates.push(eq(orderSessions.status, databaseOrderSessionStatus(query.status)));
    }
    if (query.dateFrom !== undefined) {
      predicates.push(gte(orderSessions.businessDate, query.dateFrom));
    }
    if (query.dateTo !== undefined) {
      predicates.push(lte(orderSessions.businessDate, query.dateTo));
    }
    const where = and(...predicates);
    const [totalRow] = await db.select({ value: count() }).from(orderSessions).where(where);
    const rows = await db
      .select()
      .from(orderSessions)
      .where(where)
      .orderBy(desc(orderSessions.businessDate), desc(orderSessions.createdAt))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    return {
      data: rows.map(orderSessionDto),
      pagination: pagination(query.page, query.pageSize, totalRow?.value ?? 0),
    };
  }

  public async listAllocations(
    actor: AuthenticatedPrincipal,
    query: ListAllocationsQuery,
  ): Promise<Page<AllocationResult>> {
    if (query.storeId !== undefined && !canAccessStore(actor, query.storeId)) throw forbidden();
    const storeIds =
      actor.role === 'ADMIN'
        ? query.storeId === undefined
          ? undefined
          : [query.storeId]
        : actor.role === 'STORE'
          ? actor.storeId === null
            ? []
            : [actor.storeId]
          : query.storeId === undefined
            ? actor.assignedStoreIds
            : [query.storeId];
    const result = await listDatabaseAllocationResults(db, {
      page: query.page,
      pageSize: query.pageSize,
      ...(storeIds === undefined ? {} : { storeIds }),
      ...(query.sessionId === undefined ? {} : { sessionId: query.sessionId }),
      ...(query.productId === undefined ? {} : { productId: query.productId }),
      ...(query.status === undefined
        ? {}
        : { status: databaseAllocationResultStatus(query.status) }),
      ...(query.priority === undefined ? {} : { priority: query.priority }),
    });
    return { data: result.data.map(allocationResultDto), pagination: result.pagination };
  }

  public async createOrderSession(
    actor: AuthenticatedPrincipal,
    input: CreateOrderSessionRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<OrderSession>> {
    return withOrderSessionErrors(async () => {
      const result = await createDatabaseOrderSession(db, {
        businessDate: input.businessDate,
        requestOpensAt: new Date(input.requestOpensAt),
        requestClosesAt: new Date(input.requestClosesAt),
        allocationStartsAt: new Date(input.allocationStartsAt),
        policyVersion: input.policyVersion,
        createdByUserId: actor.accountId,
        idempotencyKey: `${actor.accountId}:${idempotencyKey}`,
        requestHash,
        requestId: context.requestId,
      });
      const resourceId = result.replayed ? result.resourceId : result.value.id;
      if (!resourceId) throw new Error('Idempotent order session creation has no resource id');
      return {
        data: await this.orderSessionById(resourceId),
        replayed: result.replayed,
      };
    });
  }

  public async transitionOrderSession(
    actor: AuthenticatedPrincipal,
    sessionId: string,
    input: TransitionOrderSessionRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<OrderSession>> {
    return withOrderSessionErrors(async () => {
      const result = await transitionDatabaseOrderSession(db, {
        orderSessionId: sessionId,
        targetStatus: input.status.toLocaleLowerCase('en-US') as 'open' | 'closed' | 'cancelled',
        expectedVersion: input.expectedVersion,
        reason: input.reason ?? null,
        actorUserId: actor.accountId,
        idempotencyKey: `${actor.accountId}:${idempotencyKey}`,
        requestHash,
        requestId: context.requestId,
      });
      const resourceId = result.replayed ? result.resourceId : result.value.id;
      if (!resourceId) throw new Error('Idempotent order session transition has no resource id');
      return {
        data: await this.orderSessionById(resourceId),
        replayed: result.replayed,
      };
    });
  }

  public async createWarehouseAdjustment(
    actor: AuthenticatedPrincipal,
    input: CreateWarehouseAdjustmentRequest,
    idempotencyKey: string,
    context: RequestContext,
  ): Promise<WarehouseAdjustment> {
    if (actor.role !== 'ADMIN') throw forbidden('Chỉ Admin được điều chỉnh kho tổng');
    const now = new Date();
    const adjustmentId = randomUUID();
    const delta = input.direction === 'INCREASE' ? 1 : -1;
    let sequence = 0;
    await withSerializableTransaction(db, async (tx) => {
      for (const line of input.lines) {
        sequence += 1;
        const quantity =
          line.amount.kind === 'UNIT'
            ? line.amount.quantity
            : Math.round(Number(line.amount.value));
        await applyWarehouseMovement(tx, {
          productId: line.productId,
          eventType: 'adjustment',
          onHandDelta: delta * quantity,
          reservedDelta: 0,
          sourceType: 'WAREHOUSE_ADJUSTMENT',
          sourceId: adjustmentId,
          eventSequence: sequence,
          reason: input.reasonCode,
          metadata: { note: input.reason, idempotencyKey, requestId: context.requestId },
          actorUserId: actor.accountId,
          occurredAt: now,
        });
      }
    });
    return {
      id: adjustmentId,
      direction: input.direction,
      reasonCode: input.reasonCode,
      reason: input.reason,
      lines: [],
      createdByAccountId: actor.accountId,
      createdAt: now.toISOString(),
    };
  }

  public async listWarehouseBalances(
    actor: AuthenticatedPrincipal,
  ): Promise<WarehouseBalancesResponse> {
    requireWarehouseActor(actor);
    const asOf = new Date();
    const rows = await db
      .select({
        productId: products.id,
        onHandQuantity: warehouseBalances.onHandQuantity,
        reservedQuantity: warehouseBalances.reservedQuantity,
        version: warehouseBalances.version,
        updatedAt: warehouseBalances.updatedAt,
      })
      .from(products)
      .leftJoin(warehouseBalances, eq(warehouseBalances.productId, products.id))
      .where(isNull(products.deletedAt))
      .orderBy(asc(products.displayOrder), asc(products.sku));
    return {
      data: rows.map((row) => ({
        productId: row.productId,
        available: {
          kind: 'UNIT',
          quantity: (row.onHandQuantity ?? 0) - (row.reservedQuantity ?? 0),
        },
        reserved: { kind: 'UNIT', quantity: row.reservedQuantity ?? 0 },
        version: row.version ?? 0,
        updatedAt: (row.updatedAt ?? asOf).toISOString(),
      })),
      asOf: asOf.toISOString(),
    };
  }

  public async listInboundReceipts(
    actor: AuthenticatedPrincipal,
    query: ListInboundReceiptsQuery,
  ): Promise<Page<InboundReceipt>> {
    requireWarehouseActor(actor);
    const conditions: SQL[] = [
      isNull(receipts.deletedAt),
      isNotNull(receipts.supplierName),
      isNotNull(receipts.receivedAt),
    ];
    if (query.status !== undefined) {
      conditions.push(eq(receipts.status, databaseInboundReceiptStatus(query.status)));
    }
    if (query.receivedFrom !== undefined) {
      conditions.push(gte(receipts.receivedAt, new Date(query.receivedFrom)));
    }
    if (query.receivedTo !== undefined) {
      conditions.push(lte(receipts.receivedAt, new Date(query.receivedTo)));
    }
    if (query.supplier !== undefined) {
      const supplier = `%${query.supplier.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
      conditions.push(ilike(receipts.supplierName, supplier));
    }
    const where = and(...conditions);
    const [totalRow] = await db.select({ value: count() }).from(receipts).where(where);
    const rows = await db
      .select({ id: receipts.id })
      .from(receipts)
      .where(where)
      .orderBy(desc(receipts.receivedAt), desc(receipts.createdAt), desc(receipts.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    return {
      data: await Promise.all(rows.map((row) => this.inboundReceiptDto(row.id))),
      pagination: pagination(query.page, query.pageSize, totalRow?.value ?? 0),
    };
  }

  public async getInboundReceipt(
    actor: AuthenticatedPrincipal,
    receiptId: string,
  ): Promise<InboundReceipt> {
    requireWarehouseActor(actor);
    return this.inboundReceiptDto(receiptId);
  }

  public async receiveSupplierInbound(
    actor: AuthenticatedPrincipal,
    input: CreateInboundReceiptRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<InboundReceipt>> {
    requireWarehouseActor(actor);
    return withSupplierInboundErrors(async () => {
      const result = await receiveDatabaseSupplierInbound(db, {
        referenceCode: input.referenceCode,
        supplierName: input.supplierName,
        receivedAt: new Date(input.receivedAt),
        bags: input.bags,
        receivedByUserId: actor.accountId,
        actorRole: databaseWarehouseActorRole(actor),
        idempotencyKey: `${actor.accountId}:${idempotencyKey}`,
        requestHash,
        requestId: context.requestId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
      const resourceId = result.replayed ? result.resourceId : result.value.receiptId;
      if (!resourceId) throw new Error('Idempotent supplier receipt has no resource id.');
      return { data: await this.inboundReceiptDto(resourceId), replayed: result.replayed };
    });
  }

  public async confirmSupplierInboundCosts(
    actor: AuthenticatedPrincipal,
    receiptId: string,
    input: ConfirmReceiptCostsRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<InboundReceipt>> {
    requireWarehouseActor(actor);
    return withSupplierInboundErrors(async () => {
      const result = await confirmDatabaseSupplierInboundCosts(db, {
        receiptId,
        expectedVersion: input.expectedVersion,
        productCosts: input.productCosts.map((cost) => ({
          productId: cost.productId,
          priceVndPerKg: BigInt(cost.priceVndPerKg),
        })),
        transportationFeeVnd: BigInt(input.transportationFeeVnd),
        handlingFeeVnd: BigInt(input.handlingFeeVnd),
        confirmedByUserId: actor.accountId,
        actorRole: databaseWarehouseActorRole(actor),
        idempotencyKey: `${actor.accountId}:${idempotencyKey}`,
        requestHash,
        requestId: context.requestId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
      const resourceId = result.replayed ? result.resourceId : result.value.receiptId;
      if (!resourceId) throw new Error('Idempotent supplier cost confirmation has no resource id.');
      return { data: await this.inboundReceiptDto(resourceId), replayed: result.replayed };
    });
  }

  public async cancelSupplierInbound(
    actor: AuthenticatedPrincipal,
    receiptId: string,
    input: CancelInboundReceiptRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<InboundReceipt>> {
    requireWarehouseActor(actor);
    return withSupplierInboundErrors(async () => {
      const result = await cancelDatabaseSupplierInbound(db, {
        receiptId,
        expectedVersion: input.expectedVersion,
        reason: input.reason,
        cancelledByUserId: actor.accountId,
        actorRole: databaseWarehouseActorRole(actor),
        idempotencyKey: `${actor.accountId}:${idempotencyKey}`,
        requestHash,
        requestId: context.requestId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
      const resourceId = result.replayed ? result.resourceId : result.value.receiptId;
      if (!resourceId)
        throw new Error('Idempotent supplier receipt cancellation has no resource id.');
      return { data: await this.inboundReceiptDto(resourceId), replayed: result.replayed };
    });
  }

  public async listProducts(query: ListProductsQuery): Promise<Page<Product>> {
    const rows = await db
      .select()
      .from(products)
      .where(isNull(products.deletedAt))
      .orderBy(asc(products.displayOrder), asc(products.sku));
    const search = query.search?.toLocaleLowerCase('vi-VN');
    const values = rows
      .map(productDto)
      .filter((product) => query.status === undefined || product.status === query.status)
      .filter(
        (product) => query.measurement === undefined || product.measurement === query.measurement,
      )
      .filter(
        (product) =>
          search === undefined ||
          product.name.toLocaleLowerCase('vi-VN').includes(search) ||
          product.sku.toLocaleLowerCase('en-US').includes(search),
      );
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
    try {
      return await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(products)
          .values({
            sku: input.sku,
            slug: slugify(input.sku),
            name: input.name,
            unit: databaseUnit(input.measurement, input.unitLabel),
            isActive: true,
          })
          .returning();
        if (!created) throw new Error('Product insert did not return a row');
        const result = productDto(created);
        await tx
          .insert(auditLogs)
          .values(
            auditValue(
              actor,
              context,
              'PRODUCT_CREATED',
              'product',
              result.id,
              null,
              productJson(result),
            ),
          );
        return result;
      });
    } catch (error: unknown) {
      if (isUniqueViolation(error)) throw conflict('Mã SKU đã tồn tại');
      throw error;
    }
  }

  public async updateProduct(
    actor: AuthenticatedPrincipal,
    productId: string,
    input: UpdateProductRequest,
    context: RequestContext,
  ): Promise<Product> {
    return db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(products)
        .where(and(eq(products.id, productId), isNull(products.deletedAt)))
        .limit(1);
      if (!current) throw notFound('Không tìm thấy mặt hàng');
      const [updated] = await tx
        .update(products)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.status !== undefined ? { isActive: input.status === 'ACTIVE' } : {}),
          ...(input.unitLabel !== undefined
            ? { unit: databaseUnit(productDto(current).measurement, input.unitLabel) }
            : {}),
          updatedAt: new Date(),
          version: current.version + 1,
        })
        .where(eq(products.id, productId))
        .returning();
      if (!updated) throw new Error('Product update did not return a row');
      const beforeDto = productDto(current);
      const result = productDto(updated);
      await tx
        .insert(auditLogs)
        .values(
          auditValue(
            actor,
            context,
            'PRODUCT_UPDATED',
            'product',
            productId,
            productJson(beforeDto),
            productJson(result),
          ),
        );
      return result;
    });
  }

  public async listProductConversions(
    productId: string,
    query: ListProductConversionsQuery,
  ): Promise<Page<ProductConversion>> {
    await this.requireProduct(productId);
    const rows = await db
      .select()
      .from(productConversions)
      .where(eq(productConversions.productId, productId))
      .orderBy(asc(productConversions.version));
    const values = rows
      .map(conversionDto)
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
    const rows = await db
      .select()
      .from(productConversions)
      .orderBy(asc(productConversions.productId), asc(productConversions.version));
    const values = rows
      .map(conversionDto)
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
    return withSerializableTransaction(db, (tx) =>
      withAdvisoryLock(tx, 'product-conversion', productId, async () => {
        const [product] = await tx
          .select({ id: products.id })
          .from(products)
          .where(and(eq(products.id, productId), isNull(products.deletedAt)))
          .limit(1);
        if (!product) throw notFound('Không tìm thấy mặt hàng');
        const [latest] = await tx
          .select()
          .from(productConversions)
          .where(eq(productConversions.productId, productId))
          .orderBy(desc(productConversions.version))
          .limit(1);
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
        const [created] = await tx
          .insert(productConversions)
          .values({
            productId,
            version: (latest?.version ?? 0) + 1,
            itemQuantity: input.itemQuantity,
            weightKilograms: input.weightKilograms,
            effectiveFrom: input.effectiveFrom,
            effectiveTo: input.effectiveTo,
            reason: input.reason,
            createdByUserId: actor.accountId,
          })
          .returning();
        if (!created) throw new Error('Product conversion insert did not return a row');
        const result = conversionDto(created);
        await tx
          .insert(auditLogs)
          .values(
            auditValue(
              actor,
              context,
              latest ? 'PRODUCT_CONVERSION_APPENDED' : 'PRODUCT_CONVERSION_CREATED',
              'product_conversion',
              result.id,
              latest ? conversionJson(conversionDto(latest)) : null,
              conversionJson(result),
            ),
          );
        return result;
      }),
    );
  }

  public async replaceProductConversion(
    actor: AuthenticatedPrincipal,
    productId: string,
    conversionId: string,
    input: UpdateProductConversionRequest,
    context: RequestContext,
  ): Promise<ProductConversion> {
    return withSerializableTransaction(db, (tx) =>
      withAdvisoryLock(tx, 'product-conversion', productId, async () => {
        const [current] = await tx
          .select()
          .from(productConversions)
          .where(
            and(
              eq(productConversions.id, conversionId),
              eq(productConversions.productId, productId),
            ),
          )
          .limit(1);
        if (!current) throw notFound('Không tìm thấy tỷ lệ quy đổi');
        if (current.version !== input.expectedVersion) {
          throw new ApiError('VERSION_CONFLICT', 'Phiên bản tỷ lệ quy đổi đã thay đổi', 409);
        }
        if (current.retiredAt !== null) {
          throw conflict('Tỷ lệ quy đổi đã được thay thế hoặc ngừng dùng');
        }
        if (input.effectiveFrom <= current.effectiveFrom) {
          throw new ApiError(
            'VALIDATION_ERROR',
            'Ngày hiệu lực của phiên bản mới phải sau phiên bản hiện tại',
            400,
          );
        }
        const retiredAt = new Date();
        await tx
          .update(productConversions)
          .set({
            effectiveTo: input.effectiveFrom,
            retiredAt,
            retiredByUserId: actor.accountId,
            retirementReason: input.reason,
          })
          .where(eq(productConversions.id, current.id));
        const [created] = await tx
          .insert(productConversions)
          .values({
            productId,
            version: current.version + 1,
            itemQuantity: input.itemQuantity,
            weightKilograms: input.weightKilograms,
            effectiveFrom: input.effectiveFrom,
            effectiveTo: input.effectiveTo,
            reason: input.reason,
            createdByUserId: actor.accountId,
          })
          .returning();
        if (!created) throw new Error('Replacement conversion insert did not return a row');
        const result = conversionDto(created);
        await tx
          .insert(auditLogs)
          .values(
            auditValue(
              actor,
              context,
              'PRODUCT_CONVERSION_REPLACED',
              'product_conversion',
              result.id,
              conversionJson(conversionDto(current)),
              conversionJson(result),
            ),
          );
        return result;
      }),
    );
  }

  public async retireProductConversion(
    actor: AuthenticatedPrincipal,
    productId: string,
    conversionId: string,
    input: DeleteProductConversionRequest,
    context: RequestContext,
  ): Promise<ProductConversion> {
    return withSerializableTransaction(db, (tx) =>
      withAdvisoryLock(tx, 'product-conversion', productId, async () => {
        const [current] = await tx
          .select()
          .from(productConversions)
          .where(
            and(
              eq(productConversions.id, conversionId),
              eq(productConversions.productId, productId),
            ),
          )
          .limit(1);
        if (!current) throw notFound('Không tìm thấy tỷ lệ quy đổi');
        if (current.version !== input.expectedVersion) {
          throw new ApiError('VERSION_CONFLICT', 'Phiên bản tỷ lệ quy đổi đã thay đổi', 409);
        }
        if (current.retiredAt !== null) return conversionDto(current);
        const [updated] = await tx
          .update(productConversions)
          .set({
            effectiveTo: retirementDate(current.effectiveFrom, new Date()),
            retiredAt: new Date(),
            retiredByUserId: actor.accountId,
            retirementReason: input.reason,
          })
          .where(eq(productConversions.id, current.id))
          .returning();
        if (!updated) throw new Error('Product conversion retirement did not return a row');
        const result = conversionDto(updated);
        await tx
          .insert(auditLogs)
          .values(
            auditValue(
              actor,
              context,
              'PRODUCT_CONVERSION_RETIRED',
              'product_conversion',
              result.id,
              conversionJson(conversionDto(current)),
              conversionJson(result),
            ),
          );
        return result;
      }),
    );
  }

  public async listStores(
    actor: AuthenticatedPrincipal,
    query: ListStoresQuery,
  ): Promise<Page<Store>> {
    const rows = await db
      .select()
      .from(stores)
      .where(isNull(stores.deletedAt))
      .orderBy(asc(stores.displayOrder), asc(stores.code));
    const search = query.search?.toLocaleLowerCase('vi-VN');
    const values = rows
      .map(storeDto)
      .filter((store) => canAccessStore(actor, store.id))
      .filter((store) => query.status === undefined || store.status === query.status)
      .filter((store) => query.kind === undefined || store.kind === query.kind)
      .filter((store) => query.groupId === undefined || store.groupId === query.groupId)
      .filter(
        (store) =>
          search === undefined ||
          store.name.toLocaleLowerCase('vi-VN').includes(search) ||
          store.code.toLocaleLowerCase('en-US').includes(search),
      );
    return {
      data: slicePage(values, query.page, query.pageSize),
      pagination: pagination(query.page, query.pageSize, values.length),
    };
  }

  public async listStoreGroups(
    actor: AuthenticatedPrincipal,
    query: ListStoreGroupsQuery,
  ): Promise<Page<StoreGroup>> {
    requirePostgresAdmin(actor);
    const predicates: SQL[] = [];
    if (query.status !== undefined) {
      predicates.push(eq(storeGroups.isActive, query.status === 'ACTIVE'));
    }
    if (query.search !== undefined) {
      const pattern = `%${escapeLike(query.search)}%`;
      predicates.push(or(ilike(storeGroups.code, pattern), ilike(storeGroups.name, pattern))!);
    }
    const where = and(...predicates);
    const [totalRow] = await db.select({ value: count() }).from(storeGroups).where(where);
    const rows = await db
      .select()
      .from(storeGroups)
      .where(where)
      .orderBy(asc(storeGroups.displayOrder), asc(storeGroups.code))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    return {
      data: rows.map(storeGroupDto),
      pagination: pagination(query.page, query.pageSize, totalRow?.value ?? 0),
    };
  }

  public async createStoreGroup(
    actor: AuthenticatedPrincipal,
    input: CreateStoreGroupRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<StoreGroup>> {
    requirePostgresAdmin(actor);
    return withStoreLifecycleErrors('Mã nhóm cửa hàng đã tồn tại', async () => {
      const result = await withIdempotency(
        db,
        {
          scope: 'store-group:create',
          key: `${actor.accountId}:${idempotencyKey}`,
          requestHash,
        },
        async (tx) => {
          const [created] = await tx
            .insert(storeGroups)
            .values({ code: input.code, name: input.name, isActive: true })
            .returning();
          if (!created) throw new Error('Store group insert did not return a row');
          const data = storeGroupDto(created);
          await tx
            .insert(auditLogs)
            .values(
              auditValue(
                actor,
                context,
                'STORE_GROUP_CREATED',
                'store_group',
                data.id,
                null,
                storeGroupJson(data),
              ),
            );
          return {
            value: data,
            responseStatus: 201,
            responseBody: storeGroupJson(data),
            resourceType: 'store_group',
            resourceId: data.id,
          };
        },
      );
      return {
        data: result.replayed ? StoreGroupSchema.parse(result.responseBody) : result.value,
        replayed: result.replayed,
      };
    });
  }

  public async updateStoreGroup(
    actor: AuthenticatedPrincipal,
    groupId: string,
    input: UpdateStoreGroupRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<StoreGroup>> {
    requirePostgresAdmin(actor);
    return withStoreLifecycleErrors('Mã nhóm cửa hàng đã tồn tại', async () => {
      const result = await withIdempotency(
        db,
        {
          scope: 'store-group:update',
          key: `${actor.accountId}:${idempotencyKey}`,
          requestHash,
        },
        async (tx) => {
          const [current] = await tx
            .select()
            .from(storeGroups)
            .where(eq(storeGroups.id, groupId))
            .for('update')
            .limit(1);
          if (!current) throw notFound('Không tìm thấy nhóm cửa hàng');
          if (current.version !== input.expectedVersion) throw storeLifecycleVersionConflict();
          if (input.status === 'INACTIVE' && current.isActive) {
            const [activeStore] = await tx
              .select({ id: stores.id })
              .from(stores)
              .where(
                and(
                  eq(stores.groupId, groupId),
                  eq(stores.isActive, true),
                  isNull(stores.deletedAt),
                ),
              )
              .limit(1);
            if (activeStore) throw conflict('Không thể vô hiệu hóa nhóm còn cửa hàng hoạt động');
          }
          const before = storeGroupDto(current);
          const [updated] = await tx
            .update(storeGroups)
            .set({
              name: input.name,
              isActive: input.status === undefined ? undefined : input.status === 'ACTIVE',
              version: sql`${storeGroups.version} + 1`,
              updatedAt: new Date(),
            })
            .where(and(eq(storeGroups.id, groupId), eq(storeGroups.version, input.expectedVersion)))
            .returning();
          if (!updated) throw storeLifecycleVersionConflict();
          const data = storeGroupDto(updated);
          await tx
            .insert(auditLogs)
            .values(
              auditValue(
                actor,
                context,
                'STORE_GROUP_UPDATED',
                'store_group',
                data.id,
                storeGroupJson(before),
                storeGroupJson(data),
              ),
            );
          return {
            value: data,
            responseStatus: 200,
            responseBody: storeGroupJson(data),
            resourceType: 'store_group',
            resourceId: data.id,
          };
        },
      );
      return {
        data: result.replayed ? StoreGroupSchema.parse(result.responseBody) : result.value,
        replayed: result.replayed,
      };
    });
  }

  public async createStore(
    actor: AuthenticatedPrincipal,
    input: CreateStoreRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<Store>> {
    requirePostgresAdmin(actor);
    return withStoreLifecycleErrors('Mã cửa hàng đã tồn tại', async () => {
      const result = await withIdempotency(
        db,
        {
          scope: 'store:create',
          key: `${actor.accountId}:${idempotencyKey}`,
          requestHash,
        },
        async (tx) => {
          const [group] = await tx
            .select({ id: storeGroups.id })
            .from(storeGroups)
            .where(and(eq(storeGroups.id, input.groupId), eq(storeGroups.isActive, true)))
            .limit(1);
          if (!group) throw notFound('Không tìm thấy nhóm cửa hàng hoạt động');
          const [created] = await tx
            .insert(stores)
            .values({
              code: input.code,
              name: input.name,
              groupId: group.id,
              kind: input.kind.toLocaleLowerCase('en-US') as 'retail' | 'wholesale',
              address: input.address,
              isActive: true,
            })
            .returning();
          if (!created) throw new Error('Store insert did not return a row');
          const data = storeDto(created);
          await tx
            .insert(auditLogs)
            .values(
              auditValue(actor, context, 'STORE_CREATED', 'store', data.id, null, storeJson(data)),
            );
          return {
            value: data,
            responseStatus: 201,
            responseBody: storeJson(data),
            resourceType: 'store',
            resourceId: data.id,
          };
        },
      );
      return {
        data: result.replayed ? StoreSchema.parse(result.responseBody) : result.value,
        replayed: result.replayed,
      };
    });
  }

  public async updateStore(
    actor: AuthenticatedPrincipal,
    storeId: string,
    input: UpdateStoreRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<Store>> {
    requirePostgresAdmin(actor);
    return withStoreLifecycleErrors('Mã cửa hàng đã tồn tại', async () => {
      const result = await withIdempotency(
        db,
        {
          scope: 'store:update',
          key: `${actor.accountId}:${idempotencyKey}`,
          requestHash,
        },
        async (tx) => {
          const [current] = await tx
            .select()
            .from(stores)
            .where(and(eq(stores.id, storeId), isNull(stores.deletedAt)))
            .for('update')
            .limit(1);
          if (!current) throw notFound('Không tìm thấy cửa hàng');
          if (current.version !== input.expectedVersion) throw storeLifecycleVersionConflict();
          const targetStatus = input.status ?? (current.isActive ? 'ACTIVE' : 'INACTIVE');
          if (input.groupId !== undefined || targetStatus === 'ACTIVE') {
            const [targetGroup] = await tx
              .select({ id: storeGroups.id })
              .from(storeGroups)
              .where(
                and(
                  eq(storeGroups.id, input.groupId ?? current.groupId),
                  eq(storeGroups.isActive, true),
                ),
              )
              .limit(1);
            if (!targetGroup) {
              throw new ApiError(
                'VALIDATION_ERROR',
                'Cửa hàng hoạt động phải thuộc một nhóm đang hoạt động',
                400,
                { field: 'groupId' },
              );
            }
          }
          const before = storeDto(current);
          const [updated] = await tx
            .update(stores)
            .set({
              name: input.name,
              groupId: input.groupId,
              kind:
                input.kind === undefined
                  ? undefined
                  : (input.kind.toLocaleLowerCase('en-US') as 'retail' | 'wholesale'),
              isActive: input.status === undefined ? undefined : input.status === 'ACTIVE',
              address: input.address,
              version: sql`${stores.version} + 1`,
              updatedAt: new Date(),
            })
            .where(and(eq(stores.id, storeId), eq(stores.version, input.expectedVersion)))
            .returning();
          if (!updated) throw storeLifecycleVersionConflict();
          const data = storeDto(updated);
          await tx
            .insert(auditLogs)
            .values(
              auditValue(
                actor,
                context,
                'STORE_UPDATED',
                'store',
                data.id,
                storeJson(before),
                storeJson(data),
              ),
            );
          return {
            value: data,
            responseStatus: 200,
            responseBody: storeJson(data),
            resourceType: 'store',
            resourceId: data.id,
          };
        },
      );
      return {
        data: result.replayed ? StoreSchema.parse(result.responseBody) : result.value,
        replayed: result.replayed,
      };
    });
  }

  public async listOrderRequests(
    actor: AuthenticatedPrincipal,
    query: ListStoreOrderRequestsQuery,
  ): Promise<Page<StoreOrderRequest>> {
    if (query.storeId !== undefined && !canAccessStore(actor, query.storeId)) throw forbidden();
    const rows = await db
      .select()
      .from(orderRequests)
      .where(isNull(orderRequests.deletedAt))
      .orderBy(asc(orderRequests.createdAt));
    const filtered = rows.filter(
      (row) =>
        canAccessStore(actor, row.storeId) &&
        (query.storeId === undefined || row.storeId === query.storeId) &&
        (query.sessionId === undefined || row.orderSessionId === query.sessionId) &&
        (query.status === undefined || orderStatus(row.status) === query.status),
    );
    const selected = slicePage(filtered, query.page, query.pageSize);
    const data = await Promise.all(selected.map((row) => this.requestDto(row.id)));
    return {
      data,
      pagination: pagination(query.page, query.pageSize, filtered.length),
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
    try {
      const result = await submitDatabaseOrderRequest(db, {
        orderSessionId: input.businessSessionId,
        storeId: input.storeId,
        requestedByUserId: actor.accountId,
        items: input.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          ...(item.note ? { notes: item.note } : {}),
        })),
        idempotencyKey: `${actor.accountId}:${idempotencyKey}`,
        requestHash,
        onCreated: async (tx, created) => {
          const requestForAudit: StoreOrderRequest = {
            id: created.id,
            sessionId: input.businessSessionId,
            storeId: input.storeId,
            requestSequence: created.requestNumber === 2 ? 2 : 1,
            status: 'SUBMITTED',
            lines: input.items.map((item) => ({
              productId: item.productId,
              requested: { kind: 'UNIT', quantity: item.quantity },
              priority: 'P1',
              ...(item.note ? { note: item.note } : {}),
            })),
            submittedByAccountId: actor.accountId,
            submittedAt: created.submittedAt.toISOString(),
            cancelledAt: null,
          };
          await tx
            .insert(auditLogs)
            .values(
              auditValue(
                actor,
                context,
                'ORDER_REQUEST_SUBMITTED',
                'order_request',
                created.id,
                null,
                requestJson(requestForAudit),
              ),
            );
        },
      });
      const resourceId = result.replayed ? result.resourceId : result.value.id;
      if (!resourceId) throw new Error('Idempotent order response has no resource id');
      const data = await this.requestDto(resourceId);
      return { data, replayed: result.replayed };
    } catch (error: unknown) {
      if (error instanceof RequestLimitExceededError) {
        throw new ApiError(
          'REQUEST_LIMIT_REACHED',
          'Mỗi cửa hàng chỉ được gửi tối đa hai yêu cầu trong một phiên',
          409,
        );
      }
      if (error instanceof OrderRequestAuthorizationError) throw forbidden();
      if (error instanceof OrderSessionUnavailableError) {
        throw new ApiError('SESSION_NOT_OPEN', 'Phiên đặt hàng chưa mở hoặc đã đóng', 409);
      }
      if (error instanceof IdempotencyConflictError) {
        throw new ApiError(
          'IDEMPOTENCY_CONFLICT',
          'Khóa idempotency đã được dùng cho nội dung khác',
          409,
        );
      }
      if (error instanceof IdempotencyInProgressError) {
        throw conflict('Yêu cầu cùng khóa idempotency đang được xử lý');
      }
      if (error instanceof ActiveWaitTicketExistsError) {
        throw conflict('Cửa hàng đã có yêu cầu chờ đang hoạt động cho mặt hàng này');
      }
      throw error;
    }
  }

  public async cancelOrderRequest(
    actor: AuthenticatedPrincipal,
    requestId: string,
    input: CancelStoreOrderRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<StoreOrderRequest>> {
    const current = await this.requestDto(requestId);
    if (!canAccessStore(actor, current.storeId)) throw forbidden();

    try {
      const result = await withIdempotency(
        db,
        {
          scope: `order-request.cancel:${requestId}`,
          key: `${actor.accountId}:${idempotencyKey}`,
          requestHash,
        },
        (tx) =>
          withAdvisoryLock(tx, 'order-request', requestId, async () => {
            const [session] = await tx
              .select({
                status: orderSessions.status,
                requestClosesAt: orderSessions.inventorySnapshotDueAt,
                deletedAt: orderSessions.deletedAt,
              })
              .from(orderSessions)
              .where(eq(orderSessions.id, current.sessionId))
              .for('update')
              .limit(1);
            const now = new Date();
            if (
              !session ||
              session.status !== 'open' ||
              session.deletedAt !== null ||
              isRequestDeadlineClosed(session.requestClosesAt, now)
            ) {
              throw conflict('Đã quá thời hạn hủy yêu cầu trong phiên đặt hàng');
            }

            const [row] = await tx
              .select()
              .from(orderRequests)
              .where(and(eq(orderRequests.id, requestId), isNull(orderRequests.deletedAt)))
              .for('update')
              .limit(1);
            if (!row) throw notFound('Không tìm thấy yêu cầu đặt hàng');
            if (row.status !== 'submitted') {
              throw conflict('Chỉ có thể hủy yêu cầu chưa được gộp hoặc phân bổ');
            }

            const [updated] = await tx
              .update(orderRequests)
              .set({
                status: 'cancelled',
                cancelledAt: now,
                cancellationReason: input.reason,
                updatedAt: now,
              })
              .where(and(eq(orderRequests.id, requestId), eq(orderRequests.status, 'submitted')))
              .returning({ id: orderRequests.id });
            if (!updated) throw conflict('Yêu cầu đặt hàng đã thay đổi, vui lòng tải lại');

            const after: StoreOrderRequest = {
              ...current,
              status: 'CANCELLED',
              cancelledAt: now.toISOString(),
              cancellationReason: input.reason,
            };
            await tx.insert(auditLogs).values({
              ...auditValue(
                actor,
                context,
                'ORDER_REQUEST_CANCELLED',
                'order_request',
                requestId,
                requestJson(current),
                requestJson(after),
              ),
              metadata: { reason: input.reason },
            });
            return {
              value: { requestId },
              responseStatus: 200,
              responseBody: { requestId },
              resourceType: 'order_request',
              resourceId: requestId,
            };
          }),
      );
      const resourceId = result.replayed ? result.resourceId : result.value.requestId;
      if (!resourceId) throw new Error('Idempotent cancellation has no order request id');
      return { data: await this.requestDto(resourceId), replayed: result.replayed };
    } catch (error: unknown) {
      if (error instanceof IdempotencyConflictError) {
        throw new ApiError(
          'IDEMPOTENCY_CONFLICT',
          'Khóa idempotency đã được dùng cho nội dung khác',
          409,
        );
      }
      if (error instanceof IdempotencyInProgressError) {
        throw conflict('Yêu cầu cùng khóa idempotency đang được xử lý');
      }
      throw error;
    }
  }

  public async listWarehouseOutboundRequests(
    actor: AuthenticatedPrincipal,
    query: ListWarehouseOutboundRequestsQuery,
  ): Promise<Page<WarehouseOutboundRequest>> {
    if (query.storeId !== undefined && !canAccessStore(actor, query.storeId)) throw forbidden();
    const storeIds =
      actor.role === 'ADMIN'
        ? query.storeId === undefined
          ? undefined
          : [query.storeId]
        : actor.role === 'STORE'
          ? actor.storeId === null
            ? []
            : [actor.storeId]
          : query.storeId === undefined
            ? actor.assignedStoreIds
            : [query.storeId];
    const result = await listDatabaseWarehouseOutboundRequests(db, {
      page: query.page,
      pageSize: query.pageSize,
      ...(storeIds === undefined ? {} : { storeIds }),
      ...(query.status === undefined
        ? {}
        : { status: databaseWarehouseOutboundStatus(query.status) }),
      ...(query.allocationRunId === undefined ? {} : { allocationRunId: query.allocationRunId }),
    });
    return {
      data: result.data.map(warehouseOutboundRequestDto),
      pagination: result.pagination,
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
    return withWarehouseOutboundErrors(async () => {
      const current = await getDatabaseWarehouseOutboundRequest(db, outboundRequestId);
      if (!canAccessStore(actor, current.storeId)) throw forbidden();
      const result = await dispatchDatabaseWarehouseOutboundRequest(db, {
        outboundRequestId,
        expectedVersion: input.expectedVersion,
        dispatchedByUserId: actor.accountId,
        dispatchNote: input.dispatchNote ?? null,
        idempotencyKey: `${actor.accountId}:${idempotencyKey}`,
        requestHash,
        requestId: context.requestId,
      });
      const resourceId = result.replayed ? result.resourceId : result.value.id;
      if (!resourceId) throw new Error('Idempotent warehouse dispatch has no resource id');
      return {
        data: warehouseOutboundRequestDto(
          await getDatabaseWarehouseOutboundRequest(db, resourceId),
        ),
        replayed: result.replayed,
      };
    });
  }

  public async listReceipts(
    actor: AuthenticatedPrincipal,
    query: ListReceiptsQuery,
  ): Promise<Page<Receipt>> {
    if (query.storeId !== undefined && !canAccessStore(actor, query.storeId)) throw forbidden();
    if (actor.role === 'STORE' && actor.storeId === null) {
      return { data: [], pagination: pagination(query.page, query.pageSize, 0) };
    }
    if (actor.role === 'HTKD' && actor.assignedStoreIds.length === 0) {
      return { data: [], pagination: pagination(query.page, query.pageSize, 0) };
    }

    const conditions: SQL[] = [isNull(storeReceipts.deletedAt)];
    if (query.storeId !== undefined) {
      conditions.push(eq(storeReceipts.storeId, query.storeId));
    } else if (actor.role === 'STORE' && actor.storeId !== null) {
      conditions.push(eq(storeReceipts.storeId, actor.storeId));
    } else if (actor.role === 'HTKD') {
      conditions.push(inArray(storeReceipts.storeId, [...actor.assignedStoreIds]));
    }
    if (query.outboundRequestId !== undefined) {
      conditions.push(eq(storeReceipts.outboundRequestId, query.outboundRequestId));
    }
    if (query.status !== undefined) {
      conditions.push(eq(storeReceipts.status, databaseReceiptStatus(query.status)));
    }

    const where = and(...conditions);
    const [totalRow] = await db.select({ value: count() }).from(storeReceipts).where(where);
    const rows = await db
      .select({ id: storeReceipts.id })
      .from(storeReceipts)
      .where(where)
      .orderBy(desc(storeReceipts.createdAt), desc(storeReceipts.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    return {
      data: await Promise.all(rows.map((row) => this.receiptDto(row.id))),
      pagination: pagination(query.page, query.pageSize, totalRow?.value ?? 0),
    };
  }

  public async listStoreReceiptSources(
    actor: AuthenticatedPrincipal,
    query: ListStoreReceiptSourcesQuery,
  ): Promise<Page<StoreReceiptSource>> {
    if (query.storeId !== undefined && !canAccessStore(actor, query.storeId)) throw forbidden();

    if (actor.role === 'ADMIN') {
      return receiptSourcePage(
        await listDatabaseStoreReceiptSources(db, {
          page: query.page,
          pageSize: query.pageSize,
          ...(query.storeId === undefined ? {} : { storeId: query.storeId }),
        }),
      );
    }

    if (actor.role === 'STORE') {
      if (actor.storeId === null) {
        return { data: [], pagination: pagination(query.page, query.pageSize, 0) };
      }
      return receiptSourcePage(
        await listDatabaseStoreReceiptSources(db, {
          page: query.page,
          pageSize: query.pageSize,
          storeId: actor.storeId,
        }),
      );
    }

    if (query.storeId !== undefined) {
      return receiptSourcePage(
        await listDatabaseStoreReceiptSources(db, {
          page: query.page,
          pageSize: query.pageSize,
          storeId: query.storeId,
        }),
      );
    }
    return listAssignedStoreReceiptSources(actor.assignedStoreIds, query);
  }

  public async getReceipt(actor: AuthenticatedPrincipal, receiptId: string): Promise<Receipt> {
    const receipt = await this.receiptDto(receiptId);
    if (!canAccessStore(actor, receipt.storeId)) throw forbidden();
    return receipt;
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
    try {
      const result = await declareDatabaseStoreReceipt(db, {
        outboundRequestId: input.outboundRequestId,
        storeId: input.storeId,
        declaredByUserId: actor.accountId,
        lines: input.lines.map((line) => ({
          productId: line.productId,
          approvedQuantity: line.approvedUnits,
          receivedQuantity: line.receivedUnits,
        })),
        discrepancyNote: input.discrepancyNote,
        requestId: context.requestId,
        idempotencyKey: `${actor.accountId}:${idempotencyKey}`,
        requestHash,
      });
      const resourceId = result.replayed ? result.resourceId : result.value.receiptId;
      if (!resourceId) throw new Error('Idempotent receipt declaration has no resource id');
      return { data: await this.receiptDto(resourceId), replayed: result.replayed };
    } catch (error: unknown) {
      throwReceiptError(error);
    }
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
    const current = await this.getReceipt(actor, receiptId);
    if (actor.role !== 'STORE' || actor.storeId !== current.storeId) throw forbidden();
    try {
      const result = await submitDatabaseStoreReceipt(db, {
        receiptId,
        expectedVersion: input.expectedVersion,
        submittedByUserId: actor.accountId,
        lines: input.lines.map((line) => ({
          productId: line.productId,
          approvedQuantity: line.approvedUnits,
          receivedQuantity: line.receivedUnits,
        })),
        discrepancyNote: input.discrepancyNote,
        requestId: context.requestId,
        idempotencyKey: `${actor.accountId}:${idempotencyKey}`,
        requestHash,
      });
      const resourceId = result.replayed ? result.resourceId : result.value.receiptId;
      if (!resourceId) throw new Error('Idempotent receipt submission has no resource id');
      return { data: await this.receiptDto(resourceId), replayed: result.replayed };
    } catch (error: unknown) {
      throwReceiptError(error);
    }
  }

  public async returnStoreReceiptForCorrection(
    actor: AuthenticatedPrincipal,
    receiptId: string,
    input: ReturnReceiptForCorrectionRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<Receipt>> {
    const current = await this.getReceipt(actor, receiptId);
    if (actor.role === 'STORE' || !canAccessStore(actor, current.storeId)) throw forbidden();
    try {
      const result = await returnDatabaseStoreReceiptForCorrection(db, {
        receiptId,
        expectedVersion: input.expectedVersion,
        reviewedByUserId: actor.accountId,
        reason: input.reason,
        requestId: context.requestId,
        idempotencyKey: `${actor.accountId}:${idempotencyKey}`,
        requestHash,
      });
      const resourceId = result.replayed ? result.resourceId : result.value.receiptId;
      if (!resourceId) throw new Error('Idempotent receipt return has no resource id');
      return { data: await this.receiptDto(resourceId), replayed: result.replayed };
    } catch (error: unknown) {
      throwReceiptError(error);
    }
  }

  public async finalizeStoreReceipt(
    actor: AuthenticatedPrincipal,
    receiptId: string,
    input: FinalizeReceiptRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<Receipt>> {
    const current = await this.getReceipt(actor, receiptId);
    if (actor.role === 'STORE' || !canAccessStore(actor, current.storeId)) throw forbidden();
    assertFinalizationMatchesDeclaration(current, input);
    try {
      const result = await finalizeDatabaseStoreReceipt(db, {
        receiptId,
        expectedVersion: input.expectedVersion,
        reviewedByUserId: actor.accountId,
        freightVnd: BigInt(input.freightVnd),
        handlingVnd: BigInt(input.handlingVnd),
        lines: input.lines.map((line) => ({
          productId: line.productId,
          pricePerKgVnd: line.pricePerKgVnd === null ? null : BigInt(line.pricePerKgVnd),
          bagWeightsKg: line.bagWeightsKg,
        })),
        requestId: context.requestId,
        idempotencyKey: `${actor.accountId}:${idempotencyKey}`,
        requestHash,
      });
      const resourceId = result.replayed ? result.resourceId : result.value.receiptId;
      if (!resourceId) throw new Error('Idempotent receipt finalization has no resource id');
      return { data: await this.receiptDto(resourceId), replayed: result.replayed };
    } catch (error: unknown) {
      throwReceiptError(error);
    }
  }

  public async listStoreInventoryBags(
    actor: AuthenticatedPrincipal,
    query: ListStoreInventoryBagsQuery,
  ): Promise<Page<StoreInventoryBag>> {
    if (query.storeId !== undefined && !canAccessStore(actor, query.storeId)) throw forbidden();
    const filters = {
      page: query.page,
      pageSize: query.pageSize,
      ...(query.productId === undefined ? {} : { productId: query.productId }),
      ...(query.status === undefined ? {} : { status: databaseInventoryStatus(query.status) }),
      ...(query.bagCode === undefined ? {} : { bagCode: query.bagCode }),
    };
    if (actor.role === 'ADMIN') {
      return inventoryBagPage(
        await listDatabaseStoreInventoryBags(db, {
          ...filters,
          ...(query.storeId === undefined ? {} : { storeId: query.storeId }),
        }),
      );
    }
    if (actor.role === 'STORE') {
      if (actor.storeId === null) return emptyPage(query.page, query.pageSize);
      return inventoryBagPage(
        await listDatabaseStoreInventoryBags(db, { ...filters, storeId: actor.storeId }),
      );
    }
    if (query.storeId !== undefined) {
      return inventoryBagPage(
        await listDatabaseStoreInventoryBags(db, { ...filters, storeId: query.storeId }),
      );
    }
    return listAssignedStoreInventoryBags(actor.assignedStoreIds, query);
  }

  public async listStoreInventoryBagLedger(
    actor: AuthenticatedPrincipal,
    bagId: string,
    query: ListStoreInventoryBagLedgerQuery,
  ): Promise<Page<StoreInventoryBagLedgerEntry>> {
    const bag = await this.inventoryBagDto(bagId);
    if (!canAccessStore(actor, bag.storeId)) throw forbidden();
    if (query.storeId !== undefined && !canAccessStore(actor, query.storeId)) throw forbidden();
    if (
      (query.storeId !== undefined && query.storeId !== bag.storeId) ||
      (query.productId !== undefined && query.productId !== bag.productId)
    ) {
      return emptyPage(query.page, query.pageSize);
    }
    return inventoryLedgerPage(
      await listDatabaseStoreInventoryLedger(db, {
        page: query.page,
        pageSize: query.pageSize,
        bagId,
        storeId: bag.storeId,
        ...(query.productId === undefined ? {} : { productId: query.productId }),
      }),
    );
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
    if (actor.role !== 'STORE' || actor.storeId === null) throw forbidden();
    const storeId = actor.storeId;
    const current = await this.inventoryBagDto(bagId);
    if (current.storeId !== storeId) throw forbidden();
    return withStoreInventoryErrors(async () => {
      const result = await openDatabaseStoreInventoryBag(db, {
        bagId,
        storeId,
        expectedVersion: input.expectedVersion,
        actorUserId: actor.accountId,
        idempotencyKey: `${actor.accountId}:${idempotencyKey}`,
        requestHash,
        requestId: context.requestId,
      });
      const resourceId = result.replayed ? result.resourceId : result.value.bagId;
      if (!resourceId) throw new Error('Idempotent inventory opening has no resource id');
      return { data: await this.inventoryBagDto(resourceId), replayed: result.replayed };
    });
  }

  public async listStoreOutbounds(
    actor: AuthenticatedPrincipal,
    query: ListStoreOutboundsQuery,
  ): Promise<Page<StoreOutbound>> {
    if (query.storeId !== undefined && !canAccessStore(actor, query.storeId)) throw forbidden();
    const filters = {
      page: query.page,
      pageSize: query.pageSize,
      ...(query.inventoryLotId === undefined ? {} : { inventoryBagId: query.inventoryLotId }),
      ...(query.status === undefined ? {} : { status: databaseOutboundStatus(query.status) }),
      ...(query.reason === undefined ? {} : { reason: databaseOutboundReason(query.reason) }),
    } as const;
    if (actor.role === 'ADMIN') {
      return storeOutboundPage(
        await listDatabaseStoreOutbounds(db, {
          ...filters,
          ...(query.storeId === undefined ? {} : { storeId: query.storeId }),
        }),
      );
    }
    if (actor.role === 'STORE') {
      if (actor.storeId === null) return emptyPage(query.page, query.pageSize);
      return storeOutboundPage(
        await listDatabaseStoreOutbounds(db, { ...filters, storeId: actor.storeId }),
      );
    }
    if (query.storeId !== undefined) {
      return storeOutboundPage(
        await listDatabaseStoreOutbounds(db, { ...filters, storeId: query.storeId }),
      );
    }
    return listAssignedStoreOutbounds(actor.assignedStoreIds, query);
  }

  public async createStoreOutbound(
    actor: AuthenticatedPrincipal,
    input: CreateStoreOutboundRequest,
    idempotencyKey: string,
    requestHash: string,
    context: RequestContext,
  ): Promise<IdempotentResource<StoreOutbound>> {
    await this.authorizeRetailStoreOperation(actor);
    if (actor.role !== 'STORE' || actor.storeId !== input.storeId) throw forbidden();
    const bag = await this.inventoryBagDto(input.inventoryLotId);
    if (bag.storeId !== actor.storeId) throw forbidden();
    return withStoreInventoryErrors(async () => {
      const result = await createDatabaseStoreOutbound(db, {
        storeId: input.storeId,
        inventoryBagId: input.inventoryLotId,
        expectedInventoryVersion: input.expectedInventoryVersion,
        weightKg: input.weightKg,
        reason: databaseOutboundReason(input.reason),
        revenueVnd: input.revenueVnd === null ? null : BigInt(input.revenueVnd),
        createdByUserId: actor.accountId,
        idempotencyKey: `${actor.accountId}:${idempotencyKey}`,
        requestHash,
        requestId: context.requestId,
      });
      const resourceId = result.replayed ? result.resourceId : result.value.outboundId;
      if (!resourceId) throw new Error('Idempotent store outbound creation has no resource id');
      return { data: await this.storeOutboundDto(resourceId), replayed: result.replayed };
    });
  }

  public async reviewStoreOutbound(
    actor: AuthenticatedPrincipal,
    outboundId: string,
    input: ReviewStoreOutboundRequest,
    idempotencyKey: string,
    requestHash: string,
    _context: RequestContext,
  ): Promise<IdempotentResource<StoreOutbound>> {
    if (actor.role === 'STORE') throw forbidden();
    const current = await this.storeOutboundDto(outboundId);
    if (!canAccessStore(actor, current.storeId)) throw forbidden();
    return withStoreInventoryErrors(async () => {
      const result = await reviewDatabaseStoreOutbound(db, {
        outboundId,
        expectedVersion: input.expectedVersion,
        reviewedByUserId: actor.accountId,
        decision: input.decision === 'APPROVE' ? 'approve' : 'reject',
        note: input.note,
        idempotencyKey: `${actor.accountId}:${idempotencyKey}`,
        requestHash,
      });
      const resourceId = result.replayed ? result.resourceId : result.value.outboundId;
      if (!resourceId) throw new Error('Idempotent store outbound review has no resource id');
      return { data: await this.storeOutboundDto(resourceId), replayed: result.replayed };
    });
  }

  public async listStoreTransfers(
    actor: AuthenticatedPrincipal,
    query: ListStoreTransfersQuery,
  ): Promise<Page<StoreTransfer>> {
    if (query.storeId !== undefined && !canAccessStore(actor, query.storeId)) throw forbidden();
    const filters = {
      page: query.page,
      pageSize: query.pageSize,
      ...(query.sourceStoreId === undefined ? {} : { sourceStoreId: query.sourceStoreId }),
      ...(query.destinationStoreId === undefined
        ? {}
        : { destinationStoreId: query.destinationStoreId }),
      ...(query.productId === undefined ? {} : { productId: query.productId }),
      ...(query.status === undefined ? {} : { status: databaseTransferStatus(query.status) }),
    } as const;
    if (actor.role === 'ADMIN') {
      return storeTransferPage(
        await listDatabaseStoreTransfers(db, {
          ...filters,
          ...(query.storeId === undefined ? {} : { storeId: query.storeId }),
        }),
      );
    }
    if (actor.role === 'STORE') {
      if (actor.storeId === null) return emptyPage(query.page, query.pageSize);
      return storeTransferPage(
        await listDatabaseStoreTransfers(db, { ...filters, storeId: actor.storeId }),
      );
    }
    if (query.storeId !== undefined) {
      return storeTransferPage(
        await listDatabaseStoreTransfers(db, { ...filters, storeId: query.storeId }),
      );
    }
    return storeTransferPage(
      await listDatabaseStoreTransfers(db, {
        ...filters,
        storeIds: [...new Set(actor.assignedStoreIds)],
      }),
    );
  }

  public async listStoreTransferDestinations(
    actor: AuthenticatedPrincipal,
  ): Promise<readonly Store[]> {
    await this.authorizeRetailStoreOperation(actor);
    const storeId = actor.storeId;
    if (storeId === null) throw forbidden();
    const rows = await db
      .select()
      .from(stores)
      .where(
        and(
          isNull(stores.deletedAt),
          eq(stores.isActive, true),
          eq(stores.kind, 'retail'),
          ne(stores.id, storeId),
        ),
      )
      .orderBy(asc(stores.displayOrder), asc(stores.code));
    return rows.map(storeDto);
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
    return withStoreTransferErrors(async () => {
      const result = await createDatabaseStoreTransfer(db, {
        ...input,
        actorUserId: actor.accountId,
        idempotencyKey: `${actor.accountId}:${idempotencyKey}`,
        requestHash,
        requestId: context.requestId,
      });
      const resourceId = result.replayed ? result.resourceId : result.value.transferId;
      if (!resourceId) throw new Error('Idempotent transfer creation has no resource id');
      return { data: await this.storeTransferDto(resourceId), replayed: result.replayed };
    });
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
    const current = await this.storeTransferDto(transferId);
    if (current.sourceStoreId !== actor.storeId) throw forbidden();
    return withStoreTransferErrors(async () => {
      const result = await dispatchDatabaseStoreTransfer(db, {
        transferId,
        ...input,
        actorUserId: actor.accountId,
        idempotencyKey: `${actor.accountId}:${idempotencyKey}`,
        requestHash,
        requestId: context.requestId,
      });
      const resourceId = result.replayed ? result.resourceId : result.value.transferId;
      if (!resourceId) throw new Error('Idempotent transfer dispatch has no resource id');
      return { data: await this.storeTransferDto(resourceId), replayed: result.replayed };
    });
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
    const current = await this.storeTransferDto(transferId);
    if (current.destinationStoreId !== actor.storeId) throw forbidden();
    return withStoreTransferErrors(async () => {
      const result = await receiveDatabaseStoreTransfer(db, {
        transferId,
        ...input,
        actorUserId: actor.accountId,
        idempotencyKey: `${actor.accountId}:${idempotencyKey}`,
        requestHash,
        requestId: context.requestId,
      });
      const resourceId = result.replayed ? result.resourceId : result.value.transferId;
      if (!resourceId) throw new Error('Idempotent transfer receipt has no resource id');
      return { data: await this.storeTransferDto(resourceId), replayed: result.replayed };
    });
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
    const current = await this.storeTransferDto(transferId);
    if (current.sourceStoreId !== actor.storeId) throw forbidden();
    return withStoreTransferErrors(async () => {
      const result = await cancelDatabaseStoreTransfer(db, {
        transferId,
        ...input,
        actorUserId: actor.accountId,
        idempotencyKey: `${actor.accountId}:${idempotencyKey}`,
        requestHash,
        requestId: context.requestId,
      });
      const resourceId = result.replayed ? result.resourceId : result.value.transferId;
      if (!resourceId) throw new Error('Idempotent transfer cancellation has no resource id');
      return { data: await this.storeTransferDto(resourceId), replayed: result.replayed };
    });
  }

  public async listWaitTickets(
    actor: AuthenticatedPrincipal,
    query: ListWaitTicketsQuery,
  ): Promise<Page<WaitTicket>> {
    return withWaitErrors(async () => {
      const status = databaseWaitTicketFilter(query.status);
      const result = await listDatabaseWaitTickets(db, {
        actorUserId: actor.accountId,
        page: query.page,
        pageSize: query.pageSize,
        ...(query.storeId === undefined ? {} : { storeId: query.storeId }),
        ...(query.productId === undefined ? {} : { productId: query.productId }),
        ...(query.sessionId === undefined ? {} : { sessionId: query.sessionId }),
        ...(query.priority === undefined ? {} : { priorityLevel: query.priority }),
        ...status,
      });
      return {
        data: result.data.map(waitTicketDto),
        pagination: result.pagination,
      };
    });
  }

  public async getWaitTicketHistory(
    actor: AuthenticatedPrincipal,
    waitTicketId: string,
    limit: number,
  ): Promise<WaitTicketHistory> {
    return withWaitErrors(async () => {
      const history = await getDatabaseWaitTicketHistory(db, {
        actorUserId: actor.accountId,
        waitTicketId,
        limit,
      });
      return {
        ticket: waitTicketDto(history.ticket),
        offers: history.offers.map(priorityOfferDto),
        audit: history.audit.map((event) => ({
          id: event.id,
          requestId: event.requestId,
          actorAccountId: event.actorUserId,
          actorRole:
            event.actorRole === null
              ? null
              : (event.actorRole.toUpperCase() as AuthenticatedPrincipal['role']),
          actorStoreId: event.actorStoreId,
          action: event.action,
          entityType:
            event.entityType === 'priority_offer'
              ? ('PRIORITY_OFFER' as const)
              : ('WAIT_TICKET' as const),
          entityId: event.entityId,
          before: event.before,
          after: event.after,
          metadata: event.metadata,
          createdAt: event.createdAt.toISOString(),
        })),
      };
    });
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
    return withWaitErrors(async () => {
      const result = await cancelDatabaseWaitTicket(db, {
        waitTicketId,
        actorUserId: actor.accountId,
        reason: input.reason,
        requestId: context.requestId,
        idempotencyKey: `${actor.accountId}:${idempotencyKey}`,
        requestHash,
      });
      const resourceId = result.replayed ? result.resourceId : result.value.waitTicketId;
      if (!resourceId) throw new Error('Idempotent wait cancellation has no resource id');
      const history = await getDatabaseWaitTicketHistory(db, {
        actorUserId: actor.accountId,
        waitTicketId: resourceId,
        limit: 1,
      });
      return { data: waitTicketDto(history.ticket), replayed: result.replayed };
    });
  }

  public async listPriorityOffers(
    actor: AuthenticatedPrincipal,
    query: ListPriorityOffersQuery,
  ): Promise<Page<PriorityOffer>> {
    return withWaitErrors(async () => {
      const result = await listDatabasePriorityOffers(db, {
        actorUserId: actor.accountId,
        page: query.page,
        pageSize: query.pageSize,
        ...(query.waitTicketId === undefined ? {} : { waitTicketId: query.waitTicketId }),
        ...(query.storeId === undefined ? {} : { storeId: query.storeId }),
        ...(query.status === undefined
          ? {}
          : { status: databasePriorityOfferStatus(query.status) }),
      });
      return {
        data: result.data.map(priorityOfferDto),
        pagination: result.pagination,
      };
    });
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
    if (actor.role !== 'STORE') throw forbidden();
    const response = databasePriorityOfferResponse(input);
    return withWaitErrors(async () => {
      const result = await respondDatabasePriorityOffer(db, {
        offerId,
        actorUserId: actor.accountId,
        ...response,
        requestId: context.requestId,
        idempotencyKey: `${actor.accountId}:${idempotencyKey}`,
        requestHash,
      });
      const resourceId = result.replayed ? result.resourceId : result.value.offerId;
      if (!resourceId) throw new Error('Idempotent priority-offer response has no resource id');
      return {
        data: await this.priorityOfferDto(actor, resourceId),
        replayed: result.replayed,
      };
    });
  }

  public async getMonthlyOperationalReport(
    actor: AuthenticatedPrincipal,
    query: MonthlyOperationalReportQuery,
  ): Promise<MonthlyOperationalReport> {
    const scope = await this.authorizeMonthlyReportScope(actor, query);
    return monthlyOperationalReportDto(
      await loadMonthlyOperationalReport(db, {
        year: query.year,
        month: query.month,
        scope,
      }),
    );
  }

  public async getOrderStatistics(
    actor: AuthenticatedPrincipal,
    storeCode: string,
    from: string,
    to: string,
  ): Promise<OrderStatistics> {
    const [store] = await db
      .select({ id: stores.id, code: stores.code })
      .from(stores)
      .where(and(eq(stores.code, storeCode), isNull(stores.deletedAt)))
      .limit(1);
    if (!store) throw notFound('Không tìm thấy cửa hàng');
    if (!canAccessStore(actor, store.id)) throw forbidden('Không có quyền xem cửa hàng này');

    const { start, endExclusive } = asiaHoChiMinhDateRange(from, to);
    const rows = await db
      .select({
        productId: products.id,
        sku: products.sku,
        name: products.name,
        revenueVnd: storeOutbounds.revenueVnd,
        weightKg: storeOutbounds.weightKg,
      })
      .from(storeOutbounds)
      .innerJoin(storeInventoryBags, eq(storeOutbounds.storeInventoryBagId, storeInventoryBags.id))
      .innerJoin(products, eq(storeInventoryBags.productId, products.id))
      .where(
        and(
          eq(storeOutbounds.storeId, store.id),
          eq(storeOutbounds.status, 'approved'),
          eq(storeOutbounds.reason, 'discount_sale'),
          gte(storeOutbounds.createdAt, start),
          lt(storeOutbounds.createdAt, endExclusive),
          isNull(storeOutbounds.deletedAt),
        ),
      );
    const grouped = new Map<
      string,
      { productId: string; sku: string; name: string; revenueVnd: bigint; weightGrams: bigint }
    >();
    for (const row of rows) {
      const current = grouped.get(row.productId) ?? {
        productId: row.productId,
        sku: row.sku,
        name: row.name,
        revenueVnd: 0n,
        weightGrams: 0n,
      };
      current.revenueVnd += row.revenueVnd ?? 0n;
      current.weightGrams += kilogramsToGrams(row.weightKg);
      grouped.set(row.productId, current);
    }
    const revenue = [...grouped.values()].reduce((sum, row) => sum + row.revenueVnd, 0n);
    const grams = [...grouped.values()].reduce((sum, row) => sum + row.weightGrams, 0n);
    return {
      storeCode,
      period: { from, to },
      totals: {
        revenueByType: { NORMAL: 0, SALE_KG: safeVnd(revenue), SALE_PIECE: 0 },
        revenue: safeVnd(revenue),
        weight: {
          actualKg: gramsToKilograms(grams),
          estimatedKg: '0.000',
          totalKg: gramsToKilograms(grams),
          isComplete: true,
        },
      },
      products: [...grouped.values()]
        .sort((left, right) => left.sku.localeCompare(right.sku))
        .map((row) => ({
          productId: row.productId,
          sku: row.sku,
          name: row.name,
          revenueVnd: safeVnd(row.revenueVnd),
          weightKg: gramsToKilograms(row.weightGrams),
        })),
      generatedAt: new Date().toISOString(),
    };
  }

  private async orderSessionById(sessionId: string): Promise<OrderSession> {
    const [row] = await db
      .select()
      .from(orderSessions)
      .where(and(eq(orderSessions.id, sessionId), isNull(orderSessions.deletedAt)))
      .limit(1);
    if (!row) throw notFound('Không tìm thấy phiên đặt hàng');
    return orderSessionDto(row);
  }

  private async credentialsFromRow(
    account: typeof users.$inferSelect,
  ): Promise<AccountCredentials> {
    const assignedStoreIds =
      account.role === 'htkd'
        ? (
            await db
              .select({ storeId: htkdAssignments.storeId })
              .from(htkdAssignments)
              .where(and(eq(htkdAssignments.userId, account.id), isNull(htkdAssignments.revokedAt)))
          ).map((assignment) => assignment.storeId)
        : [];
    return {
      id: account.id,
      username: account.email,
      displayName: account.displayName,
      role: account.role.toUpperCase() as AccountCredentials['role'],
      status: account.status.toUpperCase() as AccountCredentials['status'],
      storeId: account.storeId,
      passwordHash: account.passwordHash,
      sessionVersion: account.tokenVersion,
      assignedStoreIds,
    };
  }

  private async requireProduct(productId: string): Promise<void> {
    const [product] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, productId), isNull(products.deletedAt)))
      .limit(1);
    if (!product) throw notFound('Không tìm thấy mặt hàng');
  }

  private async requestDto(requestId: string): Promise<StoreOrderRequest> {
    const [request] = await db
      .select()
      .from(orderRequests)
      .where(and(eq(orderRequests.id, requestId), isNull(orderRequests.deletedAt)))
      .limit(1);
    if (!request) throw notFound('Không tìm thấy yêu cầu đặt hàng');
    const items = await db
      .select()
      .from(orderRequestItems)
      .where(eq(orderRequestItems.orderRequestId, request.id));
    return {
      id: request.id,
      sessionId: request.orderSessionId,
      storeId: request.storeId,
      requestSequence: request.requestNumber === 2 ? 2 : 1,
      status: orderStatus(request.status),
      lines: items.map((item) => ({
        productId: item.productId,
        requested: { kind: 'UNIT', quantity: item.requestedQuantity },
        priority: item.priorityLevel === 'P0A' ? 'P0B' : item.priorityLevel,
        ...(item.notes ? { note: item.notes } : {}),
      })),
      submittedByAccountId: request.requestedByUserId,
      submittedAt: (request.submittedAt ?? request.createdAt).toISOString(),
      cancelledAt: request.cancelledAt?.toISOString() ?? null,
      cancellationReason: request.cancellationReason,
    };
  }

  private async inboundReceiptDto(receiptId: string): Promise<InboundReceipt> {
    const [receipt] = await db
      .select()
      .from(receipts)
      .where(and(eq(receipts.id, receiptId), isNull(receipts.deletedAt)))
      .limit(1);
    if (!receipt || receipt.supplierName === null || receipt.receivedAt === null) {
      throw notFound('Không tìm thấy phiếu nhập nhà cung cấp');
    }
    const itemRows = await db
      .select()
      .from(receiptItems)
      .where(eq(receiptItems.receiptId, receipt.id))
      .orderBy(asc(receiptItems.productId));
    if (itemRows.length === 0) throw new Error('Supplier receipt has no product lines.');
    const bagRows = await db
      .select({
        id: receiptBagWeights.id,
        receiptItemId: receiptBagWeights.receiptItemId,
        labelCode: receiptBagWeights.labelCode,
        netWeightKg: receiptBagWeights.netWeightKg,
        createdAt: receiptBagWeights.createdAt,
      })
      .from(receiptBagWeights)
      .where(
        inArray(
          receiptBagWeights.receiptItemId,
          itemRows.map((item) => item.id),
        ),
      )
      .orderBy(asc(receiptBagWeights.receiptItemId), asc(receiptBagWeights.bagNumber));
    const itemById = new Map(itemRows.map((item) => [item.id, item]));
    let totalWeightGrams = 0n;
    const bags = bagRows.map((bag) => {
      const item = itemById.get(bag.receiptItemId);
      if (!item || bag.labelCode === null) {
        throw new Error('Supplier receipt bag evidence is incomplete.');
      }
      totalWeightGrams += kilogramsToGramsExact(bag.netWeightKg);
      return {
        id: bag.id,
        receiptId: receipt.id,
        productId: item.productId,
        bagCode: bag.labelCode,
        weightKg: gramsToKilogramsExact(kilogramsToGramsExact(bag.netWeightKg)),
        createdAt: bag.createdAt.toISOString(),
      };
    });
    if (bags.length === 0) throw new Error('Supplier receipt has no bag evidence.');

    const isConfirmed = receipt.status === 'confirmed';
    const totalCostVnd =
      receipt.totalGoodsCostVnd +
      receipt.totalShippingCostVnd +
      receipt.totalHandlingCostVnd +
      receipt.totalOtherCostVnd;
    if (isConfirmed && receipt.totalOtherCostVnd !== 0n) {
      throw new Error('Inbound receipt contract cannot represent legacy other costs.');
    }
    if (isConfirmed && (receipt.confirmedByUserId === null || receipt.confirmedAt === null)) {
      throw new Error('Confirmed supplier receipt is missing reviewer evidence.');
    }
    const productCosts = isConfirmed
      ? itemRows.map((item) => {
          if (item.pricePerKgVnd === null) {
            throw new Error('Confirmed supplier receipt item is missing its price.');
          }
          return { productId: item.productId, priceVndPerKg: safeVnd(item.pricePerKgVnd) };
        })
      : [];

    return {
      id: receipt.id,
      referenceCode: receipt.receiptNumber,
      supplierName: receipt.supplierName,
      status: inboundReceiptStatus(receipt.status),
      bags,
      totalWeightKg: gramsToKilogramsExact(totalWeightGrams),
      cost: isConfirmed
        ? {
            productCosts,
            transportationFeeVnd: safeVnd(receipt.totalShippingCostVnd),
            handlingFeeVnd: safeVnd(receipt.totalHandlingCostVnd),
            goodsCostVnd: safeVnd(receipt.totalGoodsCostVnd),
            totalCostVnd: safeVnd(totalCostVnd),
            confirmedByAccountId: receipt.confirmedByUserId as string,
            confirmedAt: (receipt.confirmedAt as Date).toISOString(),
          }
        : null,
      version: receipt.version,
      receivedByAccountId: receipt.createdByUserId,
      receivedAt: receipt.receivedAt.toISOString(),
      createdAt: receipt.createdAt.toISOString(),
      updatedAt: receipt.updatedAt.toISOString(),
    };
  }

  private async receiptDto(receiptId: string): Promise<Receipt> {
    const [receipt] = await db
      .select()
      .from(storeReceipts)
      .where(and(eq(storeReceipts.id, receiptId), isNull(storeReceipts.deletedAt)))
      .limit(1);
    if (!receipt) throw notFound('Không tìm thấy phiếu nhận hàng');

    const lines = await db
      .select()
      .from(storeReceiptLines)
      .where(eq(storeReceiptLines.storeReceiptId, receipt.id))
      .orderBy(asc(storeReceiptLines.productId));
    if (lines.length === 0) throw new Error('Store receipt has no product lines');
    const bags = await db
      .select()
      .from(storeReceiptBags)
      .where(
        inArray(
          storeReceiptBags.storeReceiptLineId,
          lines.map((line) => line.id),
        ),
      )
      .orderBy(asc(storeReceiptBags.storeReceiptLineId), asc(storeReceiptBags.bagNumber));
    const weightsByLine = new Map<string, string[]>();
    for (const bag of bags) {
      const weights = weightsByLine.get(bag.storeReceiptLineId) ?? [];
      weights.push(bag.weightKg);
      weightsByLine.set(bag.storeReceiptLineId, weights);
    }

    return {
      id: receipt.id,
      receiptNumber: receipt.receiptNumber,
      storeId: receipt.storeId,
      outboundRequestId: receipt.outboundRequestId,
      declaredByAccountId: receipt.declaredByUserId,
      lines: lines.map((line) => ({
        productId: line.productId,
        approvedUnits: line.approvedQuantity,
        receivedUnits: line.receivedQuantity,
        bagWeightsKg: weightsByLine.get(line.id) ?? [],
        pricePerKgVnd: line.pricePerKgVnd === null ? null : safeVnd(line.pricePerKgVnd),
      })),
      discrepancyNote: receipt.discrepancyNote,
      status: receiptStatus(receipt.status),
      freightVnd: safeVnd(receipt.freightVnd),
      handlingVnd: safeVnd(receipt.handlingVnd),
      totalCostVnd: receipt.status === 'finalized' ? safeVnd(receipt.totalCostVnd) : null,
      reviewedByAccountId: receipt.reviewedByUserId,
      reviewNote: receipt.reviewNote,
      version: receipt.version,
      createdAt: receipt.createdAt.toISOString(),
      updatedAt: receipt.updatedAt.toISOString(),
    };
  }

  private async priorityOfferDto(
    actor: AuthenticatedPrincipal,
    offerId: string,
  ): Promise<PriorityOffer> {
    const [offer] = await db
      .select()
      .from(dailyPriorityOffers)
      .where(and(eq(dailyPriorityOffers.id, offerId), isNull(dailyPriorityOffers.deletedAt)))
      .limit(1);
    if (!offer) throw notFound('Không tìm thấy đề nghị ưu tiên');
    if (!canAccessStore(actor, offer.storeId)) throw forbidden();
    const effectiveStatus =
      offer.status === 'offered' && offer.responseDeadlineAt.getTime() <= Date.now()
        ? 'expired'
        : offer.status;
    return priorityOfferDto({ ...offer, effectiveStatus });
  }

  private async inventoryBagDto(bagId: string): Promise<StoreInventoryBag> {
    const [row] = await db
      .select({
        bag: storeInventoryBags,
        outboundRequestId: outboundRequestLines.outboundRequestId,
      })
      .from(storeInventoryBags)
      .leftJoin(
        outboundRequestLines,
        eq(outboundRequestLines.id, storeInventoryBags.outboundRequestLineId),
      )
      .where(eq(storeInventoryBags.id, bagId))
      .limit(1);
    if (!row) throw notFound('Không tìm thấy bao tồn kho');
    return inventoryBagDto({
      id: row.bag.id,
      bagCode: row.bag.bagCode,
      storeId: row.bag.storeId,
      productId: row.bag.productId,
      sourceStoreReceiptBagId: row.bag.sourceStoreReceiptBagId,
      sourceTransferId: row.bag.sourceTransferId,
      sourceInventoryBagId: row.bag.sourceInventoryBagId,
      outboundRequestId: row.outboundRequestId,
      status: row.bag.status,
      initialWeightKg: row.bag.initialWeightKg,
      currentWeightKg: row.bag.currentWeightKg,
      costVnd: row.bag.costVnd,
      version: row.bag.version,
      receivedAt: row.bag.receivedAt,
      openedAt: row.bag.openedAt,
      depletedAt: row.bag.depletedAt,
      updatedAt: row.bag.updatedAt,
    });
  }

  private async storeOutboundDto(outboundId: string): Promise<StoreOutbound> {
    const [outbound] = await db
      .select()
      .from(storeOutbounds)
      .where(and(eq(storeOutbounds.id, outboundId), isNull(storeOutbounds.deletedAt)))
      .limit(1);
    if (!outbound) throw notFound('Không tìm thấy phiếu xuất tại cửa hàng');
    return storeOutboundDto(outbound);
  }

  private async storeTransferDto(transferId: string): Promise<StoreTransfer> {
    const [transfer] = await db
      .select()
      .from(storeTransfers)
      .where(eq(storeTransfers.id, transferId))
      .limit(1);
    if (!transfer) throw notFound('Không tìm thấy phiếu chuyển kho');
    return storeTransferDto(transfer);
  }

  private async authorizeMonthlyReportScope(
    actor: AuthenticatedPrincipal,
    query: MonthlyOperationalReportQuery,
  ): Promise<MonthlyReportScope> {
    if (query.scopeKind === 'ALL') {
      if (actor.role !== 'ADMIN') throw forbidden();
      return { kind: 'ALL' };
    }
    if (!query.scopeId) {
      throw new ApiError('VALIDATION_ERROR', 'Phạm vi báo cáo thiếu mã định danh', 400);
    }
    if (query.scopeKind === 'GROUP') {
      if (actor.role !== 'ADMIN') throw forbidden();
      const [group] = await db
        .select({ id: storeGroups.id })
        .from(storeGroups)
        .where(and(eq(storeGroups.id, query.scopeId), eq(storeGroups.isActive, true)))
        .limit(1);
      if (!group) throw notFound('Không tìm thấy nhóm cửa hàng');
      return { kind: 'GROUP', id: group.id };
    }
    if (!canAccessStore(actor, query.scopeId)) throw forbidden();
    const [store] = await db
      .select({ id: stores.id })
      .from(stores)
      .where(and(eq(stores.id, query.scopeId), eq(stores.isActive, true), isNull(stores.deletedAt)))
      .limit(1);
    if (!store) throw notFound('Không tìm thấy cửa hàng');
    return { kind: 'STORE', id: store.id };
  }
}

function receiptSourceDto(source: StoreReceiptSourceRecord): StoreReceiptSource {
  return {
    id: source.id,
    requestNumber: source.requestNumber,
    storeId: source.storeId,
    dispatchedAt: source.dispatchedAt.toISOString(),
    lines: source.lines.map((line) => ({
      productId: line.productId,
      approvedUnits: line.approvedUnits,
      dispatchedUnits: line.dispatchedUnits,
    })),
  };
}

function receiptSourcePage(
  page: Awaited<ReturnType<typeof listDatabaseStoreReceiptSources>>,
): Page<StoreReceiptSource> {
  return {
    data: page.data.map(receiptSourceDto),
    pagination: page.pagination,
  };
}

async function listAssignedStoreReceiptSources(
  assignedStoreIds: readonly string[],
  query: ListStoreReceiptSourcesQuery,
): Promise<Page<StoreReceiptSource>> {
  const storeIds = [...new Set(assignedStoreIds)];
  if (storeIds.length === 0) {
    return { data: [], pagination: pagination(query.page, query.pageSize, 0) };
  }

  const requestedEnd = query.page * query.pageSize;
  if (!Number.isSafeInteger(requestedEnd)) {
    throw new ApiError('VALIDATION_ERROR', 'Trang yêu cầu vượt quá giới hạn an toàn', 400);
  }
  const fetchPageSize = Math.min(100, requestedEnd);
  const storePages = await Promise.all(
    storeIds.map(async (storeId) => {
      const first = await listDatabaseStoreReceiptSources(db, {
        page: 1,
        pageSize: fetchPageSize,
        storeId,
      });
      const records = [...first.data];
      const needed = Math.min(first.pagination.totalItems, requestedEnd);
      for (let page = 2; records.length < needed; page += 1) {
        const next = await listDatabaseStoreReceiptSources(db, {
          page,
          pageSize: fetchPageSize,
          storeId,
        });
        if (next.data.length === 0) break;
        records.push(...next.data);
      }
      return { records, totalItems: first.pagination.totalItems };
    }),
  );
  const totalItems = storePages.reduce((sum, storePage) => sum + storePage.totalItems, 0);
  const records = storePages
    .flatMap((storePage) => storePage.records)
    .sort(
      (left, right) =>
        right.dispatchedAt.getTime() - left.dispatchedAt.getTime() ||
        right.id.localeCompare(left.id),
    );
  const start = (query.page - 1) * query.pageSize;
  return {
    data: records.slice(start, start + query.pageSize).map(receiptSourceDto),
    pagination: pagination(query.page, query.pageSize, totalItems),
  };
}

function inventoryBagDto(record: StoreInventoryBagRecord): StoreInventoryBag {
  return {
    id: record.id,
    storeId: record.storeId,
    productId: record.productId,
    sourceReceiptBagId: record.sourceStoreReceiptBagId,
    outboundOrderId: record.outboundRequestId,
    sourceTransferId: record.sourceTransferId,
    sourceInventoryBagId: record.sourceInventoryBagId,
    bagCode: record.bagCode,
    originalWeightKg: record.initialWeightKg,
    receivedWeightKg: record.initialWeightKg,
    remainingWeightKg: record.currentWeightKg,
    status: inventoryBagStatus(record.status),
    version: record.version,
    receivedAt: record.receivedAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function inventoryBagPage(
  page: Awaited<ReturnType<typeof listDatabaseStoreInventoryBags>>,
): Page<StoreInventoryBag> {
  return { data: page.data.map(inventoryBagDto), pagination: page.pagination };
}

function inventoryLedgerDto(record: StoreInventoryLedgerRecord): StoreInventoryBagLedgerEntry {
  return {
    id: record.id,
    bagId: record.bagId,
    operation: record.eventType.toUpperCase() as StoreInventoryBagLedgerEntry['operation'],
    beforeWeightKg: record.weightBeforeKg,
    afterWeightKg: record.weightAfterKg,
    reason: record.reason,
    actorAccountId: record.actorUserId,
    createdAt: record.occurredAt.toISOString(),
  };
}

function inventoryLedgerPage(
  page: Awaited<ReturnType<typeof listDatabaseStoreInventoryLedger>>,
): Page<StoreInventoryBagLedgerEntry> {
  return { data: page.data.map(inventoryLedgerDto), pagination: page.pagination };
}

function storeOutboundDto(row: typeof storeOutbounds.$inferSelect): StoreOutbound {
  return {
    id: row.id,
    storeId: row.storeId,
    inventoryLotId: row.storeInventoryBagId,
    weightKg: row.weightKg,
    reason: row.reason.toUpperCase() as StoreOutbound['reason'],
    revenueVnd: row.revenueVnd === null ? null : safeVnd(row.revenueVnd),
    status: row.status.toUpperCase() as StoreOutbound['status'],
    createdByAccountId: row.createdByUserId,
    reviewedByAccountId: row.reviewedByUserId,
    reviewNote: row.reviewNote,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function storeOutboundPage(
  page: Awaited<ReturnType<typeof listDatabaseStoreOutbounds>>,
): Page<StoreOutbound> {
  return { data: page.data.map(storeOutboundDto), pagination: page.pagination };
}

function storeTransferDto(row: typeof storeTransfers.$inferSelect): StoreTransfer {
  return {
    id: row.id,
    transferNumber: row.transferNumber,
    sourceStoreId: row.sourceStoreId,
    destinationStoreId: row.destinationStoreId,
    sourceInventoryBagId: row.sourceInventoryBagId,
    destinationInventoryBagId: row.destinationInventoryBagId,
    productId: row.productId,
    weightKg: row.weightKg,
    costVnd: row.costVnd === null ? null : safeVnd(row.costVnd),
    status: row.status.toUpperCase() as StoreTransfer['status'],
    note: row.note,
    cancellationReason: row.cancellationReason,
    version: row.version,
    createdByAccountId: row.createdByUserId,
    dispatchedByAccountId: row.dispatchedByUserId,
    receivedByAccountId: row.receivedByUserId,
    createdAt: row.createdAt.toISOString(),
    dispatchedAt: row.dispatchedAt?.toISOString() ?? null,
    receivedAt: row.receivedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function storeTransferPage(
  page: Awaited<ReturnType<typeof listDatabaseStoreTransfers>>,
): Page<StoreTransfer> {
  return { data: page.data.map(storeTransferDto), pagination: page.pagination };
}

async function listAssignedStoreInventoryBags(
  assignedStoreIds: readonly string[],
  query: ListStoreInventoryBagsQuery,
): Promise<Page<StoreInventoryBag>> {
  return listAssignedStorePages(
    assignedStoreIds,
    query.page,
    query.pageSize,
    async (storeId, page, pageSize) =>
      inventoryBagPage(
        await listDatabaseStoreInventoryBags(db, {
          storeId,
          page,
          pageSize,
          ...(query.productId === undefined ? {} : { productId: query.productId }),
          ...(query.status === undefined ? {} : { status: databaseInventoryStatus(query.status) }),
          ...(query.bagCode === undefined ? {} : { bagCode: query.bagCode }),
        }),
      ),
    (left, right) =>
      (right.receivedAt ?? '').localeCompare(left.receivedAt ?? '') ||
      left.bagCode.localeCompare(right.bagCode),
  );
}

async function listAssignedStoreOutbounds(
  assignedStoreIds: readonly string[],
  query: ListStoreOutboundsQuery,
): Promise<Page<StoreOutbound>> {
  return listAssignedStorePages(
    assignedStoreIds,
    query.page,
    query.pageSize,
    async (storeId, page, pageSize) =>
      storeOutboundPage(
        await listDatabaseStoreOutbounds(db, {
          storeId,
          page,
          pageSize,
          ...(query.inventoryLotId === undefined ? {} : { inventoryBagId: query.inventoryLotId }),
          ...(query.status === undefined ? {} : { status: databaseOutboundStatus(query.status) }),
          ...(query.reason === undefined ? {} : { reason: databaseOutboundReason(query.reason) }),
        }),
      ),
    (left, right) =>
      right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
  );
}

async function listAssignedStorePages<T>(
  assignedStoreIds: readonly string[],
  page: number,
  pageSize: number,
  fetchPage: (storeId: string, page: number, pageSize: number) => Promise<Page<T>>,
  compare: (left: T, right: T) => number,
): Promise<Page<T>> {
  const storeIds = [...new Set(assignedStoreIds)];
  if (storeIds.length === 0) return emptyPage(page, pageSize);
  const requestedEnd = page * pageSize;
  if (!Number.isSafeInteger(requestedEnd)) {
    throw new ApiError('VALIDATION_ERROR', 'Trang yêu cầu vượt quá giới hạn an toàn', 400);
  }
  const fetchPageSize = Math.min(100, requestedEnd);
  const storePages = await Promise.all(
    storeIds.map(async (storeId) => {
      const first = await fetchPage(storeId, 1, fetchPageSize);
      const records = [...first.data];
      const needed = Math.min(first.pagination.totalItems, requestedEnd);
      for (let nextPage = 2; records.length < needed; nextPage += 1) {
        const next = await fetchPage(storeId, nextPage, fetchPageSize);
        if (next.data.length === 0) break;
        records.push(...next.data);
      }
      return { records, totalItems: first.pagination.totalItems };
    }),
  );
  const totalItems = storePages.reduce((sum, storePage) => sum + storePage.totalItems, 0);
  const records = storePages.flatMap((storePage) => storePage.records).sort(compare);
  const start = (page - 1) * pageSize;
  return {
    data: records.slice(start, start + pageSize),
    pagination: pagination(page, pageSize, totalItems),
  };
}

function emptyPage<T>(page: number, pageSize: number): Page<T> {
  return { data: [], pagination: pagination(page, pageSize, 0) };
}

function databaseInventoryStatus(
  status: StoreInventoryBag['status'],
): typeof storeInventoryBags.$inferSelect.status {
  switch (status) {
    case 'IN_TRANSIT':
      return 'in_transit';
    case 'AVAILABLE':
      return 'available';
    case 'OPEN':
      return 'opened';
    case 'EMPTY':
      return 'depleted';
    case 'QUARANTINED':
      return 'quarantined';
    case 'RETURNED':
      return 'returned';
    case 'LOST':
      return 'lost';
  }
}

function inventoryBagStatus(
  status: typeof storeInventoryBags.$inferSelect.status,
): StoreInventoryBag['status'] {
  switch (status) {
    case 'in_transit':
      return 'IN_TRANSIT';
    case 'available':
      return 'AVAILABLE';
    case 'opened':
      return 'OPEN';
    case 'depleted':
      return 'EMPTY';
    case 'quarantined':
      return 'QUARANTINED';
    case 'returned':
      return 'RETURNED';
    case 'lost':
      return 'LOST';
  }
}

function databaseOutboundReason(
  reason: StoreOutbound['reason'],
): typeof storeOutbounds.$inferSelect.reason {
  return reason.toLocaleLowerCase('en-US') as typeof storeOutbounds.$inferSelect.reason;
}

function databaseOutboundStatus(
  status: StoreOutbound['status'],
): typeof storeOutbounds.$inferSelect.status {
  return status.toLocaleLowerCase('en-US') as typeof storeOutbounds.$inferSelect.status;
}

function databaseTransferStatus(
  status: StoreTransfer['status'],
): typeof storeTransfers.$inferSelect.status {
  return status.toLocaleLowerCase('en-US') as typeof storeTransfers.$inferSelect.status;
}

function sessionDto(stored: typeof sessions.$inferSelect, account: AccountCredentials): Session {
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

function accountDto(row: typeof users.$inferSelect): Account {
  return {
    id: row.id,
    username: row.email,
    displayName: row.displayName,
    role: row.role.toUpperCase() as Account['role'],
    status: row.status.toUpperCase() as Account['status'],
    storeId: row.storeId,
    sessionVersion: row.tokenVersion,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function htkdAssignmentDto(row: typeof htkdAssignments.$inferSelect): HtkdAssignment {
  return {
    id: row.id,
    htkdAccountId: row.userId,
    storeId: row.storeId,
    assignedAt: row.assignedAt.toISOString(),
    assignedByAccountId: row.assignedByUserId,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    revokedByAccountId: row.revokedByUserId,
  };
}

function adminAuditDto(row: typeof auditLogs.$inferSelect): AdminAuditLog {
  return {
    id: row.id,
    requestId: row.requestId,
    actorAccountId: row.actorUserId,
    actorRole:
      row.actorRole === null
        ? null
        : (row.actorRole.toUpperCase() as NonNullable<AdminAuditLog['actorRole']>),
    actorStoreId: row.actorStoreId,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    before: sanitizeAuditObject(row.before),
    after: sanitizeAuditObject(row.after),
    metadata: sanitizeAuditObject(row.metadata) ?? {},
    createdAt: row.createdAt.toISOString(),
  };
}

function operationalSettingsDto(
  row: typeof operationalSettingsVersions.$inferSelect,
): OperationalSettingsVersion {
  return {
    id: row.id,
    version: row.version,
    timezone: row.timezone as OperationalSettingsVersion['timezone'],
    snapshotTime: row.snapshotTime.slice(0, 5),
    cutoffTime: row.cutoffTime.slice(0, 5),
    maxRequestsPerStore: row.maxRequestsPerStore,
    policyVersion: row.policyVersion,
    idosiSyncIntervalMinutes:
      row.idosiSyncIntervalMinutes as OperationalSettingsVersion['idosiSyncIntervalMinutes'],
    createdByAccountId: row.createdByUserId,
    requestId: row.requestId,
    createdAt: row.createdAt.toISOString(),
  };
}

function productDto(row: typeof products.$inferSelect): Product {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    measurement: row.unit === 'kilogram' ? 'WEIGHT' : 'UNIT',
    unitLabel: row.unit === 'kilogram' ? 'kg' : row.unit === 'item' ? 'cái' : 'bao',
    status: row.isActive ? 'ACTIVE' : 'INACTIVE',
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function storeDto(row: typeof stores.$inferSelect): Store {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    groupId: row.groupId,
    kind: row.kind === 'wholesale' ? 'WHOLESALE' : 'RETAIL',
    status: row.isActive ? 'ACTIVE' : 'INACTIVE',
    address: row.address,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function storeGroupDto(row: typeof storeGroups.$inferSelect): StoreGroup {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.isActive ? 'ACTIVE' : 'INACTIVE',
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function conversionDto(row: typeof productConversions.$inferSelect): ProductConversion {
  return {
    id: row.id,
    productId: row.productId,
    version: row.version,
    itemQuantity: row.itemQuantity,
    weightKilograms: row.weightKilograms,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    reason: row.reason,
    createdByAccountId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    retiredAt: row.retiredAt?.toISOString() ?? null,
    retiredByAccountId: row.retiredByUserId,
    retirementReason: row.retirementReason,
  };
}

function databaseUnit(
  measurement: CreateProductRequest['measurement'],
  unitLabel: string,
): 'item' | 'bag' | 'kilogram' {
  if (measurement === 'WEIGHT') return 'kilogram';
  return /^(cái|item|piece)$/iu.test(unitLabel.trim()) ? 'item' : 'bag';
}

function orderStatus(
  status: typeof orderRequests.$inferSelect.status,
): StoreOrderRequest['status'] {
  if (status === 'cancelled') return 'CANCELLED';
  if (status === 'draft' || status === 'submitted') return 'SUBMITTED';
  return 'MERGED';
}

function databaseOrderSessionStatus(
  status: OrderSession['status'],
): typeof orderSessions.$inferSelect.status {
  switch (status) {
    case 'SCHEDULED':
      return 'draft';
    case 'OPEN':
      return 'open';
    case 'CLOSED':
      return 'closed';
    case 'ALLOCATING':
      return 'allocating';
    case 'ALLOCATED':
      return 'completed';
    case 'CANCELLED':
      return 'cancelled';
  }
}

function orderSessionStatus(
  status: typeof orderSessions.$inferSelect.status,
): OrderSession['status'] {
  switch (status) {
    case 'draft':
      return 'SCHEDULED';
    case 'open':
      return 'OPEN';
    case 'closed':
      return 'CLOSED';
    case 'allocating':
      return 'ALLOCATING';
    case 'completed':
      return 'ALLOCATED';
    case 'cancelled':
      return 'CANCELLED';
  }
}

function orderSessionDto(row: typeof orderSessions.$inferSelect): OrderSession {
  return {
    id: row.id,
    businessDate: row.businessDate,
    status: orderSessionStatus(row.status),
    requestOpensAt: (row.openedAt ?? row.createdAt).toISOString(),
    requestClosesAt: row.inventorySnapshotDueAt.toISOString(),
    allocationStartsAt: row.requestDeadlineAt.toISOString(),
    policyVersion: row.policyVersion,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function databaseWarehouseOutboundStatus(
  status: WarehouseOutboundRequest['status'],
): WarehouseOutboundDatabaseStatus {
  switch (status) {
    case 'RESERVED':
      return 'reserved';
    case 'DISPATCHED':
      return 'dispatched';
    case 'PARTIALLY_RECEIVED':
      return 'partially_received';
    case 'RECEIVED':
      return 'received';
    case 'COMPLETED':
      return 'completed';
    case 'CANCELLED':
      return 'cancelled';
  }
}

function databaseAllocationResultStatus(
  status: AllocationResult['status'],
): AllocationResultDatabaseStatus {
  return status.toLocaleLowerCase('en-US') as AllocationResultDatabaseStatus;
}

function allocationResultDto(record: AllocationResultRecord): AllocationResult {
  return {
    id: record.id,
    allocationRunId: record.allocationRunId,
    sessionId: record.sessionId,
    mergedOrderId: record.mergedOrderId,
    storeId: record.storeId,
    productId: record.productId,
    priority: record.priority,
    roundNumber: record.roundNumber,
    sequenceInRound: record.sequenceInRound,
    requestedQuantity: record.requestedQuantity,
    allocatedQuantity: record.allocatedQuantity,
    waitlistedQuantity: record.waitlistedQuantity,
    status: record.status.toLocaleUpperCase('en-US') as AllocationResult['status'],
    reasonCode: record.reasonCode,
    createdAt: record.createdAt.toISOString(),
  };
}

function warehouseOutboundRequestDto(
  record: WarehouseOutboundRequestRecord,
): WarehouseOutboundRequest {
  return {
    id: record.id,
    requestNumber: record.requestNumber,
    storeId: record.storeId,
    orderSessionId: record.orderSessionId,
    allocationRunId: record.allocationRunId,
    status: record.status.toUpperCase() as WarehouseOutboundRequest['status'],
    requestedByAccountId: record.requestedByUserId,
    dispatchedByAccountId: record.dispatchedByUserId,
    lines: record.lines.map((line) => ({
      id: line.id,
      allocationLineId: line.allocationLineId,
      productId: line.productId,
      requestedUnits: line.requestedQuantity,
      approvedUnits: line.approvedQuantity,
      reservedUnits: line.reservedQuantity,
      dispatchedUnits: line.dispatchedQuantity,
      receivedUnits: line.receivedQuantity,
    })),
    version: record.version,
    notes: record.notes,
    dispatchedAt: record.dispatchedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function databaseReceiptStatus(
  status: Receipt['status'],
): typeof storeReceipts.$inferSelect.status {
  switch (status) {
    case 'DRAFT':
      return 'draft';
    case 'PENDING_HTKD':
      return 'pending_htkd';
    case 'RETURNED':
      return 'returned';
    case 'FINALIZED':
      return 'finalized';
  }
}

function databaseInboundReceiptStatus(
  status: InboundReceipt['status'],
): typeof receipts.$inferSelect.status {
  switch (status) {
    case 'RECEIVED':
      return 'draft';
    case 'COST_PENDING':
      return 'submitted';
    case 'COST_CONFIRMED':
      return 'confirmed';
    case 'CANCELLED':
      return 'cancelled';
  }
}

function inboundReceiptStatus(
  status: typeof receipts.$inferSelect.status,
): InboundReceipt['status'] {
  switch (status) {
    case 'draft':
      return 'RECEIVED';
    case 'submitted':
      return 'COST_PENDING';
    case 'confirmed':
      return 'COST_CONFIRMED';
    case 'cancelled':
      return 'CANCELLED';
  }
}

function receiptStatus(status: typeof storeReceipts.$inferSelect.status): Receipt['status'] {
  switch (status) {
    case 'draft':
      return 'DRAFT';
    case 'pending_htkd':
      return 'PENDING_HTKD';
    case 'returned':
      return 'RETURNED';
    case 'finalized':
      return 'FINALIZED';
  }
}

function waitTicketDto(ticket: WaitTicketRecord): WaitTicket {
  return {
    id: ticket.id,
    sessionId: ticket.orderSessionId,
    mergedOrderId: ticket.mergedOrderId,
    storeId: ticket.storeId,
    productId: ticket.productId,
    priority: ticket.priorityLevel,
    requested: { kind: 'UNIT', quantity: ticket.originalQuantity },
    fulfilled: { kind: 'UNIT', quantity: ticket.fulfilledQuantity },
    remaining: { kind: 'UNIT', quantity: ticket.remainingQuantity },
    status:
      ticket.status === 'active'
        ? ticket.hasOpenOffer
          ? 'OFFERED'
          : ticket.fulfilledQuantity > 0
            ? 'PARTIALLY_FULFILLED'
            : 'WAITING'
        : (ticket.status.toUpperCase() as WaitTicket['status']),
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

function priorityOfferDto(offer: PriorityOfferRecord): PriorityOffer {
  const status = offer.effectiveStatus.toUpperCase() as PriorityOffer['status'];
  return {
    id: offer.id,
    waitTicketId: offer.waitTicketId,
    storeId: offer.storeId,
    productId: offer.productId,
    offered: { kind: 'UNIT', quantity: offer.offeredQuantity },
    status,
    offeredAt: offer.createdAt.toISOString(),
    expiresAt: offer.responseDeadlineAt.toISOString(),
    respondedAt: offer.respondedAt?.toISOString() ?? null,
    accepted: status === 'ACCEPTED' ? { kind: 'UNIT', quantity: offer.acceptedQuantity } : null,
  };
}

function databaseWaitTicketFilter(status: WaitTicket['status'] | undefined): {
  readonly status?: WaitTicketDatabaseStatus;
  readonly effectiveStatus?: WaitTicketEffectiveStatus;
} {
  switch (status) {
    case undefined:
      return {};
    case 'WAITING':
      return { effectiveStatus: 'waiting' };
    case 'OFFERED':
      return { effectiveStatus: 'offered' };
    case 'PARTIALLY_FULFILLED':
      return { effectiveStatus: 'partially_fulfilled' };
    case 'FULFILLED':
      return { status: 'fulfilled' };
    case 'CANCELLED':
      return { status: 'cancelled' };
    case 'EXPIRED':
      return { status: 'expired' };
  }
}

function databasePriorityOfferStatus(
  status: PriorityOffer['status'],
): PriorityOfferRecord['status'] {
  switch (status) {
    case 'PENDING':
      return 'offered';
    case 'ACCEPTED':
      return 'accepted';
    case 'DECLINED':
      return 'declined';
    case 'EXPIRED':
      return 'expired';
    case 'CANCELLED':
      return 'cancelled';
  }
}

function databasePriorityOfferResponse(
  input: RespondPriorityOfferRequest,
):
  | { readonly action: 'accept'; readonly acceptedQuantity: number }
  | { readonly action: 'decline'; readonly reason?: string } {
  if (input.action === 'ACCEPT') {
    if (input.accepted.kind !== 'UNIT') {
      throw new ApiError('VALIDATION_ERROR', 'Đề nghị ưu tiên chỉ hỗ trợ số lượng đơn vị', 400);
    }
    return { action: 'accept', acceptedQuantity: input.accepted.quantity };
  }
  return {
    action: 'decline',
    ...(input.reason === undefined ? {} : { reason: input.reason }),
  };
}

async function withOrderSessionErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    if (error instanceof OrderSessionAuthorizationError) throw forbidden();
    if (error instanceof OrderSessionNotFoundError) {
      throw notFound('Không tìm thấy phiên đặt hàng');
    }
    if (error instanceof OrderSessionValidationError) {
      throw new ApiError('VALIDATION_ERROR', error.message, 400);
    }
    if (error instanceof OrderSessionConflictError) {
      throw new ApiError('VERSION_CONFLICT', error.message, 409);
    }
    if (error instanceof IdempotencyConflictError) {
      throw new ApiError(
        'IDEMPOTENCY_CONFLICT',
        'Khóa idempotency đã được dùng cho nội dung khác',
        409,
      );
    }
    if (error instanceof IdempotencyInProgressError) {
      throw conflict('Yêu cầu cùng khóa idempotency đang được xử lý');
    }
    throw error;
  }
}

async function withStoreLifecycleErrors<T>(
  duplicateMessage: string,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    if (isUniqueViolation(error)) throw conflict(duplicateMessage);
    if (error instanceof IdempotencyConflictError) {
      throw new ApiError(
        'IDEMPOTENCY_CONFLICT',
        'Khóa idempotency đã được dùng cho nội dung khác',
        409,
      );
    }
    if (error instanceof IdempotencyInProgressError) {
      throw conflict('Yêu cầu cùng khóa idempotency đang được xử lý');
    }
    throw error;
  }
}

async function withWarehouseOutboundErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    if (error instanceof WarehouseOutboundAuthorizationError) throw forbidden();
    if (error instanceof WarehouseOutboundNotFoundError) {
      throw notFound('Không tìm thấy lệnh xuất kho');
    }
    if (error instanceof WarehouseOutboundValidationError) {
      throw new ApiError('INVALID_STATE_TRANSITION', error.message, 409);
    }
    if (error instanceof WarehouseOutboundConflictError) {
      throw new ApiError('VERSION_CONFLICT', error.message, 409);
    }
    if (error instanceof IdempotencyConflictError) {
      throw new ApiError(
        'IDEMPOTENCY_CONFLICT',
        'Khóa idempotency đã được dùng cho nội dung khác',
        409,
      );
    }
    if (error instanceof IdempotencyInProgressError) {
      throw conflict('Yêu cầu cùng khóa idempotency đang được xử lý');
    }
    throw error;
  }
}

async function withWaitErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    if (error instanceof WaitTicketAuthorizationError) throw forbidden();
    if (error instanceof WaitTicketNotFoundError) throw notFound('Không tìm thấy phiếu chờ');
    if (error instanceof PriorityOfferNotFoundError) {
      throw notFound('Không tìm thấy đề nghị ưu tiên');
    }
    if (error instanceof WaitTicketValidationError) {
      throw new ApiError('VALIDATION_ERROR', error.message, 400);
    }
    if (error instanceof WaitTicketConflictError || error instanceof PriorityOfferConflictError) {
      throw conflict(error.message);
    }
    if (error instanceof IdempotencyConflictError) {
      throw new ApiError(
        'IDEMPOTENCY_CONFLICT',
        'Khóa idempotency đã được dùng cho nội dung khác',
        409,
      );
    }
    if (error instanceof IdempotencyInProgressError) {
      throw conflict('Yêu cầu cùng khóa idempotency đang được xử lý');
    }
    throw error;
  }
}

async function withStoreInventoryErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    if (error instanceof StoreInventoryAuthorizationError) throw forbidden();
    if (error instanceof StoreOperationValidationError) {
      if (/exceeds the remaining bag weight/iu.test(error.message)) {
        throw new ApiError('INSUFFICIENT_STOCK', 'Khối lượng xuất vượt quá tồn kho còn lại', 409);
      }
      if (/not assigned|not an active admin or HTKD/iu.test(error.message)) throw forbidden();
      throw new ApiError('VALIDATION_ERROR', error.message, 400);
    }
    if (error instanceof StoreOperationConflictError) {
      throw new ApiError('VERSION_CONFLICT', 'Dữ liệu tồn kho đã thay đổi, vui lòng tải lại', 409);
    }
    if (error instanceof IdempotencyConflictError) {
      throw new ApiError(
        'IDEMPOTENCY_CONFLICT',
        'Khóa idempotency đã được dùng cho nội dung khác',
        409,
      );
    }
    if (error instanceof IdempotencyInProgressError) {
      throw conflict('Yêu cầu cùng khóa idempotency đang được xử lý');
    }
    throw error;
  }
}

async function withStoreTransferErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    if (error instanceof StoreTransferAuthorizationError) throw forbidden();
    if (error instanceof StoreTransferNotFoundError)
      throw notFound('Không tìm thấy phiếu chuyển kho');
    if (error instanceof StoreOperationValidationError) {
      if (/exceeds available inventory/iu.test(error.message)) {
        throw new ApiError('INSUFFICIENT_STOCK', 'Khối lượng chuyển vượt tồn kho khả dụng', 409);
      }
      throw new ApiError('VALIDATION_ERROR', error.message, 400);
    }
    if (error instanceof StoreOperationConflictError) {
      throw new ApiError(
        'VERSION_CONFLICT',
        'Phiếu chuyển hoặc tồn kho đã thay đổi, vui lòng tải lại',
        409,
      );
    }
    if (error instanceof IdempotencyConflictError) {
      throw new ApiError(
        'IDEMPOTENCY_CONFLICT',
        'Khóa idempotency đã được dùng cho nội dung khác',
        409,
      );
    }
    if (error instanceof IdempotencyInProgressError) {
      throw conflict('Yêu cầu cùng khóa idempotency đang được xử lý');
    }
    throw error;
  }
}

async function withSupplierInboundErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    if (error instanceof SupplierInboundAuthorizationError) throw forbidden();
    if (error instanceof SupplierInboundNotFoundError) {
      throw notFound('Không tìm thấy phiếu nhập nhà cung cấp');
    }
    if (
      error instanceof SupplierInboundValidationError ||
      error instanceof StoreOperationValidationError
    ) {
      throw new ApiError('VALIDATION_ERROR', error.message, 400);
    }
    if (error instanceof SupplierInboundConflictError) {
      if (/version|changed during/iu.test(error.message)) {
        throw new ApiError('VERSION_CONFLICT', error.message, 409);
      }
      throw conflict(error.message);
    }
    if (error instanceof IdempotencyConflictError) {
      throw new ApiError(
        'IDEMPOTENCY_CONFLICT',
        'Khóa idempotency đã được dùng cho nội dung khác',
        409,
      );
    }
    if (error instanceof IdempotencyInProgressError) {
      throw conflict('Yêu cầu cùng khóa idempotency đang được xử lý');
    }
    throw error;
  }
}

function assertFinalizationMatchesDeclaration(
  current: Receipt,
  input: FinalizeReceiptRequest,
): void {
  const declaredByProduct = new Map(current.lines.map((line) => [line.productId, line]));
  if (declaredByProduct.size !== input.lines.length) {
    throw new ApiError(
      'VALIDATION_ERROR',
      'Các dòng xác nhận phải khớp chính xác với khai báo đã gửi',
      400,
    );
  }
  for (const line of input.lines) {
    const declared = declaredByProduct.get(line.productId);
    if (
      !declared ||
      line.approvedUnits !== declared.approvedUnits ||
      line.receivedUnits !== declared.receivedUnits
    ) {
      throw new ApiError(
        'VALIDATION_ERROR',
        'Số lượng xác nhận không được thay đổi khai báo đã gửi',
        400,
      );
    }
  }
}

function throwReceiptError(error: unknown): never {
  if (error instanceof StoreReceiptAuthorizationError) throw forbidden();
  if (error instanceof StoreOperationValidationError) {
    throw new ApiError('VALIDATION_ERROR', error.message, 400);
  }
  if (error instanceof StoreOperationConflictError) {
    throw new ApiError('VERSION_CONFLICT', 'Phiếu nhận hàng đã thay đổi hoặc sai trạng thái', 409);
  }
  if (error instanceof IdempotencyConflictError) {
    throw new ApiError(
      'IDEMPOTENCY_CONFLICT',
      'Khóa idempotency đã được dùng cho nội dung khác',
      409,
    );
  }
  if (error instanceof IdempotencyInProgressError) {
    throw conflict('Yêu cầu cùng khóa idempotency đang được xử lý');
  }
  throw error;
}

function slugify(value: string): string {
  const slug = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
  return slug || `sku-${Date.now()}`;
}

function auditValue(
  actor: AuthenticatedPrincipal,
  context: RequestContext,
  action: string,
  entityType: string,
  entityId: string,
  before: JsonObject | null,
  after: JsonObject | null,
): typeof auditLogs.$inferInsert {
  return {
    requestId: context.requestId,
    actorUserId: actor.accountId,
    actorRole: actor.role.toLocaleLowerCase('en-US') as 'admin' | 'htkd' | 'store',
    actorStoreId: actor.storeId,
    action,
    entityType,
    entityId,
    before,
    after,
    metadata: {},
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  };
}

function accountJson(account: Account): JsonObject {
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

function htkdAssignmentsJson(state: HtkdAssignmentsState): JsonObject {
  return {
    htkdAccountId: state.htkdAccountId,
    sessionVersion: state.sessionVersion,
    assignments: state.assignments.map((assignment) => ({ ...assignment })),
  };
}

function operationalSettingsJson(settings: OperationalSettingsVersion): JsonObject {
  return {
    id: settings.id,
    version: settings.version,
    timezone: settings.timezone,
    snapshotTime: settings.snapshotTime,
    cutoffTime: settings.cutoffTime,
    maxRequestsPerStore: settings.maxRequestsPerStore,
    policyVersion: settings.policyVersion,
    idosiSyncIntervalMinutes: settings.idosiSyncIntervalMinutes,
    createdByAccountId: settings.createdByAccountId,
    requestId: settings.requestId,
    createdAt: settings.createdAt,
  };
}

function databaseAccountRole(role: Account['role']): 'admin' | 'htkd' | 'store' {
  return role.toLocaleLowerCase('en-US') as 'admin' | 'htkd' | 'store';
}

function databaseAccountStatus(status: Account['status']): 'active' | 'locked' | 'disabled' {
  return status.toLocaleLowerCase('en-US') as 'active' | 'locked' | 'disabled';
}

function requirePostgresAdmin(actor: AuthenticatedPrincipal): void {
  if (actor.role !== 'ADMIN') throw forbidden();
}

function requireActiveHtkdTarget(account: typeof users.$inferSelect): void {
  if (account.role !== 'htkd' || account.status !== 'active') {
    throw conflict('Chỉ tài khoản HTKD đang hoạt động mới có thể được phân công cửa hàng');
  }
}

function requireWarehouseActor(actor: AuthenticatedPrincipal): void {
  if (actor.role === 'STORE') throw forbidden();
}

function databaseWarehouseActorRole(actor: AuthenticatedPrincipal): 'admin' | 'htkd' {
  requireWarehouseActor(actor);
  return actor.role === 'ADMIN' ? 'admin' : 'htkd';
}

function assertPostgresAccountVersion(actual: number, expected: number | undefined): void {
  if (expected !== undefined && actual !== expected) throw accountVersionConflict();
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

function accountVersionConflict(): ApiError {
  return new ApiError('VERSION_CONFLICT', 'Tài khoản đã thay đổi, vui lòng tải lại', 409);
}

function storeLifecycleVersionConflict(): ApiError {
  return new ApiError('VERSION_CONFLICT', 'Dữ liệu cửa hàng đã thay đổi, vui lòng tải lại', 409);
}

function escapeLike(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

function operationalSettingsVersionConflict(): ApiError {
  return new ApiError('VERSION_CONFLICT', 'Cấu hình vận hành đã thay đổi, vui lòng tải lại', 409);
}

function productJson(product: Product): JsonObject {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    measurement: product.measurement,
    unitLabel: product.unitLabel,
    status: product.status,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

function storeJson(store: Store): JsonObject {
  return {
    id: store.id,
    code: store.code,
    name: store.name,
    groupId: store.groupId,
    kind: store.kind,
    status: store.status,
    address: store.address,
    version: store.version,
    createdAt: store.createdAt,
    updatedAt: store.updatedAt,
  };
}

function storeGroupJson(group: StoreGroup): JsonObject {
  return {
    id: group.id,
    code: group.code,
    name: group.name,
    status: group.status,
    version: group.version,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  };
}

function conversionJson(conversion: ProductConversion): JsonObject {
  return {
    id: conversion.id,
    productId: conversion.productId,
    version: conversion.version,
    itemQuantity: conversion.itemQuantity,
    weightKilograms: conversion.weightKilograms,
    effectiveFrom: conversion.effectiveFrom,
    effectiveTo: conversion.effectiveTo,
    reason: conversion.reason,
    createdByAccountId: conversion.createdByAccountId,
    createdAt: conversion.createdAt,
    retiredAt: conversion.retiredAt,
    retiredByAccountId: conversion.retiredByAccountId,
    retirementReason: conversion.retirementReason,
  };
}

function requestJson(request: StoreOrderRequest): JsonObject {
  return {
    id: request.id,
    sessionId: request.sessionId,
    storeId: request.storeId,
    requestSequence: request.requestSequence,
    status: request.status,
    submittedByAccountId: request.submittedByAccountId,
    submittedAt: request.submittedAt,
    cancelledAt: request.cancelledAt,
    cancellationReason: request.cancellationReason ?? null,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === '23505'
  );
}

function kilogramsToGrams(value: string): bigint {
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole) * 1_000n + BigInt(fraction.padEnd(3, '0').slice(0, 3));
}

function gramsToKilograms(value: bigint): string {
  const whole = value / 1_000n;
  const fraction = (value % 1_000n).toString().padStart(3, '0');
  return `${whole}.${fraction}`;
}

function safeVnd(value: bigint): number {
  const converted = Number(value);
  if (!Number.isSafeInteger(converted)) throw new Error('Revenue exceeds safe VND response range');
  return converted;
}

function retirementDate(effectiveFrom: string, now: Date): string {
  const today = now.toISOString().slice(0, 10);
  return today > effectiveFrom ? today : effectiveFrom;
}
