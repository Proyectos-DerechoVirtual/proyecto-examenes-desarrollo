import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Faltan variables de entorno de Supabase');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Types
export interface SupabaseQuestion {
  id: number;
  pregunta: string;
  respuesta_correcta: string;
  tema: number;
  bloque: string;
  manual: string;
  categoria: string;
  course_id?: string | null;
  embedding_pregunta?: number[] | string;
  embedding_respuesta?: number[] | string;
  embedding_model?: string;
  source_file?: string;
  created_at?: string;
}

export interface Pregunta {
  id: number;
  pregunta: string;
  respuesta_correcta: string;
  tema: number;
  bloque: string;
  manual: string;
  course_id?: string | null;
  embedding_pregunta?: number[];
  embedding_respuesta?: number[];
  embedding_model?: string;
  source_file?: string;
  created_at?: string;
}

export interface TemaInfo {
  numero: number;
  nombre: string | null;
  course_id?: string | null;
}

export interface ManualBloqueData {
  [manual: string]: {
    [bloque: string]: TemaInfo[]; // Array of tema info with number and name
  };
}
