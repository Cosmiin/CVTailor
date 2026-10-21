import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight, BriefcaseBusiness, CalendarCheck2, Check, ChevronRight, CircleAlert, ExternalLink,
  FileText, Link2, LoaderCircle, MessageCircleHeart, Plus, Search, ShieldCheck, Sparkles, Trash2,
  Trophy, X,
} from "lucide-react";
import type { ApplicationStatus } from "@cv-maker/shared";
import { ApplicationTracker } from "./ApplicationTracker";
import { dataApi, type JobRecord } from "../lib/data";
import { isSupabaseConfigured } from "../lib/supabase";
import { formatTokenCount, formatUsdCost } from "../lib/usage";

export const encouragementMessages = [
  "Every thoughtful application is one step closer to the right yes.",
  "The right team is looking for someone with your exact mix of experience.",
  "Keep going — a strong application can change the direction of your year.",
  "Your next opportunity may already be reading your CV.",
  "Progress is built one well-matched application at a time.",
  "A quiet inbox today does not mean an empty opportunity tomorrow.",
  "The work you are putting in now is making the next conversation possible.",
  "One good conversation is all it takes to open the next chapter.",
] as const;

export type ApplicationFilter = "all" | ApplicationStatus;

export const filterApplications = (jobs: JobRecord[], query: string, status: ApplicationFilter) => {
  const term = query.trim().toLocaleLowerCase();
  return jobs.filter((job) => {
    const matchesStatus = status === "all" || job.applicationStatus === status;
    const matchesSearch = !term || [job.company, job.title, job.location]
      .some((value) => value.toLocaleLowerCase().includes(term));
    return matchesStatus && matchesSearch;
  });
};

export const applicationCounts = (jobs: JobRecord[]) => ({
  applied: jobs.filter((job) => job.applicationStatus !== "not_applied").length,
  waiting: jobs.filter((job) => job.applicationStatus === "applied").length,
  active: jobs.filter((job) => ["response_received", "interviewing"].includes(job.applicationStatus)).length,
  offers: jobs.filter((job) => job.applicationStatus === "offer").length,
});

export const mergeJobUpdate = (jobs: JobRecord[], updated: JobRecord) =>
  jobs.map((job) => job.id === updated.id ? updated : job);

const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value))
  : "—";

const filterOptions: Array<{ value: ApplicationFilter; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "not_applied", label: "Not applied" },
  { value: "applied", label: "Awaiting response" },
  { value: "response_received", label: "Response received" },
  { value: "interviewing", label: "Interviewing" },
  { value: "offer", label: "Offer received" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
];

