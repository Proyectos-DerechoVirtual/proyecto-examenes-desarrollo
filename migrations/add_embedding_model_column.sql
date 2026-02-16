-- Agregar columna embedding_model a la tabla examen_preguntas
-- Esta columna rastrea qué modelo de embeddings se usó para cada pregunta

ALTER TABLE public.examen_preguntas
ADD COLUMN IF NOT EXISTS embedding_model text NULL DEFAULT 'text-embedding-3-large';

-- Crear índice para facilitar consultas por modelo
CREATE INDEX IF NOT EXISTS idx_examen_preguntas_embedding_model
ON public.examen_preguntas USING btree (embedding_model)
TABLESPACE pg_default;

-- Comentario para documentar la columna
COMMENT ON COLUMN public.examen_preguntas.embedding_model IS 'Modelo de OpenAI usado para generar los embeddings (ej: text-embedding-3-large, text-embedding-3-small)';
