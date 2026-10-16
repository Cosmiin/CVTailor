import { z } from "zod";

export const SCHEMA_VERSION = 1 as const;
export const JOB_SCHEMA_VERSION = 2 as const;
export const EXPERIENCE_ENRICHMENT_SCHEMA_VERSION = 1 as const;

// Postgres/Supabase timestamps use explicit offsets (for example `+00:00`).
// Accept those as well as the `Z` form produced by Date#toISOString.
const enrichmentTimestampSchema = z.string().datetime({ offset: true });

export const provenanceStatusSchema = z.enum([
  "verified",
  "inferred_unconfirmed",
  "confirmed_by_user",
]);

export const provenanceSchema = z.object({
  status: provenanceStatusSchema.default("verified"),
  sourceRefs: z.array(z.string().max(120)).default([]),
  rationale: z.string().max(500).optional(),
});

export const textItemSchema = z.object({
  id: z.string().min(1).max(120),
  text: z.string().max(1500),
  visible: z.boolean().default(true),
  provenance: provenanceSchema.default({ status: "verified", sourceRefs: [] }),
});

export const contactSchema = z.object({
  fullName: z.string().max(120).default(""),
  headline: z.string().max(160).default(""),
  email: z.string().max(200).default(""),
  phone: z.string().max(60).default(""),
  location: z.string().max(160).default(""),
  website: z.string().max(300).default(""),
  linkedin: z.string().max(300).default(""),
});

export const profilePhotoSchema = z.object({
  dataUrl: z.string().max(750_000),
  fileName: z.string().max(240).default("profile-photo.jpg"),
  visible: z.boolean().default(true),
  positionX: z.number().min(0).max(100).default(50),
  positionY: z.number().min(0).max(100).default(50),
  zoom: z.number().min(1).max(3).default(1.15),
});

export const experienceSchema = z.object({
  id: z.string().min(1).max(120),
  company: z.string().max(160).default(""),
  role: z.string().max(160).default(""),
  location: z.string().max(160).default(""),
  startDate: z.string().max(40).default(""),
  endDate: z.string().max(40).default(""),
  visible: z.boolean().default(true),
  bullets: z.array(textItemSchema).max(20).default([]),
});

export const experienceInterviewOptionSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(240),
});

export const experienceInterviewQuestionSchema = z.object({
  id: z.string().min(1).max(80),
  prompt: z.string().min(1).max(600),
  type: z.enum(["single", "multiple"]),
  options: z.array(experienceInterviewOptionSchema).min(2).max(8),
  rationale: z.string().max(300).default(""),
});

export const experienceInterviewAnswerSchema = z.object({
  questionId: z.string().min(1).max(80),
  selectedOptionIds: z.array(z.string().min(1).max(80)).min(1).max(8),
  note: z.string().max(1500).default(""),
});

export const experienceInterviewDraftSchema = z.object({
  schemaVersion: z.literal(EXPERIENCE_ENRICHMENT_SCHEMA_VERSION),
  sourceFingerprint: z.string().min(1).max(80),
  questions: z.array(experienceInterviewQuestionSchema).min(5).max(10),
  answers: z.array(experienceInterviewAnswerSchema).max(10).default([]),
  currentIndex: z.number().int().min(0).max(9).default(0),
  startedAt: enrichmentTimestampSchema,
  updatedAt: enrichmentTimestampSchema,
});

const contextList = z.array(z.string().min(1).max(500)).max(12).default([]);

export const experienceContextSkillSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(80).refine((value) => value.trim().split(/\s+/).length <= 3, "Skill names must contain at most three words."),
  evidence: z.string().min(1).max(500),
  sourceQuestionIds: z.array(z.string().min(1).max(80)).min(1).max(10),
});

export const experienceContextSchema = z.object({
  schemaVersion: z.literal(EXPERIENCE_ENRICHMENT_SCHEMA_VERSION),
  overview: z.string().min(1).max(1200),
  responsibilities: contextList,
  methods: contextList,
  tools: contextList,
  scope: contextList,
  domains: contextList,
  outcomes: contextList,
  skills: z.array(experienceContextSkillSchema).min(5).max(6),
});

