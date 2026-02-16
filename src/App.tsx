import { useState, useEffect } from 'react';
import './App.css';
import { supabase, type SupabaseQuestion, type ManualBloqueData } from './lib/supabase';
import { evaluateAnswersByVector, type VectorEvaluationResult } from './lib/vectorEvaluation';

type Screen = 'home' | 'select' | 'exam' | 'results' | 'loading' | 'stats' | 'admin';

interface Question {
  id: number;
  text: string;
  correctAnswer: string;
  tema: number;
  categoria: string;
}

interface Answer {
  questionId: number;
  text: string;
}

interface ExamResults {
  evaluations: VectorEvaluationResult[];
  averageScore: number;
  totalScore: number;
  averageSimilarity: number;
}

interface ExamResult {
  id: number;
  test_date: string;
  num_questions: number;
  average_score: number;
  total_score: number;
  time_spent_seconds: number;
  manual: string | null;
  bloque: string | null;
  tema: number | null;
  course_id: string | null;
  temas_selected: Array<{manual: string, bloque: string, tema: number, course_id?: string | null}> | null;
}

// Las preguntas se obtienen desde Supabase - evaluación 100% por IA (sin embeddings)

// Función para limpiar el nombre del manual (quitar "Manual " o "Manual de ")
function cleanManualName(name: string): string {
  return name
    .replace(/^Manual\s+de\s+/i, '')
    .replace(/^Manual\s+/i, '')
    .trim();
}

// Función para formatear texto con markdown básico (negritas)
function formatFeedbackText(text: string): string {
  if (!text) return '';

  return text
    // Convertir **texto** a <strong>texto</strong>
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Convertir saltos de línea a <br>
    .replace(/\n/g, '<br>');
}

