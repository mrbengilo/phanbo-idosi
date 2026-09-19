import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  OutboundReason,
  Store,
  StoreInventoryBag,
  StoreInventoryBagStatus,
  StoreOutbound,
} from '@idosi/contracts';
import {
  ArrowDownToLine,
  CheckCircle2,
  PackageOpen,
  RefreshCw,
  Scale,
  ShieldCheck,
  ShoppingBag,
  XCircle,
} from 'lucide-react';
import clsx from 'clsx';
import { useMemo, useRef, useState } from 'react';
import type { AppOutletContext } from '../../components/AppShell';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { DashboardSkeleton } from '../../components/Skeleton';
import { StatCard } from '../../components/StatCard';
import {
  ApiClientError,
  createWarehouseAdjustment,
  listAccessibleStores,
  listCatalog,
  listWarehouseBalances,
} from '../../lib/api';
import { useSession } from '../../lib/auth';
import { businessDate } from '../../lib/business-time';
import { formatVnd } from '../../lib/format';
import { IdosiStatisticsPanel } from '../idosi/IdosiStatisticsPanel';
import {
  createStoreOutbound,
  listInventoryBags,
  listInventoryLedger,
  listStoreOutbounds,
  openInventoryBag,
  reviewStoreOutbound,
} from './inventoryApi';
import './inventory-operations.css';

const statusCopy: Record<
  StoreInventoryBagStatus,
  { readonly label: string; readonly tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }
> = {
  IN_TRANSIT: { label: 'Đang vận chuyển', tone: 'info' },
  AVAILABLE: { label: 'Chưa khui', tone: 'success' },
  OPEN: { label: 'Đang bán tại CH', tone: 'info' },
  EMPTY: { label: 'Đã hết', tone: 'neutral' },
  QUARANTINED: { label: 'Cách ly', tone: 'warning' },
  RETURNED: { label: 'Đã trả', tone: 'neutral' },
  LOST: { label: 'Thất lạc', tone: 'danger' },
};

const outboundStatusCopy = {
  PENDING: { label: 'Chờ duyệt', tone: 'warning' },
  APPROVED: { label: 'Đã duyệt', tone: 'success' },
  REJECTED: { label: 'Từ chối', tone: 'danger' },
} as const;

const reasonCopy: Record<OutboundReason, string> = {
  DISCOUNT_SALE: 'Bán giảm giá',
  CHARITY: 'Từ thiện',
  TORN: 'Rách',
  DEFECTIVE: 'Lỗi',
  DIRTY: 'Bẩn',
  OTHER: 'Khác',
};

const sortingReasons = ['CHARITY', 'TORN', 'DEFECTIVE', 'DIRTY', 'OTHER'] as const;

export function outboundReasonsForMode(mode: 'SALE' | 'SORTING'): readonly OutboundReason[] {
  return mode === 'SALE' ? ['DISCOUNT_SALE'] : sortingReasons;
}

const ledgerOperationCopy = {
  RECEIVE: 'Nhập kho',
  CONSUME: 'Xuất kho',
  ADJUST: 'Điều chỉnh',
  QUARANTINE: 'Cách ly',
  RELEASE: 'Gỡ cách ly',
} as const;

const kilogramsPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/;

function errorMessage(error: unknown): string {
  return error instanceof ApiClientError ? error.message : 'Dữ liệu máy chủ không hợp lệ.';
}

export function kilogramsToGrams(value: string): bigint {
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0').slice(0, 3) || '0');
}

export function gramsToKilograms(grams: bigint): string {
  const sign = grams < 0n ? '-' : '';
  const absolute = grams < 0n ? -grams : grams;
  return `${sign}${absolute / 1000n}.${String(absolute % 1000n).padStart(3, '0')}`;
}

export function formatKg(value: string): string {
  const [whole = '0', fraction = ''] = value.split('.');
  return `${new Intl.NumberFormat('vi-VN').format(BigInt(whole))},${fraction.padEnd(3, '0').slice(0, 3)} kg`;
}

export function isOutboundWeightAllowed(value: string, remainingWeightKg: string): boolean {
  if (!kilogramsPattern.test(value)) return false;
  const grams = kilogramsToGrams(value);
  return grams > 0n && grams <= kilogramsToGrams(remainingWeightKg);
}

function uuid(): string {
  return crypto.randomUUID();
}

function storeName(stores: readonly Store[], storeId: string): string {
  const store = stores.find((candidate) => candidate.id === storeId);
  return store ? `${store.code} · ${store.name}` : storeId;
}