export const approvedExperienceContextSchema = z.object({
  sourceFingerprint: z.string().min(1).max(80),
  context: experienceContextSchema,
  questions: z.array(experienceInterviewQuestionSchema).min(5).max(10),
  answers: z.array(experienceInterviewAnswerSchema).min(5).max(10),
  approvedAt: enrichmentTimestampSchema,
});

export const experienceEnrichmentSchema = z.object({
  experienceId: z.string().min(1).max(120),
  active: approvedExperienceContextSchema.nullable().default(null),
  draft: experienceInterviewDraftSchema.nullable().default(null),
  pending: experienceContextSchema.nullable().default(null),
  createdAt: enrichmentTimestampSchema,
  updatedAt: enrichmentTimestampSchema,
});

export const educationSchema = z.object({
  id: z.string().min(1).max(120),
  institution: z.string().max(180).default(""),
  qualification: z.string().max(180).default(""),
  startDate: z.string().max(40).default(""),
  endDate: z.string().max(40).default(""),
  details: z.string().max(800).default(""),
  visible: z.boolean().default(true),
});

export const projectSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().max(180).default(""),
  link: z.string().max(300).default(""),
  description: z.string().max(1000).default(""),
  visible: z.boolean().default(true),
  provenance: provenanceSchema.default({ status: "verified", sourceRefs: [] }),
});

export const labelledItemSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().max(180).default(""),
  detail: z.string().max(500).default(""),
  visible: z.boolean().default(true),
  provenance: provenanceSchema.default({ status: "verified", sourceRefs: [] }),
});

export const customSectionSchema = z.object({
  id: z.string().min(1).max(120),
  title: z.string().min(1).max(80),
  visible: z.boolean().default(true),
  items: z.array(textItemSchema).max(30).default([]),
});

export const baseCVSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION).default(SCHEMA_VERSION),
  contact: contactSchema.default({}),
  photo: profilePhotoSchema.nullable().default(null),
  summary: textItemSchema.default({ id: "summary", text: "", visible: true }),
  experience: z.array(experienceSchema).max(30).default([]),
  education: z.array(educationSchema).max(20).default([]),
  skills: z.array(textItemSchema).max(100).default([]),
  projects: z.array(projectSchema).max(30).default([]),
  certifications: z.array(labelledItemSchema).max(30).default([]),
  languages: z.array(labelledItemSchema).max(30).default([]),
  customSections: z.array(customSectionSchema).max(20).default([]),
  sectionOrder: z
    .array(z.string())
    .default(["summary", "experience", "skills", "education", "projects", "certifications", "languages"]),
});

export const jobCompensationSchema = z.object({
  minimum: z.number().nullable(),
  maximum: z.number().nullable(),
  currency: z.string().max(12).nullable(),
  period: z.enum(["hour", "day", "month", "year"]).nullable(),
  estimated: z.boolean(),
});

export const jobStructuredDataSchema = z.object({
  schemaVersion: z.literal(JOB_SCHEMA_VERSION).default(JOB_SCHEMA_VERSION),
  title: z.string().min(1).max(240),
  company: z.object({
    displayName: z.string().max(240),
    legalName: z.string().max(240).nullable(),
    description: z.string().max(4000).nullable(),
  }),
  location: z.object({
    original: z.string().max(500).nullable(),
    city: z.string().max(160).nullable(),
    country: z.string().max(160).nullable(),
    remotePolicy: z.enum(["remote", "hybrid", "onsite", "unknown"]),
  }),
  datePosted: z.string().nullable(),
  validThrough: z.string().nullable(),
  employmentType: z.string().max(160).nullable(),
  seniority: z.string().max(160).nullable(),
  compensation: jobCompensationSchema,
  summary: z.string().max(4000),
  responsibilities: z.array(z.string().max(1500)).max(40),
  requirements: z.object({
    required: z.array(z.string().max(1500)).max(60),
    preferred: z.array(z.string().max(1500)).max(40),
    skills: z.array(z.string().max(240)).max(80),
    experience: z.array(z.string().max(1000)).max(30),
    education: z.array(z.string().max(1000)).max(20),
  }),
  languages: z.array(z.object({
    name: z.string().max(120),
    level: z.string().max(120).nullable(),
  })).max(30),
  benefits: z.array(z.string().max(1000)).max(40),
  cleanDescription: z.string().min(1).max(100_000),
  sourceLanguage: z.string().max(80).nullable(),
  warnings: z.array(z.string().max(500)).max(30),
});

