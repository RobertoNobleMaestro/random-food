import { describe, expect, it } from 'vitest';
import {
  aIso,
  deIso,
  diasEntre,
  esFinDeSemana,
  formatearRango,
  inicioSemana,
  nombreDia,
  primerDiaDelMes,
  rango,
  sumarDias,
  ultimoDiaDelMes,
} from './fechas';

describe('fechas', () => {
  it('convierte en los dos sentidos sin perder el día', () => {
    expect(aIso(new Date(2026, 2, 3))).toBe('2026-03-03');
    expect(deIso('2026-03-03').getDate()).toBe(3);
    expect(deIso('2026-03-03').getMonth()).toBe(2);
  });

  it('no se desplaza un día por la zona horaria', () => {
    // El fallo clásico: `toISOString()` pasa a UTC y, según la hora local,
    // devuelve el día anterior o el siguiente. Estas horas extremas lo destapan.
    for (const hora of [0, 1, 12, 22, 23]) {
      const fecha = new Date(2026, 5, 15, hora, 30);
      expect(aIso(fecha)).toBe('2026-06-15');
    }
  });

  it('cruza el cambio de mes y de año', () => {
    expect(sumarDias('2026-01-31', 1)).toBe('2026-02-01');
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(sumarDias('2026-01-01', -1)).toBe('2025-12-31');
    // 2028 es bisiesto.
    expect(sumarDias('2028-02-28', 1)).toBe('2028-02-29');
    expect(sumarDias('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('cuenta bien los días aunque haya cambio de hora', () => {
    // En España el horario de verano entra el último domingo de marzo.
    expect(diasEntre('2026-03-28', '2026-03-30')).toBe(2);
    expect(diasEntre('2026-10-24', '2026-10-26')).toBe(2);
    expect(diasEntre('2026-03-03', '2026-03-03')).toBe(0);
    expect(diasEntre('2026-03-05', '2026-03-03')).toBe(-2);
  });

  it('la semana empieza en lunes', () => {
    // 2026-03-02 es lunes; 2026-03-08, domingo.
    expect(inicioSemana('2026-03-02')).toBe('2026-03-02');
    expect(inicioSemana('2026-03-05')).toBe('2026-03-02');
    expect(inicioSemana('2026-03-08')).toBe('2026-03-02');
    expect(inicioSemana('2026-03-09')).toBe('2026-03-09');
  });

  it('acota el mes', () => {
    expect(primerDiaDelMes('2026-03-17')).toBe('2026-03-01');
    expect(ultimoDiaDelMes('2026-03-17')).toBe('2026-03-31');
    expect(ultimoDiaDelMes('2026-02-10')).toBe('2026-02-28');
    expect(ultimoDiaDelMes('2028-02-10')).toBe('2028-02-29');
  });

  it('genera rangos inclusivos', () => {
    expect(rango('2026-03-02', '2026-03-08')).toHaveLength(7);
    expect(rango('2026-03-02', '2026-03-02')).toEqual(['2026-03-02']);
  });

  it('nombra los días en español', () => {
    expect(nombreDia('2026-03-02')).toBe('lunes');
    expect(nombreDia('2026-03-08')).toBe('domingo');
  });

  it('reconoce el fin de semana', () => {
    expect(esFinDeSemana('2026-03-07')).toBe(true); // sábado
    expect(esFinDeSemana('2026-03-08')).toBe(true); // domingo
    expect(esFinDeSemana('2026-03-06')).toBe(false); // viernes
  });

  it('formatea el rango según cruce o no de mes', () => {
    expect(formatearRango('2026-03-02', '2026-03-08')).toBe('2 – 8 de marzo');
    expect(formatearRango('2026-02-23', '2026-03-01')).toBe('23 de febrero – 1 de marzo');
  });
});
