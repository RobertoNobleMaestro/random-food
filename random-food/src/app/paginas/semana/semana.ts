import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HogarService } from '../../core/hogar.service';
import { PlanService, clave, MOMENTOS } from '../../core/plan.service';
import { PlatosService } from '../../core/platos.service';
import { mensajeDeError } from '../../core/errores';
import {
  generarPlan,
  OPCIONES_POR_DEFECTO,
  type Hueco,
  type OpcionesGenerador,
} from '../../core/generador';
import * as f from '../../core/fechas';
import type { MomentoComida, Plato } from '../../core/database.types';

@Component({
  selector: 'app-semana',
  imports: [FormsModule, RouterLink],
  templateUrl: './semana.html',
  styleUrl: './semana.css',
})
export class Semana {
  protected readonly plan = inject(PlanService);
  protected readonly platos = inject(PlatosService);
  protected readonly hogares = inject(HogarService);

  protected readonly momentos = MOMENTOS;
  protected readonly f = f;

  /** Lunes de la semana que se está mirando. */
  protected readonly inicio = signal(f.inicioSemana(f.hoy()));
  protected readonly fin = computed(() => f.sumarDias(this.inicio(), 6));
  protected readonly dias = computed(() => f.rango(this.inicio(), this.fin()));
  protected readonly titulo = computed(() => f.formatearRango(this.inicio(), this.fin()));
  protected readonly esSemanaActual = computed(() => this.inicio() === f.inicioSemana(f.hoy()));

  protected readonly error = signal<string | null>(null);
  protected readonly avisos = signal<string[]>([]);
  protected readonly generando = signal(false);

  /** Hueco cuyo selector de plato está abierto. */
  protected readonly huecoActivo = signal<Hueco | null>(null);
  protected readonly busqueda = signal('');

  protected readonly panelGenerador = signal(false);
  protected readonly opciones = signal<OpcionesGenerador>({ ...OPCIONES_POR_DEFECTO });

  protected readonly huecosVacios = computed(() => {
    const mapa = this.plan.porHueco();
    let cuenta = 0;
    for (const dia of this.dias()) {
      for (const momento of MOMENTOS) if (!mapa.get(clave(dia, momento))) cuenta++;
    }
    return cuenta;
  });

  /** Platos que caben en el hueco abierto, con los favoritos arriba. */
  protected readonly candidatos = computed(() => {
    const hueco = this.huecoActivo();
    if (!hueco) return [];

    const texto = this.busqueda().trim().toLowerCase();

    return this.platos
      .activos()
      .filter((p) => (hueco.momento === 'comida' ? p.apto_comida : p.apto_cena))
      .filter((p) => !texto || p.nombre.toLowerCase().includes(texto))
      .sort((a, b) =>
        a.favorito === b.favorito ? a.nombre.localeCompare(b.nombre, 'es') : a.favorito ? -1 : 1,
      );
  });

  constructor() {
    effect(() => {
      const desde = this.inicio();
      const hasta = this.fin();
      // Releer el hogar hace que el calendario se recargue al cambiar de casa.
      this.hogares.hogarId();
      void this.plan.cargar(desde, hasta);
    });
  }

  // --- Navegación ---------------------------------------------------------

  protected mover(semanas: number): void {
    this.inicio.update((i) => f.sumarDias(i, semanas * 7));
    this.avisos.set([]);
  }

  protected irAHoy(): void {
    this.inicio.set(f.inicioSemana(f.hoy()));
    this.avisos.set([]);
  }

  // --- Consultas de la plantilla -----------------------------------------

  protected entradaDe(fecha: string, momento: MomentoComida) {
    return this.plan.porHueco().get(clave(fecha, momento));
  }

  protected platoDe(fecha: string, momento: MomentoComida): Plato | undefined {
    const id = this.entradaDe(fecha, momento)?.plato_id;
    return id ? this.platos.porId().get(id) : undefined;
  }

  protected categoriaDe(plato: Plato | undefined) {
    return plato?.categoria_id ? this.hogares.categoriaPorId().get(plato.categoria_id) : undefined;
  }

  protected etiquetaMomento(momento: MomentoComida): string {
    return momento === 'comida' ? 'Comida' : 'Cena';
  }

  // --- Asignación ---------------------------------------------------------

