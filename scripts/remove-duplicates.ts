import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

// Usar service role key para tener permisos de delete
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!
);

async function removeDuplicates() {
  // Obtener todas las preguntas de Filosofía
  const { data } = await supabase
    .from('examen_preguntas')
    .select('id, pregunta')
    .eq('source_file', 'Preguntas Manual Filosofia del Derecho.txt')
    .order('id');

  if (!data) return;

  // Encontrar duplicados
  const seen = new Map<string, number>();
  const duplicateIds: number[] = [];

  for (const row of data) {
    if (seen.has(row.pregunta)) {
      duplicateIds.push(row.id);
    } else {
      seen.set(row.pregunta, row.id);
    }
  }

  console.log('Duplicados encontrados:', duplicateIds.length);

  if (duplicateIds.length > 0) {
    const { error } = await supabase
      .from('examen_preguntas')
      .delete()
      .in('id', duplicateIds);

    if (error) {
      console.error('Error eliminando:', error);
    } else {
      console.log('Duplicados eliminados correctamente');
    }
  }

  // Verificar después
  const { data: after } = await supabase
    .from('examen_preguntas')
    .select('id')
    .eq('source_file', 'Preguntas Manual Filosofia del Derecho.txt');

  console.log('Preguntas restantes:', after?.length || 0);
}

removeDuplicates();
