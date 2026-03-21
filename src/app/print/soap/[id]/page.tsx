"use client";

import { use } from "react";
import { mockAthletes, mockStaff } from "@/lib/mock-data";

const mockSoapNotes: Record<string, { s: string; o: string; a: string; p: string; staff_id: string; created_at: string }> = {
  "soap-1": {
    s: "左足関節外側に強い疼痛（NRS 7/10）。昨日の練習中に着地動作で受傷。荷重困難。腫脹・皮下出血あり。",
    o: "視診：外果周囲腫脹(+++)、皮下出血(+)。触診：前距腓靭帯部に圧痛(+++)。ROM：背屈-5°（健側20°）、底屈30°。前方引き出しテスト(+)、距骨傾斜テスト(+)。ACWR 1.62、HRV 42ms。",
    a: "足関節外側支持機構ストレスパターン（Grade II相当）。近位運動連鎖の問題も関与。",
    p: "①荷重禁止（HARD LOCK: ankle_impact）。②アイシング 15分×3回/日。③48時間後に荷重テスト実施。④リハビリPhase1開始：足内在筋賦活・股関節外転筋強化。⑤試合参加は最低2週間後以降に判断。",
    staff_id: "staff-2",
    created_at: "2026-03-21T10:00:00",
  },
};

export default function SoapPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const note = mockSoapNotes[id] ?? mockSoapNotes["soap-1"];
  const athlete = mockAthletes[0];
  const staff = mockStaff.find(s => s.id === note.staff_id);
  const date = new Date(note.created_at).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "2px solid #111", paddingBottom: "1rem", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: "bold", margin: 0 }}>SOAP ノート</h1>
          <p style={{ color: "#666", fontSize: "0.875rem", margin: "0.25rem 0 0" }}>PACE Platform — 医療記録</p>
        </div>
        <div style={{ textAlign: "right", fontSize: "0.875rem" }}>
          <p style={{ fontWeight: "bold", fontSize: "1.125rem", margin: 0 }}>{athlete.name}</p>
          <p style={{ color: "#555", margin: "0.25rem 0" }}>{athlete.position} / No.{athlete.number} / {athlete.age}歳</p>
          <p style={{ color: "#888", margin: "0.25rem 0" }}>作成日: {date}</p>
          <p style={{ color: "#888", margin: 0 }}>担当: {staff?.name ?? "—"} ({staff?.role})</p>
        </div>
      </div>

      {[
        { key: "S", label: "S — Subjective（主観的情報）", value: note.s, color: "#3b82f6" },
        { key: "O", label: "O — Objective（客観的情報）", value: note.o, color: "#22c55e" },
        { key: "A", label: "A — Assessment（評価）", value: note.a, color: "#f59e0b" },
        { key: "P", label: "P — Plan（計画）", value: note.p, color: "#ef4444" },
      ].map(({ key, label, value, color }) => (
        <div key={key} style={{ borderLeft: `4px solid ${color}`, paddingLeft: "1rem", marginBottom: "1.5rem" }}>
          <h2 style={{ fontWeight: "bold", fontSize: "1rem", marginBottom: "0.5rem" }}>{label}</h2>
          <p style={{ fontSize: "0.875rem", lineHeight: "1.7", margin: 0 }}>{value}</p>
        </div>
      ))}

      <div style={{ borderTop: "1px solid #ccc", paddingTop: "1rem", marginTop: "2rem" }}>
        <p style={{ fontSize: "0.75rem", color: "#999", textAlign: "center" }}>
          本記録はAI補助情報を含みます。最終的な臨床判断は担当有資格者が行っています。PACE Platform — {date}
        </p>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2rem" }}>
          {["担当者署名", "確認者署名"].map(label => (
            <div key={label} style={{ fontSize: "0.875rem" }}>
              <p style={{ borderBottom: "1px solid #666", paddingBottom: "0.25rem", marginBottom: "0.25rem", width: "12rem" }}>{label}</p>
              <p style={{ fontSize: "0.75rem", color: "#888" }}>{label === "担当者署名" ? `${staff?.name} / ${staff?.role}` : "\u00A0"}</p>
            </div>
          ))}
        </div>
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
