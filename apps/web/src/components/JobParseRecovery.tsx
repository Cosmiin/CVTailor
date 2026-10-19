import { useState, type FormEvent } from "react";
import { CircleAlert, ExternalLink, FileText, LoaderCircle, RefreshCw, ShieldCheck, X } from "lucide-react";
import type { JobRecord } from "../lib/data";

type ManualJobInput = { title: string; company: string; description: string };

type Props = {
  job: JobRecord;
  busy: boolean;
  onRetry: () => Promise<void>;
  onSaveManual: (input: ManualJobInput) => Promise<void>;
  initiallyOpen?: boolean;
};

export function JobParseRecovery({ job, busy, onRetry, onSaveManual, initiallyOpen = false }: Props) {
  const [manualOpen, setManualOpen] = useState(initiallyOpen);
  const [title, setTitle] = useState(job.title === "Untitled role" ? "" : job.title);
  const [company, setCompany] = useState(job.company);
  const [description, setDescription] = useState(job.description);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await onSaveManual({ title: title.trim(), company: company.trim(), description: description.trim() });
      setManualOpen(false);
    } catch { /* The parent keeps the actionable error visible. */ }
  };

  return <>
    <section className="job-processing failed job-parse-recovery">
      <div><CircleAlert size={20} /><span><strong>Automatic parsing could not finish</strong><small>Your original capture is safe. Retry the AI extraction or enter the role, company, and description manually.</small></span></div>
      <div className="job-parse-actions">
        <button className="button button-small button-ghost" onClick={onRetry} disabled={busy}>{busy ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}Retry automatically</button>
        <button className="button button-small button-dark" onClick={() => setManualOpen(true)} disabled={busy}><FileText size={14} />Add manually</button>
        {/^(https?:\/\/)/i.test(job.url) && <a className="job-source-link" href={job.url} target="_blank" rel="noreferrer"><ExternalLink size={14} />Original posting</a>}
      </div>
    </section>
    {manualOpen && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && setManualOpen(false)}>
      <form className="modal manual-job-modal" onSubmit={submit}>
        <button type="button" className="icon-button modal-close" onClick={() => setManualOpen(false)} disabled={busy} aria-label="Close manual job form"><X /></button>
        <span className="section-kicker">Manual recovery</span>
        <h2>Keep this job usable.</h2>
        <p>These details are saved directly, so you can continue tailoring even if automatic parsing is unavailable.</p>
        <div className="form-row">
          <label>Role title<input value={title} maxLength={240} onChange={(event) => setTitle(event.target.value)} required /></label>
          <label>Company name<input value={company} maxLength={240} onChange={(event) => setCompany(event.target.value)} required /></label>
        </div>
        <label>Full job description<textarea rows={14} value={description} minLength={80} maxLength={100000} onChange={(event) => setDescription(event.target.value)} required /></label>
        <button className="button button-primary button-full" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <FileText size={16} />}{busy ? "Saving details…" : "Save manual job"}</button>
        <small className="modal-footnote"><ShieldCheck size={14} />The complete description remains available to the tailoring AI.</small>
      </form>
    </div>}
  </>;
}
