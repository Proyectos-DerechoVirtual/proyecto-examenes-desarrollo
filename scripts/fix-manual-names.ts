import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

// Usar service role para poder hacer updates
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!
);

async function fixManualNames() {
  console.log('🔧 Corrigiendo nombres de manuales...\n');

  // 1. Unificar Tributario 1 -> "Derecho Tributario I"
  console.log('1. Corrigiendo "Manual de Derecho Tributario" -> "Derecho Tributario I"');
  const { error: err1 } = await supabase
    .from('examen_preguntas')
    .update({ manual: 'Derecho Tributario I' })
    .eq('manual', 'Manual de Derecho Tributario');
  console.log(err1 ? `   ❌ Error: ${err1.message}` : '   ✅ Corregido');

  // 2. Unificar Penal Parte General -> "Derecho Penal I (Parte General)"
  console.log('2. Corrigiendo "Manual Derecho Penal Parte General" -> "Derecho Penal I (Parte General)"');
  const { error: err2 } = await supabase
    .from('examen_preguntas')
    .update({ manual: 'Derecho Penal I (Parte General)' })
    .eq('manual', 'Manual Derecho Penal Parte General');
  console.log(err2 ? `   ❌ Error: ${err2.message}` : '   ✅ Corregido');

  // 3. Unificar el otro nombre de Penal Parte General
  console.log('3. Corrigiendo "Derecho Penal Parte General" -> "Derecho Penal I (Parte General)"');
  const { error: err3 } = await supabase
    .from('examen_preguntas')
    .update({ manual: 'Derecho Penal I (Parte General)' })
    .eq('manual', 'Derecho Penal Parte General');
  console.log(err3 ? `   ❌ Error: ${err3.message}` : '   ✅ Corregido');

  // 4. Unificar "Derecho Penal 2" -> "Derecho Penal II"
  console.log('4. Corrigiendo "Derecho Penal 2" -> "Derecho Penal II"');
  const { error: err4 } = await supabase
    .from('examen_preguntas')
    .update({ manual: 'Derecho Penal II' })
    .eq('manual', 'Derecho Penal 2');
  console.log(err4 ? `   ❌ Error: ${err4.message}` : '   ✅ Corregido');

  // Verificar resultados
  console.log('\n📊 Verificando resultados...\n');

  const { data } = await supabase
    .from('examen_preguntas')
    .select('manual')
    .order('manual');

  const stats: Record<string, number> = {};
  for (const row of data || []) {
    stats[row.manual] = (stats[row.manual] || 0) + 1;
  }

  console.log('Manuales en la BD:');
  console.log('='.repeat(60));
  for (const [manual, count] of Object.entries(stats).sort()) {
    console.log(`${manual}: ${count} preguntas`);
  }
}

fixManualNames();
