import { computed, inject, Injectable, signal } from '@angular/core';
import { SUPABASE } from './supabase.client';
import { HogarService } from './hogar.service';
import type { ComidaPlanificada, MomentoComida } from './database.types';
import type { Iso } from './fechas';
import type { Asignacion, ComidaPasada } from './generador';

export const MOMENTOS: MomentoComida[] = ['comida', 'cena'];

/** Un hueco vacío del calendario no tiene fila en la base: la clave es local. */
export function clave(fecha: Iso, momento: MomentoComida): string {
  return `${fecha}|${momento}`;
}

/**
 * El calendario. Mantiene cargado un rango de fechas (la semana o el mes que se
 * esté mirando) y lo recarga tras cada cambio.
 *
 * No hay tabla de historial: el historial es esta misma tabla con fecha pasada.
 */
@Injectable({ providedIn: 'root' })
export class PlanService {
  private readonly db = inject(SUPABASE);
  private readonly hogares = inject(HogarService);

  private readonly _entradas = signal<ComidaPlanificada[]>([]);
  private readonly _desde = signal<Iso | null>(null);
  private readonly _hasta = signal<Iso | null>(null);
  private readonly _cargando = signal(false);

  readonly entradas = this._entradas.asReadonly();
  readonly cargando = this._cargando.asReadonly();

  /** Indexado por `fecha|momento` para pintar el calendario sin buscar. */
  readonly porHueco = computed(
    () => new Map(this._entradas().map((e) => [clave(e.fecha, e.momento), e])),
  );

  /** Consulta un rango sin tocar el que está cargado. */
  async consultarRango(desde: Iso, hasta: Iso): Promise<ComidaPlanificada[]> {
    const hogarId = this.hogares.hogarId();
    if (!hogarId) return [];

    const { data, error } = await this.db
      .from('plan_comidas')
      .select('*')
      .eq('hogar_id', hogarId)
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha');
    if (error) throw error;

    return data ?? [];
  }

  /** Carga un rango y lo deja como el visible. */
  async cargar(desde: Iso, hasta: Iso): Promise<void> {
    this._desde.set(desde);
    this._hasta.set(hasta);
    this._cargando.set(true);
    try {
      this._entradas.set(await this.consultarRango(desde, hasta));
    } finally {
      this._cargando.set(false);
    }
  }

  private async recargar(): Promise<void> {
    const desde = this._desde();
    const hasta = this._hasta();
    if (desde && hasta) await this.cargar(desde, hasta);
  }

  async asignar(fecha: Iso, momento: MomentoComida, platoId: string): Promise<void> {
    const hogarId = this.hogares.hogarId();
    if (!hogarId) return;

    // `creado_por` lo fija un disparador a partir de auth.uid(), tanto al
    // insertar como al resolver el conflicto: no se manda desde el cliente.
    const { error } = await this.db.from('plan_comidas').upsert(
      { hogar_id: hogarId, fecha, momento, orden: 1, plato_id: platoId },
      { onConflict: 'hogar_id,fecha,momento,orden' },
    );
    if (error) throw error;

    await this.recargar();
  }

  /** Para huecos sin plato: «cenamos fuera», «sobras»... */
  async anotar(fecha: Iso, momento: MomentoComida, notas: string): Promise<void> {
    const hogarId = this.hogares.hogarId();
    if (!hogarId) return;

    const { error } = await this.db.from('plan_comidas').upsert(
      { hogar_id: hogarId, fecha, momento, orden: 1, plato_id: null, notas },
      { onConflict: 'hogar_id,fecha,momento,orden' },
    );
    if (error) throw error;

    await this.recargar();
  }

  async ponerComensales(id: string, comensales: number | null): Promise<void> {
    const { error } = await this.db.from('plan_comidas').update({ comensales }).eq('id', id);
    if (error) throw error;
    await this.recargar();
  }

  async limpiar(fecha: Iso, momento: MomentoComida): Promise<void> {
    const hogarId = this.hogares.hogarId();
    if (!hogarId) return;

    const { error } = await this.db
      .from('plan_comidas')
      .delete()
      .eq('hogar_id', hogarId)
      .eq('fecha', fecha)
      .eq('momento', momento);
    if (error) throw error;

    await this.recargar();
  }

  /** Vacía un rango entero de una sola consulta. */
  async limpiarRango(desde: Iso, hasta: Iso): Promise<void> {
    const hogarId = this.hogares.hogarId();
    if (!hogarId) return;

    const { error } = await this.db
      .from('plan_comidas')
      .delete()
      .eq('hogar_id', hogarId)
      .gte('fecha', desde)
      .lte('fecha', hasta);
    if (error) throw error;

    await this.recargar();
  }

  /** Guarda de golpe lo que produce el generador. */
  async guardarVarias(asignaciones: Asignacion[]): Promise<void> {
    const hogarId = this.hogares.hogarId();
    if (!hogarId || !asignaciones.length) return;

    const filas = asignaciones.map((a) => ({
      hogar_id: hogarId,
      fecha: a.fecha,
      momento: a.momento,
      orden: 1,
      plato_id: a.plato_id,
    }));

    const { error } = await this.db
      .from('plan_comidas')
      .upsert(filas, { onConflict: 'hogar_id,fecha,momento,orden' });
    if (error) throw error;

    await this.recargar();
  }

  /**
   * Lo que se comió en un rango, para que el generador no repita.
   * Consulta aparte de `cargar`: mira hacia atrás, fuera del rango visible.
   */
  async historial(desde: Iso, hasta: Iso): Promise<ComidaPasada[]> {
    const hogarId = this.hogares.hogarId();
    if (!hogarId) return [];

    const { data, error } = await this.db
      .from('plan_comidas')
      .select('fecha, plato_id')
      .eq('hogar_id', hogarId)
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .not('plato_id', 'is', null);
    if (error) throw error;

    return (data ?? [])
      .filter((fila): fila is { fecha: string; plato_id: string } => fila.plato_id !== null)
      .map((fila) => ({ fecha: fila.fecha, plato_id: fila.plato_id }));
  }

  /** Cuántas veces salió cada plato, para el panel de estadísticas. */
  async vecesPorPlato(desde: Iso, hasta: Iso): Promise<Map<string, number>> {
    const historial = await this.historial(desde, hasta);
    const cuenta = new Map<string, number>();
    for (const comida of historial) {
      cuenta.set(comida.plato_id, (cuenta.get(comida.plato_id) ?? 0) + 1);
    }
    return cuenta;
  }
}
