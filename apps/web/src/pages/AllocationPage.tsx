import {
  CreateOrderSessionRequestSchema,
  DEFAULT_ALLOCATION_POLICY_VERSION,
  type AllocationResult,
  type AllocationResultStatus,
  type CreateOrderSessionRequest,
  type OperationalSettingsVersion,
  type OrderSession,
  type OrderSessionStatus,
  type TransitionOrderSessionRequest,
} from '@idosi/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Ban,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  LockKeyhole,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useLocation, useOutletContext } from 'react-router-dom';
import type { AppOutletContext } from '../components/AppShell';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { PriorityOffer } from '../components/PriorityOffer';
import { StatCard } from '../components/StatCard';
import { WaitlistPanel } from '../components/WaitlistPanel';
import { getAdminOperationalSettings } from '../features/admin/adminApi';
import {
  ApiClientError,
  createOrderSession,
  listAllocationResults,
  listAccessibleStores,
  listCatalog,
  listOrderSessions,
  mockModeEnabled,
  transitionOrderSession,
} from '../lib/api';
import { businessDate } from '../lib/business-time';
import { allocationRequests as seed } from '../lib/data';
import type { AllocationRequest } from '../lib/types';

const statusText: Record<AllocationRequest['status'], string> = {
  WAITING: 'Phiếu chờ',
  OFFERED: 'Đang ưu tiên',
  ALLOCATED: 'Đã phân bổ',
  DECLINED: 'Đã hủy lượt',
};