export const jobSnapshotSchema = z.object({
  schemaVersion: z.literal(JOB_SCHEMA_VERSION).default(JOB_SCHEMA_VERSION),
  id: z.string().uuid().optional(),
  url: z.string().max(2000).default(""),
  title: z.string().max(240).default("Untitled role"),
  company: z.string().max(240).default(""),
  description: z.string().min(1).max(100_000),
  captureMethod: z.enum(["url", "paste", "extension"]),
  capturedAt: z.string().datetime().optional(),
  structuredData: jobStructuredDataSchema.nullable().default(null),
  parseStatus: z.enum(["pending", "completed", "failed"]).default("pending"),
  parseWarnings: z.array(z.string().max(500)).default([]),
  location: z.string().max(500).default(""),
  datePosted: z.string().nullable().default(null),
  employmentType: z.string().max(160).nullable().default(null),
  seniority: z.string().max(160).nullable().default(null),
  sourceLanguage: z.string().max(80).nullable().default(null),
});

export const cvTemplateIdSchema = z.enum(["clarity", "compact"]);

export const tailoredCVSchema = baseCVSchema.extend({
  jobId: z.string().uuid().optional(),
  templateId: cvTemplateIdSchema.default("clarity"),
  generatedAt: z.string().datetime(),
});

export const quotaStateSchema = z.object({
  limit: z.number().int().min(0),
  used: z.number().int().min(0),
  reserved: z.number().int().min(0).default(0),
  remaining: z.number().int().min(0),
  resetsAt: z.string().datetime(),
  disabled: z.boolean().default(false),
});

export type ProvenanceStatus = z.infer<typeof provenanceStatusSchema>;
export type TailoredItemProvenance = z.infer<typeof provenanceSchema>;
export type TextItem = z.infer<typeof textItemSchema>;
export type BaseCV = z.infer<typeof baseCVSchema>;
export type JobStructuredData = z.infer<typeof jobStructuredDataSchema>;
export type JobSnapshot = z.infer<typeof jobSnapshotSchema>;
export type TailoredCV = z.infer<typeof tailoredCVSchema>;
export type QuotaState = z.infer<typeof quotaStateSchema>;
export type CVTemplateId = z.infer<typeof cvTemplateIdSchema>;
export type ExperienceInterviewOption = z.infer<typeof experienceInterviewOptionSchema>;
export type ExperienceInterviewQuestion = z.infer<typeof experienceInterviewQuestionSchema>;
export type ExperienceInterviewAnswer = z.infer<typeof experienceInterviewAnswerSchema>;
export type ExperienceInterviewDraft = z.infer<typeof experienceInterviewDraftSchema>;
export type ExperienceContextSkill = z.infer<typeof experienceContextSkillSchema>;
export type ExperienceContext = z.infer<typeof experienceContextSchema>;
export type ApprovedExperienceContext = z.infer<typeof approvedExperienceContextSchema>;
export type ExperienceEnrichment = z.infer<typeof experienceEnrichmentSchema>;

