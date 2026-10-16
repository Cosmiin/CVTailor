import type {
  BaseCV, CVTemplateId, ExperienceContext, ExperienceEnrichment, ExperienceInterviewAnswer,
  JobSnapshot, QuotaState, TailoredCV,
} from "@cv-maker/shared";
import { demoCV, experienceEnrichmentSchema, experienceFingerprint, tailoredCVSchema } from "@cv-maker/shared";
import { isSupabaseConfigured, supabase } from "./supabase";

export type JobRecord = JobSnapshot & {
  id: string;
  latestTailoredCV: TailoredCV | null;
  templateId: CVTemplateId;
  createdAt: string;
  updatedAt: string;
};

const STORE = "cv-maker-demo";
type DemoStore = { baseCV: BaseCV; jobs: JobRecord[]; limit: number; enrichments?: Record<string, ExperienceEnrichment> };

const readDemo = (): DemoStore => {
  const raw = localStorage.getItem(STORE);
  if (raw) return JSON.parse(raw);
  const value = { baseCV: demoCV, jobs: [], limit: 5 };
  localStorage.setItem(STORE, JSON.stringify(value));
  return value;
};

const writeDemo = (store: DemoStore) => localStorage.setItem(STORE, JSON.stringify(store));
const functionErrorMessage = async (error: unknown, data: any, fallback: string) => {
  const friendly = (code: string) => ({
    stale_experience_contexts: "Role context needs confirmation in Base CV before tailoring.",
    openai_timeout: "Tailoring took too long to complete. Please try again.",
    openai_request_failed: "The AI service could not be reached. Please try again.",
    tailored_cv_skill_rules_failed: "AI could not produce valid short skills. Please try again.",
    quota_exhausted: "You have used all tailoring runs available this month.",
    account_disabled: "This account is currently disabled.",
    "Failed to send a request to the Edge Function": "The tailoring service was interrupted. Please try again.",
  }[code] ?? code.replaceAll("_", " "));
  if (data?.error) return friendly(String(data.error));
  const response = (error as { context?: Response } | null)?.context;
  if (response && typeof response.clone === "function") {
    try {
      const body = await response.clone().json();
      if (body?.error) return friendly(String(body.error));
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

const rowToEnrichment = (row: any): ExperienceEnrichment => experienceEnrichmentSchema.parse({
  experienceId: row.experience_id,
  active: row.active_payload ?? null,
  draft: row.draft_payload ?? null,
  pending: row.pending_payload ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const invokeEnrichment = async (body: Record<string, unknown>) => {
  const { data, error } = await supabase!.functions.invoke("enrich-experience", { body });
  if (error || data?.error) throw new Error(await functionErrorMessage(error, data, "Experience interview failed."));
  return data;
};

const demoQuestions = [
  ["ownership", "Which responsibilities did you personally own?", ["Planning and prioritization", "Delivery and execution", "Stakeholder alignment", "Not applicable"]],
  ["methods", "Which working practices did you use regularly?", ["Agile delivery", "Process improvement", "Data-informed decisions", "Not applicable"]],
  ["tools", "What best describes your use of tools and technology?", ["Automation workflows", "AI-assisted delivery", "Analytics and reporting", "Not applicable"]],
  ["scope", "What was the scope of your work?", ["Individual contributor", "Cross-functional leadership", "Team management", "Not applicable"]],
  ["outcomes", "What kind of outcomes did your work create?", ["Faster delivery", "Clearer decisions", "Improved customer experience", "Not applicable"]],
].map(([id, prompt, labels], index) => ({
  id: `q${index + 1}-${id}`, prompt: String(prompt), type: index === 0 ? "multiple" as const : "single" as const,
  options: (labels as string[]).map((label, optionIndex) => ({ id: `q${index + 1}-o${optionIndex + 1}`, label })), rationale: "Adds useful context that is often missing from a CV.",
}));

export const dataApi = {
  async getBaseCV(): Promise<BaseCV | null> {
    if (!isSupabaseConfigured) return readDemo().baseCV;
    const { data, error } = await supabase!.from("base_cvs").select("document").maybeSingle();
    if (error) throw error;
    if (!data?.document) return null;
    const document = data.document as BaseCV;
    return {
      ...document,
      photo: document.photo ? {
        ...document.photo,
        positionX: document.photo.positionX ?? 50,
        positionY: document.photo.positionY ?? 50,
        zoom: document.photo.zoom ?? 1.15,
      } : null,
    };
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

  async listExperienceEnrichments(): Promise<ExperienceEnrichment[]> {
    if (!isSupabaseConfigured) return Object.values(readDemo().enrichments ?? {});
    const { data, error } = await supabase!.from("experience_enrichments").select("*").order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowToEnrichment);
  },

  async startExperienceInterview(experienceId: string): Promise<ExperienceEnrichment> {
    if (!isSupabaseConfigured) {
      const store = readDemo(); const experience = store.baseCV.experience.find((item) => item.id === experienceId);
      if (!experience) throw new Error("Experience not found.");
      const now = new Date().toISOString();
      const record = experienceEnrichmentSchema.parse({ experienceId, active: store.enrichments?.[experienceId]?.active ?? null, pending: null, createdAt: store.enrichments?.[experienceId]?.createdAt ?? now, updatedAt: now, draft: {
        schemaVersion: 1, sourceFingerprint: experienceFingerprint(experience), questions: demoQuestions,
        answers: [], currentIndex: 0, startedAt: now, updatedAt: now,
      } });
      store.enrichments = { ...(store.enrichments ?? {}), [experienceId]: record }; writeDemo(store); return record;
    }
    const data = await invokeEnrichment({ action: "start", experienceId, requestKey: crypto.randomUUID() });
    return rowToEnrichment(data.record);
  },

  async saveExperienceAnswer(experienceId: string, answer: ExperienceInterviewAnswer, currentIndex: number): Promise<ExperienceEnrichment> {
    if (!isSupabaseConfigured) {
      const store = readDemo(); const record = store.enrichments?.[experienceId]; if (!record?.draft) throw new Error("Interview draft not found.");
      record.draft = { ...record.draft, answers: [...record.draft.answers.filter((item) => item.questionId !== answer.questionId), answer], currentIndex, updatedAt: new Date().toISOString() };
      record.updatedAt = new Date().toISOString(); store.enrichments![experienceId] = record; writeDemo(store); return record;
    }
    const data = await invokeEnrichment({ action: "save-draft", experienceId, answer, currentIndex });
    return rowToEnrichment(data.record);
  },

  async synthesizeExperience(experienceId: string): Promise<ExperienceEnrichment> {
    if (!isSupabaseConfigured) {
      const store = readDemo(); const record = store.enrichments?.[experienceId]; if (!record?.draft) throw new Error("Interview draft not found.");
      const labels = record.draft.answers.flatMap((answer) => {
        const question = record.draft!.questions.find((item) => item.id === answer.questionId);
        return question?.options.filter((option) => answer.selectedOptionIds.includes(option.id)).map((option) => option.label) ?? [];
      }).filter((label) => label !== "Not applicable");
      const names = ["Role Ownership", "Process Improvement", "Stakeholder Alignment", "AI-Assisted Delivery", "Outcome Focus"];
      record.pending = { schemaVersion: 1, overview: `Expanded context based on ${record.draft.answers.length} interview answers.`, responsibilities: labels.slice(0, 3), methods: labels.slice(1, 4), tools: labels.filter((label) => /AI|Automation|Analytics/i.test(label)), scope: labels.filter((label) => /leadership|management|contributor/i.test(label)), domains: [], outcomes: labels.slice(-3), skills: names.map((name, index) => ({ id: `skill-${index + 1}`, name, evidence: labels[index] ?? "Confirmed by the candidate during the role interview.", sourceQuestionIds: [record.draft!.questions[Math.min(index, record.draft!.questions.length - 1)].id] })) };
      record.updatedAt = new Date().toISOString(); store.enrichments![experienceId] = record; writeDemo(store); return record;
    }
    const data = await invokeEnrichment({ action: "synthesize", experienceId, requestKey: crypto.randomUUID() });
    return rowToEnrichment(data.record);
  },

  async approveExperienceContext(experienceId: string, context: ExperienceContext): Promise<ExperienceEnrichment> {
    if (!isSupabaseConfigured) {
      const store = readDemo(); const record = store.enrichments?.[experienceId]; if (!record?.draft) throw new Error("Interview draft not found.");
      record.active = { sourceFingerprint: record.draft.sourceFingerprint, context, questions: record.draft.questions, answers: record.draft.answers, approvedAt: new Date().toISOString() };
      record.draft = null; record.pending = null; record.updatedAt = new Date().toISOString(); store.enrichments![experienceId] = record; writeDemo(store); return record;
    }
    const data = await invokeEnrichment({ action: "approve", experienceId, context });
    return rowToEnrichment(data.record);
  },

  async confirmExperienceContext(experienceId: string): Promise<ExperienceEnrichment> {
    if (!isSupabaseConfigured) {
      const store = readDemo(); const record = store.enrichments?.[experienceId]; const experience = store.baseCV.experience.find((item) => item.id === experienceId);
      if (!record?.active || !experience) throw new Error("Experience context not found.");
      record.active = { ...record.active, sourceFingerprint: experienceFingerprint(experience), approvedAt: new Date().toISOString() }; record.updatedAt = new Date().toISOString(); writeDemo(store); return record;
    }
    const data = await invokeEnrichment({ action: "confirm-current", experienceId }); return rowToEnrichment(data.record);
  },

  async updateExperienceContext(experienceId: string, context: ExperienceContext): Promise<ExperienceEnrichment> {
    if (!isSupabaseConfigured) {
      const store = readDemo(); const record = store.enrichments?.[experienceId]; if (!record?.active) throw new Error("Experience context not found.");
      record.active = { ...record.active, context }; record.updatedAt = new Date().toISOString(); writeDemo(store); return record;
    }
    const data = await invokeEnrichment({ action: "update-active", experienceId, context }); return rowToEnrichment(data.record);
  },

  async discardExperienceDraft(experienceId: string): Promise<ExperienceEnrichment | null> {
    if (!isSupabaseConfigured) {
      const store = readDemo(); const record = store.enrichments?.[experienceId] ?? null;
      if (record) { record.draft = null; record.pending = null; record.updatedAt = new Date().toISOString(); writeDemo(store); } return record;
    }
    const data = await invokeEnrichment({ action: "discard-draft", experienceId }); return data.record ? rowToEnrichment(data.record) : null;
  },

  async deleteExperienceContext(experienceId: string): Promise<void> {
    if (!isSupabaseConfigured) { const store = readDemo(); if (store.enrichments) delete store.enrichments[experienceId]; writeDemo(store); return; }
    await invokeEnrichment({ action: "delete", experienceId });
  },

  async pruneExperienceContexts(): Promise<void> {
    if (!isSupabaseConfigured) {
      const store = readDemo(); const ids = new Set(store.baseCV.experience.map((item) => item.id));
      store.enrichments = Object.fromEntries(Object.entries(store.enrichments ?? {}).filter(([id]) => ids.has(id))); writeDemo(store); return;
    }
    await invokeEnrichment({ action: "prune", experienceId: "prune" });
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
    const idempotencyKey = crypto.randomUUID();
    const { data, error } = await supabase!.functions.invoke("tailor-cv", {
      body: { jobId: job.id, templateId, idempotencyKey },
      headers: { "idempotency-key": idempotencyKey },
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
