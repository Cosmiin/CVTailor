import { useState } from "react";
import { CalendarDays, Check, Clock3, FileCheck2, LoaderCircle, Send } from "lucide-react";
import type { ApplicationStatus, TailoredCV } from "@cv-maker/shared";
import { dataApi, type JobRecord } from "../lib/data";

export const applicationStatuses: Array<{ value: ApplicationStatus; label: string }> = [
  { value: "applied", label: "Applied - awaiting response" },
  { value: "response_received", label: "Response received" },
  { value: "interviewing", label: "Interviewing" },
  { value: "offer", label: "Offer received" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
];

export const applicationStatusLabel = (status: ApplicationStatus) =>
  status === "not_applied" ? "Not applied" : applicationStatuses.find((item) => item.value === status)?.label ?? status;

const todayValue = () => {
  const today = new Date();
  const offset = today.getTimezoneOffset() * 60_000;
  return new Date(today.getTime() - offset).toISOString().slice(0, 10);
};

const dateInputValue = (value: string | null) => value?.slice(0, 10) ?? "";
const dateTimeValue = (value: string) => `${value}T12:00:00.000Z`;
const readableDate = (value: string | null) => value
  ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value))
  : "Not recorded";

const statusTone = (status: ApplicationStatus) => {
  if (status === "offer") return "success";
  if (status === "rejected" || status === "withdrawn") return "closed";
  if (status === "interviewing" || status === "response_received") return "active";
  return "waiting";
};

export function ApplicationTracker({
  job, cv, onChange, variant = "panel",
}: {
  job: JobRecord;
  cv?: TailoredCV | null;
  onChange: (job: JobRecord) => void;
  variant?: "panel" | "card";
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const availableCV = cv ?? job.latestTailoredCV;
  const applied = job.applicationStatus !== "not_applied";

  const save = async (status: ApplicationStatus, appliedAt = job.appliedAt) => {
    setBusy(true); setError("");
    try {
      const updated = await dataApi.updateApplication(job.id, {
        status,
        appliedAt: status === "not_applied" ? null : appliedAt ?? dateTimeValue(todayValue()),
        cv: !job.appliedCV && status !== "not_applied" ? availableCV ?? undefined : undefined,
      });
      onChange(updated);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update this application.");
    } finally { setBusy(false); }
  };

  if (!availableCV) return <div className={`application-tracker ${variant} unavailable`}><span>Application tracking</span><small>Tailor a CV first, then record when you apply.</small></div>;

  if (!applied) return <section className={`application-tracker ${variant}`} aria-label="Application tracking">
    <div className="application-tracker-intro"><span className="application-tracker-icon"><Send size={16} /></span><div><strong>Ready to apply?</strong><small>Save this exact CV and start tracking the response.</small></div></div>
    <button className="button button-small button-dark" onClick={() => save("applied", dateTimeValue(todayValue()))} disabled={busy}>{busy ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />}Mark as applied</button>
    {error && <small className="application-error" role="alert">{error}</small>}
  </section>;

  return <section className={`application-tracker ${variant}`} aria-label="Application tracking">
    <div className="application-tracker-heading"><div><span className="section-kicker">Application</span><strong className={`application-stage ${statusTone(job.applicationStatus)}`}>{applicationStatusLabel(job.applicationStatus)}</strong></div>{busy && <LoaderCircle className="spin" size={15} />}</div>
    <div className="application-controls">
      <label>Status<select aria-label={`Application status for ${job.title}`} value={job.applicationStatus} onChange={(event) => save(event.target.value as ApplicationStatus)} disabled={busy}>{applicationStatuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label>Applied on<input aria-label={`Application date for ${job.title}`} type="date" max={todayValue()} value={dateInputValue(job.appliedAt)} onChange={(event) => event.target.value && save(job.applicationStatus, dateTimeValue(event.target.value))} disabled={busy} /></label>
    </div>
    <div className="application-meta"><span><Clock3 size={13} /><span>Status changed <strong>{readableDate(job.applicationStatusChangedAt)}</strong></span></span><span><FileCheck2 size={13} /><span>CV used <strong>{job.appliedCV ? "Saved" : "Current tailored CV"}</strong></span></span><span><CalendarDays size={13} /><span>Applied <strong>{readableDate(job.appliedAt)}</strong></span></span></div>
    {error && <small className="application-error" role="alert">{error}</small>}
  </section>;
}
