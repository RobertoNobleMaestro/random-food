import { Routes } from '@angular/router';
import { guardHogar, guardInvitado, guardSesion } from './core/guards';

export const routes: Routes = [
  {
    path: 'entrar',
    title: 'Entrar · Random Food',
    canActivate: [guardInvitado],
    loadComponent: () => import('./paginas/entrar/entrar').then((m) => m.Entrar),
  },
  {
    // Sin hogar no hay nada que enseñar, así que este solo exige sesión.
    path: 'hogar',
    title: 'Tu hogar · Random Food',
    canActivate: [guardSesion],
    loadComponent: () => import('./paginas/hogar/hogar').then((m) => m.HogarPagina),
  },
  {
    path: 'semana',
    title: 'La semana · Random Food',
    canActivate: [guardHogar],
    loadComponent: () => import('./paginas/semana/semana').then((m) => m.Semana),
  },
  {
    path: 'platos',
    title: 'Platos · Random Food',
    canActivate: [guardHogar],
    loadComponent: () => import('./paginas/platos/platos').then((m) => m.Platos),
  },
  {
    path: 'ajustes',
    title: 'Ajustes · Random Food',
    canActivate: [guardHogar],
    loadComponent: () => import('./paginas/ajustes/ajustes').then((m) => m.Ajustes),
  },
  { path: '', pathMatch: 'full', redirectTo: 'semana' },
  { path: '**', redirectTo: 'semana' },
];
