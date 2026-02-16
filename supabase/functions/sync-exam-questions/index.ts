import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ParsedQuestion {
  pregunta: string
  respuesta_correcta: string
  manual: string
  bloque: string
  tema: number
  tema_nombre: string
  source_file: string
  course_id: string | null
}

// Parsear archivo TXT con formato de preguntas de examen
function parseQuestionsFile(content: string, fileName: string, fullPath: string): ParsedQuestion[] {
  const questions: ParsedQuestion[] = []

  // Extraer nombre del manual y course_id del nombre del archivo
  // Nuevo formato: "Preguntas Manual Arbitraje-2518286.txt" -> manual="Manual Arbitraje", course_id="2518286"
  // Formato antiguo: "Preguntas Manual Arbitraje.txt" -> manual="Manual Arbitraje", course_id=null
  let manualFromFileName = fileName
    .replace(/^Preguntas\s+/i, '')
    .replace(/\.txt$/i, '')
    .trim()

  // Extraer course_id si está presente (formato: "nombre-123456")
  let courseId: string | null = null
  const courseIdMatch = manualFromFileName.match(/-(\d{5,})$/)
  if (courseIdMatch) {
    courseId = courseIdMatch[1]
    // Quitar el course_id del nombre del manual
    manualFromFileName = manualFromFileName.replace(/-\d{5,}$/, '').trim()
  }

  // Dividir por doble salto de línea (separador entre preguntas)
  const blocks = content.split(/\n\s*\n/).filter(block => block.trim())

  // Para detectar cambios de tema por nombre (cuando no tienen número)
  // Mapa: "bloque|tema_nombre" -> número asignado
  const temasPorBloque = new Map<string, number>()
  // Contador de temas únicos por bloque
  const contadorPorBloque = new Map<string, number>()

  // Primera pasada: recolectar datos de cada pregunta
  const parsedBlocks: Array<{
    pregunta: string
    respuesta_correcta: string
    manual: string
    bloque: string
    bloqueFormateado: string
    temaOriginal: string
    temaNombre: string
    tieneNumero: boolean
    numeroExplicito: number
  }> = []

  for (const block of blocks) {
    const lines = block.trim().split('\n')

    let pregunta = ''
    let respuesta_correcta = ''
    let manual = manualFromFileName
    let bloque = ''
    let tema = ''

    for (const line of lines) {
      const trimmedLine = line.trim()

      if (trimmedLine.startsWith('Pregunta:')) {
        pregunta = trimmedLine.replace(/^Pregunta:\s*/i, '').trim()
      } else if (trimmedLine.startsWith('Respuesta Correcta:')) {
        respuesta_correcta = trimmedLine.replace(/^Respuesta Correcta:\s*/i, '').trim()
      // IGNORAMOS el campo Manual: del contenido - siempre usamos el nombre del archivo
      // } else if (trimmedLine.startsWith('Manual:')) {
      //   manual = trimmedLine.replace(/^Manual:\s*/i, '').trim()
      } else if (trimmedLine.startsWith('Bloque:')) {
        bloque = trimmedLine.replace(/^Bloque:\s*/i, '').trim()
      } else if (trimmedLine.startsWith('Tema:')) {
        tema = trimmedLine.replace(/^Tema:\s*/i, '').trim()
      }
    }

    // Solo procesar si tiene pregunta y respuesta
    if (pregunta && respuesta_correcta) {
      // Formatear bloque
      let bloqueFormateado = 'Bloque 1'
      const bloqueMatch = bloque.match(/(\d+)/)
      if (bloqueMatch) {
        bloqueFormateado = `Bloque ${bloqueMatch[1]}`
      } else if (bloque && !bloque.toLowerCase().startsWith('bloque')) {
        bloqueFormateado = `Bloque ${bloque}`
      } else if (bloque) {
        bloqueFormateado = bloque.charAt(0).toUpperCase() + bloque.slice(1)
      }

      // Detectar si el tema tiene número explícito
      const temaMatch = tema.match(/^(?:Tema\s*)?(\d+)/i)
      const tieneNumero = !!temaMatch
      const numeroExplicito = temaMatch ? parseInt(temaMatch[1]) : 0

      // Limpiar tema_nombre
      let temaNombre = tema
        .replace(/^Tema\s*\d+\s*[:\-]?\s*/i, '')
        .trim()

      if (!temaNombre) {
        temaNombre = tema || 'General'
      }

      parsedBlocks.push({
        pregunta,
        respuesta_correcta,
        manual,
        bloque,
        bloqueFormateado,
        temaOriginal: tema,
        temaNombre,
        tieneNumero,
        numeroExplicito
      })
    }
  }

  // Segunda pasada: asignar números de tema
  for (const pb of parsedBlocks) {
    let temaNumero: number

    if (pb.tieneNumero) {
      // Si tiene número explícito, usarlo
      temaNumero = pb.numeroExplicito
    } else {
      // Si no tiene número, asignar basado en el nombre del tema dentro del bloque
      const clave = `${pb.bloqueFormateado}|${pb.temaNombre.toLowerCase()}`

      if (temasPorBloque.has(clave)) {
        // Ya vimos este tema en este bloque, usar el mismo número
        temaNumero = temasPorBloque.get(clave)!
      } else {
        // Nuevo tema en este bloque, asignar siguiente número
        const contadorActual = contadorPorBloque.get(pb.bloqueFormateado) || 0
        temaNumero = contadorActual + 1
        contadorPorBloque.set(pb.bloqueFormateado, temaNumero)
        temasPorBloque.set(clave, temaNumero)
      }
    }

    questions.push({
      pregunta: pb.pregunta,
      respuesta_correcta: pb.respuesta_correcta,
      manual: pb.manual,
      bloque: pb.bloqueFormateado,
      tema: temaNumero,
      tema_nombre: pb.temaNombre,
      source_file: fullPath,
      course_id: courseId
    })
  }

  return questions
}

