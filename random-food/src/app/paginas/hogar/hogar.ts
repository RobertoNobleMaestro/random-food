import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { HogarService } from '../../core/hogar.service';
import { mensajeDeError } from '../../core/errores';

@Component({
  selector: 'app-hogar',
  imports: [FormsModule],
  templateUrl: './hogar.html',
  styleUrl: './hogar.css',
})
export class HogarPagina {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly hogares = inject(HogarService);

  protected readonly nombre = signal('');
  protected readonly codigo = signal('');
  protected readonly creando = signal(false);
  protected readonly uniendo = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly correo = computed(() => this.auth.usuario()?.email ?? '');
  protected readonly nombreValido = computed(() => this.nombre().trim().length > 0);
  protected readonly codigoValido = computed(() => this.codigo().trim().length >= 4);
  protected readonly ocupado = computed(() => this.creando() || this.uniendo());

  protected async crear(): Promise<void> {
    if (!this.nombreValido() || this.ocupado()) return;

    this.creando.set(true);
    this.error.set(null);
    try {
      await this.hogares.crear(this.nombre().trim());
      await this.router.navigateByUrl('/semana');
    } catch (err) {
      this.error.set(mensajeDeError(err));
    } finally {
      this.creando.set(false);
    }
  }

  protected async unirse(): Promise<void> {
    if (!this.codigoValido() || this.ocupado()) return;

    this.uniendo.set(true);
    this.error.set(null);
    try {
      await this.hogares.unirse(this.codigo().trim());
      await this.router.navigateByUrl('/semana');
    } catch (err) {
      this.error.set(mensajeDeError(err));
    } finally {
      this.uniendo.set(false);
    }
  }

  protected async abrir(id: string): Promise<void> {
    this.hogares.elegir(id);
    await this.router.navigateByUrl('/semana');
  }

  protected async salir(): Promise<void> {
    await this.auth.salir();
    await this.router.navigateByUrl('/entrar');
  }
}
