import { z } from "zod";

export const SCHEMA_VERSION = 1 as const;

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

export const jobSnapshotSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION).default(SCHEMA_VERSION),
  id: z.string().uuid().optional(),
  url: z.string().max(2000).default(""),
  title: z.string().max(240).default("Untitled role"),
  company: z.string().max(240).default(""),
  description: z.string().min(1).max(100_000),
  captureMethod: z.enum(["url", "paste", "extension"]),
  capturedAt: z.string().datetime().optional(),
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
export type JobSnapshot = z.infer<typeof jobSnapshotSchema>;
export type TailoredCV = z.infer<typeof tailoredCVSchema>;
export type QuotaState = z.infer<typeof quotaStateSchema>;
export type CVTemplateId = z.infer<typeof cvTemplateIdSchema>;

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