export function AllocationPage() {
  const { role } = useOutletContext<AppOutletContext>();
  const [requests, setRequests] = useState(seed);
  const [filter, setFilter] = useState<'ALL' | AllocationRequest['status']>('ALL');
  const [runState, setRunState] = useState<'READY' | 'RUNNING' | 'DONE'>('DONE');

  const visible = useMemo(
    () => requests.filter((request) => filter === 'ALL' || request.status === filter),
    [filter, requests],
  );

  if (!mockModeEnabled) return <ProductionAllocationOversight role={role} />;

  const rerun = () => {
    setRunState('RUNNING');
    window.setTimeout(() => setRunState('DONE'), 700);
  };

  const approve = (id: string) => {
    setRequests((current) =>
      current.map((request) => (request.id === id ? { ...request, status: 'ALLOCATED' } : request)),
    );
  };

  return (
    <>
      <PageHeader
        actions={
          <>
            <Button onClick={rerun} tone="secondary">
              <RotateCcw aria-hidden="true" size={16} /> Chạy lại an toàn
            </Button>
            <Button busy={runState === 'RUNNING'} onClick={rerun}>
              <Play aria-hidden="true" size={16} /> Chốt phân bổ
            </Button>
          </>
        }
        description="Phiên tuần 37 • snapshot 08:00 • ưu tiên 08:00–09:00 • công bố 09:00"
        title="Phân bổ hàng hóa"
      />

      <section aria-label="Tiến trình phiên phân bổ" className="timeline-strip">
        <div className="done">
          <span>Trước 08:00</span>
          <strong>Nhận yêu cầu</strong>
          <small>Tối đa 2 phiếu/cửa hàng</small>
        </div>
        <ArrowRight aria-hidden="true" />
        <div className="done">
          <span>08:00</span>
          <strong>Chụp snapshot</strong>
          <small>Khóa đầu vào chính sách</small>
        </div>
        <ArrowRight aria-hidden="true" />
        <div className="active">
          <span>08:00–09:00</span>
          <strong>Ưu tiên phiếu chờ</strong>
          <small>Hold tạm, chờ phản hồi</small>
        </div>
        <ArrowRight aria-hidden="true" />
        <div className="done">
          <span>09:00</span>
          <strong>Phân bổ vòng</strong>
          <small>1 bao/cửa hàng/vòng</small>
        </div>
      </section>

      <PriorityOffer />

      <div className="stats-grid stats-grid--small">
        <StatCard
          badge="08:00"
          detail="Không cộng hàng nhập sau snapshot"
          label="Tồn đủ điều kiện"
          tone="info"
          value="428 bao"
        />
        <StatCard
          badge="P0A–P3"
          detail="Đã gộp theo cửa hàng + mặt hàng"
          label="Nhu cầu"
          value="620 bao"
        />
        <StatCard
          badge="69%"
          detail="Mỗi cửa hàng tối đa 1 bao/vòng"
          label="Đã cấp"
          tone="success"
          value="428 bao"
        />
        <StatCard
          badge="1 active/SKU"
          detail="Giữ nguyên tuổi chờ khi offer hết hạn"
          label="Phiếu chờ"
          tone="warning"
          value="192 bao"
        />
      </div>

      <section className="policy-card">
        <ShieldCheck aria-hidden="true" size={24} />
        <div>
          <strong>Chính sách ALLOC-v1.2 đã khóa</strong>
          <span>
            Phiếu chờ đã xác nhận → nhóm yêu cầu mới → theo vòng; sắp theo tuổi chờ, tỷ lệ đáp ứng
            thấp, thời gian từ lần nhận SKU gần nhất, cursor và mã cửa hàng.
          </span>
        </div>
        <Badge tone="success">Idempotent</Badge>
      </section>

      <section className="panel table-panel">
        <div className="section-heading section-heading--compact">
          <div>
            <h2>Yêu cầu và kết quả</h2>
            <p>Hai yêu cầu trước 08:00 được gộp để không tăng lợi thế theo vòng.</p>
          </div>
          <label className="inline-select">
            Trạng thái
            <select
              onChange={(event) => setFilter(event.target.value as typeof filter)}
              value={filter}
            >
              <option value="ALL">Tất cả</option>
              <option value="WAITING">Phiếu chờ</option>
              <option value="OFFERED">Đang ưu tiên</option>
              <option value="ALLOCATED">Đã phân bổ</option>
              <option value="DECLINED">Đã hủy lượt</option>
            </select>
          </label>
        </div>
        {visible.length === 0 ? (
          <EmptyState
            detail="Đổi bộ lọc hoặc kiểm tra phiên khác."
            title="Không có yêu cầu phù hợp"
          />
        ) : (
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Mã phiếu</th>
                  <th>Cửa hàng</th>
                  <th>Mặt hàng</th>
                  <th>Nhu cầu</th>
                  <th>Kết quả</th>
                  <th>Ưu tiên</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((request) => (
                  <tr key={request.id}>
                    <td data-label="Mã phiếu">
                      <strong>{request.id}</strong>
                      <small>
                        <Clock3 aria-hidden="true" size={13} /> {request.submittedAt}
                      </small>
                    </td>
                    <td data-label="Cửa hàng">{request.storeName}</td>
                    <td data-label="Mặt hàng">{request.product}</td>
                    <td data-label="Nhu cầu">{request.requestedBags} bao</td>
                    <td data-label="Kết quả">
                      <strong className="text-success">{request.allocatedBags} cấp</strong>
                      <small>{request.waitlistedBags} chờ</small>
                    </td>
                    <td data-label="Ưu tiên">
                      <Badge tone={request.priority.startsWith('P0') ? 'danger' : 'info'}>
                        {request.priority}
                      </Badge>
                    </td>
                    <td data-label="Trạng thái">
                      <Badge
                        tone={
                          request.status === 'ALLOCATED'
                            ? 'success'
                            : request.status === 'OFFERED'
                              ? 'priority'
                              : 'warning'
                        }
                      >
                        {statusText[request.status]}
                      </Badge>
                    </td>
                    <td data-label="Thao tác">
                      {request.status === 'OFFERED' ? (
                        <button
                          className="link-button"
                          onClick={() => approve(request.id)}
                          type="button"
                        >
                          <CheckCircle2 aria-hidden="true" size={15} /> Xác nhận
                        </button>
                      ) : (
                        <button className="link-button" type="button">
                          Xem lịch sử
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

const sessionStatusCopy: Record<OrderSessionStatus, string> = {
  SCHEDULED: 'Đã lên lịch',
  OPEN: 'Đang nhận đơn',
  CLOSED: 'Đã đóng nhận đơn',
  ALLOCATING: 'Đang phân bổ',
  ALLOCATED: 'Đã phân bổ',
  CANCELLED: 'Đã hủy',
};

const sessionStatusTone: Record<
  OrderSessionStatus,
  'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'priority'
> = {
  SCHEDULED: 'info',
  OPEN: 'success',
  CLOSED: 'warning',
  ALLOCATING: 'priority',
  ALLOCATED: 'success',
  CANCELLED: 'neutral',
};

const allocationResultStatusCopy: Record<AllocationResultStatus, string> = {
  ALLOCATED: 'Đã cấp đủ',
  PARTIAL: 'Cấp một phần',
  WAITLISTED: 'Chuyển phiếu chờ',
  SKIPPED: 'Không xử lý',
};

const allocationResultStatusTone: Record<
  AllocationResultStatus,
  'neutral' | 'success' | 'warning' | 'danger'
> = {
  ALLOCATED: 'success',
  PARTIAL: 'warning',
  WAITLISTED: 'danger',
  SKIPPED: 'neutral',
};

const allocationResultPageSize = 20;
const allocationTimestampFormatter = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Asia/Ho_Chi_Minh',
});

export type AllocationResultsViewState = 'LOADING' | 'ERROR' | 'EMPTY' | 'READY';

export function allocationResultsViewState(input: {
  readonly hasError: boolean;
  readonly isPending: boolean;
  readonly resultCount: number;
}): AllocationResultsViewState {
  if (input.isPending) return 'LOADING';
  if (input.resultCount > 0) return 'READY';
  if (input.hasError) return 'ERROR';
  return 'EMPTY';
}

function allocationRoundText(result: AllocationResult): string {
  return `Vòng ${result.roundNumber} · lượt ${result.sequenceInRound}`;
}

type AdminSessionTransition = TransitionOrderSessionRequest['status'];

export interface OrderSessionDraft {
  readonly businessDate: string;
  readonly requestOpensTime: string;
  readonly requestClosesTime: string;
  readonly allocationStartsTime: string;
  readonly policyVersion: string;
}

interface SessionNotice {
  readonly kind: 'error' | 'success';
  readonly message: string;
}

type SessionOperation =
  | { readonly kind: 'CREATE'; readonly input: CreateOrderSessionRequest }
  | {
      readonly kind: 'TRANSITION';
      readonly session: OrderSession;
      readonly input: TransitionOrderSessionRequest;
    };

const BUSINESS_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;
const SESSION_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const oneDayMilliseconds = 24 * 60 * 60 * 1_000;
const sessionTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit',
  hourCycle: 'h23',
  minute: '2-digit',
  timeZone: 'Asia/Ho_Chi_Minh',
});
const businessClockFormatter = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  hourCycle: 'h23',
  minute: '2-digit',
  timeZone: 'Asia/Ho_Chi_Minh',
});

function businessClock(date: Date): string {
  return businessClockFormatter.format(date);
}

export function defaultOrderSessionDraft(
  settings?: Pick<OperationalSettingsVersion, 'cutoffTime' | 'policyVersion' | 'snapshotTime'>,
  now = new Date(),
): OrderSessionDraft {
  const requestClosesTime = settings?.snapshotTime ?? '08:00';
  const useNextBusinessDate = businessClock(now) >= requestClosesTime;
  const draftDate = useNextBusinessDate ? new Date(now.getTime() + oneDayMilliseconds) : now;
  return {
    allocationStartsTime: settings?.cutoffTime ?? '09:00',
    businessDate: businessDate(draftDate),
    policyVersion: settings?.policyVersion ?? DEFAULT_ALLOCATION_POLICY_VERSION,
    requestClosesTime,
    requestOpensTime: '00:00',
  };
}

function isoAtBusinessTime(date: string, time: string): string {
  return new Date(`${date}T${time}:00+07:00`).toISOString();
}

export function orderSessionInputFromDraft(draft: OrderSessionDraft): {
  readonly error: string | null;
  readonly input: CreateOrderSessionRequest | null;
} {
  if (
    !SESSION_DATE_PATTERN.test(draft.businessDate) ||
    !BUSINESS_TIME_PATTERN.test(draft.requestOpensTime) ||
    !BUSINESS_TIME_PATTERN.test(draft.requestClosesTime) ||
    !BUSINESS_TIME_PATTERN.test(draft.allocationStartsTime)
  ) {
    return { error: 'Ngày hoặc giờ vận hành chưa hợp lệ.', input: null };
  }
  if (draft.requestOpensTime >= draft.requestClosesTime) {
    return { error: 'Giờ đóng nhận đơn phải sau giờ mở nhận đơn.', input: null };
  }
  if (draft.requestClosesTime > draft.allocationStartsTime) {
    return { error: 'Giờ bắt đầu phân bổ không được trước giờ đóng nhận đơn.', input: null };
  }

  const parsed = CreateOrderSessionRequestSchema.safeParse({
    allocationStartsAt: isoAtBusinessTime(draft.businessDate, draft.allocationStartsTime),
    businessDate: draft.businessDate,
    policyVersion: draft.policyVersion.trim(),
    requestClosesAt: isoAtBusinessTime(draft.businessDate, draft.requestClosesTime),
    requestOpensAt: isoAtBusinessTime(draft.businessDate, draft.requestOpensTime),
  });
  if (!parsed.success) {
    return {
      error: 'Lịch phiên chưa hợp lệ. Hãy kiểm tra ngày, giờ và phiên bản chính sách.',
      input: null,
    };
  }
  return { error: null, input: parsed.data };
}

export function availableSessionTransitions(status: OrderSessionStatus): AdminSessionTransition[] {
  if (status === 'SCHEDULED') return ['OPEN', 'CANCELLED'];
  if (status === 'OPEN') return ['CLOSED', 'CANCELLED'];
  if (status === 'CLOSED') return ['CANCELLED'];
  return [];
}

function sessionActionLabel(status: AdminSessionTransition): string {
  if (status === 'OPEN') return 'Mở nhận đơn';
  if (status === 'CLOSED') return 'Đóng nhận đơn';
  return 'Hủy phiên';
}

function canOpenSessionNow(session: OrderSession, now = Date.now()): boolean {
  return now >= Date.parse(session.requestOpensAt) && now < Date.parse(session.requestClosesAt);
}

function formatSessionTime(value: string): string {
  return sessionTimeFormatter.format(new Date(value));
}

function sessionErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    const reference = error.requestId ? ` Mã yêu cầu: ${error.requestId}.` : '';
    if (error.code === 'VERSION_CONFLICT') {
      return `Phiên đã thay đổi ở nơi khác. Dữ liệu đang được tải lại.${reference}`;
    }
    return `${error.message}${reference}`;
  }
  return 'Không thể hoàn tất thao tác vì phản hồi máy chủ không hợp lệ.';
}

