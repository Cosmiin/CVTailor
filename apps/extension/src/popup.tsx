import { useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { Check, FileText, LoaderCircle, LogOut, ShieldCheck, Sparkles } from "lucide-react";
import { config, isConfigured } from "./config";
import { clearSession, getSession, signIn, validAccessToken, type StoredSession } from "./session";
import { extractVisibleJob, type CapturedJob } from "./capture";
import "./popup.css";

function Popup() {
  const [session, setSession] = useState<StoredSession>(); const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false); const [phase, setPhase] = useState<"idle" | "extracting" | "saving">("idle"); const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ id: string; title: string; company: string; parseStatus: "pending" | "completed" | "failed" }>();
  useEffect(() => { getSession().then(setSession); }, []);
  const login = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(""); try { setSession(await signIn(email, password)); } catch (caught) { setError(caught instanceof Error ? caught.message : "Sign in failed."); } finally { setBusy(false); } };
  const capture = async () => {
    setBusy(true); setPhase("extracting"); setError(""); setSuccess(undefined);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id || !tab.url?.startsWith("http")) throw new Error("Open a job listing in this tab first.");
      const result = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractVisibleJob });
      const snapshot = result[0]?.result as CapturedJob | undefined;
      if (!snapshot || snapshot.description.length < 80) throw new Error("Not enough job text was found on this page.");
      setPhase("saving");
      const token = await validAccessToken();
      const response = await fetch(`${config.supabaseUrl}/functions/v1/import-job`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, apikey: config.publishableKey, "Content-Type": "application/json" },
        body: JSON.stringify({ ...snapshot, captureMethod: "extension" }),
      });
      const data = await response.json(); if (!response.ok || data.error) throw new Error(data.error || "Capture failed.");
      setSuccess({
        id: data.job.id,
        title: data.job.title,
        company: data.job.company || "Company not identified",
        parseStatus: data.job.parse_status === "completed" ? "completed" : data.job.parse_status === "failed" ? "failed" : "pending",
      });
    } catch (caught) { setError(caught instanceof Error ? caught.message.replaceAll("_", " ") : "Capture failed."); } finally { setBusy(false); setPhase("idle"); }
  };
  const open = () => success && chrome.runtime.sendMessage({ type: "OPEN_JOB", url: `${config.webAppUrl}/app/jobs/${success.id}` });
  if (!isConfigured) return <main className="popup"><Header /><div className="state"><FileText /><h2>Connect Supabase first</h2><p>Add the three VITE values to <code>apps/extension/.env.local</code>, then rebuild and reload the extension.</p></div></main>;
  if (!session) return <main className="popup"><Header /><form onSubmit={login}><div className="kicker">Private workspace</div><h2>Sign in to capture</h2><p>Use the same email and password as CV Maker.</p><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{error && <div className="error">{error}</div>}<button disabled={busy}>{busy && <LoaderCircle className="spin" />}Sign in</button></form></main>;
  if (success) return <main className="popup"><Header /><div className="state success"><span><Check /></span><div className="kicker">{success.parseStatus === "completed" ? "Job ready" : "Capture saved"}</div><h2>{success.title}</h2><dl className="job-summary"><div><dt>Company</dt><dd>{success.company}</dd></div><div><dt>AI status</dt><dd>{success.parseStatus === "pending" ? "Processing in background" : success.parseStatus === "completed" ? "Details ready" : "Needs retry"}</dd></div></dl><p>{success.parseStatus === "pending" ? "You can close this popup. AI is organizing every job detail in the backend, and CV Maker will update automatically." : success.parseStatus === "completed" ? "The complete job profile is ready in CV Maker." : "AI parsing could not finish. Capture the posting again to retry."}</p>{success.parseStatus === "failed" && <button className="secondary" onClick={capture} disabled={busy}>Retry AI parsing</button>}<button onClick={open}>Open in CV Maker</button></div></main>;
  const busyLabel = phase === "extracting" ? "Extracting page…" : phase === "saving" ? "Saving capture…" : "Capture job";
  return <main className="popup"><Header /><div className="signed-in"><span>{session.email}</span><button onClick={async () => { await clearSession(); setSession(undefined); }}><LogOut /></button></div><div className="capture-card"><Sparkles /><div className="kicker">Current tab</div><h2>Capture this job</h2><p>We’ll read the visible listing, identify its details with AI, and save it automatically.</p>{error && <div className="error">{error}</div>}<button onClick={capture} disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <FileText />}{busyLabel}</button><small><ShieldCheck /> Runs only on this tab, this time.</small></div></main>;
}

function Header() { return <header><span><FileText /></span><strong>CV Maker</strong></header>; }
createRoot(document.getElementById("root")!).render(<Popup />);
