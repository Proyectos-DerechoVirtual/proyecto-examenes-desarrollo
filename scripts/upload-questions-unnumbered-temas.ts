import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Obtener __dirname en ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar variables de entorno
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  console.log(`📝 Cargando variables de entorno desde: ${envPath}`);
  dotenv.config({ path: envPath });
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !OPENAI_API_KEY) {
  console.error('❌ Faltan variables de entorno requeridas');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const EMBEDDING_MODEL = 'text-embedding-3-large';
const EMBEDDING_DIMENSIONS = 3072;
const BATCH_SIZE = 50;

interface Pregunta {
  pregunta: string;
  respuesta_correcta: string;
  manual: string;
  bloque: string;
  tema: number;
  tema_nombre: string;
  source_file: string;
}

/**
 * Parsea un archivo de preguntas donde los temas NO están numerados.
 * Numera los temas automáticamente dentro de cada bloque.
 * Jerarquía: Manual -> Bloque -> Tema
 */
function parseQuestionFileUnnumberedTemas(filePath: string): Pregunta[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const preguntas: Pregunta[] = [];

  let currentQuestion: Partial<Pregunta> = {};
  const sourceFile = path.basename(filePath);

  // Mapa para rastrear temas por bloque: bloque -> { temaNombre -> temaNumero }
  const bloqueTemasMap: Map<string, Map<string, number>> = new Map();

  // Primera pasada: identificar todos los temas únicos por bloque
  let tempBloque: string | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('Bloque:')) {
      let bloqueValue = trimmed.substring('Bloque:'.length).trim();
      // Normalizar: si es solo un número, convertir a "Bloque X"
      if (/^\d+$/.test(bloqueValue)) {
        bloqueValue = `Bloque ${bloqueValue}`;
      }
      tempBloque = bloqueValue;
      if (!bloqueTemasMap.has(tempBloque)) {
        bloqueTemasMap.set(tempBloque, new Map());
      }
    } else if (trimmed.startsWith('Tema:') && tempBloque) {
      const temaNombre = trimmed.substring('Tema:'.length).trim();
      const bloqueTemasInner = bloqueTemasMap.get(tempBloque)!;
      if (!bloqueTemasInner.has(temaNombre)) {
        // Asignar el siguiente número de tema para este bloque
        bloqueTemasInner.set(temaNombre, bloqueTemasInner.size + 1);
      }
    }
  }

  // Mostrar mapa de temas detectados
  console.log('\n📋 Mapa de temas detectados:');
  for (const [bloque, temas] of bloqueTemasMap) {
    console.log(`\n   ${bloque}:`);
    for (const [nombre, num] of temas) {
      console.log(`      Tema ${num}: ${nombre}`);
    }
  }

  // Segunda pasada: parsear las preguntas con los números de tema asignados
  let currentBloque: string | null = null;
  let currentManual: string | null = null;
  let currentTemaNombre: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('Pregunta:')) {
      // Si ya hay una pregunta en proceso, guardarla
      if (currentQuestion.pregunta && currentQuestion.respuesta_correcta) {
        if (currentQuestion.tema && currentQuestion.bloque && currentQuestion.manual) {
          preguntas.push(currentQuestion as Pregunta);
        }
      }
      currentQuestion = {
        pregunta: trimmed.substring('Pregunta:'.length).trim(),
        source_file: sourceFile,
        bloque: currentBloque || undefined,
        manual: currentManual || undefined,
        tema: currentBloque && currentTemaNombre
          ? bloqueTemasMap.get(currentBloque)?.get(currentTemaNombre)
          : undefined,
        tema_nombre: currentTemaNombre || undefined
      };
    } else if (trimmed.startsWith('Respuesta Correcta:')) {
      currentQuestion.respuesta_correcta = trimmed.substring('Respuesta Correcta:'.length).trim();
    } else if (trimmed.startsWith('Manual:')) {
      currentManual = trimmed.substring('Manual:'.length).trim();
      currentQuestion.manual = currentManual;
    } else if (trimmed.startsWith('Bloque:')) {
      let bloqueValue = trimmed.substring('Bloque:'.length).trim();
      // Normalizar: si es solo un número, convertir a "Bloque X"
      if (/^\d+$/.test(bloqueValue)) {
        bloqueValue = `Bloque ${bloqueValue}`;
      }
      currentBloque = bloqueValue;
      currentQuestion.bloque = currentBloque;
    } else if (trimmed.startsWith('Tema:')) {
      currentTemaNombre = trimmed.substring('Tema:'.length).trim();
      currentQuestion.tema_nombre = currentTemaNombre;
      if (currentBloque && bloqueTemasMap.has(currentBloque)) {
        currentQuestion.tema = bloqueTemasMap.get(currentBloque)!.get(currentTemaNombre);
      }
    }
  }

  // Agregar la última pregunta si existe
  if (currentQuestion.pregunta && currentQuestion.respuesta_correcta) {
    if (currentQuestion.tema && currentQuestion.bloque && currentQuestion.manual) {
      preguntas.push(currentQuestion as Pregunta);
    }
  }

  // Filtrar preguntas válidas
  const validPreguntas = preguntas.filter(p =>
    p.pregunta && p.respuesta_correcta && p.manual && p.bloque && p.tema && p.tema_nombre && p.source_file
  );

  const invalidCount = preguntas.length - validPreguntas.length;
  if (invalidCount > 0) {
    console.warn(`\n⚠️  ${invalidCount} preguntas incompletas omitidas`);
  }

  return validPreguntas;
}

