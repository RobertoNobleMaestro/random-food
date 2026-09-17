import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { App } from './app';
import { SUPABASE, type ClienteSupabase } from './core/supabase.client';

/**
 * Cliente de mentira: sin sesión y sin red.
 *
 * Basta con `auth`, porque los servicios solo consultan tablas cuando hay un
 * usuario, y aquí no lo hay.
 */
function clienteSinSesion(): ClienteSupabase {
  return {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
    },
  } as unknown as ClienteSupabase;
}

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), { provide: SUPABASE, useValue: clienteSinSesion() }],
    }).compileComponents();
  });

  it('arranca', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('no enseña la navegación sin sesión', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const html = fixture.nativeElement as HTMLElement;
    expect(html.querySelector('.nav-movil')).toBeNull();
    expect(html.querySelector('.cabecera')).toBeNull();
  });
});
