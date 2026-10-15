import { z } from "npm:zod@3.24.2";

const provenance = z.object({
  status: z.enum(["verified", "inferred_unconfirmed", "confirmed_by_user"]),
  sourceRefs: z.array(z.string()),
  rationale: z.string().optional(),
});

const textItem = z.object({
  id: z.string(), text: z.string(), visible: z.boolean(), provenance,
});

const experience = z.object({
  id: z.string(), company: z.string(), role: z.string(), location: z.string(),
  startDate: z.string(), endDate: z.string(), visible: z.boolean(), bullets: z.array(textItem),
});

const education = z.object({
  id: z.string(), institution: z.string(), qualification: z.string(), startDate: z.string(),
  endDate: z.string(), details: z.string(), visible: z.boolean(),
});

const labelled = z.object({
  id: z.string(), name: z.string(), detail: z.string(), visible: z.boolean(), provenance,
});

const project = z.object({
  id: z.string(), name: z.string(), link: z.string(), description: z.string(), visible: z.boolean(), provenance,
});

const customSection = z.object({
  id: z.string(), title: z.string(), visible: z.boolean(), items: z.array(textItem),
});

export const cvSchema = z.object({
  schemaVersion: z.literal(1),
  contact: z.object({
    fullName: z.string(), headline: z.string(), email: z.string(), phone: z.string(), location: z.string(),
    website: z.string(), linkedin: z.string(),
  }),
  summary: textItem,
  experience: z.array(experience),
  education: z.array(education),
  skills: z.array(textItem),
  projects: z.array(project),
  certifications: z.array(labelled),
  languages: z.array(labelled),
  customSections: z.array(customSection),
  sectionOrder: z.array(z.string()),
});

const profilePhoto = z.object({
  dataUrl: z.string().max(750_000), fileName: z.string(), visible: z.boolean(),
});

export const storedCVSchema = cvSchema.extend({ photo: profilePhoto.nullable().optional() });

export const tailoredSchema = storedCVSchema.extend({
  jobId: z.string().uuid(),
  templateId: z.enum(["clarity", "compact"]),
  generatedAt: z.string().datetime(),
});

const nullableString = z.string().nullable();

export const jobStructuredSchema = z.object({
  schemaVersion: z.literal(2),
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
  datePosted: nullableString,
  validThrough: nullableString,
  employmentType: z.string().max(160).nullable(),
  seniority: z.string().max(160).nullable(),
  compensation: z.object({
    minimum: z.number().nullable(),
    maximum: z.number().nullable(),
    currency: z.string().max(12).nullable(),
    period: z.enum(["hour", "day", "month", "year"]).nullable(),
    estimated: z.boolean(),
  }),
  summary: z.string().max(4000),
  responsibilities: z.array(z.string().max(1500)).max(40),
  requirements: z.object({
    required: z.array(z.string().max(1500)).max(60),
    preferred: z.array(z.string().max(1500)).max(40),
    skills: z.array(z.string().max(240)).max(80),
    experience: z.array(z.string().max(1000)).max(30),
    education: z.array(z.string().max(1000)).max(20),
  }),
  languages: z.array(z.object({ name: z.string().max(120), level: z.string().max(120).nullable() })).max(30),
  benefits: z.array(z.string().max(1000)).max(40),
  cleanDescription: z.string().min(1).max(100_000),
  sourceLanguage: z.string().max(80).nullable(),
  warnings: z.array(z.string().max(500)).max(30),
});

const nullableJsonString = { type: ["string", "null"] };

export const jobStructuredJsonSchema = {
  type: "object", additionalProperties: false,
  properties: {
    schemaVersion: { type: "integer", enum: [2] },
    title: { type: "string" },
    company: {
      type: "object", additionalProperties: false,
      properties: {
        displayName: { type: "string" }, legalName: nullableJsonString, description: nullableJsonString,
      },
      required: ["displayName", "legalName", "description"],
    },
    location: {
      type: "object", additionalProperties: false,
      properties: {
        original: nullableJsonString, city: nullableJsonString, country: nullableJsonString,
        remotePolicy: { type: "string", enum: ["remote", "hybrid", "onsite", "unknown"] },
      },
      required: ["original", "city", "country", "remotePolicy"],
    },
    datePosted: nullableJsonString,
    validThrough: nullableJsonString,
    employmentType: nullableJsonString,
    seniority: nullableJsonString,
    compensation: {
      type: "object", additionalProperties: false,
      properties: {
        minimum: { type: ["number", "null"] }, maximum: { type: ["number", "null"] },
        currency: nullableJsonString,
        period: { anyOf: [{ type: "string", enum: ["hour", "day", "month", "year"] }, { type: "null" }] },
        estimated: { type: "boolean" },
      },
      required: ["minimum", "maximum", "currency", "period", "estimated"],
    },
    summary: { type: "string" },
    responsibilities: { type: "array", items: { type: "string" } },
    requirements: {
      type: "object", additionalProperties: false,
      properties: Object.fromEntries(["required", "preferred", "skills", "experience", "education"].map((key) => [key, { type: "array", items: { type: "string" } }])),
      required: ["required", "preferred", "skills", "experience", "education"],
    },
    languages: {
      type: "array", items: {
        type: "object", additionalProperties: false,
        properties: { name: { type: "string" }, level: nullableJsonString }, required: ["name", "level"],
      },
    },
    benefits: { type: "array", items: { type: "string" } },
    cleanDescription: { type: "string" },
    sourceLanguage: nullableJsonString,
    warnings: { type: "array", items: { type: "string" } },
  },
  required: [
    "schemaVersion", "title", "company", "location", "datePosted", "validThrough", "employmentType",
    "seniority", "compensation", "summary", "responsibilities", "requirements", "languages", "benefits",
    "cleanDescription", "sourceLanguage", "warnings",
  ],
};

