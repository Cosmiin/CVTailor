import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CircleAlert, LoaderCircle, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import {
  experienceContextSchema, experienceFingerprint, type BaseCV, type ExperienceContext,
  type ExperienceEnrichment, type ExperienceInterviewAnswer,
} from "@cv-maker/shared";
import { dataApi } from "../lib/data";
import { VoiceRecorder } from "./VoiceRecorder";

type Experience = BaseCV["experience"][number];
type Props = {
  experience: Experience;
  record: ExperienceEnrichment | null;
  onChange: (record: ExperienceEnrichment | null) => void;
  onClose: () => void;
};

const friendlyError = (error: unknown) => {
  const code = error instanceof Error ? error.message : "Experience interview failed.";
  const messages: Record<string, string> = {
    experience_ai_busy: "Another AI interview request is still running. Please wait a moment.",
    experience_ai_rate_limited: "You have made several interview requests recently. Please try again in about an hour.",
    experience_changed_restart_interview: "This role changed during the interview. Start a fresh interview so the questions match it.",
    experience_answers_incomplete: "Please answer every question before creating the supporting evidence.",
  };
  return messages[code] ?? code.replaceAll("_", " ");
};

const ContextEditor = ({ value, onChange }: { value: ExperienceContext; onChange: (value: ExperienceContext) => void }) => {
  const listField = (key: "responsibilities" | "methods" | "tools" | "scope" | "domains" | "outcomes", label: string) =>
    <label>{label}<textarea rows={3} value={value[key].join("\n")} onChange={(event) => onChange({ ...value, [key]: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} /></label>;
  return <div className="context-review-form">
    <label>Role overview<textarea rows={5} value={value.overview} onChange={(event) => onChange({ ...value, overview: event.target.value })} /></label>
    <div className="context-review-grid">
      {listField("responsibilities", "Responsibilities and ownership")}
      {listField("methods", "Methods and working practices")}
      {listField("tools", "Tools and technologies")}
      {listField("scope", "Scope and leadership")}
      {listField("domains", "Domains and specialist knowledge")}
      {listField("outcomes", "Qualitative outcomes")}
    </div>
    <div className="context-skill-editor"><strong>Supported skills</strong><small>Keep each skill to three words or fewer.</small>{value.skills.map((skill) => <div key={skill.id}>
      <input aria-label="Skill name" value={skill.name} onChange={(event) => onChange({ ...value, skills: value.skills.map((item) => item.id === skill.id ? { ...item, name: event.target.value } : item) })} />
      <textarea aria-label={`Evidence for ${skill.name}`} rows={2} value={skill.evidence} onChange={(event) => onChange({ ...value, skills: value.skills.map((item) => item.id === skill.id ? { ...item, evidence: event.target.value } : item) })} />
    </div>)}</div>
  </div>;
};

export function ExperienceInterview({ experience, record: initialRecord, onChange, onClose }: Props) {
  const [record, setRecord] = useState(initialRecord);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(initialRecord?.draft?.currentIndex ?? 0);
  const [review, setReview] = useState<ExperienceContext | null>(initialRecord?.pending ?? null);
  const [editingActive, setEditingActive] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const draft = record?.draft ?? null;
  const question = draft?.questions[index];
  const savedAnswer = draft?.answers.find((item) => item.questionId === question?.id);
  const [selected, setSelected] = useState<string[]>(savedAnswer?.selectedOptionIds ?? []);
  const [note, setNote] = useState(savedAnswer?.note ?? "");

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy && !voiceActive) onClose(); };
    window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close);
  }, [busy, onClose, voiceActive]);

  useEffect(() => {
    const answer = draft?.answers.find((item) => item.questionId === question?.id);
    setSelected(answer?.selectedOptionIds ?? []); setNote(answer?.note ?? "");
  }, [question?.id, draft?.answers]);

  const update = (next: ExperienceEnrichment | null) => { setRecord(next); onChange(next); };
  const run = async (task: () => Promise<ExperienceEnrichment | null>) => {
    setBusy(true); setError("");
    try { const next = await task(); update(next); return next; }
    catch (caught) { setError(friendlyError(caught)); return null; }
    finally { setBusy(false); }
  };
  const start = async () => { const next = await run(() => dataApi.startExperienceInterview(experience.id)); if (next?.draft) setIndex(next.draft.currentIndex); };
  const saveAndAdvance = async () => {
    if (!question || selected.length === 0) { setError("Choose an answer before continuing."); return; }
    const answer: ExperienceInterviewAnswer = { questionId: question.id, selectedOptionIds: selected, note };
    setBusy(true); setError("");
    try {
      const saved = await dataApi.saveExperienceAnswer(experience.id, answer, Math.min(index + 1, (draft?.questions.length ?? 1) - 1));
      update(saved);
      if (draft && index === draft.questions.length - 1) {
        const synthesized = await dataApi.synthesizeExperience(experience.id); update(synthesized); setReview(synthesized.pending);
      } else setIndex((current) => current + 1);
    } catch (caught) { setError(friendlyError(caught)); }
    finally { setBusy(false); }
  };
  const approve = async () => {
    if (!review) return;
    const parsed = experienceContextSchema.safeParse(review);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the supporting evidence before saving."); return; }
    const next = await run(() => editingActive ? dataApi.updateExperienceContext(experience.id, parsed.data) : dataApi.approveExperienceContext(experience.id, parsed.data));
    if (next) onClose();
  };
  const discard = async () => { const next = await run(() => dataApi.discardExperienceDraft(experience.id)); if (next) { setReview(null); onClose(); } };
  const progress = draft ? Math.round(((index + 1) / draft.questions.length) * 100) : 0;
  const roleChanged = useMemo(() => Boolean(record?.active && record.active.sourceFingerprint !== experienceFingerprint(experience)), [record?.active, experience]);

  return <div className="interview-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && !voiceActive && onClose()}>
    <section className="interview-dialog" role="dialog" aria-modal="true" aria-labelledby="experience-interview-title">
      <header><div><span className="section-kicker"><Sparkles size={13} /> AI experience interview</span><h2 id="experience-interview-title">{experience.role || "Your role"}</h2><p>{experience.company || "Company not set"}</p></div><button className="icon-button" onClick={onClose} disabled={busy || voiceActive} aria-label="Close interview"><X /></button></header>
      {error && <div className="notice error"><CircleAlert size={16} />{error}</div>}

      {review ? <div className="interview-review"><div className="interview-copy"><span className="section-kicker">{editingActive ? "Edit supporting evidence" : "Review before saving"}</span><h3>Your supporting evidence</h3><p>Edit anything that does not sound accurate. This stays off the base CV and helps tailor future applications.</p></div><ContextEditor value={review} onChange={setReview} /><footer><button className="button button-ghost" onClick={() => { if (editingActive) { setReview(null); setEditingActive(false); } else discard(); }} disabled={busy}>{editingActive ? <X size={15} /> : <Trash2 size={15} />}{editingActive ? "Cancel" : "Discard draft"}</button><button className="button button-primary" onClick={approve} disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <Check />}{editingActive ? "Save changes" : "Approve evidence"}</button></footer></div>
      : draft && question ? <div className="interview-wizard">
        <div className="interview-progress"><div><span>Question {index + 1} of {draft.questions.length}</span><span>{progress}%</span></div><i><b style={{ width: `${progress}%` }} /></i></div>
        <div className="interview-question"><span className="section-kicker">Tell us what the CV leaves out</span><h3>{question.prompt}</h3>{question.rationale && <p>{question.rationale}</p>}
          <div className="interview-options">{question.options.map((option) => { const checked = selected.includes(option.id); return <label className={checked ? "selected" : ""} key={option.id}><input type={question.type === "single" ? "radio" : "checkbox"} name={question.id} checked={checked} onChange={() => setSelected((current) => question.type === "single" ? [option.id] : checked ? current.filter((id) => id !== option.id) : [...current, option.id])} /><span>{option.label}</span></label>; })}</div>
          <label className="interview-note">Anything else you want the AI to understand?<textarea rows={4} placeholder="Optional context, examples, or nuance…" value={note} onChange={(event) => setNote(event.target.value)} maxLength={2500} disabled={voiceActive} /></label>
          <VoiceRecorder key={question.id} onTranscript={setNote} onActivityChange={setVoiceActive} disabled={busy} />
        </div>
        <footer><button className="button button-ghost" onClick={() => setIndex((current) => Math.max(0, current - 1))} disabled={busy || voiceActive || index === 0}><ArrowLeft />Back</button><button className="button button-primary" onClick={saveAndAdvance} disabled={busy || voiceActive || selected.length === 0}>{busy ? <LoaderCircle className="spin" /> : index === draft.questions.length - 1 ? <Sparkles /> : <ArrowRight />}{busy ? "Saving…" : index === draft.questions.length - 1 ? "Build supporting evidence" : "Save and continue"}</button></footer>
      </div>
      : <div className="interview-start"><Sparkles /><span className="section-kicker">{record?.active ? "Refresh supporting evidence" : "Reveal the work behind the title"}</span><h3>{record?.active ? "Update your supporting evidence." : "Give tailoring better evidence."}</h3><p>{record?.active ? "Edit the approved evidence directly or run a fresh interview. Your current evidence stays active until a replacement interview is approved." : "AI will ask 5–10 focused questions based on this role and your safe CV context. Your answers are saved as you go."}</p>{roleChanged && <div className="stale-callout"><CircleAlert />This role has changed since its evidence was approved.</div>}<div className="interview-start-actions"><button className="button button-primary button-large" onClick={start} disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <Sparkles />}{busy ? "Preparing questions…" : record?.active ? "Start refresh" : "Start interview"}</button>{record?.active && <button className="button button-ghost" onClick={() => { setEditingActive(true); setReview(structuredClone(record.active!.context)); }}>Edit current evidence</button>}</div></div>}
    </section>
  </div>;
}