export function ApplicationsPage({ onUsage }: { onUsage: () => void }) {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [method, setMethod] = useState<"url" | "paste">("url");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ApplicationFilter>("all");
  const encouragement = useMemo(
    () => encouragementMessages[Math.floor(Math.random() * encouragementMessages.length)],
    [],
  );

  const load = useCallback(() => dataApi.listJobs().then(setJobs).finally(() => setLoading(false)), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => dataApi.subscribeToJobUpdates((updated) => {
    setJobs((current) => mergeJobUpdate(current, updated));
  }), []);
  const hasPendingJobs = jobs.some((job) => job.parseStatus === "pending");
  useEffect(() => {
    if (!hasPendingJobs) return;
    const timer = window.setInterval(() => { void load(); }, 10_000);
    return () => window.clearInterval(timer);
  }, [hasPendingJobs, load]);

  const importJob = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const job = await dataApi.importJob(method === "url"
        ? { url }
        : { url, title, company, description, captureMethod: "paste" });
      setShowImport(false); onUsage(); navigate(`/app/jobs/${job.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message.replaceAll("_", " ") : "Something went wrong.");
    } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this job and its tailored CV?")) return;
    await dataApi.deleteJob(id); await load();
  };
  const updateJob = (updated: JobRecord) => setJobs((current) => mergeJobUpdate(current, updated));
  const visibleJobs = useMemo(() => filterApplications(jobs, query, status), [jobs, query, status]);
  const counts = useMemo(() => applicationCounts(jobs), [jobs]);

  return <main className="workspace applications-workspace">
    <header className="workspace-header">
      <div><span className="section-kicker">Your job search</span><h1>Applications</h1><p>Keep every role, tailored CV, application date, and response in one calm view.</p></div>
      <button className="button button-primary" onClick={() => setShowImport(true)}><Plus size={17} /> Add a job</button>
    </header>
    {!isSupabaseConfigured && <div className="notice demo-banner"><Sparkles size={17} /><span><strong>Demo workspace.</strong> Data stays in this browser. Connect Supabase to enable real accounts and AI.</span></div>}
    <section className="application-encouragement" aria-label="Encouragement">
      <span><MessageCircleHeart size={19} /></span><div><small>A note for today</small><strong>{encouragement}</strong></div>
    </section>
    <section className="application-summary" aria-label="Application summary">
      <article><BriefcaseBusiness /><div><strong>{counts.applied}</strong><span>Jobs applied</span></div></article>
      <article><CalendarCheck2 /><div><strong>{counts.waiting}</strong><span>Awaiting response</span></div></article>
      <article><Sparkles /><div><strong>{counts.active}</strong><span>Active conversations</span></div></article>
      <article><Trophy /><div><strong>{counts.offers}</strong><span>Offers</span></div></article>
    </section>
    {loading ? <div className="loading-state"><LoaderCircle className="spin" /> Loading applications…</div> : jobs.length === 0 ? <div className="empty-state"><div className="empty-icon"><BriefcaseBusiness /></div><span className="section-kicker">Your first application</span><h2>Start with a role worth pursuing.</h2><p>Paste a public link or the job description. We’ll create a focused CV and keep the application status here.</p><button className="button button-primary" onClick={() => setShowImport(true)}>Add your first job <ArrowRight size={17} /></button></div> : <>
      <div className="application-filters">
        <label className="application-search"><Search size={16} /><span className="sr-only">Search applications</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search company, role, or location…" /></label>
        <label><span className="sr-only">Filter applications by status</span><select value={status} onChange={(event) => setStatus(event.target.value as ApplicationFilter)}>{filterOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
        <span className="filter-result-count">{visibleJobs.length} {visibleJobs.length === 1 ? "role" : "roles"}</span>
      </div>
      {visibleJobs.length === 0 ? <div className="applications-empty-filter"><Search /><strong>No matching applications</strong><span>Try a different company, role, or status.</span></div> : <div className="applications-table-wrap"><table className="applications-table">
        <thead><tr><th>Company and role</th><th>Tailored CV</th><th>Status</th><th>Applied</th><th>Last change</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{visibleJobs.map((job) => <tr key={job.id}>
          <td data-label="Company and role"><div className="application-role"><span className="company-avatar">{(job.company || job.title).slice(0, 1).toUpperCase()}</span><div><strong>{job.company || "Company not set"}</strong><button onClick={() => navigate(`/app/jobs/${job.id}`)}>{job.title}</button>{job.location && <small>{job.location}</small>}</div>{job.url && <a href={job.url} target="_blank" rel="noreferrer" aria-label={`Open ${job.title} job listing`}><ExternalLink size={13} /></a>}</div></td>
          <td data-label="Tailored CV"><div className="tailored-cv-cell"><span className={`status-badge ${job.latestTailoredCV ? "ready" : "draft"}`}>{job.latestTailoredCV ? <><Check size={12} /> Ready</> : job.parseStatus === "pending" ? <><LoaderCircle className="spin" size={12} /> Processing</> : job.parseStatus === "failed" ? "Parsing failed" : "Not tailored"}</span>{job.latestTailoredCV?.aiUsage && <div className="cv-usage"><strong>{formatUsdCost(job.latestTailoredCV.aiUsage.costUsd)}</strong><span>{job.latestTailoredCV.aiUsage.model}</span><small>{formatTokenCount(job.latestTailoredCV.aiUsage.inputTokens)} in · {formatTokenCount(job.latestTailoredCV.aiUsage.outputTokens)} out</small></div>}</div></td>
          <td data-label="Status"><ApplicationTracker job={job} variant="row" onChange={updateJob} /></td>
          <td data-label="Applied"><span className="table-date">{formatDate(job.appliedAt)}</span></td>
          <td data-label="Last change"><span className="table-date">{formatDate(job.applicationStatusChangedAt ?? job.updatedAt)}</span></td>
          <td className="application-row-actions"><button className="button button-small button-ghost" onClick={() => navigate(`/app/jobs/${job.id}`)}>{job.latestTailoredCV ? "Open CV" : "Open job"}<ChevronRight size={14} /></button><button className="icon-button danger" aria-label={`Delete ${job.title}`} onClick={() => remove(job.id)}><Trash2 size={15} /></button></td>
        </tr>)}</tbody>
      </table></div>}
    </>}
    {showImport && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShowImport(false)}><form className="modal" onSubmit={importJob}><button type="button" className="icon-button modal-close" onClick={() => setShowImport(false)}><X /></button><span className="section-kicker">New application</span><h2>Bring in the job.</h2><p>We’ll save it immediately, then organize every detail with AI in the background.</p><div className="segmented"><button type="button" className={method === "url" ? "active" : ""} onClick={() => setMethod("url")}><Link2 size={16} />Job link</button><button type="button" className={method === "paste" ? "active" : ""} onClick={() => setMethod("paste")}><FileText size={16} />Paste text</button></div>{method === "url" ? <label>Public job URL<input type="url" placeholder="https://company.com/jobs/…" value={url} onChange={(event) => setUrl(event.target.value)} required /></label> : <><div className="form-row"><label>Role title<input value={title} onChange={(event) => setTitle(event.target.value)} required /></label><label>Company<input value={company} onChange={(event) => setCompany(event.target.value)} /></label></div><label>Job description<textarea rows={9} value={description} onChange={(event) => setDescription(event.target.value)} minLength={80} required /></label></>}{error && <div className="notice error"><CircleAlert size={16} />{error}. Try pasting the description instead.</div>}<button className="button button-primary button-full" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <ArrowRight size={17} />}{busy ? "Saving job…" : "Import automatically"}</button><small className="modal-footnote"><ShieldCheck size={14} /> You can leave while AI processing continues.</small></form></div>}
  </main>;
}

