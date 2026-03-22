-- ============================================================
-- Doctor Approval Workflow for Rehabilitation Programs
-- ============================================================
-- Adds diagnosis approval fields to rehab_programs:
-- - approval_status: pending / approved / rejected
-- - doctor_name: diagnosing physician's name
-- - doctor_institution: hospital / clinic name
-- - approved_by: staff_id of approving staff (master role)
-- - approved_at: timestamp of approval
-- - diagnosis_document_url: uploaded diagnosis document (PDF/image)
-- - diagnosis_confirmed_at: date doctor confirmed the diagnosis
-- ============================================================

ALTER TABLE public.rehab_programs
  ADD COLUMN IF NOT EXISTS approval_status     TEXT        NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS doctor_name         TEXT,
  ADD COLUMN IF NOT EXISTS doctor_institution  TEXT,
  ADD COLUMN IF NOT EXISTS approved_by         UUID        REFERENCES public.staff(id),
  ADD COLUMN IF NOT EXISTS approved_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS diagnosis_document_url TEXT,
  ADD COLUMN IF NOT EXISTS diagnosis_confirmed_at DATE,
  ADD COLUMN IF NOT EXISTS rejection_reason    TEXT;

-- Index for filtering by approval status
CREATE INDEX IF NOT EXISTS idx_rehab_programs_approval_status
  ON public.rehab_programs(approval_status);

-- ---- Supabase Storage bucket for diagnosis documents ----
-- Run this in Storage settings or via the Dashboard:
-- Bucket name: diagnosis-documents
-- Public: false (private, accessed via signed URL)
-- File size limit: 10MB
-- Allowed MIME types: application/pdf, image/jpeg, image/png

-- ---- Update existing rehab programs to approved status ----
-- (Seeded data is already known to be from doctor diagnosis)
UPDATE public.rehab_programs
SET approval_status = 'approved',
    doctor_name = '主治医',
    approved_at = created_at
WHERE approval_status = 'pending';

-- ---- View: approved rehab programs only ----
CREATE OR REPLACE VIEW public.approved_rehab_programs AS
SELECT * FROM public.rehab_programs
WHERE approval_status = 'approved';

COMMENT ON TABLE public.rehab_programs IS
  'Rehabilitation programs — diagnosis display requires doctor_approval_status=approved';
COMMENT ON COLUMN public.rehab_programs.approval_status IS
  'pending=awaiting doctor approval, approved=diagnosis confirmed, rejected=not accepted';
COMMENT ON COLUMN public.rehab_programs.diagnosis_document_url IS
  'Supabase Storage URL to uploaded diagnosis document (PDF/image)';