export const createId = (prefix = "item") =>
  `${prefix}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;

export const emptyBaseCV = (): BaseCV =>
  baseCVSchema.parse({
    schemaVersion: 1,
    contact: {},
    summary: { id: "summary", text: "", visible: true },
  });

export const hasUnconfirmedClaims = (cv: BaseCV): boolean => {
  const inferred = (status?: ProvenanceStatus) => status === "inferred_unconfirmed";
  return (
    inferred(cv.summary.provenance.status) ||
    cv.experience.some((item) => item.bullets.some((bullet) => inferred(bullet.provenance.status))) ||
    cv.skills.some((item) => inferred(item.provenance.status)) ||
    cv.projects.some((item) => inferred(item.provenance.status)) ||
    cv.certifications.some((item) => inferred(item.provenance.status)) ||
    cv.languages.some((item) => inferred(item.provenance.status)) ||
    cv.customSections.some((section) => section.items.some((item) => inferred(item.provenance.status)))
  );
};

export const exportableCV = <T extends BaseCV>(cv: T): T => {
  const keep = <U extends { provenance: TailoredItemProvenance }>(item: U) =>
    item.provenance.status !== "inferred_unconfirmed";
  return {
    ...cv,
    experience: cv.experience.map((item) => ({ ...item, bullets: item.bullets.filter(keep) })),
    skills: cv.skills.filter(keep),
    projects: cv.projects.filter(keep),
    certifications: cv.certifications.filter(keep),
    languages: cv.languages.filter(keep),
    customSections: cv.customSections.map((section) => ({ ...section, items: section.items.filter(keep) })),
  };
};

export const normalizeText = (value: string, maxLength = 100_000) =>
  value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);

export const experienceFingerprint = (experience: Pick<z.infer<typeof experienceSchema>, "company" | "role" | "location" | "startDate" | "endDate" | "bullets">): string => {
  const source = JSON.stringify({
    company: normalizeText(experience.company, 160),
    role: normalizeText(experience.role, 160),
    location: normalizeText(experience.location, 160),
    startDate: experience.startDate.trim(),
    endDate: experience.endDate.trim(),
    bullets: experience.bullets.map((item) => ({ text: normalizeText(item.text, 1500), visible: item.visible })),
  });
  let hash = 2166136261;
  for (let index = 0; index < source.length; index++) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `v1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

const experienceMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const monthLookup = new Map(experienceMonths.map((month, index) => [month.toLowerCase(), index]));

export const parseExperienceMonth = (value: string, boundary: "start" | "end" = "start"): number | null => {
  const normalized = value.trim();
  if (!normalized) return null;
  const now = new Date();
  if (/^(present|current|now|persent)$/i.test(normalized)) return now.getFullYear() * 12 + now.getMonth();
  const iso = normalized.match(/^(\d{4})-(\d{2})$/);
  if (iso) {
    const month = Number(iso[2]);
    return month >= 1 && month <= 12 ? Number(iso[1]) * 12 + month - 1 : null;
  }
  const named = normalized.match(/^([A-Za-z]{3,9})\s+(\d{4})$/);
  if (named) {
    const month = monthLookup.get(named[1].slice(0, 3).toLowerCase());
    return month === undefined ? null : Number(named[2]) * 12 + month;
  }
  const year = normalized.match(/^(\d{4})$/);
  return year ? Number(year[1]) * 12 + (boundary === "end" ? 11 : 0) : null;
};

export const toExperienceMonthInput = (value: string, boundary: "start" | "end" = "start"): string => {
  if (/^(present|current|now|persent)$/i.test(value.trim())) return "";
  const month = parseExperienceMonth(value, boundary);
  if (month === null) return "";
  return `${Math.floor(month / 12)}-${String(month % 12 + 1).padStart(2, "0")}`;
};

export const isPresentExperienceDate = (value: string) => /^(present|current|now|persent)$/i.test(value.trim());

export const formatExperienceDate = (value: string, boundary: "start" | "end" = "start"): string => {
  if (isPresentExperienceDate(value)) return "Present";
  const month = parseExperienceMonth(value, boundary);
  return month === null ? value : `${experienceMonths[month % 12]} ${Math.floor(month / 12)}`;
};

