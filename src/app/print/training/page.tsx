"use client";

import { mockTeamWorkout } from "@/lib/mock-data";

export default function TrainingPrintPage() {
  const workout = mockTeamWorkout;
  const date = new Date(workout.generated_at).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });

  const blocks = workout.menu.reduce<Record<string, typeof workout.menu>>((acc, item) => {
    const b = item.block ?? "その他";
    if (!acc[b]) acc[b] = [];
    acc[b].push(item);
    return acc;
  }, {});

  const blockOrder = ["ウォームアップ・コレクティブ", "ストレングス", "プライオメトリクス", "コアスタビリティ", "クールダウン"];
  let idx = 0;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "2px solid #111", paddingBottom: "1rem", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: "bold", margin: 0 }}>チームトレーニングメニュー</h1>
          <p style={{ color: "#666", fontSize: "0.875rem", margin: "0.25rem 0 0" }}>PACE Platform — AI生成（有資格者確認済み）</p>
        </div>
        <div style={{ textAlign: "right", fontSize: "0.875rem" }}>
          <p style={{ fontWeight: "bold", margin: 0 }}>{date}</p>
          <p style={{ color: "#555", margin: "0.25rem 0" }}>{workout.total_duration_min}分 / {workout.menu.length}種目</p>
          <p style={{ color: "#888", margin: 0 }}>ACWR: 1.35（注意域）/ 通常比90%設定</p>
        </div>
      </div>

      {blockOrder.map(blockName => {
        const items = blocks[blockName];
        if (!items || items.length === 0) return null;
        return (
          <div key={blockName} style={{ marginBottom: "1.5rem", pageBreakInside: "avoid" }}>
            <h2 style={{ fontWeight: "bold", fontSize: "1rem", background: "#f3f4f6", padding: "0.375rem 0.75rem", borderRadius: "0.25rem", marginBottom: "0.5rem" }}>
              {blockName}
            </h2>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #d1d5db" }}>
                  <th style={{ padding: "0.25rem", textAlign: "left", color: "#6b7280", width: "1.5rem" }}>#</th>
                  <th style={{ padding: "0.25rem", textAlign: "left", color: "#6b7280" }}>種目名</th>
                  <th style={{ padding: "0.25rem", textAlign: "left", color: "#6b7280", width: "6rem" }}>量</th>
                  <th style={{ padding: "0.25rem", textAlign: "left", color: "#6b7280", width: "3.5rem" }}>RPE</th>
                  <th style={{ padding: "0.25rem", textAlign: "left", color: "#6b7280" }}>コーチングキュー</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  idx++;
                  return (
                    <tr key={item.exercise_id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "0.375rem 0.25rem", color: "#9ca3af" }}>{idx}</td>
                      <td style={{ padding: "0.375rem 0.25rem", fontWeight: "500" }}>{item.exercise_name}</td>
                      <td style={{ padding: "0.375rem 0.25rem", color: "#4b5563" }}>
                        {item.sets}×{item.reps_or_time}{item.unit === "reps" ? "回" : item.unit === "sec" ? "秒" : "分"}
                      </td>
                      <td style={{ padding: "0.375rem 0.25rem", color: "#4b5563" }}>{item.rpe ?? "—"}</td>
                      <td style={{ padding: "0.375rem 0.25rem", color: "#6b7280", fontSize: "0.75rem" }}>{item.cues ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}

      {workout.notes && (
        <div style={{ border: "1px solid #fcd34d", background: "#fffbeb", borderRadius: "0.25rem", padding: "0.75rem", marginBottom: "1rem" }}>
          <p style={{ fontWeight: "bold", fontSize: "0.875rem", marginBottom: "0.25rem" }}>個別調整・注意事項</p>
          <p style={{ fontSize: "0.875rem", lineHeight: "1.6", margin: 0 }}>{workout.notes}</p>
        </div>
      )}

      <div style={{ borderTop: "1px solid #d1d5db", paddingTop: "0.75rem", marginTop: "1.5rem" }}>
        <p style={{ fontSize: "0.75rem", color: "#9ca3af", textAlign: "center" }}>
          PACE Platform — AIによる生成メニュー — {date} — 担当S&Cコーチ確認済み
        </p>
      </div>

      <div className="print:hidden" style={{ position: "fixed", bottom: "1.5rem", right: "1.5rem" }}>
        <button
          onClick={() => window.print()}
          style={{ padding: "0.75rem 1.5rem", background: "#16a34a", color: "white", fontWeight: "600", borderRadius: "0.5rem", border: "none", cursor: "pointer", fontSize: "1rem" }}
        >
          印刷 / PDF保存
        </button>
      </div>
    </div>
  );
}
