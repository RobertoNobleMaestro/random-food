/**
 * Credenciales de Supabase.
 *
 * Las dos salen del panel del proyecto, en Project Settings → API.
 *
 * La `anon key` viaja dentro del paquete que descarga el navegador: es pública
 * por diseño, y lo que protege los datos es Row Level Security, no el secreto
 * de esta clave. Se puede comitear sin problema.
 *
 * La `service_role` key NO va aquí ni en ningún otro punto del proyecto: se
 * salta RLS por completo.
 */
export const environment = {
  supabaseUrl: 'https://TU-PROYECTO.supabase.co',
  supabaseAnonKey: 'TU_ANON_KEY',
};
