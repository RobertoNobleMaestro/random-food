import { describe, expect, it } from 'vitest';
import {
  generarPlan,
  OPCIONES_POR_DEFECTO,
  type ComidaPasada,
  type Hueco,
  type OpcionesGenerador,
} from './generador';
import type { Plato } from './database.types';

/** Generador pseudoaleatorio con semilla, para que los tests no parpadeen. */
function aleatorioConSemilla(semilla: number): () => number {
  let estado = semilla >>> 0;
  return () => {
    estado = (estado * 1664525 + 1013904223) >>> 0;
    return estado / 4294967296;
  };
}

function plato(nombre: string, extra: Partial<Plato> = {}): Plato {
  return {
    id: nombre,
    hogar_id: 'hogar',
    nombre,
    categoria_id: null,
    url_cookidoo: null,
    notas: null,
    favorito: false,
    apto_comida: true,
    apto_cena: true,
    raciones_base: null,
    archivado: false,
    creado_por: null,
    creado_en: '2026-01-01T00:00:00Z',
    actualizado_en: '2026-01-01T00:00:00Z',
    ...extra,
  };
}

/** Los siete días de una semana, comida y cena: catorce huecos. */
function semana(desde = '2026-03-02'): Hueco[] {
  const huecos: Hueco[] = [];
  for (let d = 0; d < 7; d++) {
    const fecha = `2026-03-${String(2 + d).padStart(2, '0')}`;
    huecos.push({ fecha, momento: 'comida' }, { fecha, momento: 'cena' });
  }
  void desde;
  return huecos;
}

function opciones(cambios: Partial<OpcionesGenerador> = {}): OpcionesGenerador {
  return { ...OPCIONES_POR_DEFECTO, ...cambios };
}

describe('generarPlan', () => {
  it('rellena todos los huecos cuando hay platos de sobra', () => {
    const platos = Array.from({ length: 30 }, (_, i) => plato(`plato-${i}`));

    const r = generarPlan(semana(), platos, [], opciones(), aleatorioConSemilla(1));

    expect(r.asignaciones).toHaveLength(14);
    expect(r.sinCubrir).toHaveLength(0);
  });

  it('respeta si un plato vale solo para comer o solo para cenar', () => {
    const platos = [
      ...Array.from({ length: 10 }, (_, i) =>
        plato(`comida-${i}`, { apto_comida: true, apto_cena: false }),
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        plato(`cena-${i}`, { apto_comida: false, apto_cena: true }),
      ),
    ];

    const r = generarPlan(semana(), platos, [], opciones(), aleatorioConSemilla(2));

    for (const a of r.asignaciones) {
      expect(a.plato_id.startsWith(a.momento)).toBe(true);
    }
  });

  it('no repite un plato dentro de la ventana', () => {
    const platos = Array.from({ length: 20 }, (_, i) => plato(`plato-${i}`));

    const r = generarPlan(
      semana(),
      platos,
      [],
      opciones({ diasSinRepetir: 30 }),
      aleatorioConSemilla(3),
    );

    const ids = r.asignaciones.map((a) => a.plato_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('tiene en cuenta el historial reciente', () => {
    const platos = Array.from({ length: 15 }, (_, i) => plato(`plato-${i}`));
    // Se comió ayer: no debería volver a salir esta semana.
    const historial: ComidaPasada[] = [{ fecha: '2026-03-01', plato_id: 'plato-0' }];

    const r = generarPlan(
      semana(),
      platos,
      historial,
      opciones({ diasSinRepetir: 14 }),
      aleatorioConSemilla(4),
    );

    expect(r.asignaciones.some((a) => a.plato_id === 'plato-0')).toBe(false);
  });

  it('no encadena dos platos de la misma categoría', () => {
    const platos = [
      ...Array.from({ length: 8 }, (_, i) => plato(`legumbre-${i}`, { categoria_id: 'legumbre' })),
      ...Array.from({ length: 8 }, (_, i) => plato(`pescado-${i}`, { categoria_id: 'pescado' })),
    ];

    const r = generarPlan(
      semana(),
      platos,
      [],
      opciones({ variarCategoria: true }),
      aleatorioConSemilla(5),
    );

    const categorias = r.asignaciones.map((a) => a.plato_id.split('-')[0]);
    for (let i = 1; i < categorias.length; i++) {
      expect(categorias[i]).not.toBe(categorias[i - 1]);
    }
  });

  it('saca los favoritos más a menudo', () => {
    const platos = [
      plato('favorito', { favorito: true }),
      ...Array.from({ length: 4 }, (_, i) => plato(`normal-${i}`)),
    ];

    // Una sola secuencia para las 200 rondas, no una semilla nueva en cada una:
    // un generador congruencial devuelve primeros valores casi idénticos para
    // semillas consecutivas, y el muestreo salía siempre de la misma franja.
    const aleatorio = aleatorioConSemilla(12345);

    let vecesFavorito = 0;
    for (let ronda = 0; ronda < 200; ronda++) {
      const r = generarPlan(
        [{ fecha: '2026-03-02', momento: 'comida' }],
        platos,
        [],
        opciones({ diasSinRepetir: 0, variarCategoria: false, pesoFavorito: 4 }),
        aleatorio,
      );
      if (r.asignaciones[0]?.plato_id === 'favorito') vecesFavorito++;
    }

    // Con peso 4 frente a cuatro platos de peso 1, la cuota teórica es 4/8 = 50%.
    // El margen es amplio a propósito: se comprueba la tendencia, no la cifra.
    expect(vecesFavorito).toBeGreaterThan(60);
    expect(vecesFavorito).toBeLessThan(140);
  });

  it('cede reglas y avisa cuando el catálogo se queda corto', () => {
    const platos = [plato('unico')];

    const r = generarPlan(semana(), platos, [], opciones(), aleatorioConSemilla(6));

    expect(r.asignaciones).toHaveLength(14);
    expect(r.sinCubrir).toHaveLength(0);
    expect(r.avisos.length).toBeGreaterThan(0);
  });

  it('deja el hueco sin cubrir si no hay ningún plato para ese momento', () => {
    const platos = [plato('solo-comida', { apto_comida: true, apto_cena: false })];

    const r = generarPlan(semana(), platos, [], opciones(), aleatorioConSemilla(7));

    expect(r.sinCubrir).toHaveLength(7);
    expect(r.sinCubrir.every((h) => h.momento === 'cena')).toBe(true);
    expect(r.avisos.some((a) => a.includes('cena'))).toBe(true);
  });

  it('ignora los platos archivados', () => {
    const platos = [
      plato('activo'),
      plato('archivado', { archivado: true, favorito: true }),
    ];

    const r = generarPlan(semana(), platos, [], opciones(), aleatorioConSemilla(8));

    expect(r.asignaciones.every((a) => a.plato_id === 'activo')).toBe(true);
  });

  it('con la misma semilla produce el mismo plan', () => {
    const platos = Array.from({ length: 20 }, (_, i) => plato(`plato-${i}`));

    const a = generarPlan(semana(), platos, [], opciones(), aleatorioConSemilla(42));
    const b = generarPlan(semana(), platos, [], opciones(), aleatorioConSemilla(42));

    expect(a.asignaciones).toEqual(b.asignaciones);
  });

  it('no devuelve nada si no hay platos', () => {
    const r = generarPlan(semana(), [], [], opciones(), aleatorioConSemilla(9));

    expect(r.asignaciones).toHaveLength(0);
    expect(r.sinCubrir).toHaveLength(14);
  });
});
