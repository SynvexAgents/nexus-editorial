// Stub auto-généré. Remplacer en lançant `pnpm supabase:types` une fois les
// migrations appliquées à un projet Supabase. Le type permissif ci-dessous
// permet au client de compiler en attendant la génération réelle.

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

type GenericRow = Record<string, unknown>;

export interface Database {
  public: {
    Tables: {
      profiles_watchlist: { Row: GenericRow; Insert: GenericRow; Update: GenericRow };
      raw_posts: { Row: GenericRow; Insert: GenericRow; Update: GenericRow };
      clean_posts: { Row: GenericRow; Insert: GenericRow; Update: GenericRow };
      post_analysis: { Row: GenericRow; Insert: GenericRow; Update: GenericRow };
      temporal_analysis: { Row: GenericRow; Insert: GenericRow; Update: GenericRow };
      weekly_reports: { Row: GenericRow; Insert: GenericRow; Update: GenericRow };
      synvex_voice_pack: { Row: GenericRow; Insert: GenericRow; Update: GenericRow };
      editorial_performance: { Row: GenericRow; Insert: GenericRow; Update: GenericRow };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
