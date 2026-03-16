import { createClient, type SupabaseClient } from "@supabase/supabase-js";
console.log("SUPABASE ENV:", import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY ? "key present" : "key MISSING");

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseKey) {
  console.warn("Supabase credentials not found. Cloud sync will be disabled.");
}

export const supabase: SupabaseClient = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseKey || "placeholder"
);

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseKey);
}
