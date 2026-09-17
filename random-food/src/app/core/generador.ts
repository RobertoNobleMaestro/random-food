/**
 * Generador de planes de comida.
 *
 * Función pura y sin dependencias de Angular ni de Supabase: recibe los platos,
 * el historial y las opciones, y devuelve las asignaciones. Así se puede probar
 * sin base de datos, y el día que se enchufe un LLM será otra implementación de
 * la misma firma.
 *
 * Reglas, en orden de importancia:
 *   1. Un plato tiene que valer para ese momento (comida o cena).
 *   2. No repetir un plato dentro de una ventana de días.
 *   3. No encadenar la misma categoría.
 *   4. Los favoritos salen más.
 *
 * Si las reglas dejan sin candidatos un hueco, se van relajando de la menos a
 * la más importante en vez de dejar el hueco vacío.
 */

import { diasEntre, type Iso } from './fechas';
import type { MomentoComida, Plato } from './database.types';

export interface Hueco {
  fecha: Iso;
  momento: MomentoComida;
}

export interface ComidaPasada {
  fecha: Iso;
  plato_id: string;
}

export interface OpcionesGenerador {
  /** Días que tienen que pasar para poder repetir un plato. */
  diasSinRepetir: number;
  /** Cuánto más probable es un favorito frente a un plato normal. */
  pesoFavorito: number;
  /** Evitar que dos huecos seguidos compartan categoría. */
  variarCategoria: boolean;
  /** Si `false`, no se tocan los huecos que ya tienen plato. */
  sobrescribir: boolean;
}

export const OPCIONES_POR_DEFECTO: OpcionesGenerador = {
  diasSinRepetir: 14,
  pesoFavorito: 2.5,
  variarCategoria: true,
  sobrescribir: false,
};

export interface Asignacion extends Hueco {
  plato_id: string;
}

export interface ResultadoGenerador {
  asignaciones: Asignacion[];
  /** Huecos que no se pudieron rellenar ni relajando las reglas. */
  sinCubrir: Hueco[];
  /** Explicación de las reglas que hubo que ceder, para poder avisar. */
  avisos: string[];
}

export function claveHueco(hueco: Hueco): string {
  return `${hueco.fecha}|${hueco.momento}`;
}

/**
 * `aleatorio` se inyecta para poder fijar la semilla en los tests. Por defecto
 * usa `Math.random`.
 */
export function generarPlan(
  huecos: Hueco[],
  platos: Plato[],
  historial: ComidaPasada[],
  opciones: OpcionesGenerador = OPCIONES_POR_DEFECTO,
  aleatorio: () => number = Math.random,
): ResultadoGenerador {
  const disponibles = platos.filter((p) => !p.archivado);

  // Última vez que se comió cada plato. Se va actualizando con lo que decide
  // este mismo generador, para que no se repita dentro de la propia tanda.
  const ultimaVez = new Map<string, Iso>();
  for (const pasada of historial) {
    const previa = ultimaVez.get(pasada.plato_id);
    if (!previa || pasada.fecha > previa) ultimaVez.set(pasada.plato_id, pasada.fecha);
  }

  const ordenados = [...huecos].sort((a, b) =>
    a.fecha === b.fecha
      ? (a.momento === 'comida' ? 0 : 1) - (b.momento === 'comida' ? 0 : 1)
      : a.fecha < b.fecha
        ? -1
        : 1,
  );

  const asignaciones: Asignacion[] = [];
  const sinCubrir: Hueco[] = [];
  const avisos = new Set<string>();
  let categoriaPrevia: string | null = null;

  for (const hueco of ordenados) {
    const aptos = disponibles.filter((p) =>
      hueco.momento === 'comida' ? p.apto_comida : p.apto_cena,
    );

    if (!aptos.length) {
      sinCubrir.push(hueco);
      avisos.add(
        `No hay ningún plato marcado como apto para ${hueco.momento === 'comida' ? 'la comida' : 'la cena'}.`,
      );
      continue;
    }

    // Niveles de relajación, del más exigente al más permisivo.
    const niveles: Array<{ ventana: number; variar: boolean; aviso?: string }> = [
      { ventana: opciones.diasSinRepetir, variar: opciones.variarCategoria },
      {
        ventana: opciones.diasSinRepetir,
        variar: false,
        aviso: 'Algún día repite categoría: no había variedad suficiente.',
      },
      {
        ventana: Math.floor(opciones.diasSinRepetir / 2),
        variar: false,
        aviso: `Algún plato se repite antes de ${opciones.diasSinRepetir} días: el catálogo se queda corto.`,
      },
      {
        ventana: 0,
        variar: false,
        aviso: 'Hubo que repetir platos seguidos. Añade más para tener variedad.',
      },
    ];

    let elegido: Plato | null = null;

    for (const nivel of niveles) {
      const candidatos = aptos.filter((plato) => {
        if (nivel.ventana > 0) {
          const ultima = ultimaVez.get(plato.id);
          if (ultima && diasEntre(ultima, hueco.fecha) < nivel.ventana) return false;
        }
        if (nivel.variar && categoriaPrevia && plato.categoria_id === categoriaPrevia) {
          return false;
        }
        return true;
      });

      if (candidatos.length) {
        elegido = elegirPonderado(candidatos, opciones.pesoFavorito, aleatorio);
        if (nivel.aviso) avisos.add(nivel.aviso);
        break;
      }
    }

    if (!elegido) {
      sinCubrir.push(hueco);
      continue;
    }

    asignaciones.push({ ...hueco, plato_id: elegido.id });
    ultimaVez.set(elegido.id, hueco.fecha);
    categoriaPrevia = elegido.categoria_id;
  }

  return { asignaciones, sinCubrir, avisos: [...avisos] };
}

/** Ruleta ponderada: los favoritos ocupan más hueco en la rueda. */
function elegirPonderado(candidatos: Plato[], pesoFavorito: number, aleatorio: () => number): Plato {
  const pesos = candidatos.map((p) => (p.favorito ? Math.max(1, pesoFavorito) : 1));
  const total = pesos.reduce((suma, peso) => suma + peso, 0);
  let tirada = aleatorio() * total;

  for (let i = 0; i < candidatos.length; i++) {
    tirada -= pesos[i];
    if (tirada <= 0) return candidatos[i];
  }
  return candidatos[candidatos.length - 1];
}
