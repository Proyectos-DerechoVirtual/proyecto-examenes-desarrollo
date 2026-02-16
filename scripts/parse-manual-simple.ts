import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Tema {
  bloque: string;
  bloqueNumero: number;
  temaNumero: number;
  titulo: string;
  contenido: string;
}

function parseManualSimple(filePath: string): Tema[] {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Estrategia: encontrar todos los temas usando regex
  // Buscar patrones como " Tema 1:" seguido de contenido hasta el próximo tema o bloque

  const temas: Tema[] = [];

  // Dividir el contenido en secciones por "BLOQUE X"
  const bloqueRegex = /BLOQUE\s+(\d+)\s*\n([^\n]+)/g;
  const bloques: Array<{num: number, titulo: string, startIndex: number}> = [];

  let match;
  while ((match = bloqueRegex.exec(content)) !== null) {
    bloques.push({
      num: parseInt(match[1]),
      titulo: match[2].trim(),
      startIndex: match.index
    });
  }

  console.log(`Encontrados ${bloques.length} bloques`);
  bloques.forEach(b => console.log(`  Bloque ${b.num}: ${b.titulo}`));

  // Por cada bloque, buscar los temas
  for (let i = 0; i < bloques.length; i++) {
    const bloqueActual = bloques[i];
    const siguienteBloque = i < bloques.length - 1 ? bloques[i + 1] : null;

    // Extraer el contenido de este bloque
    const bloqueContent = siguienteBloque
      ? content.substring(bloqueActual.startIndex, siguienteBloque.startIndex)
      : content.substring(bloqueActual.startIndex);

    // Buscar temas en este bloque
    const temaRegex = /\s+Tema\s+(\d+):\s*([^\n]+(?:\n[^\n]{1,40})*?)\n([A-ZÁÉÍÓÚ])/g;
    let temaMatch;

    while ((temaMatch = temaRegex.exec(bloqueContent)) !== null) {
      const temaNum = parseInt(temaMatch[1]);
      const temaTitle = temaMatch[2].replace(/\n/g, ' ').trim();

      console.log(`  Tema ${temaNum}: ${temaTitle}`);
    }
  }

  return temas;
}

const manualPath = path.join(__dirname, '../manuales/Manuales txt/Manual Arbitraje.txt');
console.log('Analizando estructura del manual...\n');
parseManualSimple(manualPath);
