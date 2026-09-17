import { InjectionToken } from '@angular/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import type { Database } from './database.types';

/** Cliente de Supabase tipado con el esquema del proyecto. */
export type ClienteSupabase = SupabaseClient<Database>;

/**
 * Se inyecta con `inject(SUPABASE)`.
 *
 * Un token en vez de un servicio porque no hay estado que envolver: es un único
 * cliente para toda la aplicación.
 */
export const SUPABASE = new InjectionToken<ClienteSupabase>('Cliente de Supabase', {
  providedIn: 'root',
  factory: () =>
    createClient<Database>(environment.supabaseUrl, environment.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }),
});
