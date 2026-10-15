import type { ReactNode } from "react";
import {
  calculateExperienceMonths, formatExperienceDate, formatExperienceDuration,
  type BaseCV, type CVTemplateId,
} from "@cv-maker/shared";

const dates = (start: string, end: string) => [formatExperienceDate(start, "start"), formatExperienceDate(end, "end")].filter(Boolean).join(" – ");

export function CVPreview({ cv, templateId = "clarity" }: { cv: BaseCV; templateId?: CVTemplateId }) {
  const sections: Record<string, ReactNode> = {
    summary: cv.summary.visible && cv.summary.text ? <section><h2>Profile</h2><p className="resume-summary">{cv.summary.text}</p></section> : null,
    experience: cv.experience.some((item) => item.visible) ? <section><h2>Experience</h2>{cv.experience.filter((item) => item.visible).map((item) => <article key={item.id} className="resume-entry"><div className="resume-entry-heading"><div><h3>{item.role || "Role"}</h3><p>{item.company || "Company"}{item.location ? ` · ${item.location}` : ""}</p></div><span>{dates(item.startDate, item.endDate)}</span></div>{item.bullets.some((bullet) => bullet.visible && bullet.text) && <ul>{item.bullets.filter((bullet) => bullet.visible && bullet.text).map((bullet) => <li key={bullet.id} className={bullet.provenance.status === "inferred_unconfirmed" ? "inferred-preview" : ""}>{bullet.text}</li>)}</ul>}</article>)}</section> : null,
    skills: cv.skills.some((item) => item.visible && item.text) ? <section><h2>Core skills</h2><div className="resume-skills">{cv.skills.filter((item) => item.visible && item.text).map((item) => <span key={item.id} className={item.provenance.status === "inferred_unconfirmed" ? "inferred-preview" : ""}>{item.text}</span>)}</div></section> : null,
    education: cv.education.some((item) => item.visible) ? <section><h2>Education</h2>{cv.education.filter((item) => item.visible).map((item) => <article key={item.id} className="resume-entry"><div className="resume-entry-heading"><div><h3>{item.qualification || "Qualification"}</h3><p>{item.institution}</p></div><span>{dates(item.startDate, item.endDate)}</span></div>{item.details && <p>{item.details}</p>}</article>)}</section> : null,
    projects: cv.projects.some((item) => item.visible) ? <section><h2>Selected projects</h2>{cv.projects.filter((item) => item.visible).map((item) => <article key={item.id} className="resume-entry"><h3>{item.name}</h3>{item.description && <p>{item.description}</p>}{item.link && <p className="resume-link">{item.link}</p>}</article>)}</section> : null,
    certifications: cv.certifications.some((item) => item.visible) ? <section><h2>Certifications</h2><div className="resume-list-grid">{cv.certifications.filter((item) => item.visible).map((item) => <p key={item.id}><strong>{item.name}</strong>{item.detail ? <span>{item.detail}</span> : null}</p>)}</div></section> : null,
    languages: cv.languages.some((item) => item.visible) ? <section><h2>Languages</h2><div className="resume-list-grid">{cv.languages.filter((item) => item.visible).map((item) => <p key={item.id}><strong>{item.name}</strong>{item.detail ? <span>{item.detail}</span> : null}</p>)}</div></section> : null,
  };
  cv.customSections.forEach((section) => {
    sections[section.id] = section.visible && section.items.some((item) => item.visible && item.text) ? <section><h2>{section.title}</h2><ul>{section.items.filter((item) => item.visible && item.text).map((item) => <li key={item.id}>{item.text}</li>)}</ul></section> : null;
  });
  const contact = [cv.contact.email, cv.contact.phone, cv.contact.location, cv.contact.linkedin, cv.contact.website].filter(Boolean);
  const totalExperience = formatExperienceDuration(calculateExperienceMonths(cv));

  return <article className={`resume-paper ${templateId}`} aria-label="CV preview">
    <header className="resume-header"><div className="resume-identity"><h1>{cv.contact.fullName || "Your name"}</h1><p className="resume-headline">{cv.contact.headline || "Professional headline"}</p><div className="resume-contact">{contact.map((item) => <span key={item}>{item}</span>)}</div>{totalExperience && <p className="resume-experience-total">{totalExperience} total experience</p>}</div>{cv.photo?.visible && <img className="resume-photo" src={cv.photo.dataUrl} style={{ objectPosition: `${cv.photo.positionX ?? 50}% ${cv.photo.positionY ?? 50}%` }} alt={`${cv.contact.fullName || "Candidate"} profile`} />}</header>
    <div className="resume-rule" />
    {cv.sectionOrder.map((key) => <div key={key}>{sections[key]}</div>)}
  </article>;
}
