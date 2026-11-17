import type { ReactNode } from 'react';
import { Empty, Spinner } from './ui';

export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right';
}

/**
 * Table markup and styling taken from Baseplate's Crud/Index page.
 */
export default function DataTable<T>({ columns, rows, loading, empty = 'Nothing to show yet.', rowKey }: { columns: Column<T>[]; rows: T[] | undefined; loading?: boolean; empty?: string; rowKey: (row: T) => string | number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-gray-900/40">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 ${column.align === 'right' ? 'text-right' : 'text-left'}`}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-800 dark:bg-transparent">
            {loading && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8">
                  <Spinner />
                </td>
              </tr>
            )}
            {!loading && (rows?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={columns.length}>
                  <Empty>{empty}</Empty>
                </td>
              </tr>
            )}
            {!loading &&
              rows?.map((row) => (
                <tr key={rowKey(row)}>
                  {columns.map((column) => (
                    <td key={column.key} className={`whitespace-nowrap px-4 py-4 text-sm text-gray-700 dark:text-gray-300 ${column.align === 'right' ? 'text-right' : ''}`}>
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Pager for Laravel API resource pagination (`meta.current_page/last_page`).
 */
export function Pager({ meta, onPage }: { meta?: { current_page: number; last_page: number; total: number }; onPage: (page: number) => void }) {
  if (!meta || meta.last_page <= 1) {
    return null;
  }

  const button = (page: number, label: ReactNode, disabled = false, active = false) => (
    <button
      key={`${label}-${page}`}
      disabled={disabled}
      onClick={() => onPage(page)}
      className={`rounded-lg border px-3 py-2 text-sm ${
        active
          ? 'border-brand-500 bg-brand-500 text-white'
          : disabled
            ? 'cursor-not-allowed border-gray-200 text-gray-400 dark:border-gray-800'
            : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]'
      }`}
    >
      {label}
    </button>
  );

  const start = Math.max(1, meta.current_page - 2);
  const end = Math.min(meta.last_page, start + 4);
  const pages = [];

  for (let p = start; p <= end; p++) {
    pages.push(button(p, p, false, p === meta.current_page));
  }

  return (
    <div className="mt-6 flex flex-wrap items-center gap-1">
      {button(meta.current_page - 1, '« Previous', meta.current_page <= 1)}
      {pages}
      {button(meta.current_page + 1, 'Next »', meta.current_page >= meta.last_page)}
      <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">{meta.total} total</span>
    </div>
  );
}