function ProductionAllocationOversight({ role }: Pick<AppOutletContext, 'role'>) {
  const queryClient = useQueryClient();
  const [allocationPage, setAllocationPage] = useState(1);
  const [allocationSessionId, setAllocationSessionId] = useState('');
  const [allocationStatus, setAllocationStatus] = useState<'' | AllocationResultStatus>('');
  const [allocationStoreId, setAllocationStoreId] = useState('');
  const catalogQuery = useQuery({ queryFn: listCatalog, queryKey: ['catalog'], retry: false });
  const storesQuery = useQuery({
    queryFn: listAccessibleStores,
    queryKey: ['stores', 'accessible'],
    retry: false,
  });
  const sessionsQuery = useQuery({
    queryFn: listOrderSessions,
    queryKey: ['order-sessions', 'all'],
    retry: false,
  });
  const settingsQuery = useQuery({
    enabled: role === 'ADMIN',
    queryFn: () => getAdminOperationalSettings(1),
    queryKey: ['admin', 'operational-settings'],
    retry: false,
  });
  const allocationQuery = useQuery({
    queryFn: () =>
      listAllocationResults({
        page: allocationPage,
        pageSize: allocationResultPageSize,
        ...(allocationSessionId ? { sessionId: allocationSessionId } : {}),
        ...(allocationStatus ? { status: allocationStatus } : {}),
        ...(allocationStoreId ? { storeId: allocationStoreId } : {}),
      }),
    queryKey: [
      'allocation-results',
      allocationPage,
      allocationSessionId,
      allocationStatus,
      allocationStoreId,
    ],
    retry: false,
  });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const location = useLocation();
  const focusWaitTicketId = (location.state as { focusWaitTicketId?: unknown } | null)
    ?.focusWaitTicketId;
  const initialFocusTicketId = typeof focusWaitTicketId === 'string' ? focusWaitTicketId : null;
  const [draft, setDraft] = useState<OrderSessionDraft>(() => defaultOrderSessionDraft());
  const [cancelTarget, setCancelTarget] = useState<OrderSession | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [notice, setNotice] = useState<SessionNotice | null>(null);
  const [pendingAction, setPendingAction] = useState('');
  const operationInFlight = useRef(false);
  const operationKeys = useRef(new Map<string, string>());
  const createDateRef = useRef<HTMLInputElement>(null);
  const cancelReasonRef = useRef<HTMLTextAreaElement>(null);
  const allocationResultsHeadingRef = useRef<HTMLHeadingElement>(null);

  const productNameById = useMemo(
    () => new Map((catalogQuery.data ?? []).map((product) => [product.id, product.name])),
    [catalogQuery.data],
  );
  const storeNameById = useMemo(
    () => new Map((storesQuery.data ?? []).map((store) => [store.id, store.name])),
    [storesQuery.data],
  );
  const sessionDateById = useMemo(
    () => new Map((sessionsQuery.data ?? []).map((session) => [session.id, session.businessDate])),
    [sessionsQuery.data],
  );
  const contextError = catalogQuery.error ?? storesQuery.error;
  const allocationViewState = allocationResultsViewState({
    hasError: allocationQuery.isError,
    isPending: allocationQuery.isPending,
    resultCount: allocationQuery.data?.data.length ?? 0,
  });
  const refreshing =
    allocationQuery.isFetching ||
    catalogQuery.isFetching ||
    storesQuery.isFetching ||
    sessionsQuery.isFetching;

  const refresh = async () => {
    setNotice(null);
    await Promise.all([
      catalogQuery.refetch(),
      allocationQuery.refetch(),
      storesQuery.refetch(),
      sessionsQuery.refetch(),
      ...(role === 'ADMIN' ? [settingsQuery.refetch()] : []),
    ]);
  };

  const showSessionResults = (sessionId: string) => {
    setAllocationPage(1);
    setAllocationSessionId(sessionId);
    setAllocationStatus('');
    setAllocationStoreId('');
    void queryClient.invalidateQueries({
      exact: true,
      queryKey: ['allocation-results', 1, sessionId, '', ''],
    });
    window.requestAnimationFrame(() => {
      allocationResultsHeadingRef.current?.focus();
      allocationResultsHeadingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const clearAllocationFilters = () => {
    setAllocationPage(1);
    setAllocationSessionId('');
    setAllocationStatus('');
    setAllocationStoreId('');
  };

  const openCreateForm = () => {
    setDraft(defaultOrderSessionDraft(settingsQuery.data?.current));
    setShowCreateForm(true);
    setCancelTarget(null);
    setNotice(null);
    window.requestAnimationFrame(() => createDateRef.current?.focus());
  };

  const updateDraft = <Key extends keyof OrderSessionDraft>(
    key: Key,
    value: OrderSessionDraft[Key],
  ) => setDraft((current) => ({ ...current, [key]: value }));

  const runSessionOperation = async (operation: SessionOperation): Promise<boolean> => {
    if (operationInFlight.current) return false;
    operationInFlight.current = true;
    const fingerprint = JSON.stringify(operation);
    const idempotencyKey = operationKeys.current.get(fingerprint) ?? crypto.randomUUID();
    operationKeys.current.set(fingerprint, idempotencyKey);
    const actionKey =
      operation.kind === 'CREATE' ? 'CREATE' : `${operation.session.id}:${operation.input.status}`;
    setPendingAction(actionKey);
    setNotice(null);
    try {
      const updated =
        operation.kind === 'CREATE'
          ? await createOrderSession(operation.input, idempotencyKey)
          : await transitionOrderSession(operation.session.id, operation.input, idempotencyKey);
      operationKeys.current.delete(fingerprint);
      queryClient.setQueryData<OrderSession[]>(['order-sessions', 'all'], (current = []) => {
        const withoutUpdated = current.filter((session) => session.id !== updated.id);
        return [updated, ...withoutUpdated].toSorted((left, right) =>
          right.businessDate.localeCompare(left.businessDate),
        );
      });
      await queryClient.invalidateQueries({ queryKey: ['order-sessions'] });
      if (operation.kind === 'CREATE') {
        setShowCreateForm(false);
        setNotice({
          kind: 'success',
          message: `Đã tạo phiên ngày ${updated.businessDate}. Phiên đang chờ đến giờ mở nhận đơn.`,
        });
      } else {
        setCancelTarget(null);
        setCancelReason('');
        setNotice({
          kind: 'success',
          message: `Đã chuyển phiên ngày ${updated.businessDate} sang “${sessionStatusCopy[updated.status]}”.`,
        });
      }
      return true;
    } catch (error) {
      setNotice({ kind: 'error', message: sessionErrorMessage(error) });
      if (error instanceof ApiClientError && error.code === 'VERSION_CONFLICT') {
        await sessionsQuery.refetch();
      }
      return false;
    } finally {
      operationInFlight.current = false;
      setPendingAction('');
    }
  };

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = orderSessionInputFromDraft(draft);
    if (!parsed.input) {
      setNotice({ kind: 'error', message: parsed.error ?? 'Lịch phiên chưa hợp lệ.' });
      return;
    }
    await runSessionOperation({ input: parsed.input, kind: 'CREATE' });
  };

  const transition = async (
    session: OrderSession,
    status: Exclude<AdminSessionTransition, 'CANCELLED'>,
  ) => {
    await runSessionOperation({
      input: { expectedVersion: session.version, status },
      kind: 'TRANSITION',
      session,
    });
  };

  const beginCancel = (session: OrderSession) => {
    setCancelTarget(session);
    setCancelReason('');
    setShowCreateForm(false);
    setNotice(null);
    window.requestAnimationFrame(() => cancelReasonRef.current?.focus());
  };

  const submitCancellation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!cancelTarget || cancelReason.trim().length < 3) {
      setNotice({ kind: 'error', message: 'Lý do hủy phải có ít nhất 3 ký tự.' });
      return;
    }
    await runSessionOperation({
      input: {
        expectedVersion: cancelTarget.version,
        reason: cancelReason.trim(),
        status: 'CANCELLED',
      },
      kind: 'TRANSITION',
      session: cancelTarget,
    });
  };

  return (
    <>
      <PageHeader
        actions={
          <>
            <Button busy={refreshing} onClick={() => void refresh()} tone="secondary">
              <RefreshCw aria-hidden="true" size={16} /> Tải lại
            </Button>
            {role === 'ADMIN' ? (
              <Button
                onClick={() => {
                  if (showCreateForm) {
                    setShowCreateForm(false);
                  } else {
                    openCreateForm();
                  }
                }}
                tone={showCreateForm ? 'secondary' : 'primary'}
              >
                {showCreateForm ? (
                  <X aria-hidden="true" size={16} />
                ) : (
                  <Plus aria-hidden="true" size={16} />
                )}
                {showCreateForm ? 'Đóng biểu mẫu' : 'Tạo phiên mới'}
              </Button>
            ) : null}
          </>
        }
        description="Phiên nhận đơn, phân bổ và phiếu chờ lấy trực tiếp từ backend"
        title="Giám sát phân bổ hàng hóa"
      />

      {notice ? (
        <p
          aria-live={notice.kind === 'error' ? 'assertive' : 'polite'}
          className={`allocation-session-notice allocation-session-notice--${notice.kind}`}
          role={notice.kind === 'error' ? 'alert' : 'status'}
        >
          {notice.message}
        </p>
      ) : null}

      {showCreateForm && role === 'ADMIN' ? (
        <form className="panel allocation-session-form" onSubmit={submitCreate}>
          <div className="section-heading section-heading--compact">
            <div>
              <h2>Tạo phiên nhận đơn</h2>
              <p>
                Mốc đóng nhận đơn, bắt đầu phân bổ và chính sách được điền từ cấu hình vận hành.
              </p>
            </div>
            <Badge tone="info">Asia/Ho_Chi_Minh</Badge>
          </div>
          {settingsQuery.isError ? (
            <p className="allocation-session-form__warning">
              Không tải được cấu hình hiện tại; đang dùng mốc mặc định 08:00–09:00. Hãy kiểm tra kỹ
              trước khi tạo.
            </p>
          ) : null}
          <div className="allocation-session-form__grid">
            <label>
              Ngày nghiệp vụ
              <input
                disabled={pendingAction === 'CREATE'}
                onChange={(event) => updateDraft('businessDate', event.target.value)}
                ref={createDateRef}
                required
                type="date"
                value={draft.businessDate}
              />
            </label>
            <label>
              Mở nhận đơn
              <input
                disabled={pendingAction === 'CREATE'}
                onChange={(event) => updateDraft('requestOpensTime', event.target.value)}
                required
                type="time"
                value={draft.requestOpensTime}
              />
            </label>
            <label>
              Đóng nhận đơn / snapshot
              <input
                disabled={pendingAction === 'CREATE'}
                onChange={(event) => updateDraft('requestClosesTime', event.target.value)}
                required
                type="time"
                value={draft.requestClosesTime}
              />
            </label>
            <label>
              Bắt đầu phân bổ
              <input
                disabled={pendingAction === 'CREATE'}
                onChange={(event) => updateDraft('allocationStartsTime', event.target.value)}
                required
                type="time"
                value={draft.allocationStartsTime}
              />
            </label>
            <label className="allocation-session-form__wide">
              Phiên bản chính sách
              <input
                disabled={pendingAction === 'CREATE'}
                maxLength={80}
                minLength={1}
                onChange={(event) => updateDraft('policyVersion', event.target.value)}
                required
                value={draft.policyVersion}
              />
            </label>
          </div>
          <div className="allocation-session-form__actions">
            <Button
              disabled={pendingAction === 'CREATE'}
              onClick={() => setShowCreateForm(false)}
              tone="secondary"
            >
              Hủy thao tác
            </Button>
            <Button busy={pendingAction === 'CREATE'} type="submit">
              <CalendarClock aria-hidden="true" size={16} /> Tạo phiên đã lên lịch
            </Button>
          </div>
        </form>
      ) : null}

      <section aria-labelledby="order-session-heading" className="panel allocation-session-console">
        <div className="section-heading section-heading--compact">
          <div>
            <h2 id="order-session-heading">Phiên nhận đơn và phân bổ</h2>
            <p>
              Admin vận hành trạng thái có khóa phiên bản; HTKD và cửa hàng theo dõi dữ liệu đúng
              phạm vi được cấp.
            </p>
          </div>
          {role === 'ADMIN' ? (
            <Badge tone="success">Có quyền vận hành</Badge>
          ) : (
            <Badge tone="neutral">Chỉ đọc</Badge>
          )}
        </div>

        {sessionsQuery.isPending ? (
          <p aria-live="polite" className="allocation-session-state">
            Đang tải phiên từ backend…
          </p>
        ) : null}
        {sessionsQuery.isError ? (
          <div className="allocation-session-state allocation-session-state--error" role="alert">
            <span>Không thể tải danh sách phiên.</span>
            <Button onClick={() => void sessionsQuery.refetch()} tone="secondary">
              <RotateCcw aria-hidden="true" size={16} /> Thử lại
            </Button>
          </div>
        ) : null}
        {sessionsQuery.data?.length === 0 ? (
          <EmptyState
            detail={
              role === 'ADMIN'
                ? 'Tạo phiên đầu tiên để cửa hàng có thể gửi yêu cầu đặt hàng.'
                : 'Admin chưa tạo phiên nhận đơn.'
            }
            title="Chưa có phiên vận hành"
          />
        ) : null}
        {sessionsQuery.data && sessionsQuery.data.length > 0 ? (
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Ngày nghiệp vụ</th>
                  <th>Nhận đơn</th>
                  <th>Phân bổ</th>
                  <th>Chính sách</th>
                  <th>Trạng thái</th>
                  <th>Phiên bản</th>
                  <th>Kết quả</th>
                  {role === 'ADMIN' ? <th>Thao tác</th> : null}
                </tr>
              </thead>
              <tbody>
                {sessionsQuery.data.map((session) => {
                  const transitions = availableSessionTransitions(session.status);
                  const openAllowedNow = canOpenSessionNow(session);
                  return (
                    <tr key={session.id}>
                      <td data-label="Ngày nghiệp vụ">
                        <strong>{session.businessDate}</strong>
                        <small>{session.id.slice(0, 8)}</small>
                      </td>
                      <td data-label="Nhận đơn">
                        <strong>{formatSessionTime(session.requestOpensAt)}</strong>
                        <small>đến {formatSessionTime(session.requestClosesAt)}</small>
                      </td>
                      <td data-label="Phân bổ">
                        <strong>{formatSessionTime(session.allocationStartsAt)}</strong>
                        <small>giờ Việt Nam</small>
                      </td>
                      <td data-label="Chính sách">
                        <strong>{session.policyVersion}</strong>
                      </td>
                      <td data-label="Trạng thái">
                        <Badge tone={sessionStatusTone[session.status]}>
                          {sessionStatusCopy[session.status]}
                        </Badge>
                      </td>
                      <td data-label="Phiên bản">v{session.version}</td>
                      <td data-label="Kết quả">
                        <button
                          aria-label={`Xem kết quả phiên ${session.businessDate}`}
                          className="link-button"
                          onClick={() => showSessionResults(session.id)}
                          type="button"
                        >
                          <Eye aria-hidden="true" size={15} /> Xem kết quả
                        </button>
                      </td>
                      {role === 'ADMIN' ? (
                        <td data-label="Thao tác">
                          <div className="allocation-session-actions">
                            {transitions.includes('OPEN') ? (
                              <button
                                aria-busy={pendingAction === `${session.id}:OPEN`}
                                className="link-button"
                                disabled={!openAllowedNow || Boolean(pendingAction)}
                                onClick={() => void transition(session, 'OPEN')}
                                title={
                                  openAllowedNow
                                    ? undefined
                                    : 'Chỉ mở được trong khung giờ nhận đơn đã cấu hình'
                                }
                                type="button"
                              >
                                <Play aria-hidden="true" size={15} />
                                {pendingAction === `${session.id}:OPEN`
                                  ? 'Đang mở…'
                                  : sessionActionLabel('OPEN')}
                              </button>
                            ) : null}
                            {transitions.includes('CLOSED') ? (
                              <button
                                aria-busy={pendingAction === `${session.id}:CLOSED`}
                                className="link-button"
                                disabled={Boolean(pendingAction)}
                                onClick={() => void transition(session, 'CLOSED')}
                                type="button"
                              >
                                <LockKeyhole aria-hidden="true" size={15} />
                                {pendingAction === `${session.id}:CLOSED`
                                  ? 'Đang đóng…'
                                  : sessionActionLabel('CLOSED')}
                              </button>
                            ) : null}
                            {transitions.includes('CANCELLED') ? (
                              <button
                                className="link-button link-button--danger"
                                disabled={Boolean(pendingAction)}
                                onClick={() => beginCancel(session)}
                                type="button"
                              >
                                <Ban aria-hidden="true" size={15} />{' '}
                                {sessionActionLabel('CANCELLED')}
                              </button>
                            ) : null}
                            {transitions.length === 0 ? <span>Không còn thao tác</span> : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section
        aria-labelledby="allocation-results-heading"
        className="panel allocation-results-console"
      >
        <div className="section-heading section-heading--compact">
          <div>
            <h2 id="allocation-results-heading" ref={allocationResultsHeadingRef} tabIndex={-1}>
              Kết quả phân bổ đã lưu
            </h2>
            <p>
              Dữ liệu đọc trực tiếp từ từng dòng phân bổ và luôn giới hạn theo phạm vi cửa hàng của
              tài khoản.
            </p>
          </div>
          <Badge tone="info">{allocationQuery.data?.pagination.totalItems ?? 0} kết quả</Badge>
        </div>

        <div aria-label="Bộ lọc kết quả phân bổ" className="filter-card allocation-result-filters">
          <label>
            Phiên
            <select
              aria-label="Lọc kết quả theo phiên"
              onChange={(event) => {
                setAllocationPage(1);
                setAllocationSessionId(event.target.value);
              }}
              value={allocationSessionId}
            >
              <option value="">Tất cả phiên</option>
              {(sessionsQuery.data ?? []).map((session) => (
                <option key={session.id} value={session.id}>
                  {session.businessDate} · {sessionStatusCopy[session.status]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cửa hàng
            <select
              aria-label="Lọc kết quả theo cửa hàng"
              onChange={(event) => {
                setAllocationPage(1);
                setAllocationStoreId(event.target.value);
              }}
              value={allocationStoreId}
            >
              <option value="">Tất cả cửa hàng được phép xem</option>
              {(storesQuery.data ?? []).map((store) => (
                <option key={store.id} value={store.id}>
                  {store.code} · {store.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Trạng thái
            <select
              aria-label="Lọc kết quả theo trạng thái"
              onChange={(event) => {
                setAllocationPage(1);
                setAllocationStatus(event.target.value as '' | AllocationResultStatus);
              }}
              value={allocationStatus}
            >
              <option value="">Tất cả trạng thái</option>
              {(Object.keys(allocationResultStatusCopy) as AllocationResultStatus[]).map(
                (status) => (
                  <option key={status} value={status}>
                    {allocationResultStatusCopy[status]}
                  </option>
                ),
              )}
            </select>
          </label>
          <Button
            disabled={!allocationSessionId && !allocationStoreId && !allocationStatus}
            onClick={clearAllocationFilters}
            tone="secondary"
          >
            <RotateCcw aria-hidden="true" size={16} /> Xóa bộ lọc
          </Button>
        </div>

        {allocationViewState === 'LOADING' ? (
          <p aria-live="polite" className="allocation-session-state">
            Đang tải kết quả phân bổ từ backend…
          </p>
        ) : null}
        {allocationViewState === 'ERROR' ? (
          <div className="allocation-session-state allocation-session-state--error" role="alert">
            <span>Không thể tải kết quả phân bổ. Dữ liệu phiên và phiếu chờ vẫn được giữ lại.</span>
            <Button onClick={() => void allocationQuery.refetch()} tone="secondary">
              <RotateCcw aria-hidden="true" size={16} /> Thử lại
            </Button>
          </div>
        ) : null}
        {allocationViewState === 'READY' && allocationQuery.isError ? (
          <div className="allocation-session-state allocation-session-state--error" role="alert">
            <span>
              Không thể cập nhật kết quả mới nhất. Bảng bên dưới vẫn là dữ liệu đã xác nhận gần
              nhất.
            </span>
            <Button onClick={() => void allocationQuery.refetch()} tone="secondary">
              <RotateCcw aria-hidden="true" size={16} /> Thử lại
            </Button>
          </div>
        ) : null}
        {allocationViewState === 'EMPTY' ? (
          <EmptyState
            detail="Đổi bộ lọc hoặc chọn một phiên đã hoàn tất phân bổ."
            title="Chưa có kết quả phân bổ phù hợp"
          />
        ) : null}
        {allocationViewState === 'READY' && allocationQuery.data ? (
          <>
            {allocationQuery.isFetching ? (
              <p aria-live="polite" className="allocation-result-refreshing">
                Đang cập nhật kết quả…
              </p>
            ) : null}
            <div className="responsive-table">
              <table>
                <thead>
                  <tr>
                    <th>Phiên</th>
                    <th>Cửa hàng</th>
                    <th>Mặt hàng</th>
                    <th>Yêu cầu</th>
                    <th>Đã cấp</th>
                    <th>Chờ</th>
                    <th>Ưu tiên / vòng</th>
                    <th>Kết quả / lý do</th>
                  </tr>
                </thead>
                <tbody>
                  {allocationQuery.data.data.map((result) => (
                    <tr key={result.id}>
                      <td data-label="Phiên">
                        <strong>{sessionDateById.get(result.sessionId) ?? 'Không rõ ngày'}</strong>
                        <small title={result.sessionId}>{result.sessionId.slice(0, 8)}</small>
                      </td>
                      <td data-label="Cửa hàng">
                        <strong>{storeNameById.get(result.storeId) ?? result.storeId}</strong>
                      </td>
                      <td data-label="Mặt hàng">
                        <strong>{productNameById.get(result.productId) ?? result.productId}</strong>
                      </td>
                      <td data-label="Yêu cầu">{result.requestedQuantity}</td>
                      <td data-label="Đã cấp">
                        <strong className="text-success">{result.allocatedQuantity}</strong>
                      </td>
                      <td data-label="Chờ">
                        <strong
                          className={result.waitlistedQuantity > 0 ? 'text-danger' : undefined}
                        >
                          {result.waitlistedQuantity}
                        </strong>
                      </td>
                      <td data-label="Ưu tiên / vòng">
                        <Badge tone={result.priority.startsWith('P0') ? 'priority' : 'info'}>
                          {result.priority}
                        </Badge>
                        <small>{allocationRoundText(result)}</small>
                      </td>
                      <td className="allocation-result-decision" data-label="Kết quả / lý do">
                        <Badge tone={allocationResultStatusTone[result.status]}>
                          {allocationResultStatusCopy[result.status]}
                        </Badge>
                        <small title={result.reasonCode}>{result.reasonCode}</small>
                        <small>
                          {allocationTimestampFormatter.format(new Date(result.createdAt))}
                        </small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="allocation-result-pagination">
              <span>
                Trang {allocationQuery.data.pagination.page} /{' '}
                {Math.max(1, allocationQuery.data.pagination.totalPages)} ·{' '}
                {allocationQuery.data.pagination.totalItems} kết quả
              </span>
              <div>
                <Button
                  disabled={allocationQuery.data.pagination.page <= 1 || allocationQuery.isFetching}
                  onClick={() => setAllocationPage((current) => Math.max(1, current - 1))}
                  tone="secondary"
                >
                  <ChevronLeft aria-hidden="true" size={16} /> Trang trước
                </Button>
                <Button
                  disabled={
                    allocationQuery.isFetching ||
                    allocationQuery.data.pagination.page >=
                      allocationQuery.data.pagination.totalPages
                  }
                  onClick={() => setAllocationPage((current) => current + 1)}
                  tone="secondary"
                >
                  Trang sau <ChevronRight aria-hidden="true" size={16} />
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </section>

      {cancelTarget && role === 'ADMIN' ? (
        <form className="panel allocation-cancel-form" onSubmit={submitCancellation}>
          <div>
            <h2>Hủy phiên ngày {cancelTarget.businessDate}</h2>
            <p>Thao tác được audit và không thể mở lại phiên đã hủy.</p>
          </div>
          <label>
            Lý do hủy
            <textarea
              disabled={pendingAction === `${cancelTarget.id}:CANCELLED`}
              maxLength={500}
              minLength={3}
              onChange={(event) => setCancelReason(event.target.value)}
              ref={cancelReasonRef}
              required
              value={cancelReason}
            />
          </label>
          <div className="allocation-session-form__actions">
            <Button
              disabled={Boolean(pendingAction)}
              onClick={() => {
                setCancelTarget(null);
                setCancelReason('');
              }}
              tone="secondary"
            >
              Giữ phiên
            </Button>
            <Button
              busy={pendingAction === `${cancelTarget.id}:CANCELLED`}
              disabled={cancelReason.trim().length < 3}
              tone="danger"
              type="submit"
            >
              <Ban aria-hidden="true" size={16} /> Xác nhận hủy phiên
            </Button>
          </div>
        </form>
      ) : null}

      {contextError ? (
        <section className="panel form-error" role="alert">
          <p>Không thể tải tên cửa hàng hoặc mặt hàng; mã định danh vẫn được giữ nguyên.</p>
          <Button
            onClick={() => {
              void catalogQuery.refetch();
              void storesQuery.refetch();
            }}
            tone="secondary"
          >
            <RotateCcw aria-hidden="true" size={16} /> Thử tải lại tên
          </Button>
        </section>
      ) : null}
      {catalogQuery.isPending || storesQuery.isPending ? (
        <section aria-live="polite" className="panel allocation-context-loading">
          Đang tải thông tin đối chiếu…
        </section>
      ) : null}
      <WaitlistPanel
        initialFocusTicketId={initialFocusTicketId}
        productNameById={productNameById}
        role={role}
        storeNameById={storeNameById}
        title="Giám sát phiếu chờ"
      />
    </>
  );
}
