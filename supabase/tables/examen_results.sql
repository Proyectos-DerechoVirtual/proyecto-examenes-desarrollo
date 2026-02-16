-- Tabla para almacenar resultados de exámenes de desarrollo
-- Similar a results_test pero adaptado para exámenes de desarrollo

CREATE TABLE IF NOT EXISTS public.examen_results (
  id BIGSERIAL PRIMARY KEY,
  teachable_user_id TEXT NOT NULL,
  teachable_user_email TEXT,
  teachable_user_name TEXT,
  test_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  num_questions INTEGER NOT NULL,
  average_score NUMERIC NOT NULL, -- Nota media del examen (0-10)
  total_score NUMERIC NOT NULL, -- Puntuación total
  time_spent_seconds INTEGER,
  manual TEXT, -- Manual seleccionado (si aplica)
  bloque TEXT, -- Bloque seleccionado (si aplica)
  tema INTEGER, -- Tema seleccionado (si aplica)
  temas_selected JSONB, -- Array de {manual, bloque, tema} seleccionados
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para mejorar el rendimiento de las consultas
CREATE INDEX IF NOT EXISTS idx_examen_results_user_id
  ON public.examen_results(teachable_user_id);

CREATE INDEX IF NOT EXISTS idx_examen_results_user_email
  ON public.examen_results(teachable_user_email);

CREATE INDEX IF NOT EXISTS idx_examen_results_test_date
  ON public.examen_results(test_date DESC);

-- Habilitar RLS (Row Level Security)
ALTER TABLE public.examen_results ENABLE ROW LEVEL SECURITY;

-- Política para permitir insertar resultados
CREATE POLICY "Allow insert for all users"
  ON public.examen_results
  FOR INSERT
  WITH CHECK (true);

-- Política para permitir leer propios resultados
CREATE POLICY "Users can read own results"
  ON public.examen_results
  FOR SELECT
  USING (true);

-- Comentarios para documentación
COMMENT ON TABLE public.examen_results IS 'Almacena los resultados de los exámenes de desarrollo completados por usuarios de Teachable';
COMMENT ON COLUMN public.examen_results.teachable_user_id IS 'ID del usuario en Teachable';
COMMENT ON COLUMN public.examen_results.average_score IS 'Nota media del examen (escala 0-10)';
COMMENT ON COLUMN public.examen_results.total_score IS 'Puntuación total sumando todas las preguntas';
COMMENT ON COLUMN public.examen_results.temas_selected IS 'Array JSON con los temas seleccionados: [{manual, bloque, tema}]';
