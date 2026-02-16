import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!
);

async function fixManualNames() {
  console.log('🔧 Corrigiendo nombres de manuales adicionales...\n');

  const fixes = [
    { from: 'Manual Penal 2', to: 'Derecho Penal II' },
    { from: 'Manual de Derecho Internacional Privado', to: 'Derecho Internacional Privado' },
    { from: 'Manual Derecho Internacional Privado', to: 'Derecho Internacional Privado' },
    { from: 'Manual de Derecho Internacional Público', to: 'Derecho Internacional Público' },
    { from: 'Manual Derecho Internacional Público', to: 'Derecho Internacional Público' },
    { from: 'Manual de Filosofía del Derecho', to: 'Filosofía del Derecho' },
    { from: 'Manual de Teoría del Estado Constitucional', to: 'Teoría del Estado Constitucional' },
    { from: 'Teoría del Derecho', to: 'Teoría del Derecho' }, // ya está bien
  ];

  for (const fix of fixes) {
    if (fix.from === fix.to) continue;
    console.log(`Corrigiendo "${fix.from}" -> "${fix.to}"`);
    const { error, count } = await supabase
      .from('examen_preguntas')
      .update({ manual: fix.to })
      .eq('manual', fix.from);
    console.log(error ? `   ❌ Error: ${error.message}` : `   ✅ Corregido`);
  }

  // Verificar resultados
  console.log('\n📊 Verificando resultados...\n');

  let allData: any[] = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const { data: batch } = await supabase
      .from('examen_preguntas')
      .select('manual')
      .range(offset, offset + limit - 1);

    if (!batch || batch.length === 0) break;
    allData = allData.concat(batch);
    offset += limit;
    if (batch.length < limit) break;
  }

  const stats: Record<string, number> = {};
  for (const row of allData) {
    stats[row.manual] = (stats[row.manual] || 0) + 1;
  }

  console.log('Manuales en la BD:');
  console.log('='.repeat(60));
  let total = 0;
  for (const [manual, count] of Object.entries(stats).sort()) {
    console.log(`${manual}: ${count} preguntas`);
    total += count;
  }
  console.log('='.repeat(60));
  console.log(`TOTAL: ${total} preguntas`);
  console.log(`Manuales únicos: ${Object.keys(stats).length}`);
}

fixManualNames();
