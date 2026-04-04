'use client';

import { useState, useMemo } from 'react';

// ---------------------------------------------------------------------------
// AdminDataTable — ソート・フィルタ・ページネーション付きテーブル
// ---------------------------------------------------------------------------

interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
}

interface AdminDataTableProps<T extends Record<string, unknown>> {
  columns: Column<T>[];
  data: T[];
  pageSize?: number;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
}

type SortDirection = 'asc' | 'desc' | null;

export function AdminDataTable<T extends Record<string, unknown>>({
  columns,
  data,
  pageSize = 10,
  onRowClick,
  emptyMessage = 'データがありません',
}: AdminDataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [filter, setFilter] = useState('');

  // フィルタ
  const filteredData = useMemo(() => {
    if (!filter) return data;
    const lower = filter.toLowerCase();
    return data.filter((row) =>
      Object.values(row).some((v) =>
        String(v).toLowerCase().includes(lower)
      )
    );
  }, [data, filter]);

  // ソート
  const sortedData = useMemo(() => {
    if (!sortKey || !sortDir) return filteredData;
    return [...filteredData].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = String(aVal).localeCompare(String(bVal), 'ja', { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filteredData, sortKey, sortDir]);

  // ページネーション
  const totalPages = Math.ceil(sortedData.length / pageSize);
  const pagedData = sortedData.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : d === 'desc' ? null : 'asc'));
      if (sortDir === 'desc') setSortKey(null);
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setCurrentPage(0);
  }

  return (
    <div className="space-y-3">
      {/* フィルタ入力 */}
      <div className="flex items-center justify-between">
        <input
          type="text"
          placeholder="検索..."
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setCurrentPage(0);
          }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <span className="text-xs text-slate-500">
          {filteredData.length}件
        </span>
      </div>

      {/* テーブル */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 ${
                    col.sortable !== false ? 'cursor-pointer select-none hover:text-slate-700' : ''
                  } ${col.className ?? ''}`}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {sortKey === col.key && (
                      <span className="text-blue-500">
                        {sortDir === 'asc' ? '\u2191' : '\u2193'}
                      </span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-slate-400">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              pagedData.map((row, i) => (
                <tr
                  key={i}
                  className={`border-b border-slate-50 transition-colors ${
                    onRowClick ? 'cursor-pointer hover:bg-slate-50' : ''
                  }`}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={`px-4 py-3 text-slate-700 ${col.className ?? ''}`}>
                      {col.render ? col.render(row) : String(row[col.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ページネーション */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            disabled={currentPage === 0}
            onClick={() => setCurrentPage((p) => p - 1)}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            前へ
          </button>
          <span className="text-xs text-slate-500">
            {currentPage + 1} / {totalPages}
          </span>
          <button
            type="button"
            disabled={currentPage >= totalPages - 1}
            onClick={() => setCurrentPage((p) => p + 1)}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            次へ
          </button>
        </div>
      )}
    </div>
  );
}
