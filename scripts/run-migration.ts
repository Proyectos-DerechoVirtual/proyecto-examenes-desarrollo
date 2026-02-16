import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import * as path from 'path';

// Cargar variables de entorno
dotenv.config({ path: path.join(process.env.HOME || '/home/brayan', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Faltan variables de entorno de Supabase');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function runMigration() {
  console.log('🔧 Ejecutando migración: Agregar columna embedding_model...\n');

  try {
    // Agregar columna embedding_model
    const { error } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE public.examen_preguntas
        ADD COLUMN IF NOT EXISTS embedding_model text NULL DEFAULT 'text-embedding-3-large';

        CREATE INDEX IF NOT EXISTS idx_examen_preguntas_embedding_model
        ON public.examen_preguntas USING btree (embedding_model);
      `
    });

    if (error) {
      console.error('❌ Error ejecutando migración:', error);
      console.log('\n⚠️  Intenta ejecutar la migración manualmente en Supabase SQL Editor:');
      console.log('   migrations/add_embedding_model_column.sql');
      return false;
    }

    console.log('✅ Migración ejecutada exitosamente!');
    return true;

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.log('\n⚠️  La función exec_sql no está disponible.');
    console.log('   Ejecuta manualmente en Supabase SQL Editor:');
    console.log('   migrations/add_embedding_model_column.sql');
    return false;
  }
}

runMigration();
