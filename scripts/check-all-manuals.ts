import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

async function check() {
  // Obtener todos los manuales únicos con count
  const { data, error } = await supabase
    .rpc('get_manual_counts');

  if (error) {
    // Si no existe la función RPC, hacerlo manualmente con paginación
    console.log('Obteniendo manuales manualmente...');

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

    console.log('\n📊 Manuales en la BD:');
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
}

check();
