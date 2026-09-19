import type {
  InventoryAmount,
  PriorityOffer as PriorityOfferRecord,
  RespondPriorityOfferRequest,
  WaitTicket,
  WaitTicketAuditEvent,
} from '@idosi/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Clock3, History, RotateCcw, X } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  ApiClientError,
  cancelWaitTicket,
  getWaitTicketHistory,
  listPriorityOffers,
  listWaitTickets,
  respondPriorityOffer,
} from '../lib/api';
import { useSession } from '../lib/auth';
import { useDialogAccessibility } from '../lib/use-dialog-accessibility';
import { retainIdempotencyForExactRetry, type RetryAttempt } from '../lib/idempotency-retry';
import type { Role } from '../lib/types';
import { Badge } from './Badge';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { PriorityOffer } from './PriorityOffer';

interface WaitlistPanelProps {
  readonly initialFocusTicketId?: string | null;
  readonly productNameById: ReadonlyMap<string, string>;
  readonly role: Role;
  readonly scopeStoreId?: string;
  readonly storeNameById?: ReadonlyMap<string, string>;
  readonly title?: string;
}

const cancellableStatuses = new Set<WaitTicket['status']>([
  'WAITING',
  'OFFERED',
  'PARTIALLY_FULFILLED',
]);
const emptyNameMap = new Map<string, string>();

const ticketStatusLabel: Record<WaitTicket['status'], string> = {
  CANCELLED: 'Đã hủy',
  EXPIRED: 'Hết hạn',
  FULFILLED: 'Đã cấp đủ',
  OFFERED: 'Đang ưu tiên',
  PARTIALLY_FULFILLED: 'Đã cấp một phần',
  WAITING: 'Đang chờ',
};

const offerStatusLabel: Record<PriorityOfferRecord['status'], string> = {
  ACCEPTED: 'Đã nhận đủ',
  CANCELLED: 'Đã hủy',
  DECLINED: 'Đã từ chối',
  EXPIRED: 'Hết hạn',
  PENDING: 'Đang chờ phản hồi',
};

const auditActionLabel: Readonly<Record<string, string>> = {
  PRIORITY_OFFER_ACCEPTED: 'Cửa hàng nhận lượt ưu tiên',
  PRIORITY_OFFER_CANCELLED: 'Hủy lượt ưu tiên',
  PRIORITY_OFFER_CANCELLED_WITH_WAIT_TICKET: 'Hủy lượt ưu tiên cùng phiếu chờ',
  PRIORITY_OFFER_CREATED: 'Tạo lượt ưu tiên',
  PRIORITY_OFFER_DECLINED: 'Cửa hàng từ chối lượt ưu tiên',
  PRIORITY_OFFER_EXPIRED: 'Lượt ưu tiên hết hạn',
  WAIT_TICKET_CANCELLED: 'Cửa hàng hủy phiếu chờ',
  WAIT_TICKET_CREATED: 'Tạo phiếu chờ',
  WAIT_TICKET_FULFILLED: 'Cấp đủ phiếu chờ',
  WAIT_TICKET_UPDATED: 'Cập nhật phiếu chờ',
};

function amountLabel(amount: InventoryAmount): string {
  return amount.kind === 'UNIT' ? `${amount.quantity} bao` : `${amount.value} kg`;
}

function messageOf(cause: unknown, fallback: string): string {
  return cause instanceof ApiClientError ? cause.message : fallback;
}