export const calculateExperienceMonths = (cv: Pick<BaseCV, "experience">, now = new Date()): number => {
  const currentMonth = now.getFullYear() * 12 + now.getMonth();
  const worked = new Set<number>();
  cv.experience.filter((item) => item.visible).forEach((item) => {
    const start = parseExperienceMonth(item.startDate, "start");
    const parsedEnd = parseExperienceMonth(item.endDate, "end");
    const end = isPresentExperienceDate(item.endDate) ? currentMonth : parsedEnd;
    if (start === null || end === null || end < start) return;
    for (let month = start; month <= Math.min(end, currentMonth); month++) worked.add(month);
  });
  return worked.size;
};

export const calculateRoleExperienceMonths = (
  experience: Pick<z.infer<typeof experienceSchema>, "startDate" | "endDate">,
  now = new Date(),
): number => {
  const currentMonth = now.getFullYear() * 12 + now.getMonth();
  const start = parseExperienceMonth(experience.startDate, "start");
  const parsedEnd = parseExperienceMonth(experience.endDate, "end");
  const end = isPresentExperienceDate(experience.endDate) ? currentMonth : parsedEnd;
  if (start === null || end === null || start > currentMonth || end < start) return 0;
  return Math.min(end, currentMonth) - start + 1;
};

export const formatExperienceDuration = (months: number): string => {
  if (months <= 0) return "";
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  return [years ? `${years} ${years === 1 ? "year" : "years"}` : "", remainder ? `${remainder} ${remainder === 1 ? "month" : "months"}` : ""].filter(Boolean).join(" ");
};

export const demoCV: BaseCV = baseCVSchema.parse({
  schemaVersion: 1,
  contact: {
    fullName: "Alex Morgan",
    headline: "Product Operations Lead",
    email: "alex@example.com",
    phone: "+44 20 0000 0000",
    location: "London, UK",
    linkedin: "linkedin.com/in/alexmorgan",
  },
  summary: {
    id: "summary",
    text: "Operations leader who turns complex customer and product signals into focused systems, clear decisions, and measurable improvements.",
    visible: true,
    provenance: { status: "verified", sourceRefs: ["base.summary"] },
  },
  experience: [
    {
      id: "exp-1",
      company: "Northstar Labs",
      role: "Product Operations Lead",
      location: "London",
      startDate: "2022",
      endDate: "Present",
      visible: true,
      bullets: [
        {
          id: "bullet-1",
          text: "Introduced a quarterly planning system used by six cross-functional teams, reducing duplicated work and improving delivery visibility.",
          visible: true,
          provenance: { status: "verified", sourceRefs: ["base.experience.0"] },
        },
        {
          id: "bullet-2",
          text: "Built an experimentation intake process that shortened the path from customer insight to validated product decision.",
          visible: true,
          provenance: { status: "verified", sourceRefs: ["base.experience.0"] },
        },
      ],
    },
    {
      id: "exp-2",
      company: "Foundry Works",
      role: "Senior Operations Manager",
      location: "Manchester",
      startDate: "2019",
      endDate: "2022",
      visible: true,
      bullets: [
        {
          id: "bullet-3",
          text: "Led operational reviews across a portfolio of B2B services and translated findings into owner-based improvement plans.",
          visible: true,
          provenance: { status: "verified", sourceRefs: ["base.experience.1"] },
        },
      ],
    },
  ],
  education: [
    {
      id: "edu-1",
      institution: "University of Manchester",
      qualification: "BSc Business Management",
      startDate: "2015",
      endDate: "2018",
      details: "First-class honours",
      visible: true,
    },
  ],
  skills: ["Product operations", "Process design", "Stakeholder alignment", "Data analysis"].map((text, index) => ({
    id: `skill-${index}`,
    text,
    visible: true,
    provenance: { status: "verified", sourceRefs: ["base.skills"] },
  })),
  projects: [],
  certifications: [],
  languages: [],
  customSections: [],
});
