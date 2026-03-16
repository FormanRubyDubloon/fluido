import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;

  initialize: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  error: null,

  initialize: async () => {
    try {
      const { data } = await supabase.auth.getSession();
      set({ user: data.session?.user ?? null, loading: false });

      // Listen for auth changes (e.g. token refresh, sign out from another tab)
      supabase.auth.onAuthStateChange((_event, session) => {
        set({ user: session?.user ?? null });
      });
    } catch {
      set({ loading: false });
    }
  },

  signUp: async (email, password) => {
    set({ error: null, loading: true });
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      set({ error: error.message, loading: false });
      return false;
    }
    set({ user: data.user, loading: false });
    return true;
  },

  signIn: async (email, password) => {
    set({ error: null, loading: true });
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      set({ error: error.message, loading: false });
      return false;
    }
    set({ user: data.user, loading: false });
    return true;
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null });
  },

  clearError: () => set({ error: null }),
}));
