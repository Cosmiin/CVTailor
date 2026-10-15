import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = () =>
  (Deno.env.get("ALLOWED_ORIGINS") ?? "http://localhost:5173")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

export const corsHeaders = (request: Request) => {
  const origin = request.headers.get("origin") ?? "";
  const allowed = allowedOrigins();
  const isExtension = origin.startsWith("chrome-extension://");
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) || isExtension ? origin : allowed[0] ?? "",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, idempotency-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
};

export const json = (request: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json; charset=utf-8" },
  });

export const userClient = (request: Request) => {
  const auth = request.headers.get("Authorization") ?? "";
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } }, auth: { persistSession: false } },
  );
};

export const adminClient = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

export const requireUser = async (request: Request) => {
  const client = userClient(request);
  const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new Error("authentication_required");
  return { client, user: data.user };
};

export const handleOptions = (request: Request) =>
  request.method === "OPTIONS" ? new Response(null, { status: 204, headers: corsHeaders(request) }) : null;
