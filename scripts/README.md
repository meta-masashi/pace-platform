# PACE Excel Import Script

Reads all PACE Excel files from the parent directory and upserts records into Supabase.

## Setup

```bash
cd pace-platform/scripts
pip install -r requirements.txt
```

## Environment Variables

Set these in a `.env` file at the project root (`pace-platform/.env`) or export them:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

> Use the **service role** key (not the anon key) so RLS is bypassed during import.

## Usage

```bash
# Preview what would be imported (no DB writes)
python import_excel.py --dry-run

# Import everything to Supabase
python import_excel.py

# Import only one category
python import_excel.py --only assessment
python import_excel.py --only exercises
python import_excel.py --only rtp
python import_excel.py --only mc
```

## Expected Excel Files

These files must exist in the directory one level above `pace-platform/`:

| File | Description | Target Table |
|------|-------------|--------------|
| `PACE_F1_Acute_FULL.xlsx` | Acute assessment nodes | `assessment_nodes` |
| `PACE_F2_Chronic_FULL.xlsx` | Chronic assessment nodes | `assessment_nodes` |
| `PACE_F3_Performance_FULL.xlsx` | Performance assessment nodes | `assessment_nodes` |
| `RTP_injury_specific_nodes_v2.2のコピー.xlsx` | Return-to-play nodes | `rtp_injury_nodes` |
| `MC_tracking_nodes_v1.0のコピー.xlsx` | MC tracking nodes | `assessment_nodes` |
| `PACE_exercise_db_v3のコピー.xlsx` | Exercise database | `exercises` |

## Column Detection

The script uses flexible header detection with aliases for common column name variations. Missing columns are skipped gracefully — no crash on partial data.

For assessment files, these canonical columns are extracted:
`node_id`, `phase`, `category`, `question_text`, `target_axis`, `lr_yes`, `lr_no`, `kappa`, `routing_rules`, `prescription_tags`, `contraindication_tags`, `time_decay_lambda`

For exercises:
`category` (sheet name), `phase`, `name_ja`, `sets`, `reps`, `time_sec`, `rpe`, `percent_1rm`, `cues`, `progressions`, `contraindication_tags`

For RTP nodes:
`node_id`, `injury_type` (sheet name), `phase`, `gate_criteria`, `lsi_target`, `test_battery`
