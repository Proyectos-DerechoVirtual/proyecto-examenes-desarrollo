import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true // Solo para MVP, en producción usar backend
});

interface AnswerToEvaluate {
  questionId: number;
  questionText: string;
  studentAnswer: string;
}

interface QuestionEvaluation {
  questionId: number;
  questionText: string;
  studentAnswer: string;
  score: number;
  feedback: string;
  strengths: string;
  improvements: string;
}

interface ExamResults {
  evaluations: QuestionEvaluation[];
  averageScore: number;
  totalScore: number;
}

export async function evaluateAnswers(
  answers: AnswerToEvaluate[],
  legalContent: string
): Promise<ExamResults> {
  const evaluations: QuestionEvaluation[] = [];

  // Evaluar cada pregunta por separado para mejor precisión
  for (const answer of answers) {
    try {
      const evaluation = await evaluateSingleAnswer(answer, legalContent);
      evaluations.push(evaluation);
    } catch (error) {
      console.error(`Error evaluating question ${answer.questionId}:`, error);
      // En caso de error, dar una evaluación neutral
      evaluations.push({
        questionId: answer.questionId,
        questionText: answer.questionText,
        studentAnswer: answer.studentAnswer,
        score: 5,
        feedback: 'Hubo un error al evaluar esta respuesta. Por favor, consulta con un instructor.',
        strengths: 'No evaluado',
        improvements: 'No evaluado'
      });
    }
  }

  const totalScore = evaluations.reduce((sum, e) => sum + e.score, 0);
  const averageScore = totalScore / evaluations.length;

  return {
    evaluations,
    averageScore,
    totalScore
  };
}

async function evaluateSingleAnswer(
  answer: AnswerToEvaluate,
  legalContent: string
): Promise<QuestionEvaluation> {
  const prompt = `Eres un profesor experto en Derecho Procesal Civil español que evalúa exámenes de oposiciones de justicia.

CONTENIDO DE REFERENCIA:
${legalContent}

PREGUNTA DEL EXAMEN:
${answer.questionText}

RESPUESTA DEL ALUMNO:
${answer.studentAnswer || '(No respondida)'}

INSTRUCCIONES DE EVALUACIÓN:
1. Evalúa la respuesta del alumno basándote en el contenido de referencia proporcionado
2. La respuesta debe ser breve (5-8 líneas), así que valora la capacidad de síntesis
3. Asigna una puntuación de 0 a 10 considerando:
   - Exactitud y corrección técnica (40%)
   - Completitud de la respuesta (30%)
   - Claridad y estructura (20%)
   - Uso correcto de terminología jurídica (10%)
4. Si la respuesta está vacía, asigna 0 puntos

Proporciona tu evaluación en formato JSON con la siguiente estructura:
{
  "score": <número del 0 al 10>,
  "strengths": "<puntos fuertes de la respuesta en 1-2 frases>",
  "improvements": "<áreas de mejora específicas en 1-2 frases>",
  "feedback": "<feedback detallado y constructivo explicando la puntuación, qué está bien y qué se puede mejorar, 3-4 frases>"
}

IMPORTANTE:
- Sé justo pero exigente, como en unas oposiciones reales
- El feedback debe ser constructivo y accionable
- Si la respuesta está vacía, indica "No se proporcionó respuesta" en strengths y "Debes responder la pregunta" en improvements
- Responde SOLO con el JSON, sin texto adicional`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'Eres un evaluador experto de exámenes de derecho. Proporcionas evaluaciones justas, constructivas y en formato JSON.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    temperature: 0.3, // Baja temperatura para evaluaciones más consistentes
    response_format: { type: 'json_object' }
  });

  const responseText = completion.choices[0].message.content || '{}';
  const evaluation = JSON.parse(responseText);

  return {
    questionId: answer.questionId,
    questionText: answer.questionText,
    studentAnswer: answer.studentAnswer,
    score: Math.min(10, Math.max(0, evaluation.score)), // Asegurar rango 0-10
    feedback: evaluation.feedback || 'Sin feedback disponible',
    strengths: evaluation.strengths || 'No evaluado',
    improvements: evaluation.improvements || 'No evaluado'
  };
}
