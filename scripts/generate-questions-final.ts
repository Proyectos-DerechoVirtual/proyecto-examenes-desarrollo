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

function parseManual(filePath: string): Tema[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const temas: Tema[] = [];

  // Dividir el contenido en bloques
  const bloqueMatches = Array.from(content.matchAll(/BLOQUE\s+(\d+)\s*\n([^\n]+)/g));

  for (let i = 0; i < bloqueMatches.length; i++) {
    const bloqueNum = parseInt(bloqueMatches[i][1]);
    const bloqueTitulo = bloqueMatches[i][2].trim();
    const bloqueIndex = bloqueMatches[i].index!;
    const siguienteBloqueIndex = i < bloqueMatches.length - 1 ? bloqueMatches[i + 1].index! : content.length;

    const bloqueContent = content.substring(bloqueIndex, siguienteBloqueIndex);

    // Buscar todos los "Tema X:" en este bloque
    const temaMatches = Array.from(bloqueContent.matchAll(/\s+Tema\s+(\d+):/g));

    for (let j = 0; j < temaMatches.length; j++) {
      const temaNum = parseInt(temaMatches[j][1]);
      const temaStartIndex = temaMatches[j].index!;
      const temaEndIndex = j < temaMatches.length - 1 ? temaMatches[j + 1].index! : bloqueContent.length;

      const temaContent = bloqueContent.substring(temaStartIndex, temaEndIndex);

      // Extraer el título (las primeras líneas después de "Tema X:")
      const lines = temaContent.split('\n');
      let titleLines: string[] = [];
      let contentLines: string[] = [];
      let inTitle = true;

      for (let k = 0; k < lines.length; k++) {
        const line = lines[k].trim();

        // Saltar la línea que contiene "Tema X:"
        if (line.match(/^Tema\s+\d+:/)) {
          const resto = line.replace(/^Tema\s+\d+:\s*/, '').trim();
          if (resto) titleLines.push(resto);
          continue;
        }

        // Si es un número solo (página), saltar
        if (line.match(/^\d+$/)) continue;

        // Si la línea es corta y aún estamos en el título, es parte del título
        if (inTitle && line.length > 0 && line.length < 60 && !line.endsWith('.')) {
          titleLines.push(line);
        } else if (line.length > 0) {
          // Ya empieza el contenido
          inTitle = false;
          contentLines.push(line);
        }
      }

      const titulo = titleLines.join(' ').trim();
      const contenido = contentLines.join('\n').trim();

      if (contenido.length > 100) {  // Solo agregar si tiene contenido significativo
        temas.push({
          bloque: `BLOQUE ${bloqueNum}: ${bloqueTitulo}`,
          bloqueNumero: bloqueNum,
          temaNumero: temaNum,
          titulo: titulo,
          contenido: contenido
        });
      }
    }
  }

  return temas;
}

async function generateQuestions(tema: Tema, numQuestions: number = 6): Promise<Pregunta[]> {
  console.log(`Generando ${numQuestions} preguntas para: ${tema.bloque} - Tema ${tema.temaNumero}: ${tema.titulo}`);

  const prompt = `Eres un experto en Derecho español especializado en arbitraje. A partir del siguiente contenido del manual, genera EXACTAMENTE ${numQuestions} preguntas de tipo argumentativo para un examen de oposiciones.

CONTENIDO DEL TEMA:
${tema.contenido.substring(0, 8000)}

INSTRUCCIONES:
1. Genera ${numQuestions} preguntas argumentativas que requieran análisis y razonamiento jurídico
2. Cada pregunta debe ser clara y específica sobre el contenido del tema
3. Las respuestas deben ser precisas y fundamentadas en el contenido del tema
4. Cada respuesta debe tener MÁXIMO 5 líneas (aproximadamente 400-500 caracteres)
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
      manual: 'Manual Arbitraje',
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

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, content, 'utf-8');
  console.log(`\n✅ Preguntas guardadas en: ${outputPath}`);
}

async function main() {
  const manualPath = path.join(__dirname, '../manuales/Manuales txt/Manual Arbitraje.txt');
  const outputPath = path.join(__dirname, 'Preguntas Manual Arbitraje.txt');

  console.log('🔍 Parseando manual...\n');
  const temas = parseManual(manualPath);
  console.log(`✅ Encontrados ${temas.length} temas en ${Math.max(...temas.map(t => t.bloqueNumero))} bloques\n`);

  // Mostrar primeros temas
  console.log('Primeros 5 temas:');
  temas.slice(0, 5).forEach(t => {
    console.log(`  - Bloque ${t.bloqueNumero}, Tema ${t.temaNumero}: ${t.titulo}`);
  });
  console.log();

  const allPreguntas: Pregunta[] = [];

  // Generar preguntas para cada tema
  for (const tema of temas) {
    const preguntas = await generateQuestions(tema, 6);
    allPreguntas.push(...preguntas);

    // Pequeña pausa para evitar rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log(`\n📊 Total de preguntas generadas: ${allPreguntas.length}`);

  // Guardar todas las preguntas
  saveQuestions(allPreguntas, outputPath);

  console.log('\n🎉 Proceso completado exitosamente!');
  console.log(`Archivo generado: ${outputPath}`);
}

main().catch(console.error);