  protected abrirHueco(fecha: string, momento: MomentoComida): void {
    this.busqueda.set('');
    this.error.set(null);
    this.huecoActivo.set({ fecha, momento });
  }

  protected cerrarHueco(): void {
    this.huecoActivo.set(null);
  }

  protected async elegir(plato: Plato): Promise<void> {
    const hueco = this.huecoActivo();
    if (!hueco) return;

    try {
      await this.plan.asignar(hueco.fecha, hueco.momento, plato.id);
      this.huecoActivo.set(null);
    } catch (err) {
      this.error.set(mensajeDeError(err));
    }
  }

  protected async anotarFuera(): Promise<void> {
    const hueco = this.huecoActivo();
    if (!hueco) return;

    try {
      await this.plan.anotar(hueco.fecha, hueco.momento, 'Comemos fuera');
      this.huecoActivo.set(null);
    } catch (err) {
      this.error.set(mensajeDeError(err));
    }
  }

  protected async vaciar(): Promise<void> {
    const hueco = this.huecoActivo();
    if (!hueco) return;

    try {
      await this.plan.limpiar(hueco.fecha, hueco.momento);
      this.huecoActivo.set(null);
    } catch (err) {
      this.error.set(mensajeDeError(err));
    }
  }

  // --- Generador ----------------------------------------------------------

  protected ajustar<K extends keyof OpcionesGenerador>(
    campo: K,
    valor: OpcionesGenerador[K],
  ): void {
    this.opciones.update((o) => ({ ...o, [campo]: valor }) as OpcionesGenerador);
  }

  protected ajustarDias(valor: string): void {
    const numero = Number.parseInt(valor, 10);
    this.ajustar('diasSinRepetir', Number.isFinite(numero) && numero >= 0 ? numero : 0);
  }

  protected generarSemana(): Promise<void> {
    return this.generar(this.inicio(), this.fin());
  }

  protected generarMes(): Promise<void> {
    return this.generar(f.primerDiaDelMes(this.inicio()), f.ultimoDiaDelMes(this.inicio()));
  }

  private async generar(desde: string, hasta: string): Promise<void> {
    if (this.generando()) return;

    this.generando.set(true);
    this.error.set(null);
    this.avisos.set([]);

    try {
      const opciones = this.opciones();

      // Si se van a respetar los huecos ya puestos, cuentan como historial para
      // que el generador no los repita; si se sobrescriben, no.
      const finHistorial = opciones.sobrescribir ? f.sumarDias(desde, -1) : hasta;
      const historial = await this.plan.historial(
        f.sumarDias(desde, -Math.max(opciones.diasSinRepetir, 1)),
        finHistorial,
      );

      const ocupados = new Set(
        (await this.plan.consultarRango(desde, hasta)).map((e) => clave(e.fecha, e.momento)),
      );

      const huecos: Hueco[] = [];
      for (const fecha of f.rango(desde, hasta)) {
        for (const momento of MOMENTOS) {
          if (opciones.sobrescribir || !ocupados.has(clave(fecha, momento))) {
            huecos.push({ fecha, momento });
          }
        }
      }

      if (!huecos.length) {
        this.avisos.set(['No había ningún hueco libre. Marca «rehacer los que ya están» si quieres rellenarlos igualmente.']);
        return;
      }

      const resultado = generarPlan(huecos, this.platos.activos(), historial, opciones);
      await this.plan.guardarVarias(resultado.asignaciones);

      const avisos = [...resultado.avisos];
      if (resultado.sinCubrir.length) {
        avisos.push(
          `Quedaron ${resultado.sinCubrir.length} huecos sin rellenar: no hay platos suficientes.`,
        );
      }
      avisos.unshift(
        `Rellenados ${resultado.asignaciones.length} de ${huecos.length} huecos.`,
      );

      this.avisos.set(avisos);
      this.panelGenerador.set(false);
    } catch (err) {
      this.error.set(mensajeDeError(err));
    } finally {
      this.generando.set(false);
    }
  }

  protected async vaciarSemana(): Promise<void> {
    if (!confirm('¿Vaciar toda la semana? Se borran las comidas y cenas asignadas.')) return;

    this.generando.set(true);
    this.error.set(null);
    try {
      await this.plan.limpiarRango(this.inicio(), this.fin());
      this.avisos.set([]);
    } catch (err) {
      this.error.set(mensajeDeError(err));
    } finally {
      this.generando.set(false);
    }
  }
}
