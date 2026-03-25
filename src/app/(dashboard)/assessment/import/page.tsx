import { CsvImporter } from "@/components/assessment/csv-importer";

export default function AssessmentImportPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          アセスメントノード・インポート
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          CSV ファイルからアセスメントノード（P0〜F5, A3, A5）をインポートします。
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">
          CSV フォーマット
        </h2>
        <div className="bg-slate-50 rounded-lg p-3 mb-4 text-xs text-slate-600 font-mono overflow-x-auto">
          node_id,category,question_text,lr_yes,lr_no,prescription_tags,contraindication_tags,evidence_text,target_axis,file_type
        </div>
        <CsvImporter />
      </div>
    </div>
  );
}
