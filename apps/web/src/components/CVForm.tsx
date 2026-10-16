import { useRef, type PointerEvent } from "react";
import {
  ArrowDown, ArrowUp, BookOpen, BriefcaseBusiness, Camera, ChevronRight, FileBadge,
  FolderKanban, Globe2, Languages, LayoutDashboard, PencilLine, Plus, Sparkles,
  Trash2, UserRound, X,
} from "lucide-react";
import {
  calculateExperienceMonths, createId, formatExperienceDuration, isPresentExperienceDate,
  toExperienceMonthInput, type BaseCV, type ExperienceEnrichment, type TailoredItemProvenance,
} from "@cv-maker/shared";
import { prepareProfilePhoto } from "../lib/photo";
import { ExperienceContextPanel } from "./ExperienceInterview";

type Props = {
  cv: BaseCV;
  onChange: (cv: BaseCV) => void;
  baseMode?: boolean;
  enrichments?: Record<string, ExperienceEnrichment>;
  onOpenInterview?: (experienceId: string) => void;
  onConfirmContext?: (experienceId: string) => void;
  onDeleteContext?: (experienceId: string) => void;
};
const verified = (source = "user.edit"): TailoredItemProvenance => ({ status: "verified", sourceRefs: [source] });
const clampPosition = (value: number) => Math.max(0, Math.min(100, value));

function PhotoPositioner({ cv, onChange }: Props) {
  const drag = useRef<{ clientX: number; clientY: number; positionX: number; positionY: number } | null>(null);
  if (!cv.photo) return <div className="photo-editor-preview"><UserRound /></div>;
  const positionX = cv.photo.positionX ?? 50;
  const positionY = cv.photo.positionY ?? 50;
  const update = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const nextX = clampPosition(drag.current.positionX - (event.clientX - drag.current.clientX) / bounds.width * 100);
    const nextY = clampPosition(drag.current.positionY - (event.clientY - drag.current.clientY) / bounds.height * 100);
    onChange({ ...cv, photo: { ...cv.photo!, positionX: nextX, positionY: nextY } });
  };
  return <div
    className={`photo-editor-preview is-positionable ${cv.photo.visible ? "" : "muted"}`}
    role="application"
    aria-label="Drag the profile photo to position the face"
    onPointerDown={(event) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { clientX: event.clientX, clientY: event.clientY, positionX, positionY };
    }}
    onPointerMove={update}
    onPointerUp={(event) => { event.currentTarget.releasePointerCapture(event.pointerId); drag.current = null; }}
    onPointerCancel={() => { drag.current = null; }}
  ><img src={cv.photo.dataUrl} alt="CV profile" draggable={false} style={{ objectPosition: `${positionX}% ${positionY}%` }} /><span>Drag to center</span></div>;
}

