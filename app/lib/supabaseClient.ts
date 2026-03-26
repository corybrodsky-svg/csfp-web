import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://xhrmojbobqzrudyszxcn.supabase.co";
const supabaseKey = "PASTE_YOUR_FULL_NEXT_PUBLIC_SUPABASE_ANON_KEY_HERE";

export const supabase = createClient(supabaseUrl, supabaseKey);