export function ExperienceContextPanel({ experience, record, onOpen, onConfirm, onDelete }: {
  experience: Experience; record: ExperienceEnrichment | null; onOpen: () => void; onConfirm: () => void; onDelete: () => void;
}) {
  const active = record?.active;
  const stale = Boolean(active && active.sourceFingerprint !== experienceFingerprint(experience));
  if (!active) return <div className="experience-enrichment-empty"><div><Sparkles /><span><strong>{record?.draft ? "Interview in progress" : "Add deeper role context"}</strong><small>{record?.draft ? `Resume at question ${record.draft.currentIndex + 1} of ${record.draft.questions.length}.` : "Answer 5–10 focused questions so tailoring can understand the work behind this role."}</small></span></div><button className="button button-small button-dark" onClick={onOpen}><Sparkles size={14} />{record?.draft ? "Resume interview" : "Enrich with AI"}</button></div>;
  const answerText = (questionId: string) => {
    const question = active.questions.find((item) => item.id === questionId); const answer = active.answers.find((item) => item.questionId === questionId);
    return [question?.options.filter((option) => answer?.selectedOptionIds.includes(option.id)).map((option) => option.label).join(", "), answer?.note].filter(Boolean).join(" — ");
  };
  const lists = [["Responsibilities", active.context.responsibilities], ["Methods", active.context.methods], ["Tools", active.context.tools], ["Scope", active.context.scope], ["Domains", active.context.domains], ["Outcomes", active.context.outcomes]] as const;
  return <section className={`experience-context ${stale ? "stale" : ""}`}><header><div><span className="section-kicker"><Sparkles size={12} /> Role context</span><strong>{stale ? "Needs confirmation" : "Confirmed evidence"}</strong></div><span className={`status-badge ${stale ? "draft" : "ready"}`}>{stale ? "Potentially outdated" : "Ready for tailoring"}</span></header><p>{active.context.overview}</p><div className="context-skill-chips">{active.context.skills.map((skill) => <span title={skill.evidence} key={skill.id}>{skill.name}</span>)}</div><details><summary>View context and interview answers</summary><div className="experience-context-details">{lists.filter(([, items]) => items.length).map(([label, items]) => <div key={label}><strong>{label}</strong><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></div>)}<div className="context-qa"><strong>Interview answers</strong>{active.questions.map((question) => <div key={question.id}><b>{question.prompt}</b><span>{answerText(question.id)}</span></div>)}</div></div></details>{stale && <div className="stale-callout"><CircleAlert /><span>The role changed after this interview. Confirm the context is still accurate or refresh it before tailoring.</span></div>}<footer>{stale && <button className="button button-small button-dark" onClick={onConfirm}><Check size={14} />Still accurate</button>}<button className="button button-small button-ghost" onClick={onOpen}><RotateCcw size={14} />{record?.draft ? "Resume refresh" : "Refresh interview"}</button><button className="icon-button danger" onClick={onDelete} aria-label="Remove role context"><Trash2 size={14} /></button></footer></section>;
}