// Listar todos los archivos .txt en el bucket recursivamente
async function listAllTxtFiles(supabase: any, bucketName: string, path = ''): Promise<any[]> {
  const allFiles: any[] = []

  const { data: items, error } = await supabase.storage
    .from(bucketName)
    .list(path, { limit: 1000 })

  if (error) {
    console.error(`Error listando ${path}:`, error)
    return []
  }

  for (const item of items || []) {
    const fullPath = path ? `${path}/${item.name}` : item.name

    if (item.id && item.name.endsWith('.txt')) {
      // Es un archivo .txt
      allFiles.push({
        name: item.name,
        fullPath,
        updated_at: item.updated_at
      })
    } else if (!item.id) {
      // Es una carpeta, explorar recursivamente
      const subFiles = await listAllTxtFiles(supabase, bucketName, fullPath)
      allFiles.push(...subFiles)
    }
  }

  return allFiles
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const openaiKey = Deno.env.get('OPENAI_API_KEY')

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const logs: string[] = []
    const log = (msg: string) => {
      console.log(msg)
      logs.push(msg)
    }

    log('Iniciando sincronización de preguntas...')

    // 1. Obtener tracking existente
    const { data: trackingData } = await supabase
      .from('storage_sync_tracking')
      .select('file_path, file_updated_at')

    const tracking = new Map(
      (trackingData || []).map((t: any) => [t.file_path, t.file_updated_at])
    )

    log(`${tracking.size} archivos previamente sincronizados`)

    // 2. Listar archivos en Storage
    const bucketName = 'examen_manuales'
    const allFiles = await listAllTxtFiles(supabase, bucketName, 'Preguntas txt')

    log(`Encontrados ${allFiles.length} archivos .txt en Storage`)

    // 3. Detectar archivos eliminados
    const storageFilePaths = new Set(allFiles.map(f => f.fullPath))
    const deletedFiles: string[] = []

    for (const [trackedPath] of tracking) {
      if (!storageFilePaths.has(trackedPath)) {
        deletedFiles.push(trackedPath)
      }
    }

    // Eliminar preguntas de archivos que ya no existen
    for (const deletedPath of deletedFiles) {
      log(`Eliminando preguntas de: ${deletedPath}`)
      await supabase
        .from('examen_preguntas')
        .delete()
        .eq('source_file', deletedPath)

      await supabase
        .from('storage_sync_tracking')
        .delete()
        .eq('file_path', deletedPath)
    }

    // 4. Procesar archivos nuevos o modificados
    let filesProcessed = 0
    let filesSkipped = 0
    let totalQuestionsProcessed = 0
    let filesWithErrors = 0

    for (const file of allFiles) {
      const lastSynced = tracking.get(file.fullPath)

      // Saltar si no ha cambiado
      if (lastSynced && file.updated_at && new Date(lastSynced) >= new Date(file.updated_at)) {
        filesSkipped++
        continue
      }

      try {
        log(`Procesando: ${file.name}`)

        // Descargar archivo
        const { data: fileData, error: downloadError } = await supabase.storage
          .from(bucketName)
          .download(file.fullPath)

        if (downloadError || !fileData) {
          log(`ERROR descargando ${file.name}: ${downloadError?.message}`)
          filesWithErrors++
          continue
        }

        const content = await fileData.text()

        // Parsear preguntas
        const questions = parseQuestionsFile(content, file.name, file.fullPath)

        if (questions.length === 0) {
          log(`Sin preguntas válidas en ${file.name}`)
          filesWithErrors++
          continue
        }

        // Eliminar preguntas anteriores de este archivo
        await supabase
          .from('examen_preguntas')
          .delete()
          .eq('source_file', file.fullPath)

        // Insertar preguntas en lotes (sin embeddings para ser más rápido)
        // Los embeddings se generarán después con otro proceso
        const questionsToInsert = questions.map(q => ({
          pregunta: q.pregunta,
          respuesta_correcta: q.respuesta_correcta,
          manual: q.manual,
          bloque: q.bloque,
          tema: q.tema,
          tema_nombre: q.tema_nombre,
          source_file: q.source_file,
          course_id: q.course_id,
          embedding_model: 'text-embedding-3-large'
        }))

        // Insertar en lotes de 50
        const batchSize = 50
        for (let i = 0; i < questionsToInsert.length; i += batchSize) {
          const batch = questionsToInsert.slice(i, i + batchSize)
          const { error: insertError } = await supabase
            .from('examen_preguntas')
            .insert(batch)

          if (insertError) {
            console.error('Error insertando lote:', insertError)
          }
        }

        // Actualizar tracking
        const courseIdFromFile = questions[0]?.course_id || null
        await supabase
          .from('storage_sync_tracking')
          .upsert({
            file_path: file.fullPath,
            file_updated_at: file.updated_at,
            questions_count: questions.length,
            last_synced_at: new Date().toISOString(),
            course_id: courseIdFromFile
          }, { onConflict: 'file_path' })

        log(`OK: ${questions.length} preguntas de ${questions[0]?.manual || 'N/A'}${courseIdFromFile ? ` (course_id: ${courseIdFromFile})` : ''}`)
        filesProcessed++
        totalQuestionsProcessed += questions.length

      } catch (fileError) {
        log(`ERROR en ${file.name}: ${fileError}`)
        filesWithErrors++
      }
    }

    // 5. Contar total de preguntas en BD
    const { count: totalInDb } = await supabase
      .from('examen_preguntas')
      .select('*', { count: 'exact', head: true })

    log('')
    log('=== RESUMEN ===')
    log(`Archivos procesados: ${filesProcessed}`)
    log(`Archivos sin cambios: ${filesSkipped}`)
    log(`Archivos eliminados: ${deletedFiles.length}`)
    log(`Archivos con errores: ${filesWithErrors}`)
    log(`Preguntas sincronizadas: ${totalQuestionsProcessed}`)
    log(`Total en BD: ${totalInDb}`)
    log('')
    log('Sincronización completada')

    return new Response(
      JSON.stringify({
        success: true,
        filesProcessed,
        filesSkipped,
        filesDeleted: deletedFiles.length,
        filesWithErrors,
        totalQuestionsProcessed,
        totalInDb,
        logs
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('Error en sincronización:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        logs: [`ERROR FATAL: ${error.message}`]
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})
