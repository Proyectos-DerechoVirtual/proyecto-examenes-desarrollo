import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkEmbeddings() {
  console.log('🔍 Verificando embeddings en Supabase...\n');

  try {
    // Obtener una pregunta de ejemplo
    const { data, error } = await supabase
      .from('examen_preguntas')
      .select('*')
      .limit(1);

    if (error) {
      console.error('❌ Error:', error);
      return;
    }

    if (!data || data.length === 0) {
      console.error('❌ No hay preguntas en la base de datos');
      return;
    }

    const question = data[0];
    console.log('📊 Pregunta de ejemplo:');
    console.log('ID:', question.id);
    console.log('Pregunta:', question.pregunta.substring(0, 80) + '...');
    console.log('\n📐 Análisis de embeddings:');

    // Verificar embedding_pregunta
    console.log('\n1. embedding_pregunta:');
    console.log('   Tipo:', typeof question.embedding_pregunta);
    console.log('   Es array?:', Array.isArray(question.embedding_pregunta));

    if (typeof question.embedding_pregunta === 'string') {
      console.log('   ⚠️  Es string, necesita parsing');
      console.log('   Primeros 100 caracteres:', question.embedding_pregunta.substring(0, 100));
      try {
        const parsed = JSON.parse(question.embedding_pregunta);
        console.log('   ✅ Se puede parsear');
        console.log('   Longitud después de parsear:', parsed.length);
      } catch (e) {
        console.log('   ❌ Error al parsear:', e);
      }
    } else if (Array.isArray(question.embedding_pregunta)) {
      console.log('   ✅ Ya es array');
      console.log('   Longitud:', question.embedding_pregunta.length);
    }

    // Verificar embedding_respuesta
    console.log('\n2. embedding_respuesta:');
    console.log('   Tipo:', typeof question.embedding_respuesta);
    console.log('   Es array?:', Array.isArray(question.embedding_respuesta));

    if (typeof question.embedding_respuesta === 'string') {
      console.log('   ⚠️  Es string, necesita parsing');
      console.log('   Primeros 100 caracteres:', question.embedding_respuesta.substring(0, 100));
      try {
        const parsed = JSON.parse(question.embedding_respuesta);
        console.log('   ✅ Se puede parsear');
        console.log('   Longitud después de parsear:', parsed.length);
      } catch (e) {
        console.log('   ❌ Error al parsear:', e);
      }
    } else if (Array.isArray(question.embedding_respuesta)) {
      console.log('   ✅ Ya es array');
      console.log('   Longitud:', question.embedding_respuesta.length);
    }

    console.log('\n' + '='.repeat(60));
    console.log('📋 RESUMEN:');
    console.log('='.repeat(60));
    console.log('Embeddings están almacenados como:', typeof question.embedding_respuesta);
    console.log('Necesitan parsing?:', typeof question.embedding_respuesta === 'string' ? 'SÍ' : 'NO');

  } catch (error) {
    console.error('💥 Error fatal:', error);
  }
}

checkEmbeddings()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('💥 Error:', error);
    process.exit(1);
  });