export function CVForm({ cv, onChange, baseMode = false, enrichments = {}, onOpenInterview, onConfirmContext, onDeleteContext }: Props) {
  const updateContact = (key: keyof BaseCV["contact"], value: string) => onChange({ ...cv, contact: { ...cv.contact, [key]: value } });
  const moveSection = (index: number, direction: number) => {
    const next = [...cv.sectionOrder]; const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange({ ...cv, sectionOrder: next });
  };
  const setPhoto = async (file?: File) => {
    if (!file) return;
    const dataUrl = await prepareProfilePhoto(file);
    onChange({ ...cv, photo: { dataUrl, fileName: file.name, visible: true, positionX: 50, positionY: 50 } });
  };
  const sectionLabel = (key: string) => cv.customSections.find((item) => item.id === key)?.title || key;
  const totalExperience = formatExperienceDuration(calculateExperienceMonths(cv));

  return <div className="cv-form">
    <details open><summary><span><UserRound size={17} />Identity & contact</span><ChevronRight /></summary><div className="details-body">
      <div className="photo-editor">
        <PhotoPositioner cv={cv} onChange={onChange} baseMode={baseMode} />
        <div><strong>Profile photo</strong><p>{cv.photo ? "Drag the photo to center your face. The same position is used for square and circular CV photos." : "Add a profile photo to reuse it in every tailored CV."}</p><div className="inline-actions"><label className="button button-small button-ghost file-button"><Camera size={14} />{cv.photo ? "Replace" : "Add photo"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setPhoto(event.target.files?.[0]).catch((error) => alert(error.message))} /></label>{cv.photo && <><button className="button button-small button-ghost" onClick={() => onChange({ ...cv, photo: { ...cv.photo!, visible: !cv.photo!.visible } })}>{cv.photo.visible ? "Hide on CV" : "Show on CV"}</button><button className="icon-button danger" aria-label="Remove photo" onClick={() => onChange({ ...cv, photo: null })}><Trash2 size={15} /></button></>}</div></div>
      </div>
      <div className="form-grid contact-grid"><label>Full name<input value={cv.contact.fullName} onChange={(event) => updateContact("fullName", event.target.value)} /></label><label>Professional headline<input value={cv.contact.headline} onChange={(event) => updateContact("headline", event.target.value)} /></label><label>Email<input type="email" value={cv.contact.email} onChange={(event) => updateContact("email", event.target.value)} /></label><label>Phone<input value={cv.contact.phone} onChange={(event) => updateContact("phone", event.target.value)} /></label><label>Location<input value={cv.contact.location} onChange={(event) => updateContact("location", event.target.value)} /></label><label>LinkedIn<input value={cv.contact.linkedin} onChange={(event) => updateContact("linkedin", event.target.value)} /></label><label className="full-span">Website or portfolio<input value={cv.contact.website} onChange={(event) => updateContact("website", event.target.value)} /></label></div>
    </div></details>

    <details open><summary><span><PencilLine size={17} />Professional profile</span><ChevronRight /></summary><div className="details-body"><label>Summary<textarea rows={5} placeholder="A concise overview of your experience, strengths and direction." value={cv.summary.text} onChange={(event) => onChange({ ...cv, summary: { ...cv.summary, text: event.target.value } })} /></label></div></details>

    <details open><summary><span><BriefcaseBusiness size={17} />Experience <small>{cv.experience.length}</small></span><ChevronRight /></summary><div className="details-body repeat-list">
      {totalExperience && <div className="experience-total"><BriefcaseBusiness size={16} /><span><strong>{totalExperience}</strong><small>Total professional experience, with overlapping roles counted once</small></span></div>}
      {cv.experience.length === 0 && <p className="section-empty">Add your roles, employers, dates and achievements. The AI can only tailor facts you provide here.</p>}
      {cv.experience.map((item, itemIndex) => <article className="repeat-card" key={item.id}>
        <div className="repeat-card-head"><strong>{item.role || "New role"}{item.company ? ` · ${item.company}` : ""}</strong><div><label className="visibility-toggle"><input type="checkbox" checked={item.visible} onChange={(event) => onChange({ ...cv, experience: cv.experience.map((entry) => entry.id === item.id ? { ...entry, visible: event.target.checked } : entry) })} />Show</label><button className="icon-button danger" aria-label="Delete experience" onClick={() => onChange({ ...cv, experience: cv.experience.filter((entry) => entry.id !== item.id) })}><Trash2 size={14} /></button></div></div>
        <div className="form-grid"><label>Role<input placeholder="Senior Product Manager" value={item.role} onChange={(event) => onChange({ ...cv, experience: cv.experience.map((entry) => entry.id === item.id ? { ...entry, role: event.target.value } : entry) })} /></label><label>Company<input placeholder="Company name" value={item.company} onChange={(event) => onChange({ ...cv, experience: cv.experience.map((entry) => entry.id === item.id ? { ...entry, company: event.target.value } : entry) })} /></label><label>Location<input placeholder="City, country or Remote" value={item.location} onChange={(event) => onChange({ ...cv, experience: cv.experience.map((entry) => entry.id === item.id ? { ...entry, location: event.target.value } : entry) })} /></label><div className="date-pair"><label>From<input type="month" min="1960-01" max="2100-12" value={toExperienceMonthInput(item.startDate, "start")} onChange={(event) => onChange({ ...cv, experience: cv.experience.map((entry) => entry.id === item.id ? { ...entry, startDate: event.target.value } : entry) })} /></label><label>To<input type="month" min="1960-01" max="2100-12" disabled={isPresentExperienceDate(item.endDate)} value={toExperienceMonthInput(item.endDate, "end")} onChange={(event) => onChange({ ...cv, experience: cv.experience.map((entry) => entry.id === item.id ? { ...entry, endDate: event.target.value } : entry) })} /></label><label className="current-role"><input type="checkbox" checked={isPresentExperienceDate(item.endDate)} onChange={(event) => onChange({ ...cv, experience: cv.experience.map((entry) => entry.id === item.id ? { ...entry, endDate: event.target.checked ? "Present" : "" } : entry) })} />Current role</label></div></div>
        <div className="achievement-label">Achievements and responsibilities</div>{item.bullets.map((bullet) => <div className="bullet-edit" key={bullet.id}><span>•</span><textarea rows={2} placeholder="Start with an action and include the result where possible." value={bullet.text} onChange={(event) => onChange({ ...cv, experience: cv.experience.map((entry) => entry.id === item.id ? { ...entry, bullets: entry.bullets.map((value) => value.id === bullet.id ? { ...value, text: event.target.value } : value) } : entry) })} /><button className="icon-button" aria-label="Delete bullet" onClick={() => onChange({ ...cv, experience: cv.experience.map((entry) => entry.id === item.id ? { ...entry, bullets: entry.bullets.filter((value) => value.id !== bullet.id) } : entry) })}><X size={14} /></button></div>)}
        <button className="text-button" onClick={() => onChange({ ...cv, experience: cv.experience.map((entry) => entry.id === item.id ? { ...entry, bullets: [...entry.bullets, { id: createId("bullet"), text: "", visible: true, provenance: verified(baseMode ? `base.experience.${itemIndex}` : "user.edit") }] } : entry) })}><Plus size={14} />Add achievement</button>
        {baseMode && onOpenInterview && onConfirmContext && onDeleteContext && <ExperienceContextPanel experience={item} record={enrichments[item.id] ?? null} onOpen={() => onOpenInterview(item.id)} onConfirm={() => onConfirmContext(item.id)} onDelete={() => onDeleteContext(item.id)} />}
      </article>)}
      <button className="add-card-button" onClick={() => onChange({ ...cv, experience: [...cv.experience, { id: createId("experience"), company: "", role: "", location: "", startDate: "", endDate: "", visible: true, bullets: [{ id: createId("bullet"), text: "", visible: true, provenance: verified("user.edit") }] }] })}><Plus size={15} />Add experience</button>
    </div></details>

    <details><summary><span><BookOpen size={17} />Education <small>{cv.education.length}</small></span><ChevronRight /></summary><div className="details-body repeat-list">
      {cv.education.map((item) => <article className="repeat-card" key={item.id}><div className="repeat-card-head"><strong>{item.qualification || "Qualification"}</strong><button className="icon-button danger" onClick={() => onChange({ ...cv, education: cv.education.filter((entry) => entry.id !== item.id) })}><Trash2 size={14} /></button></div><div className="form-grid"><label>Qualification<input value={item.qualification} onChange={(event) => onChange({ ...cv, education: cv.education.map((entry) => entry.id === item.id ? { ...entry, qualification: event.target.value } : entry) })} /></label><label>Institution<input value={item.institution} onChange={(event) => onChange({ ...cv, education: cv.education.map((entry) => entry.id === item.id ? { ...entry, institution: event.target.value } : entry) })} /></label><label>From<input value={item.startDate} onChange={(event) => onChange({ ...cv, education: cv.education.map((entry) => entry.id === item.id ? { ...entry, startDate: event.target.value } : entry) })} /></label><label>To<input value={item.endDate} onChange={(event) => onChange({ ...cv, education: cv.education.map((entry) => entry.id === item.id ? { ...entry, endDate: event.target.value } : entry) })} /></label><label className="full-span">Details<textarea rows={2} value={item.details} onChange={(event) => onChange({ ...cv, education: cv.education.map((entry) => entry.id === item.id ? { ...entry, details: event.target.value } : entry) })} /></label></div></article>)}
      <button className="add-card-button" onClick={() => onChange({ ...cv, education: [...cv.education, { id: createId("education"), institution: "", qualification: "", startDate: "", endDate: "", details: "", visible: true }] })}><Plus size={15} />Add education</button>
    </div></details>

    <details open><summary><span><Sparkles size={17} />Skills <small>{cv.skills.length}</small></span><ChevronRight /></summary><div className="details-body"><div className="skill-editor">{cv.skills.map((skill) => <div key={skill.id} className={skill.provenance.status === "inferred_unconfirmed" ? "inferred" : ""}><input value={skill.text} onChange={(event) => onChange({ ...cv, skills: cv.skills.map((item) => item.id === skill.id ? { ...item, text: event.target.value } : item) })} /><button className="icon-button" onClick={() => onChange({ ...cv, skills: cv.skills.filter((item) => item.id !== skill.id) })}><X size={13} /></button></div>)}<button className="skill-add" onClick={() => onChange({ ...cv, skills: [...cv.skills, { id: createId("skill"), text: "", visible: true, provenance: verified() }] })}><Plus size={14} />Add skill</button></div></div></details>

    <details><summary><span><FolderKanban size={17} />Projects <small>{cv.projects.length}</small></span><ChevronRight /></summary><div className="details-body repeat-list">{cv.projects.map((item) => <article className="repeat-card" key={item.id}><div className="repeat-card-head"><strong>{item.name || "Project"}</strong><button className="icon-button danger" onClick={() => onChange({ ...cv, projects: cv.projects.filter((entry) => entry.id !== item.id) })}><Trash2 size={14} /></button></div><div className="form-grid"><label>Project name<input value={item.name} onChange={(event) => onChange({ ...cv, projects: cv.projects.map((entry) => entry.id === item.id ? { ...entry, name: event.target.value } : entry) })} /></label><label>Link<input value={item.link} onChange={(event) => onChange({ ...cv, projects: cv.projects.map((entry) => entry.id === item.id ? { ...entry, link: event.target.value } : entry) })} /></label><label className="full-span">Description<textarea rows={3} value={item.description} onChange={(event) => onChange({ ...cv, projects: cv.projects.map((entry) => entry.id === item.id ? { ...entry, description: event.target.value } : entry) })} /></label></div></article>)}<button className="add-card-button" onClick={() => onChange({ ...cv, projects: [...cv.projects, { id: createId("project"), name: "", link: "", description: "", visible: true, provenance: verified() }] })}><Plus size={15} />Add project</button></div></details>

    <details><summary><span><FileBadge size={17} />Certifications <small>{cv.certifications.length}</small></span><ChevronRight /></summary><div className="details-body repeat-list">{cv.certifications.map((item) => <div className="inline-record" key={item.id}><input aria-label="Certification" placeholder="Certification" value={item.name} onChange={(event) => onChange({ ...cv, certifications: cv.certifications.map((entry) => entry.id === item.id ? { ...entry, name: event.target.value } : entry) })} /><input aria-label="Certification detail" placeholder="Issuer · Year" value={item.detail} onChange={(event) => onChange({ ...cv, certifications: cv.certifications.map((entry) => entry.id === item.id ? { ...entry, detail: event.target.value } : entry) })} /><button className="icon-button" onClick={() => onChange({ ...cv, certifications: cv.certifications.filter((entry) => entry.id !== item.id) })}><X size={14} /></button></div>)}<button className="add-card-button" onClick={() => onChange({ ...cv, certifications: [...cv.certifications, { id: createId("certification"), name: "", detail: "", visible: true, provenance: verified() }] })}><Plus size={15} />Add certification</button></div></details>

    <details><summary><span><Languages size={17} />Languages <small>{cv.languages.length}</small></span><ChevronRight /></summary><div className="details-body repeat-list">{cv.languages.map((item) => <div className="inline-record" key={item.id}><input aria-label="Language" placeholder="Language" value={item.name} onChange={(event) => onChange({ ...cv, languages: cv.languages.map((entry) => entry.id === item.id ? { ...entry, name: event.target.value } : entry) })} /><input aria-label="Proficiency" placeholder="Native, fluent, B2…" value={item.detail} onChange={(event) => onChange({ ...cv, languages: cv.languages.map((entry) => entry.id === item.id ? { ...entry, detail: event.target.value } : entry) })} /><button className="icon-button" onClick={() => onChange({ ...cv, languages: cv.languages.filter((entry) => entry.id !== item.id) })}><X size={14} /></button></div>)}<button className="add-card-button" onClick={() => onChange({ ...cv, languages: [...cv.languages, { id: createId("language"), name: "", detail: "", visible: true, provenance: verified() }] })}><Plus size={15} />Add language</button></div></details>

    <details><summary><span><Globe2 size={17} />Custom sections <small>{cv.customSections.length}</small></span><ChevronRight /></summary><div className="details-body repeat-list">{cv.customSections.map((section) => <article className="repeat-card" key={section.id}><div className="repeat-card-head"><input className="section-title-input" aria-label="Section title" value={section.title} onChange={(event) => onChange({ ...cv, customSections: cv.customSections.map((entry) => entry.id === section.id ? { ...entry, title: event.target.value } : entry) })} /><button className="icon-button danger" onClick={() => onChange({ ...cv, customSections: cv.customSections.filter((entry) => entry.id !== section.id), sectionOrder: cv.sectionOrder.filter((key) => key !== section.id) })}><Trash2 size={14} /></button></div>{section.items.map((item) => <div className="bullet-edit" key={item.id}><span>•</span><textarea rows={2} value={item.text} onChange={(event) => onChange({ ...cv, customSections: cv.customSections.map((entry) => entry.id === section.id ? { ...entry, items: entry.items.map((value) => value.id === item.id ? { ...value, text: event.target.value } : value) } : entry) })} /><button className="icon-button" onClick={() => onChange({ ...cv, customSections: cv.customSections.map((entry) => entry.id === section.id ? { ...entry, items: entry.items.filter((value) => value.id !== item.id) } : entry) })}><X size={14} /></button></div>)}<button className="text-button" onClick={() => onChange({ ...cv, customSections: cv.customSections.map((entry) => entry.id === section.id ? { ...entry, items: [...entry.items, { id: createId("custom-item"), text: "", visible: true, provenance: verified() }] } : entry) })}><Plus size={14} />Add item</button></article>)}<button className="add-card-button" onClick={() => { const id = createId("custom"); onChange({ ...cv, customSections: [...cv.customSections, { id, title: "Additional information", visible: true, items: [] }], sectionOrder: [...cv.sectionOrder, id] }); }}><Plus size={15} />Add custom section</button></div></details>

    <details><summary><span><LayoutDashboard size={17} />Section order</span><ChevronRight /></summary><div className="details-body section-order">{cv.sectionOrder.map((section, index) => <div key={section}><span>{sectionLabel(section)}</span><div><button className="icon-button" disabled={index === 0} onClick={() => moveSection(index, -1)}><ArrowUp size={14} /></button><button className="icon-button" disabled={index === cv.sectionOrder.length - 1} onClick={() => moveSection(index, 1)}><ArrowDown size={14} /></button></div></div>)}</div></details>
  </div>;
}
