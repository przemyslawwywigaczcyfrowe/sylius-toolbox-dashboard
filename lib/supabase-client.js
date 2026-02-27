// dashboard/lib/supabase-client.js — Inicjalizacja klienta Supabase

var supabaseClient = null;

function initSupabase(url, key) {
  supabaseClient = supabase.createClient(url, key);
  localStorage.setItem('sb_url', url);
  localStorage.setItem('sb_key', key);
  return supabaseClient;
}

function getSupabase() {
  if (supabaseClient) return supabaseClient;
  var url = localStorage.getItem('sb_url');
  var key = localStorage.getItem('sb_key');
  if (url && key) {
    return initSupabase(url, key);
  }
  return null;
}

function disconnectSupabase() {
  supabaseClient = null;
  localStorage.removeItem('sb_url');
  localStorage.removeItem('sb_key');
}
