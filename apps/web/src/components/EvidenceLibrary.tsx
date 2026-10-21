import {
  BriefcaseBusiness, Check, ChevronRight, CircleAlert, FileCheck2, PencilLine,
  RotateCcw, ShieldCheck, Sparkles, Trash2,
} from "lucide-react";
import {
  experienceFingerprint, isPresentExperienceDate, type BaseCV, type ExperienceEnrichment,
  type ExperienceEvidence,
} from "@cv-maker/shared";

type Experience = BaseCV["experience"][number];

type Props = {
  cv: BaseCV;
  enrichments: Record<string, ExperienceEnrichment>;
  evidence: ExperienceEvidence[];
  selectedExperienceId: string | null;
  onSelectExperience: (experienceId: string) => void;
  onOpenInterview: (experienceId: string) => void;
  onConfirmContext: (experienceId: string) => void;
  onDeleteContext: (experienceId: string) => void;
  onEditEvidence: (evidenceId: string, input: { label: string; statement: string }) => void;
  onDeleteEvidence: (evidenceId: string) => void;
};

const sortValue = (value: string) => {
  if (isPresentExperienceDate(value)) return Number.MAX_SAFE_INTEGER;
  const parsed = Date.parse(value.length === 7 ? `${value}-01` : value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const formatMonth = (value: string) => {
  if (!value) return "Date not set";
  if (isPresentExperienceDate(value)) return "Present";
  if (/^\d{4}$/.test(value)) return value;
  const parsed = new Date(value.length === 7 ? `${value}-01T00:00:00` : value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en", { month: "short", year: "numeric" }).format(parsed);
};

const roleLabel = (experience: Experience) => `${experience.role || "Untitled role"}${experience.company ? ` · ${experience.company}` : ""}`;

export function EvidenceLibrary({
  cv, enrichments, evidence, selectedExperienceId, onSelectExperience, onOpenInterview,
  onConfirmContext, onDeleteContext, onEditEvidence, onDeleteEvidence,
}: Props) {
  const experiences = [...cv.experience].sort((a, b) => sortValue(b.endDate) - sortValue(a.endDate) || sortValue(b.startDate) - sortValue(a.startDate));
  const selected = experiences.find((item) => item.id === selectedExperienceId) ?? experiences[0] ?? null;

  if (!selected) return <section className="evidence-library-empty"><ShieldCheck /><h2>No roles to organize yet</h2><p>Add an experience in the CV Editor. Its private supporting evidence will appear here.</p></section>;

  const record = enrichments[selected.id] ?? null;
  const active = record?.active ?? null;
  const roleEvidence = evidence.filter((item) => item.experienceId === selected.id);
  const contextStale = Boolean(active && active.sourceFingerprint !== experienceFingerprint(selected));
  const hasStaleEvidence = roleEvidence.some((item) => item.roleFingerprint !== experienceFingerprint(selected));
  const lists = active ? [
    ["Responsibilities", active.context.responsibilities],
    ["Methods and working practices", active.context.methods],
    ["Tools and technologies", active.context.tools],
    ["Scope and leadership", active.context.scope],
    ["Domains", active.context.domains],
    ["Outcomes", active.context.outcomes],
  ] as const : [];
  const answerText = (questionId: string) => {
    if (!active) return "";
    const question = active.questions.find((item) => item.id === questionId);
    const answer = active.answers.find((item) => item.questionId === questionId);
    return [question?.options.filter((option) => answer?.selectedOptionIds.includes(option.id)).map((option) => option.label).join(", "), answer?.note].filter(Boolean).join(" — ");
  };

  return <section className="evidence-library" aria-labelledby="evidence-library-heading">
    <div className="evidence-library-intro"><div><span className="section-kicker"><ShieldCheck size={13} /> Private workspace</span><h2 id="evidence-library-heading">Supporting evidence</h2><p>Keep the useful detail behind each role without crowding your public CV. Tailoring uses this information only when it is relevant.</p></div></div>
    <div className="evidence-library-layout">
      <nav className="evidence-role-list" aria-label="Experience roles">
        <strong>Roles</strong>
        {experiences.map((experience) => {
          const experienceRecord = enrichments[experience.id];
          const directEvidence = evidence.filter((item) => item.experienceId === experience.id);
          const count = directEvidence.length + (experienceRecord?.active ? 1 : 0);
          const stale = Boolean(experienceRecord?.active && experienceRecord.active.sourceFingerprint !== experienceFingerprint(experience)) || directEvidence.some((item) => item.roleFingerprint !== experienceFingerprint(experience));
          return <button key={experience.id} className={selected.id === experience.id ? "active" : ""} aria-current={selected.id === experience.id ? "true" : undefined} onClick={() => onSelectExperience(experience.id)}>
            <span><b>{experience.role || "Untitled role"}</b><small>{experience.company || "Company not set"}</small></span>
            <span className={stale ? "stale" : ""}>{stale && <CircleAlert size={12} />}{count}</span>
          </button>;
        })}
      </nav>

      <div className="evidence-role-detail">
        <header className="evidence-role-header"><div><span className="section-kicker">Selected role</span><h3 id="selected-evidence-role" tabIndex={-1}>{selected.role || "Untitled role"}</h3><p>{selected.company || "Company not set"} · {formatMonth(selected.startDate)}–{formatMonth(selected.endDate)}{selected.location ? ` · ${selected.location}` : ""}</p></div><button className="button button-small button-dark" onClick={() => onOpenInterview(selected.id)}><Sparkles size={14} />{record?.draft ? "Resume interview" : active ? "Update context" : "Add context"}</button></header>

        {(contextStale || hasStaleEvidence) && <div className="stale-callout"><CircleAlert /><span>This role changed after some evidence was confirmed. Review it before using it for tailoring.</span></div>}

        {!active && roleEvidence.length === 0 ? <div className="evidence-detail-empty"><Sparkles /><h4>No supporting evidence yet</h4><p>Add context to capture responsibilities, tools, scope, and outcomes that do not fit directly on your CV.</p><button className="button button-primary" onClick={() => onOpenInterview(selected.id)}>{record?.draft ? "Resume interview" : "Add context"}</button></div> : <>
          {active && <section className={`evidence-context-card ${contextStale ? "stale" : ""}`}>
            <div className="evidence-section-heading"><div><span className="evidence-source"><Sparkles size={12} /> Added through role interview</span><h4>Role overview</h4></div><span className={`status-badge ${contextStale ? "draft" : "ready"}`}>{contextStale ? "Needs confirmation" : "Ready for tailoring"}</span></div>
            <p className="evidence-overview">{active.context.overview}</p>
            <div className="context-skill-chips">{active.context.skills.map((skill) => <span title={skill.evidence} key={skill.id}>{skill.name}</span>)}</div>
            <div className="evidence-context-lists">{lists.filter(([, items]) => items.length).map(([label, items]) => <div key={label}><strong>{label}</strong><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></div>)}</div>
            <details className="evidence-interview-answers"><summary>View interview answers <ChevronRight size={14} /></summary><div>{active.questions.map((question) => <article key={question.id}><strong>{question.prompt}</strong><span>{answerText(question.id) || "No additional note"}</span></article>)}</div></details>
            <footer>{contextStale && <button className="button button-small button-dark" onClick={() => onConfirmContext(selected.id)}><Check size={14} />Still accurate</button>}<button className="button button-small button-ghost" onClick={() => onOpenInterview(selected.id)}><RotateCcw size={14} />{record?.draft ? "Resume refresh" : "Review or refresh"}</button><button className="icon-button danger" onClick={() => onDeleteContext(selected.id)} aria-label={`Remove supporting context for ${roleLabel(selected)}`}><Trash2 size={14} /></button></footer>
          </section>}

          <section className="confirmed-facts-section">
            <div className="evidence-section-heading"><div><span className="evidence-source"><FileCheck2 size={12} /> Confirmed while tailoring</span><h4>Confirmed facts <small>{roleEvidence.length}</small></h4></div></div>
            {roleEvidence.length === 0 ? <p className="evidence-inline-empty">Facts confirmed while tailoring applications will be collected here.</p> : <div className="confirmed-fact-list">{roleEvidence.map((item) => {
              const stale = item.roleFingerprint !== experienceFingerprint(selected);
              return <article className={stale ? "stale" : ""} key={item.id}><div><strong>{item.label || item.category}</strong><p>{item.statement}</p><small>{item.category.replaceAll("_", " ")} · {stale ? "Needs reconfirmation" : "Confirmed by you"}</small></div><div><button className="icon-button" aria-label={`Edit ${item.label || item.category}`} onClick={() => { const label = window.prompt("Short evidence label", item.label); if (label === null) return; const statement = window.prompt("Factual evidence statement", item.statement); if (statement?.trim()) onEditEvidence(item.id, { label, statement }); }}><PencilLine size={14} /></button><button className="icon-button danger" aria-label={`Delete ${item.label || item.category}`} onClick={() => onDeleteEvidence(item.id)}><Trash2 size={14} /></button></div></article>;
            })}</div>}
          </section>
        </>}
      </div>
    </div>
    <div className="evidence-privacy-note"><BriefcaseBusiness size={15} /><span><strong>Private by default.</strong> Supporting evidence helps tailor applications but never appears in the Base CV preview.</span></div>
  </section>;
}
