import type {
  ApplicationStatus, BaseCV, CVTemplateId, ExperienceContext, ExperienceEnrichment, ExperienceEvidence,
  ExperienceInterviewAnswer, JobInterviewAnswer, JobSnapshot, JobTailoringSession, ProposedExperienceEvidence,
  QuotaState, TailoredCV,
} from "@cv-maker/shared";
import {
  demoCV, experienceEnrichmentSchema, experienceEvidenceSchema, experienceFingerprint, exportableCV,
  jobTailoringSessionSchema, tailoredCVSchema,
} from "@cv-maker/shared";
import { isSupabaseConfigured, supabase } from "./supabase";

export type JobRecord = JobSnapshot & {
  id: string;
  latestTailoredCV: TailoredCV | null;
  applicationStatus: ApplicationStatus;
  appliedAt: string | null;
  applicationStatusChangedAt: string | null;
  appliedCV: TailoredCV | null;
  templateId: CVTemplateId;
  createdAt: string;
  updatedAt: string;
};

const STORE = "cv-maker-demo";
type DemoStore = {
  baseCV: BaseCV; jobs: JobRecord[]; limit: number;
  enrichments?: Record<string, ExperienceEnrichment>;
  evidence?: ExperienceEvidence[];
  jobSessions?: Record<string, JobTailoringSession>;
};

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
    tailoring_source_changed: "Your CV or job changed while generation was running. Start tailoring again so the result uses the latest information.",
    tailoring_start_interrupted: "The background generation could not start. Please try again; no tailoring run was used.",
    tailoring_background_waiting: "Your CV is still generating in the background. You can close this message and resume from this job later.",
    tailored_cv_skill_rules_failed: "AI could not produce valid short skills. Please try again.",
    quota_exhausted: "You have used all tailoring runs available this month.",
    account_disabled: "This account is currently disabled.",
    job_interview_rate_limited: "You have reached the short-term interview limit. Please try again in an hour.",
    experience_ai_rate_limited: "You have reached the short-term interview limit. Please try again in an hour.",
    job_interview_busy: "Another evidence check is already running. Please wait a moment and try again.",
    experience_ai_busy: "Another evidence check is already running. Please wait a moment and try again.",
    job_interview_not_ready: "Complete the evidence review before generating your CV.",
    job_interview_answers_incomplete: "Answer or skip each question before reviewing the evidence.",
    job_title_required: "Add the role title.",
    job_company_required: "Add the company name.",
    job_text_too_short: "Add the full job description (at least 80 characters).",
    job_manual_save_failed: "The manual job details could not be saved. Please try again.",
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
  applicationStatus: row.application_status ?? "not_applied",
  appliedAt: row.applied_at ?? null,
  applicationStatusChangedAt: row.application_status_changed_at ?? null,
  appliedCV: row.applied_cv ?? null,
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

const rowToEvidence = (row: any): ExperienceEvidence => experienceEvidenceSchema.parse({
  id: row.id, experienceId: row.experience_id, category: row.category, label: row.label,
  statement: row.statement, searchTerms: row.search_terms ?? [], sourceQuestionIds: row.source_question_ids ?? [],
  sourceJobId: row.source_job_id ?? null, sourceSessionId: row.source_session_id ?? null,
  roleFingerprint: row.role_fingerprint, confirmedAt: row.confirmed_at, createdAt: row.created_at, updatedAt: row.updated_at,
});

const invokeEnrichment = async (body: Record<string, unknown>) => {
  const { data, error } = await supabase!.functions.invoke("enrich-experience", { body });
  if (error || data?.error) throw new Error(await functionErrorMessage(error, data, "Experience interview failed."));
  return data;
};

