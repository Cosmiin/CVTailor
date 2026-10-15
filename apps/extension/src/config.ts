export const config = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "") || "",
  publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "",
  webAppUrl: import.meta.env.VITE_WEB_APP_URL?.replace(/\/$/, "") || "http://localhost:5173",
};

export const isConfigured = Boolean(config.supabaseUrl && config.publishableKey && !config.supabaseUrl.includes("your-project"));
