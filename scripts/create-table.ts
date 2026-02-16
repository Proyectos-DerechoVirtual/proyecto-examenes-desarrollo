import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Cargar variables de entorno
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: Faltan credenciales de Supabase');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createTable() {
  console.log('🚀 Creando tabla examen_preguntas en Supabase...\n');

  // Leer el archivo SQL
  const sqlPath = path.join(__dirname, 'create-examen-table.sql');
  const sqlContent = fs.readFileSync(sqlPath, 'utf8');

  // Dividir en statements individuales y ejecutar
  const statements = sqlContent
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`📝 Ejecutando ${statements.length} sentencias SQL...\n`);

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i] + ';';
    console.log(`[${i + 1}/${statements.length}] Ejecutando: ${statement.substring(0, 80)}...`);

    try {
      const { error } = await supabase.rpc('exec_sql', { sql_string: statement });

      if (error) {
        // Si no existe la función exec_sql, intentar crear la tabla directamente
        console.log('⚠️  Nota: Ejecutar el SQL manualmente en el dashboard de Supabase');
        console.log('   URL: https://supabase.com/dashboard/project/kikwwbiltenslcifirnj/editor');
        break;
      }

      console.log('   ✅ Ejecutado correctamente\n');
    } catch (error) {
      console.error('   ❌ Error:', error);
    }
  }

  console.log('\n✅ Proceso completado. Verifica la tabla en Supabase.\n');
  console.log('📋 SQL completo guardado en: scripts/create-examen-table.sql');
  console.log('   Copia y pega el contenido en el SQL Editor de Supabase si es necesario.\n');
}

createTable()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('💥 Error fatal:', error);
    process.exit(1);
  });
