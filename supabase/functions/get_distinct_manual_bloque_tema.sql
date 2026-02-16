-- Función RPC para obtener la estructura de Manual -> Bloque -> Tema
-- Retorna todos los valores únicos para el selector (con nombres de temas)

CREATE OR REPLACE FUNCTION get_distinct_manual_bloque_tema()
RETURNS TABLE (manual TEXT, bloque TEXT, tema INTEGER, tema_nombre TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (q.manual, q.bloque, q.tema)
    q.manual,
    q.bloque,
    q.tema,
    q.tema_nombre
  FROM examen_preguntas q
  WHERE q.manual IS NOT NULL
    AND q.bloque IS NOT NULL
    AND q.tema IS NOT NULL
  ORDER BY q.manual, q.bloque, q.tema;
END;
$$ LANGUAGE plpgsql;

-- Verificar que funciona
-- SELECT * FROM get_distinct_manual_bloque_tema();
