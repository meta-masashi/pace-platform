-- MASTER-SPEC M4: Hard Lock condition
-- ACWR > 1.5 must set hard_lock = true (in addition to NRS >= 7)
-- Reference: MASTER-SPEC M4 "Hard Lock: ACWR>1.5 で強度制限"

UPDATE public.daily_metrics
SET hard_lock = true
WHERE acwr > 1.5
  AND (hard_lock IS NULL OR hard_lock = false);

-- Future trigger: ensure new rows also enforce this rule
-- (Application-layer enforcement via /api/v6/inference already handles this;
--  this migration backfills existing data)
