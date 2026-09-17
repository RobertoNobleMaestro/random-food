import { effect, Injectable, signal } from '@angular/core';

export type Tema = 'auto' | 'claro' | 'oscuro';

const CLAVE = 'random-food:tema';

function leer(): Tema {
  try {
    const guardado = localStorage.getItem(CLAVE);
    if (guardado === 'claro' || guardado === 'oscuro') return guardado;
  } catch {
    // Almacenamiento bloqueado: se queda en automático.
  }
  return 'auto';
}

/**
 * Claro, oscuro o lo que diga el sistema.
 *
 * En automático no se pone atributo: mandan las media queries de `styles.css`.
 */
@Injectable({ providedIn: 'root' })
export class TemaService {
  private readonly _tema = signal<Tema>(leer());
  readonly tema = this._tema.asReadonly();

  constructor() {
    effect(() => {
      const tema = this._tema();
      const raiz = document.documentElement;

      if (tema === 'auto') raiz.removeAttribute('data-tema');
      else raiz.setAttribute('data-tema', tema);

      try {
        if (tema === 'auto') localStorage.removeItem(CLAVE);
        else localStorage.setItem(CLAVE, tema);
      } catch {
        // Sin persistencia: el tema dura lo que la pestaña.
      }
    });
  }

  poner(tema: Tema): void {
    this._tema.set(tema);
  }
}
