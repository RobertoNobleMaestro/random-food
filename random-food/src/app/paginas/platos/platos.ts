import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HogarService } from '../../core/hogar.service';
import { PlatosService, type DatosPlato } from '../../core/platos.service';
import { mensajeDeError } from '../../core/errores';
import type { Plato } from '../../core/database.types';

function formularioVacio(): DatosPlato {
  return {
    nombre: '',
    categoria_id: null,
    url_cookidoo: null,
    notas: null,
    favorito: false,
    apto_comida: true,
    apto_cena: true,
    raciones_base: null,
  };
}

@Component({
  selector: 'app-platos',
  imports: [FormsModule],
  templateUrl: './platos.html',
  styleUrl: './platos.css',
})
export class Platos {
  protected readonly platos = inject(PlatosService);
  protected readonly hogares = inject(HogarService);

  protected readonly busqueda = signal('');
  protected readonly filtroCategoria = signal<string>('');
  protected readonly soloFavoritos = signal(false);
  protected readonly verArchivados = signal(false);

  /** `null` cerrado, `'nuevo'` alta, o el plato que se está editando. */
  protected readonly editando = signal<Plato | 'nuevo' | null>(null);
  protected readonly formulario = signal<DatosPlato>(formularioVacio());
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly visibles = computed(() => {
    const texto = this.busqueda().trim().toLowerCase();
    const categoria = this.filtroCategoria();
    const base = this.verArchivados() ? this.platos.archivados() : this.platos.activos();

    return base.filter((plato) => {
      if (texto && !plato.nombre.toLowerCase().includes(texto)) return false;
      if (categoria && plato.categoria_id !== categoria) return false;
      if (this.soloFavoritos() && !plato.favorito) return false;
      return true;
    });
  });

  protected readonly hayFiltros = computed(
    () => !!this.busqueda().trim() || !!this.filtroCategoria() || this.soloFavoritos(),
  );

  protected readonly nombreValido = computed(() => this.formulario().nombre.trim().length > 0);

  protected readonly momentoValido = computed(
    () => this.formulario().apto_comida || this.formulario().apto_cena,
  );

  protected categoriaDe(plato: Plato) {
    return plato.categoria_id ? this.hogares.categoriaPorId().get(plato.categoria_id) : undefined;
  }

  protected abrirNuevo(): void {
    this.formulario.set(formularioVacio());
    this.error.set(null);
    this.editando.set('nuevo');
  }

  protected abrirEdicion(plato: Plato): void {
    this.formulario.set({
      nombre: plato.nombre,
      categoria_id: plato.categoria_id,
      url_cookidoo: plato.url_cookidoo,
      notas: plato.notas,
      favorito: plato.favorito,
      apto_comida: plato.apto_comida,
      apto_cena: plato.apto_cena,
      raciones_base: plato.raciones_base,
    });
    this.error.set(null);
    this.editando.set(plato);
  }

  protected cerrar(): void {
    if (this.guardando()) return;
    this.editando.set(null);
  }

  protected actualizar<K extends keyof DatosPlato>(campo: K, valor: DatosPlato[K]): void {
    this.formulario.update((f) => ({ ...f, [campo]: valor }) as DatosPlato);
  }

  /** Un campo de texto vacío es `null` en la base, no cadena vacía. */
  protected actualizarTexto(campo: 'url_cookidoo' | 'notas', valor: string): void {
    this.actualizar(campo, valor.trim() ? valor.trim() : null);
  }

  protected actualizarRaciones(valor: string): void {
    const numero = Number.parseInt(valor, 10);
    this.actualizar('raciones_base', Number.isFinite(numero) && numero > 0 ? numero : null);
  }

  protected async guardar(): Promise<void> {
    if (!this.nombreValido() || !this.momentoValido() || this.guardando()) return;

    const destino = this.editando();
    if (!destino) return;

    this.guardando.set(true);
    this.error.set(null);
    try {
      const datos = { ...this.formulario(), nombre: this.formulario().nombre.trim() };

      if (destino === 'nuevo') await this.platos.crear(datos);
      else await this.platos.actualizar(destino.id, datos);

      this.editando.set(null);
    } catch (err) {
      this.error.set(mensajeDeError(err));
    } finally {
      this.guardando.set(false);
    }
  }

  protected async alternarFavorito(plato: Plato, evento: Event): Promise<void> {
    evento.stopPropagation();
    try {
      await this.platos.alternarFavorito(plato);
    } catch (err) {
      this.error.set(mensajeDeError(err));
    }
  }

  protected async archivar(plato: Plato): Promise<void> {
    this.guardando.set(true);
    this.error.set(null);
    try {
      await this.platos.archivar(plato.id);
      this.editando.set(null);
    } catch (err) {
      this.error.set(mensajeDeError(err));
    } finally {
      this.guardando.set(false);
    }
  }

  protected async restaurar(plato: Plato): Promise<void> {
    try {
      await this.platos.restaurar(plato.id);
    } catch (err) {
      this.error.set(mensajeDeError(err));
    }
  }

  protected limpiarFiltros(): void {
    this.busqueda.set('');
    this.filtroCategoria.set('');
    this.soloFavoritos.set(false);
  }
}
