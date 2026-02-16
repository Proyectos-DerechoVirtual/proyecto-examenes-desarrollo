-- Primero, asegúrate de que la extensión pgvector esté habilitada
CREATE EXTENSION IF NOT EXISTS vector;

-- Crear tabla examen_preguntas con embeddings vectoriales
CREATE TABLE IF NOT EXISTS public.examen_preguntas (
  id SERIAL PRIMARY KEY,
  pregunta TEXT NOT NULL,
  embedding_pregunta vector(1536), -- Embedding de la pregunta (text-embedding-3-small)
  respuesta_correcta TEXT NOT NULL, -- Respuesta modelo correcta
  embedding_respuesta vector(1536), -- Embedding de la respuesta correcta
  tema INTEGER NOT NULL,
  categoria TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  source_file TEXT,
  manual TEXT,
  CONSTRAINT examen_preguntas_tema_check CHECK (tema > 0)
) TABLESPACE pg_default;

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_examen_preguntas_tema ON public.examen_preguntas(tema);
CREATE INDEX IF NOT EXISTS idx_examen_preguntas_categoria ON public.examen_preguntas(categoria);
CREATE INDEX IF NOT EXISTS idx_examen_preguntas_created_at ON public.examen_preguntas(created_at DESC);

-- Índices vectoriales para similaridad (usando HNSW - más rápido)
CREATE INDEX IF NOT EXISTS idx_examen_preguntas_embedding_pregunta
  ON public.examen_preguntas
  USING hnsw (embedding_pregunta vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_examen_preguntas_embedding_respuesta
  ON public.examen_preguntas
  USING hnsw (embedding_respuesta vector_cosine_ops);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.examen_preguntas ENABLE ROW LEVEL SECURITY;

-- Política para lectura pública (cualquiera puede leer las preguntas)
CREATE POLICY "Allow public read access"
  ON public.examen_preguntas
  FOR SELECT
  USING (true);

-- Política para inserción (solo usuarios autenticados o service role)
CREATE POLICY "Allow authenticated insert"
  ON public.examen_preguntas
  FOR INSERT
  WITH CHECK (true);

-- Comentarios para documentación
COMMENT ON TABLE public.examen_preguntas IS 'Banco de preguntas con embeddings para evaluación por similaridad vectorial';
COMMENT ON COLUMN public.examen_preguntas.embedding_pregunta IS 'Vector embedding de la pregunta usando text-embedding-3-small (1536 dimensiones)';
COMMENT ON COLUMN public.examen_preguntas.embedding_respuesta IS 'Vector embedding de la respuesta correcta para comparación con respuestas de estudiantes';
COMMENT ON COLUMN public.examen_preguntas.respuesta_correcta IS 'Respuesta modelo ideal para la pregunta';
