/**
 * Tipos del esquema de Supabase, escritos a mano a partir de las migraciones de
 * `supabase/migraciones/`.
 *
 * Cuando el esquema crezca, se pueden regenerar con la CLI de Supabase:
 *
 *   npx supabase gen types typescript --project-id TU-PROYECTO > src/app/core/database.types.ts
 *
 * Mantener este archivo alineado con el SQL: es lo único que hace que el
 * cliente avise en tiempo de compilación cuando una consulta no cuadra.
 */

// ---------------------------------------------------------------------------
// Tipos enumerados
// ---------------------------------------------------------------------------

export type MomentoComida = 'comida' | 'cena';
export type RolMiembro = 'propietario' | 'miembro';

// ---------------------------------------------------------------------------
// Filas
// ---------------------------------------------------------------------------

export interface Hogar {
  id: string;
  nombre: string;
  codigo_invitacion: string;
  creado_en: string;
  actualizado_en: string;
}

export interface Miembro {
  hogar_id: string;
  user_id: string;
  rol: RolMiembro;
  creado_en: string;
}

export interface Categoria {
  id: string;
  hogar_id: string;
  nombre: string;
  /** Hexadecimal de seis dígitos, p. ej. `#15803d`. */
  color: string;
  icono: string | null;
  orden: number;
  creado_en: string;
  actualizado_en: string;
}

export interface Plato {
  id: string;
  hogar_id: string;
  nombre: string;
  categoria_id: string | null;
  /** Enlace a la receta en Cookidoo. */
  url_cookidoo: string | null;
  notas: string | null;
  favorito: boolean;
  apto_comida: boolean;
  apto_cena: boolean;
  /** Para cuántas personas está pensada la receta. */
  raciones_base: number | null;
  /** Los platos se archivan en vez de borrarse, para no perder el historial. */
  archivado: boolean;
  creado_por: string | null;
  creado_en: string;
  actualizado_en: string;
}

export interface Ingrediente {
  id: string;
  hogar_id: string;
  nombre: string;
  unidad_habitual: string | null;
  /** Fruta, carnicería, congelados... Ordena la lista de la compra. */
  seccion: string | null;
  creado_en: string;
  actualizado_en: string;
}

export interface PlatoIngrediente {
  hogar_id: string;
  plato_id: string;
  ingrediente_id: string;
  cantidad: number | null;
  unidad: string | null;
  opcional: boolean;
  orden: number;
  creado_en: string;
}

export interface ComidaPlanificada {
  id: string;
  hogar_id: string;
  /** `YYYY-MM-DD`. */
  fecha: string;
  momento: MomentoComida;
  /** Siempre 1 por ahora; el esquema admite varios platos por hueco. */
  orden: number;
  plato_id: string | null;
  comensales: number | null;
  notas: string | null;
  creado_por: string | null;
  creado_en: string;
  actualizado_en: string;
}

// ---------------------------------------------------------------------------
// Esquema
// ---------------------------------------------------------------------------

/** Al insertar, solo `Obligatorios` es obligatorio: el resto lo pone la base. */
type Insert<Fila, Obligatorios extends keyof Fila> = Pick<Fila, Obligatorios> &
  Partial<Omit<Fila, Obligatorios>>;

export interface Database {
  public: {
    Tables: {
      hogares: {
        Row: Hogar;
        Insert: Insert<Hogar, 'nombre'>;
        Update: Partial<Hogar>;
        Relationships: [];
      };
      miembros: {
        Row: Miembro;
        Insert: Insert<Miembro, 'hogar_id' | 'user_id'>;
        Update: Partial<Miembro>;
        Relationships: [];
      };
      categorias: {
        Row: Categoria;
        Insert: Insert<Categoria, 'hogar_id' | 'nombre'>;
        Update: Partial<Categoria>;
        Relationships: [];
      };
      platos: {
        Row: Plato;
        Insert: Insert<Plato, 'hogar_id' | 'nombre'>;
        Update: Partial<Plato>;
        Relationships: [];
      };
      ingredientes: {
        Row: Ingrediente;
        Insert: Insert<Ingrediente, 'hogar_id' | 'nombre'>;
        Update: Partial<Ingrediente>;
        Relationships: [];
      };
      plato_ingredientes: {
        Row: PlatoIngrediente;
        Insert: Insert<PlatoIngrediente, 'hogar_id' | 'plato_id' | 'ingrediente_id'>;
        Update: Partial<PlatoIngrediente>;
        Relationships: [];
      };
      plan_comidas: {
        Row: ComidaPlanificada;
        Insert: Insert<ComidaPlanificada, 'hogar_id' | 'fecha' | 'momento'>;
        Update: Partial<ComidaPlanificada>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      /** Crea el hogar, te mete como propietario y siembra las categorías. */
      crear_hogar: {
        Args: { _nombre: string };
        Returns: Hogar;
      };
      /** Canjea un código de invitación y te añade como miembro. */
      unirse_a_hogar: {
        Args: { _codigo: string };
        Returns: Hogar;
      };
    };
    Enums: {
      momento_comida: MomentoComida;
      rol_miembro: RolMiembro;
    };
    CompositeTypes: Record<never, never>;
  };
}
