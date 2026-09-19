import type { Product, ProductConversion } from '@idosi/contracts';
import { useQuery } from '@tanstack/react-query';
import { Download, History, Pencil, Plus, RefreshCw, Save, Search, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import type { AppOutletContext } from '../components/AppShell';
import {
  CatalogApiError,
  CatalogPartialCreateError,
  createInitialConversion,
  createNextConversionVersion,
  createProductWithConversion,
  loadCatalogSnapshot,
  loadProductConversionHistory,
  retireProductConversion,
  setProductStatus,
  type CatalogEntry,
} from '../features/catalog/catalogApi';
import '../features/catalog/catalog.css';
import { businessDate } from '../lib/business-time';
import { kilogramsToGrams, normalizeKilograms } from '../lib/conversions';
import { productConversions as seed } from '../lib/data';
import { shouldEnableMockMode } from '../lib/runtime-mode';
import { useDialogAccessibility } from '../lib/use-dialog-accessibility';

const catalogMockMode = shouldEnableMockMode(
  import.meta.env.DEV,
  import.meta.env.MODE,
  import.meta.env.VITE_ENABLE_MOCK_FALLBACK,
);

type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';
type Notice = { readonly kind: 'error' | 'success'; readonly message: string } | null;

interface ConversionDraft {
  readonly baseConversion: ProductConversion | null;
  readonly mode: 'CREATE_PRODUCT' | 'INITIAL_CONVERSION' | 'NEXT_VERSION';
  readonly product: Product | null;
  effectiveFrom: string;
  itemQuantity: string;
  name: string;
  reason: string;
  sku: string;
  weightKilograms: string;
}

interface RetireDraft {
  readonly entry: CatalogEntry;
  reason: string;
}

const today = businessDate();

function roundDivide(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (denominator * 2n);
}

/** Renders milli-units compactly: whole numbers stay plain, decimals keep at most two digits. */
function formatThousandths(value: bigint): string {
  const whole = value / 1_000n;
  const milli = value % 1_000n;
  const wholeText = whole.toLocaleString('vi-VN');
  if (milli === 0n) return wholeText;
  const hundredths = (milli + 5n) / 10n;
  if (hundredths === 0n) return wholeText;
  if (hundredths % 10n === 0n) return `${wholeText},${hundredths / 10n}`;
  return `${wholeText},${String(hundredths).padStart(2, '0')}`;
}

export function formatConversionRatios(conversion: ProductConversion | null): {
  readonly itemsPerKilogram: string;
  readonly kilogramsPerItem: string;
} {
  if (!conversion) {
    return { itemsPerKilogram: 'Thiếu hệ số', kilogramsPerItem: 'Thiếu hệ số' };
  }
  const grams = kilogramsToGrams(conversion.weightKilograms);
  if (grams === null || conversion.itemQuantity <= 0) {
    return { itemsPerKilogram: 'Thiếu hệ số', kilogramsPerItem: 'Thiếu hệ số' };
  }
  const itemQuantity = BigInt(conversion.itemQuantity);
  const gramQuantity = BigInt(grams);
  const itemsPerKilogram = roundDivide(itemQuantity * 1_000_000n, gramQuantity);
  const kilogramsPerItem = roundDivide(gramQuantity, itemQuantity);
  return {
    itemsPerKilogram: `${formatThousandths(itemsPerKilogram)} cái`,
    kilogramsPerItem: `${formatThousandths(kilogramsPerItem)} kg`,
  };
}

function addOneDay(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return today;
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

export function nextConversionDate(effectiveFrom: string, currentDate = today): string {
  const minimum = addOneDay(effectiveFrom);
  return minimum > currentDate ? minimum : currentDate;
}

function csvCell(value: string): string {
  const safeValue = /^[\t\r ]*[=+\-@]/u.test(value) ? `'${value}` : value;
  return `"${safeValue.replaceAll('"', '""')}"`;
}

export function buildCatalogCsv(entries: readonly CatalogEntry[], effectiveAt: string): string {
  const rows = [
    [
      'Ngày xem',
      'Mã SKU',
      'Mặt hàng',
      'Trạng thái mặt hàng',
      'Phiên bản hệ số',
      'Số cái tỷ lệ',
      'Khối lượng tỷ lệ (kg)',
      'Hiệu lực từ',
      'Hiệu lực đến',
      'Mã hệ số nguồn',
    ],
    ...entries.map(({ conversion, product }) => [
      effectiveAt,
      product.sku,
      product.name,
      product.status,
      conversion ? String(conversion.version) : '',
      conversion ? String(conversion.itemQuantity) : '',
      conversion?.weightKilograms ?? '',
      conversion?.effectiveFrom ?? '',
      conversion?.effectiveTo ?? '',
      conversion?.id ?? '',
    ]),
  ];
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

function formatDate(value: string | null): string {
  if (!value) return 'Không giới hạn';
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function createDemoEntries(): CatalogEntry[] {
  const timestamp = new Date().toISOString();
  return seed.map((item, index) => {
    const suffix = String(index + 1).padStart(12, '0');
    const productId = `40000000-0000-4000-8000-${suffix}`;
    const product: Product = {
      createdAt: timestamp,
      id: productId,
      measurement: 'UNIT',
      name: item.name,
      sku: item.id,
      status: item.status,
      unitLabel: 'cái',
      updatedAt: timestamp,
    };
    const conversion: ProductConversion = {
      createdAt: timestamp,
      createdByAccountId: null,
      effectiveFrom: item.effectiveDate,
      effectiveTo: null,
      id: `50000000-0000-4000-8000-${suffix}`,
      itemQuantity: item.itemQuantity ?? 1,
      productId,
      reason: 'Dữ liệu kiểm thử giao diện',
      retiredAt: null,
      retiredByAccountId: null,
      retirementReason: null,
      version: 1,
      weightKilograms: item.weightKilograms ?? '1.000',
    };
    return { conversion, historyCount: 1, latestConversion: conversion, product };
  });
}

function errorMessage(cause: unknown): string {
  return cause instanceof CatalogApiError
    ? cause.message
    : 'Phản hồi máy chủ không hợp lệ. Vui lòng tải lại và thử lại.';
}

export function CatalogPage() {
  const { role } = useOutletContext<AppOutletContext>();
  const [effectiveAt, setEffectiveAt] = useState(today);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ACTIVE');
  const [notice, setNotice] = useState<Notice>(null);
  const [busyKey, setBusyKey] = useState('');
  const [draft, setDraft] = useState<ConversionDraft | null>(null);
  const [retireDraft, setRetireDraft] = useState<RetireDraft | null>(null);
  const [historyProductId, setHistoryProductId] = useState<string | null>(null);
  const [demoEntries, setDemoEntries] = useState<CatalogEntry[]>(createDemoEntries);

  const catalogQuery = useQuery({
    enabled: !catalogMockMode,
    queryFn: () => loadCatalogSnapshot(effectiveAt),
    queryKey: ['catalog', 'snapshot', effectiveAt],
    retry: false,
  });
  const sourceEntries = catalogMockMode ? demoEntries : (catalogQuery.data?.entries ?? []);
  const selectedHistoryEntry = sourceEntries.find((entry) => entry.product.id === historyProductId);
  const historyQuery = useQuery({
    enabled: !catalogMockMode && Boolean(historyProductId),
    queryFn: () => loadProductConversionHistory(historyProductId ?? ''),
    queryKey: ['catalog', 'history', historyProductId],
    retry: false,
    staleTime: 0,
  });
  const history = catalogMockMode
    ? selectedHistoryEntry?.latestConversion
      ? [selectedHistoryEntry.latestConversion]
      : []
    : (historyQuery.data ?? []);

  const visibleEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('vi-VN');
    return sourceEntries.filter(
      ({ product }) =>
        (status === 'ALL' || product.status === status) &&
        (!normalizedQuery ||
          product.name.toLocaleLowerCase('vi-VN').includes(normalizedQuery) ||
          product.sku.toLocaleLowerCase('vi-VN').includes(normalizedQuery)),
    );
  }, [query, sourceEntries, status]);

  const mutationEnabled = role === 'ADMIN' || role === 'HTKD';
  const browsingCurrentDate = effectiveAt === today;
  const missingConversions = sourceEntries.filter((entry) => !entry.conversion).length;

  const refresh = async () => {
    if (catalogMockMode) return;
    await catalogQuery.refetch();
  };

  const startCreate = () => {
    setNotice(null);
    setDraft({
      baseConversion: null,
      effectiveFrom: today,
      itemQuantity: '',
      mode: 'CREATE_PRODUCT',
      name: '',
      product: null,
      reason: 'Tạo hệ số quy đổi ban đầu',
      sku: '',
      weightKilograms: '',
    });
  };

  const startConversion = (entry: CatalogEntry) => {
    const base = entry.latestConversion;
    setNotice(null);
    setDraft({
      baseConversion: base,
      effectiveFrom: base ? nextConversionDate(base.effectiveTo ?? base.effectiveFrom) : today,
      itemQuantity: base ? String(base.itemQuantity) : '',
      mode: base ? 'NEXT_VERSION' : 'INITIAL_CONVERSION',
      name: entry.product.name,
      product: entry.product,
      reason: base ? 'Cập nhật tỷ lệ quy đổi' : 'Bổ sung hệ số quy đổi ban đầu',
      sku: entry.product.sku,
      weightKilograms: base?.weightKilograms ?? '',
    });
  };

  const saveDraft = async () => {
    if (!draft || !mutationEnabled) return;
    const itemQuantity = Number(draft.itemQuantity);
    const weightKilograms = normalizeKilograms(draft.weightKilograms);
    if (!draft.name.trim() || !draft.sku.trim()) {
      setNotice({ kind: 'error', message: 'Tên mặt hàng và mã SKU không được để trống.' });
      return;
    }
    if (!Number.isSafeInteger(itemQuantity) || itemQuantity <= 0 || weightKilograms === null) {
      setNotice({
        kind: 'error',
        message: 'Số cái phải là số nguyên dương; khối lượng dùng tối đa 3 chữ số thập phân.',
      });
      return;
    }
    if (draft.reason.trim().length < 3) {
      setNotice({ kind: 'error', message: 'Lý do thay đổi phải có ít nhất 3 ký tự.' });
      return;
    }
    if (
      draft.mode === 'NEXT_VERSION' &&
      draft.baseConversion &&
      draft.effectiveFrom <=
        (draft.baseConversion.effectiveTo ?? draft.baseConversion.effectiveFrom)
    ) {
      setNotice({
        kind: 'error',
        message: `Ngày hiệu lực phải từ ${formatDate(
          addOneDay(draft.baseConversion.effectiveTo ?? draft.baseConversion.effectiveFrom),
        )}.`,
      });
      return;
    }

    setBusyKey('save-conversion');
    setNotice(null);
    try {
      if (catalogMockMode) {
        const timestamp = new Date().toISOString();
        if (draft.mode === 'CREATE_PRODUCT') {
          const productId = crypto.randomUUID();
          const product: Product = {
            createdAt: timestamp,
            id: productId,
            measurement: 'UNIT',
            name: draft.name.trim(),
            sku: draft.sku.trim(),
            status: 'ACTIVE',
            unitLabel: 'cái',
            updatedAt: timestamp,
          };
          const conversion: ProductConversion = {
            createdAt: timestamp,
            createdByAccountId: null,
            effectiveFrom: draft.effectiveFrom,
            effectiveTo: null,
            id: crypto.randomUUID(),
            itemQuantity,
            productId,
            reason: draft.reason.trim(),
            retiredAt: null,
            retiredByAccountId: null,
            retirementReason: null,
            version: 1,
            weightKilograms,
          };
          setDemoEntries((current) => [
            ...current,
            { conversion, historyCount: 1, latestConversion: conversion, product },
          ]);
        } else if (draft.product) {
          setDemoEntries((current) =>
            current.map((entry) => {
              if (entry.product.id !== draft.product?.id) return entry;
              const conversion: ProductConversion = {
                createdAt: timestamp,
                createdByAccountId: null,
                effectiveFrom: draft.effectiveFrom,
                effectiveTo: null,
                id: crypto.randomUUID(),
                itemQuantity,
                productId: entry.product.id,
                reason: draft.reason.trim(),
                retiredAt: null,
                retiredByAccountId: null,
                retirementReason: null,
                version: (draft.baseConversion?.version ?? 0) + 1,
                weightKilograms,
              };
              return {
                ...entry,
                conversion,
                historyCount: entry.historyCount + 1,
                latestConversion: conversion,
              };
            }),
          );
        }
      } else if (draft.mode === 'CREATE_PRODUCT') {
        await createProductWithConversion(
          {
            measurement: 'UNIT',
            name: draft.name.trim(),
            sku: draft.sku.trim(),
            unitLabel: 'cái',
          },
          {
            effectiveFrom: draft.effectiveFrom,
            effectiveTo: null,
            itemQuantity,
            reason: draft.reason.trim(),
            weightKilograms,
          },
        );
      } else if (draft.mode === 'INITIAL_CONVERSION' && draft.product) {
        await createInitialConversion(draft.product.id, {
          effectiveFrom: draft.effectiveFrom,
          effectiveTo: null,
          itemQuantity,
          reason: draft.reason.trim(),
          weightKilograms,
        });
      } else if (draft.product && draft.baseConversion) {
        if (draft.baseConversion.retiredAt) {
          await createInitialConversion(draft.product.id, {
            effectiveFrom: draft.effectiveFrom,
            effectiveTo: null,
            expectedVersion: draft.baseConversion.version,
            itemQuantity,
            reason: draft.reason.trim(),
            weightKilograms,
          });
        } else {
          await createNextConversionVersion(draft.product.id, draft.baseConversion.id, {
            effectiveFrom: draft.effectiveFrom,
            effectiveTo: null,
            expectedVersion: draft.baseConversion.version,
            itemQuantity,
            reason: draft.reason.trim(),
            weightKilograms,
          });
        }
      }
      await refresh();
      setDraft(null);
      setNotice({
        kind: 'success',
        message:
          draft.mode === 'CREATE_PRODUCT'
            ? `Đã tạo ${draft.name.trim()} cùng hệ số quy đổi.`
            : `Đã lưu phiên bản hệ số mới cho ${draft.name}.`,
      });
    } catch (cause) {
      await refresh();
      if (cause instanceof CatalogPartialCreateError) setDraft(null);
      setNotice({ kind: 'error', message: errorMessage(cause) });
    } finally {
      setBusyKey('');
    }
  };

  const toggleProduct = async (entry: CatalogEntry) => {
    if (!mutationEnabled) return;
    const nextStatus = entry.product.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    setBusyKey(`status:${entry.product.id}`);
    setNotice(null);
    try {
      if (catalogMockMode) {
        setDemoEntries((current) =>
          current.map((candidate) =>
            candidate.product.id === entry.product.id
              ? { ...candidate, product: { ...candidate.product, status: nextStatus } }
              : candidate,
          ),
        );
      } else {
        await setProductStatus(entry.product.id, nextStatus);
        await refresh();
      }
      setNotice({
        kind: 'success',
        message: `${entry.product.name} đã được ${nextStatus === 'ACTIVE' ? 'khôi phục' : 'ngừng dùng'}.`,
      });
    } catch (cause) {
      setNotice({ kind: 'error', message: errorMessage(cause) });
    } finally {
      setBusyKey('');
    }
  };

  const submitRetirement = async () => {
    const conversion = retireDraft?.entry.latestConversion;
    if (!retireDraft || !conversion || !mutationEnabled) return;
    if (retireDraft.reason.trim().length < 3) {
      setNotice({ kind: 'error', message: 'Lý do ngừng hệ số phải có ít nhất 3 ký tự.' });
      return;
    }
    setBusyKey('retire-conversion');
    setNotice(null);
    try {
      if (catalogMockMode) {
        const retiredAt = new Date().toISOString();
        setDemoEntries((current) =>
          current.map((entry) =>
            entry.product.id === retireDraft.entry.product.id
              ? {
                  ...entry,
                  conversion: null,
                  latestConversion: {
                    ...conversion,
                    effectiveTo: today,
                    retiredAt,
                    retiredByAccountId: '10000000-0000-4000-8000-000000000001',
                    retirementReason: retireDraft.reason.trim(),
                  },
                }
              : entry,
          ),
        );
      } else {
        await retireProductConversion(retireDraft.entry.product.id, conversion.id, {
          expectedVersion: conversion.version,
          reason: retireDraft.reason.trim(),
        });
        await refresh();
      }
      setRetireDraft(null);
      setNotice({
        kind: 'success',
        message: `Đã ngừng hệ số quy đổi của ${retireDraft.entry.product.name}.`,
      });
    } catch (cause) {
      setNotice({ kind: 'error', message: errorMessage(cause) });
    } finally {
      setBusyKey('');
    }
  };

  const exportCsv = () => {
    const csv = buildCatalogCsv(visibleEntries, effectiveAt);
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `danh-muc-quy-doi-${effectiveAt}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice({
      kind: 'success',
      message: `Đã xuất ${visibleEntries.length} mặt hàng theo dữ liệu ngày ${formatDate(effectiveAt)}.`,
    });
  };

  if (!mutationEnabled) {
    return (
      <section className="panel catalog-state catalog-state--error" role="alert">
        <h1>Không có quyền quản lý danh mục</h1>
        <p>Chỉ Admin và HTKD được truy cập dữ liệu quy đổi bán hàng.</p>
      </section>
    );
  }

  return (
    <>
      <PageHeader
        actions={
          <>
            <Button
              disabled={sourceEntries.length === 0}
              onClick={() =>
                setHistoryProductId(
                  visibleEntries[0]?.product.id ?? sourceEntries[0]?.product.id ?? null,
                )
              }
              tone="secondary"
            >
              <History aria-hidden="true" size={16} /> Lịch sử phiên bản
            </Button>
            <Button onClick={startCreate}>
              <Plus aria-hidden="true" size={16} /> Thêm mặt hàng
            </Button>
          </>
        }
        description="Nguồn dữ liệu API nội bộ; mỗi lần đổi tỷ lệ tạo một phiên bản bất biến"
        title="Danh mục & quy đổi bán hàng"
      />

      <section className="formula-card">
        <div>
          <Badge tone="info">Công thức bắt buộc</Badge>
          <strong>Khối lượng ước tính = Số cái bán × Khối lượng tỷ lệ ÷ Số cái tỷ lệ</strong>
          <span>Chỉ làm tròn sau khi cộng; thiếu hệ số phải báo thiếu, không mặc định 0.</span>
        </div>
        <Badge tone="info">Ước tính</Badge>
      </section>

      <div className="stats-grid stats-grid--small">
        <StatCard
          detail={`Hiệu lực ngày ${formatDate(effectiveAt)}`}
          label="Danh mục có hệ số"
          tone="info"
          value={String(sourceEntries.length - missingConversions)}
        />
        <StatCard
          detail="Theo trạng thái sản phẩm từ API"
          label="Đang hoạt động"
          tone="success"
          value={String(sourceEntries.filter(({ product }) => product.status === 'ACTIVE').length)}
        />
        <StatCard
          detail="Không suy diễn hệ số bằng 0"
          label="Thiếu quy đổi"
          tone="warning"
          value={String(missingConversions)}
        />
        <StatCard
          detail={catalogMockMode ? 'Chế độ kiểm thử giao diện' : 'Products + product-conversions'}
          label="Nguồn dữ liệu"
          value={catalogMockMode ? 'Dữ liệu kiểm thử' : 'API đã xác thực'}
        />
      </div>

      <div className="example-grid">
        <article>
          <span>Đầm</span>
          <strong>6 cái ÷ 3 = 2,000 kg</strong>
          <small>Hệ số 3 cái = 1,000 kg</small>
        </article>
        <article>
          <span>Chăn, ga, bao gối, nệm gòn</span>
          <strong>1 cái × 3 = 3,000 kg</strong>
          <small>Tỷ lệ nguồn chính xác: 1 cái tương ứng 3,000 kg</small>
        </article>
      </div>

      {notice ? (
        <div
          className={`catalog-notice catalog-notice--${notice.kind}`}
          role={notice.kind === 'error' ? 'alert' : 'status'}
        >
          <span>{notice.message}</span>
          <button aria-label="Đóng thông báo" onClick={() => setNotice(null)} type="button">
            <X aria-hidden="true" size={17} />
          </button>
        </div>
      ) : null}

      <section className="filter-card catalog-filters" aria-label="Bộ lọc danh mục">
        <label className="search-field">
          <span>Tìm mặt hàng hoặc SKU</span>
          <div>
            <Search aria-hidden="true" size={17} />
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nhập tên hoặc mã SKU"
              value={query}
            />
          </div>
        </label>
        <label>
          Trạng thái
          <select
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
            value={status}
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="ACTIVE">Đang hoạt động</option>
            <option value="INACTIVE">Ngừng dùng</option>
          </select>
        </label>
        <label>
          Hiệu lực tại ngày
          <input
            aria-label="Hiệu lực tại ngày"
            onChange={(event) => setEffectiveAt(event.target.value)}
            type="date"
            value={effectiveAt}
          />
        </label>
        <Button
          disabled={
            (!catalogMockMode && (catalogQuery.isPending || catalogQuery.isFetching)) ||
            visibleEntries.length === 0
          }
          onClick={exportCsv}
          tone="secondary"
        >
          <Download aria-hidden="true" size={16} /> Tải CSV
        </Button>
      </section>

      {!catalogMockMode && catalogQuery.isPending ? (
        <section className="panel catalog-state" role="status">
          <span className="catalog-spinner" />
          <h2>Đang tải dữ liệu danh mục…</h2>
          <p>Đang đối chiếu sản phẩm, hệ số hiệu lực và lịch sử phiên bản.</p>
        </section>
      ) : null}

      {!catalogMockMode && catalogQuery.isError ? (
        <section className="panel catalog-state catalog-state--error" role="alert">
          <h2>Không tải được danh mục</h2>
          <p>{errorMessage(catalogQuery.error)} Không dùng dữ liệu mẫu thay thế.</p>
          <Button
            busy={catalogQuery.isFetching}
            onClick={() => void catalogQuery.refetch()}
            tone="secondary"
          >
            <RefreshCw aria-hidden="true" size={16} /> Thử lại
          </Button>
        </section>
      ) : null}

      {(catalogMockMode || catalogQuery.isSuccess) && sourceEntries.length === 0 ? (
        <section className="panel catalog-state" role="status">
          <h2>Chưa có mặt hàng</h2>
          <p>Tạo mặt hàng đầu tiên cùng hệ số quy đổi để bắt đầu.</p>
          <Button onClick={startCreate}>
            <Plus aria-hidden="true" size={16} /> Thêm mặt hàng
          </Button>
        </section>
      ) : null}

      {(catalogMockMode || catalogQuery.isSuccess) && sourceEntries.length > 0 ? (
        <section className="panel table-panel" aria-labelledby="catalog-table-title">
          <div className="section-heading section-heading--compact">
            <div>
              <h2 id="catalog-table-title">Bảng hệ số quy đổi</h2>
              <p>
                {visibleEntries.length}/{sourceEntries.length} mặt hàng • Dữ liệu tại{' '}
                {formatDate(effectiveAt)}
              </p>
            </div>
            {!browsingCurrentDate ? (
              <Badge tone="warning">Đang xem lịch sử — thao tác hệ số đã khóa</Badge>
            ) : null}
          </div>
          {visibleEntries.length === 0 ? (
            <div className="catalog-empty-filter" role="status">
              Không có mặt hàng khớp bộ lọc hiện tại.
            </div>
          ) : (
            <div className="responsive-table">
              <table>
                <thead>
                  <tr>
                    <th>Mặt hàng</th>
                    <th>1 kg = số cái</th>
                    <th>1 cái = kg</th>
                    <th>Phiên bản / hiệu lực</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleEntries.map((entry) => {
                    const ratios = formatConversionRatios(entry.conversion);
                    const hasActiveLatest = entry.latestConversion?.retiredAt === null;
                    return (
                      <tr key={entry.product.id}>
                        <td data-label="Mặt hàng">
                          <strong>{entry.product.name}</strong>
                          <small>{entry.product.sku}</small>
                        </td>
                        <td data-label="1 kg = số cái">{ratios.itemsPerKilogram}</td>
                        <td data-label="1 cái = kg">{ratios.kilogramsPerItem}</td>
                        <td data-label="Phiên bản / hiệu lực">
                          {entry.conversion ? (
                            <>
                              <strong>v{entry.conversion.version}</strong>
                              <small>
                                {formatDate(entry.conversion.effectiveFrom)} →{' '}
                                {formatDate(entry.conversion.effectiveTo)}
                              </small>
                            </>
                          ) : (
                            <span className="catalog-missing">Không có hệ số tại ngày này</span>
                          )}
                        </td>
                        <td data-label="Trạng thái">
                          <Badge tone={entry.product.status === 'ACTIVE' ? 'success' : 'neutral'}>
                            {entry.product.status === 'ACTIVE' ? 'Hoạt động' : 'Ngừng dùng'}
                          </Badge>
                        </td>
                        <td data-label="Thao tác">
                          <div className="table-actions catalog-actions">
                            <button
                              onClick={() => setHistoryProductId(entry.product.id)}
                              type="button"
                            >
                              <History aria-hidden="true" size={15} /> Lịch sử ({entry.historyCount}
                              )
                            </button>
                            {browsingCurrentDate && entry.latestConversion ? (
                              <button onClick={() => startConversion(entry)} type="button">
                                <Pencil aria-hidden="true" size={15} />{' '}
                                {hasActiveLatest ? 'Tạo phiên bản' : 'Khôi phục hệ số'}
                              </button>
                            ) : browsingCurrentDate && entry.historyCount === 0 ? (
                              <button onClick={() => startConversion(entry)} type="button">
                                <Pencil aria-hidden="true" size={15} /> Thêm hệ số
                              </button>
                            ) : null}
                            {browsingCurrentDate && hasActiveLatest ? (
                              <button
                                className="catalog-action--danger"
                                onClick={() =>
                                  setRetireDraft({
                                    entry,
                                    reason: 'Ngừng áp dụng hệ số quy đổi',
                                  })
                                }
                                type="button"
                              >
                                <Trash2 aria-hidden="true" size={15} /> Ngừng hệ số
                              </button>
                            ) : null}
                            <button
                              aria-busy={busyKey === `status:${entry.product.id}`}
                              disabled={Boolean(busyKey)}
                              onClick={() => void toggleProduct(entry)}
                              type="button"
                            >
                              {busyKey === `status:${entry.product.id}`
                                ? 'Đang lưu…'
                                : entry.product.status === 'ACTIVE'
                                  ? 'Ngừng mặt hàng'
                                  : 'Khôi phục mặt hàng'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {draft ? (
        <ConversionDialog
          busy={busyKey === 'save-conversion'}
          draft={draft}
          onChange={setDraft}
          onClose={() => setDraft(null)}
          onSubmit={() => void saveDraft()}
        />
      ) : null}

      {retireDraft ? (
        <RetireDialog
          busy={busyKey === 'retire-conversion'}
          draft={retireDraft}
          onChange={setRetireDraft}
          onClose={() => setRetireDraft(null)}
          onSubmit={() => void submitRetirement()}
        />
      ) : null}

      {historyProductId ? (
        <HistoryDialog
          busy={historyQuery.isFetching}
          entries={sourceEntries}
          error={historyQuery.isError ? errorMessage(historyQuery.error) : ''}
          history={history}
          onClose={() => setHistoryProductId(null)}
          onRetry={() => void historyQuery.refetch()}
          onSelect={setHistoryProductId}
          productId={historyProductId}
        />
      ) : null}
    </>
  );
}

interface ConversionDialogProps {
  readonly busy: boolean;
  readonly draft: ConversionDraft;
  readonly onChange: (draft: ConversionDraft) => void;
  readonly onClose: () => void;
  readonly onSubmit: () => void;
}

function ConversionDialog({ busy, draft, onChange, onClose, onSubmit }: ConversionDialogProps) {
  const dialogRef = useDialogAccessibility<HTMLFormElement>(busy ? undefined : onClose);
  const normalizedWeight = normalizeKilograms(draft.weightKilograms);
  const quantity = Number(draft.itemQuantity);
  const preview =
    normalizedWeight && Number.isSafeInteger(quantity) && quantity > 0
      ? formatConversionRatios({
          ...(draft.baseConversion ?? {
            createdAt: new Date().toISOString(),
            createdByAccountId: null,
            effectiveTo: null,
            id: 'preview',
            productId: draft.product?.id ?? 'preview',
            retiredAt: null,
            retiredByAccountId: null,
            retirementReason: null,
            version: 1,
          }),
          effectiveFrom: draft.effectiveFrom,
          itemQuantity: quantity,
          reason: draft.reason || 'Xem trước tỷ lệ',
          weightKilograms: normalizedWeight,
        }).kilogramsPerItem
      : '—';
  const title =
    draft.mode === 'CREATE_PRODUCT'
      ? 'Thêm mặt hàng và hệ số'
      : draft.mode === 'INITIAL_CONVERSION'
        ? 'Bổ sung hệ số ban đầu'
        : draft.baseConversion?.retiredAt
          ? 'Khôi phục bằng phiên bản mới'
          : 'Tạo phiên bản quy đổi mới';

  return (
    <div className="dialog-backdrop">
      <form
        ref={dialogRef}
        aria-labelledby="catalog-dialog-title"
        aria-modal="true"
        className="dialog catalog-dialog"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        role="dialog"
        tabIndex={-1}
      >
        <div className="dialog__header">
          <div>
            <h2 id="catalog-dialog-title">{title}</h2>
            <p>Phiên bản cũ được giữ nguyên trong lịch sử và audit.</p>
          </div>
          <button aria-label="Đóng" disabled={busy} onClick={onClose} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </div>
        <div className="catalog-dialog__grid">
          <label>
            Mã SKU
            <input
              autoFocus={draft.mode === 'CREATE_PRODUCT'}
              disabled={draft.mode !== 'CREATE_PRODUCT' || busy}
              maxLength={80}
              onChange={(event) => onChange({ ...draft, sku: event.target.value })}
              required
              value={draft.sku}
            />
          </label>
          <label>
            Tên mặt hàng
            <input
              disabled={draft.mode !== 'CREATE_PRODUCT' || busy}
              maxLength={200}
              onChange={(event) => onChange({ ...draft, name: event.target.value })}
              required
              value={draft.name}
            />
          </label>
          <label>
            Số cái trong tỷ lệ
            <input
              disabled={busy}
              inputMode="numeric"
              min="1"
              onChange={(event) => onChange({ ...draft, itemQuantity: event.target.value })}
              required
              step="1"
              type="number"
              value={draft.itemQuantity}
            />
          </label>
          <label>
            Khối lượng tương ứng (kg)
            <input
              disabled={busy}
              inputMode="decimal"
              min="0.001"
              onChange={(event) => onChange({ ...draft, weightKilograms: event.target.value })}
              required
              step="0.001"
              type="number"
              value={draft.weightKilograms}
            />
          </label>
          <label>
            Hiệu lực từ
            <input
              disabled={busy}
              min={
                draft.mode === 'NEXT_VERSION' && draft.baseConversion
                  ? addOneDay(draft.baseConversion.effectiveFrom)
                  : undefined
              }
              onChange={(event) => onChange({ ...draft, effectiveFrom: event.target.value })}
              required
              type="date"
              value={draft.effectiveFrom}
            />
          </label>
          <label className="catalog-dialog__wide">
            Lý do thay đổi
            <textarea
              disabled={busy}
              maxLength={500}
              minLength={3}
              onChange={(event) => onChange({ ...draft, reason: event.target.value })}
              required
              rows={2}
              value={draft.reason}
            />
          </label>
        </div>
        <div className="dialog__summary">
          <span>1 cái tương ứng</span>
          <strong>{preview}</strong>
        </div>
        <div className="dialog__actions">
          <Button disabled={busy} onClick={onClose} tone="secondary">
            Hủy
          </Button>
          <Button busy={busy} type="submit">
            <Save aria-hidden="true" size={16} /> Lưu phiên bản
          </Button>
        </div>
      </form>
    </div>
  );
}

interface RetireDialogProps {
  readonly busy: boolean;
  readonly draft: RetireDraft;
  readonly onChange: (draft: RetireDraft) => void;
  readonly onClose: () => void;
  readonly onSubmit: () => void;
}

function RetireDialog({ busy, draft, onChange, onClose, onSubmit }: RetireDialogProps) {
  const dialogRef = useDialogAccessibility<HTMLFormElement>(busy ? undefined : onClose);
  return (
    <div className="dialog-backdrop">
      <form
        ref={dialogRef}
        aria-labelledby="retire-dialog-title"
        aria-modal="true"
        className="dialog catalog-retire"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        role="dialog"
        tabIndex={-1}
      >
        <div className="dialog__header">
          <div>
            <h2 id="retire-dialog-title">Ngừng hệ số của {draft.entry.product.name}?</h2>
            <p>
              Hệ số sẽ dừng hiệu lực nhưng vẫn còn trong lịch sử. API hiện không cho khôi phục một
              hệ số đã ngừng.
            </p>
          </div>
          <button aria-label="Đóng" disabled={busy} onClick={onClose} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </div>
        <label>
          Lý do ngừng hệ số
          <textarea
            autoFocus
            disabled={busy}
            maxLength={500}
            minLength={3}
            onChange={(event) => onChange({ ...draft, reason: event.target.value })}
            required
            rows={3}
            value={draft.reason}
          />
        </label>
        <div className="dialog__actions">
          <Button disabled={busy} onClick={onClose} tone="secondary">
            Hủy
          </Button>
          <Button busy={busy} tone="danger" type="submit">
            <Trash2 aria-hidden="true" size={16} /> Xác nhận ngừng
          </Button>
        </div>
      </form>
    </div>
  );
}

interface HistoryDialogProps {
  readonly busy: boolean;
  readonly entries: readonly CatalogEntry[];
  readonly error: string;
  readonly history: readonly ProductConversion[];
  readonly onClose: () => void;
  readonly onRetry: () => void;
  readonly onSelect: (productId: string) => void;
  readonly productId: string;
}

function HistoryDialog({
  busy,
  entries,
  error,
  history,
  onClose,
  onRetry,
  onSelect,
  productId,
}: HistoryDialogProps) {
  const dialogRef = useDialogAccessibility(onClose);
  const product = entries.find((entry) => entry.product.id === productId)?.product;
  return (
    <div className="dialog-backdrop">
      <section
        ref={dialogRef}
        aria-labelledby="history-dialog-title"
        aria-modal="true"
        className="dialog catalog-history"
        role="dialog"
        tabIndex={-1}
      >
        <div className="dialog__header">
          <div>
            <h2 id="history-dialog-title">Lịch sử hệ số quy đổi</h2>
            <p>Mỗi dòng là một bản ghi nguồn bất biến từ máy chủ.</p>
          </div>
          <button aria-label="Đóng" onClick={onClose} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </div>
        <label>
          Mặt hàng
          <select onChange={(event) => onSelect(event.target.value)} value={productId}>
            {entries.map((entry) => (
              <option key={entry.product.id} value={entry.product.id}>
                {entry.product.sku} — {entry.product.name}
              </option>
            ))}
          </select>
        </label>
        {busy ? <div className="catalog-history__state">Đang tải lịch sử…</div> : null}
        {error ? (
          <div className="catalog-history__state catalog-history__state--error" role="alert">
            <span>{error}</span>
            <Button onClick={onRetry} tone="secondary">
              Thử lại
            </Button>
          </div>
        ) : null}
        {!busy && !error && history.length === 0 ? (
          <div className="catalog-history__state" role="status">
            {product?.name ?? 'Mặt hàng'} chưa có hệ số quy đổi.
          </div>
        ) : null}
        {!busy && !error && history.length > 0 ? (
          <div className="catalog-history__list">
            {history.map((conversion) => {
              const ratios = formatConversionRatios(conversion);
              return (
                <article key={conversion.id}>
                  <div>
                    <strong>Phiên bản {conversion.version}</strong>
                    <Badge tone={conversion.retiredAt ? 'neutral' : 'success'}>
                      {conversion.retiredAt ? 'Đã kết thúc' : 'Đang áp dụng / đã lên lịch'}
                    </Badge>
                  </div>
                  <dl>
                    <div>
                      <dt>Tỷ lệ nguồn</dt>
                      <dd>
                        {conversion.itemQuantity} cái = {conversion.weightKilograms} kg
                      </dd>
                    </div>
                    <div>
                      <dt>1 cái</dt>
                      <dd>{ratios.kilogramsPerItem}</dd>
                    </div>
                    <div>
                      <dt>Hiệu lực</dt>
                      <dd>
                        {formatDate(conversion.effectiveFrom)} →{' '}
                        {formatDate(conversion.effectiveTo)}
                      </dd>
                    </div>
                    <div>
                      <dt>Lý do tạo</dt>
                      <dd>{conversion.reason}</dd>
                    </div>
                    {conversion.retirementReason ? (
                      <div>
                        <dt>Lý do kết thúc</dt>
                        <dd>{conversion.retirementReason}</dd>
                      </div>
                    ) : null}
                  </dl>
                </article>
              );
            })}
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
