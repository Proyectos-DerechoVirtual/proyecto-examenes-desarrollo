-- Migration: Add course_id column to tables
-- Date: December 2025
-- Purpose: Allow distinguishing manuals by course_id even if the name changes
-- New file format: "Preguntas Manual Arbitraje-2518286.txt" -> course_id = "2518286"

-- =====================================================
-- 1. Add course_id to examen_preguntas
-- =====================================================
ALTER TABLE public.examen_preguntas
ADD COLUMN IF NOT EXISTS course_id TEXT NULL;

-- Create index for faster lookups by course_id
CREATE INDEX IF NOT EXISTS idx_examen_preguntas_course_id
ON public.examen_preguntas USING btree (course_id) TABLESPACE pg_default;

-- Create composite index for manual + course_id (common query pattern)
CREATE INDEX IF NOT EXISTS idx_examen_preguntas_manual_course_id
ON public.examen_preguntas USING btree (manual, course_id) TABLESPACE pg_default;

COMMENT ON COLUMN public.examen_preguntas.course_id IS 'Teachable course ID extracted from filename (e.g., "2518286" from "Preguntas Manual Arbitraje-2518286.txt")';

-- =====================================================
-- 2. Add course_id to examen_results
-- =====================================================
ALTER TABLE public.examen_results
ADD COLUMN IF NOT EXISTS course_id TEXT NULL;

-- Create index for filtering results by course_id
CREATE INDEX IF NOT EXISTS idx_examen_results_course_id
ON public.examen_results USING btree (course_id) TABLESPACE pg_default;

COMMENT ON COLUMN public.examen_results.course_id IS 'Teachable course ID for tracking results per course';

-- =====================================================
-- 3. Add course_id to storage_sync_tracking
-- =====================================================
ALTER TABLE public.storage_sync_tracking
ADD COLUMN IF NOT EXISTS course_id TEXT NULL;

-- Create index for tracking by course_id
CREATE INDEX IF NOT EXISTS idx_storage_sync_tracking_course_id
ON public.storage_sync_tracking USING btree (course_id) TABLESPACE pg_default;

COMMENT ON COLUMN public.storage_sync_tracking.course_id IS 'Teachable course ID extracted from the synced file';

-- =====================================================
-- Verification queries (run after migration)
-- =====================================================
-- Check that columns were added:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name IN ('examen_preguntas', 'examen_results', 'storage_sync_tracking')
-- AND column_name = 'course_id';

-- Check indexes were created:
-- SELECT indexname FROM pg_indexes
-- WHERE tablename IN ('examen_preguntas', 'examen_results', 'storage_sync_tracking')
-- AND indexname LIKE '%course_id%';