function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [examResults, setExamResults] = useState<ExamResults | null>(null);

  // Configuración del examen (elegida por el usuario)
  const [numQuestions, setNumQuestions] = useState<number>(5);
  const [examDurationMinutes, setExamDurationMinutes] = useState<number>(10);
  const [selectedQuestions, setSelectedQuestions] = useState<Question[]>([]);
  const [timeLeft, setTimeLeft] = useState<number>(0);

  // Loading and error states
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Loading animation state
  const [loadingMessage, setLoadingMessage] = useState<number>(0);

  // Selection screen states
  const [availableManuales, setAvailableManuales] = useState<ManualBloqueData>({});
  const [selectedManuales, setSelectedManuales] = useState<string[]>([]);
  const [selectedBloques, setSelectedBloques] = useState<string[]>([]);
  const [selectedTemas, setSelectedTemas] = useState<{manual: string, bloque: string, tema: number, course_id?: string | null}[]>([]);
  const [expandedManuales, setExpandedManuales] = useState<string[]>([]);

  // Teachable user data (from URL params)
  const [teachableUserId, setTeachableUserId] = useState<string | null>(null);
  const [teachableUserEmail, setTeachableUserEmail] = useState<string | null>(null);
  const [teachableUserName, setTeachableUserName] = useState<string | null>(null);

  // User statistics
  const [userStats, setUserStats] = useState<ExamResult[]>([]);

  // Locked mode (iframe embedding)
  const [isLockedMode, setIsLockedMode] = useState<boolean>(false);
  const [lockedTemas, setLockedTemas] = useState<{manual: string, bloque: string, tema: number, course_id?: string | null}[]>([]);

  // Admin panel data
  const [adminAuthenticated, setAdminAuthenticated] = useState<boolean>(false);
  const [adminPassword, setAdminPassword] = useState<string>('');
  const [iframeManual, setIframeManual] = useState<string>('');
  const [iframeBloque, setIframeBloque] = useState<string>('');
  const [iframeTemas, setIframeTemas] = useState<number[]>([]);
  const [iframeManuales, setIframeManuales] = useState<ManualBloqueData>({});
  const [generatedIframe, setGeneratedIframe] = useState<string>('');

  // Sincronización con Storage
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncLogs, setSyncLogs] = useState<string[]>([]);

  // Temporizador del examen
  useEffect(() => {
    if (screen !== 'exam') return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmitExam();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [screen]);

  // Loading animation messages rotation
  useEffect(() => {
    if (screen !== 'loading') return;

    // Reset to first message when entering loading screen
    setLoadingMessage(0);

    const interval = setInterval(() => {
      setLoadingMessage(prev => (prev + 1) % 4); // 4 messages
    }, 3000);

    return () => clearInterval(interval);
  }, [screen]);

  // Load available manuales, bloques and temas when entering select screen
  useEffect(() => {
    if (screen === 'select') {
      loadManualBloquesTemas();
    }
  }, [screen]);

  // Read Teachable user data from URL params and load stats
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get('user_id');
    const userEmail = urlParams.get('user_email');
    const userName = urlParams.get('user_name');
    const adminKey = urlParams.get('admin');

    // Locked mode parameters
    const modo = urlParams.get('modo');
    const temasParam = urlParams.get('temas');

    if (userId) setTeachableUserId(userId);
    if (userEmail) setTeachableUserEmail(userEmail);
    if (userName) setTeachableUserName(decodeURIComponent(userName));

    // Check if locked mode is enabled
    if (modo === 'bloqueado' && temasParam) {
      try {
        const temasArray = JSON.parse(decodeURIComponent(temasParam));
        if (Array.isArray(temasArray) && temasArray.length > 0) {
          setIsLockedMode(true);
          setLockedTemas(temasArray);
          setSelectedTemas(temasArray);
          setScreen('select'); // Ir directo a la pantalla de selección en modo bloqueado
          console.log('Locked mode enabled:', { temas: temasArray });
        }
      } catch (e) {
        console.error('Error parsing locked temas:', e);
      }
    }

    // Check if admin mode is requested
    if (adminKey === 'true') {
      setScreen('admin');
    }

    // Load user stats if we have user identification
    if (userId || userEmail) {
      loadUserStats(userId, userEmail);
    }

    console.log('Teachable params:', { userId, userEmail, userName, modo, locked: isLockedMode });
  }, []);

  // Reload stats when entering stats screen
  useEffect(() => {
    if (screen === 'stats' && (teachableUserId || teachableUserEmail)) {
      loadUserStats(teachableUserId, teachableUserEmail);
    }
  }, [screen]);

  const loadManualBloquesTemas = async () => {
    try {
      // Query distinct manual, bloque, tema, tema_nombre, course_id directly
      // Using pagination to handle large datasets
      let allData: any[] = [];
      let offset = 0;
      const limit = 1000;

      while (true) {
        const { data, error } = await supabase
          .from('examen_preguntas')
          .select('manual, bloque, tema, tema_nombre, course_id')
          .not('manual', 'is', null)
          .not('bloque', 'is', null)
          .not('tema', 'is', null)
          .range(offset, offset + limit - 1);

        if (error) {
          console.error('Error loading manuales:', error);
          throw error;
        }

        if (!data || data.length === 0) break;
        allData = allData.concat(data);
        offset += limit;
        if (data.length < limit) break;
      }

      // Group temas by manual -> bloque, keeping tema_nombre and course_id
      // If same manual has different course_ids, they are treated as the same manual visually
      // but the course_id is preserved for queries
      const manualMap: ManualBloqueData = {};
      const seenTemas = new Set<string>(); // Track unique manual+bloque+tema+course_id combinations

      allData.forEach((item: any) => {
        const manual = item.manual || 'General';
        const bloque = item.bloque || 'General';
        const courseId = item.course_id || null;
        // Include course_id in the key to distinguish same manual with different courses
        const temaKey = `${manual}|${bloque}|${item.tema}|${courseId || 'null'}`;

        // Skip if we've already seen this combination
        if (seenTemas.has(temaKey)) return;
        seenTemas.add(temaKey);

        // Initialize manual if not exists
        if (!manualMap[manual]) {
          manualMap[manual] = {};
        }

        // Initialize bloque within manual if not exists
        if (!manualMap[manual][bloque]) {
          manualMap[manual][bloque] = [];
        }

        // Add tema with its name and course_id
        manualMap[manual][bloque].push({
          numero: item.tema,
          nombre: item.tema_nombre || null,
          course_id: courseId
        });
      });

      // Sort temas within each bloque by numero
      Object.keys(manualMap).forEach(manual => {
        Object.keys(manualMap[manual]).forEach(bloque => {
          manualMap[manual][bloque].sort((a, b) => a.numero - b.numero);
        });
      });

      setAvailableManuales(manualMap);
    } catch (err) {
      console.error('Error loading manuales, bloques and temas:', err);
      setError('Error al cargar los temas disponibles');
    }
  };

  const loadUserStats = async (userId: string | null, userEmail: string | null) => {
    try {
      if (!userId && !userEmail) {
        console.log('No user identification to load stats');
        return;
      }

      let query = supabase
        .from('examen_results')
        .select('*')
        .order('test_date', { ascending: false });

      if (userId) {
        query = query.eq('teachable_user_id', userId);
      } else if (userEmail) {
        query = query.eq('teachable_user_email', userEmail);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error loading user stats:', error);
        return;
      }

      setUserStats(data || []);
      console.log(`Loaded ${data?.length || 0} exam results for user`);
    } catch (err) {
      console.error('Error in loadUserStats:', err);
    }
  };

  // =========== ADMIN FUNCTIONS ===========

  const handleAdminLogin = () => {
    // Simple password check - replace with secure method in production
    if (adminPassword === 'justicia2025') {
      setAdminAuthenticated(true);
    } else {
      alert('Contraseña incorrecta');
    }
  };

  const loadIframeOptions = async () => {
    try {
      // Query distinct manual, bloque, tema, tema_nombre, course_id directly
      let allData: any[] = [];
      let offset = 0;
      const limit = 1000;

      while (true) {
        const { data, error } = await supabase
          .from('examen_preguntas')
          .select('manual, bloque, tema, tema_nombre, course_id')
          .not('manual', 'is', null)
          .not('bloque', 'is', null)
          .not('tema', 'is', null)
          .range(offset, offset + limit - 1);

        if (error) {
          console.error('Error loading manuales for iframe:', error);
          return;
        }

        if (!data || data.length === 0) break;
        allData = allData.concat(data);
        offset += limit;
        if (data.length < limit) break;
      }

      // Group temas by manual -> bloque, including course_id
      const manualMap: ManualBloqueData = {};
      const seenTemas = new Set<string>();

      allData.forEach((item: any) => {
        const manual = item.manual || 'General';
        const bloque = item.bloque || 'General';
        const courseId = item.course_id || null;
        const temaKey = `${manual}|${bloque}|${item.tema}|${courseId || 'null'}`;

        if (seenTemas.has(temaKey)) return;
        seenTemas.add(temaKey);

        if (!manualMap[manual]) {
          manualMap[manual] = {};
        }

        if (!manualMap[manual][bloque]) {
          manualMap[manual][bloque] = [];
        }

        manualMap[manual][bloque].push({
          numero: item.tema,
          nombre: item.tema_nombre || null,
          course_id: courseId
        });
      });

      // Sort temas within each bloque
      Object.keys(manualMap).forEach(manual => {
        Object.keys(manualMap[manual]).forEach(bloque => {
          manualMap[manual][bloque].sort((a, b) => a.numero - b.numero);
        });
      });

      setIframeManuales(manualMap);
    } catch (err) {
      console.error('Error in loadIframeOptions:', err);
    }
  };

  const generateIframe = () => {
    if (!iframeManual || !iframeBloque || iframeTemas.length === 0) {
      alert('Por favor selecciona un manual, bloque y al menos un tema');
      return;
    }

    // Generate JavaScript code that dynamically gets user info from Teachable
    const productionUrl = 'https://examenes-desarrollo.vercel.app';
    // Get course_id from the available temas data
    const availableTemasForBloque = iframeManuales[iframeManual]?.[iframeBloque] || [];
    const temasArray = iframeTemas.sort((a, b) => a - b).map(tema => {
      const temaInfo = availableTemasForBloque.find(t => t.numero === tema);
      return {
        manual: iframeManual,
        bloque: iframeBloque,
        tema: tema,
        course_id: temaInfo?.course_id || null
      };
    });
    const temasJson = JSON.stringify(temasArray);
    const encodedTemas = encodeURIComponent(temasJson);
    const containerId = `exam-container-${iframeManual.replace(/\s+/g, '-')}-${iframeBloque.replace(/\s+/g, '-')}`;

    const iframeCode = `<div id="${containerId}"></div>

<script>
(function() {
  // Obtener datos del usuario actual de Teachable
  var userId = '';
  var userEmail = '';
  var userName = '';

  try {
    // Teachable expone currentUser() en JavaScript
    if (typeof currentUser === 'function') {
      var user = currentUser();
      userId = user.id || '';
      userEmail = user.email || '';
      userName = user.name || user.username || '';
    }
  } catch (e) {
    console.log('No se pudo obtener datos del usuario:', e);
  }

  // Si no hay usuario, usar valores por defecto
  if (!userId && !userEmail) {
    userId = 'guest';
    userEmail = 'guest@teachable.com';
    userName = 'Invitado';
  }

  // Crear la URL con los parámetros (modo bloqueado + user data)
  var baseUrl = '${productionUrl}';
  var params = '?modo=bloqueado' +
               '&temas=${encodedTemas}' +
               '&user_id=' + encodeURIComponent(userId) +
               '&user_email=' + encodeURIComponent(userEmail) +
               '&user_name=' + encodeURIComponent(userName);

  var iframeSrc = baseUrl + params;

  // Crear el iframe
  var iframe = document.createElement('iframe');
  iframe.src = iframeSrc;
  iframe.style.maxWidth = '100%';
  iframe.style.width = '100vw';
  iframe.height = '900px';
  iframe.frameBorder = '0';
  iframe.style.border = 'none';
  iframe.style.borderRadius = '8px';
  iframe.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
  iframe.setAttribute('allow', 'fullscreen');

  // Insertar el iframe en el contenedor
  var container = document.getElementById('${containerId}');
  if (container) {
    container.appendChild(iframe);
  }

  // Debug: mostrar en consola
  console.log('Examen de Desarrollo - Manual: ${iframeManual}, Bloque: ${iframeBloque}', {
    id: userId,
    email: userEmail,
    name: userName,
    url: iframeSrc
  });
})();
<\/script>`;

    setGeneratedIframe(iframeCode);
  };

  const copyIframeToClipboard = () => {
    if (!generatedIframe) {
      alert('Primero genera un script');
      return;
    }

    navigator.clipboard.writeText(generatedIframe).then(() => {
      alert('✓ Script copiado al portapapeles. Pégalo en el editor HTML de Teachable.');
    }).catch(err => {
      console.error('Error copying to clipboard:', err);
      alert('Error al copiar. Intenta copiar manualmente.');
    });
  };

  // Función para obtener preguntas aleatorias desde Supabase
  const selectRandomQuestions = async (count: number): Promise<Question[]> => {
    try {
      // NEW STRATEGY: Use Supabase filters instead of loading all questions into memory
      // This bypasses the 1000 row limit by filtering at the database level

      let allMatchingIds: { id: number }[] = [];

      // Step 1: For each manual+bloque+tema+course_id combination, query the database
      if (selectedTemas.length > 0) {
        console.log('=== Fetching questions for', selectedTemas.length, 'combinations ===');

        // Fetch all combinations in parallel
        const queries = selectedTemas.map(selection => {
          let query = supabase
            .from('examen_preguntas')
            .select('id')
            .eq('manual', selection.manual)
            .eq('bloque', selection.bloque)
            .eq('tema', selection.tema);

          // Add course_id filter if available
          if (selection.course_id) {
            query = query.eq('course_id', selection.course_id);
          }

          return query;
        });

        const results = await Promise.all(queries);

        // Combine all results
        results.forEach((result, index) => {
          if (result.error) {
            console.error('Error fetching questions for', selectedTemas[index], result.error);
          } else if (result.data && result.data.length > 0) {
            console.log('Found', result.data.length, 'questions for', selectedTemas[index]);
            allMatchingIds.push(...result.data);
          } else {
            console.warn('No questions found for', selectedTemas[index]);
          }
        });
      }

      console.log('Total matching questions:', allMatchingIds.length);

      // Step 2: Validate we have matching questions
      if (allMatchingIds.length === 0) {
        console.error('=== NO MATCHES FOUND ===');
        console.error('selectedTemas:', selectedTemas);
        throw new Error('No se encontraron preguntas con los filtros seleccionados');
      }

      // Step 3: Shuffle and select N question IDs
      const totalQuestions = Math.min(count, allMatchingIds.length);
      const shuffledIds = [...allMatchingIds].sort(() => Math.random() - 0.5);
      const selectedIds = shuffledIds.slice(0, totalQuestions).map(item => item.id);

      // Step 4: Fetch the selected questions with full data
      const { data, error } = await supabase
        .from('examen_preguntas')
        .select('*')
        .in('id', selectedIds);

      if (error) {
        console.error('Error obteniendo preguntas completas:', error);
        throw new Error('No se pudieron cargar las preguntas');
      }

      if (!data || data.length === 0) {
        throw new Error('No hay preguntas disponibles');
      }

      // Mezclar aleatoriamente de nuevo
      const shuffled = [...data].sort(() => Math.random() - 0.5);
      const selected = shuffled;

      // Transformar a formato de la aplicación (sin embeddings - evaluación 100% por IA)
      return selected.map((q: SupabaseQuestion) => {
        return {
          id: q.id,
          text: q.pregunta,
          correctAnswer: q.respuesta_correcta,
          tema: q.tema,
          categoria: q.categoria
        };
      });
    } catch (error) {
      console.error('Error en selectRandomQuestions:', error);
      throw error;
    }
  };

  const goToSelectScreen = () => {
    setError(null);
    setScreen('select');
  };

  // Función para sincronizar preguntas desde Storage
  const syncFromStorage = async () => {
    setSyncing(true);
    setSyncLogs(['Iniciando sincronización con Storage...']);

    try {
      const { data, error } = await supabase.functions.invoke('swift-endpoint');

      if (error) {
        setSyncLogs(prev => [...prev, `Error: ${error.message}`]);
        throw error;
      }

      if (data && data.logs) {
        setSyncLogs(data.logs);
      }

      if (data && data.success) {
        setSyncLogs(prev => [
          ...prev,
          '',
          'Sincronización completada exitosamente'
        ]);
        // Recargar opciones de manuales
        loadIframeOptions();
      }
    } catch (err: any) {
      console.error('Error syncing:', err);
      setSyncLogs(prev => [
        ...prev,
        '',
        `Error: ${err.message || err}`,
        'Asegúrate de que la Edge Function esté desplegada en Supabase.'
      ]);
    } finally {
      setSyncing(false);
    }
  };

  const startExam = async () => {
    setLoading(true);
    setError(null);

    try {
      // Seleccionar preguntas aleatorias desde Supabase (con filtros aplicados)
      const questions = await selectRandomQuestions(numQuestions);
      setSelectedQuestions(questions);

      // Configurar el examen
      setAnswers([]);
      setTimeLeft(examDurationMinutes * 60); // Convertir minutos a segundos
      setExamResults(null);
      setScreen('exam');

      // Scroll to top when exam starts
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 100);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al cargar las preguntas';
      setError(errorMessage);
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerChange = (questionId: number, text: string) => {
    setAnswers(prev => {
      const existing = prev.find(a => a.questionId === questionId);
      if (existing) {
        return prev.map(a =>
          a.questionId === questionId ? { ...a, text } : a
        );
      } else {
        return [...prev, { questionId, text }];
      }
    });
  };

  const handleSubmitExam = async () => {
    setScreen('loading');

    try {
      // Preparar las respuestas para evaluación por IA
      const answersToEvaluate = selectedQuestions.map(q => ({
        questionId: q.id,
        questionText: q.text,
        studentAnswer: answers.find(a => a.questionId === q.id)?.text || '',
        correctAnswerText: q.correctAnswer
      }));

      // Evaluar usando similaridad vectorial
      const results = await evaluateAnswersByVector(answersToEvaluate);
      setExamResults(results);

      // Save results to Supabase if user comes from Teachable
      if (teachableUserId || teachableUserEmail) {
        // Wait a bit for examResults to be set, then save
        setTimeout(async () => {
          const resultData = {
            teachable_user_id: teachableUserId || teachableUserEmail || 'guest',
            teachable_user_email: teachableUserEmail || null,
            teachable_user_name: teachableUserName || null,
            num_questions: selectedQuestions.length,
            average_score: results.averageScore,
            total_score: results.totalScore,
            time_spent_seconds: examDurationMinutes * 60 - timeLeft,
            manual: selectedTemas.length > 0 ? selectedTemas[0].manual : null,
            bloque: selectedTemas.length > 0 ? selectedTemas[0].bloque : null,
            tema: selectedTemas.length > 0 ? selectedTemas[0].tema : null,
            course_id: selectedTemas.length > 0 ? selectedTemas[0].course_id : null,
            temas_selected: selectedTemas.length > 0 ? selectedTemas : null
          };

          const { error } = await supabase
            .from('examen_results')
            .insert([resultData]);

          if (error) {
            console.error('Error saving results:', error);
          } else {
            console.log('Results saved successfully!');
            await loadUserStats(teachableUserId, teachableUserEmail);
          }
        }, 100);
      }

      setScreen('results');
    } catch (error) {
      console.error('Error evaluating exam:', error);
      alert('Hubo un error al evaluar el examen. Por favor, intenta de nuevo.');
      setScreen('exam');
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getAnsweredCount = () => {
    return answers.filter(a => a.text.trim().length > 0).length;
  };

  const renderHome = () => (
    <div className="screen home-screen">
      <div className="home-icon">
        <div style={{
          width: '180px',
          height: '180px',
          backgroundColor: 'white',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '35px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
        }}>
          <img
            src="/logo.png"
            alt="Exámenes Desarrollo Logo"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain'
            }}
          />
        </div>
      </div>
      <h1>Exámenes de Desarrollo</h1>
      <p className="subtitle" style={{ marginBottom: '2.5rem' }}>
        Prepárate para tus exámenes con preguntas de nuestros manuales
      </p>

      {error && (
        <div style={{ color: 'red', marginBottom: '1rem', padding: '1rem', background: '#fee', borderRadius: '8px' }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', width: '100%', maxWidth: '400px' }}>
        <button className="primary-button" onClick={goToSelectScreen} disabled={loading} style={{ width: '100%' }}>
          Seleccionar Temas
        </button>

        {(teachableUserId || teachableUserEmail) && (
          <button
            className="primary-button"
            onClick={() => setScreen('stats')}
            style={{ width: '100%' }}
          >
            📊 Ver Mis Estadísticas
          </button>
        )}
      </div>
    </div>
  );

  const renderSelect = () => {
    const handleTemaToggle = (manual: string, bloque: string, tema: number, courseId?: string | null) => {
      setSelectedTemas(prev => {
        // Check if this specific manual+bloque+tema+course_id combination is already selected
        const exists = prev.some(s =>
          s.manual === manual && s.bloque === bloque && s.tema === tema && s.course_id === courseId
        );

        if (exists) {
          // Remove this specific combination
          return prev.filter(s =>
            !(s.manual === manual && s.bloque === bloque && s.tema === tema && s.course_id === courseId)
          );
        } else {
          // Add this specific combination with course_id
          return [...prev, { manual, bloque, tema, course_id: courseId }];
        }
      });
    };

    const handleManualToggle = (manual: string) => {
      setExpandedManuales(prev => {
        if (prev.includes(manual)) {
          return prev.filter(m => m !== manual);
        } else {
          return [...prev, manual];
        }
      });
    };

    const handleSelectAllTemas = () => {
      const allTemas: {manual: string, bloque: string, tema: number, course_id?: string | null}[] = [];
      Object.keys(availableManuales).forEach(manual => {
        Object.keys(availableManuales[manual]).forEach(bloque => {
          availableManuales[manual][bloque].forEach(temaInfo => {
            allTemas.push({ manual, bloque, tema: temaInfo.numero, course_id: temaInfo.course_id });
          });
        });
      });
      setSelectedTemas(allTemas);
    };

    const handleClearSelection = () => {
      setSelectedManuales([]);
      setSelectedBloques([]);
      setSelectedTemas([]);
    };

    const getSelectedCount = () => {
      return {
        manuales: selectedManuales.length,
        bloques: selectedBloques.length,
        temas: selectedTemas.length
      };
    };

    // Group locked temas by manual and bloque for display
    const groupedLockedTemas = isLockedMode ? lockedTemas.reduce((acc, tema) => {
      if (!acc[tema.manual]) acc[tema.manual] = {};
      if (!acc[tema.manual][tema.bloque]) acc[tema.manual][tema.bloque] = [];
      acc[tema.manual][tema.bloque].push(tema.tema);
      return acc;
    }, {} as {[manual: string]: {[bloque: string]: number[]}}) : {};

    return (
      <div className="screen select-screen">
        {/* Title changes based on locked mode */}
        {isLockedMode ? (
          <>
            <h2>🔒 Examen con Temas Preseleccionados</h2>
            <p className="subtitle" style={{ marginBottom: '1.5rem' }}>
              Tu instructor ha seleccionado los siguientes temas para practicar
            </p>
          </>
        ) : (
          <>
            <h2>Seleccionar Temas para Practicar</h2>
            <p className="subtitle" style={{ marginBottom: '1.5rem' }}>
              Elige los manuales, bloques o temas específicos que quieres incluir en tu examen
            </p>
          </>
        )}

        {/* Locked mode - Show preselected temas */}
        {isLockedMode && lockedTemas.length > 0 && (
          <div style={{
            background: '#fff3cd',
            padding: '1.5rem',
            borderRadius: '12px',
            marginBottom: '2rem',
            border: '2px solid #ffc107',
            maxWidth: '700px',
            margin: '0 auto 2rem auto'
          }}>
            <p style={{ fontWeight: 'bold', color: '#856404', marginBottom: '1rem', fontSize: '1.1rem' }}>
              📚 Temas Disponibles para este Examen
            </p>
            {Object.keys(groupedLockedTemas).map(manual => (
              <div key={manual} style={{ marginBottom: '1rem' }}>
                <p style={{ fontWeight: 600, color: '#9B7653', marginBottom: '0.5rem', fontSize: '1rem' }}>
                  {cleanManualName(manual)}
                </p>
                {Object.keys(groupedLockedTemas[manual]).map(bloque => (
                  <div key={bloque} style={{ marginLeft: '1rem', marginBottom: '0.5rem' }}>
                    <span style={{ color: '#856404', fontSize: '0.95rem' }}>
                      <strong>{bloque}:</strong> {groupedLockedTemas[manual][bloque].sort((a, b) => a - b).map(t => `Tema ${t}`).join(', ')}
                    </span>
                  </div>
                ))}
              </div>
            ))}
            <p style={{ fontSize: '0.85rem', color: '#856404', marginTop: '1rem', fontStyle: 'italic', marginBottom: 0 }}>
              Total: {lockedTemas.length} tema{lockedTemas.length !== 1 ? 's' : ''} preseleccionado{lockedTemas.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}

        {/* Configuración del examen */}
        <div style={{
          background: 'white',
          padding: '1.5rem',
          borderRadius: '12px',
          maxWidth: '600px',
          width: '100%',
          marginBottom: '2rem',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          margin: '0 auto 2rem auto'
        }}>
          <h3 style={{ marginBottom: '1.5rem', color: '#9B7653', textAlign: 'center', fontSize: '1.1rem' }}>
            Configurar Examen
          </h3>

          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
            {/* Número de preguntas */}
            <div style={{ flex: '1', minWidth: '200px' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: 600,
                color: '#333',
                fontSize: '0.9rem'
              }}>
                Número de preguntas: <span style={{ color: '#9B7653', fontSize: '1.2rem' }}>{numQuestions}</span>
              </label>
              <input
                type="range"
                min="5"
                max="30"
                value={numQuestions}
                onChange={(e) => setNumQuestions(parseInt(e.target.value))}
                className="slider"
                style={{ width: '100%' }}
              />
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.75rem',
                color: '#666',
                marginTop: '0.25rem'
              }}>
                <span>5</span>
                <span>30</span>
              </div>
            </div>

            {/* Tiempo del examen */}
            <div style={{ flex: '1', minWidth: '200px' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: 600,
                color: '#333',
                fontSize: '0.9rem'
              }}>
                Tiempo del examen: <span style={{ color: '#9B7653', fontSize: '1.2rem' }}>{examDurationMinutes} min</span>
              </label>
              <input
                type="range"
                min="10"
                max="60"
                step="5"
                value={examDurationMinutes}
                onChange={(e) => setExamDurationMinutes(parseInt(e.target.value))}
                className="slider"
                style={{ width: '100%' }}
              />
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.75rem',
                color: '#666',
                marginTop: '0.25rem'
              }}>
                <span>10 min</span>
                <span>60 min</span>
              </div>
            </div>
          </div>
        </div>

        {/* Only show selection UI if NOT in locked mode */}
        {!isLockedMode && (
          <>
            <div style={{ marginBottom: '2rem', display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={handleSelectAllTemas}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: '#9B7653',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.95rem'
                }}
              >
                Seleccionar Todos
              </button>
              <button
                onClick={handleClearSelection}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: '#e0e0e0',
                  color: '#333',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.95rem'
                }}
              >
                Limpiar Selección
              </button>
            </div>

            <div style={{ marginBottom: '2rem', padding: '1rem', background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
              <strong>Seleccionados:</strong> {getSelectedCount().temas} temas
            </div>

            <div style={{ maxWidth: '800px', width: '100%', margin: '0 auto' }}>
              {Object.keys(availableManuales).sort().map(manual => (
            <div key={manual} style={{ marginBottom: '1rem', background: 'white', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
              <div
                onClick={() => handleManualToggle(manual)}
                style={{
                  padding: '1rem 1.5rem',
                  background: '#9B7653',
                  color: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontWeight: 600
                }}
              >
                <span>{cleanManualName(manual)}</span>
                <span>{expandedManuales.includes(manual) ? '▼' : '▶'}</span>
              </div>

              {expandedManuales.includes(manual) && (
                <div style={{ padding: '1rem' }}>
                  {Object.keys(availableManuales[manual]).sort().map(bloque => (
                    <div key={bloque} style={{ marginBottom: '1rem', paddingLeft: '1rem', borderLeft: '3px solid #9B7653' }}>
                      <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: '#9B7653' }}>
                        {bloque}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {availableManuales[manual][bloque].map(temaInfo => {
                          const isSelected = selectedTemas.some(s =>
                            s.manual === manual && s.bloque === bloque && s.tema === temaInfo.numero && s.course_id === temaInfo.course_id
                          );
                          // Use a unique key that includes course_id
                          const uniqueKey = `${temaInfo.numero}-${temaInfo.course_id || 'null'}`;
                          return (
                            <label
                              key={uniqueKey}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                padding: '0.75rem 1rem',
                                background: isSelected ? '#9B7653' : '#f5f5f5',
                                color: isSelected ? 'white' : '#333',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                fontSize: '0.9rem'
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleTemaToggle(manual, bloque, temaInfo.numero, temaInfo.course_id)}
                                style={{ cursor: 'pointer' }}
                              />
                              <span style={{ fontWeight: 600, minWidth: '60px' }}>Tema {temaInfo.numero}</span>
                              {temaInfo.nombre && (
                                <span style={{
                                  opacity: isSelected ? 1 : 0.8,
                                  fontSize: '0.85rem',
                                  flex: 1
                                }}>
                                  {temaInfo.nombre}
                                </span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
            </div>
          </>
        )}

        <div className="action-buttons" style={{ marginTop: '2rem' }}>
          <button
            className="cancel-button"
            onClick={() => setScreen('home')}
          >
            Volver
          </button>
          <button
            className="submit-button"
            onClick={startExam}
            disabled={selectedTemas.length === 0 || loading}
          >
            {loading ? 'Cargando...' : `Iniciar Examen (${selectedTemas.length} temas)`}
          </button>
        </div>
      </div>
    );
  };

  const renderExam = () => {
    const progress = (getAnsweredCount() / selectedQuestions.length) * 100;
    const isTimeWarning = timeLeft <= 60; // Último minuto

    return (
      <div className="exam-container">
        <div className="exam-header">
          <h2>Examen en Curso</h2>
          <div className={`timer ${isTimeWarning ? 'warning' : ''}`}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            Tiempo restante: {formatTime(timeLeft)}
          </div>
          <div style={{ marginTop: '0.5rem', color: '#666' }}>
            Preguntas respondidas: {getAnsweredCount()} / {selectedQuestions.length}
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }}></div>
          </div>
        </div>

        <div className="questions-list">
          {selectedQuestions.map((question, index) => {
            const answer = answers.find(a => a.questionId === question.id);
            const answerText = answer?.text || '';
            const lineCount = answerText.split('\n').length;
            const charCount = answerText.length;

            return (
              <div key={question.id} className="question-card">
                <div className="question-header">
                  <span className="question-number">Pregunta {index + 1} de {selectedQuestions.length}</span>
                </div>
                <p className="question-text">{question.text}</p>
                <textarea
                  className={`answer-textarea ${answerText.trim() ? 'answered' : ''}`}
                  placeholder="Escribe tu respuesta aquí (5-8 líneas aproximadamente)..."
                  value={answerText}
                  onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                  rows={8}
                />
                <div className="char-count">
                  {lineCount} líneas • {charCount} caracteres
                </div>
              </div>
            );
          })}
        </div>

        <div className="action-buttons">
          <button
            className="cancel-button"
            onClick={() => {
              if (window.confirm('¿Estás seguro de que quieres cancelar el examen?')) {
                setScreen('home');
              }
            }}
          >
            Cancelar
          </button>
          <button
            className="submit-button"
            onClick={handleSubmitExam}
            disabled={getAnsweredCount() === 0}
          >
            Finalizar y Enviar
          </button>
        </div>
      </div>
    );
  };

  const renderLoading = () => {
    const messages = [
      { main: 'Analizando tus respuestas...', sub: 'Revisando cada detalle con IA' },
      { main: 'Comparando con contenido legal...', sub: 'Verificando fundamentos jurídicos' },
      { main: 'Evaluando argumentación...', sub: 'Comprobando coherencia y precisión' },
      { main: 'Generando feedback personalizado...', sub: 'Preparando tus resultados' }
    ];

    return (
      <div className="loading-container-animated">
        {/* Partículas flotantes */}
        <div className="particles">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="particle" style={{ animationDelay: `${i * 0.3}s` }}></div>
          ))}
        </div>

        {/* Círculos concéntricos animados */}
        <div className="loading-circles">
          <div className="circle circle-1"></div>
          <div className="circle circle-2"></div>
          <div className="circle circle-3"></div>

          {/* Logo pulsante en el centro */}
          <div className="loading-logo-container">
            <img src="/logo.png" alt="Loading" className="loading-logo" />
          </div>
        </div>

        {/* Mensajes rotativos */}
        <div className="loading-messages">
          <p className="loading-text-main fade-in" key={loadingMessage}>
            {messages[loadingMessage].main}
          </p>
          <p className="loading-text-sub fade-in" key={`sub-${loadingMessage}`}>
            {messages[loadingMessage].sub}
          </p>
        </div>

        {/* Barra de progreso indeterminada */}
        <div className="progress-bar-loading">
          <div className="progress-bar-fill-loading"></div>
        </div>
      </div>
    );
  };

  const renderResults = () => {
    if (!examResults) return null;

    return (
      <div className="results-container">
        <div className="results-header">
          <h2>Resultados del Examen</h2>
          <div className="final-score">{examResults.averageScore.toFixed(1)}/10</div>
          <div className="score-label">Puntuación Media</div>
          <div style={{ marginTop: '1rem', color: '#666' }}>
            Puntuación Total: {examResults.totalScore.toFixed(1)}/{selectedQuestions.length * 10}
          </div>
        </div>

        <div className="corrections-list">
          {examResults.evaluations.map((evaluation, index) => {
            const scoreClass =
              evaluation.score >= 7 ? 'high' :
              evaluation.score >= 5 ? 'medium' : 'low';

            return (
              <div key={evaluation.questionId} className="correction-card">
                <div className="correction-header">
                  <span className="question-number">Pregunta {index + 1}</span>
                  <span className={`score-badge ${scoreClass}`}>
                    {evaluation.score}/10
                  </span>
                </div>

                <div className="correction-section">
                  <h4>Pregunta:</h4>
                  <p>{evaluation.questionText}</p>
                </div>

                <div className="correction-section">
                  <h4>Tu respuesta:</h4>
                  <div className="student-answer">
                    {evaluation.studentAnswer || '(No respondida)'}
                  </div>
                </div>

                <div className="correction-section">
                  <h4>Puntos fuertes:</h4>
                  <div className="feedback-block feedback-green" dangerouslySetInnerHTML={{
                    __html: formatFeedbackText(evaluation.strengths)
                  }} />
                </div>

                <div className="correction-section">
                  <h4>Áreas de mejora:</h4>
                  <div className="feedback-block feedback-red" dangerouslySetInnerHTML={{
                    __html: formatFeedbackText(evaluation.improvements)
                  }} />
                </div>

                <div className="correction-section">
                  <h4>Feedback:</h4>
                  <div className="feedback-block feedback-blue" dangerouslySetInnerHTML={{
                    __html: formatFeedbackText(evaluation.feedback)
                  }} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="action-buttons" style={{ marginTop: '2rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button className="primary-button" onClick={() => setScreen('home')}>
            Volver al Inicio
          </button>
          <button className="primary-button" onClick={startExam}>
            Intentar de Nuevo
          </button>
          {(teachableUserId || teachableUserEmail) && (
            <button className="primary-button" onClick={() => setScreen('stats')}>
              📊 Ver Mis Estadísticas
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderAdmin = () => {
    const availableBloquesForManual = iframeManual && iframeManuales[iframeManual]
      ? Object.keys(iframeManuales[iframeManual])
      : [];

    const availableTemasForBloque = iframeManual && iframeBloque && iframeManuales[iframeManual]?.[iframeBloque]
      ? iframeManuales[iframeManual][iframeBloque]
      : [];

    return (
      <div className="screen" style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1>Panel de Administración</h1>
          <p className="subtitle">Generador de iframes para Teachable</p>
        </div>

        {!adminAuthenticated ? (
          // Login form
          <div style={{
            background: 'white',
            padding: '2rem',
            borderRadius: '12px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
            maxWidth: '400px',
            margin: '0 auto'
          }}>
            <h3 style={{ marginBottom: '1.5rem', color: '#9B7653', textAlign: 'center' }}>
              Iniciar Sesión
            </h3>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: 600,
                color: '#333'
              }}>
                Contraseña:
              </label>
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAdminLogin()}
                placeholder="Ingresa la contraseña"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '2px solid #ddd',
                  borderRadius: '8px',
                  fontSize: '1rem'
                }}
              />
            </div>
            <button
              className="primary-button"
              onClick={handleAdminLogin}
              style={{ width: '100%', marginTop: '1rem' }}
            >
              Ingresar
            </button>
            <button
              onClick={() => setScreen('home')}
              style={{
                width: '100%',
                marginTop: '1rem',
                padding: '0.75rem',
                background: 'transparent',
                color: '#9B7653',
                border: '2px solid #9B7653',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: 600
              }}
            >
              Volver al Inicio
            </button>
          </div>
        ) : (
          // Admin panel
          <div>
            <div style={{
              background: 'white',
              padding: '2rem',
              borderRadius: '12px',
              boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
              marginBottom: '2rem'
            }}>
              <h3 style={{ marginBottom: '1.5rem', color: '#9B7653' }}>
                Configurar Iframe
              </h3>

              {/* Load options button */}
              {Object.keys(iframeManuales).length === 0 && (
                <button
                  className="primary-button"
                  onClick={loadIframeOptions}
                  style={{ width: '100%', marginBottom: '1.5rem' }}
                >
                  Cargar Manuales y Temas
                </button>
              )}

              {Object.keys(iframeManuales).length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {/* Manual selector */}
                  <div>
                    <label style={{
                      display: 'block',
                      marginBottom: '0.5rem',
                      fontWeight: 600,
                      color: '#333'
                    }}>
                      1. Selecciona el Manual:
                    </label>
                    <select
                      value={iframeManual}
                      onChange={(e) => {
                        setIframeManual(e.target.value);
                        setIframeBloque('');
                        setIframeTemas([]);
                      }}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '2px solid #ddd',
                        borderRadius: '8px',
                        fontSize: '1rem',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="">-- Selecciona un manual --</option>
                      {Object.keys(iframeManuales).sort().map(manual => (
                        <option key={manual} value={manual}>{manual}</option>
                      ))}
                    </select>
                  </div>

                  {/* Bloque selector */}
                  {iframeManual && (
                    <div>
                      <label style={{
                        display: 'block',
                        marginBottom: '0.5rem',
                        fontWeight: 600,
                        color: '#333'
                      }}>
                        2. Selecciona el Bloque:
                      </label>
                      <select
                        value={iframeBloque}
                        onChange={(e) => {
                          setIframeBloque(e.target.value);
                          setIframeTemas([]);
                        }}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '2px solid #ddd',
                          borderRadius: '8px',
                          fontSize: '1rem',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="">-- Selecciona un bloque --</option>
                        {availableBloquesForManual.sort().map(bloque => (
                          <option key={bloque} value={bloque}>{bloque}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Tema checkboxes */}
                  {iframeManual && iframeBloque && availableTemasForBloque.length > 0 && (
                    <div>
                      <label style={{
                        display: 'block',
                        marginBottom: '0.5rem',
                        fontWeight: 600,
                        color: '#333'
                      }}>
                        3. Selecciona los Temas:
                      </label>
                      <div style={{
                        border: '2px solid #ddd',
                        borderRadius: '8px',
                        padding: '1rem',
                        maxHeight: '400px',
                        overflowY: 'auto',
                        background: '#f8f9fa'
                      }}>
                        {availableTemasForBloque.map(temaInfo => (
                          <label
                            key={temaInfo.numero}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              padding: '0.5rem 0.75rem',
                              cursor: 'pointer',
                              borderRadius: '4px',
                              transition: 'background 0.2s',
                              marginBottom: '0.25rem'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#e9ecef'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <input
                              type="checkbox"
                              checked={iframeTemas.includes(temaInfo.numero)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setIframeTemas(prev => [...prev, temaInfo.numero].sort((a, b) => a - b));
                                } else {
                                  setIframeTemas(prev => prev.filter(t => t !== temaInfo.numero));
                                }
                              }}
                              style={{
                                width: '20px',
                                height: '20px',
                                marginRight: '0.75rem',
                                cursor: 'pointer'
                              }}
                            />
                            <span style={{ fontSize: '1rem', color: '#333', fontWeight: 600, minWidth: '60px' }}>
                              Tema {temaInfo.numero}
                            </span>
                            {temaInfo.nombre && (
                              <span style={{ fontSize: '0.9rem', color: '#666', marginLeft: '0.5rem' }}>
                                - {temaInfo.nombre}
                              </span>
                            )}
                          </label>
                        ))}
                      </div>
                      <div style={{
                        marginTop: '0.75rem',
                        display: 'flex',
                        gap: '0.5rem'
                      }}>
                        <button
                          onClick={() => setIframeTemas(availableTemasForBloque.map(t => t.numero))}
                          style={{
                            padding: '0.5rem 1rem',
                            background: '#9B7653',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.9rem'
                          }}
                        >
                          Seleccionar Todos
                        </button>
                        <button
                          onClick={() => setIframeTemas([])}
                          style={{
                            padding: '0.5rem 1rem',
                            background: '#6c757d',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.9rem'
                          }}
                        >
                          Limpiar Selección
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Generate button */}
                  {iframeManual && iframeBloque && iframeTemas.length > 0 && (
                    <button
                      className="primary-button"
                      onClick={generateIframe}
                      style={{ width: '100%', marginTop: '1rem' }}
                    >
                      🎯 Generar Código del Iframe
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Generated code display */}
            {generatedIframe && (
              <div style={{
                background: 'white',
                padding: '2rem',
                borderRadius: '12px',
                boxShadow: '0 2px 12px rgba(0,0,0,0.1)'
              }}>
                <h3 style={{ marginBottom: '1rem', color: '#28a745' }}>
                  ✓ Código Generado
                </h3>
                <p style={{ marginBottom: '1rem', color: '#666', fontSize: '0.95rem' }}>
                  Copia este código y pégalo en el editor HTML de Teachable:
                </p>
                <textarea
                  value={generatedIframe}
                  readOnly
                  style={{
                    width: '100%',
                    minHeight: '300px',
                    padding: '1rem',
                    border: '2px solid #ddd',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    fontFamily: 'monospace',
                    background: '#f8f9fa',
                    resize: 'vertical'
                  }}
                />
                <button
                  onClick={copyIframeToClipboard}
                  style={{
                    width: '100%',
                    marginTop: '1rem',
                    padding: '0.75rem',
                    background: '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    fontWeight: 600
                  }}
                >
                  📋 Copiar al Portapapeles
                </button>
              </div>
            )}

            {/* Sincronización con Storage */}
            <div style={{
              background: 'white',
              padding: '2rem',
              borderRadius: '12px',
              boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
              marginTop: '2rem'
            }}>
              <h3 style={{ marginBottom: '1rem', color: '#9B7653' }}>
                Sincronizar Preguntas
              </h3>
              <p style={{ color: '#666', marginBottom: '1rem', fontSize: '0.9rem' }}>
                Sincroniza las preguntas desde el Storage de Supabase (bucket: examen_manuales/Preguntas txt)
              </p>
              <button
                className="primary-button"
                onClick={syncFromStorage}
                disabled={syncing}
                style={{ width: '100%' }}
              >
                {syncing ? 'Sincronizando...' : 'Sincronizar desde Storage'}
              </button>

              {syncLogs.length > 0 && (
                <div style={{
                  marginTop: '1rem',
                  background: '#1e1e1e',
                  borderRadius: '8px',
                  padding: '1rem',
                  maxHeight: '300px',
                  overflowY: 'auto'
                }}>
                  <h4 style={{ color: '#4fc3f7', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                    Logs de Sincronización:
                  </h4>
                  {syncLogs.map((log, index) => (
                    <div
                      key={index}
                      style={{
                        color: log.includes('Error') || log.includes('❌') ? '#ff6b6b' :
                               log.includes('✅') || log.includes('completada') ? '#69db7c' :
                               log.includes('⚠️') ? '#ffd43b' : '#adb5bd',
                        fontSize: '0.8rem',
                        fontFamily: 'monospace',
                        padding: '2px 0'
                      }}
                    >
                      {log}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{
              marginTop: '2rem',
              display: 'flex',
              gap: '1rem',
              justifyContent: 'center'
            }}>
              <button
                onClick={() => {
                  setAdminAuthenticated(false);
                  setAdminPassword('');
                  setIframeManual('');
                  setIframeBloque('');
                  setIframeTemas([]);
                  setIframeManuales({});
                  setGeneratedIframe('');
                  setSyncLogs([]);
                }}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.95rem'
                }}
              >
                Cerrar Sesión
              </button>
              <button
                onClick={() => setScreen('home')}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: 'transparent',
                  color: '#9B7653',
                  border: '2px solid #9B7653',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                  fontWeight: 600
                }}
              >
                Volver al Inicio
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderStats = () => {
    const averageScore = userStats.length > 0
      ? userStats.reduce((sum, s) => sum + s.average_score, 0) / userStats.length
      : 0;

    const getPerformanceMessage = (avg: number) => {
      if (avg >= 7) {
        return {
          emoji: '🎯',
          title: '¡Excelente preparación!',
          message: 'Tu rendimiento es sobresaliente. Estás más que listo para presentarte al examen real. Continúa con este nivel de estudio.',
          color: '#28a745'
        };
      } else if (avg >= 5) {
        return {
          emoji: '📚',
          title: 'Buen progreso',
          message: 'Vas por buen camino, pero aún necesitas mejorar. Refuerza los temas donde tienes más dificultades y practica más.',
          color: '#ffc107'
        };
      } else {
        return {
          emoji: '⚠️',
          title: 'Necesitas más preparación',
          message: 'Tu rendimiento actual no es suficiente para el examen real. Te recomendamos estudiar más a fondo los temas y practicar con más frecuencia.',
          color: '#dc3545'
        };
      }
    };

    const performance = getPerformanceMessage(averageScore);

    return (
      <div className="screen stats-screen">
        <h2>📊 Mis Estadísticas</h2>

        {(teachableUserId || teachableUserEmail) && (
          <div style={{
            background: 'white',
            padding: '1.5rem',
            borderRadius: '12px',
            marginBottom: '2rem',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}>
            <p style={{ marginBottom: '0.5rem' }}>
              <strong>Usuario:</strong> {teachableUserName || teachableUserEmail}
            </p>
            <p style={{ marginBottom: 0 }}>
              <strong>Total de exámenes:</strong> {userStats.length}
            </p>
          </div>
        )}

        {userStats.length === 0 ? (
          <div style={{
            background: 'white',
            padding: '3rem',
            borderRadius: '12px',
            textAlign: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}>
            <p style={{ fontSize: '1.1rem', color: '#666' }}>📋 Aún no has realizado ningún examen</p>
            <p style={{ color: '#999' }}>Completa un examen para ver tus estadísticas aquí</p>
          </div>
        ) : (
          <>
            {/* Performance Message */}
            <div style={{
              background: 'white',
              padding: '2rem',
              borderRadius: '12px',
              marginBottom: '2rem',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              border: `3px solid ${performance.color}`
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem', textAlign: 'center' }}>
                {performance.emoji}
              </div>
              <h3 style={{ color: performance.color, textAlign: 'center', marginBottom: '1rem' }}>
                {performance.title}
              </h3>
              <div style={{
                fontSize: '2.5rem',
                fontWeight: 'bold',
                color: performance.color,
                textAlign: 'center',
                marginBottom: '1rem'
              }}>
                {averageScore.toFixed(2)}/10
              </div>
              <p style={{ fontSize: '1rem', color: '#666', textAlign: 'center', lineHeight: '1.6', margin: 0 }}>
                {performance.message}
              </p>
            </div>

            {/* Stats Table */}
            <div style={{
              background: 'white',
              padding: '1.5rem',
              borderRadius: '12px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              overflowX: 'auto'
            }}>
              <h3 style={{ marginBottom: '1.5rem', color: '#9B7653' }}>Historial de Exámenes</h3>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.85rem'
              }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #9B7653' }}>
                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>Fecha</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center' }}>Preguntas</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center' }}>Nota Media</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center' }}>Puntos Total</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center' }}>Tiempo</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>Temas</th>
                  </tr>
                </thead>
                <tbody>
                  {userStats.map((stat) => {
                    const date = new Date(stat.test_date);
                    const formattedDate = date.toLocaleDateString('es-ES', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    });

                    // Format temas_selected para mostrar
                    let temasText = 'N/A';
                    if (stat.temas_selected && Array.isArray(stat.temas_selected) && stat.temas_selected.length > 0) {
                      // Agrupar por manual y bloque
                      const grouped: Record<string, Record<string, number[]>> = {};

                      stat.temas_selected.forEach(t => {
                        if (!grouped[t.manual]) grouped[t.manual] = {};
                        if (!grouped[t.manual][t.bloque]) grouped[t.manual][t.bloque] = [];
                        if (!grouped[t.manual][t.bloque].includes(t.tema)) {
                          grouped[t.manual][t.bloque].push(t.tema);
                        }
                      });

                      // Formatear como "Manual - Bloque: Temas X, Y, Z"
                      const parts: string[] = [];
                      Object.keys(grouped).forEach(manual => {
                        Object.keys(grouped[manual]).forEach(bloque => {
                          const temas = grouped[manual][bloque].sort((a, b) => a - b);
                          const temasStr = temas.length === 1 ? `Tema ${temas[0]}` : `Temas ${temas.join(', ')}`;
                          parts.push(`${manual} - ${bloque}: ${temasStr}`);
                        });
                      });

                      temasText = parts.join(' | ');
                    }

                    return (
                      <tr key={stat.id} style={{ borderBottom: '1px solid #e0e0e0' }}>
                        <td style={{ padding: '0.75rem', fontSize: '0.8rem' }}>{formattedDate}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>{stat.num_questions}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                          <span style={{
                            padding: '0.25rem 0.75rem',
                            borderRadius: '6px',
                            fontWeight: 'bold',
                            background: stat.average_score >= 7 ? '#d4edda' : stat.average_score >= 5 ? '#fff3cd' : '#f8d7da',
                            color: stat.average_score >= 7 ? '#155724' : stat.average_score >= 5 ? '#856404' : '#721c24',
                            fontSize: '0.85rem'
                          }}>
                            {stat.average_score.toFixed(2)}/10
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.85rem' }}>
                          {stat.total_score.toFixed(1)}/{stat.num_questions * 10}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.85rem' }}>
                          {formatTime(stat.time_spent_seconds || 0)}
                        </td>
                        <td style={{ padding: '0.75rem', fontSize: '0.75rem', color: '#666' }}>
                          {temasText}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Gráficas por Manual */}
            {(() => {
              // Agrupar estadísticas por manual
              const statsByManual: Record<string, ExamResult[]> = {};

              userStats.forEach(stat => {
                if (stat.temas_selected && Array.isArray(stat.temas_selected) && stat.temas_selected.length > 0) {
                  // Obtener todos los manuales únicos de este examen
                  const manualesInExam = [...new Set(stat.temas_selected.map(t => t.manual))];

                  // Si solo hay 1 manual, agregarlo a las estadísticas de ese manual
                  if (manualesInExam.length === 1) {
                    const manual = manualesInExam[0];
                    if (!statsByManual[manual]) {
                      statsByManual[manual] = [];
                    }
                    statsByManual[manual].push(stat);
                  }
                }
              });

              // Renderizar gráficas solo para manuales con al menos 2 exámenes
              return Object.keys(statsByManual)
                .filter(manual => statsByManual[manual].length >= 2)
                .map(manual => {
                  const manualStats = statsByManual[manual].sort((a, b) =>
                    new Date(a.test_date).getTime() - new Date(b.test_date).getTime()
                  );

                  const avgScore = manualStats.reduce((sum, s) => sum + s.average_score, 0) / manualStats.length;

                  return (
                    <div key={manual} style={{
                      background: 'white',
                      padding: '1.5rem',
                      borderRadius: '12px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                      marginTop: '2rem'
                    }}>
                      <h3 style={{ marginBottom: '0.5rem', color: '#9B7653' }}>
                        Progreso en {manual}
                      </h3>
                      <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '1rem' }}>
                        {manualStats.length} exámenes · Promedio: <strong>{avgScore.toFixed(2)}/10</strong>
                      </p>

                      <div style={{ width: '100%', height: '250px', display: 'flex', alignItems: 'flex-end', gap: '0.5rem', padding: '1rem 0' }}>
                        {manualStats.map((stat, index) => {
                          const barHeight = (stat.average_score / 10) * 100;
                          const date = new Date(stat.test_date);
                          const shortDate = `${date.getDate()}/${date.getMonth() + 1}`;

                          return (
                            <div key={stat.id} style={{
                              flex: 1,
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              height: '100%',
                              justifyContent: 'flex-end'
                            }}>
                              <div style={{
                                width: '100%',
                                height: `${barHeight}%`,
                                background: stat.average_score >= 7 ? '#28a745' : stat.average_score >= 5 ? '#ffc107' : '#dc3545',
                                borderRadius: '4px 4px 0 0',
                                position: 'relative',
                                transition: 'all 0.3s ease',
                                minHeight: '20px'
                              }}>
                                <span style={{
                                  position: 'absolute',
                                  top: '-1.5rem',
                                  left: '50%',
                                  transform: 'translateX(-50%)',
                                  fontSize: '0.75rem',
                                  fontWeight: 'bold',
                                  color: '#333',
                                  whiteSpace: 'nowrap'
                                }}>
                                  {stat.average_score.toFixed(1)}
                                </span>
                              </div>
                              <div style={{
                                fontSize: '0.7rem',
                                color: '#666',
                                marginTop: '0.5rem',
                                textAlign: 'center'
                              }}>
                                #{index + 1}<br/>{shortDate}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                });
            })()}
          </>
        )}

        <div className="action-buttons" style={{ marginTop: '2rem' }}>
          <button className="primary-button" onClick={() => setScreen('home')}>
            Volver al Inicio
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="app-container">
      {screen === 'home' && renderHome()}
      {screen === 'select' && renderSelect()}
      {screen === 'exam' && renderExam()}
      {screen === 'loading' && renderLoading()}
      {screen === 'results' && renderResults()}
      {screen === 'stats' && renderStats()}
      {screen === 'admin' && renderAdmin()}
    </div>
  );
}

export default App;
