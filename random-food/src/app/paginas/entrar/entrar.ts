import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { mensajeDeError } from '../../core/errores';

type Modo = 'entrar' | 'registro';

@Component({
  selector: 'app-entrar',
  imports: [FormsModule],
  templateUrl: './entrar.html',
  styleUrl: './entrar.css',
})
export class Entrar {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly modo = signal<Modo>('entrar');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly confirmaCorreo = signal(false);

  protected readonly esRegistro = computed(() => this.modo() === 'registro');

  protected readonly valido = computed(
    () => this.email().includes('@') && this.password().length >= 6,
  );

  protected cambiarModo(): void {
    this.modo.update((m) => (m === 'entrar' ? 'registro' : 'entrar'));
    this.error.set(null);
    this.confirmaCorreo.set(false);
  }

  protected async enviar(): Promise<void> {
    if (!this.valido() || this.enviando()) return;

    this.enviando.set(true);
    this.error.set(null);

    try {
      if (this.esRegistro()) {
        const { necesitaConfirmacion } = await this.auth.registrar(this.email(), this.password());

        if (necesitaConfirmacion) {
          this.confirmaCorreo.set(true);
          return;
        }
      } else {
        await this.auth.entrar(this.email(), this.password());
      }

      const volver = this.ruta.snapshot.queryParamMap.get('volver');
      await this.router.navigateByUrl(volver ?? '/');
    } catch (err) {
      this.error.set(mensajeDeError(err));
    } finally {
      this.enviando.set(false);
    }
  }
}
