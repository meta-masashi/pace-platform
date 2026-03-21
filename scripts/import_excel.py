#!/usr/bin/env python3
"""
PACE Platform - Excel Import Script
Reads Excel assessment/exercise files and upserts data to Supabase.

Usage:
    python import_excel.py --dry-run   # Preview what would be imported
    python import_excel.py             # Import to Supabase
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

import openpyxl
from dotenv import load_dotenv

# Load .env from project root (two levels up from scripts/)
load_dotenv(Path(__file__).parent.parent / ".env")
load_dotenv(Path(__file__).parent / ".env")  # also check scripts/.env

# -----------------------------------------------------------------------
# Config
# -----------------------------------------------------------------------

# Excel files live one level above this script's parent (i.e., the Desktop folder)
EXCEL_DIR = Path(__file__).parent.parent.parent

ASSESSMENT_FILES = {
    "F1_Acute": "PACE_F1_Acute_FULL.xlsx",
    "F2_Chronic": "PACE_F2_Chronic_FULL.xlsx",
    "F3_Performance": "PACE_F3_Performance_FULL.xlsx",
}

RTP_FILE = "RTP_injury_specific_nodes_v2.2のコピー.xlsx"
MC_FILE = "MC_tracking_nodes_v1.0のコピー.xlsx"
EXERCISE_FILE = "PACE_exercise_db_v3のコピー.xlsx"

# -----------------------------------------------------------------------
# Column aliases  (lower-case stripped key → canonical name)
# -----------------------------------------------------------------------

ASSESSMENT_COL_ALIASES: dict[str, str] = {
    # node_id variants
    "node_id": "node_id",
    "nodeid": "node_id",
    "id": "node_id",
    "node": "node_id",
    # phase
    "phase": "phase",
    # category
    "category": "category",
    "cat": "category",
    # question_text
    "question_text": "question_text",
    "question": "question_text",
    "text": "question_text",
    "item": "question_text",
    "content": "question_text",
    "質問": "question_text",
    # target_axis
    "target_axis": "target_axis",
    "axis": "target_axis",
    # lr_yes
    "lr_yes": "lr_yes",
    "lr+": "lr_yes",
    "lryes": "lr_yes",
    "lr_positive": "lr_yes",
    # lr_no
    "lr_no": "lr_no",
    "lr-": "lr_no",
    "lrno": "lr_no",
    "lr_negative": "lr_no",
    # kappa
    "kappa": "kappa",
    "cohen_kappa": "kappa",
    "inter_rater": "kappa",
    # routing_rules
    "routing_rules": "routing_rules",
    "routing": "routing_rules",
    "routes": "routing_rules",
    "next": "routing_rules",
    # prescription_tags
    "prescription_tags": "prescription_tags",
    "prescription": "prescription_tags",
    "rx_tags": "prescription_tags",
    "tags": "prescription_tags",
    # contraindication_tags
    "contraindication_tags": "contraindication_tags",
    "contraindications": "contraindication_tags",
    "ci_tags": "contraindication_tags",
    "contra": "contraindication_tags",
    # time_decay_lambda
    "time_decay_lambda": "time_decay_lambda",
    "lambda": "time_decay_lambda",
    "decay": "time_decay_lambda",
    "time_decay": "time_decay_lambda",
}

EXERCISE_COL_ALIASES: dict[str, str] = {
    # name
    "name_ja": "name_ja",
    "name": "name_ja",
    "exercise_name": "name_ja",
    "種目": "name_ja",
    "種目名": "name_ja",
    "エクササイズ名": "name_ja",
    "エクサイズ名": "name_ja",
    "exercise": "name_ja",
    # phase
    "phase": "phase",
    "フェーズ": "phase",
    "phase_no": "phase",
    # sets
    "sets": "sets",
    "set": "sets",
    "セット": "sets",
    "セット数": "sets",
    # reps
    "reps": "reps",
    "rep": "reps",
    "回数": "reps",
    "レップ": "reps",
    "回": "reps",
    # time_sec
    "time_sec": "time_sec",
    "time": "time_sec",
    "duration": "time_sec",
    "秒": "time_sec",
    "時間": "time_sec",
    "秒数": "time_sec",
    # rpe
    "rpe": "rpe",
    "強度": "rpe",
    # percent_1rm
    "percent_1rm": "percent_1rm",
    "%1rm": "percent_1rm",
    "1rm%": "percent_1rm",
    "%_1rm": "percent_1rm",
    # cues
    "cues": "cues",
    "cue": "cues",
    "coaching_cue": "cues",
    "コーチングキュー": "cues",
    "キュー": "cues",
    "ポイント": "cues",
    "実施ポイント": "cues",
    # progressions
    "progressions": "progressions",
    "progression": "progressions",
    "発展": "progressions",
    "バリエーション": "progressions",
    # contraindication_tags
    "contraindication_tags": "contraindication_tags",
    "contraindications": "contraindication_tags",
    "ci": "contraindication_tags",
    "禁忌タグ": "contraindication_tags",
    "禁忌": "contraindication_tags",
    # target axis (normalized: 対象軸/部位 -> 対象軸_部位)
    "target_axis": "target_axis",
    "axis": "target_axis",
    "部位": "target_axis",
    "対象部位": "target_axis",
    "対象軸_部位": "target_axis",
    "対象軸": "target_axis",
    # reps or time (回数/時間 -> 回数_時間)
    "回数_時間": "reps",
    "回数・時間": "reps",
    # percent_1rm (RM目安)
    "rm目安": "percent_1rm",
    "rm_目安": "percent_1rm",
    # cues (主要キュー・実施ポイント -> 主要キュー_実施ポイント)
    "主要キュー_実施ポイント": "cues",
    "主要キュー・実施ポイント": "cues",
    "主要キュー": "cues",
    # progressions (進行・バリエーション -> 進行_バリエーション)
    "進行_バリエーション": "progressions",
    "進行・バリエーション": "progressions",
    "バリエーション": "progressions",
}

RTP_COL_ALIASES: dict[str, str] = {
    "node_id": "node_id",
    "id": "node_id",
    "phase": "phase",
    "gate_criteria": "gate_criteria",
    "criteria": "gate_criteria",
    "gate": "gate_criteria",
    "lsi_target": "lsi_target",
    "lsi": "lsi_target",
    "test_battery": "test_battery",
    "tests": "test_battery",
    "battery": "test_battery",
    "injury_type": "injury_type",
    "injury": "injury_type",
}

# -----------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------


def _normalize_key(raw: Any) -> str:
    """Strip, lower, replace spaces/special chars for alias matching."""
    if raw is None:
        return ""
    import re
    s = str(raw).strip().lower()
    # Normalize separators (space, /, ・, 　) to underscore
    s = re.sub(r"[/・\s　]+", "_", s)
    return s.strip("_")


def _map_headers(header_row: list[Any], alias_map: dict[str, str]) -> dict[int, str]:
    """
    Return {col_index: canonical_name} for the first matching alias in each cell.
    Unrecognized columns are skipped.
    """
    mapping: dict[int, str] = {}
    for idx, cell_val in enumerate(header_row):
        key = _normalize_key(cell_val)
        if key in alias_map:
            canonical = alias_map[key]
            # first occurrence wins
            if canonical not in mapping.values():
                mapping[idx] = canonical
    return mapping


def _cell_str(cell_val: Any) -> str:
    if cell_val is None:
        return ""
    return str(cell_val).strip()


def _parse_json_list(raw: Any) -> list[str]:
    """Try JSON parse; fall back to comma-split string."""
    if raw is None:
        return []
    s = str(raw).strip()
    if not s:
        return []
    try:
        parsed = json.loads(s)
        if isinstance(parsed, list):
            return [str(x) for x in parsed]
        return [str(parsed)]
    except (json.JSONDecodeError, ValueError):
        return [x.strip() for x in s.split(",") if x.strip()]


def _parse_float(raw: Any) -> float | None:
    if raw is None:
        return None
    try:
        return float(raw)
    except (ValueError, TypeError):
        return None


def _parse_int(raw: Any) -> int | None:
    v = _parse_float(raw)
    return int(v) if v is not None else None


def _open_workbook(path: Path) -> openpyxl.Workbook | None:
    try:
        wb = openpyxl.load_workbook(str(path), read_only=True, data_only=True)
        return wb
    except FileNotFoundError:
        print(f"  [WARN] File not found: {path}")
        return None
    except Exception as exc:
        print(f"  [WARN] Could not open {path.name}: {exc}")
        return None


# -----------------------------------------------------------------------
# Parsers
# -----------------------------------------------------------------------


def _phase_from_sheet_name(sheet_name: str) -> str:
    """Derive a phase label from the sheet name prefix (e.g. '1_RF_RedFlag' -> 'RedFlag')."""
    name = sheet_name.strip()
    # Strip leading number prefix like "1_" or "01_"
    import re
    m = re.match(r"^\d+_(.+)$", name)
    if m:
        remainder = m.group(1)
        # Return first segment before underscore as phase label
        return remainder.split("_")[0]
    return name[:20]  # fallback: truncate sheet name


def parse_assessment_sheet(
    ws: openpyxl.worksheet.worksheet.Worksheet,
    file_type: str,
) -> list[dict[str, Any]]:
    """
    Parse one sheet from an assessment workbook.
    Returns a list of row dicts ready for upserting.
    """
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return []

    # Find header row: first row with >=3 non-empty cells
    header_idx = 0
    for i, row in enumerate(rows):
        non_empty = sum(1 for c in row if c is not None and str(c).strip())
        if non_empty >= 3:
            header_idx = i
            break

    header_row = [c for c in rows[header_idx]]
    col_map = _map_headers(header_row, ASSESSMENT_COL_ALIASES)

    if not col_map:
        return []

    records: list[dict[str, Any]] = []
    for row in rows[header_idx + 1:]:
        # Skip blank rows
        if all(c is None or str(c).strip() == "" for c in row):
            continue

        rec: dict[str, Any] = {"file_type": file_type}
        for col_idx, canonical in col_map.items():
            if col_idx >= len(row):
                continue
            raw = row[col_idx]
            if canonical in ("routing_rules", "prescription_tags", "contraindication_tags"):
                rec[canonical] = _parse_json_list(raw)
            elif canonical in ("lr_yes", "lr_no", "kappa", "time_decay_lambda"):
                rec[canonical] = _parse_float(raw)
            else:
                rec[canonical] = _cell_str(raw)

        # Must have at least a node_id or question_text
        if not rec.get("node_id") and not rec.get("question_text"):
            continue

        # Ensure node_id exists (generate a fallback)
        if not rec.get("node_id"):
            rec["node_id"] = f"{file_type}_{ws.title}_{len(records)+1}"

        # Derive phase from sheet name if not set
        if not rec.get("phase"):
            rec["phase"] = _phase_from_sheet_name(ws.title)

        # Ensure question_text is not null
        if not rec.get("question_text"):
            rec["question_text"] = rec.get("node_id", "")

        records.append(rec)

    return records


def parse_exercise_sheet(
    ws: openpyxl.worksheet.worksheet.Worksheet,
    category: str,
) -> list[dict[str, Any]]:
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return []

    header_idx = 0
    for i, row in enumerate(rows):
        non_empty = sum(1 for c in row if c is not None and str(c).strip())
        if non_empty >= 2:
            header_idx = i
            break

    header_row = list(rows[header_idx])
    col_map = _map_headers(header_row, EXERCISE_COL_ALIASES)

    if not col_map:
        return []

    records: list[dict[str, Any]] = []
    for row in rows[header_idx + 1:]:
        if all(c is None or str(c).strip() == "" for c in row):
            continue

        rec: dict[str, Any] = {"category": category}
        for col_idx, canonical in col_map.items():
            if col_idx >= len(row):
                continue
            raw = row[col_idx]
            # Skip internal-only alias mappings
            if canonical == "category_col":
                continue
            if canonical == "contraindication_tags":
                rec[canonical] = _parse_json_list(raw)
            elif canonical in ("sets", "reps", "time_sec"):
                rec[canonical] = _parse_int(raw)
            elif canonical in ("rpe", "percent_1rm"):
                rec[canonical] = _parse_float(raw)
            else:
                rec[canonical] = _cell_str(raw)

        if not rec.get("name_ja"):
            continue

        # Ensure phase is set
        if not rec.get("phase"):
            rec["phase"] = "1"

        records.append(rec)

    return records


def parse_rtp_sheet(
    ws: openpyxl.worksheet.worksheet.Worksheet,
    injury_type: str,
) -> list[dict[str, Any]]:
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return []

    header_idx = 0
    for i, row in enumerate(rows):
        non_empty = sum(1 for c in row if c is not None and str(c).strip())
        if non_empty >= 2:
            header_idx = i
            break

    header_row = list(rows[header_idx])
    col_map = _map_headers(header_row, RTP_COL_ALIASES)

    if not col_map:
        return []

    records: list[dict[str, Any]] = []
    for row in rows[header_idx + 1:]:
        if all(c is None or str(c).strip() == "" for c in row):
            continue

        rec: dict[str, Any] = {"injury_type": injury_type}
        for col_idx, canonical in col_map.items():
            if col_idx >= len(row):
                continue
            raw = row[col_idx]
            if canonical == "gate_criteria":
                # Try to parse as JSON dict; fall back to string
                if raw is None:
                    rec[canonical] = {}
                else:
                    s = str(raw).strip()
                    try:
                        parsed = json.loads(s)
                        rec[canonical] = parsed if isinstance(parsed, dict) else {"raw": s}
                    except (json.JSONDecodeError, ValueError):
                        rec[canonical] = {"raw": s}
            elif canonical == "test_battery":
                rec[canonical] = _parse_json_list(raw)
            elif canonical == "lsi_target":
                rec[canonical] = _parse_float(raw)
            elif canonical == "phase":
                rec[canonical] = _parse_int(raw)
            else:
                rec[canonical] = _cell_str(raw)

        if not rec.get("node_id"):
            rec["node_id"] = f"{injury_type}_{len(records)+1}"

        # Default phase to 1 if not parsed
        if not rec.get("phase"):
            rec["phase"] = 1

        records.append(rec)

    return records


# -----------------------------------------------------------------------
# Supabase upsert
# -----------------------------------------------------------------------


def get_supabase_client():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("[ERROR] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.")
        print("        Copy .env.example to .env or export them as environment variables.")
        sys.exit(1)
    from supabase import create_client
    return create_client(url, key)


def upsert_records(
    client,
    table: str,
    records: list[dict[str, Any]],
    conflict_column: str,
    dry_run: bool,
) -> None:
    if not records:
        return
    if dry_run:
        print(f"    [DRY-RUN] Would upsert {len(records)} rows to '{table}'")
        for r in records[:3]:
            print(f"      {r}")
        if len(records) > 3:
            print(f"      ... and {len(records) - 3} more")
        return

    try:
        client.table(table).upsert(records, on_conflict=conflict_column).execute()
    except Exception as exc:
        print(f"    [ERROR] Upsert to '{table}' failed: {exc}")


# -----------------------------------------------------------------------
# Import routines
# -----------------------------------------------------------------------


def import_assessment_files(client, dry_run: bool) -> None:
    for label, filename in ASSESSMENT_FILES.items():
        path = EXCEL_DIR / filename
        print(f"\nImporting {label} from '{filename}'...")
        wb = _open_workbook(path)
        if wb is None:
            continue

        for sheet_name in wb.sheetnames:
            try:
                ws = wb[sheet_name]
                records = parse_assessment_sheet(ws, label)
                print(f"  Sheet '{sheet_name}'... {len(records)} nodes")
                upsert_records(client, "assessment_nodes", records, "node_id", dry_run)
            except Exception as exc:
                print(f"  [ERROR] Sheet '{sheet_name}': {exc}")

        wb.close()


def import_exercise_file(client, dry_run: bool) -> None:
    path = EXCEL_DIR / EXERCISE_FILE
    print(f"\nImporting Exercise DB from '{EXERCISE_FILE}'...")
    wb = _open_workbook(path)
    if wb is None:
        return

    for sheet_name in wb.sheetnames:
        try:
            ws = wb[sheet_name]
            records = parse_exercise_sheet(ws, sheet_name)
            print(f"  Sheet '{sheet_name}'... {len(records)} exercises")
            upsert_records(client, "exercises", records, "id", dry_run)
        except Exception as exc:
            print(f"  [ERROR] Sheet '{sheet_name}': {exc}")

    wb.close()


def import_rtp_file(client, dry_run: bool) -> None:
    path = EXCEL_DIR / RTP_FILE
    print(f"\nImporting RTP nodes from '{RTP_FILE}'...")
    wb = _open_workbook(path)
    if wb is None:
        return

    for sheet_name in wb.sheetnames:
        try:
            ws = wb[sheet_name]
            records = parse_rtp_sheet(ws, sheet_name)
            print(f"  Sheet '{sheet_name}'... {len(records)} RTP nodes")
            upsert_records(client, "rtp_injury_nodes", records, "node_id", dry_run)
        except Exception as exc:
            print(f"  [ERROR] Sheet '{sheet_name}': {exc}")

    wb.close()


def import_mc_file(client, dry_run: bool) -> None:
    """MC tracking nodes - treated similarly to assessment nodes."""
    path = EXCEL_DIR / MC_FILE
    print(f"\nImporting MC Tracking nodes from '{MC_FILE}'...")
    wb = _open_workbook(path)
    if wb is None:
        return

    for sheet_name in wb.sheetnames:
        try:
            ws = wb[sheet_name]
            records = parse_assessment_sheet(ws, "F1_Acute")  # MC uses F1_Acute type; stored with MC_ prefix node_ids
            print(f"  Sheet '{sheet_name}'... {len(records)} nodes")
            upsert_records(client, "assessment_nodes", records, "node_id", dry_run)
        except Exception as exc:
            print(f"  [ERROR] Sheet '{sheet_name}': {exc}")

    wb.close()


# -----------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description="Import PACE Excel files into Supabase")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview what would be imported without writing to Supabase",
    )
    parser.add_argument(
        "--only",
        choices=["assessment", "exercises", "rtp", "mc"],
        help="Import only one category (default: all)",
    )
    args = parser.parse_args()

    if args.dry_run:
        print("=" * 60)
        print("DRY-RUN MODE — no data will be written to Supabase")
        print("=" * 60)
        client = None
    else:
        client = get_supabase_client()

    only = args.only

    if only is None or only == "assessment":
        import_assessment_files(client, args.dry_run)

    if only is None or only == "mc":
        import_mc_file(client, args.dry_run)

    if only is None or only == "exercises":
        import_exercise_file(client, args.dry_run)

    if only is None or only == "rtp":
        import_rtp_file(client, args.dry_run)

    print("\nDone.")


if __name__ == "__main__":
    main()
