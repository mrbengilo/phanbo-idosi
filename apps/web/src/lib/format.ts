export const formatInteger = (value: number): string =>
  new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value);

export const formatKg = (value: number): string =>
  `${new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value)} kg`;

export const formatVnd = (value: number | null): string =>
  value === null
    ? 'Không áp dụng'
    : new Intl.NumberFormat('vi-VN', {
        currency: 'VND',
        maximumFractionDigits: 0,
        notation: value >= 1_000_000_000 ? 'compact' : 'standard',
        style: 'currency',
      }).format(value);

export const formatPercent = (value: number | null): string =>
  value === null
    ? 'N/A'
    : `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value)}%`;
