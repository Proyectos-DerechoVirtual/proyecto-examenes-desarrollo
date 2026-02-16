import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

// Configurar clientes
const openai = new OpenAI({
  apiKey: process.env.VITE_OPENAI_API_KEY || process.env.OPENAI_API_KEY
});

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: Faltan credenciales de Supabase en el archivo .env');
  console.error('   Necesitas agregar:');
  console.error('   SUPABASE_URL=tu-url-de-supabase');
  console.error('   SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Banco de 30 preguntas con respuestas modelo
const questionsBank = [
  {
    pregunta: "¿Cuáles son los principios fundamentales del proceso civil español? Menciona al menos tres y explica brevemente cada uno.",
    respuesta_correcta: "Los principios fundamentales del proceso civil español son: 1) Principio dispositivo: Las partes tienen el poder de iniciar, impulsar y disponer del proceso. 2) Principio de contradicción: Ambas partes deben tener la oportunidad de ser oídas y presentar sus argumentos. 3) Principio de igualdad de armas: Las partes deben tener las mismas oportunidades procesales para defender sus posiciones. 4) Principio de publicidad: Las actuaciones judiciales son públicas salvo excepciones legales.",
    tema: 1,
    categoria: "Principios Procesales",
    manual: "Manual de Derecho Procesal Civil"
  },
  {
    pregunta: "Explica el principio dispositivo en el proceso civil. ¿Qué implica para las partes?",
    respuesta_correcta: "El principio dispositivo establece que son las partes quienes tienen el poder de iniciar, impulsar y disponer del proceso. Esto implica que: el juez no puede iniciar un proceso de oficio, debe ser a instancia de parte; las partes determinan el objeto del proceso mediante sus pretensiones; pueden disponer del proceso mediante renuncia, allanamiento o transacción; y deben aportar los hechos y pruebas necesarias para sustentar sus alegaciones.",
    tema: 1,
    categoria: "Principios Procesales",
    manual: "Manual de Derecho Procesal Civil"
  },
  {
    pregunta: "Define el principio de contradicción y su importancia en el proceso civil español.",
    respuesta_correcta: "El principio de contradicción garantiza que ambas partes en el proceso tengan la oportunidad real y efectiva de ser oídas, presentar sus argumentos, proponer y practicar pruebas, y contradecir las alegaciones de la parte contraria. Su importancia radica en que es un elemento esencial del derecho a la tutela judicial efectiva y del debido proceso, asegurando que ninguna de las partes quede en indefensión.",
    tema: 1,
    categoria: "Principios Procesales",
    manual: "Manual de Derecho Procesal Civil"
  },
  {
    pregunta: "¿Qué significa el principio de igualdad de armas? Proporciona ejemplos de su aplicación.",
    respuesta_correcta: "El principio de igualdad de armas significa que ambas partes deben tener las mismas oportunidades procesales para defender sus posiciones sin que existan privilegios para ninguna. Ejemplos de aplicación: ambas partes tienen los mismos plazos para contestar demandas; iguales facultades probatorias; mismas posibilidades de recurrir; y el mismo acceso a la justicia gratuita si cumplen requisitos. Este principio se ve reflejado en el artículo 10 de la LEC.",
    tema: 1,
    categoria: "Principios Procesales",
    manual: "Manual de Derecho Procesal Civil"
  },
  {
    pregunta: "Explica las diferencias principales entre el juicio ordinario y el juicio verbal en cuanto a su aplicación y procedimiento.",
    respuesta_correcta: "El juicio ordinario se aplica para asuntos de mayor cuantía (más de 6.000€) o especial complejidad, mientras el verbal es para asuntos más simples o de menor cuantía. En el ordinario hay audiencia previa y posterior juicio; en el verbal todo se concentra en una vista. El ordinario tiene fase de alegaciones escritas más desarrollada; el verbal es más oral y concentrado. El ordinario tiene más posibilidades de prueba documental previa; el verbal se centra en la oralidad durante la vista.",
    tema: 2,
    categoria: "Tipos de Procedimiento",
    manual: "Manual de Derecho Procesal Civil"
  },
  {
    pregunta: "¿Cuándo se aplica el juicio ordinario? Describe sus fases principales.",
    respuesta_correcta: "El juicio ordinario se aplica cuando la cuantía supera los 6.000 euros o en casos de especial complejidad jurídica independientemente de la cuantía. Sus fases son: 1) Demanda y contestación (alegaciones escritas); 2) Audiencia previa (saneamiento, fijación de objeto, proposición y admisión de prueba); 3) Juicio o vista (práctica de prueba y conclusiones); 4) Sentencia; 5) Posibles recursos.",
    tema: 2,
    categoria: "Tipos de Procedimiento",
    manual: "Manual de Derecho Procesal Civil"
  },
  {
    pregunta: "¿En qué casos se utiliza el juicio verbal? Menciona al menos tres supuestos específicos.",
    respuesta_correcta: "El juicio verbal se utiliza en: 1) Asuntos cuya cuantía no supere los 6.000 euros; 2) Reclamación de rentas o cantidades debidas por razón de bienes muebles en precario; 3) Tutela de derechos reales inscritos sobre bienes inmuebles; 4) Impugnación de acuerdos sociales; 5) Propiedad horizontal; 6) Reclamaciones por daños causados en accidente de circulación; 7) Defensa de derechos del consumidor.",
    tema: 2,
    categoria: "Tipos de Procedimiento",
    manual: "Manual de Derecho Procesal Civil"
  },
  {
    pregunta: "Compara la audiencia previa del juicio ordinario con la vista del juicio verbal.",
    respuesta_correcta: "La audiencia previa del juicio ordinario es una fase preparatoria donde se sanea el proceso, se fija definitivamente el objeto, se proponen y admiten pruebas, pero no se practica la prueba. La vista del juicio verbal concentra todo: alegaciones complementarias, práctica de prueba y conclusiones en un solo acto. La audiencia previa es escrita en cuanto a preparación; la vista es plenamente oral. La audiencia previa puede durar menos tiempo; la vista debe resolver todo el asunto en una sesión.",
    tema: 2,
    categoria: "Tipos de Procedimiento",
    manual: "Manual de Derecho Procesal Civil"
  },
  {
    pregunta: "¿Qué elementos debe contener una demanda según la LEC? Enumera al menos cinco.",
    respuesta_correcta: "Según la LEC (artículo 399), la demanda debe contener: 1) Tribunal ante el que se interpone; 2) Datos identificativos del demandante y demandado; 3) Domicilio o residencia de las partes; 4) Hechos en que se funde la pretensión, numerados; 5) Fundamentos de derecho; 6) Petición clara y precisa (suplico); 7) Documentos esenciales; 8) Firma del abogado y procurador; 9) Valor de la demanda si es necesario.",
    tema: 3,
    categoria: "La Demanda",
    manual: "Manual de Derecho Procesal Civil"
  },
  {
    pregunta: "Explica la diferencia entre hechos y fundamentos de derecho en una demanda.",
    respuesta_correcta: "Los hechos son las circunstancias fácticas, los acontecimientos concretos ocurridos en la realidad que dan origen a la pretensión. Deben narrarse de forma clara, numerada y cronológica. Los fundamentos de derecho son las normas jurídicas aplicables a esos hechos, la argumentación legal que justifica la pretensión. Mientras los hechos describen 'qué pasó', los fundamentos explican 'por qué la ley ampara la pretensión'. Ambos son esenciales para fundamentar la demanda.",
    tema: 3,
    categoria: "La Demanda",
    manual: "Manual de Derecho Procesal Civil"
  },
  {
    pregunta: "¿Qué es el suplico en una demanda y qué requisitos debe cumplir?",
    respuesta_correcta: "El suplico es la petición formal que el demandante dirige al tribunal, solicitando que se dicte sentencia conforme a sus pretensiones. Debe ser: 1) Claro y preciso, sin ambigüedades; 2) Congruente con los hechos y fundamentos expuestos; 3) Determinado en cuanto a lo que se pide; 4) Puede incluir petición principal y subsidiaria; 5) Debe respetar el principio dispositivo. Es el elemento esencial que delimita el objeto del proceso.",
    tema: 3,
    categoria: "La Demanda",
    manual: "Manual de Derecho Procesal Civil"
  },
  {
    pregunta: "Enumera los principales recursos que caben contra resoluciones judiciales y explica brevemente cada uno.",
    respuesta_correcta: "Los principales recursos son: 1) Recurso de reposición: contra providencias y autos no definitivos, ante el mismo órgano que dictó la resolución; 2) Recurso de apelación: contra sentencias de primera instancia y autos definitivos, ante el tribunal superior; 3) Recurso de casación: contra sentencias dictadas en segunda instancia, ante el Tribunal Supremo, solo en casos tasados; 4) Recurso extraordinario por infracción procesal: para cuestiones procesales, ante el Tribunal Superior de Justicia o Tribunal Supremo.",
    tema: 4,
    categoria: "Recursos",
    manual: "Manual de Derecho Procesal Civil"
  },
  {
    pregunta: "¿Qué es el recurso de reposición? ¿Contra qué resoluciones se interpone?",
    respuesta_correcta: "El recurso de reposición es un recurso ordinario que se interpone contra providencias y autos no definitivos (aquellos que no ponen fin al proceso ni impiden su continuación). Se presenta ante el mismo órgano judicial que dictó la resolución, en el plazo de cinco días desde la notificación. Su finalidad es que el propio tribunal reconsidere su decisión. Es potestativo, no siendo necesario agotarlo para recurrir posteriormente si procede.",
    tema: 4,
    categoria: "Recursos",
    manual: "Manual de Derecho Procesal Civil"
  },
  {
    pregunta: "Explica el recurso de apelación: ¿ante qué órgano se presenta y qué plazo tiene?",
    respuesta_correcta: "El recurso de apelación se interpone contra sentencias dictadas en primera instancia y contra autos definitivos que pongan fin al proceso. Se presenta ante el tribunal que dictó la resolución, pero lo resuelve el tribunal superior (Audiencia Provincial). El plazo es de veinte días desde la notificación de la resolución. Permite un nuevo examen del asunto tanto en cuestiones de hecho como de derecho, aunque con ciertas limitaciones en cuanto a nueva prueba.",
    tema: 4,
    categoria: "Recursos",
    manual: "Manual de Derecho Procesal Civil"
  },
  {
    pregunta: "¿En qué casos procede el recurso de casación? ¿Cuál es su finalidad?",
    respuesta_correcta: "El recurso de casación procede contra sentencias dictadas en segunda instancia cuando: 1) La cuantía del proceso supera los 600.000 euros; 2) Existe interés casacional, es decir, cuando la sentencia vulnera normas sustantivas o jurisprudencia. Su finalidad no es revisar los hechos sino unificar la interpretación del derecho, corrigiendo infracciones legales y fijando doctrina jurisprudencial. Lo resuelve el Tribunal Supremo.",
    tema: 4,
    categoria: "Recursos",
    manual: "Manual de Derecho Procesal Civil"
  },
  {
    pregunta: "¿Qué son las medidas cautelares y qué debe valorar el juez para acordarlas? Menciona al menos dos tipos de medidas cautelares.",
    respuesta_correcta: "Las medidas cautelares son resoluciones provisionales adoptadas para asegurar la efectividad de la sentencia futura. El juez debe valorar: 1) Fumus boni iuris (apariencia de buen derecho): que la pretensión parezca fundada; 2) Periculum in mora (peligro en la demora): riesgo de que el tiempo del proceso haga ineficaz la sentencia. Tipos: embargo preventivo de bienes, anotación preventiva de demanda, intervención judicial, depósito de cosa mueble, formación de inventarios.",
    tema: 5,
    categoria: "Medidas Cautelares",
    manual: "Manual de Derecho Procesal Civil"
  },
  {
    pregunta: "Define 'fumus boni iuris' y 'periculum in mora'. ¿Por qué son importantes en las medidas cautelares?",
    respuesta_correcta: "Fumus boni iuris (apariencia de buen derecho) significa que existen indicios razonables de que la pretensión del solicitante está fundada en derecho. Periculum in mora (peligro en la demora) es el riesgo de que, durante la tramitación del proceso, se produzcan situaciones que hagan ineficaz o imposible ejecutar la futura sentencia. Son importantes porque son los dos requisitos esenciales que el juez debe comprobar para acordar una medida cautelar, equilibrando la protección del solicitante con el respeto a los derechos del demandado.",
    tema: 5,
    categoria: "Medidas Cautelares",
    manual: "Manual de Derecho Procesal Civil"
  },
  {
    pregunta: "¿Qué es el embargo preventivo de bienes? ¿Cuándo puede acordarse?",
    respuesta_correcta: "El embargo preventivo es una medida cautelar que inmoviliza jurídicamente bienes del demandado para asegurar el cumplimiento de una eventual condena dineraria. Puede acordarse cuando existe riesgo de que el deudor oculte, enajene o disponga de sus bienes, haciendo imposible la ejecución futura. Requiere acreditar fumus boni iuris y periculum in mora, y puede exigirse caución. Los bienes embargados no se transmiten al demandante, solo quedan afectados a la eventual ejecución.",
    tema: 5,
    categoria: "Medidas Cautelares",
    manual: "Manual de Derecho Procesal Civil"
  },
  {
    pregunta: "Explica qué es la anotación preventiva de demanda y su finalidad.",
    respuesta_correcta: "La anotación preventiva de demanda es una medida cautelar que consiste en hacer constar en el Registro de la Propiedad la existencia de un litigio sobre un bien inmueble. Su finalidad es dar publicidad a la pendencia del proceso, de modo que terceros que adquieran derechos sobre el inmueble queden afectados por la futura sentencia. Protege al demandante frente a posibles enajenaciones o gravámenes del bien durante el proceso. Su efecto principal es la oponibilidad erga omnes de la sentencia.",
    tema: 5,
    categoria: "Medidas Cautelares",
    manual: "Manual de Derecho Procesal Civil"
  },
  {
    pregunta: "Describe el proceso de ejecución forzosa de una sentencia. ¿Qué pasos se siguen si el condenado no cumple voluntariamente?",
    respuesta_correcta: "El proceso de ejecución forzosa sigue estos pasos: 1) Solicitud de ejecución por la parte interesada; 2) Despacho de ejecución por el tribunal; 3) Requerimiento de pago al ejecutado (si es condena dineraria); 4) Si no paga: embargo de bienes siguiendo el orden de prelación legal; 5) Valoración de los bienes embargados; 6) Subasta o realización de los bienes; 7) Pago al ejecutante con el producto obtenido. Si la condena no es dineraria, se adoptan medidas específicas para su cumplimiento.",
    tema: 6,
    categoria: "Ejecución",
    manual: "Manual de Derecho Procesal Civil"
  },
  {
    pregunta: "¿Qué es el requerimiento de pago en la fase de ejecución? ¿Qué ocurre si el ejecutado no cumple?",
    respuesta_correcta: "El requerimiento de pago es el acto por el cual el tribunal ordena al ejecutado que cumpla voluntariamente con la condena (generalmente pagar una cantidad) dentro de un plazo determinado (normalmente diez días). Si el ejecutado no cumple en ese plazo, se procede al embargo de sus bienes. El requerimiento permite al ejecutado evitar el embargo cumpliendo voluntariamente, lo cual es beneficioso para ambas partes ya que evita costes adicionales.",
    tema: 6,
    categoria: "Ejecución",
    manual: "Manual de Derecho Procesal Civil"
  },
  {
    pregunta: "Explica el proceso de embargo de bienes en una ejecución. ¿Qué orden de prelación existe?",
    respuesta_correcta: "El embargo de bienes sigue un orden de prelación establecido en el artículo 592 LEC: 1) Dinero o cuentas corrientes; 2) Créditos y derechos realizables a corto plazo; 3) Joyas y objetos de arte; 4) Rentas y frutos de toda especie; 5) Bienes muebles; 6) Inmuebles; 7) Sueldos y pensiones; 8) Créditos y derechos realizables a largo plazo; 9) Empresas. Este orden busca maximizar la efectividad y minimizar el perjuicio para el ejecutado, privilegiando bienes más líquidos.",
    tema: 6,
    categoria: "Ejecución",
    manual: "Manual de Derecho Procesal Civil"
  },
  {
    pregunta: "¿Qué es la cosa juzgada y cuál es su importancia en el proceso civil? Diferencia entre cosa juzgada formal y material.",
    respuesta_correcta: "La cosa juzgada es la cualidad de las sentencias firmes que las hace inmutables e inimpugnables. Su importancia radica en garantizar la seguridad jurídica evitando procesos contradictorios. Cosa juzgada formal: imposibilidad de recurrir la sentencia dentro del mismo proceso (firmeza). Cosa juzgada material: efecto positivo (lo decidido vincula en futuros procesos entre las mismas partes) y negativo (impide un nuevo proceso sobre el mismo objeto entre las mismas partes). La material trasciende el proceso concreto.",
    tema: 7,
    categoria: "Instituciones Procesales",
    manual: "Manual de Derecho Procesal Civil"
  },
  {
    pregunta: "Define la litispendencia. ¿Qué efectos produce en el proceso?",
    respuesta_correcta: "La litispendencia es la situación que se produce cuando existen dos procesos simultáneos con identidad de partes, objeto y causa de pedir (triple identidad). Sus efectos son: 1) El segundo proceso debe ser sobreseid (paralizado) hasta que el primero concluya; 2) Produce efectos preclusivos impidiendo modificar sustancialmente la demanda; 3) Puede producir efectos interruptivos de la prescripción. Su finalidad es evitar sentencias contradictorias y el abuso procesal.",
    tema: 7,
    categoria: "Instituciones Procesales",
    manual: "Manual de Derecho Procesal Civil"
  },
  {
    pregunta: "¿Qué es la rebeldía procesal? ¿Implica que el demandado pierda automáticamente el juicio?",
    respuesta_correcta: "La rebeldía procesal es la situación en que se encuentra el demandado que no comparece ni contesta la demanda. NO implica perder automáticamente el juicio ni equivale a allanamiento. El demandado rebelde puede: comparecer posteriormente (aunque sin retroceder el proceso), proponer prueba sobre hechos no admitidos, y recurrir la sentencia. El proceso continúa y el demandante debe probar sus alegaciones. La rebeldía solo implica pérdida de oportunidades procesales, no reconocimiento de los hechos.",
    tema: 7,
    categoria: "Instituciones Procesales",
    manual: "Manual de Derecho Procesal Civil"
  },
  {
    pregunta: "Explica el régimen de costas procesales en el proceso civil. ¿Cuándo se condena en costas?",
    respuesta_correcta: "El régimen de costas se basa en el principio de vencimiento objetivo: quien pierde el pleito paga las costas. Se condena en costas cuando: 1) Una parte es totalmente vencida; 2) No se aprecia temeridad o mala fe pero hay vencimiento total. No se imponen costas cuando: el vencimiento es parcial, hay motivos serios de litigar, o circunstancias excepcionales. Las costas incluyen: honorarios de abogado, procurador, peritos, tasas judiciales y otros gastos necesarios. El objetivo es compensar al vencedor y desincentivar litigios infundados.",
    tema: 8,
    categoria: "Costas y Plazos",
    manual: "Manual de Derecho Procesal Civil"
  },
  {
    pregunta: "¿Qué son los plazos procesales? Menciona al menos tres plazos importantes y sus duraciones.",
    respuesta_correcta: "Los plazos procesales son los períodos de tiempo establecidos para realizar actos procesales. Son improrrogables y perentorios. Plazos importantes: 1) Contestación a la demanda en juicio ordinario: 20 días; 2) Interposición de recurso de apelación: 20 días; 3) Recurso de reposición: 5 días; 4) Oposición a la ejecución: 10 días; 5) Contestación en juicio verbal: 10 días; 6) Proposición de prueba en juicio ordinario: en la audiencia previa. Su finalidad es garantizar la celeridad y seguridad del proceso.",
    tema: 8,
    categoria: "Costas y Plazos",
    manual: "Manual de Derecho Procesal Civil"
  },
  {
    pregunta: "¿Cómo se cuentan los plazos procesales? ¿Qué días se consideran inhábiles?",
    respuesta_correcta: "Los plazos procesales se cuentan por días hábiles, excluyendo: 1) Sábados y domingos; 2) Festivos nacionales y autonómicos del lugar donde radica el tribunal; 3) Mes de agosto (inhábil judicial); 4) Del 24 al 31 de diciembre. Se cuenta desde el día siguiente a la notificación y el último día se incluye completo hasta las 15:00 horas. Si el último día es inhábil, el plazo se prorroga al primer día hábil siguiente. Para el cómputo se usa el calendario oficial publicado por el CGPJ.",
    tema: 8,
    categoria: "Costas y Plazos",
    manual: "Manual de Derecho Procesal Civil"
  },
  {
    pregunta: "Describe el procedimiento completo desde que se presenta una demanda hasta que se ejecuta la sentencia.",
    respuesta_correcta: "Procedimiento completo en juicio ordinario: 1) Presentación de demanda; 2) Admisión a trámite y traslado al demandado; 3) Contestación de la demanda (20 días); 4) Audiencia previa (saneamiento, fijación de objeto, admisión de prueba); 5) Juicio o vista (práctica de prueba y conclusiones); 6) Sentencia; 7) Notificación y posibilidad de recursos; 8) Firmeza de la sentencia; 9) Solicitud de ejecución; 10) Despacho de ejecución; 11) Requerimiento de pago; 12) Embargo de bienes si no se cumple; 13) Realización de bienes; 14) Pago al ejecutante.",
    tema: 9,
    categoria: "Visión Integral",
    manual: "Manual de Derecho Procesal Civil"
  },
  {
    pregunta: "Compara el proceso civil español con los principios de un proceso justo. ¿Qué garantías ofrece la LEC?",
    respuesta_correcta: "El proceso civil español respeta los principios del proceso justo estableciendo garantías como: 1) Derecho a la tutela judicial efectiva (art. 24 CE); 2) Igualdad de armas entre las partes; 3) Derecho de defensa y asistencia letrada; 4) Contradicción y audiencia de las partes; 5) Publicidad de las actuaciones; 6) Motivación de las resoluciones judiciales; 7) Derecho a la prueba; 8) Derecho a recurrir; 9) Plazo razonable de duración; 10) Juez imparcial y predeterminado por la ley. La LEC desarrolla estas garantías constitucionalmente reconocidas.",
    tema: 9,
    categoria: "Visión Integral",
    manual: "Manual de Derecho Procesal Civil"
  }
];

// Función para calcular embeddings
async function calculateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error('Error calculando embedding:', error);
    throw error;
  }
}

