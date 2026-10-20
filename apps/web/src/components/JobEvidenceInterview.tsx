import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CircleAlert, LoaderCircle, ShieldCheck, Sparkles, X } from "lucide-react";
import type {
  BaseCV, JobInterviewAnswer, JobTailoringSession, ProposedExperienceEvidence,
} from "@cv-maker/shared";
import { VoiceRecorder } from "./VoiceRecorder";

type Props = {
  session: JobTailoringSession;
  experiences: BaseCV["experience"];
  busy: boolean;
  generating?: boolean;
  error: string;
  onClose: () => void;
  onSaveAnswer: (answer: JobInterviewAnswer, currentIndex: number) => Promise<void>;
  onReconfirm: (evidenceIds: string[]) => Promise<void>;
  onSynthesize: () => Promise<void>;
  onApprove: (evidence: ProposedExperienceEvidence[]) => Promise<void>;
  onGenerate: () => Promise<void>;
  onDiscard: () => Promise<void>;
};

const statusLabel = {
  supported: "Already supported",
  newly_confirmed: "Confirmed now",
  unclear: "Needs clarification",
  unanswered: "Skipped or unanswered",
  unsupported: "Unsupported",
} as const;

export function JobEvidenceInterview({
  session, experiences, busy, generating = false, error, onClose, onSaveAnswer, onReconfirm, onSynthesize, onApprove, onGenerate, onDiscard,
}: Props) {
  const initialQuestion = session.questions[session.currentIndex] ?? null;
  const [selectedPrior, setSelectedPrior] = useState<string[]>([]);
  const [answer, setAnswer] = useState<JobInterviewAnswer | null>(() => initialQuestion
    ? session.answers.find((item) => item.questionId === initialQuestion.id) ?? { questionId: initialQuestion.id, selectedOptionIds: [], note: "", skipped: false }
    : null);
  const [proposed, setProposed] = useState<ProposedExperienceEvidence[]>(session.proposedEvidence);
  const [voiceActive, setVoiceActive] = useState(false);
  const question = session.questions[session.currentIndex] ?? null;
  const roleNames = useMemo(() => new Map(experiences.map((item) => [item.id, `${item.role || "Role"} · ${item.company || "Company"}`])), [experiences]);

  useEffect(() => {
    setSelectedPrior(session.priorEvidence.filter((item) => !item.stale).map((item) => item.id));
  }, [session.id]);
  useEffect(() => { setProposed(session.proposedEvidence); }, [session.proposedEvidence]);
  useEffect(() => {
    if (!question) { setAnswer(null); return; }
    setAnswer(session.answers.find((item) => item.questionId === question.id) ?? { questionId: question.id, selectedOptionIds: [], note: "", skipped: false });
  }, [question?.id, session.answers]);

  const finishAnswer = async (skip = false) => {
    if (!question || !answer) return;
    const saved = skip ? { ...answer, selectedOptionIds: [], note: "", skipped: true } : { ...answer, skipped: false };
    const isLast = session.currentIndex >= session.questions.length - 1;
    await onSaveAnswer(saved, isLast ? session.currentIndex : session.currentIndex + 1);
    if (isLast) await onSynthesize();
  };
  const back = async () => {
    if (!question || session.currentIndex === 0) return;
    const previous = session.answers.find((item) => item.questionId === session.questions[session.currentIndex - 1]?.id);
    if (previous) await onSaveAnswer(previous, session.currentIndex - 1);
  };
  const toggleChoice = (id: string) => {
    if (!answer || !question) return;
    if (question.type === "single") setAnswer({ ...answer, selectedOptionIds: [id] });
    else setAnswer({ ...answer, selectedOptionIds: answer.selectedOptionIds.includes(id) ? answer.selectedOptionIds.filter((item) => item !== id) : [...answer.selectedOptionIds, id] });
  };
  const answerValid = Boolean(answer && (question?.type === "free_text" ? answer.note.trim() : answer.selectedOptionIds.length));

  return <div className="interview-backdrop" role="presentation">
    <section className="interview-dialog job-evidence-modal" role="dialog" aria-modal="true" aria-labelledby="job-evidence-title">
      <header className="interview-header">
        <div><span className="section-kicker"><Sparkles size={14} /> Evidence check</span><h2 id="job-evidence-title">Strengthen this application truthfully</h2></div>
        <button className="icon-button" onClick={onClose} disabled={busy || voiceActive} aria-label="Close evidence check"><X /></button>
      </header>

      {error && <div className="notice error"><CircleAlert size={16} />{error}</div>}

      {!session.reconfirmationDone && session.priorEvidence.length > 0 ? <div className="interview-body evidence-reconfirm">
        <div className="interview-progress"><span>Reusable evidence</span><strong>Confirm what is still accurate</strong></div>
        <p>These facts were confirmed in earlier applications. Select only the statements that are still accurate for the role shown.</p>
        <div className="evidence-choice-list">
          {session.priorEvidence.map((item) => <label className={`evidence-choice ${item.stale ? "stale" : ""}`} key={item.id}>
            <input type="checkbox" checked={selectedPrior.includes(item.id)} onChange={() => setSelectedPrior((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} />
            <span><strong>{item.label || roleNames.get(item.experienceId) || "Saved evidence"}</strong><small>{item.statement}</small>{item.stale && <em>Role changed — reconfirm before use</em>}</span>
          </label>)}
        </div>
        <div className="interview-actions"><button className="button button-ghost" onClick={onDiscard} disabled={busy}>Discard session</button><button className="button button-primary" onClick={() => onReconfirm(selectedPrior)} disabled={busy}>{busy && <LoaderCircle className="spin" size={15} />}Continue</button></div>
      </div> : session.status === "questions" && question && answer ? <div className="interview-body">
        <div className="interview-progress"><span>Question {session.currentIndex + 1} of {session.questions.length}</span><div><i style={{ width: `${((session.currentIndex + 1) / session.questions.length) * 100}%` }} /></div></div>
        <span className="evidence-role-label">{roleNames.get(question.targetExperienceId)}</span>
        <h3>{question.prompt}</h3><p>{question.rationale}</p>
        {question.type === "free_text" ? <div className="voice-answer-field"><label>What happened in this role?<textarea rows={5} maxLength={2500} disabled={voiceActive} value={answer.note} onChange={(event) => setAnswer({ ...answer, note: event.target.value })} placeholder="Add a concise factual answer. Avoid confidential information." /></label><VoiceRecorder key={question.id} onTranscript={(text) => setAnswer({ ...answer, note: text })} onActivityChange={setVoiceActive} disabled={busy} /></div> : <>
          <div className="interview-options">{question.options.map((option) => <label key={option.id} className={answer.selectedOptionIds.includes(option.id) ? "selected" : ""}><input type={question.type === "single" ? "radio" : "checkbox"} name={question.id} checked={answer.selectedOptionIds.includes(option.id)} onChange={() => toggleChoice(option.id)} /><span>{option.label}</span></label>)}</div>
          <div className="voice-answer-field"><label>Optional detail<textarea rows={3} maxLength={2500} disabled={voiceActive} value={answer.note} onChange={(event) => setAnswer({ ...answer, note: event.target.value })} placeholder="Add context, tools, scope, or a qualitative outcome." /></label><VoiceRecorder key={question.id} onTranscript={(text) => setAnswer({ ...answer, note: text })} onActivityChange={setVoiceActive} disabled={busy} /></div>
        </>}
        <div className="interview-actions"><button className="button button-ghost" onClick={back} disabled={busy || voiceActive || session.currentIndex === 0}><ArrowLeft size={15} />Back</button><button className="button button-ghost" onClick={() => finishAnswer(true)} disabled={busy || voiceActive}>Skip</button><button className="button button-primary" onClick={() => finishAnswer(false)} disabled={busy || voiceActive || !answerValid}>{busy ? <LoaderCircle className="spin" size={15} /> : <ArrowRight size={15} />}{session.currentIndex === session.questions.length - 1 ? "Review evidence" : "Save and continue"}</button></div>
      </div> : session.status === "review" ? <div className="interview-body evidence-review">
        <div className="interview-progress"><span>Review proposed evidence</span><strong>Approve only facts you stand behind</strong></div>
        <p>The selected role cannot be changed here because it comes from the source question. Edit the wording or reject a statement if needed.</p>
        <div className="proposed-evidence-list">{proposed.map((item, index) => <article key={item.id}>
          <label className="evidence-approval"><input type="checkbox" checked={item.approved} onChange={(event) => setProposed((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, approved: event.target.checked } : entry))} /><span>Approve</span></label>
          <small>{roleNames.get(item.experienceId)} · {item.category}</small>
          <label>Short label<input maxLength={80} value={item.label} onChange={(event) => setProposed((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, label: event.target.value } : entry))} /></label>
          <label>Factual statement<textarea rows={3} maxLength={300} value={item.statement} onChange={(event) => setProposed((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, statement: event.target.value } : entry))} /></label>
        </article>)}</div>
        <div className="interview-actions"><button className="button button-ghost" onClick={onDiscard} disabled={busy}>Discard session</button><button className="button button-primary" onClick={() => onApprove(proposed)} disabled={busy || proposed.some((item) => item.approved && !item.statement.trim())}>{busy && <LoaderCircle className="spin" size={15} />}Approve evidence</button></div>
      </div> : <div className="interview-body coverage-review">
        <div className="coverage-heading"><ShieldCheck /><div><span className="section-kicker">Evidence coverage</span><h3>Ready to generate your tailored CV</h3><p>This is a factual coverage review, not a universal ATS score.</p></div></div>
        <div className="coverage-list">{session.requirements.map((item) => <article key={item.id} className={`coverage-item ${item.status}`}><span><Check size={14} /></span><div><strong>{item.text}</strong><small>{statusLabel[item.status]} · {item.rationale}</small>{item.atsTerms.length > 0 && <em>{item.atsTerms.join(" · ")}</em>}</div></article>)}</div>
        <div className="token-note"><ShieldCheck size={15} />Past interview transcripts stay private. Generation receives only compact role summaries and up to 20 relevant approved facts.</div>
        {generating && <div className="notice success" role="status"><LoaderCircle className="spin" size={16} />Your CV is generating in the background. It will keep running even if the first request would normally time out.</div>}
        <div className="interview-actions"><button className="button button-ghost" onClick={onDiscard} disabled={busy}>Discard session</button><button className="button button-primary" onClick={onGenerate} disabled={busy}>{busy ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}{generating ? "Generating in background…" : "Generate tailored CV"}</button></div>
      </div>}
    </section>
  </div>;
}