export function WaitlistPanel({
  initialFocusTicketId = null,
  productNameById,
  role,
  scopeStoreId,
  storeNameById = emptyNameMap,
  title = 'Phiếu chờ và lượt ưu tiên',
}: WaitlistPanelProps) {
  const queryClient = useQueryClient();
  const sessionQuery = useSession();
  const principal = sessionQuery.data?.principal;
  const viewerAccountId = principal?.accountId ?? 'unverified';
  const canRespond =
    role === 'STORE' &&
    principal?.role === 'STORE' &&
    typeof scopeStoreId === 'string' &&
    principal.storeId === scopeStoreId;
  const ticketFilters = scopeStoreId ? { storeId: scopeStoreId } : {};
  const scopeQueryKey = scopeStoreId ?? 'accessible';
  const ticketQueryKey = ['wait-tickets', viewerAccountId, scopeQueryKey] as const;
  const offerQueryKey = ['priority-offers', viewerAccountId, scopeQueryKey] as const;
  const ticketsQuery = useQuery({
    enabled: principal !== undefined,
    queryFn: () => listWaitTickets(ticketFilters),
    queryKey: ticketQueryKey,
    retry: false,
  });
  const offersQuery = useQuery({
    enabled: principal !== undefined,
    queryFn: () => listPriorityOffers({ ...ticketFilters, status: 'PENDING' }),
    queryKey: offerQueryKey,
    retry: false,
  });
  const [historyTicketId, setHistoryTicketId] = useState<string | null>(initialFocusTicketId);
  const [cancelTarget, setCancelTarget] = useState<WaitTicket | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [busyOffer, setBusyOffer] = useState<{
    readonly action: 'ACCEPT' | 'DECLINE';
    readonly id: string;
  } | null>(null);
  const [cancellingTicketId, setCancellingTicketId] = useState<string | null>(null);
  const [offerError, setOfferError] = useState<{
    readonly id: string;
    readonly message: string;
  } | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const offerAttempt = useRef<RetryAttempt | null>(null);
  const cancelAttempt = useRef<RetryAttempt | null>(null);
  const offerInFlight = useRef(false);
  const cancelInFlight = useRef(false);
  const tickets = (ticketsQuery.data ?? []).filter(
    (ticket) => scopeStoreId === undefined || ticket.storeId === scopeStoreId,
  );
  const offers = (offersQuery.data ?? []).filter(
    (offer) => scopeStoreId === undefined || offer.storeId === scopeStoreId,
  );
  const pendingOffers = offers.filter((offer) => offer.status === 'PENDING');
  const historyQuery = useQuery({
    enabled: historyTicketId !== null && principal !== undefined,
    queryFn: () => {
      if (!historyTicketId) throw new Error('Missing wait ticket history target');
      return getWaitTicketHistory(historyTicketId);
    },
    queryKey: ['wait-ticket-history', viewerAccountId, historyTicketId],
    retry: false,
  });
  const loading = sessionQuery.isPending || ticketsQuery.isPending || offersQuery.isPending;
  const loadError = sessionQuery.error ?? ticketsQuery.error ?? offersQuery.error;
  const trimmedCancelReason = cancelReason.trim();
  const cancelReasonInvalid = trimmedCancelReason.length < 3;

  const refetchWaitState = async () => {
    await Promise.all([ticketsQuery.refetch(), offersQuery.refetch()]);
    if (historyTicketId) await historyQuery.refetch();
  };

  const respond = async (offerId: string, input: RespondPriorityOfferRequest) => {
    if (!canRespond || offerInFlight.current || cancelInFlight.current) return;
    offerInFlight.current = true;
    const fingerprint = `${offerId}:${JSON.stringify(input)}`;
    const attempt = retainIdempotencyForExactRetry(offerAttempt.current, fingerprint);
    offerAttempt.current = attempt;
    setBusyOffer({ action: input.action, id: offerId });
    setOfferError(null);
    setNotice(null);
    try {
      const updated = await respondPriorityOffer(offerId, input, attempt.key);
      queryClient.setQueryData<PriorityOfferRecord[]>(offerQueryKey, (current) =>
        current?.map((offer) => (offer.id === updated.id ? updated : offer)),
      );
      await queryClient.invalidateQueries({
        exact: true,
        queryKey: ['wait-ticket-history', viewerAccountId, updated.waitTicketId],
        refetchType: 'none',
      });
      offerAttempt.current = null;
      setNotice(
        input.action === 'ACCEPT'
          ? 'Máy chủ đã ghi nhận nhận đủ lượt ưu tiên.'
          : 'Máy chủ đã ghi nhận từ chối lượt ưu tiên.',
      );
      await refetchWaitState();
    } catch (cause) {
      setOfferError({
        id: offerId,
        message: messageOf(
          cause,
          'Không thể ghi nhận phản hồi. Bấm lại để thử đúng yêu cầu trước đó.',
        ),
      });
    } finally {
      offerInFlight.current = false;
      setBusyOffer(null);
    }
  };

  const cancel = async () => {
    if (
      !canRespond ||
      !cancelTarget ||
      cancelReasonInvalid ||
      cancelInFlight.current ||
      offerInFlight.current
    ) {
      return;
    }
    cancelInFlight.current = true;
    const fingerprint = `${cancelTarget.id}:${trimmedCancelReason}`;
    const attempt = retainIdempotencyForExactRetry(cancelAttempt.current, fingerprint);
    cancelAttempt.current = attempt;
    setCancellingTicketId(cancelTarget.id);
    setCancelError(null);
    setNotice(null);
    try {
      const updated = await cancelWaitTicket(
        cancelTarget.id,
        { reason: trimmedCancelReason },
        attempt.key,
      );
      queryClient.setQueryData<WaitTicket[]>(ticketQueryKey, (current) =>
        current?.map((ticket) => (ticket.id === updated.id ? updated : ticket)),
      );
      await queryClient.invalidateQueries({
        exact: true,
        queryKey: ['wait-ticket-history', viewerAccountId, updated.id],
        refetchType: 'none',
      });
      cancelAttempt.current = null;
      setCancelTarget(null);
      setCancelReason('');
      setNotice('Máy chủ đã hủy phiếu chờ và lưu lý do vào lịch sử.');
      await refetchWaitState();
    } catch (cause) {
      setCancelError(
        messageOf(cause, 'Không thể hủy phiếu. Bấm lại để thử đúng yêu cầu trước đó.'),
      );
    } finally {
      cancelInFlight.current = false;
      setCancellingTicketId(null);
    }
  };

  const retryLoading = () => {
    void sessionQuery.refetch();
    void ticketsQuery.refetch();
    void offersQuery.refetch();
  };

  return (
    <>
      {pendingOffers.map((offer) => (
        <PriorityOffer
          busyAction={busyOffer?.id === offer.id ? busyOffer.action : null}
          canRespond={canRespond}
          error={offerError?.id === offer.id ? offerError.message : null}
          interactionDisabled={
            busyOffer !== null ||
            cancellingTicketId !== null ||
            offersQuery.error !== null ||
            sessionQuery.error !== null
          }
          key={offer.id}
          offer={offer}
          onExpired={() => void refetchWaitState()}
          onOpenTicket={() => setHistoryTicketId(offer.waitTicketId)}
          onRespond={(input) => void respond(offer.id, input)}
          productName={productNameById.get(offer.productId) ?? offer.productId}
        />
      ))}

      <section className="panel history-list waitlist-panel">
        <div className="section-heading section-heading--compact">
          <div>
            <h2>{title}</h2>
            <p>
              {canRespond
                ? 'Dữ liệu trực tiếp từ máy chủ; nhận ưu tiên phải nhận đủ số lượng được đề nghị.'
                : 'Chế độ giám sát chỉ đọc; phản hồi ưu tiên chỉ xuất hiện cho đúng cửa hàng.'}
            </p>
          </div>
          {!canRespond ? <Badge tone="info">Chỉ đọc</Badge> : null}
        </div>

        {notice ? (
          <div className="inline-notice" role="status">
            {notice}
          </div>
        ) : null}
        {loadError ? (
          <div className="form-error waitlist-panel__error" role="alert">
            <span>{messageOf(loadError, 'Không thể tải dữ liệu phiếu chờ.')}</span>
            <Button onClick={retryLoading} tone="secondary">
              <RotateCcw aria-hidden="true" size={15} /> Thử lại
            </Button>
          </div>
        ) : null}
        {loading ? <p aria-live="polite">Đang tải phiếu chờ và lượt ưu tiên…</p> : null}
        {!loading && !loadError && tickets.length === 0 ? (
          <EmptyState
            detail="Phiếu mới sẽ xuất hiện sau khi phân bổ còn thiếu hàng."
            title="Chưa có phiếu chờ"
          />
        ) : null}
        {!loading && !loadError
          ? tickets.map((ticket) => {
              const canCancel = canRespond && cancellableStatuses.has(ticket.status);
              return (
                <article key={ticket.id}>
                  <div>
                    <strong>{productNameById.get(ticket.productId) ?? ticket.productId}</strong>
                    <span>
                      <Clock3 aria-hidden="true" size={14} /> Còn {amountLabel(ticket.remaining)} •{' '}
                      ưu tiên {ticket.priority}
                      {storeNameById.get(ticket.storeId)
                        ? ` • ${storeNameById.get(ticket.storeId)}`
                        : ''}
                    </span>
                  </div>
                  <Badge
                    tone={
                      ticket.status === 'FULFILLED'
                        ? 'success'
                        : ticket.status === 'CANCELLED' || ticket.status === 'EXPIRED'
                          ? 'neutral'
                          : ticket.status === 'OFFERED'
                            ? 'priority'
                            : 'warning'
                    }
                  >
                    {ticketStatusLabel[ticket.status]}
                  </Badge>
                  <div className="waitlist-panel__actions">
                    <button
                      className="link-button"
                      onClick={() => setHistoryTicketId(ticket.id)}
                      type="button"
                    >
                      <History aria-hidden="true" size={15} /> Xem lịch sử
                    </button>
                    {canCancel ? (
                      <button
                        className="link-button link-button--danger"
                        disabled={cancellingTicketId !== null || busyOffer !== null}
                        onClick={() => {
                          setCancelTarget(ticket);
                          setCancelReason('');
                          setCancelError(null);
                        }}
                        type="button"
                      >
                        <Ban aria-hidden="true" size={15} /> Hủy phiếu
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })
          : null}
      </section>

      {historyTicketId ? (
        <HistoryDialog
          error={historyQuery.error}
          history={historyQuery.data}
          loading={historyQuery.isPending || historyQuery.isFetching}
          onClose={() => setHistoryTicketId(null)}
          onRetry={() => void historyQuery.refetch()}
          productNameById={productNameById}
        />
      ) : null}

      {cancelTarget ? (
        <CancelDialog
          busy={cancellingTicketId === cancelTarget.id}
          error={cancelError}
          invalid={cancelReasonInvalid}
          onCancel={() => setCancelTarget(null)}
          onConfirm={() => void cancel()}
          onReasonChange={(value) => {
            setCancelReason(value);
            setCancelError(null);
          }}
          productName={productNameById.get(cancelTarget.productId) ?? cancelTarget.productId}
          reason={cancelReason}
        />
      ) : null}
    </>
  );
}

interface HistoryDialogProps {
  readonly error: unknown;
  readonly history: Awaited<ReturnType<typeof getWaitTicketHistory>> | undefined;
  readonly loading: boolean;
  readonly onClose: () => void;
  readonly onRetry: () => void;
  readonly productNameById: ReadonlyMap<string, string>;
}

function HistoryDialog({
  error,
  history,
  loading,
  onClose,
  onRetry,
  productNameById,
}: HistoryDialogProps) {
  const dialogRef = useDialogAccessibility(onClose);
  const titleId = 'wait-ticket-history-title';

  return (
    <div className="dialog-backdrop">
      <section
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-modal="true"
        className="dialog waitlist-dialog"
        role="dialog"
        tabIndex={-1}
      >
        <div className="dialog__header">
          <div>
            <h2 id={titleId}>Lịch sử phiếu chờ</h2>
            <p>Dữ liệu máy chủ và audit, không suy diễn trạng thái tại trình duyệt.</p>
          </div>
          <button aria-label="Đóng lịch sử phiếu chờ" onClick={onClose} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </div>
        {loading ? <p aria-live="polite">Đang tải lịch sử…</p> : null}
        {error ? (
          <div className="form-error" role="alert">
            {messageOf(error, 'Không thể tải lịch sử phiếu chờ.')}
            <Button onClick={onRetry} tone="secondary">
              Thử lại
            </Button>
          </div>
        ) : null}
        {history && !loading ? (
          <div className="waitlist-dialog__body">
            <div className="dialog__summary">
              <div>
                <strong>
                  {productNameById.get(history.ticket.productId) ?? history.ticket.productId}
                </strong>
                <span>Còn {amountLabel(history.ticket.remaining)}</span>
              </div>
              <Badge tone="info">{ticketStatusLabel[history.ticket.status]}</Badge>
            </div>
            <section>
              <h3>Lượt ưu tiên</h3>
              {history.offers.length === 0 ? <p>Chưa có lượt ưu tiên.</p> : null}
              {history.offers.map((offer) => (
                <article key={offer.id}>
                  <strong>{amountLabel(offer.offered)}</strong>
                  <span>
                    {offerStatusLabel[offer.status]} •{' '}
                    {new Date(offer.offeredAt).toLocaleString('vi-VN')}
                  </span>
                </article>
              ))}
            </section>
            <section>
              <h3>Audit</h3>
              {history.audit.length === 0 ? <p>Chưa có sự kiện audit.</p> : null}
              {history.audit.map((event) => (
                <AuditRow event={event} key={event.id} />
              ))}
            </section>
          </div>
        ) : null}
        <div className="dialog__actions">
          <Button onClick={onClose} tone="secondary">
            Đóng
          </Button>
        </div>
      </section>
    </div>
  );
}

function AuditRow({ event }: { readonly event: WaitTicketAuditEvent }) {
  return (
    <article>
      <strong>{auditActionLabel[event.action] ?? event.action}</strong>
      <span>
        {new Date(event.createdAt).toLocaleString('vi-VN')} • {event.actorRole ?? 'Hệ thống'}
      </span>
    </article>
  );
}

interface CancelDialogProps {
  readonly busy: boolean;
  readonly error: string | null;
  readonly invalid: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly onReasonChange: (value: string) => void;
  readonly productName: string;
  readonly reason: string;
}

function CancelDialog({
  busy,
  error,
  invalid,
  onCancel,
  onConfirm,
  onReasonChange,
  productName,
  reason,
}: CancelDialogProps) {
  const dialogRef = useDialogAccessibility(busy ? undefined : onCancel);
  const titleId = 'cancel-wait-ticket-title';
  const reasonErrorId = 'cancel-wait-ticket-reason-error';

  return (
    <div className="dialog-backdrop">
      <section
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-modal="true"
        className="dialog"
        role="dialog"
        tabIndex={-1}
      >
        <div className="dialog__header">
          <div>
            <h2 id={titleId}>Hủy phiếu chờ</h2>
            <p>{productName} • thao tác sẽ được ghi audit.</p>
          </div>
          <button
            aria-label="Đóng hộp thoại hủy phiếu"
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </div>
        <label>
          Lý do hủy
          <textarea
            aria-describedby={invalid && reason.length > 0 ? reasonErrorId : undefined}
            autoFocus
            disabled={busy}
            maxLength={500}
            minLength={3}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="Nhập ít nhất 3 ký tự"
            required
            rows={3}
            value={reason}
          />
        </label>
        {invalid && reason.length > 0 ? (
          <div className="form-error" id={reasonErrorId} role="alert">
            Lý do phải có ít nhất 3 ký tự.
          </div>
        ) : null}
        {error ? (
          <div className="form-error" role="alert">
            {error}
          </div>
        ) : null}
        <div className="dialog__actions">
          <Button disabled={busy} onClick={onCancel} tone="secondary">
            Giữ phiếu
          </Button>
          <Button busy={busy} disabled={invalid} onClick={onConfirm} tone="danger">
            Hủy phiếu chờ
          </Button>
        </div>
      </section>
    </div>
  );
}
