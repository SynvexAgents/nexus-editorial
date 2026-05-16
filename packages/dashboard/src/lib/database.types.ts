export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      clean_posts: {
        Row: {
          engagement_score_normalized: number | null;
          filter_reason: string | null;
          is_relevant: boolean | null;
          post_id: string;
          processed_at: string | null;
          topic_cluster_pre: string | null;
        };
        Insert: {
          engagement_score_normalized?: number | null;
          filter_reason?: string | null;
          is_relevant?: boolean | null;
          post_id: string;
          processed_at?: string | null;
          topic_cluster_pre?: string | null;
        };
        Update: {
          engagement_score_normalized?: number | null;
          filter_reason?: string | null;
          is_relevant?: boolean | null;
          post_id?: string;
          processed_at?: string | null;
          topic_cluster_pre?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'clean_posts_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: true;
            referencedRelation: 'raw_posts';
            referencedColumns: ['post_id'];
          },
        ];
      };
      editorial_performance: {
        Row: {
          archetype: string | null;
          comments_7d: number | null;
          dm_received: number | null;
          icp_vise: string | null;
          id: number;
          impressions_7d: number | null;
          likes_7d: number | null;
          notes_qualite: string | null;
          post_id_internal: string | null;
          post_position: number | null;
          published_at: string | null;
          reposts_7d: number | null;
          saisi_at: string | null;
          week_id: string | null;
        };
        Insert: {
          archetype?: string | null;
          comments_7d?: number | null;
          dm_received?: number | null;
          icp_vise?: string | null;
          id?: number;
          impressions_7d?: number | null;
          likes_7d?: number | null;
          notes_qualite?: string | null;
          post_id_internal?: string | null;
          post_position?: number | null;
          published_at?: string | null;
          reposts_7d?: number | null;
          saisi_at?: string | null;
          week_id?: string | null;
        };
        Update: {
          archetype?: string | null;
          comments_7d?: number | null;
          dm_received?: number | null;
          icp_vise?: string | null;
          id?: number;
          impressions_7d?: number | null;
          likes_7d?: number | null;
          notes_qualite?: string | null;
          post_id_internal?: string | null;
          post_position?: number | null;
          published_at?: string | null;
          reposts_7d?: number | null;
          saisi_at?: string | null;
          week_id?: string | null;
        };
        Relationships: [];
      };
      post_analysis: {
        Row: {
          analysis_json: Json | null;
          analyzed_at: string | null;
          post_id: string;
          transferabilite_assurance: number | null;
        };
        Insert: {
          analysis_json?: Json | null;
          analyzed_at?: string | null;
          post_id: string;
          transferabilite_assurance?: number | null;
        };
        Update: {
          analysis_json?: Json | null;
          analyzed_at?: string | null;
          post_id?: string;
          transferabilite_assurance?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'post_analysis_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: true;
            referencedRelation: 'clean_posts';
            referencedColumns: ['post_id'];
          },
        ];
      };
      profiles_watchlist: {
        Row: {
          audience_size_estimee: number | null;
          created_at: string | null;
          headline: string | null;
          is_active: boolean | null;
          langue: string | null;
          nom: string;
          notes: string | null;
          profile_id: string;
          secteur: string | null;
          updated_at: string | null;
        };
        Insert: {
          audience_size_estimee?: number | null;
          created_at?: string | null;
          headline?: string | null;
          is_active?: boolean | null;
          langue?: string | null;
          nom: string;
          notes?: string | null;
          profile_id: string;
          secteur?: string | null;
          updated_at?: string | null;
        };
        Update: {
          audience_size_estimee?: number | null;
          created_at?: string | null;
          headline?: string | null;
          is_active?: boolean | null;
          langue?: string | null;
          nom?: string;
          notes?: string | null;
          profile_id?: string;
          secteur?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      raw_posts: {
        Row: {
          collected_at: string | null;
          comment_sample: Json | null;
          comments: number | null;
          day_of_week: string | null;
          hour_of_day: number | null;
          likes: number | null;
          media_type: string | null;
          post_id: string;
          profile_id: string | null;
          published_at: string;
          reposts: number | null;
          source_actor: string | null;
          text: string | null;
          url: string | null;
          views_estimees: number | null;
        };
        Insert: {
          collected_at?: string | null;
          comment_sample?: Json | null;
          comments?: number | null;
          day_of_week?: string | null;
          hour_of_day?: number | null;
          likes?: number | null;
          media_type?: string | null;
          post_id: string;
          profile_id?: string | null;
          published_at: string;
          reposts?: number | null;
          source_actor?: string | null;
          text?: string | null;
          url?: string | null;
          views_estimees?: number | null;
        };
        Update: {
          collected_at?: string | null;
          comment_sample?: Json | null;
          comments?: number | null;
          day_of_week?: string | null;
          hour_of_day?: number | null;
          likes?: number | null;
          media_type?: string | null;
          post_id?: string;
          profile_id?: string | null;
          published_at?: string;
          reposts?: number | null;
          source_actor?: string | null;
          text?: string | null;
          url?: string | null;
          views_estimees?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'raw_posts_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_watchlist';
            referencedColumns: ['profile_id'];
          },
        ];
      };
      raw_posts_dlq: {
        Row: {
          collected_at: string | null;
          error_reason: string | null;
          id: number;
          raw_payload: Json;
          retried_count: number | null;
          source_actor: string | null;
        };
        Insert: {
          collected_at?: string | null;
          error_reason?: string | null;
          id?: number;
          raw_payload: Json;
          retried_count?: number | null;
          source_actor?: string | null;
        };
        Update: {
          collected_at?: string | null;
          error_reason?: string | null;
          id?: number;
          raw_payload?: Json;
          retried_count?: number | null;
          source_actor?: string | null;
        };
        Relationships: [];
      };
      synvex_voice_pack: {
        Row: {
          content: string | null;
          created_at: string | null;
          entry_id: number;
          is_active: boolean | null;
          type: string | null;
          weight: number | null;
        };
        Insert: {
          content?: string | null;
          created_at?: string | null;
          entry_id?: number;
          is_active?: boolean | null;
          type?: string | null;
          weight?: number | null;
        };
        Update: {
          content?: string | null;
          created_at?: string | null;
          entry_id?: number;
          is_active?: boolean | null;
          type?: string | null;
          weight?: number | null;
        };
        Relationships: [];
      };
      temporal_analysis: {
        Row: {
          avg_engagement_norm: number | null;
          computed_at: string | null;
          day_of_week: string | null;
          format_distribution: Json | null;
          hour_bucket: string | null;
          id: number;
          posts_count: number | null;
          top_format: string | null;
          week_id: string | null;
        };
        Insert: {
          avg_engagement_norm?: number | null;
          computed_at?: string | null;
          day_of_week?: string | null;
          format_distribution?: Json | null;
          hour_bucket?: string | null;
          id?: number;
          posts_count?: number | null;
          top_format?: string | null;
          week_id?: string | null;
        };
        Update: {
          avg_engagement_norm?: number | null;
          computed_at?: string | null;
          day_of_week?: string | null;
          format_distribution?: Json | null;
          hour_bucket?: string | null;
          id?: number;
          posts_count?: number | null;
          top_format?: string | null;
          week_id?: string | null;
        };
        Relationships: [];
      };
      weekly_reports: {
        Row: {
          angles_json: Json | null;
          human_notes: string | null;
          human_validated: boolean | null;
          insurance_trends_json: Json | null;
          linkedin_trends_json: Json | null;
          produced_at: string | null;
          timing_json: Json | null;
          visuals_json: Json | null;
          week_id: string;
          winners_json: Json | null;
        };
        Insert: {
          angles_json?: Json | null;
          human_notes?: string | null;
          human_validated?: boolean | null;
          insurance_trends_json?: Json | null;
          linkedin_trends_json?: Json | null;
          produced_at?: string | null;
          timing_json?: Json | null;
          visuals_json?: Json | null;
          week_id: string;
          winners_json?: Json | null;
        };
        Update: {
          angles_json?: Json | null;
          human_notes?: string | null;
          human_validated?: boolean | null;
          insurance_trends_json?: Json | null;
          linkedin_trends_json?: Json | null;
          produced_at?: string | null;
          timing_json?: Json | null;
          visuals_json?: Json | null;
          week_id?: string;
          winners_json?: Json | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      nexus_retention_purge: { Args: never; Returns: undefined };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
