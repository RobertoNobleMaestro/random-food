import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { HogarService } from '../../core/hogar.service';
import { PlatosService } from '../../core/platos.service';
import { TemaService, type Tema } from '../../core/tema.service';
import { mensajeDeError } from '../../core/errores';
import type { Categoria } from '../../core/database.types';

const COLORES = [
  '#b45309',
  '#b91c1c',
  '#0369a1',
  '#ca8a04',
  '#15803d',
  '#c2410c',
  '#7c3aed',
  '#db2777',
  '#0f766e',
  '#4b5563',
];

@Component({
  selector: 'app-ajustes',
  imports: [FormsModule],
  templateUrl: './ajustes.html',
  styleUrl: './ajustes.css',
})
export class Ajustes {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly hogares = inject(HogarService);
  protected readonly platos = inject(PlatosService);
  protected readonly temas = inject(TemaService);

  protected readonly colores = COLORES;
  protected readonly temasDisponibles: Array<{ valor: Tema; etiqueta: string }> = [
    { valor: 'auto', etiqueta: 'Automático' },
    { valor: 'claro', etiqueta: 'Claro' },
    { valor: 'oscuro', etiqueta: 'Oscuro' },
  ];

  protected readonly correo = computed(() => this.auth.usuario()?.email ?? '');
  protected readonly codigo = computed(() => this.hogares.hogar()?.codigo_invitacion ?? '');

  protected readonly error = signal<string | null>(null);
  protected readonly copiado = signal(false);

  // Renombrar el hogar
  protected readonly editandoNombre = signal(false);
  protected readonly nombreHogar = signal('');

  // Categorías
  protected readonly categoriaEditando = signal<Categoria | 'nueva' | null>(null);
  protected readonly nombreCategoria = signal('');
  protected readonly colorCategoria = signal(COLORES[0]);
  protected readonly iconoCategoria = signal('');
  protected readonly guardandoCategoria = signal(false);

  protected readonly nombreCategoriaValido = computed(
    () => this.nombreCategoria().trim().length > 0,
  );

  /** Cuántos platos usan cada categoría, para avisar antes de borrar. */
  protected readonly usoPorCategoria = computed(() => {
    const cuenta = new Map<string, number>();
    for (const plato of this.platos.todos()) {
      if (plato.categoria_id) {
        cuenta.set(plato.categoria_id, (cuenta.get(plato.categoria_id) ?? 0) + 1);
      }
    }
    return cuenta;
  });

  // --- Hogar --------------------------------------------------------------

  protected empezarRenombrar(): void {
    this.nombreHogar.set(this.hogares.hogar()?.nombre ?? '');
    this.editandoNombre.set(true);
  }

  protected async renombrar(): Promise<void> {
    const nombre = this.nombreHogar().trim();
    if (!nombre) return;

    this.error.set(null);
    try {
      await this.hogares.renombrar(nombre);
      this.editandoNombre.set(false);
    } catch (err) {
      this.error.set(mensajeDeError(err));
    }
  }

  protected readonly rotando = signal(false);

  /** Un código que ha corrido por WhatsApp acaba donde no debe. */
  protected async rotarCodigo(): Promise<void> {
    if (!confirm('¿Generar un código nuevo? El actual dejará de funcionar.')) return;

    this.rotando.set(true);
    this.error.set(null);
    try {
      await this.hogares.rotarCodigo();
    } catch (err) {
      this.error.set(mensajeDeError(err));
    } finally {
      this.rotando.set(false);
    }
  }

  protected async copiarCodigo(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.codigo());
      this.copiado.set(true);
      setTimeout(() => this.copiado.set(false), 2000);
    } catch {
      // Sin permiso de portapapeles: el código está a la vista para copiarlo
      // a mano, así que no hace falta molestar con un error.
    }
  }

  // --- Categorías ---------------------------------------------------------

  protected nuevaCategoria(): void {
    this.nombreCategoria.set('');
    this.colorCategoria.set(COLORES[this.hogares.categorias().length % COLORES.length]);
    this.iconoCategoria.set('');
    this.error.set(null);
    this.categoriaEditando.set('nueva');
  }

  protected editarCategoria(categoria: Categoria): void {
    this.nombreCategoria.set(categoria.nombre);
    this.colorCategoria.set(categoria.color);
    this.iconoCategoria.set(categoria.icono ?? '');
    this.error.set(null);
    this.categoriaEditando.set(categoria);
  }

  protected cerrarCategoria(): void {
    if (this.guardandoCategoria()) return;
    this.categoriaEditando.set(null);
  }

  protected async guardarCategoria(): Promise<void> {
    const destino = this.categoriaEditando();
    if (!destino || !this.nombreCategoriaValido() || this.guardandoCategoria()) return;

    this.guardandoCategoria.set(true);
    this.error.set(null);

    const datos = {
      nombre: this.nombreCategoria().trim(),
      color: this.colorCategoria(),
      icono: this.iconoCategoria().trim() || null,
    };

    try {
      if (destino === 'nueva') await this.hogares.crearCategoria(datos);
      else await this.hogares.actualizarCategoria(destino.id, datos);

      this.categoriaEditando.set(null);
    } catch (err) {
      this.error.set(mensajeDeError(err));
    } finally {
      this.guardandoCategoria.set(false);
    }
  }

  protected async borrarCategoria(categoria: Categoria): Promise<void> {
    const enUso = this.usoPorCategoria().get(categoria.id) ?? 0;
    if (enUso > 0) {
      this.error.set(
        `«${categoria.nombre}» la usan ${enUso} platos. Cámbialos de categoría antes de borrarla.`,
      );
      return;
    }

    if (!confirm(`¿Borrar la categoría «${categoria.nombre}»?`)) return;

    this.guardandoCategoria.set(true);
    this.error.set(null);
    try {
      await this.hogares.borrarCategoria(categoria.id);
      this.categoriaEditando.set(null);
    } catch (err) {
      this.error.set(mensajeDeError(err));
    } finally {
      this.guardandoCategoria.set(false);
    }
  }

  // --- Cuenta -------------------------------------------------------------

  protected async cerrarSesion(): Promise<void> {
    await this.auth.salir();
    await this.router.navigateByUrl('/entrar');
  }

  protected async salirDelHogar(): Promise<void> {
    const nombre = this.hogares.hogar()?.nombre ?? 'este hogar';
    if (!confirm(`¿Salir de «${nombre}»? Dejarás de ver sus platos y su calendario.`)) return;

    this.error.set(null);
    try {
      await this.hogares.salir();
      await this.router.navigateByUrl('/hogar');
    } catch (err) {
      this.error.set(mensajeDeError(err));
    }
  }
}
