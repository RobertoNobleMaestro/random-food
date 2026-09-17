import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import type { Session, User } from '@supabase/supabase-js';
import { SUPABASE } from './supabase.client';

/**
 * Sesión del usuario, expuesta como señales.
 *
 * Supabase guarda la sesión en `localStorage` y la refresca sola; aquí solo se
 * refleja en señales para que las plantillas reaccionen.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly db = inject(SUPABASE);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _sesion = signal<Session | null>(null);
  private readonly _cargando = signal(true);

  readonly sesion = this._sesion.asReadonly();

  /**
   * `true` hasta que se sabe si hay sesión. Sin esto la interfaz parpadea
   * mostrando el login antes de recuperar la sesión guardada.
   */
  readonly cargando = this._cargando.asReadonly();

  readonly usuario = computed<User | null>(() => this._sesion()?.user ?? null);
  readonly autenticado = computed(() => this._sesion() !== null);

  constructor() {
    // El `catch` no es decorativo: si esto se queda a medias, `cargando` no se
    // apaga nunca y la aplicación se queda colgada en la barra de carga, sin
    // llegar siquiera a enseñar el formulario de entrada.
    void this.db.auth
      .getSession()
      .then(({ data }) => this._sesion.set(data.session))
      .catch(() => this._sesion.set(null))
      .finally(() => this._cargando.set(false));

    const { data } = this.db.auth.onAuthStateChange((_evento, sesion) => {
      this._sesion.set(sesion);
      this._cargando.set(false);
    });

    this.destroyRef.onDestroy(() => data.subscription.unsubscribe());
  }

  /**
   * Crea una cuenta. Si el proyecto tiene la confirmación por correo activada,
   * `necesitaConfirmacion` viene a `true` y no habrá sesión hasta que el
   * usuario pinche el enlace.
   */
  async registrar(email: string, password: string): Promise<{ necesitaConfirmacion: boolean }> {
    const { data, error } = await this.db.auth.signUp({ email, password });
    if (error) throw error;
    return { necesitaConfirmacion: data.session === null };
  }

  async entrar(email: string, password: string): Promise<void> {
    const { error } = await this.db.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async salir(): Promise<void> {
    const { error } = await this.db.auth.signOut();
    if (error) throw error;
  }
}