/**
 * Genera embeddings en lote para múltiples textos
 */
async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts,
      dimensions: EMBEDDING_DIMENSIONS
    });
    return response.data.map(d => d.embedding);
  } catch (error) {
    console.error('Error generando embeddings en lote:', error);
    throw error;
  }
}

/**
 * Sube preguntas a Supabase con sus embeddings
 */
async function uploadQuestions(preguntas: Pregunta[]) {
  console.log(`\n📤 Subiendo ${preguntas.length} preguntas a Supabase...`);

  let uploadedCount = 0;
  let errorCount = 0;

  // Procesar en lotes
  for (let i = 0; i < preguntas.length; i += BATCH_SIZE) {
    const batch = preguntas.slice(i, i + BATCH_SIZE);
    console.log(`\n⚙️  Procesando lote ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(preguntas.length / BATCH_SIZE)} (${batch.length} preguntas)...`);

    try {
      // Generar embeddings para preguntas y respuestas
      console.log('  🔄 Generando embeddings para preguntas...');
      const preguntaTexts = batch.map(p => p.pregunta);
      const preguntaEmbeddings = await generateEmbeddingsBatch(preguntaTexts);

      console.log('  🔄 Generando embeddings para respuestas...');
      const respuestaTexts = batch.map(p => p.respuesta_correcta);
      const respuestaEmbeddings = await generateEmbeddingsBatch(respuestaTexts);

      // Preparar datos para inserción
      const dataToInsert = batch.map((pregunta, idx) => ({
        pregunta: pregunta.pregunta,
        embedding_pregunta: preguntaEmbeddings[idx],
        respuesta_correcta: pregunta.respuesta_correcta,
        embedding_respuesta: respuestaEmbeddings[idx],
        tema: pregunta.tema,
        tema_nombre: pregunta.tema_nombre,
        bloque: pregunta.bloque,
        manual: pregunta.manual,
        source_file: pregunta.source_file,
        embedding_model: EMBEDDING_MODEL
      }));

      // Insertar en Supabase
      console.log('  💾 Insertando en Supabase...');
      const { data, error } = await supabase
        .from('examen_preguntas')
        .insert(dataToInsert)
        .select();

      if (error) {
        console.error(`  ❌ Error insertando lote:`, error.message);
        errorCount += batch.length;
      } else {
        uploadedCount += batch.length;
        console.log(`  ✅ Lote insertado exitosamente (${batch.length} preguntas)`);
      }

      // Pequeña pausa entre lotes para evitar rate limits
      if (i + BATCH_SIZE < preguntas.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

    } catch (error: any) {
      console.error(`  ❌ Error procesando lote:`, error.message);
      errorCount += batch.length;
    }
  }

  return { uploadedCount, errorCount };
}

/**
 * Procesa un archivo individual
 */
async function processFile(file: string): Promise<{ total: number; uploaded: number; errors: number }> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📖 Procesando: ${path.basename(file)}`);
  console.log('='.repeat(80));

  const preguntas = parseQuestionFileUnnumberedTemas(file);
  console.log(`\n✓ Parseadas ${preguntas.length} preguntas válidas`);

  // Mostrar estadísticas por bloque y tema
  const stats: Record<string, Record<number, number>> = {};
  for (const p of preguntas) {
    if (!stats[p.bloque]) stats[p.bloque] = {};
    stats[p.bloque][p.tema] = (stats[p.bloque][p.tema] || 0) + 1;
  }

  console.log(`\n📊 Distribución por bloque y tema:`);
  for (const [bloque, temas] of Object.entries(stats).sort()) {
    console.log(`\n   ${bloque}:`);
    for (const [tema, count] of Object.entries(temas).sort((a, b) => Number(a[0]) - Number(b[0]))) {
      console.log(`      Tema ${tema}: ${count} preguntas`);
    }
  }

  if (preguntas.length > 0) {
    const { uploadedCount, errorCount } = await uploadQuestions(preguntas);
    console.log(`\n✅ Completado ${path.basename(file)}: ${uploadedCount} exitosas, ${errorCount} errores`);
    return { total: preguntas.length, uploaded: uploadedCount, errors: errorCount };
  } else {
    console.log(`⚠️  No hay preguntas válidas para subir en este archivo`);
    return { total: 0, uploaded: 0, errors: 0 };
  }
}

/**
 * Función principal - Recibe archivos como argumentos o procesa todos en el directorio
 */
async function main() {
  console.log('🚀 Iniciando carga de preguntas (temas sin numerar) a Supabase');
  console.log(`📊 Modelo de embeddings: ${EMBEDDING_MODEL} (${EMBEDDING_DIMENSIONS} dimensiones)`);

  // Obtener archivos de los argumentos de línea de comandos
  const args = process.argv.slice(2);
  let files: string[] = [];

  if (args.length > 0) {
    // Archivos pasados como argumentos
    files = args.map(f => {
      // Si es ruta relativa, convertir a absoluta
      if (!path.isAbsolute(f)) {
        return path.join(process.cwd(), f);
      }
      return f;
    });
  } else {
    // Sin argumentos: mostrar uso
    console.log('\n📋 Uso: npx tsx scripts/upload-questions-unnumbered-temas.ts <archivo1.txt> [archivo2.txt] ...');
    console.log('\n   Ejemplo:');
    console.log('   npx tsx scripts/upload-questions-unnumbered-temas.ts "manuales/Preguntas/Preguntas Manual DIpr.txt"');
    process.exit(0);
  }

  // Verificar que los archivos existen
  console.log(`\n📁 Archivos a procesar (${files.length}):`);
  const existingFiles: string[] = [];
  for (const file of files) {
    const exists = fs.existsSync(file);
    console.log(`  ${exists ? '✓' : '✗'} ${path.basename(file)} ${exists ? '' : '(NO ENCONTRADO)'}`);
    if (exists) existingFiles.push(file);
  }

  if (existingFiles.length === 0) {
    console.error('\n❌ No se encontraron archivos válidos para procesar');
    process.exit(1);
  }

  // Procesar cada archivo
  let totalPreguntas = 0;
  let totalUploaded = 0;
  let totalErrors = 0;

  for (const file of existingFiles) {
    const result = await processFile(file);
    totalPreguntas += result.total;
    totalUploaded += result.uploaded;
    totalErrors += result.errors;
  }

  // Resumen final global
  console.log(`\n${'='.repeat(80)}`);
  console.log('🎉 RESUMEN FINAL GLOBAL');
  console.log('='.repeat(80));
  console.log(`📁 Archivos procesados: ${existingFiles.length}`);
  console.log(`📊 Total de preguntas: ${totalPreguntas}`);
  console.log(`✅ Subidas exitosamente: ${totalUploaded}`);
  console.log(`❌ Errores: ${totalErrors}`);
  if (totalPreguntas > 0) {
    console.log(`📈 Tasa de éxito: ${((totalUploaded / totalPreguntas) * 100).toFixed(2)}%`);
  }

  if (totalErrors === 0 && totalUploaded > 0) {
    console.log('\n🎊 ¡Todas las preguntas fueron subidas exitosamente!');
  }
}

// Ejecutar
main().catch(error => {
  console.error('❌ Error fatal:', error);
  process.exit(1);
});
