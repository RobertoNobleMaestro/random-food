import { computed, DestroyRef, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
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
  private readonly enNavegador = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly destroyRef = inject(DestroyRef);

  private readonly _sesion = signal<Session | null>(null);
  private readonly _cargando = signal(true);

  readonly sesion = this._sesion.asReadonly();

  /**
   * `true` hasta que se sabe si hay sesión. Sin esto, la interfaz parpadea
   * mostrando la pantalla de login antes de recuperar la sesión guardada.
   */
  readonly cargando = this._cargando.asReadonly();

  readonly usuario = computed<User | null>(() => this._sesion()?.user ?? null);
  readonly autenticado = computed(() => this._sesion() !== null);

  constructor() {
    // En servidor no hay sesión que recuperar ni a la que suscribirse.
    if (!this.enNavegador) {
      this._cargando.set(false);
      return;
    }

    void this.db.auth.getSession().then(({ data }) => {
      this._sesion.set(data.session);
      this._cargando.set(false);
    });

    const { data } = this.db.auth.onAuthStateChange((_evento, sesion) => {
      this._sesion.set(sesion);
      this._cargando.set(false);
    });

    this.destroyRef.onDestroy(() => data.subscription.unsubscribe());
  }

  /**
   * Crea una cuenta. Según la configuración del proyecto puede requerir
   * confirmar el correo antes de poder entrar.
   */
  async registrar(email: string, password: string): Promise<void> {
    const { error } = await this.db.auth.signUp({ email, password });
    if (error) throw error;
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
