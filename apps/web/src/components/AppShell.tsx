import clsx from 'clsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  BarChart3,
  Boxes,
  Building2,
  ClipboardCheck,
  ClipboardList,
  FileClock,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageCheck,
  PackageOpen,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Truck,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { DashboardSkeleton } from './Skeleton';
import { PriorityOfferOverlay } from './PriorityOfferOverlay';
import { ApiClientError, getStoreKind, logout, mockModeEnabled } from '../lib/api';
import { canAccessRoute } from '../lib/access';
import { clearAuthenticatedSession, useSession } from '../lib/auth';
import { onSessionExpired } from '../lib/session-expiry';
import type { DemoMode, Role, StoreKind } from '../lib/types';

interface NavEntry {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const navEntries: NavEntry[] = [
  { to: '/', label: 'Tổng quan', icon: LayoutDashboard },
  {
    to: '/allocations',
    label: 'Phân bổ hàng hóa',
    icon: SlidersHorizontal,
  },
  {
    to: '/requests',
    label: 'Đặt hàng',
    icon: ClipboardList,
  },
  {
    to: '/receive',
    label: 'Nhận hàng',
    icon: PackageCheck,
  },
  {
    to: '/inventory',
    label: 'Tồn kho / Lịch sử',
    icon: Boxes,
  },
  {
    to: '/open-bag',
    label: 'Khui kiện',
    icon: PackageOpen,
  },
  {
    to: '/sales',
    label: 'Bán & đồng bộ',
    icon: BarChart3,
  },
  {
    to: '/sorting',
    label: 'Lọc & xử lý',
    icon: Archive,
  },
  {
    to: '/transfers',
    label: 'Điều chuyển',
    icon: Truck,
  },
  { to: '/catalog', label: 'Danh mục & quy đổi', icon: ClipboardCheck },
  { to: '/reports', label: 'Báo cáo', icon: FileClock },
  { to: '/stores', label: 'Cửa hàng & nhóm', icon: Building2 },
  { to: '/users', label: 'Tài khoản', icon: Users },
  { to: '/audit', label: 'Audit', icon: ShieldCheck },
  { to: '/settings', label: 'Cấu hình', icon: Settings },
];

const modeLabel: Record<DemoMode, string> = {
  ADMIN: 'Admin IDOSI',
  HTKD: 'HTKD • Miền Nam',
  STORE_RETAIL: 'Cửa hàng Gò Vấp',
  STORE_WHOLESALE: 'Khách sỉ Long Xuyên',
};

const roleStorageKey = 'idosi-demo-role:v2';

function readMode(): DemoMode {
  const stored = window.localStorage.getItem(roleStorageKey);
  if (
    stored === 'ADMIN' ||
    stored === 'HTKD' ||
    stored === 'STORE_RETAIL' ||
    stored === 'STORE_WHOLESALE'
  ) {
    return stored;
  }
  return 'ADMIN';
}

export function AppShell() {
  const [mode, setMode] = useState<DemoMode>(readMode);
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sessionQuery = useSession();
  const session = sessionQuery.data;

  useEffect(() => {
    if (mockModeEnabled) return undefined;
    return onSessionExpired(() => {
      const returnPath = `${location.pathname}${location.search}${location.hash}`;
      clearAuthenticatedSession(queryClient);
      navigate('/login', { replace: true, state: { from: returnPath, sessionExpired: true } });
    });
  }, [location.hash, location.pathname, location.search, navigate, queryClient]);

  const principalStoreId = session?.principal.storeId;
  const storeKindQuery = useQuery({
    enabled:
      !mockModeEnabled &&
      session?.principal.role === 'STORE' &&
      typeof principalStoreId === 'string',
    queryFn: () => {
      if (!principalStoreId) throw new Error('Store session has no store ID');
      return getStoreKind(principalStoreId);
    },
    queryKey: ['store-kind', principalStoreId],
    retry: false,
  });
  const demoRole: Role = mode === 'ADMIN' ? 'ADMIN' : mode === 'HTKD' ? 'HTKD' : 'STORE';
  const role: Role = mockModeEnabled ? demoRole : (session?.principal.role ?? 'STORE');
  const storeKind: StoreKind | null = mockModeEnabled
    ? mode === 'STORE_RETAIL'
      ? 'RETAIL'
      : mode === 'STORE_WHOLESALE'
        ? 'WHOLESALE'
        : null
    : (storeKindQuery.data ?? null);
  const links = useMemo(
    () => navEntries.filter((entry) => canAccessRoute(entry.to, role, storeKind)),
    [role, storeKind],
  );

  const updateMode = (value: DemoMode) => {
    window.localStorage.setItem(roleStorageKey, value);
    setMode(value);
    setOpen(false);
  };

  const signOut = async () => {
    setSigningOut(true);
    setSignOutError('');
    try {
      if (!mockModeEnabled) {
        await logout();
        clearAuthenticatedSession(queryClient);
      }
      navigate('/login', { replace: true });
    } catch (cause) {
      setSignOutError(
        cause instanceof ApiClientError
          ? cause.message
          : 'Không thể đăng xuất an toàn. Vui lòng thử lại.',
      );
    } finally {
      setSigningOut(false);
    }
  };

  if (!mockModeEnabled && sessionQuery.isPending) return <DashboardSkeleton />;
  if (!mockModeEnabled && sessionQuery.isError) {
    return (
      <AccessLoadError
        detail="Không thể xác minh phiên đăng nhập. Không có dữ liệu nghiệp vụ nào được hiển thị."
        onRetry={() => void sessionQuery.refetch()}
      />
    );
  }
  if (!mockModeEnabled && !session) {
    return (
      <Navigate
        replace
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
        to="/login"
      />
    );
  }
  if (!mockModeEnabled && role === 'STORE' && typeof principalStoreId !== 'string') {
    return (
      <AccessLoadError
        detail="Tài khoản cửa hàng chưa được gắn với cửa hàng hợp lệ."
        error={signOutError}
        onRetry={() => void sessionQuery.refetch()}
        onSignOut={() => void signOut()}
        signingOut={signingOut}
      />
    );
  }
  if (!mockModeEnabled && role === 'STORE' && storeKindQuery.isPending) {
    return <DashboardSkeleton />;
  }
  if (!mockModeEnabled && role === 'STORE' && (storeKindQuery.isError || storeKind === null)) {
    return (
      <AccessLoadError
        detail="Không thể xác định loại cửa hàng. Hệ thống đã khóa các màn hình nghiệp vụ để bảo vệ phạm vi truy cập."
        error={signOutError}
        onRetry={() => void storeKindQuery.refetch()}
        onSignOut={() => void signOut()}
        signingOut={signingOut}
      />
    );
  }
  if (!canAccessRoute(location.pathname, role, storeKind)) {
    return <Navigate replace to="/" />;
  }

  const profileName = mockModeEnabled ? modeLabel[mode] : (session?.principal.displayName ?? '');

  return (
    <div className="app-shell">
      <button
        aria-label="Mở menu"
        className="mobile-menu-trigger"
        onClick={() => setOpen(true)}
        type="button"
      >
        <Menu aria-hidden="true" size={22} />
      </button>
      <aside className={clsx('sidebar', open && 'sidebar--open')}>
        <div className="sidebar__brand">
          <div>
            <strong>IDOSI</strong>
            <span>QUẢN TRỊ HỆ THỐNG</span>
          </div>
          <button aria-label="Đóng menu" onClick={() => setOpen(false)} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </div>
        <nav aria-label="Điều hướng chính" className="sidebar__nav">
          {links.map(({ icon: Icon, label, to }) => (
            <NavLink
              className={({ isActive }) =>
                clsx('sidebar__link', isActive && 'sidebar__link--active')
              }
              end={to === '/'}
              key={to}
              onClick={() => setOpen(false)}
              to={to}
            >
              <Icon aria-hidden="true" size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__profile">
          {mockModeEnabled ? (
            <>
              <label htmlFor="role-switcher">Chế độ kiểm thử vai trò</label>
              <select
                id="role-switcher"
                onChange={(event) => updateMode(event.target.value as DemoMode)}
                value={mode}
              >
                <option value="ADMIN">Admin</option>
                <option value="HTKD">HTKD</option>
                <option value="STORE_RETAIL">Cửa hàng bán lẻ</option>
                <option value="STORE_WHOLESALE">Khách sỉ</option>
              </select>
            </>
          ) : null}
          <strong>{profileName}</strong>
          <span>{role === 'ADMIN' ? 'Toàn hệ thống' : 'Phạm vi đã phân quyền'}</span>
          {signOutError ? (
            <span className="sidebar__error" role="alert">
              {signOutError}
            </span>
          ) : null}
          <button disabled={signingOut} onClick={() => void signOut()} type="button">
            <LogOut aria-hidden="true" size={16} />
            {signingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}
          </button>
        </div>
      </aside>
      {open ? (
        <button
          aria-label="Đóng menu"
          className="sidebar-backdrop"
          onClick={() => setOpen(false)}
          type="button"
        />
      ) : null}
      <main className="app-main" key={location.pathname}>
        <Outlet context={{ role, storeKind }} />
      </main>
      <PriorityOfferOverlay role={role} />
      <nav aria-label="Điều hướng mobile" className="mobile-bottom-nav">
        {links.slice(0, 4).map(({ icon: Icon, label, to }) => (
          <NavLink end={to === '/'} key={to} to={to}>
            <Icon aria-hidden="true" size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

interface AccessLoadErrorProps {
  readonly detail: string;
  readonly error?: string;
  readonly onRetry: () => void;
  readonly onSignOut?: () => void;
  readonly signingOut?: boolean;
}

function AccessLoadError({
  detail,
  error = '',
  onRetry,
  onSignOut,
  signingOut = false,
}: AccessLoadErrorProps) {
  return (
    <main className="access-load-error" role="alert">
      <ShieldCheck aria-hidden="true" size={30} />
      <h1>Chưa thể xác minh quyền truy cập</h1>
      <p>{detail}</p>
      {error ? (
        <div className="form-error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="access-load-error__actions">
        <button className="button button--primary" onClick={onRetry} type="button">
          Thử lại
        </button>
        {onSignOut ? (
          <button
            className="button button--secondary"
            disabled={signingOut}
            onClick={onSignOut}
            type="button"
          >
            {signingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}
          </button>
        ) : null}
      </div>
    </main>
  );
}

export interface AppOutletContext {
  role: Role;
  storeKind: StoreKind | null;
}
