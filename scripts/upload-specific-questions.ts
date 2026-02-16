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
  console.error('SUPABASE_URL:', !!SUPABASE_URL);
  console.error('SUPABASE_ANON_KEY:', !!SUPABASE_ANON_KEY);
  console.error('OPENAI_API_KEY:', !!OPENAI_API_KEY);
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
  tema_titulo: string;
  source_file: string;
}

/**
 * Extrae el número de tema de varias formas posibles
 * Ejemplos:
 * - "Tema 1: Título" -> 1
 * - "1: Título" -> 1
 * - "Tema 12" -> 12
 * - "12" -> 12
 */
function extractTemaNumber(temaText: string): number | null {
  // Intentar diferentes patrones
  const patterns = [
    /Tema\s*(\d+)/i,           // "Tema 1", "Tema  12"
    /^(\d+)\s*[:\-\.]/,        // "1: Título", "12 - Título"
    /^(\d+)$/,                 // Solo número
  ];

  for (const pattern of patterns) {
    const match = temaText.match(pattern);
    if (match) {
      return parseInt(match[1]);
    }
  }

  return null;
}

/**
 * Parsea un archivo de preguntas y retorna array de preguntas
 */
function parseQuestionFile(filePath: string): Pregunta[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const preguntas: Pregunta[] = [];

  let currentQuestion: Partial<Pregunta> = {};
  const sourceFile = path.basename(filePath);
  let lastValidTema: number | null = null;
  let lastValidBloque: string | null = null;
  let lastValidManual: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('Pregunta:')) {
      // Si ya hay una pregunta en proceso, guardarla
      if (currentQuestion.pregunta && currentQuestion.respuesta_correcta) {
        // Usar valores anteriores si faltan
        if (!currentQuestion.tema && lastValidTema) {
          currentQuestion.tema = lastValidTema;
        }
        if (!currentQuestion.bloque && lastValidBloque) {
          currentQuestion.bloque = lastValidBloque;
        }
        if (!currentQuestion.manual && lastValidManual) {
          currentQuestion.manual = lastValidManual;
        }

        if (currentQuestion.tema && currentQuestion.bloque && currentQuestion.manual) {
          preguntas.push(currentQuestion as Pregunta);
        }
      }
      currentQuestion = {
        pregunta: trimmed.substring('Pregunta:'.length).trim(),
        source_file: sourceFile
      };
    } else if (trimmed.startsWith('Respuesta Correcta:')) {
      currentQuestion.respuesta_correcta = trimmed.substring('Respuesta Correcta:'.length).trim();
    } else if (trimmed.startsWith('Manual:')) {
      currentQuestion.manual = trimmed.substring('Manual:'.length).trim();
      lastValidManual = currentQuestion.manual;
    } else if (trimmed.startsWith('Bloque:')) {
      currentQuestion.bloque = trimmed.substring('Bloque:'.length).trim();
      lastValidBloque = currentQuestion.bloque;
    } else if (trimmed.startsWith('Tema:')) {
      const temaText = trimmed.substring('Tema:'.length).trim();
      const temaNum = extractTemaNumber(temaText);
      if (temaNum) {
        currentQuestion.tema = temaNum;
        currentQuestion.tema_titulo = temaText;
        lastValidTema = temaNum;
      }
    }
  }

  // Agregar la última pregunta si existe
  if (currentQuestion.pregunta && currentQuestion.respuesta_correcta) {
    if (!currentQuestion.tema && lastValidTema) {
      currentQuestion.tema = lastValidTema;
    }
    if (!currentQuestion.bloque && lastValidBloque) {
      currentQuestion.bloque = lastValidBloque;
    }
    if (!currentQuestion.manual && lastValidManual) {
      currentQuestion.manual = lastValidManual;
    }

    if (currentQuestion.tema && currentQuestion.bloque && currentQuestion.manual) {
      preguntas.push(currentQuestion as Pregunta);
    }
  }

  // Filtrar y reportar preguntas inválidas
  const invalidPreguntas = preguntas.filter(p => !p.pregunta || !p.respuesta_correcta || !p.manual || !p.bloque || !p.tema);
  if (invalidPreguntas.length > 0) {
    console.warn(`⚠️  ${invalidPreguntas.length} preguntas incompletas omitidas`);
  }

  const validPreguntas = preguntas.filter(p =>
    p.pregunta && p.respuesta_correcta && p.manual && p.bloque && p.tema && p.source_file
  );

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
 * Función principal - Solo procesa los archivos específicos
 */
async function main() {
  console.log('🚀 Iniciando carga de preguntas específicas a Supabase');
  console.log(`📊 Modelo de embeddings: ${EMBEDDING_MODEL} (${EMBEDDING_DIMENSIONS} dimensiones)`);

  // Archivos específicos a procesar
  const specificFiles = [
    path.join(__dirname, '../manuales/Preguntas/Preguntas Manual Derecho Administrativo 2.txt'),
    path.join(__dirname, '../manuales/Preguntas/Preguntas Manual de Economia Politica.txt')
  ];

  console.log(`\n📁 Archivos a procesar:`);
  for (const file of specificFiles) {
    const exists = fs.existsSync(file);
    console.log(`  ${exists ? '✓' : '✗'} ${path.basename(file)} ${exists ? '' : '(NO ENCONTRADO)'}`);
  }

  // Filtrar archivos que existen
  const existingFiles = specificFiles.filter(f => fs.existsSync(f));

  if (existingFiles.length === 0) {
    console.error('❌ No se encontraron archivos para procesar');
    process.exit(1);
  }

  let totalPreguntas = 0;
  let totalUploadedCount = 0;
  let totalErrorCount = 0;

  // Procesar cada archivo
  for (const file of existingFiles) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📖 Procesando: ${path.basename(file)}`);
    console.log('='.repeat(80));

    const preguntas = parseQuestionFile(file);
    console.log(`✓ Parseadas ${preguntas.length} preguntas válidas`);

    // Mostrar estadísticas por tema
    const temaStats = preguntas.reduce((acc, p) => {
      acc[p.tema] = (acc[p.tema] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);
    console.log(`📊 Distribución por temas:`);
    Object.entries(temaStats).sort((a, b) => Number(a[0]) - Number(b[0])).forEach(([tema, count]) => {
      console.log(`   Tema ${tema}: ${count} preguntas`);
    });

    totalPreguntas += preguntas.length;

    if (preguntas.length > 0) {
      const { uploadedCount, errorCount } = await uploadQuestions(preguntas);
      totalUploadedCount += uploadedCount;
      totalErrorCount += errorCount;
      console.log(`\n✅ Completado ${path.basename(file)}: ${uploadedCount} exitosas, ${errorCount} errores`);
    } else {
      console.log(`⚠️  No hay preguntas válidas para subir en este archivo`);
    }
  }

  // Resumen final
  console.log(`\n${'='.repeat(80)}`);
  console.log('🎉 RESUMEN FINAL');
  console.log('='.repeat(80));
  console.log(`📊 Total de preguntas procesadas: ${totalPreguntas}`);
  console.log(`✅ Subidas exitosamente: ${totalUploadedCount}`);
  console.log(`❌ Errores: ${totalErrorCount}`);
  if (totalPreguntas > 0) {
    console.log(`📈 Tasa de éxito: ${((totalUploadedCount / totalPreguntas) * 100).toFixed(2)}%`);
  }

  if (totalErrorCount === 0 && totalUploadedCount > 0) {
    console.log('\n🎊 ¡Todas las preguntas fueron subidas exitosamente!');
  }
}

// Ejecutar
main().catch(error => {
  console.error('❌ Error fatal:', error);
  process.exit(1);
});
