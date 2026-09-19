import type {
  PriorityOffer as PriorityOfferRecord,
  RespondPriorityOfferRequest,
} from '@idosi/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlarmClock, ArrowRight, Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ApiClientError,
  listCatalog,
  listPriorityOffers,
  mockModeEnabled,
  respondPriorityOffer,
} from '../lib/api';
import { useSession } from '../lib/auth';
import { retainIdempotencyForExactRetry, type RetryAttempt } from '../lib/idempotency-retry';
import type { Role } from '../lib/types';
import { useDialogAccessibility } from '../lib/use-dialog-accessibility';
import { Button } from './Button';

interface PriorityOfferOverlayProps {
  readonly role: Role;
}

interface OverlayOffer {
  readonly id: string;
  readonly waitTicketId: string;
  readonly productName: string;
  readonly amountLabel: string;
  readonly offeredAt: string;
  readonly expiresAt: string;
  readonly status: PriorityOfferRecord['status'];
  readonly record?: PriorityOfferRecord;
}

interface DemoOfferState {
  readonly id: string;
  readonly remaining: number;
  readonly status: 'ACTIVE' | 'ACCEPTED' | 'DECLINED';
}

const DEMO_OFFER_ID = 'PU-GV-260912-003';

function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const mmss = `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return hours > 0 ? `${String(hours).padStart(2, '0')}:${mmss}` : mmss;
}

function amountText(offer: PriorityOfferRecord): string {
  return offer.offered.kind === 'UNIT'
    ? `${offer.offered.quantity} bao`
    : `${offer.offered.value} kg`;
}

function messageOf(cause: unknown, fallback: string): string {
  return cause instanceof ApiClientError ? cause.message : fallback;
}

function urgencyTone(remainingSeconds: number): 'normal' | 'warning' | 'danger' {
  if (remainingSeconds <= 60) return 'danger';
  if (remainingSeconds <= 300) return 'warning';
  return 'normal';
}

/** Full-screen green takeover for pending priority offers (process v1.4 §23.1). */
export function PriorityOfferOverlay({ role }: PriorityOfferOverlayProps) {
  const headingId = useId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sessionQuery = useSession();
  const principal = sessionQuery.data?.principal;
  const viewerAccountId = principal?.accountId ?? 'unverified';
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissedIds, setDismissedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [busyAction, setBusyAction] = useState<'ACCEPT' | 'DECLINE' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const attemptRef = useRef<RetryAttempt | null>(null);
  const inFlight = useRef(false);

  const demoEnabled = mockModeEnabled && (role === 'STORE' || role === 'HTKD');
  const [demo, setDemo] = useState<DemoOfferState>({
    id: DEMO_OFFER_ID,
    remaining: 18 * 60 + 42,
    status: 'ACTIVE',
  });

  useEffect(() => {
    if (!demoEnabled || demo.status !== 'ACTIVE' || demo.remaining <= 0) return undefined;
    const timer = window.setInterval(
      () => setDemo((current) => ({ ...current, remaining: Math.max(0, current.remaining - 1) })),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [demo.remaining, demo.status, demoEnabled]);

  const offersQuery = useQuery({
    enabled: !mockModeEnabled && role !== 'ADMIN' && principal !== undefined,
    queryFn: () => listPriorityOffers({ status: 'PENDING' }),
    queryKey: ['priority-offers-overlay', viewerAccountId],
    refetchInterval: 30_000,
    retry: false,
  });

  const catalogQuery = useQuery({
    enabled: !mockModeEnabled && role !== 'ADMIN',
    queryFn: () => listCatalog(),
    queryKey: ['priority-overlay-catalog', viewerAccountId],
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const productNameById = useMemo(
    () => new Map((catalogQuery.data ?? []).map((product) => [product.id, product.name])),
    [catalogQuery.data],
  );

  const liveOffers = useMemo<OverlayOffer[]>(() => {
    const records = [...(offersQuery.data ?? [])].sort(
      (left, right) => Date.parse(left.expiresAt) - Date.parse(right.expiresAt),
    );
    return records.map((record) => ({
      amountLabel: amountText(record),
      expiresAt: record.expiresAt,
      id: record.id,
      offeredAt: record.offeredAt,
      productName: productNameById.get(record.productId) ?? record.productId,
      record,
      status: record.status,
      waitTicketId: record.waitTicketId,
    }));
  }, [offersQuery.data, productNameById]);

  const offers = useMemo<OverlayOffer[]>(() => {
    if (!demoEnabled) return liveOffers;
    if (demo.status !== 'ACTIVE' || demo.remaining <= 0) return [];
    return [
      {
        amountLabel: '3 bao',
        expiresAt: new Date(now + demo.remaining * 1000).toISOString(),
        id: demo.id,
        offeredAt: new Date(now - 60_000).toISOString(),
        productName: 'Đồ nam',
        status: 'PENDING' as const,
        waitTicketId: 'PC-GV-DONAM-011',
      },
    ];
  }, [demo, demoEnabled, liveOffers, now]);

  const visible = offers.filter((offer) => !dismissedIds.has(offer.id));
  const current = visible[Math.min(activeIndex, Math.max(0, visible.length - 1))];

  useEffect(() => {
    if (demoEnabled || current?.record === undefined) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [current?.record, demoEnabled]);

  const remaining = current
    ? Math.max(0, Math.ceil((Date.parse(current.expiresAt) - now) / 1000))
    : 0;

  const canRespond =
    !demoEnabled &&
    role === 'STORE' &&
    principal?.role === 'STORE' &&
    current?.record !== undefined &&
    principal.storeId === current.record.storeId;

  const respond = async (action: 'ACCEPT' | 'DECLINE') => {
    const record = current?.record;
    if (!canRespond || record === undefined || inFlight.current) return;
    inFlight.current = true;
    const input: RespondPriorityOfferRequest =
      action === 'ACCEPT' ? { accepted: record.offered, action: 'ACCEPT' } : { action: 'DECLINE' };
    const fingerprint = `${record.id}:${JSON.stringify(input)}`;
    const attempt = retainIdempotencyForExactRetry(attemptRef.current, fingerprint);
    attemptRef.current = attempt;
    setBusyAction(action);
    setError(null);
    try {
      await respondPriorityOffer(record.id, input, attempt.key);
      attemptRef.current = null;
      await queryClient.invalidateQueries({ queryKey: ['priority-offers-overlay'] });
      await queryClient.invalidateQueries({ queryKey: ['priority-offers'] });
    } catch (cause) {
      setError(
        messageOf(cause, 'Không thể ghi nhận phản hồi. Bấm lại để thử đúng yêu cầu trước đó.'),
      );
    } finally {
      inFlight.current = false;
      setBusyAction(null);
    }
  };

  const dismiss = () => {
    if (!current) return;
    setDismissedIds((previous) => new Set(previous).add(current.id));
    setActiveIndex(0);
  };

  const openTicket = () => {
    if (!current) return;
    navigate('/allocations', {
      state: { focusWaitTicketId: current.waitTicketId },
    });
  };

  const dialogRef = useDialogAccessibility(current === undefined ? undefined : () => dismiss());
  if (!current) return null;

  const tone = urgencyTone(remaining);
  const expiredLocally = !demoEnabled && current.record !== undefined && remaining === 0;

  return (
    <div className="priority-overlay__backdrop">
      <section
        ref={dialogRef}
        aria-labelledby={headingId}
        aria-modal="true"
        className="priority-overlay"
        role="dialog"
        tabIndex={-1}
      >
        <button
          aria-label="Ẩn thông báo phiếu ưu tiên"
          className="priority-overlay__close"
          onClick={dismiss}
          type="button"
        >
          <X aria-hidden="true" size={20} />
        </button>
        <div className="priority-overlay__top">
          <span className="priority-overlay__badge">
            <Check aria-hidden="true" size={13} /> PHIẾU ƯU TIÊN
          </span>
          <span
            aria-live="off"
            className={`priority-overlay__timer priority-overlay__timer--${tone}`}
          >
            <AlarmClock aria-hidden="true" size={20} />
            {formatCountdown(remaining)}
          </span>
          {visible.length > 1 ? (
            <span className="priority-overlay__pager">
              <button
                aria-label="Phiếu ưu tiên sắp hết hạn trước đó"
                disabled={activeIndex === 0}
                onClick={() => setActiveIndex((value) => Math.max(0, value - 1))}
                type="button"
              >
                <ChevronLeft aria-hidden="true" size={16} />
              </button>
              {activeIndex + 1}/{visible.length} phiếu
              <button
                aria-label="Phiếu ưu tiên kế tiếp"
                disabled={activeIndex >= visible.length - 1}
                onClick={() => setActiveIndex((value) => Math.min(visible.length - 1, value + 1))}
                type="button"
              >
                <ChevronRight aria-hidden="true" size={16} />
              </button>
            </span>
          ) : null}
        </div>
        <h2 className="priority-overlay__title" id={headingId}>
          Bạn đang có phiếu ưu tiên {current.amountLabel} {current.productName}
        </h2>
        <p className="priority-overlay__meta">
          {current.id} • hết hạn {new Date(current.expiresAt).toLocaleString('vi-VN')}
        </p>
        {demoEnabled ? (
          <p className="priority-overlay__meta">
            Chế độ kiểm thử: phản hồi đầu tiên được ghi nhận cho Quản lý cửa hàng và HTKD phụ trách.
          </p>
        ) : null}
        {expiredLocally ? (
          <p className="priority-overlay__note" role="status">
            Lượt ưu tiên đã hết hạn; hold đã được giải phóng và phiếu chờ gốc vẫn được giữ.
          </p>
        ) : null}
        {error ? (
          <p className="priority-overlay__note priority-overlay__note--error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="priority-overlay__actions">
          <button className="priority-overlay__open" onClick={openTicket} type="button">
            Mở phiếu ưu tiên <ArrowRight aria-hidden="true" size={19} />
          </button>
          {canRespond && !expiredLocally ? (
            <div className="priority-overlay__respond">
              <Button
                busy={busyAction === 'ACCEPT'}
                disabled={busyAction !== null}
                onClick={() => void respond('ACCEPT')}
                tone="success"
              >
                <Check aria-hidden="true" size={17} /> Xác nhận lấy {current.amountLabel}
              </Button>
              <Button
                busy={busyAction === 'DECLINE'}
                className="priority-overlay__decline"
                disabled={busyAction !== null}
                onClick={() => void respond('DECLINE')}
                tone="secondary"
              >
                <X aria-hidden="true" size={17} /> Không lấy / Hủy lượt
              </Button>
            </div>
          ) : null}
          {!demoEnabled && role === 'HTKD' ? (
            <p className="priority-overlay__meta">
              Chế độ giám sát: phản hồi ưu tiên do tài khoản quản lý cửa hàng thực hiện.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
