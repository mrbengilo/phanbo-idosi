import type { Role, StoreKind } from './types';

export interface RouteAccessPolicy {
  readonly roles: readonly Role[];
  readonly storeKinds?: readonly StoreKind[];
}

export const routeAccessPolicies = {
  '/': { roles: ['ADMIN', 'HTKD', 'STORE'] },
  '/allocations': { roles: ['ADMIN', 'HTKD', 'STORE'] },
  '/requests': { roles: ['HTKD', 'STORE'] },
  '/receive': {
    roles: ['HTKD', 'STORE'],
    storeKinds: ['RETAIL'],
  },
  '/inventory': {
    roles: ['ADMIN', 'HTKD', 'STORE'],
    storeKinds: ['RETAIL'],
  },
  '/open-bag': {
    roles: ['HTKD', 'STORE'],
    storeKinds: ['RETAIL'],
  },
  '/sales': {
    roles: ['ADMIN', 'HTKD', 'STORE'],
    storeKinds: ['RETAIL'],
  },
  '/sorting': {
    roles: ['ADMIN', 'HTKD', 'STORE'],
    storeKinds: ['RETAIL'],
  },
  '/transfers': {
    roles: ['ADMIN', 'HTKD', 'STORE'],
    storeKinds: ['RETAIL'],
  },
  '/catalog': { roles: ['ADMIN', 'HTKD'] },
  '/costs': { roles: ['ADMIN', 'HTKD'] },
  '/reports': { roles: ['ADMIN', 'HTKD'] },
  '/stores': { roles: ['ADMIN'] },
  '/users': { roles: ['ADMIN'] },
  '/audit': { roles: ['ADMIN'] },
  '/settings': { roles: ['ADMIN'] },
} as const satisfies Record<string, RouteAccessPolicy>;

function normalizePath(pathname: string): string {
  if (pathname === '/') return pathname;
  return pathname.replace(/\/+$/, '');
}

export function canAccessRoute(pathname: string, role: Role, storeKind: StoreKind | null): boolean {
  const policy: RouteAccessPolicy | undefined =
    routeAccessPolicies[normalizePath(pathname) as keyof typeof routeAccessPolicies];
  if (!policy || !policy.roles.includes(role)) return false;
  if (role !== 'STORE' || policy.storeKinds === undefined) return true;
  return storeKind !== null && policy.storeKinds.includes(storeKind);
}
