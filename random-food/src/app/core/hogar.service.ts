import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { SUPABASE } from './supabase.client';
import { AuthService } from './auth.service';
import type { Categoria, Hogar, Miembro } from './database.types';

/** Cuál de los hogares está abierto, si el usuario pertenece a varios. */
const CLAVE_ELEGIDO = 'random-food:hogar';

function leerElegido(): string | null {
  try {
    return localStorage.getItem(CLAVE_ELEGIDO);
  } catch {
    return null;
  }
}

function guardarElegido(id: string | null): void {
  try {
    if (id) localStorage.setItem(CLAVE_ELEGIDO, id);
    else localStorage.removeItem(CLAVE_ELEGIDO);
  } catch {
    // Modo privado o almacenamiento bloqueado: se sigue sin recordar la
    // elección, que no es crítica.
  }
}

/**
 * El hogar activo y sus categorías.
 *
 * Todo lo demás cuelga de aquí: sin hogar no hay nada que mostrar, y RLS
 * devolvería cero filas de todas formas.
 */
@Injectable({ providedIn: 'root' })
export class HogarService {
  private readonly db = inject(SUPABASE);
  private readonly auth = inject(AuthService);

  private readonly _hogares = signal<Hogar[]>([]);
  private readonly _categorias = signal<Categoria[]>([]);
  private readonly _elegido = signal<string | null>(leerElegido());
  private readonly _cargando = signal(true);

  readonly hogares = this._hogares.asReadonly();
  readonly categorias = this._categorias.asReadonly();
  readonly cargando = this._cargando.asReadonly();

  readonly hogar = computed<Hogar | null>(() => {
    const lista = this._hogares();
    const elegido = this._elegido();
    return lista.find((h) => h.id === elegido) ?? lista[0] ?? null;
  });

  readonly hogarId = computed(() => this.hogar()?.id ?? null);
  readonly tieneHogar = computed(() => this.hogar() !== null);

  /** Categorías indexadas por id, para pintar el calendario sin buscar. */
  readonly categoriaPorId = computed(() => new Map(this._categorias().map((c) => [c.id, c])));

  constructor() {
    effect(() => {
      const usuario = this.auth.usuario();
      const autenticando = this.auth.cargando();

      if (autenticando) return;

      if (!usuario) {
        this._hogares.set([]);
        this._categorias.set([]);
        this._cargando.set(false);
        return;
      }

      void this.recargar();
    });
  }

  async recargar(): Promise<void> {
    this._cargando.set(true);
    try {
      const { data, error } = await this.db.from('hogares').select('*').order('creado_en');
      if (error) throw error;

      this._hogares.set(data ?? []);
      await this.recargarCategorias();
    } finally {
      this._cargando.set(false);
    }
  }

  async recargarCategorias(): Promise<void> {
    const id = this.hogarId();
    if (!id) {
      this._categorias.set([]);
      return;
    }

    const { data, error } = await this.db
      .from('categorias')
      .select('*')
      .eq('hogar_id', id)
      .order('orden');
    if (error) throw error;

    this._categorias.set(data ?? []);
  }

  elegir(id: string): void {
    this._elegido.set(id);
    guardarElegido(id);
    void this.recargarCategorias();
  }

  /** Crea el hogar, te deja dentro como propietario y siembra las categorías. */
  async crear(nombre: string): Promise<Hogar> {
    const { data, error } = await this.db.rpc('crear_hogar', { _nombre: nombre });
    if (error) throw error;

    await this.recargar();
    this.elegir(data.id);
    return data;
  }

  /**
   * Canjea un código de invitación.
   *
   * Un código inexistente vuelve como `data: null` sin error: la función de la
   * base no lanza excepción para que su contador de intentos llegue a
   * confirmarse. Aquí se convierte en un error normal para la interfaz.
   */
  async unirse(codigo: string): Promise<Hogar> {
    const { data, error } = await this.db.rpc('unirse_a_hogar', { _codigo: codigo });
    if (error) throw error;
    if (!data) throw new Error('El código de invitación no es válido.');

    await this.recargar();
    this.elegir(data.id);
    return data;
  }

  /** Invalida el código actual y genera otro. Solo el propietario. */
  async rotarCodigo(): Promise<string> {
    const id = this.hogarId();
    if (!id) throw new Error('No hay ningún hogar abierto');

    const { data, error } = await this.db.rpc('rotar_codigo_invitacion', { _hogar_id: id });
    if (error) throw error;

    await this.recargar();
    return data;
  }

  async renombrar(nombre: string): Promise<void> {
    const id = this.hogarId();
    if (!id) return;

    const { error } = await this.db.from('hogares').update({ nombre }).eq('id', id);
    if (error) throw error;
    await this.recargar();
  }

  async miembros(): Promise<Miembro[]> {
    const id = this.hogarId();
    if (!id) return [];

    const { data, error } = await this.db.from('miembros').select('*').eq('hogar_id', id);
    if (error) throw error;
    return data ?? [];
  }

  /** Te sale del hogar. El último propietario no puede irse. */
  async salir(): Promise<void> {
    const id = this.hogarId();
    const usuario = this.auth.usuario();
    if (!id || !usuario) return;

    const { error } = await this.db
      .from('miembros')
      .delete()
      .eq('hogar_id', id)
      .eq('user_id', usuario.id);
    if (error) throw error;

    guardarElegido(null);
    this._elegido.set(null);
    await this.recargar();
  }

  // --- Categorías ---------------------------------------------------------

  async crearCategoria(datos: {
    nombre: string;
    color: string;
    icono: string | null;
  }): Promise<void> {
    const id = this.hogarId();
    if (!id) return;

    const orden = this._categorias().reduce((max, c) => Math.max(max, c.orden), 0) + 1;

    const { error } = await this.db.from('categorias').insert({ hogar_id: id, orden, ...datos });
    if (error) throw error;
    await this.recargarCategorias();
  }

  async actualizarCategoria(id: string, cambios: Partial<Categoria>): Promise<void> {
    const { error } = await this.db.from('categorias').update(cambios).eq('id', id);
    if (error) throw error;
    await this.recargarCategorias();
  }

  /**
   * Borra una categoría. La base lo rechaza (`ON DELETE RESTRICT`) si tiene
   * platos: es deliberado, hay que moverlos antes en vez de dejarlos sin
   * clasificar en silencio.
   */
  async borrarCategoria(id: string): Promise<void> {
    const { error } = await this.db.from('categorias').delete().eq('id', id);
    if (error) throw error;
    await this.recargarCategorias();
  }
}
