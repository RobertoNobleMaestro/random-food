/**
 * Utilidades de fecha en formato `YYYY-MM-DD`, que es como las guarda Postgres
 * en una columna `date`.
 *
 * Nunca se usa `toISOString()`: convierte a UTC y, según la hora y la zona,
 * devuelve el día anterior o el siguiente. Todo va con los componentes locales.
 */

export type Iso = string;

export function aIso(fecha: Date): Iso {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

/** Medianoche local del día indicado. */
export function deIso(iso: Iso): Date {
  const [anio, mes, dia] = iso.split('-').map(Number);
  return new Date(anio, mes - 1, dia);
}

export function hoy(): Iso {
  return aIso(new Date());
}

export function sumarDias(iso: Iso, dias: number): Iso {
  const fecha = deIso(iso);
  fecha.setDate(fecha.getDate() + dias);
  return aIso(fecha);
}

/** Días completos de `desde` a `hasta`. Negativo si `hasta` es anterior. */
export function diasEntre(desde: Iso, hasta: Iso): number {
  const ms = deIso(hasta).getTime() - deIso(desde).getTime();
  return Math.round(ms / 86_400_000);
}

/** Lunes de la semana a la que pertenece `iso`. */
export function inicioSemana(iso: Iso): Iso {
  const fecha = deIso(iso);
  const desdeLunes = (fecha.getDay() + 6) % 7;
  fecha.setDate(fecha.getDate() - desdeLunes);
  return aIso(fecha);
}

export function primerDiaDelMes(iso: Iso): Iso {
  const fecha = deIso(iso);
  fecha.setDate(1);
  return aIso(fecha);
}

export function ultimoDiaDelMes(iso: Iso): Iso {
  const fecha = deIso(iso);
  fecha.setMonth(fecha.getMonth() + 1, 0);
  return aIso(fecha);
}

export function rango(desde: Iso, hasta: Iso): Iso[] {
  const dias: Iso[] = [];
  for (let i = 0; i <= diasEntre(desde, hasta); i++) dias.push(sumarDias(desde, i));
  return dias;
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export function nombreDia(iso: Iso): string {
  return DIAS[deIso(iso).getDay()];
}

export function nombreDiaCorto(iso: Iso): string {
  return nombreDia(iso).slice(0, 3);
}

export function numeroDia(iso: Iso): number {
  return deIso(iso).getDate();
}

export function nombreMes(iso: Iso): string {
  return MESES[deIso(iso).getMonth()];
}

/** «lunes, 3 de marzo» */
export function formatearLargo(iso: Iso): string {
  return `${nombreDia(iso)}, ${numeroDia(iso)} de ${nombreMes(iso)}`;
}

/** «3 mar» */
export function formatearCorto(iso: Iso): string {
  return `${numeroDia(iso)} ${nombreMes(iso).slice(0, 3)}`;
}

/** Título de un rango: «3 – 9 de marzo» o «28 de febrero – 6 de marzo». */
export function formatearRango(desde: Iso, hasta: Iso): string {
  const mismoMes = nombreMes(desde) === nombreMes(hasta);
  return mismoMes
    ? `${numeroDia(desde)} – ${numeroDia(hasta)} de ${nombreMes(hasta)}`
    : `${numeroDia(desde)} de ${nombreMes(desde)} – ${numeroDia(hasta)} de ${nombreMes(hasta)}`;
}

export function esHoy(iso: Iso): boolean {
  return iso === hoy();
}

export function esPasado(iso: Iso): boolean {
  return diasEntre(hoy(), iso) < 0;
}

export function esFinDeSemana(iso: Iso): boolean {
  const dia = deIso(iso).getDay();
  return dia === 0 || dia === 6;
}
