import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

async function check() {
  // Ver manuales únicos y sus bloques
  const { data } = await supabase
    .from('examen_preguntas')
    .select('manual, bloque, source_file')
    .order('manual');

  const stats: Record<string, Set<string>> = {};
  for (const row of data || []) {
    const key = `${row.manual} | ${row.source_file}`;
    if (!stats[key]) stats[key] = new Set();
    stats[key].add(row.bloque);
  }

  console.log('Manuales y sus bloques:');
  console.log('='.repeat(80));
  for (const [key, bloques] of Object.entries(stats).sort()) {
    const bloquesArr = Array.from(bloques).sort();
    console.log(key);
    console.log('   Bloques: ' + bloquesArr.join(', '));
  }

  // Buscar Tributario específicamente
  console.log('\n\nBuscando "Tributario":');
  const { data: tributario } = await supabase
    .from('examen_preguntas')
    .select('manual, source_file')
    .ilike('manual', '%tributario%');

  const tribStats: Record<string, number> = {};
  for (const row of tributario || []) {
    const key = `${row.manual} (${row.source_file})`;
    tribStats[key] = (tribStats[key] || 0) + 1;
  }
  for (const [k, v] of Object.entries(tribStats)) {
    console.log(`   ${k}: ${v} preguntas`);
  }

  // Buscar Penal específicamente
  console.log('\n\nBuscando "Penal":');
  const { data: penal } = await supabase
    .from('examen_preguntas')
    .select('manual, bloque, source_file')
    .ilike('manual', '%penal%');

  const penalStats: Record<string, { bloques: Set<string>, count: number }> = {};
  for (const row of penal || []) {
    const key = `${row.manual} (${row.source_file})`;
    if (!penalStats[key]) penalStats[key] = { bloques: new Set(), count: 0 };
    penalStats[key].bloques.add(row.bloque);
    penalStats[key].count++;
  }
  for (const [k, v] of Object.entries(penalStats)) {
    console.log(`   ${k}: ${v.count} preguntas`);
    console.log(`      Bloques: ${Array.from(v.bloques).sort().join(', ')}`);
  }
}

check();
