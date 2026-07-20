export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          user_id: string
          display_name: string
          role: "manager" | "artist"
          onboarded: boolean
          commission_start_date: string | null
        }
        Insert: {
          id?: string
          user_id: string
          display_name?: string
          role?: "manager" | "artist"
          onboarded?: boolean
          commission_start_date?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          display_name?: string
          role?: "manager" | "artist"
          onboarded?: boolean
          commission_start_date?: string | null
        }
        Relationships: []
      }
      payment_batches: {
        Row: {
          id: string
          label: string | null
          batch_count: number
          created_at: string
        }
        Insert: {
          id?: string
          label?: string | null
          batch_count?: number
          created_at?: string
        }
        Update: {
          id?: string
          label?: string | null
          batch_count?: number
          created_at?: string
        }
        Relationships: []
      }
      tracks: {
        Row: {
          id: string
          title: string
          release_date: string | null
          is_commissionable: boolean
          is_commissionable_since: string | null
          sacem_status: "non_déclaré" | "programme_en_draft" | "déclaré" | "étranger" | "non_applicable"
          sacem_declared_at: string | null
          sacem_code: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          release_date?: string | null
          is_commissionable?: boolean
          is_commissionable_since?: string | null
          sacem_status?: "non_déclaré" | "programme_en_draft" | "déclaré" | "étranger" | "non_applicable"
          sacem_declared_at?: string | null
          sacem_code?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          release_date?: string | null
          is_commissionable?: boolean
          is_commissionable_since?: string | null
          sacem_status?: "non_déclaré" | "programme_en_draft" | "déclaré" | "étranger" | "non_applicable"
          sacem_declared_at?: string | null
          sacem_code?: string | null
          notes?: string | null
          created_at?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          id: string
          title: string
          event_date: string
          location: string | null
          type: "concert" | "répétition" | "résidence" | "autre" | null
          status: "confirmé" | "TBC" | "annulé"
          gcal_event_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          event_date: string
          location?: string | null
          type?: "concert" | "répétition" | "résidence" | "autre" | null
          status?: "confirmé" | "TBC" | "annulé"
          gcal_event_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          event_date?: string
          location?: string | null
          type?: "concert" | "répétition" | "résidence" | "autre" | null
          status?: "confirmé" | "TBC" | "annulé"
          gcal_event_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          id: string
          artist_id: string
          track_id: string | null
          batch_id: string | null
          event_id: string | null
          amount: number
          payment_date: string | null
          expires_at: string | null
          status: "provisoire" | "facturé" | "cachet_en_attente" | "payé" | "tbc" | "annulé"
          source: "label" | "booking" | "clip" | "track" | "résidence" | "figuration" | "sacem" | "répétition" | "formation" | "accompagnement"
          territory: "france" | "étranger"
          counts_for_intermittence: boolean
          deductible_expenses: number
          hours: number
          notes: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          artist_id: string
          track_id?: string | null
          batch_id?: string | null
          event_id?: string | null
          amount: number
          payment_date?: string | null
          expires_at?: string | null
          status?: "provisoire" | "facturé" | "cachet_en_attente" | "payé" | "tbc" | "annulé"
          source?: "label" | "booking" | "clip" | "track" | "résidence" | "figuration" | "sacem" | "répétition" | "formation" | "accompagnement"
          territory?: "france" | "étranger"
          counts_for_intermittence?: boolean
          deductible_expenses?: number
          hours?: number
          notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          artist_id?: string
          track_id?: string | null
          batch_id?: string | null
          event_id?: string | null
          amount?: number
          payment_date?: string | null
          expires_at?: string | null
          status?: "provisoire" | "facturé" | "cachet_en_attente" | "payé" | "tbc" | "annulé"
          source?: "label" | "booking" | "clip" | "track" | "résidence" | "figuration" | "sacem" | "répétition" | "formation" | "accompagnement"
          territory?: "france" | "étranger"
          counts_for_intermittence?: boolean
          deductible_expenses?: number
          hours?: number
          notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "payments_artist_id_fkey"; columns: ["artist_id"]; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "payments_track_id_fkey"; columns: ["track_id"]; referencedRelation: "tracks"; referencedColumns: ["id"] },
          { foreignKeyName: "payments_batch_id_fkey"; columns: ["batch_id"]; referencedRelation: "payment_batches"; referencedColumns: ["id"] },
          { foreignKeyName: "payments_event_id_fkey"; columns: ["event_id"]; referencedRelation: "events"; referencedColumns: ["id"] }
        ]
      }
      management_fees: {
        Row: {
          id: string
          payment_id: string
          net_base: number
          commission_rate: number
          is_commissionable: boolean
          commission_due: number
          status: "projetée" | "due" | "versée" | "annulée"
          already_paid_to_manager: number
          created_at: string
        }
        Insert: {
          id?: string
          payment_id: string
          net_base?: number
          commission_rate?: number
          is_commissionable?: boolean
          commission_due?: number
          status?: "projetée" | "due" | "versée" | "annulée"
          already_paid_to_manager?: number
          created_at?: string
        }
        Update: {
          id?: string
          payment_id?: string
          net_base?: number
          commission_rate?: number
          is_commissionable?: boolean
          commission_due?: number
          status?: "projetée" | "due" | "versée" | "annulée"
          already_paid_to_manager?: number
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: "management_fees_payment_id_fkey"; columns: ["payment_id"]; referencedRelation: "payments"; referencedColumns: ["id"] }
        ]
      }
      expenses: {
        Row: {
          id: string
          payment_id: string | null
          amount: number
          description: string
          status: "à_rembourser" | "remboursée"
          tricount_ref: string | null
          created_at: string
        }
        Insert: {
          id?: string
          payment_id?: string | null
          amount: number
          description: string
          status?: "à_rembourser" | "remboursée"
          tricount_ref?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          payment_id?: string | null
          amount?: number
          description?: string
          status?: "à_rembourser" | "remboursée"
          tricount_ref?: string | null
          created_at?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          id: string
          title: string
          description: string | null
          assignee_role: "manager" | "artist" | "both"
          priority: "normal" | "urgent"
          status: "à_faire" | "en_cours" | "fait"
          deadline: string | null
          payment_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          assignee_role?: "manager" | "artist" | "both"
          priority?: "normal" | "urgent"
          status?: "à_faire" | "en_cours" | "fait"
          deadline?: string | null
          payment_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          assignee_role?: "manager" | "artist" | "both"
          priority?: "normal" | "urgent"
          status?: "à_faire" | "en_cours" | "fait"
          deadline?: string | null
          payment_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      grants: {
        Row: {
          id: string
          title: string
          organisme: string | null
          categorie: string | null
          status: "à_instruire" | "dossier_en_cours" | "déposé" | "obtenu" | "refusé" | "en_attente" | "inéligible"
          priority: "haute" | "moyenne" | "basse" | null
          montant_max: number | null
          deadline_depot: string | null
          date_depot: string | null
          resultat_attendu: string | null
          structure_required: boolean
          lien_dossier: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          organisme?: string | null
          categorie?: string | null
          status?: "à_instruire" | "dossier_en_cours" | "déposé" | "obtenu" | "refusé" | "en_attente" | "inéligible"
          priority?: "haute" | "moyenne" | "basse" | null
          montant_max?: number | null
          deadline_depot?: string | null
          date_depot?: string | null
          resultat_attendu?: string | null
          structure_required?: boolean
          lien_dossier?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          organisme?: string | null
          categorie?: string | null
          status?: "à_instruire" | "dossier_en_cours" | "déposé" | "obtenu" | "refusé" | "en_attente" | "inéligible"
          priority?: "haute" | "moyenne" | "basse" | null
          montant_max?: number | null
          deadline_depot?: string | null
          date_depot?: string | null
          resultat_attendu?: string | null
          structure_required?: boolean
          lien_dossier?: string | null
          notes?: string | null
          created_at?: string
        }
        Relationships: []
      }
      payment_lines: {
        Row: {
          id: string
          payment_id: string
          track_id: string | null
          sacem_code: string | null
          raw_title: string
          support_type: "streaming" | "plateforme_web" | "live" | "radio_tv" | "sync" | "autre"
          amount: number
          is_commissionable: boolean
          created_at: string
        }
        Insert: {
          id?: string
          payment_id: string
          track_id?: string | null
          sacem_code?: string | null
          raw_title: string
          support_type?: "streaming" | "plateforme_web" | "live" | "radio_tv" | "sync" | "autre"
          amount: number
          is_commissionable?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          payment_id?: string
          track_id?: string | null
          sacem_code?: string | null
          raw_title?: string
          support_type?: "streaming" | "plateforme_web" | "live" | "radio_tv" | "sync" | "autre"
          amount?: number
          is_commissionable?: boolean
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: "payment_lines_payment_id_fkey"; columns: ["payment_id"]; referencedRelation: "payments"; referencedColumns: ["id"] },
          { foreignKeyName: "payment_lines_track_id_fkey"; columns: ["track_id"]; referencedRelation: "tracks"; referencedColumns: ["id"] }
        ]
      }
      push_subscriptions: {
        Row: {
          id: string
          user_id: string | null
          endpoint: string
          p256dh: string
          auth: string
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          endpoint: string
          p256dh: string
          auth: string
          user_agent?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          endpoint?: string
          p256dh?: string
          auth?: string
          user_agent?: string | null
          created_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          id: string
          recipient_role: "manager" | "artist" | "both"
          title: string
          body: string | null
          is_read: boolean
          created_at: string
        }
        Insert: {
          id?: string
          recipient_role: "manager" | "artist" | "both"
          title: string
          body?: string | null
          is_read?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          recipient_role?: "manager" | "artist" | "both"
          title?: string
          body?: string | null
          is_read?: boolean
          created_at?: string
        }
        Relationships: []
      }
      artist_invites: {
        Row: {
          id: string
          email: string
          status: "pending" | "consumed" | "revoked"
          invited_by: string | null
          created_at: string
          consumed_at: string | null
        }
        Insert: {
          id?: string
          email: string
          status?: "pending" | "consumed" | "revoked"
          invited_by?: string | null
          created_at?: string
          consumed_at?: string | null
        }
        Update: {
          id?: string
          email?: string
          status?: "pending" | "consumed" | "revoked"
          invited_by?: string | null
          created_at?: string
          consumed_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      artist_fee_summary: {
        Row: {
          artist_id: string
          total_due: number
          total_paid: number
          ndf_pending: number
          reste_du: number
        }
        Relationships: []
      }
    }
    Functions: {}
    Enums: {}
    CompositeTypes: {}
  }
}
