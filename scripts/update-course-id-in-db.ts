/**
 * Script para actualizar el course_id en registros existentes de la base de datos
 *
 * Este script:
 * 1. Busca preguntas sin course_id en examen_preguntas
 * 2. Extrae el course_id del source_file si tiene el nuevo formato
 * 3. Actualiza los registros con el course_id correcto
 *
 * También puede actualizar basándose en un mapping manual-courseId si los archivos
 * aún no han sido renombrados.
 *
 * Uso:
 *   npx ts-node scripts/update-course-id-in-db.ts [--dry-run]
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// CONFIGURAR AQUÍ: Mapping manual para manuales que aún no tienen course_id en el filename
// Ejemplo: 'Manual Arbitraje' -> '2518286'
const MANUAL_TO_COURSE_ID: Record<string, string> = {
  // Agregar aquí los mappings, ejemplo:
  // 'Manual Arbitraje': '2518286',
  // 'Manual Penal Parte General': '2518287',
};

const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Extrae el course_id del nombre del archivo source_file
 * "Preguntas txt/Preguntas Manual Arbitraje-2518286.txt" -> "2518286"
 */
function extractCourseIdFromSourceFile(sourceFile: string | null): string | null {
  if (!sourceFile) return null;

  const match = sourceFile.match(/-(\d{5,})\.txt$/i);
  return match ? match[1] : null;
}

async function main() {
  console.log('\n🔄 Script de Actualización de Course ID en Base de Datos');
  console.log('='.repeat(60));

  if (DRY_RUN) {
    console.log('⚠️  MODO DRY-RUN: No se realizarán cambios\n');
  }

  // 1. Obtener todas las preguntas sin course_id
  console.log('📊 Obteniendo preguntas sin course_id...');

  let allQuestions: any[] = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('examen_preguntas')
      .select('id, manual, source_file, course_id')
      .is('course_id', null)
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error obteniendo preguntas:', error);
      return;
    }

    if (!data || data.length === 0) break;
    allQuestions = allQuestions.concat(data);
    offset += limit;
    if (data.length < limit) break;
  }

  console.log(`   Encontradas: ${allQuestions.length} preguntas sin course_id\n`);

  if (allQuestions.length === 0) {
    console.log('✅ Todas las preguntas ya tienen course_id asignado\n');
    return;
  }

  // 2. Agrupar por fuente y determinar course_id
  const updatesBySourceFile: Map<string, { courseId: string; count: number; ids: number[] }> = new Map();
  const updatesByManual: Map<string, { courseId: string; count: number; ids: number[] }> = new Map();
  const noMatch: any[] = [];

  for (const q of allQuestions) {
    // Primero intentar extraer del source_file
    const courseIdFromFile = extractCourseIdFromSourceFile(q.source_file);

    if (courseIdFromFile) {
      // Course ID encontrado en el nombre del archivo
      const key = q.source_file;
      if (!updatesBySourceFile.has(key)) {
        updatesBySourceFile.set(key, { courseId: courseIdFromFile, count: 0, ids: [] });
      }
      updatesBySourceFile.get(key)!.count++;
      updatesBySourceFile.get(key)!.ids.push(q.id);
    } else if (q.manual && MANUAL_TO_COURSE_ID[q.manual]) {
      // Usar mapping manual
      const courseIdFromMapping = MANUAL_TO_COURSE_ID[q.manual];
      const key = q.manual;
      if (!updatesByManual.has(key)) {
        updatesByManual.set(key, { courseId: courseIdFromMapping, count: 0, ids: [] });
      }
      updatesByManual.get(key)!.count++;
      updatesByManual.get(key)!.ids.push(q.id);
    } else {
      noMatch.push(q);
    }
  }

  // 3. Mostrar resumen
  console.log('📋 Resumen de actualizaciones:\n');

  if (updatesBySourceFile.size > 0) {
    console.log(`📁 Por source_file (${updatesBySourceFile.size} archivos):`);
    for (const [sourceFile, info] of updatesBySourceFile) {
      console.log(`   - ${sourceFile}`);
      console.log(`     → course_id: ${info.courseId} (${info.count} preguntas)`);
    }
    console.log();
  }

  if (updatesByManual.size > 0) {
    console.log(`📚 Por mapping manual (${updatesByManual.size} manuales):`);
    for (const [manual, info] of updatesByManual) {
      console.log(`   - ${manual}`);
      console.log(`     → course_id: ${info.courseId} (${info.count} preguntas)`);
    }
    console.log();
  }

  if (noMatch.length > 0) {
    // Agrupar por manual para mostrar más limpio
    const noMatchByManual: Record<string, number> = {};
    for (const q of noMatch) {
      const manual = q.manual || 'N/A';
      noMatchByManual[manual] = (noMatchByManual[manual] || 0) + 1;
    }

    console.log(`⚠️  Sin course_id disponible (${noMatch.length} preguntas):`);
    for (const [manual, count] of Object.entries(noMatchByManual)) {
      console.log(`   - ${manual}: ${count} preguntas`);
    }
    console.log('\n   Para agregar mappings, edita MANUAL_TO_COURSE_ID en este script');
    console.log('   o renombra los archivos en storage al nuevo formato');
    console.log();
  }

  // 4. Ejecutar actualizaciones si no es dry-run
  if (!DRY_RUN) {
    const totalUpdates = updatesBySourceFile.size + updatesByManual.size;

    if (totalUpdates > 0) {
      console.log('\n🚀 Ejecutando actualizaciones...\n');

      let successCount = 0;
      let failCount = 0;

      // Actualizar por source_file
      for (const [sourceFile, info] of updatesBySourceFile) {
        process.stdout.write(`   Actualizando ${info.count} preguntas de ${sourceFile.split('/').pop()}... `);

        const { error } = await supabase
          .from('examen_preguntas')
          .update({ course_id: info.courseId })
          .eq('source_file', sourceFile)
          .is('course_id', null);

        if (error) {
          console.log('❌');
          console.error('     Error:', error.message);
          failCount++;
        } else {
          console.log('✅');
          successCount++;
        }
      }

      // Actualizar por manual (mapping)
      for (const [manual, info] of updatesByManual) {
        process.stdout.write(`   Actualizando ${info.count} preguntas de "${manual}"... `);

        const { error } = await supabase
          .from('examen_preguntas')
          .update({ course_id: info.courseId })
          .eq('manual', manual)
          .is('course_id', null);

        if (error) {
          console.log('❌');
          console.error('     Error:', error.message);
          failCount++;
        } else {
          console.log('✅');
          successCount++;
        }
      }

      console.log('\n📊 Resultado:');
      console.log(`   ✅ Grupos actualizados: ${successCount}`);
      console.log(`   ❌ Grupos fallidos: ${failCount}`);
    } else {
      console.log('\n⚠️  No hay actualizaciones para ejecutar');
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Script finalizado\n');
}

main().catch(console.error);
