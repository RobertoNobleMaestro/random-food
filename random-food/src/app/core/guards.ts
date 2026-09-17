import { inject, type Signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Router, type CanActivateFn } from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { HogarService } from './hogar.service';

/**
 * Espera a que una señal de «cargando» se apague.
 *
 * Sin esto los guardas deciden con información a medias: al recargar la página,
 * Supabase todavía está recuperando la sesión de `localStorage` y el usuario
 * acabaría rebotado al login aun estando dentro.
 *
 * Solo puede llamarse dentro de un contexto de inyección, como el cuerpo de un
 * guarda, porque `toObservable` lo necesita.
 */
function esperar(cargando: Signal<boolean>): Promise<unknown> | void {
  if (!cargando()) return;
  return firstValueFrom(toObservable(cargando).pipe(filter((activo) => !activo)));
}

/** Exige sesión. Recuerda a dónde iba para volver después de entrar. */
export const guardSesion: CanActivateFn = async (_ruta, estado) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const espera = esperar(auth.cargando);

  if (espera) await espera;

  return auth.autenticado() || router.createUrlTree(['/entrar'], {
    queryParams: estado.url === '/' ? undefined : { volver: estado.url },
  });
};

/** Exige sesión y un hogar. Sin hogar no hay nada que enseñar. */
export const guardHogar: CanActivateFn = async (ruta, estado) => {
  const auth = inject(AuthService);
  const hogares = inject(HogarService);
  const router = inject(Router);

  const esperaAuth = esperar(auth.cargando);
  if (esperaAuth) await esperaAuth;

  if (!auth.autenticado()) {
    return router.createUrlTree(['/entrar'], {
      queryParams: estado.url === '/' ? undefined : { volver: estado.url },
    });
  }

  const esperaHogar = esperar(hogares.cargando);
  if (esperaHogar) await esperaHogar;

  return hogares.tieneHogar() || router.createUrlTree(['/hogar']);
};

/** Para el login: si ya hay sesión, no tiene sentido enseñarlo. */
export const guardInvitado: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const espera = esperar(auth.cargando);

  if (espera) await espera;

  return !auth.autenticado() || router.createUrlTree(['/']);
};
