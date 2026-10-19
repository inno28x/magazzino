import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const chiave = import.meta.env.VITE_SUPABASE_KEY;

/** false se mancano le variabili d'ambiente (README, passo 6). */
export const configurato = Boolean(url && chiave);

export const supabase = configurato
  ? createClient(url, chiave, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;