const invokeJobInterview = async (body: Record<string, unknown>) => {
  const { data, error } = await supabase!.functions.invoke("job-interview", { body });
  if (error || data?.error) throw new Error(await functionErrorMessage(error, data, "Job evidence interview failed."));
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
        // Legacy photos can carry an exact 1× value, which leaves square images
        // with no overflow to reposition. Give those photos a small movable crop.
        zoom: document.photo.zoom && document.photo.zoom > 1 ? document.photo.zoom : 1.15,
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

  async listExperienceEvidence(): Promise<ExperienceEvidence[]> {
    if (!isSupabaseConfigured) return readDemo().evidence ?? [];
    const { data, error } = await supabase!.from("experience_evidence").select("*").order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowToEvidence);
  },

  async updateExperienceEvidence(evidenceId: string, input: { label: string; statement: string }): Promise<void> {
    if (!isSupabaseConfigured) {
      const store = readDemo(); const item = store.evidence?.find((entry) => entry.id === evidenceId);
      if (item) { item.label = input.label; item.statement = input.statement; item.confirmedAt = new Date().toISOString(); item.updatedAt = item.confirmedAt; }
      writeDemo(store); return;
    }
    await invokeJobInterview({ action: "update-evidence", evidenceId, ...input });
  },

  async deleteExperienceEvidence(evidenceId: string): Promise<void> {
    if (!isSupabaseConfigured) { const store = readDemo(); store.evidence = (store.evidence ?? []).filter((item) => item.id !== evidenceId); writeDemo(store); return; }
    await invokeJobInterview({ action: "delete-evidence", evidenceId });
  },

  async deleteRoleEvidence(experienceId: string): Promise<void> {
    if (!isSupabaseConfigured) { const store = readDemo(); store.evidence = (store.evidence ?? []).filter((item) => item.experienceId !== experienceId); writeDemo(store); return; }
    await invokeJobInterview({ action: "delete-role-evidence", experienceId });
  },

  async getJobInterview(jobId: string): Promise<JobTailoringSession | null> {
    if (!isSupabaseConfigured) return readDemo().jobSessions?.[jobId] ?? null;
    const data = await invokeJobInterview({ action: "get", jobId });
    return data.session ? jobTailoringSessionSchema.parse(data.session) : null;
  },

  async analyzeJobInterview(jobId: string): Promise<JobTailoringSession> {
    if (!isSupabaseConfigured) {
      const store = readDemo(); const existing = store.jobSessions?.[jobId]; if (existing) return existing;
      const experience = store.baseCV.experience[0]; const now = new Date().toISOString();
      const requirements = [
        ["r1", "Role ownership", "unclear"], ["r2", "Relevant tools", "unclear"],
        ["r3", "Cross-functional delivery", "supported"], ["r4", "Outcome focus", "unsupported"],
      ].map(([id, text, status]) => ({ id, text, status, atsTerms: [text], rationale: status === "supported" ? "Visible in the CV." : "More evidence may help." }));
      const questions = experience ? [
        { id: "q1", targetExperienceId: experience.id, requirementIds: ["r1"], prompt: "Which parts of delivery did you personally own?", type: "multiple" as const, options: ["Planning", "Execution", "Stakeholder alignment", "Not applicable"].map((label, index) => ({ id: `q1-o${index + 1}`, label })), rationale: "Clarifies ownership." },
        { id: "q2", targetExperienceId: experience.id, requirementIds: ["r2"], prompt: "Which relevant applications or tools did you use in this role?", type: "free_text" as const, options: [], rationale: "Adds supported tool evidence." },
      ] : [];
      const session = jobTailoringSessionSchema.parse({ schemaVersion: 1, id: crypto.randomUUID(), jobId, status: questions.length ? "questions" : "ready", jobFingerprint: "demo-job", baseFingerprint: "demo-base", requirements, questions, answers: [], currentIndex: 0, priorEvidence: [], confirmedEvidenceIds: [], reconfirmationDone: true, proposedEvidence: [], approvedEvidenceIds: [], createdAt: now, updatedAt: now });
      store.jobSessions = { ...(store.jobSessions ?? {}), [jobId]: session }; writeDemo(store); return session;
    }
    const data = await invokeJobInterview({ action: "analyze", jobId, requestKey: crypto.randomUUID() });
    return jobTailoringSessionSchema.parse(data.session);
  },

  async saveJobInterviewAnswer(jobId: string, sessionId: string, answer: JobInterviewAnswer, currentIndex: number): Promise<JobTailoringSession> {
    if (!isSupabaseConfigured) {
      const store = readDemo(); const session = store.jobSessions?.[jobId]; if (!session) throw new Error("Interview not found.");
      session.answers = [...session.answers.filter((item) => item.questionId !== answer.questionId), answer]; session.currentIndex = currentIndex; session.updatedAt = new Date().toISOString(); writeDemo(store); return session;
    }
    const data = await invokeJobInterview({ action: "save-answer", jobId, sessionId, answer, currentIndex });
    return jobTailoringSessionSchema.parse(data.session);
  },

  async reconfirmJobEvidence(jobId: string, sessionId: string, evidenceIds: string[]): Promise<JobTailoringSession> {
    if (!isSupabaseConfigured) {
      const store = readDemo(); const session = store.jobSessions?.[jobId]; if (!session) throw new Error("Interview not found.");
      session.confirmedEvidenceIds = evidenceIds; session.reconfirmationDone = true; session.updatedAt = new Date().toISOString(); writeDemo(store); return session;
    }
    const data = await invokeJobInterview({ action: "reconfirm", jobId, sessionId, evidenceIds });
    return jobTailoringSessionSchema.parse(data.session);
  },

  async synthesizeJobEvidence(jobId: string, sessionId: string): Promise<JobTailoringSession> {
    if (!isSupabaseConfigured) {
      const store = readDemo(); const session = store.jobSessions?.[jobId]; if (!session) throw new Error("Interview not found.");
      session.proposedEvidence = session.answers.filter((answer) => !answer.skipped).map((answer, index) => {
        const question = session.questions.find((item) => item.id === answer.questionId)!;
        const selected = question.options.filter((item) => answer.selectedOptionIds.includes(item.id)).map((item) => item.label).join(", ");
        return { id: `e${index + 1}`, experienceId: question.targetExperienceId, category: index ? "tool" as const : "responsibility" as const, label: selected.slice(0, 80), statement: (answer.note || selected).slice(0, 300), searchTerms: selected ? selected.split(", ") : [], sourceQuestionIds: [question.id], approved: true };
      });
      session.status = session.proposedEvidence.length ? "review" : "ready"; session.updatedAt = new Date().toISOString(); writeDemo(store); return session;
    }
    const data = await invokeJobInterview({ action: "synthesize", jobId, sessionId, requestKey: crypto.randomUUID() });
    return jobTailoringSessionSchema.parse(data.session);
  },

  async approveJobEvidence(jobId: string, sessionId: string, evidence: ProposedExperienceEvidence[]): Promise<JobTailoringSession> {
    if (!isSupabaseConfigured) {
      const store = readDemo(); const session = store.jobSessions?.[jobId]; if (!session) throw new Error("Interview not found.");
      const now = new Date().toISOString(); const saved = evidence.filter((item) => item.approved).map((item) => experienceEvidenceSchema.parse({ ...item, id: crypto.randomUUID(), sourceJobId: jobId, sourceSessionId: sessionId, roleFingerprint: experienceFingerprint(store.baseCV.experience.find((role) => role.id === item.experienceId)!), confirmedAt: now, createdAt: now, updatedAt: now }));
      store.evidence = [...(store.evidence ?? []), ...saved]; session.approvedEvidenceIds = saved.map((item) => item.id); session.proposedEvidence = evidence; session.status = "ready"; session.updatedAt = now; writeDemo(store); return session;
    }
    const data = await invokeJobInterview({ action: "approve", jobId, sessionId, evidence });
    return jobTailoringSessionSchema.parse(data.session);
  },

  async discardJobInterview(jobId: string, sessionId: string): Promise<void> {
    if (!isSupabaseConfigured) { const store = readDemo(); if (store.jobSessions) delete store.jobSessions[jobId]; writeDemo(store); return; }
    await invokeJobInterview({ action: "discard", jobId, sessionId });
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
        employmentType: null, seniority: null, sourceLanguage: null, latestTailoredCV: null,
        applicationStatus: "not_applied", appliedAt: null, applicationStatusChangedAt: null, appliedCV: null,
        templateId: "clarity", createdAt: now, updatedAt: now,
      };
      const store = readDemo(); store.jobs.unshift(job); writeDemo(store); return job;
    }
    const { data, error } = await supabase!.functions.invoke("import-job", { body: input });
    if (error || data?.error) throw new Error(await functionErrorMessage(error, data, "Could not import this job."));
    return rowToJob(data.job);
  },

  async refreshJobParse(jobId: string): Promise<JobRecord> {
    if (!isSupabaseConfigured) {
      const job = readDemo().jobs.find((item) => item.id === jobId);
      if (!job) throw new Error("Job not found.");
      return job;
    }
    const { data, error } = await supabase!.functions.invoke("import-job", { body: { action: "status", jobId } });
    if (error || data?.error) throw new Error(await functionErrorMessage(error, data, "Could not refresh job parsing."));
    return rowToJob(data.job);
  },

  async retryJobParse(jobId: string): Promise<JobRecord> {
    if (!isSupabaseConfigured) {
      const store = readDemo(); const index = store.jobs.findIndex((item) => item.id === jobId);
      if (index < 0) throw new Error("Job not found.");
      store.jobs[index] = { ...store.jobs[index], parseStatus: "completed", parseWarnings: [] };
      writeDemo(store); return store.jobs[index];
    }
    const { data, error } = await supabase!.functions.invoke("import-job", { body: { action: "retry", jobId } });
    if (error || data?.error) throw new Error(await functionErrorMessage(error, data, "Could not retry job parsing."));
    return rowToJob(data.job);
  },

  async saveManualJob(jobId: string, input: { title: string; company: string; description: string }): Promise<JobRecord> {
    if (!isSupabaseConfigured) {
      const store = readDemo(); const index = store.jobs.findIndex((item) => item.id === jobId);
      if (index < 0) throw new Error("Job not found.");
      const current = store.jobs[index];
      const structuredData = {
        schemaVersion: 2 as const, title: input.title,
        company: { displayName: input.company, legalName: null, description: null },
        location: { original: null, city: null, country: null, remotePolicy: "unknown" as const },
        datePosted: null, validThrough: null, employmentType: null, seniority: null,
        compensation: { minimum: null, maximum: null, currency: null, period: null, estimated: false },
        summary: input.description.slice(0, 1400), responsibilities: [],
        requirements: { required: [], preferred: [], skills: [], experience: [], education: [] },
        atsKeywords: [input.title], languages: [], benefits: [], cleanDescription: input.description,
        sourceLanguage: null, warnings: ["Saved manually after automatic parsing could not complete."],
      };
      store.jobs[index] = { ...current, title: input.title, company: input.company, description: input.description, structuredData, parseStatus: "completed", parseWarnings: structuredData.warnings, updatedAt: new Date().toISOString() };
      writeDemo(store); return store.jobs[index];
    }
    const { data, error } = await supabase!.functions.invoke("import-job", { body: { action: "manual", jobId, ...input } });
    if (error || data?.error) throw new Error(await functionErrorMessage(error, data, "Could not save the manual job details."));
    return rowToJob(data.job);
  },

  async tailorJob(job: JobRecord, templateId: CVTemplateId, sessionId?: string): Promise<TailoredCV> {
    if (!isSupabaseConfigured) {
      const store = readDemo();
      const skill = { id: "inferred-ai", text: "Experimentation strategy", visible: true, provenance: { status: "inferred_unconfirmed" as const, sourceRefs: ["job.description"], rationale: "The role emphasizes experimentation; confirm that this reflects your experience." } };
      const cv = tailoredCVSchema.parse({ ...store.baseCV, jobId: job.id, templateId, generatedAt: new Date().toISOString(), summary: { ...store.baseCV.summary, text: `Product operations leader aligning planning, experimentation and customer insight to help ${job.company || "growing teams"} deliver better outcomes.` }, skills: [...store.baseCV.skills, skill] });
      const index = store.jobs.findIndex((item) => item.id === job.id);
      store.jobs[index] = { ...store.jobs[index], latestTailoredCV: cv, templateId, updatedAt: new Date().toISOString() };
      writeDemo(store); await new Promise((resolve) => setTimeout(resolve, 900)); return cv;
    }
    const idempotencyKey = crypto.randomUUID();
    let { data, error } = await supabase!.functions.invoke("tailor-cv", {
      body: { jobId: job.id, templateId, sessionId, idempotencyKey },
      headers: { "idempotency-key": idempotencyKey },
    });
    if (error || data?.error) throw new Error(await functionErrorMessage(error, data, "Tailoring failed."));
    const deadline = Date.now() + 20 * 60 * 1000;
    let transientFailures = 0;
    while (data?.pending && data?.runId) {
      if (Date.now() >= deadline) throw new Error("Your CV is still generating in the background. Return to this job and select Generate tailored CV to resume it.");
      await new Promise((resolve) => window.setTimeout(resolve, data.status === "starting" ? 2_000 : 4_000));
      const polled = await supabase!.functions.invoke("tailor-cv", { body: { action: "status", runId: data.runId } });
      if (polled.error || polled.data?.error) {
        if (transientFailures < 3) {
          transientFailures += 1;
          await new Promise((resolve) => window.setTimeout(resolve, transientFailures * 2_000));
          continue;
        }
        throw new Error(await functionErrorMessage(polled.error, polled.data, "Tailoring failed."));
      }
      transientFailures = 0;
      data = polled.data;
      error = polled.error;
    }
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

  async updateApplication(jobId: string, input: { status: ApplicationStatus; appliedAt?: string | null; cv?: TailoredCV }): Promise<JobRecord> {
    const now = new Date().toISOString();
    if (!isSupabaseConfigured) {
      const store = readDemo(); const index = store.jobs.findIndex((job) => job.id === jobId);
      if (index < 0) throw new Error("Job not found.");
      const current = store.jobs[index]; const applied = input.status !== "not_applied";
      const next: JobRecord = {
        ...current,
        applicationStatus: input.status,
        appliedAt: applied ? input.appliedAt ?? current.appliedAt ?? now : null,
        applicationStatusChangedAt: input.status !== current.applicationStatus ? now : current.applicationStatusChangedAt,
        appliedCV: applied ? current.appliedCV ?? (input.cv ? exportableCV(input.cv) : current.latestTailoredCV ? exportableCV(current.latestTailoredCV) : null) : null,
        updatedAt: now,
      };
      store.jobs[index] = next; writeDemo(store); return next;
    }
    const values: Record<string, unknown> = {
      application_status: input.status,
      applied_at: input.status === "not_applied" ? null : input.appliedAt,
    };
    if (input.status === "not_applied") values.applied_cv = null;
    else if (input.cv) values.applied_cv = exportableCV(input.cv);
    const { data, error } = await supabase!.from("jobs").update(values).eq("id", jobId).select("*").single();
    if (error) throw error;
    return rowToJob(data);
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
