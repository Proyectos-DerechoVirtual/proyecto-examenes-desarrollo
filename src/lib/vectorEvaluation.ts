// Evaluación de respuestas usando Gemini 3 Flash

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-3-flash-preview';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Interfaz para la evaluación completa generada por IA
interface AIEvaluationResult {
  score: number;
  strengths: string;
  improvements: string;
  feedback: string;
}

// Función para llamar a Gemini API
async function callGeminiAPI(prompt: string, systemPrompt: string): Promise<string> {
  const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: `${systemPrompt}\n\n${prompt}` }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048,
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  // Extraer el texto de la respuesta de Gemini
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text;
}

// Función para evaluar respuesta completa usando Gemini (nota + feedback)
async function evaluateWithAI(
  questionText: string,
  studentAnswer: string,
  correctAnswer: string
): Promise<AIEvaluationResult> {
  try {
    const systemPrompt = 'Eres un evaluador experto de exámenes de oposiciones de justicia. Calificas de forma justa y exigente. Proporcionas evaluaciones específicas en formato JSON. Nunca uses frases genéricas.';

    const prompt = `Eres un profesor experto en oposiciones de justicia española. Tu tarea es EVALUAR y CALIFICAR la respuesta de un estudiante comparándola con la respuesta modelo correcta.

PREGUNTA DEL EXAMEN:
${questionText}

RESPUESTA DEL ESTUDIANTE:
${studentAnswer}

RESPUESTA MODELO (CORRECTA):
${correctAnswer}

INSTRUCCIONES DE CALIFICACIÓN:
Asigna una nota de 0 a 10 considerando:
- **Exactitud y corrección técnica (40%)**: ¿Los conceptos mencionados son correctos?
- **Completitud (30%)**: ¿Incluye los elementos clave de la respuesta modelo?
- **Claridad y estructura (20%)**: ¿Está bien redactada y organizada?
- **Terminología jurídica (10%)**: ¿Usa los términos técnicos correctos?

ESCALA DE NOTAS:
- 9-10: Excelente. Respuesta casi perfecta, incluye todos los conceptos clave.
- 7-8.9: Muy bien. Respuesta sólida con la mayoría de conceptos importantes.
- 5-6.9: Suficiente. Respuesta aceptable pero incompleta o con imprecisiones.
- 3-4.9: Insuficiente. Respuesta muy incompleta o con errores significativos.
- 0-2.9: Muy deficiente. Respuesta incorrecta, irrelevante o sin sentido.

Proporciona tu evaluación en formato JSON:
{
  "score": <número del 0 al 10 con un decimal>,
  "strengths": "<3 líneas. Qué hizo bien el estudiante. Menciona conceptos correctos que incluyó. Usa **negrita** para términos importantes.>",
  "improvements": "<3 líneas. Qué conceptos clave faltaron o fueron incorrectos. Sé específico sobre qué debía incluir. Usa **negrita** para términos importantes.>",
  "feedback": "<4-5 líneas. Explica qué debía responder el estudiante. Resume los puntos clave de la respuesta correcta usando **negrita** para los conceptos más importantes. NO incluyas la respuesta modelo textual, solo explica con tus palabras qué debía decir.>"
}

IMPORTANTE:
- Usa **negrita** para los conceptos jurídicos importantes.
- En el feedback, explica CON TUS PALABRAS lo que debía responder, no copies la respuesta modelo.
- Si la respuesta es irrelevante o sin sentido, nota 0-2.
- Responde SOLO con el JSON, sin texto adicional ni bloques de código.`;

    const responseText = await callGeminiAPI(prompt, systemPrompt);

    // Limpiar la respuesta de posibles bloques de código markdown
    let cleanedResponse = responseText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/gi, '')
      .trim();

    // Intentar extraer JSON si hay texto adicional
    const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanedResponse = jsonMatch[0];
    }

    const evaluation = JSON.parse(cleanedResponse);

    // Validar y limitar la nota entre 0 y 10
    const score = Math.min(10, Math.max(0, parseFloat(evaluation.score) || 0));

    return {
      score: Math.round(score * 10) / 10,
      strengths: evaluation.strengths || 'No se pudo generar análisis.',
      improvements: evaluation.improvements || 'No se pudo generar análisis.',
      feedback: evaluation.feedback || 'No se pudo generar feedback.'
    };
  } catch (error) {
    console.error('Error evaluando con Gemini:', error);
    return {
      score: 0,
      strengths: 'Error al evaluar.',
      improvements: 'Error técnico.',
      feedback: 'Hubo un error al evaluar esta respuesta.'
    };
  }
}

// Interfaz para la evaluación
export interface VectorEvaluationResult {
  questionId: number;
  questionText: string;
  studentAnswer: string;
  correctAnswer: string;
  similarity: number;
  score: number;
  feedback: string;
  strengths: string;
  improvements: string;
}

// Función principal de evaluación con IA (nota + feedback por Gemini)
export async function evaluateAnswersByVector(
  answers: Array<{
    questionId: number;
    questionText: string;
    studentAnswer: string;
    correctAnswerText: string;
  }>
): Promise<{
  evaluations: VectorEvaluationResult[];
  averageScore: number;
  totalScore: number;
  averageSimilarity: number;
}> {
  const evaluations: VectorEvaluationResult[] = [];

  for (const answer of answers) {
    // Si no hay respuesta, dar nota mínima
    if (!answer.studentAnswer || answer.studentAnswer.trim().length === 0) {
      evaluations.push({
        questionId: answer.questionId,
        questionText: answer.questionText,
        studentAnswer: answer.studentAnswer,
        correctAnswer: answer.correctAnswerText,
        similarity: 0,
        score: 0,
        feedback: `No respondiste esta pregunta.\n\n📚 Respuesta modelo:\n"${answer.correctAnswerText}"`,
        strengths: 'No se proporcionó respuesta.',
        improvements: 'Debes responder la pregunta. Estudia la respuesta modelo para comprender los conceptos clave que debes incluir.'
      });
      continue;
    }

    // EVALUACIÓN COMPLETA POR IA: Gemini asigna nota y feedback
    const evaluationResult = await evaluateWithAI(
      answer.questionText,
      answer.studentAnswer,
      answer.correctAnswerText
    );

    evaluations.push({
      questionId: answer.questionId,
      questionText: answer.questionText,
      studentAnswer: answer.studentAnswer,
      correctAnswer: answer.correctAnswerText,
      similarity: 0, // Ya no se usa, mantenido por compatibilidad
      score: evaluationResult.score,
      feedback: evaluationResult.feedback,
      strengths: evaluationResult.strengths,
      improvements: evaluationResult.improvements
    });

    // Pausa para evitar rate limiting (Gemini es más tolerante pero mejor prevenir)
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  // Calcular promedios
  const totalScore = evaluations.reduce((sum, e) => sum + e.score, 0);
  const averageScore = evaluations.length > 0 ? totalScore / evaluations.length : 0;

  return {
    evaluations,
    averageScore,
    totalScore,
    averageSimilarity: 0 // Ya no se usa
  };
}
