-- Migración: Actualizar embeddings de 1536 a 3072 dimensiones
-- Esto permite usar text-embedding-3-large en lugar de text-embedding-3-small
-- ¡IMPORTANTE! Esta migración eliminará datos existentes en las columnas de embeddings

BEGIN;

-- 1. Eliminar índices existentes de embeddings
DROP INDEX IF EXISTS idx_examen_preguntas_embedding_pregunta;
DROP INDEX IF EXISTS idx_examen_preguntas_embedding_respuesta;

-- 2. Eliminar columnas antiguas (1536 dimensiones)
ALTER TABLE public.examen_preguntas
DROP COLUMN IF EXISTS embedding_pregunta,
DROP COLUMN IF EXISTS embedding_respuesta;

-- 3. Crear nuevas columnas con 3072 dimensiones
ALTER TABLE public.examen_preguntas
ADD COLUMN embedding_pregunta vector(3072) NULL,
ADD COLUMN embedding_respuesta vector(3072) NULL;

-- 4. Agregar columna embedding_model si no existe
ALTER TABLE public.examen_preguntas
ADD COLUMN IF NOT EXISTS embedding_model text NULL DEFAULT 'text-embedding-3-large';

-- 5. NO crear índices vectoriales para 3072 dimensiones
-- IMPORTANTE: pgvector tiene límite de 2000 dimensiones para índices HNSW/IVFFlat
-- Solución: Usar búsqueda secuencial + filtros de metadata (tema, bloque, manual)
-- Con ~2,500 preguntas, la búsqueda secuencial será rápida (100-300ms)

-- Los índices de metadata (tema, bloque, manual) ya existen y son suficientes
-- para optimizar las búsquedas mediante filtrado previo

-- 6. Agregar índice para embedding_model
CREATE INDEX IF NOT EXISTS idx_examen_preguntas_embedding_model
ON public.examen_preguntas USING btree (embedding_model);

-- 7. Comentarios para documentación
COMMENT ON COLUMN public.examen_preguntas.embedding_pregunta IS 'Vector embedding de la pregunta (3072 dimensiones - text-embedding-3-large)';
COMMENT ON COLUMN public.examen_preguntas.embedding_respuesta IS 'Vector embedding de la respuesta correcta (3072 dimensiones - text-embedding-3-large)';
COMMENT ON COLUMN public.examen_preguntas.embedding_model IS 'Modelo de OpenAI usado para generar los embeddings (ej: text-embedding-3-large)';

COMMIT;

-- Verificar la migración
SELECT
  column_name,
  data_type,
  character_maximum_length
FROM information_schema.columns
WHERE table_name = 'examen_preguntas'
  AND column_name LIKE '%embedding%';
