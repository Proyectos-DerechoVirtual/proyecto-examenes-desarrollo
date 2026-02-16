/**
 * Script para renombrar archivos de manuales agregando el course_id
 *
 * Este script:
 * 1. Lista todos los archivos .txt en el bucket de manuales
 * 2. Permite especificar un mapping de nombres a course_ids
 * 3. Renombra los archivos al nuevo formato: "Preguntas Manual Nombre-COURSEID.txt"
 *
 * Uso:
 *   npx ts-node scripts/rename-manuals-with-course-id.ts [--dry-run]
 *
 * Flags:
 *   --dry-run: Solo muestra lo que haría sin hacer cambios
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Necesita service role para manejar storage
);

// CONFIGURAR AQUÍ: Mapping de nombres de manuales a course_ids de Teachable
// Ejemplo: 'Manual Arbitraje' -> '2518286'
const MANUAL_TO_COURSE_ID: Record<string, string> = {
  // Agregar aquí los mappings, ejemplo:
  // 'Manual Arbitraje': '2518286',
  // 'Manual Penal Parte General': '2518287',
  // 'Manual Civil': '2518288',
};

const BUCKET_NAME = 'examen_manuales';
const BASE_PATH = 'Preguntas txt';
const DRY_RUN = process.argv.includes('--dry-run');

interface FileInfo {
  name: string;
  fullPath: string;
  currentManualName: string;
  newFileName: string | null;
  courseId: string | null;
  hasChanges: boolean;
}

/**
 * Extrae el nombre del manual del nombre del archivo
 * "Preguntas Manual Arbitraje.txt" -> "Manual Arbitraje"
 */
function extractManualName(fileName: string): string {
  return fileName
    .replace(/^Preguntas\s+/i, '')
    .replace(/\.txt$/i, '')
    .replace(/-\d{5,}$/, '') // Quitar course_id si ya existe
    .trim();
}

/**
 * Verifica si el archivo ya tiene course_id en el nombre
 */
function hasCourseId(fileName: string): boolean {
  return /-\d{5,}\.txt$/i.test(fileName);
}

/**
 * Lista todos los archivos .txt en el bucket recursivamente
 */
async function listAllTxtFiles(path = ''): Promise<any[]> {
  const allFiles: any[] = [];

  const { data: items, error } = await supabase.storage
    .from(BUCKET_NAME)
    .list(path, { limit: 1000 });

  if (error) {
    console.error(`Error listando ${path}:`, error);
    return [];
  }

  for (const item of items || []) {
    const fullPath = path ? `${path}/${item.name}` : item.name;

    if (item.id && item.name.endsWith('.txt')) {
      allFiles.push({
        name: item.name,
        fullPath,
        updated_at: item.updated_at
      });
    } else if (!item.id) {
      // Es una carpeta, explorar recursivamente
      const subFiles = await listAllTxtFiles(fullPath);
      allFiles.push(...subFiles);
    }
  }

  return allFiles;
}

/**
 * Renombra un archivo en Supabase Storage
 * (Supabase no tiene rename, hay que copiar y eliminar)
 */
async function renameFile(oldPath: string, newPath: string): Promise<boolean> {
  try {
    // 1. Descargar el archivo
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(BUCKET_NAME)
      .download(oldPath);

    if (downloadError || !fileData) {
      console.error(`Error descargando ${oldPath}:`, downloadError);
      return false;
    }

    // 2. Subir con el nuevo nombre
    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(newPath, fileData, { upsert: false });

    if (uploadError) {
      console.error(`Error subiendo ${newPath}:`, uploadError);
      return false;
    }

    // 3. Eliminar el archivo original
    const { error: deleteError } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([oldPath]);

    if (deleteError) {
      console.error(`Error eliminando ${oldPath}:`, deleteError);
      // El nuevo archivo ya existe, pero el viejo también
      return false;
    }

    return true;
  } catch (err) {
    console.error(`Error renombrando ${oldPath} a ${newPath}:`, err);
    return false;
  }
}