const provenanceJson = {
  type: "object", additionalProperties: false,
  properties: {
    status: { type: "string", enum: ["verified", "inferred_unconfirmed"] },
    sourceRefs: { type: "array", items: { type: "string" } },
    rationale: { type: "string" },
  }, required: ["status", "sourceRefs", "rationale"],
};

const textItemJson = {
  type: "object", additionalProperties: false,
  properties: {
    id: { type: "string" }, text: { type: "string" }, visible: { type: "boolean" }, provenance: provenanceJson,
  }, required: ["id", "text", "visible", "provenance"],
};

export const cvJsonSchema = {
  type: "object", additionalProperties: false,
  properties: {
    schemaVersion: { type: "integer", enum: [1] },
    contact: {
      type: "object", additionalProperties: false,
      properties: Object.fromEntries(["fullName", "headline", "email", "phone", "location", "website", "linkedin"].map((key) => [key, { type: "string" }])),
      required: ["fullName", "headline", "email", "phone", "location", "website", "linkedin"],
    },
    summary: textItemJson,
    experience: { type: "array", items: {
      type: "object", additionalProperties: false,
      properties: {
        id: { type: "string" }, company: { type: "string" }, role: { type: "string" }, location: { type: "string" },
        startDate: { type: "string" }, endDate: { type: "string" }, visible: { type: "boolean" },
        bullets: { type: "array", items: textItemJson },
      }, required: ["id", "company", "role", "location", "startDate", "endDate", "visible", "bullets"],
    } },
    education: { type: "array", items: {
      type: "object", additionalProperties: false,
      properties: {
        id: { type: "string" }, institution: { type: "string" }, qualification: { type: "string" },
        startDate: { type: "string" }, endDate: { type: "string" }, details: { type: "string" }, visible: { type: "boolean" },
      }, required: ["id", "institution", "qualification", "startDate", "endDate", "details", "visible"],
    } },
    skills: { type: "array", items: textItemJson },
    projects: { type: "array", items: {
      type: "object", additionalProperties: false,
      properties: { id: { type: "string" }, name: { type: "string" }, link: { type: "string" }, description: { type: "string" }, visible: { type: "boolean" }, provenance: provenanceJson },
      required: ["id", "name", "link", "description", "visible", "provenance"],
    } },
    certifications: { type: "array", items: {
      type: "object", additionalProperties: false,
      properties: { id: { type: "string" }, name: { type: "string" }, detail: { type: "string" }, visible: { type: "boolean" }, provenance: provenanceJson },
      required: ["id", "name", "detail", "visible", "provenance"],
    } },
    languages: { type: "array", items: {
      type: "object", additionalProperties: false,
      properties: { id: { type: "string" }, name: { type: "string" }, detail: { type: "string" }, visible: { type: "boolean" }, provenance: provenanceJson },
      required: ["id", "name", "detail", "visible", "provenance"],
    } },
    customSections: { type: "array", items: {
      type: "object", additionalProperties: false,
      properties: { id: { type: "string" }, title: { type: "string" }, visible: { type: "boolean" }, items: { type: "array", items: textItemJson } },
      required: ["id", "title", "visible", "items"],
    } },
    sectionOrder: { type: "array", items: { type: "string" } },
  },
  required: ["schemaVersion", "contact", "summary", "experience", "education", "skills", "projects", "certifications", "languages", "customSections", "sectionOrder"],
};

export const tailoredJsonSchema = {
  ...cvJsonSchema,
  properties: {
    ...cvJsonSchema.properties,
    jobId: { type: "string", format: "uuid" },
    templateId: { type: "string", enum: ["clarity", "compact"] },
    generatedAt: { type: "string" },
  },
  required: [...cvJsonSchema.required, "jobId", "templateId", "generatedAt"],
};
