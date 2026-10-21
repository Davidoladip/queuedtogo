export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      customers: {
        Row: {
          consent_at: string | null;
          consent_updates: boolean;
          created_at: string;
          email: string | null;
          id: string;
          name: string | null;
          org_id: string;
          phone: string | null;
          preferred_channel:
            | Database["public"]["Enums"]["notify_channel"]
            | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          consent_at?: string | null;
          consent_updates?: boolean;
          created_at?: string;
          email?: string | null;
          id?: string;
          name?: string | null;
          org_id: string;
          phone?: string | null;
          preferred_channel?:
            | Database["public"]["Enums"]["notify_channel"]
            | null;
          updated_at?: string;
        };
        Update: {
          consent_at?: string | null;
          consent_updates?: boolean;
          created_at?: string;
          email?: string | null;
          id?: string;
          name?: string | null;
          org_id?: string;
          phone?: string | null;
          preferred_channel?:
            | Database["public"]["Enums"]["notify_channel"]
            | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customers_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      files: {
        Row: {
          bucket: string;
          created_at: string;
          form_id: string | null;
          id: string;
          kind: string;
          mime_type: string;
          org_id: string;
          original_name: string | null;
          path: string;
          size_bytes: number;
          submission_id: string | null;
          uploaded_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          bucket: string;
          created_at?: string;
          form_id?: string | null;
          id?: string;
          kind: string;
          mime_type: string;
          org_id: string;
          original_name?: string | null;
          path: string;
          size_bytes: number;
          submission_id?: string | null;
          uploaded_by?: string | null;
        };
        Update: {
          bucket?: string;
          created_at?: string;
          form_id?: string | null;
          id?: string;
          kind?: string;
          mime_type?: string;
          org_id?: string;
          original_name?: string | null;
          path?: string;
          size_bytes?: number;
          submission_id?: string | null;
          uploaded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "files_form_id_org_id_fkey";
            columns: ["form_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "forms";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "files_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "files_submission_id_org_id_fkey";
            columns: ["submission_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "form_submissions";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "files_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      form_fields: {
        Row: {
          config: NonNullable<Json>;
          created_at: string;
          form_id: string;
          help: string;
          id: string;
          label: string;
          options: NonNullable<Json>;
          org_id: string;
          placeholder: string;
          position: number;
          required: boolean;
          type: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          config?: NonNullable<Json>;
          created_at?: string;
          form_id: string;
          help?: string;
          id?: string;
          label?: string;
          options?: NonNullable<Json>;
          org_id: string;
          placeholder?: string;
          position: number;
          required?: boolean;
          type: string;
          updated_at?: string;
        };
        Update: {
          config?: NonNullable<Json>;
          created_at?: string;
          form_id?: string;
          help?: string;
          id?: string;
          label?: string;
          options?: NonNullable<Json>;
          org_id?: string;
          placeholder?: string;
          position?: number;
          required?: boolean;
          type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "form_fields_form_id_org_id_fkey";
            columns: ["form_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "forms";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      form_submissions: {
        Row: {
          answers: NonNullable<Json>;
          consent: boolean;
          created_at: string;
          customer_id: string | null;
          form_id: string;
          form_version: number;
          id: string;
          org_id: string;
          source_ip_hash: string | null;
          user_agent: string | null;
        };
        ComputedFields: never;
        Insert: {
          answers: NonNullable<Json>;
          consent?: boolean;
          created_at?: string;
          customer_id?: string | null;
          form_id: string;
          form_version: number;
          id?: string;
          org_id: string;
          source_ip_hash?: string | null;
          user_agent?: string | null;
        };
        Update: {
          answers?: NonNullable<Json>;
          consent?: boolean;
          created_at?: string;
          customer_id?: string | null;
          form_id?: string;
          form_version?: number;
          id?: string;
          org_id?: string;
          source_ip_hash?: string | null;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "form_submissions_customer_id_org_id_fkey";
            columns: ["customer_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "form_submissions_form_id_org_id_fkey";
            columns: ["form_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "forms";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      forms: {
        Row: {
          created_at: string;
          created_by: string | null;
          design: NonNullable<Json>;
          event_date: string | null;
          id: string;
          intro: string | null;
          org_id: string;
          published_at: string | null;
          published_config: Json | null;
          published_version: number;
          settings: NonNullable<Json>;
          slug: string;
          status: Database["public"]["Enums"]["form_status"];
          submit_label: string;
          thanks: string | null;
          title: string;
          updated_at: string;
          venue: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          design?: NonNullable<Json>;
          event_date?: string | null;
          id?: string;
          intro?: string | null;
          org_id: string;
          published_at?: string | null;
          published_config?: Json | null;
          published_version?: number;
          settings?: NonNullable<Json>;
          slug: string;
          status?: Database["public"]["Enums"]["form_status"];
          submit_label?: string;
          thanks?: string | null;
          title: string;
          updated_at?: string;
          venue?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          design?: NonNullable<Json>;
          event_date?: string | null;
          id?: string;
          intro?: string | null;
          org_id?: string;
          published_at?: string | null;
          published_config?: Json | null;
          published_version?: number;
          settings?: NonNullable<Json>;
          slug?: string;
          status?: Database["public"]["Enums"]["form_status"];
          submit_label?: string;
          thanks?: string | null;
          title?: string;
          updated_at?: string;
          venue?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "forms_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "forms_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      job_events: {
        Row: {
          actor_id: string | null;
          body: string | null;
          created_at: string;
          data: NonNullable<Json>;
          from_stage_id: string | null;
          id: string;
          idempotency_key: string | null;
          job_id: string;
          org_id: string;
          to_stage_id: string | null;
          type: string;
        };
        ComputedFields: never;
        Insert: {
          actor_id?: string | null;
          body?: string | null;
          created_at?: string;
          data?: NonNullable<Json>;
          from_stage_id?: string | null;
          id?: string;
          idempotency_key?: string | null;
          job_id: string;
          org_id: string;
          to_stage_id?: string | null;
          type: string;
        };
        Update: {
          actor_id?: string | null;
          body?: string | null;
          created_at?: string;
          data?: NonNullable<Json>;
          from_stage_id?: string | null;
          id?: string;
          idempotency_key?: string | null;
          job_id?: string;
          org_id?: string;
          to_stage_id?: string | null;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "job_events_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "job_events_job_id_org_id_fkey";
            columns: ["job_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      jobs: {
        Row: {
          assignee_id: string | null;
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          customer_id: string | null;
          due_date: string | null;
          form_id: string | null;
          id: string;
          number: number;
          org_id: string;
          priority: number;
          stage_id: string;
          submission_id: string | null;
          summary: string | null;
          title: string;
          tracking_token: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          assignee_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string | null;
          due_date?: string | null;
          form_id?: string | null;
          id?: string;
          number: number;
          org_id: string;
          priority?: number;
          stage_id: string;
          submission_id?: string | null;
          summary?: string | null;
          title: string;
          tracking_token?: string;
          updated_at?: string;
        };
        Update: {
          assignee_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string | null;
          due_date?: string | null;
          form_id?: string | null;
          id?: string;
          number?: number;
          org_id?: string;
          priority?: number;
          stage_id?: string;
          submission_id?: string | null;
          summary?: string | null;
          title?: string;
          tracking_token?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "jobs_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "jobs_customer_id_org_id_fkey";
            columns: ["customer_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "jobs_form_id_org_id_fkey";
            columns: ["form_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "forms";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "jobs_org_id_assignee_id_fkey";
            columns: ["org_id", "assignee_id"];
            isOneToOne: false;
            referencedRelation: "organization_members";
            referencedColumns: ["org_id", "user_id"];
          },
          {
            foreignKeyName: "jobs_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "jobs_stage_id_org_id_fkey";
            columns: ["stage_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "workflow_stages";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "jobs_submission_id_org_id_fkey";
            columns: ["submission_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "form_submissions";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      organization_invitations: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string | null;
          org_id: string;
          role: Database["public"]["Enums"]["org_role"];
          token_hash: string;
        };
        ComputedFields: never;
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          email: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          org_id: string;
          role?: Database["public"]["Enums"]["org_role"];
          token_hash: string;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          org_id?: string;
          role?: Database["public"]["Enums"]["org_role"];
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_invitations_accepted_by_fkey";
            columns: ["accepted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_invitations_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_invitations_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_members: {
        Row: {
          created_at: string;
          org_id: string;
          role: Database["public"]["Enums"]["org_role"];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          org_id: string;
          role?: Database["public"]["Enums"]["org_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          org_id?: string;
          role?: Database["public"]["Enums"]["org_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_members_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          brand: NonNullable<Json>;
          country: string;
          created_at: string;
          created_by: string | null;
          currency: string;
          id: string;
          name: string;
          next_job_number: number;
          slug: string;
          timezone: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          brand?: NonNullable<Json>;
          country?: string;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          id?: string;
          name: string;
          next_job_number?: number;
          slug: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          brand?: NonNullable<Json>;
          country?: string;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          id?: string;
          name?: string;
          next_job_number?: number;
          slug?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      workflow_stages: {
        Row: {
          color: string;
          created_at: string;
          id: string;
          is_final: boolean;
          message_template: string | null;
          name: string;
          notify_customer: boolean;
          org_id: string;
          position: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          color?: string;
          created_at?: string;
          id?: string;
          is_final?: boolean;
          message_template?: string | null;
          name: string;
          notify_customer?: boolean;
          org_id: string;
          position: number;
          updated_at?: string;
        };
        Update: {
          color?: string;
          created_at?: string;
          id?: string;
          is_final?: boolean;
          message_template?: string | null;
          name?: string;
          notify_customer?: boolean;
          org_id?: string;
          position?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workflow_stages_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_invitation: { Args: { p_token: string }; Returns: string };
      create_invitation: {
        Args: {
          p_email: string;
          p_org: string;
          p_role?: Database["public"]["Enums"]["org_role"];
        };
        Returns: string;
      };
      create_organization: {
        Args: { p_name: string; p_slug: string };
        Returns: {
          brand: NonNullable<Json>;
          country: string;
          created_at: string;
          created_by: string | null;
          currency: string;
          id: string;
          name: string;
          next_job_number: number;
          slug: string;
          timezone: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "organizations";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      get_invitation: {
        Args: { p_token: string };
        Returns: {
          accepted: boolean;
          email: string;
          email_matches: boolean;
          expires_at: string;
          org_name: string;
          org_slug: string;
          role: Database["public"]["Enums"]["org_role"];
        }[];
      };
      get_job_tracking: { Args: { p_token: string }; Returns: Json };
      get_public_form: {
        Args: { p_form_slug: string; p_org_slug: string };
        Returns: Json;
      };
      has_org_role: {
        Args: {
          p_org: string;
          p_roles: Database["public"]["Enums"]["org_role"][];
        };
        Returns: boolean;
      };
      is_org_member: { Args: { p_org: string }; Returns: boolean };
      publish_form: { Args: { p_form: string }; Returns: number };
      seed_default_stages: { Args: { p_org: string }; Returns: undefined };
      storage_org_id: { Args: { p_name: string }; Returns: string };
    };
    Enums: {
      form_status: "draft" | "live" | "closed";
      notify_channel: "sms" | "whatsapp" | "email";
      org_role: "owner" | "admin" | "member";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      form_status: ["draft", "live", "closed"],
      notify_channel: ["sms", "whatsapp", "email"],
      org_role: ["owner", "admin", "member"],
    },
  },
} as const;