function downloadInventoryCsv(
  bags: readonly StoreInventoryBag[],
  productNames: ReadonlyMap<string, string>,
): void {
  const quote = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  const rows = [
    ['Mã bao', 'Mặt hàng', 'Trạng thái', 'Khối lượng đầu', 'Khối lượng còn', 'Phiên bản'],
    ...bags.map((bag) => [
      bag.bagCode,
      productNames.get(bag.productId) ?? bag.productId,
      statusCopy[bag.status].label,
      bag.originalWeightKg,
      bag.remainingWeightKg,
      bag.version,
    ]),
  ];
  const blob = new Blob([`\uFEFF${rows.map((row) => row.map(quote).join(',')).join('\n')}`], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `doi-soat-ton-kho-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function useInventorySources(role: AppOutletContext['role']) {
  const sessionQuery = useSession();
  const storesQuery = useQuery({
    queryFn: listAccessibleStores,
    queryKey: ['stores', 'accessible'],
    retry: false,
  });
  const catalogQuery = useQuery({ queryFn: listCatalog, queryKey: ['catalog'], retry: false });
  const principalStoreId = sessionQuery.data?.principal.storeId ?? '';
  const stores = storesQuery.data ?? [];
  const defaultStoreId = role === 'STORE' ? principalStoreId : (stores[0]?.id ?? '');
  return { catalogQuery, defaultStoreId, principalStoreId, sessionQuery, stores, storesQuery };
}

const vatDate = businessDate();
interface VatRow {
  readonly date: string;
  readonly amount: number;
  readonly ratePercent: number;
}

function AdminWarehouseInputPanel() {
  const queryClient = useQueryClient();
  const catalogQuery = useQuery({ queryFn: listCatalog, queryKey: ['catalog'], retry: false });
  const balancesQuery = useQuery({
    queryFn: listWarehouseBalances,
    queryKey: ['warehouse-balances-admin'],
    retry: false,
  });
  const [selected, setSelected] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [vatRows, setVatRows] = useState<readonly VatRow[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const products = (catalogQuery.data ?? []).filter((product) => product.status === 'ACTIVE');
  const versionByProduct = useMemo(
    () =>
      new Map<string, number>(
        (balancesQuery.data?.data ?? []).map((row: { productId: string; version: number }) => [
          row.productId,
          row.version,
        ]),
      ),
    [balancesQuery.data],
  );

  const toggle = (productId: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Map(current);
      if (checked) next.set(productId, 1);
      else next.delete(productId);
      return next;
    });
  };
  const setQty = (productId: string, qty: number) =>
    setSelected((current) => new Map(current).set(productId, Math.max(1, qty)));

  const save = async () => {
    if (selected.size === 0 || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const lines = [...selected.entries()].map(([productId, quantity]) => ({
        productId,
        amount: { kind: 'UNIT' as const, quantity },
        expectedVersion: versionByProduct.get(productId) ?? 0,
      }));
      const vatText = vatRows
        .map(
          (row) =>
            'VAT ' +
            row.ratePercent +
            '% ngày ' +
            row.date +
            ': ' +
            row.amount.toLocaleString('vi-VN') +
            'đ',
        )
        .join('; ');
      const reason =
        'Nhập kho hàng tổng' +
        (note.trim() ? ' — ' + note.trim() : '') +
        (vatText ? ' — ' + vatText : '');
      const response = await createWarehouseAdjustment(
        {
          direction: 'INCREASE',
          reasonCode: 'COUNT_CORRECTION',
          reason,
          lines,
        },
        'stock-input:' + Date.now(),
      );
      setMessage({
        kind: 'success',
        text: 'Đã nhập ' + response.data.entries.length + ' mặt hàng vào kho tổng.',
      });
      setSelected(new Map());
      setVatRows([]);
      setNote('');
      await queryClient.invalidateQueries({ queryKey: ['warehouse-balances-admin'] });
    } catch (cause) {
      setMessage({
        kind: 'error',
        text: cause instanceof Error ? cause.message : 'Không thể nhập kho. Vui lòng thử lại.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <div className="section-heading section-heading--compact">
        <div>
          <h2>Nhập kho hàng tổng</h2>
          <p>Chọn mặt hàng và số bao; kho này là nguồn hàng cho các cửa hàng đặt.</p>
        </div>
      </div>
      {message ? (
        <div className={message.kind === 'error' ? 'form-error' : 'inline-notice'} role="status">
          {message.text}
        </div>
      ) : null}
      <div className="product-check-list">
        {products.map((product) => {
          const qty = selected.get(product.id);
          const isSelected = qty !== undefined;
          return (
            <div
              className={clsx('product-check', isSelected && 'product-check--selected')}
              key={product.id}
            >
              <label className="product-check__label">
                <input
                  checked={isSelected}
                  onChange={(event) => toggle(product.id, event.target.checked)}
                  type="checkbox"
                />
                <span>{product.name}</span>
              </label>
              {isSelected ? (
                <div className="qty-stepper">
                  <button
                    aria-label={'Giảm số bao ' + product.name}
                    disabled={(qty ?? 1) <= 1}
                    onClick={() => setQty(product.id, Math.max(1, (qty ?? 1) - 1))}
                    type="button"
                  >
                    −
                  </button>
                  <input
                    aria-label={'Số bao ' + product.name}
                    min="1"
                    onChange={(event) =>
                      setQty(product.id, Math.max(1, event.target.valueAsNumber || 1))
                    }
                    type="number"
                    value={qty}
                  />
                  <button
                    aria-label={'Tăng số bao ' + product.name}
                    onClick={() => setQty(product.id, (qty ?? 0) + 1)}
                    type="button"
                  >
                    +
                  </button>
                  <span className="qty-stepper__unit">bao</span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 16 }}>
        <div className="section-heading section-heading--compact">
          <div>
            <h3>Thuế VAT đầu vào</h3>
          </div>
          <Button
            onClick={() =>
              setVatRows((rows) => [...rows, { date: vatDate, amount: 0, ratePercent: 10 }])
            }
            tone="secondary"
          >
            + Thêm dòng VAT
          </Button>
        </div>
        {vatRows.map((row, index) => (
          <div
            key={row.date + '-' + String(index)}
            style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}
          >
            <input
              aria-label="Ngày VAT"
              onChange={(event) =>
                setVatRows((rows) =>
                  rows.map((r, i) => (i === index ? { ...r, date: event.target.value } : r)),
                )
              }
              type="date"
              value={row.date}
            />
            <input
              aria-label="Số tiền VAT"
              min="0"
              onChange={(event) =>
                setVatRows((rows) =>
                  rows.map((r, i) =>
                    i === index ? { ...r, amount: event.target.valueAsNumber || 0 } : r,
                  ),
                )
              }
              placeholder="Số tiền (đ)"
              type="number"
              value={row.amount}
            />
            <input
              aria-label="Phần trăm VAT"
              max="100"
              min="0"
              onChange={(event) =>
                setVatRows((rows) =>
                  rows.map((r, i) =>
                    i === index ? { ...r, ratePercent: event.target.valueAsNumber || 0 } : r,
                  ),
                )
              }
              placeholder="% VAT"
              style={{ maxWidth: 100 }}
              type="number"
              value={row.ratePercent}
            />
            <button
              aria-label="Xóa dòng VAT"
              onClick={() => setVatRows((rows) => rows.filter((_, i) => i !== index))}
              type="button"
            >
              <XCircle aria-hidden="true" size={17} />
            </button>
          </div>
        ))}
      </div>
      <label style={{ display: 'block', margin: '12px 0' }}>
        Ghi chú
        <input
          maxLength={500}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Ghi chú đợt nhập (không bắt buộc)"
          style={{ width: '100%' }}
          value={note}
        />
      </label>
      <Button busy={busy} disabled={selected.size === 0 || busy} onClick={() => void save()}>
        Lưu nhập kho
      </Button>
    </section>
  );
}

export function ProductionInventoryPage({ role }: AppOutletContext) {
  const { catalogQuery, defaultStoreId, sessionQuery, stores, storesQuery } =
    useInventorySources(role);
  const [storeId, setStoreId] = useState('');
  const [status, setStatus] = useState<StoreInventoryBagStatus | 'ALL'>('ALL');
  const [query, setQuery] = useState('');
  const [selectedBagId, setSelectedBagId] = useState('');
  const effectiveStoreId = role === 'STORE' ? defaultStoreId : storeId;
  const bagsQuery = useQuery({
    enabled: role !== 'STORE' || Boolean(effectiveStoreId),
    queryFn: () =>
      listInventoryBags({
        ...(effectiveStoreId ? { storeId: effectiveStoreId } : {}),
        ...(status === 'ALL' ? {} : { status }),
        ...(query.trim() ? { bagCode: query.trim() } : {}),
      }),
    queryKey: ['store-inventory-bags', effectiveStoreId, status, query.trim()],
    retry: false,
  });
  const bags = bagsQuery.data ?? [];
  const effectiveBagId = bags.some((bag) => bag.id === selectedBagId)
    ? selectedBagId
    : (bags[0]?.id ?? '');
  const ledgerQuery = useQuery({
    enabled: Boolean(effectiveBagId),
    queryFn: () => listInventoryLedger(effectiveBagId),
    queryKey: ['store-inventory-ledger', effectiveBagId],
    retry: false,
  });
  const productNames = useMemo(
    () => new Map((catalogQuery.data ?? []).map((product) => [product.id, product.name])),
    [catalogQuery.data],
  );
  const totalGrams = bags.reduce((sum, bag) => sum + kilogramsToGrams(bag.remainingWeightKg), 0n);
  const availableGrams = bags
    .filter((bag) => bag.status === 'AVAILABLE')
    .reduce((sum, bag) => sum + kilogramsToGrams(bag.remainingWeightKg), 0n);
  const openedGrams = bags
    .filter((bag) => bag.status === 'OPEN')
    .reduce((sum, bag) => sum + kilogramsToGrams(bag.remainingWeightKg), 0n);
  const loadError =
    sessionQuery.error ?? storesQuery.error ?? catalogQuery.error ?? bagsQuery.error;

  const retry = async () => {
    await Promise.all([
      sessionQuery.refetch(),
      storesQuery.refetch(),
      catalogQuery.refetch(),
      bagsQuery.refetch(),
      ...(effectiveBagId ? [ledgerQuery.refetch()] : []),
    ]);
  };

  return (
    <>
      {role === 'ADMIN' ? <AdminWarehouseInputPanel /> : null}
      <PageHeader
        actions={
          <div className="inventory-actions">
            <Button
              disabled={bags.length === 0}
              onClick={() => downloadInventoryCsv(bags, productNames)}
              tone="secondary"
            >
              <ArrowDownToLine aria-hidden="true" size={16} /> Xuất đối soát
            </Button>
            <Button
              busy={
                sessionQuery.isFetching ||
                storesQuery.isFetching ||
                catalogQuery.isFetching ||
                bagsQuery.isFetching ||
                ledgerQuery.isFetching
              }
              onClick={() => void retry()}
              tone="secondary"
            >
              <RefreshCw aria-hidden="true" size={16} /> Làm mới
            </Button>
          </div>
        }
        description="Số dư lấy trực tiếp từ sổ phát sinh bất biến; mọi thay đổi đều có phiên bản và người thao tác"
        title="Tồn kho & lịch sử"
      />

      {loadError ? (
        <section className="panel source-error" role="alert">
          <strong>Không thể tải tồn kho</strong>
          <p>{errorMessage(loadError)}</p>
          <Button
            busy={
              sessionQuery.isFetching ||
              storesQuery.isFetching ||
              catalogQuery.isFetching ||
              bagsQuery.isFetching ||
              ledgerQuery.isFetching
            }
            onClick={() => void retry()}
            tone="secondary"
          >
            Thử lại
          </Button>
        </section>
      ) : bagsQuery.isPending || catalogQuery.isPending || storesQuery.isPending ? (
        <DashboardSkeleton />
      ) : (
        <>
          <div className="stats-grid stats-grid--small">
            <StatCard
              detail={`${bags.filter((bag) => bag.status === 'AVAILABLE').length} Mã bao`}
              label="Hàng chưa khui"
              tone="info"
              value={formatKg(gramsToKilograms(availableGrams))}
            />
            <StatCard
              detail={`${bags.filter((bag) => bag.status === 'OPEN').length} Mã bao`}
              label="Đang bán tại CH"
              value={formatKg(gramsToKilograms(openedGrams))}
            />
            <StatCard
              detail="Từ nguồn API tồn kho"
              label="Tổng còn lại"
              tone="success"
              value={formatKg(gramsToKilograms(totalGrams))}
            />
            <StatCard
              detail="Không cho sửa/xóa giao dịch"
              label="Nguồn đối soát"
              tone="success"
              value="Sổ cái"
            />
          </div>
          <section className="panel inventory-panel">
            <div className="inventory-toolbar">
              {role !== 'STORE' ? (
                <label>
                  Cửa hàng
                  <select onChange={(event) => setStoreId(event.target.value)} value={storeId}>
                    <option value="">Tất cả cửa hàng được phân quyền</option>
                    {stores.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.code} · {store.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label>
                Trạng thái
                <select
                  onChange={(event) =>
                    setStatus(event.target.value as StoreInventoryBagStatus | 'ALL')
                  }
                  value={status}
                >
                  <option value="ALL">Tất cả</option>
                  {Object.entries(statusCopy).map(([value, copy]) => (
                    <option key={value} value={value}>
                      {copy.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tìm Mã bao
                <input
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Nhập Mã bao"
                  value={query}
                />
              </label>
            </div>
            {bags.length === 0 ? (
              <EmptyState
                detail="Không có Mã bao phù hợp với phạm vi và bộ lọc hiện tại."
                title="Chưa có tồn kho"
              />
            ) : (
              <div className="inventory-master-detail">
                <div className="responsive-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Mã bao</th>
                        <th>Mặt hàng</th>
                        <th>Cửa hàng</th>
                        <th>Trạng thái</th>
                        <th>Còn lại</th>
                        <th>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bags.map((bag) => (
                        <tr key={bag.id}>
                          <td data-label="Mã bao">
                            <strong>{bag.bagCode}</strong>
                            <small>v{bag.version}</small>
                          </td>
                          <td data-label="Mặt hàng">
                            {productNames.get(bag.productId) ?? bag.productId}
                          </td>
                          <td data-label="Cửa hàng">{storeName(stores, bag.storeId)}</td>
                          <td data-label="Trạng thái">
                            <Badge tone={statusCopy[bag.status].tone}>
                              {statusCopy[bag.status].label}
                            </Badge>
                          </td>
                          <td data-label="Còn lại">{formatKg(bag.remainingWeightKg)}</td>
                          <td>
                            <button
                              className="link-button"
                              onClick={() => setSelectedBagId(bag.id)}
                              type="button"
                            >
                              Xem sổ
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <aside className="inventory-ledger" aria-live="polite">
                  <h2>Sổ phát sinh Mã bao</h2>
                  {!effectiveBagId ? (
                    <p>Chọn một Mã bao để xem lịch sử.</p>
                  ) : ledgerQuery.isPending ? (
                    <p>Đang tải sổ phát sinh…</p>
                  ) : ledgerQuery.isError ? (
                    <div role="alert">
                      <p>{errorMessage(ledgerQuery.error)}</p>
                      <Button
                        busy={ledgerQuery.isFetching}
                        onClick={() => void ledgerQuery.refetch()}
                        tone="secondary"
                      >
                        Thử lại
                      </Button>
                    </div>
                  ) : (ledgerQuery.data ?? []).length === 0 ? (
                    <p>Chưa có phát sinh cho Mã bao này.</p>
                  ) : (
                    <ol>
                      {(ledgerQuery.data ?? []).map((entry) => (
                        <li key={entry.id}>
                          <span>
                            <strong>{ledgerOperationCopy[entry.operation]}</strong>
                            <time>{new Date(entry.createdAt).toLocaleString('vi-VN')}</time>
                          </span>
                          <b>
                            {formatKg(entry.beforeWeightKg)} → {formatKg(entry.afterWeightKg)}
                          </b>
                          <small>{entry.reason}</small>
                        </li>
                      ))}
                    </ol>
                  )}
                </aside>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

export function ProductionOpenBagPage({ role }: AppOutletContext) {
  const queryClient = useQueryClient();
  const { defaultStoreId, stores, storesQuery } = useInventorySources(role);
  const [storeId, setStoreId] = useState('');
  const [notice, setNotice] = useState('');
  const [mutationError, setMutationError] = useState('');
  const operationKeys = useRef(new Map<string, string>());
  const effectiveStoreId = role === 'STORE' ? defaultStoreId : storeId;
  const bagsQuery = useQuery({
    enabled: role !== 'STORE' || Boolean(effectiveStoreId),
    queryFn: () =>
      listInventoryBags({
        ...(effectiveStoreId ? { storeId: effectiveStoreId } : {}),
        status: 'AVAILABLE',
      }),
    queryKey: ['store-inventory-bags', effectiveStoreId, 'AVAILABLE'],
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: async (bag: StoreInventoryBag) => {
      const key = operationKeys.current.get(bag.id) ?? uuid();
      operationKeys.current.set(bag.id, key);
      return openInventoryBag(bag.id, { expectedVersion: bag.version }, key);
    },
    onError: (error) => setMutationError(errorMessage(error)),
    onSuccess: async (bag) => {
      operationKeys.current.delete(bag.id);
      setMutationError('');
      setNotice(`Đã khui ${bag.bagCode}; khối lượng không thay đổi và phiên bản đã tăng.`);
      await queryClient.invalidateQueries({ queryKey: ['store-inventory-bags'] });
    },
  });

  const loadError = storesQuery.error ?? bagsQuery.error;
  return (
    <>
      <PageHeader
        actions={
          <Button
            busy={bagsQuery.isFetching}
            onClick={() => void bagsQuery.refetch()}
            tone="secondary"
          >
            <RefreshCw aria-hidden="true" size={16} /> Làm mới
          </Button>
        }
        description="Chọn đúng Mã bao; thao tác chỉ đổi trạng thái, không tự ý thay đổi khối lượng"
        title="Khui kiện"
      />
      {role !== 'STORE' ? (
        <section className="panel scope-notice">
          <ShieldCheck aria-hidden="true" />
          <div>
            <strong>Chế độ giám sát</strong>
            <p>
              Admin/HTKD có thể xem bao chưa khui; chỉ tài khoản cửa hàng sở hữu mới được xác nhận
              khui.
            </p>
          </div>
        </section>
      ) : null}
      {notice ? (
        <div className="operation-notice operation-notice--success" role="status">
          {notice}
        </div>
      ) : null}
      {mutationError ? (
        <div className="operation-notice operation-notice--error" role="alert">
          {mutationError}
        </div>
      ) : null}
      {role !== 'STORE' ? (
        <label className="panel inventory-scope-select">
          Cửa hàng
          <select onChange={(event) => setStoreId(event.target.value)} value={storeId}>
            <option value="">Tất cả cửa hàng được phân quyền</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.code} · {store.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {loadError ? (
        <section className="panel source-error" role="alert">
          <strong>Không thể tải bao chưa khui</strong>
          <p>{errorMessage(loadError)}</p>
          <Button
            busy={bagsQuery.isFetching}
            onClick={() => void bagsQuery.refetch()}
            tone="secondary"
          >
            Thử lại
          </Button>
        </section>
      ) : bagsQuery.isPending ? (
        <DashboardSkeleton />
      ) : (bagsQuery.data ?? []).length === 0 ? (
        <section className="panel">
          <EmptyState
            detail="Không có Mã bao AVAILABLE trong phạm vi hiện tại."
            title="Không có bao chờ khui"
          />
        </section>
      ) : (
        <section className="inventory-bag-grid">
          {(bagsQuery.data ?? []).map((bag) => (
            <article className="panel inventory-bag-card" key={bag.id}>
              <PackageOpen aria-hidden="true" />
              <div>
                <strong>{bag.bagCode}</strong>
                <span>
                  {formatKg(bag.remainingWeightKg)} · v{bag.version}
                </span>
                <small>{storeName(stores, bag.storeId)}</small>
              </div>
              <Badge tone="success">Chưa khui</Badge>
              {role === 'STORE' ? (
                <Button
                  busy={mutation.isPending && mutation.variables?.id === bag.id}
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate(bag)}
                >
                  Xác nhận khui
                </Button>
              ) : null}
            </article>
          ))}
        </section>
      )}
    </>
  );
}

interface OutboundPageProps extends AppOutletContext {
  readonly mode: 'SALE' | 'SORTING';
}

export function ProductionOutboundPage({ mode, role }: OutboundPageProps) {
  const queryClient = useQueryClient();
  const { catalogQuery, defaultStoreId, stores, storesQuery } = useInventorySources(role);
  const [storeId, setStoreId] = useState('');
  const [bagId, setBagId] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [revenueVnd, setRevenueVnd] = useState('');
  const [reason, setReason] = useState<OutboundReason>(
    mode === 'SALE' ? 'DISCOUNT_SALE' : 'CHARITY',
  );
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [operationError, setOperationError] = useState('');
  const operationKeys = useRef(new Map<string, string>());
  const effectiveStoreId = role === 'STORE' ? defaultStoreId : storeId;
  const bagsQuery = useQuery({
    enabled: role !== 'STORE' || Boolean(effectiveStoreId),
    queryFn: async () => {
      const filters = effectiveStoreId ? { storeId: effectiveStoreId } : {};
      const pages = await Promise.all([
        listInventoryBags({ ...filters, status: 'AVAILABLE' }),
        listInventoryBags({ ...filters, status: 'OPEN' }),
      ]);
      return pages.flat();
    },
    queryKey: ['store-inventory-bags', effectiveStoreId, 'outbound-source'],
    retry: false,
  });
  const outboundsQuery = useQuery({
    queryFn: async () => {
      const filters = effectiveStoreId ? { storeId: effectiveStoreId } : {};
      const pages = await Promise.all(
        outboundReasonsForMode(mode).map((outboundReason) =>
          listStoreOutbounds({ ...filters, reason: outboundReason }),
        ),
      );
      return pages.flat().sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    },
    queryKey: ['store-outbounds', effectiveStoreId, mode],
    retry: false,
  });
  const eligibleBags = bagsQuery.data ?? [];
  const displayedOutbounds = outboundsQuery.data ?? [];
  const effectiveBagId = eligibleBags.some((bag) => bag.id === bagId)
    ? bagId
    : (eligibleBags[0]?.id ?? '');
  const selectedBag = eligibleBags.find((bag) => bag.id === effectiveBagId);
  const productNames = useMemo(
    () => new Map((catalogQuery.data ?? []).map((product) => [product.id, product.name])),
    [catalogQuery.data],
  );

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedBag || !effectiveStoreId) throw new Error('Chưa chọn Mã bao hợp lệ.');
      const signature = [selectedBag.id, selectedBag.version, weightKg, reason, revenueVnd].join(
        ':',
      );
      const key = operationKeys.current.get(signature) ?? uuid();
      operationKeys.current.set(signature, key);
      const revenue = mode === 'SALE' ? Number(revenueVnd) : null;
      const result = await createStoreOutbound(
        {
          storeId: effectiveStoreId,
          inventoryLotId: selectedBag.id,
          expectedInventoryVersion: selectedBag.version,
          weightKg,
          reason: mode === 'SALE' ? 'DISCOUNT_SALE' : reason,
          revenueVnd: revenue,
        },
        key,
      );
      operationKeys.current.delete(signature);
      return result;
    },
    onError: (error) => setOperationError(errorMessage(error)),
    onSuccess: async () => {
      setOperationError('');
      setNotice('Đã tạo phiếu và gửi HTKD/Admin duyệt. Tồn chỉ giảm sau khi phiếu được duyệt.');
      setWeightKg('');
      setRevenueVnd('');
      await queryClient.invalidateQueries({ queryKey: ['store-outbounds'] });
    },
  });
  const reviewMutation = useMutation({
    mutationFn: async ({
      decision,
      outbound,
    }: {
      decision: 'APPROVE' | 'REJECT';
      outbound: StoreOutbound;
    }) => {
      const note = (reviewNotes[outbound.id] ?? '').trim();
      const signature = `${outbound.id}:${outbound.version}:${decision}:${note}`;
      const key = operationKeys.current.get(signature) ?? uuid();
      operationKeys.current.set(signature, key);
      const result = await reviewStoreOutbound(
        outbound.id,
        { decision, expectedVersion: outbound.version, note: note || null },
        key,
      );
      operationKeys.current.delete(signature);
      return result;
    },
    onError: (error) => setOperationError(errorMessage(error)),
    onSuccess: async (outbound) => {
      setOperationError('');
      setNotice(
        outbound.status === 'APPROVED'
          ? 'Đã duyệt phiếu; tồn kho và sổ phát sinh đã cập nhật nguyên tử.'
          : 'Đã từ chối phiếu và lưu lý do.',
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['store-outbounds'] }),
        queryClient.invalidateQueries({ queryKey: ['store-inventory-bags'] }),
        queryClient.invalidateQueries({ queryKey: ['store-inventory-ledger'] }),
      ]);
    },
  });

  const parsedRevenue = Number(revenueVnd);
  const formInvalid =
    !selectedBag ||
    !isOutboundWeightAllowed(weightKg, selectedBag.remainingWeightKg) ||
    (mode === 'SALE' &&
      (!/^\d+$/.test(revenueVnd) || !Number.isSafeInteger(parsedRevenue) || parsedRevenue < 0));
  const loadError =
    storesQuery.error ?? catalogQuery.error ?? bagsQuery.error ?? outboundsQuery.error;
  const pending = displayedOutbounds.filter((outbound) => outbound.status === 'PENDING').length;
  const approved = displayedOutbounds.filter((outbound) => outbound.status === 'APPROVED').length;

  return (
    <>
      <PageHeader
        actions={
          <Button
            busy={bagsQuery.isFetching || outboundsQuery.isFetching}
            onClick={() => void Promise.all([bagsQuery.refetch(), outboundsQuery.refetch()])}
            tone="secondary"
          >
            <RefreshCw aria-hidden="true" size={16} /> Làm mới
          </Button>
        }
        description={
          mode === 'SALE'
            ? 'Ghi doanh thu theo Mã bao; chỉ trừ kho khi người có quyền duyệt phiếu'
            : 'Lập chứng từ cho hàng từ thiện, rách, lỗi, bẩn hoặc xử lý khác; không reset tồn'
        }
        title={mode === 'SALE' ? 'Bán & đồng bộ' : 'Lọc & xử lý'}
      />
      {notice ? (
        <div className="operation-notice operation-notice--success" role="status">
          {notice}
        </div>
      ) : null}
      {operationError ? (
        <div className="operation-notice operation-notice--error" role="alert">
          {operationError}
        </div>
      ) : null}
      {loadError ? (
        <section className="panel source-error" role="alert">
          <strong>Không thể tải dữ liệu vận hành</strong>
          <p>{errorMessage(loadError)}</p>
          <Button
            busy={bagsQuery.isFetching || outboundsQuery.isFetching}
            onClick={() => void Promise.all([bagsQuery.refetch(), outboundsQuery.refetch()])}
            tone="secondary"
          >
            Thử lại
          </Button>
        </section>
      ) : bagsQuery.isPending || outboundsQuery.isPending || catalogQuery.isPending ? (
        <DashboardSkeleton />
      ) : (
        <>
          <div className="stats-grid stats-grid--small">
            <StatCard
              detail="Chưa tác động tồn"
              label="Phiếu chờ duyệt"
              tone="warning"
              value={String(pending)}
            />
            <StatCard
              detail="Đã ghi sổ phát sinh"
              label="Phiếu đã duyệt"
              tone="success"
              value={String(approved)}
            />
            <StatCard
              detail="AVAILABLE hoặc OPEN"
              label="Mã bao khả dụng"
              tone="info"
              value={String(eligibleBags.length)}
            />
          </div>
          {role === 'STORE' ? (
            <section className="panel outbound-create">
              <div className="section-heading section-heading--compact">
                <div>
                  <h2>{mode === 'SALE' ? 'Tạo phiếu bán giảm giá' : 'Tạo phiếu xử lý'}</h2>
                  <p>Mỗi lần gửi có khóa idempotency; bấm lại không tạo trùng.</p>
                </div>
                {mode === 'SALE' ? (
                  <ShoppingBag aria-hidden="true" />
                ) : (
                  <Scale aria-hidden="true" />
                )}
              </div>
              <div className="outbound-form-grid">
                <label>
                  Mã bao
                  <select onChange={(event) => setBagId(event.target.value)} value={effectiveBagId}>
                    <option value="">Chọn Mã bao</option>
                    {eligibleBags.map((bag) => (
                      <option key={bag.id} value={bag.id}>
                        {bag.bagCode} · {productNames.get(bag.productId) ?? bag.productId} · còn{' '}
                        {bag.remainingWeightKg} kg
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Khối lượng (kg)
                  <input
                    inputMode="decimal"
                    min="0.001"
                    onChange={(event) => setWeightKg(event.target.value)}
                    placeholder="0.000"
                    step="0.001"
                    type="number"
                    value={weightKg}
                  />
                  <small>
                    {selectedBag
                      ? `Tối đa ${selectedBag.remainingWeightKg} kg · v${selectedBag.version}`
                      : 'Chưa có Mã bao khả dụng'}
                  </small>
                </label>
                {mode === 'SALE' ? (
                  <label>
                    Doanh thu (VND)
                    <input
                      inputMode="numeric"
                      min="0"
                      onChange={(event) => setRevenueVnd(event.target.value)}
                      step="1"
                      type="number"
                      value={revenueVnd}
                    />
                  </label>
                ) : (
                  <label>
                    Lý do
                    <select
                      onChange={(event) => setReason(event.target.value as OutboundReason)}
                      value={reason}
                    >
                      {sortingReasons.map((value) => (
                        <option key={value} value={value}>
                          {reasonCopy[value]}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <Button
                busy={createMutation.isPending}
                disabled={formInvalid}
                onClick={() => createMutation.mutate()}
              >
                Gửi phiếu chờ duyệt
              </Button>
            </section>
          ) : (
            <section className="panel oversight-banner">
              <ShieldCheck aria-hidden="true" />
              <div>
                <strong>Chế độ duyệt</strong>
                <p>
                  Kiểm tra Mã bao, khối lượng và lý do trước khi duyệt. Duyệt sẽ trừ tồn và ghi sổ
                  trong cùng giao dịch.
                </p>
              </div>
              <label>
                Cửa hàng
                <select onChange={(event) => setStoreId(event.target.value)} value={storeId}>
                  <option value="">Tất cả cửa hàng được phân quyền</option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.code} · {store.name}
                    </option>
                  ))}
                </select>
              </label>
            </section>
          )}
          {mode === 'SALE' ? <IdosiStatisticsPanel storeId={effectiveStoreId} /> : null}
          <section className="panel table-panel">
            <div className="section-heading section-heading--compact">
              <div>
                <h2>Chứng từ nguồn</h2>
                <p>
                  Dữ liệu lấy từ `/store-outbounds`; không có dữ liệu minh họa trong production.
                </p>
              </div>
            </div>
            {displayedOutbounds.length === 0 ? (
              <EmptyState
                detail="Chưa có phiếu phù hợp trong phạm vi hiện tại."
                title="Chưa có chứng từ"
              />
            ) : (
              <div className="responsive-table">
                <table>
                  <thead>
                    <tr>
                      <th>Thời gian</th>
                      <th>Mã bao</th>
                      <th>Lý do</th>
                      <th>Khối lượng</th>
                      {mode === 'SALE' ? <th>Doanh thu</th> : null}
                      <th>Trạng thái</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedOutbounds.map((outbound) => {
                      const bag = (bagsQuery.data ?? []).find(
                        (candidate) => candidate.id === outbound.inventoryLotId,
                      );
                      const reviewNote = reviewNotes[outbound.id] ?? '';
                      const canReview = role !== 'STORE' && outbound.status === 'PENDING';
                      return (
                        <tr key={outbound.id}>
                          <td data-label="Thời gian">
                            {new Date(outbound.createdAt).toLocaleString('vi-VN')}
                          </td>
                          <td data-label="Mã bao">
                            <strong>{bag?.bagCode ?? outbound.inventoryLotId}</strong>
                            <small>{storeName(stores, outbound.storeId)}</small>
                          </td>
                          <td data-label="Lý do">{reasonCopy[outbound.reason]}</td>
                          <td data-label="Khối lượng">{formatKg(outbound.weightKg)}</td>
                          {mode === 'SALE' ? (
                            <td data-label="Doanh thu">
                              {outbound.revenueVnd === null
                                ? 'Chưa ghi nhận'
                                : formatVnd(outbound.revenueVnd)}
                            </td>
                          ) : null}
                          <td data-label="Trạng thái">
                            <Badge tone={outboundStatusCopy[outbound.status].tone}>
                              {outboundStatusCopy[outbound.status].label}
                            </Badge>
                            {outbound.reviewNote ? <small>{outbound.reviewNote}</small> : null}
                          </td>
                          <td data-label="Thao tác">
                            {canReview ? (
                              <div className="review-actions">
                                <input
                                  aria-label={`Ghi chú duyệt ${outbound.id}`}
                                  onChange={(event) =>
                                    setReviewNotes((current) => ({
                                      ...current,
                                      [outbound.id]: event.target.value,
                                    }))
                                  }
                                  placeholder="Ghi chú / lý do từ chối"
                                  value={reviewNote}
                                />
                                <Button
                                  busy={
                                    reviewMutation.isPending &&
                                    reviewMutation.variables?.outbound.id === outbound.id &&
                                    reviewMutation.variables.decision === 'APPROVE'
                                  }
                                  disabled={reviewMutation.isPending}
                                  onClick={() =>
                                    reviewMutation.mutate({ decision: 'APPROVE', outbound })
                                  }
                                  tone="success"
                                >
                                  <CheckCircle2 aria-hidden="true" size={16} /> Duyệt
                                </Button>
                                <Button
                                  busy={
                                    reviewMutation.isPending &&
                                    reviewMutation.variables?.outbound.id === outbound.id &&
                                    reviewMutation.variables.decision === 'REJECT'
                                  }
                                  disabled={
                                    reviewMutation.isPending || reviewNote.trim().length < 3
                                  }
                                  onClick={() =>
                                    reviewMutation.mutate({ decision: 'REJECT', outbound })
                                  }
                                  tone="danger"
                                >
                                  <XCircle aria-hidden="true" size={16} /> Từ chối
                                </Button>
                              </div>
                            ) : (
                              <span>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
