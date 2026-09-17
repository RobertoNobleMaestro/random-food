import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { HogarService } from './core/hogar.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly auth = inject(AuthService);
  protected readonly hogares = inject(HogarService);

  /** La navegación solo tiene sentido con sesión y con un hogar abierto. */
  protected readonly mostrarNav = computed(
    () => this.auth.autenticado() && this.hogares.tieneHogar(),
  );

  protected readonly arrancando = computed(
    () => this.auth.cargando() || (this.auth.autenticado() && this.hogares.cargando()),
  );
}
