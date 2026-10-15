import type { ReactNode } from "react";
import type { BaseCV, CVTemplateId } from "@cv-maker/shared";

export function CVPreview({ cv, templateId = "clarity" }: { cv: BaseCV; templateId?: CVTemplateId }) {
  const sections: Record<string, ReactNode> = {
    summary: cv.summary.visible && cv.summary.text ? <section><h2>Profile</h2><p>{cv.summary.text}</p></section> : null,
    experience: cv.experience.some((item) => item.visible) ? <section><h2>Experience</h2>{cv.experience.filter((item) => item.visible).map((item) => <article key={item.id} className="resume-entry"><div className="resume-entry-heading"><div><h3>{item.role}</h3><p>{item.company}{item.location ? ` · ${item.location}` : ""}</p></div><span>{item.startDate}–{item.endDate}</span></div><ul>{item.bullets.filter((bullet) => bullet.visible).map((bullet) => <li key={bullet.id} className={bullet.provenance.status === "inferred_unconfirmed" ? "inferred-preview" : ""}>{bullet.text}</li>)}</ul></article>)}</section> : null,
    skills: cv.skills.some((item) => item.visible) ? <section><h2>Skills</h2><div className="resume-skills">{cv.skills.filter((item) => item.visible).map((item) => <span key={item.id} className={item.provenance.status === "inferred_unconfirmed" ? "inferred-preview" : ""}>{item.text}</span>)}</div></section> : null,
    education: cv.education.some((item) => item.visible) ? <section><h2>Education</h2>{cv.education.filter((item) => item.visible).map((item) => <article key={item.id} className="resume-entry"><div className="resume-entry-heading"><div><h3>{item.qualification}</h3><p>{item.institution}</p></div><span>{item.startDate}–{item.endDate}</span></div>{item.details && <p>{item.details}</p>}</article>)}</section> : null,
    projects: cv.projects.some((item) => item.visible) ? <section><h2>Projects</h2>{cv.projects.filter((item) => item.visible).map((item) => <article key={item.id}><h3>{item.name}</h3><p>{item.description}</p></article>)}</section> : null,
    certifications: cv.certifications.some((item) => item.visible) ? <section><h2>Certifications</h2>{cv.certifications.filter((item) => item.visible).map((item) => <p key={item.id}><strong>{item.name}</strong>{item.detail ? ` · ${item.detail}` : ""}</p>)}</section> : null,
    languages: cv.languages.some((item) => item.visible) ? <section><h2>Languages</h2><p>{cv.languages.filter((item) => item.visible).map((item) => `${item.name}${item.detail ? ` (${item.detail})` : ""}`).join(" · ")}</p></section> : null,
  };
  return <div className={`resume-paper ${templateId}`} aria-label="CV preview"><header><h1>{cv.contact.fullName || "Your name"}</h1><p className="resume-headline">{cv.contact.headline}</p><div className="resume-contact">{[cv.contact.email, cv.contact.phone, cv.contact.location, cv.contact.linkedin, cv.contact.website].filter(Boolean).map((item) => <span key={item}>{item}</span>)}</div></header>{cv.sectionOrder.map((key) => <div key={key}>{sections[key]}</div>)}</div>;
}
