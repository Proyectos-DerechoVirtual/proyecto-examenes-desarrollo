import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const openai = new OpenAI({
  apiKey: process.env.VITE_OPENAI_API_KEY
});

interface Tema {
  bloque: string;
  bloqueNumero: number;
  temaNumero: number;
  titulo: string;
  contenido: string;
}

interface Pregunta {
  pregunta: string;
  respuesta: string;
  manual: string;
  bloque: string;
  tema: string;
}

// Función para convertir números romanos a arábigos
function romanToArabic(roman: string): number {
  const romanMap: { [key: string]: number } = {
    'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100, 'D': 500, 'M': 1000
  };
  let result = 0;
  for (let i = 0; i < roman.length; i++) {
    const current = romanMap[roman[i]];
    const next = romanMap[roman[i + 1]];
    if (next && current < next) {
      result -= current;
    } else {
      result += current;
    }
  }
  return result;
}

// Función para leer el manual y extraer bloques y temas
function parseManual(filePath: string): Tema[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  const temas: Tema[] = [];
  let currentBloque = '';
  let currentBloqueNumero = 0;
  let currentTemaNumero = 0;
  let currentTitulo = '';
  let currentContenido: string[] = [];
  let inTema = false;
  let afterIndex = false;
  let collectingTitle = false;
  let titleLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Detectar nuevo bloque - formato numérico (BLOQUE 1) o romano (BLOQUE I:)
    const bloqueMatchNumeric = trimmed.match(/^BLOQUE\s+(\d+)\s*:?\s*$/i);
    const bloqueMatchRoman = trimmed.match(/^BLOQUE\s+([IVXLCDM]+)\s*:?\s*$/i);

    if (bloqueMatchNumeric || bloqueMatchRoman) {
      const bloqueMatch = bloqueMatchNumeric || bloqueMatchRoman;
      if (!bloqueMatch) continue;

      // Activar afterIndex cuando encontramos el primer bloque
      if (!afterIndex) {
        afterIndex = true;
      }
      // Guardar tema anterior
      if (inTema && currentContenido.length > 0) {
        temas.push({
          bloque: currentBloque,
          bloqueNumero: currentBloqueNumero,
          temaNumero: currentTemaNumero,
          titulo: currentTitulo,
          contenido: currentContenido.join('\n').trim()
        });
        currentContenido = [];
      }

      // Convertir a número arábigo
      if (bloqueMatchRoman) {
        currentBloqueNumero = romanToArabic(bloqueMatch[1]);
      } else {
        currentBloqueNumero = parseInt(bloqueMatch[1]);
      }

      inTema = false;
      collectingTitle = false;

      // Buscar título del bloque (puede estar en las líneas siguientes)
      let j = i + 1;
      while (j < lines.length && lines[j].trim().length === 0) j++;
      if (j < lines.length) {
        currentBloque = `BLOQUE ${currentBloqueNumero}: ${lines[j].trim()}`;
      } else {
        currentBloque = `BLOQUE ${currentBloqueNumero}`;
      }
      continue;
    }

    // Solo procesar temas después de encontrar el primer bloque
    if (!afterIndex) continue;

    // Detectar inicio de tema (formato: " Tema 1: ...")
    const temaMatch = trimmed.match(/^Tema\s+(\d+):\s*(.*)$/i);
    if (temaMatch && !trimmed.includes('...')) {
      // Guardar tema anterior
      if (inTema && currentContenido.length > 0) {
        temas.push({
          bloque: currentBloque,
          bloqueNumero: currentBloqueNumero,
          temaNumero: currentTemaNumero,
          titulo: currentTitulo,
          contenido: currentContenido.join('\n').trim()
        });
        currentContenido = [];
      }

      currentTemaNumero = parseInt(temaMatch[1]);
      titleLines = [temaMatch[2].trim()];
      collectingTitle = true;
      inTema = true;
      continue;
    }

    // Si estamos recolectando el título del tema (líneas siguientes)
    if (collectingTitle && trimmed.length > 0 && !trimmed.match(/^\d+$/)) {
      // Verificar si esta línea es parte del título o ya es contenido
      // El contenido real suele empezar con mayúscula en una frase completa
      if (trimmed.length < 50 && !trimmed.match(/^[A-Z][a-z].+\.$/)) {
        titleLines.push(trimmed);
        continue;
      } else {
        // Ya no es título, es contenido
        currentTitulo = titleLines.join(' ').trim();
        collectingTitle = false;
        currentContenido.push(trimmed);
        continue;
      }
    }

    // Acumular contenido del tema
    if (inTema && !collectingTitle && trimmed.length > 0 && !trimmed.match(/^\d+$/)) {
      currentContenido.push(trimmed);
    }
  }

  // Guardar el último tema
  if (inTema && currentContenido.length > 0) {
    if (collectingTitle) {
      currentTitulo = titleLines.join(' ').trim();
    }
    temas.push({
      bloque: currentBloque,
      bloqueNumero: currentBloqueNumero,
      temaNumero: currentTemaNumero,
      titulo: currentTitulo,
      contenido: currentContenido.join('\n').trim()
    });
  }

  return temas;
}