async function main() {
  console.log('\n🔄 Script de Renombrado de Manuales con Course ID');
  console.log('='.repeat(60));

  if (DRY_RUN) {
    console.log('⚠️  MODO DRY-RUN: No se realizarán cambios\n');
  }

  // Verificar configuración
  if (Object.keys(MANUAL_TO_COURSE_ID).length === 0) {
    console.log('\n⚠️  ADVERTENCIA: No hay mappings configurados en MANUAL_TO_COURSE_ID');
    console.log('   Edita el script y agrega los mappings de manual -> course_id\n');
  }

  // Listar archivos
  console.log(`📂 Listando archivos en ${BUCKET_NAME}/${BASE_PATH}...`);
  const files = await listAllTxtFiles(BASE_PATH);

  console.log(`   Encontrados: ${files.length} archivos .txt\n`);

  // Analizar cada archivo
  const fileInfos: FileInfo[] = [];

  for (const file of files) {
    const manualName = extractManualName(file.name);
    const alreadyHasCourseId = hasCourseId(file.name);
    const courseId = MANUAL_TO_COURSE_ID[manualName] || null;

    let newFileName: string | null = null;
    let hasChanges = false;

    if (alreadyHasCourseId) {
      // Ya tiene course_id, no necesita cambios
      newFileName = null;
      hasChanges = false;
    } else if (courseId) {
      // Tiene mapping, crear nuevo nombre
      newFileName = `Preguntas ${manualName}-${courseId}.txt`;
      hasChanges = true;
    } else {
      // No tiene mapping
      newFileName = null;
      hasChanges = false;
    }

    fileInfos.push({
      name: file.name,
      fullPath: file.fullPath,
      currentManualName: manualName,
      newFileName,
      courseId,
      hasChanges
    });
  }

  // Mostrar resumen
  console.log('📋 Resumen de archivos:\n');

  const toRename = fileInfos.filter(f => f.hasChanges);
  const alreadyRenamed = fileInfos.filter(f => hasCourseId(f.name));
  const noMapping = fileInfos.filter(f => !f.hasChanges && !hasCourseId(f.name));

  if (alreadyRenamed.length > 0) {
    console.log(`✅ Ya tienen course_id (${alreadyRenamed.length}):`);
    alreadyRenamed.forEach(f => console.log(`   - ${f.name}`));
    console.log();
  }

  if (toRename.length > 0) {
    console.log(`🔄 Para renombrar (${toRename.length}):`);
    toRename.forEach(f => {
      console.log(`   - ${f.name}`);
      console.log(`     → ${f.newFileName}`);
    });
    console.log();
  }

  if (noMapping.length > 0) {
    console.log(`⚠️  Sin mapping configurado (${noMapping.length}):`);
    noMapping.forEach(f => console.log(`   - ${f.name} (manual: "${f.currentManualName}")`));
    console.log('\n   Para agregar mappings, edita MANUAL_TO_COURSE_ID en este script');
    console.log();
  }

  // Ejecutar renombrado si no es dry-run
  if (toRename.length > 0 && !DRY_RUN) {
    console.log('\n🚀 Iniciando renombrado...\n');

    let success = 0;
    let failed = 0;

    for (const file of toRename) {
      const oldPath = file.fullPath;
      const newPath = oldPath.replace(file.name, file.newFileName!);

      process.stdout.write(`   ${file.name} → ${file.newFileName}... `);

      const result = await renameFile(oldPath, newPath);

      if (result) {
        console.log('✅');
        success++;
      } else {
        console.log('❌');
        failed++;
      }
    }

    console.log('\n📊 Resultado:');
    console.log(`   ✅ Renombrados exitosamente: ${success}`);
    console.log(`   ❌ Fallidos: ${failed}`);
  } else if (toRename.length === 0) {
    console.log('\n✅ No hay archivos para renombrar');
  }

  console.log('\n' + '='.repeat(60));
  console.log('Script finalizado\n');
}

main().catch(console.error);
