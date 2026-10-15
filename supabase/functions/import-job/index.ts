import { handleOptions, json, requireUser } from "../_shared/http.ts";

const normalize = (text: string) => text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
  .replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, 100_000);

const privateIPv4 = (host: string) => {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return false;
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) || parts[0] >= 224;
};

const privateIPv6 = (host: string) => {
  const value = host.replace(/^\[|\]$/g, "").toLowerCase();
  return value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") ||
    value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb") ||
    value.startsWith("::ffff:127.") || value.startsWith("::ffff:10.") || value.startsWith("::ffff:192.168.");
};

const assertPublicUrl = async (value: string) => {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("https_url_required");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || privateIPv4(host) || privateIPv6(host)) throw new Error("unsafe_url");
  const isLiteral = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
  if (!isLiteral) {
    let ipv4: string[]; let ipv6: string[];
    try { [ipv4, ipv6] = await Promise.all([Deno.resolveDns(host, "A"), Deno.resolveDns(host, "AAAA")]); }
    catch { throw new Error("dns_validation_failed"); }
    if (ipv4.some(privateIPv4) || ipv6.some(privateIPv6)) throw new Error("unsafe_url");
  }
  return url;
};

const decodeHtml = (value: string) => value.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
  .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");

const htmlText = (html: string) => normalize(decodeHtml(html
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
  .replace(/<(br|p|div|li|h[1-6]|section|article)\b[^>]*>/gi, "\n")
  .replace(/<[^>]+>/g, " ")));

const fetchJob = async (rawUrl: string) => {
  let url = await assertPublicUrl(rawUrl);
  for (let redirects = 0; redirects < 4; redirects++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(url, { redirect: "manual", signal: controller.signal, headers: { "User-Agent": "CV-Maker/1.0 job-import" } });
    clearTimeout(timeout);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("invalid_redirect");
      url = await assertPublicUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`job_fetch_${response.status}`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) throw new Error("unsupported_job_content");
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > 2_000_000) throw new Error("job_page_too_large");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > 2_000_000) throw new Error("job_page_too_large");
    const raw = new TextDecoder().decode(bytes);
    const title = decodeHtml(raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "Untitled role").trim().slice(0, 240);
    return { description: contentType.includes("html") ? htmlText(raw) : normalize(raw), title, url: url.toString() };
  }
  throw new Error("too_many_redirects");
};

Deno.serve(async (request) => {
  const preflight = handleOptions(request); if (preflight) return preflight;
  try {
    const { client, user } = await requireUser(request);
    const body = await request.json();
    const captureMethod = body.captureMethod === "extension" ? "extension" : body.description ? "paste" : "url";
    const fetched = body.description ? null : await fetchJob(String(body.url ?? ""));
    const description = normalize(String(body.description ?? fetched?.description ?? ""));
    if (description.length < 80) return json(request, { error: "job_text_too_short", fallback: "paste_or_extension" }, 422);
    const row = {
      user_id: user.id,
      url: String(body.url ?? fetched?.url ?? "").slice(0, 2000),
      title: String(body.title ?? fetched?.title ?? "Untitled role").slice(0, 240),
      company: String(body.company ?? "").slice(0, 240),
      description,
      capture_method: captureMethod,
    };
    const { data, error } = await client.from("jobs").insert(row).select().single();
    if (error) throw new Error("job_save_failed");
    return json(request, { job: data }, 201);
  } catch (error) {
    const code = error instanceof Error ? error.message : "job_import_failed";
    const status = code === "authentication_required" ? 401 : code.includes("unsafe") || code.includes("required") ? 400 : 422;
    return json(request, { error: code, fallback: "paste_or_extension" }, status);
  }
});
