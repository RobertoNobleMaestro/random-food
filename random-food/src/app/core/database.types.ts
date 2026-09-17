/**
 * Tipos del esquema de Supabase, escritos a mano a partir de las migraciones de
 * `supabase/migraciones/`.
 *
 * Cuando el esquema crezca, se pueden regenerar con la CLI de Supabase:
 *
 *   npx supabase gen types typescript --project-id TU-PROYECTO > src/app/core/database.types.ts
 *
 * ---------------------------------------------------------------------------
 * AQUÍ TODO ES `type`, NUNCA `interface`.
 *
 * supabase-js exige que cada tabla encaje en `Record<string, unknown>`. Un
 * `type` obtiene índice implícito y encaja; una `interface`, no. Al cambiarlo,
 * el esquema entero deja de cumplir la restricción y TODAS las consultas pasan
 * a resolver `never`, con errores incomprensibles del estilo «'hogar_id' does
 * not exist in type 'never[]'» en archivos que no se han tocado.
 *
 * Los `Insert` van escritos planos y no como `Pick & Partial` por lo mismo: el
 * motor de tipos de PostgREST no resuelve intersecciones. Es además la forma
 * que genera la CLI, así que regenerar el archivo no cambiará la estructura.
 *
 * Regla para saber qué es opcional al insertar: lo que tiene DEFAULT en el SQL.
 * ---------------------------------------------------------------------------
 */

// ---------------------------------------------------------------------------
// Tipos enumerados
// ---------------------------------------------------------------------------

export type MomentoComida = 'comida' | 'cena';
export type RolMiembro = 'propietario' | 'miembro';

// ---------------------------------------------------------------------------
// Filas
// ---------------------------------------------------------------------------

export type Hogar = {
  id: string;
  nombre: string;
  codigo_invitacion: string;
  creado_en: string;
  actualizado_en: string;
};

export type Miembro = {
  hogar_id: string;
  user_id: string;
  rol: RolMiembro;
  creado_en: string;
};

export type Categoria = {
  id: string;
  hogar_id: string;
  nombre: string;
  /** Hexadecimal de seis dígitos, p. ej. `#15803d`. */
  color: string;
  icono: string | null;
  orden: number;
  creado_en: string;
  actualizado_en: string;
};

export type Plato = {
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
};

export type Ingrediente = {
  id: string;
  hogar_id: string;
  nombre: string;
  unidad_habitual: string | null;
  /** Fruta, carnicería, congelados... Ordena la lista de la compra. */
  seccion: string | null;
  creado_en: string;
  actualizado_en: string;
};

export type PlatoIngrediente = {
  hogar_id: string;
  plato_id: string;
  ingrediente_id: string;
  cantidad: number | null;
  unidad: string | null;
  opcional: boolean;
  orden: number;
  creado_en: string;
  actualizado_en: string;
};

export type ComidaPlanificada = {
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
};

// ---------------------------------------------------------------------------
// Altas · lo opcional es lo que tiene DEFAULT en el SQL
// ---------------------------------------------------------------------------

export type HogarNuevo = {
  id?: string;
  nombre: string;
  codigo_invitacion?: string;
  creado_en?: string;
  actualizado_en?: string;
};

export type MiembroNuevo = {
  hogar_id: string;
  user_id: string;
  rol?: RolMiembro;
  creado_en?: string;
};

export type CategoriaNueva = {
  id?: string;
  hogar_id: string;
  nombre: string;
  color?: string;
  icono?: string | null;
  orden?: number;
  creado_en?: string;
  actualizado_en?: string;
};

export type PlatoNuevo = {
  id?: string;
  hogar_id: string;
  nombre: string;
  categoria_id?: string | null;
  url_cookidoo?: string | null;
  notas?: string | null;
  favorito?: boolean;
  apto_comida?: boolean;
  apto_cena?: boolean;
  raciones_base?: number | null;
  archivado?: boolean;
  creado_por?: string | null;
  creado_en?: string;
  actualizado_en?: string;
};

export type IngredienteNuevo = {
  id?: string;
  hogar_id: string;
  nombre: string;
  unidad_habitual?: string | null;
  seccion?: string | null;
  creado_en?: string;
  actualizado_en?: string;
};

export type PlatoIngredienteNuevo = {
  hogar_id: string;
  plato_id: string;
  ingrediente_id: string;
  cantidad?: number | null;
  unidad?: string | null;
  opcional?: boolean;
  orden?: number;
  creado_en?: string;
  actualizado_en?: string;
};

export type ComidaPlanificadaNueva = {
  id?: string;
  hogar_id: string;
  fecha: string;
  momento: MomentoComida;
  orden?: number;
  plato_id?: string | null;
  comensales?: number | null;
  notas?: string | null;
  creado_por?: string | null;
  creado_en?: string;
  actualizado_en?: string;
};

// ---------------------------------------------------------------------------
// Esquema
// ---------------------------------------------------------------------------

export type Database = {
  public: {
    Tables: {
      hogares: {
        Row: Hogar;
        Insert: HogarNuevo;
        Update: Partial<HogarNuevo>;
        Relationships: [];
      };
      miembros: {
        Row: Miembro;
        Insert: MiembroNuevo;
        Update: Partial<MiembroNuevo>;
        Relationships: [];
      };
      categorias: {
        Row: Categoria;
        Insert: CategoriaNueva;
        Update: Partial<CategoriaNueva>;
        Relationships: [];
      };
      platos: {
        Row: Plato;
        Insert: PlatoNuevo;
        Update: Partial<PlatoNuevo>;
        Relationships: [];
      };
      ingredientes: {
        Row: Ingrediente;
        Insert: IngredienteNuevo;
        Update: Partial<IngredienteNuevo>;
        Relationships: [];
      };
      plato_ingredientes: {
        Row: PlatoIngrediente;
        Insert: PlatoIngredienteNuevo;
        Update: Partial<PlatoIngredienteNuevo>;
        Relationships: [];
      };
      plan_comidas: {
        Row: ComidaPlanificada;
        Insert: ComidaPlanificadaNueva;
        Update: Partial<ComidaPlanificadaNueva>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      /** Crea el hogar, te mete como propietario y siembra las categorías. */
      crear_hogar: {
        Args: { _nombre: string };
        Returns: Hogar;
      };
      /**
       * Canjea un código de invitación y te añade como miembro.
       *
       * Devuelve `null` si el código no existe: la función no lanza excepción a
       * propósito, porque eso revertiría el apunte del intento fallido y el
       * limitador de fuerza bruta no contaría nada. Un error de verdad (sesión
       * caducada, demasiados intentos) sí llega como excepción.
       */
      unirse_a_hogar: {
        Args: { _codigo: string };
        Returns: Hogar | null;
      };
      /** Genera un código de invitación nuevo. Solo el propietario. */
      rotar_codigo_invitacion: {
        Args: { _hogar_id: string };
        Returns: string;
      };
    };
    Enums: {
      momento_comida: MomentoComida;
      rol_miembro: RolMiembro;
    };
    CompositeTypes: { [_ in never]: never };
  };
};
