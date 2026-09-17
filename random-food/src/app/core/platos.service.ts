import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { SUPABASE } from './supabase.client';
import { HogarService } from './hogar.service';
import type { Plato } from './database.types';

export interface DatosPlato {
  nombre: string;
  categoria_id: string | null;
  url_cookidoo: string | null;
  notas: string | null;
  favorito: boolean;
  apto_comida: boolean;
  apto_cena: boolean;
  raciones_base: number | null;
}

/** El catálogo del hogar. Se carga entero: son decenas de filas, no miles. */
@Injectable({ providedIn: 'root' })
export class PlatosService {
  private readonly db = inject(SUPABASE);
  private readonly hogares = inject(HogarService);

  private readonly _platos = signal<Plato[]>([]);
  private readonly _cargando = signal(true);

  readonly todos = this._platos.asReadonly();
  readonly cargando = this._cargando.asReadonly();

  readonly activos = computed(() => this._platos().filter((p) => !p.archivado));
  readonly archivados = computed(() => this._platos().filter((p) => p.archivado));
  readonly favoritos = computed(() => this.activos().filter((p) => p.favorito));
  readonly porId = computed(() => new Map(this._platos().map((p) => [p.id, p])));

  constructor() {
    effect(() => {
      const id = this.hogares.hogarId();

      if (!id) {
        this._platos.set([]);
        this._cargando.set(this.hogares.cargando());
        return;
      }

      void this.recargar();
    });
  }

  async recargar(): Promise<void> {
    const id = this.hogares.hogarId();
    if (!id) return;

    this._cargando.set(true);
    try {
      const { data, error } = await this.db
        .from('platos')
        .select('*')
        .eq('hogar_id', id)
        .order('nombre');
      if (error) throw error;

      this._platos.set(data ?? []);
    } finally {
      this._cargando.set(false);
    }
  }

  async crear(datos: DatosPlato): Promise<Plato> {
    const hogarId = this.hogares.hogarId();
    if (!hogarId) throw new Error('No hay ningún hogar abierto');

    // `creado_por` no se manda: un disparador lo fija a auth.uid(), para que no
    // se pueda atribuir un plato a otra persona.
    const { data, error } = await this.db
      .from('platos')
      .insert({ ...datos, hogar_id: hogarId })
      .select()
      .single();
    if (error) throw error;

    await this.recargar();
    return data;
  }

  async actualizar(id: string, cambios: Partial<DatosPlato>): Promise<void> {
    const { error } = await this.db.from('platos').update(cambios).eq('id', id);
    if (error) throw error;
    await this.recargar();
  }

  /**
   * Archivar en vez de borrar: el plato desaparece del catálogo pero el
   * historial del calendario donde aparece se conserva.
   */
  async archivar(id: string): Promise<void> {
    const { error } = await this.db.from('platos').update({ archivado: true }).eq('id', id);
    if (error) throw error;
    await this.recargar();
  }

  async restaurar(id: string): Promise<void> {
    const { error } = await this.db.from('platos').update({ archivado: false }).eq('id', id);
    if (error) throw error;
    await this.recargar();
  }

  // No hay borrado definitivo a propósito: `delete` sobre un plato arrastra en
  // cascada sus apariciones en plan_comidas, o sea el historial. Archivar hace
  // lo que la gente espera del botón de borrar sin perder nada.

  async alternarFavorito(plato: Plato): Promise<void> {
    // Optimista: el corazón responde al instante y se corrige si falla.
    this._platos.update((lista) =>
      lista.map((p) => (p.id === plato.id ? { ...p, favorito: !p.favorito } : p)),
    );

    const { error } = await this.db
      .from('platos')
      .update({ favorito: !plato.favorito })
      .eq('id', plato.id);

    if (error) {
      await this.recargar();
      throw error;
    }
  }
}
