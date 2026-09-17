import { inject, InjectionToken, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
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
  factory: () => {
    // `localStorage` no existe en Node. Durante el renderizado en servidor el
    // cliente tiene que funcionar sin persistir ni refrescar la sesión; si no,
    // el build con SSR revienta al renderizar.
    const enNavegador = isPlatformBrowser(inject(PLATFORM_ID));

    return createClient<Database>(environment.supabaseUrl, environment.supabaseAnonKey, {
      auth: {
        persistSession: enNavegador,
        autoRefreshToken: enNavegador,
        detectSessionInUrl: enNavegador,
      },
    });
  },
});
