-- MASTER-SPEC M4: Hard Lock condition
-- ACWR > 1.5 must set hard_lock = true (in addition to NRS >= 7)
-- Reference: MASTER-SPEC M4 "Hard Lock: ACWR>1.5 で強度制限"

-- hard_lock カラムが存在する場合のみバックフィル実行
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'daily_metrics' AND column_name = 'hard_lock'
  ) THEN
    UPDATE public.daily_metrics
    SET hard_lock = true
    WHERE acwr > 1.5
      AND (hard_lock IS NULL OR hard_lock = false);
  END IF;
END $$;

-- Future trigger: ensure new rows also enforce this rule
-- (Application-layer enforcement via /api/v6/inference already handles this;
--  this migration backfills existing data)
