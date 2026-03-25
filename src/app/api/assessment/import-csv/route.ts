import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface CsvRow {
  node_id: string;
  category: string;
  question_text: string;
  lr_yes: number;
  lr_yes_clinical?: number;
  lr_no?: number;
  prescription_tags?: string;
  contraindication_tags?: string;
  evidence_text?: string;
  target_axis?: string;
  file_type?: string;
  routing_rules?: string;
  time_decay_lambda?: number;
  half_life_days?: number;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseTags(tagStr?: string): string[] {
  if (!tagStr) return [];
  return tagStr
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * POST /api/assessment/import-csv
 * Body: { csv: string } — raw CSV text
 * Returns: { imported: number, errors: string[] }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: staff } = await supabase
    .from("staff")
    .select("id, organization_id, role")
    .eq("auth_user_id", user.id)
    .single();

  if (!staff) {
    return NextResponse.json({ error: "Staff not found" }, { status: 404 });
  }

  // Only Doctor, AT, PT can import
  if (!["master", "AT", "PT"].includes(staff.role ?? "")) {
    return NextResponse.json({ error: "Insufficient role" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const csvText: string = body.csv;

    if (!csvText) {
      return NextResponse.json(
        { error: "csv field required" },
        { status: 400 }
      );
    }

    const lines = csvText.split("\n").filter((l) => l.trim());
    if (lines.length < 2) {
      return NextResponse.json(
        { error: "CSV must have header + at least one data row" },
        { status: 400 }
      );
    }

    const headers = parseCsvLine(lines[0]).map((h) =>
      h.toLowerCase().replace(/\s+/g, "_")
    );
    const errors: string[] = [];
    const rows: CsvRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCsvLine(lines[i]);
      if (values.length < 4) {
        errors.push(`行 ${i + 1}: カラム不足`);
        continue;
      }

      const record: Record<string, string> = {};
      headers.forEach((h, idx) => {
        record[h] = values[idx] ?? "";
      });

      const nodeId = record.node_id;
      const lrYes = parseFloat(record.lr_yes ?? record.lr_yes_sr ?? "0");

      if (!nodeId || isNaN(lrYes)) {
        errors.push(`行 ${i + 1}: node_id または lr_yes が不正`);
        continue;
      }

      rows.push({
        node_id: nodeId,
        category: record.category ?? "",
        question_text: record.question_text ?? "",
        lr_yes: lrYes,
        lr_yes_clinical: parseFloat(record.lr_yes_clinical ?? record.lr_yes ?? "0"),
        lr_no: parseFloat(record.lr_no ?? "1"),
        prescription_tags: record.prescription_tags,
        contraindication_tags: record.contraindication_tags,
        evidence_text: record.evidence_text,
        target_axis: record.target_axis,
        file_type: record.file_type,
        routing_rules: record.routing_rules,
        time_decay_lambda: parseFloat(record.time_decay_lambda ?? "0") || undefined,
        half_life_days: parseFloat(record.half_life_days ?? "0") || undefined,
      });
    }

    // Batch insert into assessment_nodes
    let imported = 0;
    for (const row of rows) {
      const { error } = await supabase.from("assessment_nodes").upsert(
        {
          node_id: row.node_id,
          organization_id: staff.organization_id,
          category: row.category,
          question_text: row.question_text,
          lr_yes: row.lr_yes,
          lr_no: row.lr_no ?? 1,
          prescription_tags: parseTags(row.prescription_tags),
          contraindication_tags: parseTags(row.contraindication_tags),
          evidence_text: row.evidence_text ?? "",
          target_axis: row.target_axis ?? "general",
          file_type: row.file_type ?? "F1",
          routing_rules: parseTags(row.routing_rules),
        },
        { onConflict: "node_id,organization_id" }
      );

      if (error) {
        errors.push(`${row.node_id}: ${error.message}`);
      } else {
        imported++;
      }
    }

    return NextResponse.json({
      imported,
      total_rows: rows.length,
      errors,
    });
  } catch (err) {
    console.error("CSV import error:", err);
    return NextResponse.json(
      { error: "Failed to process CSV" },
      { status: 500 }
    );
  }
}
