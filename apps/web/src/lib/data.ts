import type { BaseCV, CVTemplateId, JobSnapshot, QuotaState, TailoredCV } from "@cv-maker/shared";
import { baseCVSchema, demoCV, tailoredCVSchema } from "@cv-maker/shared";
import { isSupabaseConfigured, supabase } from "./supabase";

export type JobRecord = JobSnapshot & {
  id: string;
  latestTailoredCV: TailoredCV | null;
  templateId: CVTemplateId;
  createdAt: string;
  updatedAt: string;
};

const STORE = "cv-maker-demo";
type DemoStore = { baseCV: BaseCV; jobs: JobRecord[]; limit: number };

const readDemo = (): DemoStore => {
  const raw = localStorage.getItem(STORE);
  if (raw) return JSON.parse(raw);
  const value = { baseCV: demoCV, jobs: [], limit: 5 };
  localStorage.setItem(STORE, JSON.stringify(value));
  return value;
};

const writeDemo = (store: DemoStore) => localStorage.setItem(STORE, JSON.stringify(store));
const functionErrorMessage = async (error: unknown, data: any, fallback: string) => {
  if (data?.error) return String(data.error);
  const response = (error as { context?: Response } | null)?.context;
  if (response && typeof response.clone === "function") {
    try {
      const body = await response.clone().json();
      if (body?.error) return String(body.error);
    } catch { /* The gateway did not return JSON. */ }
  }
  return error instanceof Error ? error.message : fallback;
};
const rowToJob = (row: any): JobRecord => ({
  schemaVersion: 2,
  id: row.id,
  url: row.url,
  title: row.title,
  company: row.company,
  description: row.description,
  captureMethod: row.capture_method,
  capturedAt: row.created_at,
  structuredData: row.structured_data ?? null,
  parseStatus: row.parse_status ?? (row.structured_data ? "completed" : "pending"),
  parseWarnings: row.parse_warnings ?? [],
  location: row.location ?? row.structured_data?.location?.original ?? "",
  datePosted: row.date_posted ?? row.structured_data?.datePosted ?? null,
  employmentType: row.employment_type ?? row.structured_data?.employmentType ?? null,
  seniority: row.seniority ?? row.structured_data?.seniority ?? null,
  sourceLanguage: row.source_language ?? row.structured_data?.sourceLanguage ?? null,
  latestTailoredCV: row.latest_tailored_cv,
  templateId: row.template_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const dataApi = {
  async getBaseCV(): Promise<BaseCV | null> {
    if (!isSupabaseConfigured) return readDemo().baseCV;
    const { data, error } = await supabase!.from("base_cvs").select("document").maybeSingle();
    if (error) throw error;
    return data?.document ? baseCVSchema.parse(data.document) : null;
  },

  async saveBaseCV(cv: BaseCV, file?: File): Promise<void> {
    if (!isSupabaseConfigured) {
      const store = readDemo(); store.baseCV = cv; writeDemo(store); return;
    }
    const { data: userData } = await supabase!.auth.getUser();
    if (!userData.user) throw new Error("Sign in to save your CV.");
    let sourcePath: string | null = null;
    if (file) {
      sourcePath = `${userData.user.id}/base-${Date.now()}.${file.name.split(".").pop()?.toLowerCase() || "bin"}`;
      const { data: prior } = await supabase!.from("base_cvs").select("source_path").maybeSingle();
      const upload = await supabase!.storage.from("cv-originals").upload(sourcePath, file, { upsert: true });
      if (upload.error) throw upload.error;
      if (prior?.source_path && prior.source_path !== sourcePath) await supabase!.storage.from("cv-originals").remove([prior.source_path]);
    }
    const { error } = await supabase!.from("base_cvs").upsert({
      user_id: userData.user.id, document: cv, ...(sourcePath ? { source_path: sourcePath, source_name: file?.name } : {}),
    });
    if (error) throw error;
  },

  async listJobs(): Promise<JobRecord[]> {
    if (!isSupabaseConfigured) return readDemo().jobs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const { data, error } = await supabase!.from("jobs").select("*").order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowToJob);
  },

  async getJob(jobId: string): Promise<JobRecord | null> {
    if (!isSupabaseConfigured) return readDemo().jobs.find((job) => job.id === jobId) ?? null;
    const { data, error } = await supabase!.from("jobs").select("*").eq("id", jobId).maybeSingle();
    if (error) throw error;
    return data ? rowToJob(data) : null;
  },

  async importJob(input: { url?: string; title?: string; company?: string; description?: string; captureMethod?: string }): Promise<JobRecord> {
    if (!isSupabaseConfigured) {
      const now = new Date().toISOString();
      const job: JobRecord = {
        schemaVersion: 2, id: crypto.randomUUID(), url: input.url ?? "", title: input.title || "Senior Product Operations Manager",
        company: input.company || "Acme Systems", description: input.description || "Lead product operations, planning, experimentation and cross-functional delivery. Use data to improve customer outcomes.",
        captureMethod: input.description ? "paste" : "url", capturedAt: now, structuredData: null, parseStatus: "completed", parseWarnings: [], location: "", datePosted: null,
        employmentType: null, seniority: null, sourceLanguage: null, latestTailoredCV: null, templateId: "clarity", createdAt: now, updatedAt: now,
      };
      const store = readDemo(); store.jobs.unshift(job); writeDemo(store); return job;
    }
    const { data, error } = await supabase!.functions.invoke("import-job", { body: input });
    if (error || data?.error) throw new Error(await functionErrorMessage(error, data, "Could not import this job."));
    return rowToJob(data.job);
  },

  async tailorJob(job: JobRecord, templateId: CVTemplateId): Promise<TailoredCV> {
    if (!isSupabaseConfigured) {
      const store = readDemo();
      const skill = { id: "inferred-ai", text: "Experimentation strategy", visible: true, provenance: { status: "inferred_unconfirmed" as const, sourceRefs: ["job.description"], rationale: "The role emphasizes experimentation; confirm that this reflects your experience." } };
      const cv = tailoredCVSchema.parse({ ...store.baseCV, jobId: job.id, templateId, generatedAt: new Date().toISOString(), summary: { ...store.baseCV.summary, text: `Product operations leader aligning planning, experimentation and customer insight to help ${job.company || "growing teams"} deliver better outcomes.` }, skills: [...store.baseCV.skills, skill] });
      const index = store.jobs.findIndex((item) => item.id === job.id);
      store.jobs[index] = { ...store.jobs[index], latestTailoredCV: cv, templateId, updatedAt: new Date().toISOString() };
      writeDemo(store); await new Promise((resolve) => setTimeout(resolve, 900)); return cv;
    }
    const { data, error } = await supabase!.functions.invoke("tailor-cv", {
      body: { jobId: job.id, templateId, idempotencyKey: crypto.randomUUID() },
      headers: { "idempotency-key": crypto.randomUUID() },
    });
    if (error || data?.error) throw new Error(await functionErrorMessage(error, data, "Tailoring failed."));
    return tailoredCVSchema.parse(data.cv);
  },

  async saveTailoredJob(jobId: string, cv: TailoredCV): Promise<void> {
    if (!isSupabaseConfigured) {
      const store = readDemo(); const index = store.jobs.findIndex((job) => job.id === jobId);
      if (index >= 0) store.jobs[index] = { ...store.jobs[index], latestTailoredCV: cv, templateId: cv.templateId, updatedAt: new Date().toISOString() };
      writeDemo(store); return;
    }
    const { error } = await supabase!.from("jobs").update({ latest_tailored_cv: cv, template_id: cv.templateId }).eq("id", jobId);
    if (error) throw error;
  },

  async deleteJob(jobId: string): Promise<void> {
    if (!isSupabaseConfigured) { const store = readDemo(); store.jobs = store.jobs.filter((job) => job.id !== jobId); writeDemo(store); return; }
    const { error } = await supabase!.from("jobs").delete().eq("id", jobId); if (error) throw error;
  },

  async getQuota(): Promise<QuotaState> {
    if (!isSupabaseConfigured) {
      const store = readDemo(); const used = store.jobs.filter((job) => job.latestTailoredCV).length;
      const reset = new Date(); reset.setUTCMonth(reset.getUTCMonth() + 1, 1); reset.setUTCHours(0, 0, 0, 0);
      return { limit: store.limit, used, reserved: 0, remaining: Math.max(store.limit - used, 0), resetsAt: reset.toISOString(), disabled: false };
    }
    const { data, error } = await supabase!.rpc("current_quota_state"); if (error) throw error; return data;
  },
};