// Función para generar preguntas usando OpenAI
async function generateQuestions(tema: Tema, manualName: string, numQuestions: number = 6): Promise<Pregunta[]> {
  console.log(`Generando ${numQuestions} preguntas para: ${tema.bloque} - Tema ${tema.temaNumero}: ${tema.titulo}`);

  const prompt = `Eres un experto en Derecho español. A partir del siguiente contenido del manual, genera EXACTAMENTE ${numQuestions} preguntas de tipo argumentativo para un examen de oposiciones.

CONTENIDO DEL TEMA:
${tema.contenido.substring(0, 8000)}

INSTRUCCIONES:
1. Genera ${numQuestions} preguntas argumentativas que requieran análisis y razonamiento jurídico
2. Cada pregunta debe ser clara y específica sobre el contenido del tema
3. Las respuestas deben ser precisas y fundamentadas en el contenido del tema
4. Cada respuesta debe tener MÁXIMO 5 líneas
5. Las preguntas deben cubrir diferentes aspectos del tema

FORMATO DE RESPUESTA:
Devuelve SOLO un JSON válido con este formato exacto:
{
  "preguntas": [
    {
      "pregunta": "texto de la pregunta",
      "respuesta": "respuesta en máximo 5 líneas"
    }
  ]
}

IMPORTANTE: Devuelve SOLO el JSON, sin texto adicional antes o después.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'Eres un experto en Derecho español especializado en crear preguntas de examen para oposiciones. Siempre respondes en formato JSON válido.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 3000
    });

    const content = response.choices[0].message.content || '';

    // Limpiar el contenido para extraer solo el JSON
    let jsonContent = content.trim();

    // Eliminar markdown si existe
    if (jsonContent.startsWith('```json')) {
      jsonContent = jsonContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    } else if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/```\n?/g, '');
    }

    const parsed = JSON.parse(jsonContent);

    const preguntas: Pregunta[] = parsed.preguntas.map((q: any) => ({
      pregunta: q.pregunta,
      respuesta: q.respuesta,
      manual: manualName,
      bloque: `Bloque ${tema.bloqueNumero}`,
      tema: `Tema ${tema.temaNumero}: ${tema.titulo}`
    }));

    console.log(`✓ Generadas ${preguntas.length} preguntas`);
    return preguntas;

  } catch (error) {
    console.error(`Error generando preguntas para tema ${tema.temaNumero}:`, error);
    return [];
  }
}

// Función para guardar preguntas en formato txt
function saveQuestions(preguntas: Pregunta[], outputPath: string) {
  let content = '';

  for (const p of preguntas) {
    content += `Pregunta: ${p.pregunta}\n`;
    content += `Respuesta Correcta: ${p.respuesta}\n`;
    content += `Manual: ${p.manual}\n`;
    content += `Bloque: ${p.bloque}\n`;
    content += `Tema: ${p.tema}\n`;
    content += `\n`;
  }

  // Crear directorio si no existe
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, content, 'utf-8');
  console.log(`\n✅ Preguntas guardadas en: ${outputPath}`);
}

// Función principal
async function main() {
  // Obtener argumentos de línea de comandos
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('❌ Uso: npm run generate-questions -- "Nombre del Manual" "ruta/al/manual.txt"');
    console.error('Ejemplo: npm run generate-questions -- "Manual Civil 1" "manuales/Manuales txt/Manual Civil 1.txt"');
    console.error('Ejemplo: npm run generate-questions -- "Manual Arbitraje" "manuales/Manuales txt/Manual Arbitraje.txt"');
    process.exit(1);
  }

  const manualName = args[0];
  const manualRelativePath = args[1];

  const manualPath = path.join(__dirname, '..', manualRelativePath);
  const outputPath = path.join(__dirname, '../manuales/Preguntas', `Preguntas ${manualName}.txt`);

  console.log(`\n📖 Manual: ${manualName}`);
  console.log(`📂 Ruta: ${manualPath}`);
  console.log(`💾 Salida: ${outputPath}\n`);

  if (!fs.existsSync(manualPath)) {
    console.error(`❌ Error: No se encontró el archivo en ${manualPath}`);
    process.exit(1);
  }

  console.log('🔍 Parseando manual...');
  const temas = parseManual(manualPath);

  if (temas.length === 0) {
    console.log('⚠️ No se detectaron temas. Mostrando primeros temas encontrados...');
    console.log('El archivo existe?', fs.existsSync(manualPath));
  } else {
    console.log(`✓ Encontrados ${temas.length} temas en ${Math.max(...temas.map(t => t.bloqueNumero))} bloques`);
    console.log('\nPrimeros 3 temas:');
    temas.slice(0, 3).forEach(t => {
      console.log(`  - Bloque ${t.bloqueNumero}, Tema ${t.temaNumero}: ${t.titulo}`);
      console.log(`    Contenido: ${t.contenido.substring(0, 100)}...`);
    });
  }
  console.log();

  const allPreguntas: Pregunta[] = [];

  // Generar preguntas para cada tema
  for (const tema of temas) {
    if (tema.contenido.length < 100) {
      console.log(`⚠️ Tema ${tema.temaNumero} tiene poco contenido, saltando...`);
      continue;
    }

    const preguntas = await generateQuestions(tema, manualName, 6);
    allPreguntas.push(...preguntas);

    // Pequeña pausa para evitar rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log(`\n📊 Total de preguntas generadas: ${allPreguntas.length}`);

  // Guardar todas las preguntas
  saveQuestions(allPreguntas, outputPath);

  console.log('\n🎉 Proceso completado exitosamente!');
}

// Ejecutar
main().catch(console.error);
