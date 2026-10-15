import { adminClient, handleOptions, json, requireUser } from "../_shared/http.ts";

Deno.serve(async (request) => {
  const preflight = handleOptions(request); if (preflight) return preflight;
  try {
    const { user } = await requireUser(request);
    const admin = adminClient();
    const { data: files } = await admin.storage.from("cv-originals").list(user.id, { limit: 100 });
    if (files?.length) await admin.storage.from("cv-originals").remove(files.map((file) => `${user.id}/${file.name}`));
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw new Error("account_delete_failed");
    return json(request, { deleted: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "account_delete_failed";
    return json(request, { error: code }, code === "authentication_required" ? 401 : 500);
  }
});
