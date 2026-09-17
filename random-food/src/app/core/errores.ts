/**
 * Traduce los errores de Supabase a algo que se pueda enseñar.
 *
 * Los mensajes vienen en inglés y los de Postgres son códigos crudos; soltarlos
 * tal cual en la interfaz no ayuda a nadie.
 */

/** Códigos SQLSTATE que este esquema puede devolver. */
const POR_CODIGO: Record<string, string> = {
  // unique_violation
  '23505': 'Ya existe algo con ese nombre.',
  // foreign_key_violation
  '23503': 'No se puede borrar: hay cosas que dependen de esto.',
  // check_violation
  '23514': 'Los datos no cumplen alguna condición del formulario.',
  // not_null_violation
  '23502': 'Falta un dato obligatorio.',
  // raise_exception / no_data_found de nuestras funciones
  P0002: 'El código de invitación no es válido.',
  '28000': 'Necesitas iniciar sesión.',
  // Limitador de intentos de unirse_a_hogar
  '54000': 'Demasiados intentos fallidos. Prueba dentro de una hora.',
  // Fila no encontrada o sin permiso para verla (PostgREST)
  PGRST116: 'No se encontró, o no tienes permiso para verlo.',
  '42501': 'No tienes permiso para hacer eso.',
};

/** Mensajes de Supabase Auth, que llegan en inglés. */
const POR_TEXTO: Array<[RegExp, string]> = [
  [/invalid login credentials/i, 'Correo o contraseña incorrectos.'],
  [/email not confirmed/i, 'Tienes que confirmar el correo antes de entrar. Mira tu bandeja.'],
  [/user already registered|already been registered/i, 'Ya hay una cuenta con ese correo.'],
  [/password should be at least (\d+)/i, 'La contraseña debe tener al menos $1 caracteres.'],
  [/unable to validate email|invalid email/i, 'Ese correo no parece válido.'],
  [/email rate limit|over_email_send_rate_limit/i, 'Demasiados intentos. Espera unos minutos.'],
  [/for security purposes.*(\d+) seconds/i, 'Espera unos segundos antes de volver a intentarlo.'],
  [/failed to fetch|network/i, 'No se pudo conectar. Revisa tu conexión.'],
  [/duplicate key value.*platos_nombre_unico/i, 'Ya tienes un plato con ese nombre.'],
  [/duplicate key value.*categorias_nombre_unico/i, 'Ya tienes una categoría con ese nombre.'],
  [/violates foreign key constraint.*platos_categoria/i,
    'Esa categoría tiene platos. Muévelos a otra antes de borrarla.'],
];

export function mensajeDeError(error: unknown): string {
  if (!error) return 'Algo ha ido mal.';

  const posible = error as { code?: string; message?: string; details?: string; hint?: string };
  const texto = [posible.message, posible.details, posible.hint].filter(Boolean).join(' ');

  // El texto es más específico que el código: «ya existe un plato con ese
  // nombre» dice más que «ya existe algo con ese nombre».
  for (const [patron, traduccion] of POR_TEXTO) {
    const coincidencia = texto.match(patron);
    if (coincidencia) {
      return traduccion.replace(/\$(\d)/g, (_, i) => coincidencia[Number(i)] ?? '');
    }
  }

  if (posible.code && POR_CODIGO[posible.code]) return POR_CODIGO[posible.code];
  if (posible.message) return posible.message;

  return 'Algo ha ido mal.';
}