// Función para procesar y subir preguntas
async function processAndUploadQuestions() {
  console.log('🚀 Iniciando proceso de generación y carga de preguntas...\n');
  console.log(`📝 Total de preguntas a procesar: ${questionsBank.length}\n`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < questionsBank.length; i++) {
    const question = questionsBank[i];
    const progress = `[${i + 1}/${questionsBank.length}]`;

    try {
      console.log(`${progress} Procesando pregunta sobre: "${question.pregunta.substring(0, 60)}..."`);

      // Calcular embeddings
      console.log(`   ⏳ Calculando embedding de pregunta...`);
      const embeddingPregunta = await calculateEmbedding(question.pregunta);

      console.log(`   ⏳ Calculando embedding de respuesta...`);
      const embeddingRespuesta = await calculateEmbedding(question.respuesta_correcta);

      // Insertar en Supabase
      console.log(`   💾 Insertando en base de datos...`);
      const { data, error } = await supabase
        .from('examen_preguntas')
        .insert({
          pregunta: question.pregunta,
          embedding_pregunta: embeddingPregunta,
          respuesta_correcta: question.respuesta_correcta,
          embedding_respuesta: embeddingRespuesta,
          tema: question.tema,
          categoria: question.categoria,
          manual: question.manual,
          source_file: 'generated_questions.ts'
        })
        .select();

      if (error) {
        throw error;
      }

      console.log(`   ✅ Pregunta ${i + 1} insertada correctamente (ID: ${data[0].id})\n`);
      successCount++;

      // Pequeña pausa para evitar rate limiting de OpenAI
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.error(`   ❌ Error procesando pregunta ${i + 1}:`, error);
      errorCount++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMEN FINAL:');
  console.log('='.repeat(60));
  console.log(`✅ Preguntas insertadas correctamente: ${successCount}`);
  console.log(`❌ Errores: ${errorCount}`);
  console.log(`📈 Total procesadas: ${successCount + errorCount}/${questionsBank.length}`);
  console.log('='.repeat(60));
}

// Ejecutar el script
processAndUploadQuestions()
  .then(() => {
    console.log('\n🎉 Proceso completado exitosamente!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Error fatal:', error);
    process.exit(1);
  });
