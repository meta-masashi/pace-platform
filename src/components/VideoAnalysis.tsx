"use client";

import { useState, useRef } from "react";
import { Video, Upload, Loader2, AlertTriangle, CheckCircle } from "lucide-react";

interface VideoAnalysisResult {
  scores: {
    landing: number;
    coreStability: number;
    rangeOfMotion: number;
    symmetry: number;
    overallQuality: number;
  };
  overallScore: number;
  riskLevel: "low" | "moderate" | "high";
  findings: string[];
  recommendations: string[];
  objectiveNote: string;
}

interface Props {
  athleteName: string;
  athletePosition: string;
  onObjectiveGenerated: (text: string) => void; // callback to fill SOAP O field
}

const MOVEMENT_TYPES = [
  { value: "squat", label: "スクワット" },
  { value: "hop", label: "シングルレッグホップ" },
  { value: "sprint", label: "スプリント" },
  { value: "cutting", label: "カッティング" },
  { value: "landing", label: "着地動作" },
  { value: "general", label: "その他" },
];

const SCORE_LABELS: Record<keyof VideoAnalysisResult["scores"], string> = {
  landing: "着地メカニクス",
  coreStability: "体幹安定性",
  rangeOfMotion: "関節可動域",
  symmetry: "左右対称性",
  overallQuality: "動作品質",
};

const RISK_COLORS = {
  low: "bg-green-100 text-green-800",
  moderate: "bg-yellow-100 text-yellow-800",
  high: "bg-red-100 text-red-800",
};

const RISK_LABELS = {
  low: "低リスク",
  moderate: "中リスク",
  high: "高リスク",
};

export default function VideoAnalysis({ athleteName, athletePosition, onObjectiveGenerated }: Props) {
  const [movementType, setMovementType] = useState("squat");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VideoAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    if (!file.type.startsWith("video/")) {
      setError("動画ファイルを選択してください（MP4, MOV, WebM）");
      return;
    }
    // Validate size (max 4MB)
    if (file.size > 4 * 1024 * 1024) {
      setError("ファイルサイズは4MB以下にしてください（約30秒以内のクリップ）");
      return;
    }

    setFileName(file.name);
    setError(null);
    setResult(null);
    setLoading(true);

    try {
      // Convert to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          resolve(dataUrl.split(",")[1]); // remove data:video/mp4;base64, prefix
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await fetch("/api/ai/video-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoBase64: base64,
          mimeType: file.type,
          movementType,
          athleteName,
          athletePosition,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");

      setResult(data.analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : "解析に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const ScoreBar = ({ score, label }: { score: number; label: string }) => (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium">{score}/5</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full">
        <div
          className={`h-2 rounded-full ${score >= 4 ? "bg-green-500" : score >= 3 ? "bg-yellow-500" : "bg-red-500"}`}
          style={{ width: `${(score / 5) * 100}%` }}
        />
      </div>
    </div>
  );

  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Video className="w-5 h-5 text-indigo-600" />
        <h3 className="font-semibold text-gray-900">動画動作解析（AI）</h3>
        <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">Beta</span>
      </div>

      {/* Movement type selector */}
      <div className="flex gap-2 flex-wrap">
        {MOVEMENT_TYPES.map(m => (
          <button
            key={m.value}
            onClick={() => setMovementType(m.value)}
            className={`text-sm px-3 py-1 rounded-full border transition-colors ${
              movementType === m.value
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-gray-600 border-gray-300 hover:border-indigo-400"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Upload area */}
      <div
        className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-indigo-400 transition-colors"
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={handleFileChange}
        />
        {loading ? (
          <div className="flex flex-col items-center gap-2 text-indigo-600">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-sm">Gemini AIが動作を解析中...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-500">
            <Upload className="w-8 h-8" />
            <p className="text-sm font-medium">動画をクリックしてアップロード</p>
            <p className="text-xs">MP4 / MOV / WebM｜4MB以内（約30秒以内）</p>
            {fileName && <p className="text-xs text-indigo-600 font-medium">{fileName}</p>}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Risk + overall score */}
          <div className="flex items-center justify-between">
            <span className={`text-sm font-medium px-3 py-1 rounded-full ${RISK_COLORS[result.riskLevel]}`}>
              {RISK_LABELS[result.riskLevel]}
            </span>
            <div className="text-right">
              <div className="text-2xl font-bold text-gray-900">{result.overallScore.toFixed(1)}</div>
              <div className="text-xs text-gray-500">総合スコア / 5</div>
            </div>
          </div>

          {/* Score bars */}
          <div className="space-y-2">
            {(Object.entries(result.scores) as [keyof typeof SCORE_LABELS, number][]).map(([key, score]) => (
              <ScoreBar key={key} score={score} label={SCORE_LABELS[key]} />
            ))}
          </div>

          {/* Findings */}
          {result.findings.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-1">所見</p>
              <ul className="space-y-1">
                {result.findings.map((f, i) => (
                  <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                    <span className="text-indigo-400 mt-0.5">•</span>{f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommendations */}
          {result.recommendations.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-1">改善推奨</p>
              <ul className="space-y-1">
                {result.recommendations.map((r, i) => (
                  <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">→</span>{r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Transfer to SOAP O field */}
          <button
            onClick={() => onObjectiveGenerated(result.objectiveNote)}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <CheckCircle className="w-4 h-4" />
            客観所見（O）に転記
          </button>
        </div>
      )}
    </div>
  );
}
