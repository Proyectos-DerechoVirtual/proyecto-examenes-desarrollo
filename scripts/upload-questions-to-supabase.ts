import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Obtener __dirname en ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar variables de entorno - probar múltiples ubicaciones
const envPaths = [
  '/home/brayan/.env',
  path.join(__dirname, '../.env'),
  path.join(__dirname, '../../.env')
];

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    console.log(`📝 Cargando variables de entorno desde: ${envPath}`);
    dotenv.config({ path: envPath });
    break;
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const OPENAI_API_KEY = process.env.VITE_OPENAI_API_KEY;

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
const BATCH_SIZE = 50; // Procesar en lotes para evitar rate limits

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
 * Parsea un archivo de preguntas y retorna array de preguntas
 */
function parseQuestionFile(filePath: string): Pregunta[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const preguntas: Pregunta[] = [];

  let currentQuestion: Partial<Pregunta> = {};
  const sourceFile = path.basename(filePath);

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('Pregunta:')) {
      // Si ya hay una pregunta en proceso, guardarla
      if (currentQuestion.pregunta && currentQuestion.respuesta_correcta) {
        preguntas.push(currentQuestion as Pregunta);
      }
      currentQuestion = {
        pregunta: trimmed.substring('Pregunta:'.length).trim(),
        source_file: sourceFile
      };
    } else if (trimmed.startsWith('Respuesta Correcta:')) {
      currentQuestion.respuesta_correcta = trimmed.substring('Respuesta Correcta:'.length).trim();
    } else if (trimmed.startsWith('Manual:')) {
      currentQuestion.manual = trimmed.substring('Manual:'.length).trim();
    } else if (trimmed.startsWith('Bloque:')) {
      currentQuestion.bloque = trimmed.substring('Bloque:'.length).trim();
    } else if (trimmed.startsWith('Tema:')) {
      const temaText = trimmed.substring('Tema:'.length).trim();
      // Extraer el número del tema (ej: "Tema 1: Título" -> 1 o "1: Título" -> 1)
      const temaMatch = temaText.match(/^(?:Tema\s+)?(\d+)/i);
      if (temaMatch) {
        currentQuestion.tema = parseInt(temaMatch[1]);
        currentQuestion.tema_titulo = temaText;
      }
    }
  }

  // Agregar la última pregunta si existe
  if (currentQuestion.pregunta && currentQuestion.respuesta_correcta) {
    preguntas.push(currentQuestion as Pregunta);
  }

  // Filtrar preguntas que no tienen todos los campos requeridos
  const validPreguntas = preguntas.filter(p => {
    const isValid = p.pregunta && p.respuesta_correcta && p.manual && p.bloque && p.tema && p.source_file;
    if (!isValid) {
      console.warn(`⚠️  Pregunta incompleta omitida: ${p.pregunta?.substring(0, 50) || 'sin pregunta'}...`);
    }
    return isValid;
  });

  return validPreguntas;
}

/**
 * Genera embedding para un texto usando OpenAI
 */
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
      dimensions: EMBEDDING_DIMENSIONS
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generando embedding:', error);
    throw error;
  }
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
      // Generar embeddings para preguntas y respuestas en paralelo
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
 * Función principal
 */
async function main() {
  console.log('🚀 Iniciando carga de preguntas a Supabase');
  console.log(`📊 Modelo de embeddings: ${EMBEDDING_MODEL} (${EMBEDDING_DIMENSIONS} dimensiones)`);

  const preguntasDir = path.join(__dirname, '../manuales/Preguntas');

  // Verificar que el directorio existe
  if (!fs.existsSync(preguntasDir)) {
    console.error(`❌ No se encuentra el directorio: ${preguntasDir}`);
    process.exit(1);
  }

  // Obtener todos los archivos .txt
  const files = fs.readdirSync(preguntasDir)
    .filter(f => f.endsWith('.txt'))
    .map(f => path.join(preguntasDir, f));

  console.log(`\n📁 Encontrados ${files.length} archivos de preguntas:`);
  files.forEach(f => console.log(`  - ${path.basename(f)}`));

  let totalPreguntas = 0;
  let totalUploadedCount = 0;
  let totalErrorCount = 0;

  // Procesar cada archivo
  for (const file of files) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📖 Procesando: ${path.basename(file)}`);
    console.log('='.repeat(80));

    const preguntas = parseQuestionFile(file);
    console.log(`✓ Parseadas ${preguntas.length} preguntas`);

    totalPreguntas += preguntas.length;

    const { uploadedCount, errorCount } = await uploadQuestions(preguntas);
    totalUploadedCount += uploadedCount;
    totalErrorCount += errorCount;

    console.log(`\n✅ Completado ${path.basename(file)}: ${uploadedCount} exitosas, ${errorCount} errores`);
  }

  // Resumen final
  console.log(`\n${'='.repeat(80)}`);
  console.log('🎉 RESUMEN FINAL');
  console.log('='.repeat(80));
  console.log(`📊 Total de preguntas procesadas: ${totalPreguntas}`);
  console.log(`✅ Subidas exitosamente: ${totalUploadedCount}`);
  console.log(`❌ Errores: ${totalErrorCount}`);
  console.log(`📈 Tasa de éxito: ${((totalUploadedCount / totalPreguntas) * 100).toFixed(2)}%`);

  if (totalErrorCount === 0) {
    console.log('\n🎊 ¡Todas las preguntas fueron subidas exitosamente!');
  }
}

// Ejecutar
main().catch(error => {
  console.error('❌ Error fatal:', error);
  process.exit(1);
});
