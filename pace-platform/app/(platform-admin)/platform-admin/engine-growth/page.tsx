'use client';

import { useState, useEffect, useCallback } from 'react';
import { AdminHeader } from '@/components/admin/admin-header';
import { AdminDataTable } from '@/components/admin/admin-data-table';
import { AdminChart } from '@/components/admin/admin-chart';
import { AdminErrorState } from '@/components/admin/admin-error-state';
import { AdminEmptyState } from '@/components/admin/admin-empty-state';
import { AdminPageSkeleton } from '@/components/admin/admin-skeleton';
import { TimeRangeSelector } from '@/components/admin/time-range-selector';

// ---------------------------------------------------------------------------
// P7: エンジン成長率
// ---------------------------------------------------------------------------

interface DataQualityRow extends Record<string, unknown> {
  org_name: string;
  total_records: string;
  daily_metrics_count: string;
  assessment_count: string;
  missing_rate: string;
  continuity_score: string;
  quality_score: string;
}

export default function EngineGrowthPage() {
  const [data, setData] = useState<{
    dataGrowth: { label: string; value: number }[];
    accuracyTrend: { label: string; value: number }[];
    qualityTable: DataQualityRow[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [, setTimeRange] = useState('90d');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      await new Promise((r) => setTimeout(r, 600));
      setData({
        dataGrowth: [
          { label: '11月', value: 12000 },
          { label: '12月', value: 18500 },
          { label: '1月', value: 28000 },
          { label: '2月', value: 42000 },
          { label: '3月', value: 58000 },
          { label: '4月', value: 72000 },
        ],
        accuracyTrend: [
          { label: '11月', value: 72 },
          { label: '12月', value: 75 },
          { label: '1月', value: 78 },
          { label: '2月', value: 81 },
          { label: '3月', value: 84 },
          { label: '4月', value: 86 },
        ],
        qualityTable: [
          { org_name: 'FC Tokyo', total_records: '15,200', daily_metrics_count: '8,400', assessment_count: '450', missing_rate: '3.2%', continuity_score: '92%', quality_score: 'A' },
          { org_name: 'Cerezo Osaka', total_records: '8,500', daily_metrics_count: '4,800', assessment_count: '200', missing_rate: '5.1%', continuity_score: '85%', quality_score: 'B+' },
          { org_name: 'Vissel Kobe', total_records: '18,000', daily_metrics_count: '10,200', assessment_count: '550', missing_rate: '2.1%', continuity_score: '95%', quality_score: 'A+' },
          { org_name: 'Sanfrecce', total_records: '22,500', daily_metrics_count: '12,800', assessment_count: '680', missing_rate: '1.8%', continuity_score: '96%', quality_score: 'A+' },
          { org_name: 'Gamba Osaka', total_records: '5,800', daily_metrics_count: '3,200', assessment_count: '100', missing_rate: '8.5%', continuity_score: '70%', quality_score: 'C+' },
        ],
      });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <AdminPageSkeleton />;
  if (error) return <div className="p-6"><AdminErrorState onRetry={fetchData} /></div>;
  if (!data) return <div className="p-6"><AdminEmptyState /></div>;

  const columns = [
    { key: 'org_name', header: '組織名' },
    { key: 'total_records', header: '総レコード数' },
    { key: 'daily_metrics_count', header: 'daily_metrics' },
    { key: 'assessment_count', header: 'assessment' },
    { key: 'missing_rate', header: '欠損率' },
    { key: 'continuity_score', header: '継続率' },
    {
      key: 'quality_score',
      header: '品質スコア',
      render: (row: DataQualityRow) => {
        const score = row.quality_score as string;
        const color = score.startsWith('A') ? 'text-emerald-600' : score.startsWith('B') ? 'text-blue-600' : 'text-amber-600';
        return <span className={`font-semibold ${color}`}>{score}</span>;
      },
    },
  ];

  return (
    <div>
      <AdminHeader title="エンジン成長率">
        <TimeRangeSelector onChange={setTimeRange} options={['30d', '90d']} />
      </AdminHeader>

      <div className="space-y-6 p-6">
        {/* チャート2列 */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AdminChart
            data={data.dataGrowth}
            title="データ蓄積量推移（全組織合計）"
            yAxisLabel="レコード数"
            color="#3B82F6"
          />
          <AdminChart
            data={data.accuracyTrend}
            title="推論精度トレンド"
            yAxisLabel="精度 (%)"
            color="#10B981"
          />
        </div>

        {/* データ品質テーブル */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">データ品質スコア一覧</h2>
          <AdminDataTable columns={columns} data={data.qualityTable} />
        </div>
      </div>
    </div>
  );
}
