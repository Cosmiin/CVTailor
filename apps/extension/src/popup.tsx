import { useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { Check, FileText, LoaderCircle, LogOut, ShieldCheck, Sparkles } from "lucide-react";
import { config, isConfigured } from "./config";
import { clearSession, getSession, signIn, validAccessToken, type StoredSession } from "./session";
import { extractVisibleJob, type CapturedJob } from "./capture";
import "./popup.css";

function Popup() {
  const [session, setSession] = useState<StoredSession>(); const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [success, setSuccess] = useState<{ id: string; title: string }>();
  useEffect(() => { getSession().then(setSession); }, []);
  const login = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(""); try { setSession(await signIn(email, password)); } catch (caught) { setError(caught instanceof Error ? caught.message : "Sign in failed."); } finally { setBusy(false); } };
  const capture = async () => {
    setBusy(true); setError("");
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id || !tab.url?.startsWith("http")) throw new Error("Open a job listing in this tab first.");
      const result = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractVisibleJob });
      const snapshot = result[0]?.result as CapturedJob | undefined;
      if (!snapshot || snapshot.description.length < 80) throw new Error("Not enough job text was found on this page.");
      const token = await validAccessToken();
      const response = await fetch(`${config.supabaseUrl}/functions/v1/import-job`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, apikey: config.publishableKey, "Content-Type": "application/json" },
        body: JSON.stringify({ ...snapshot, captureMethod: "extension" }),
      });
      const data = await response.json(); if (!response.ok || data.error) throw new Error(data.error || "Capture failed.");
      setSuccess({ id: data.job.id, title: data.job.title });
    } catch (caught) { setError(caught instanceof Error ? caught.message.replaceAll("_", " ") : "Capture failed."); } finally { setBusy(false); }
  };
  const open = () => success && chrome.runtime.sendMessage({ type: "OPEN_JOB", url: `${config.webAppUrl}/app/jobs/${success.id}` });
  if (!isConfigured) return <main className="popup"><Header /><div className="state"><FileText /><h2>Connect Supabase first</h2><p>Add the three VITE values to <code>apps/extension/.env.local</code>, then rebuild and reload the extension.</p></div></main>;
  if (!session) return <main className="popup"><Header /><form onSubmit={login}><div className="kicker">Private workspace</div><h2>Sign in to capture</h2><p>Use the same email and password as CV Maker.</p><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{error && <div className="error">{error}</div>}<button disabled={busy}>{busy && <LoaderCircle className="spin" />}Sign in</button></form></main>;
  if (success) return <main className="popup"><Header /><div className="state success"><span><Check /></span><div className="kicker">Job captured</div><h2>{success.title}</h2><p>It’s waiting in your private CV Maker workspace.</p><button onClick={open}>Open and tailor</button></div></main>;
  return <main className="popup"><Header /><div className="signed-in"><span>{session.email}</span><button onClick={async () => { await clearSession(); setSession(undefined); }}><LogOut /></button></div><div className="capture-card"><Sparkles /><div className="kicker">Current tab</div><h2>Tailor for this job</h2><p>We’ll capture only the visible page after you click below.</p>{error && <div className="error">{error}</div>}<button onClick={capture} disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <FileText />}{busy ? "Capturing…" : "Capture job"}</button><small><ShieldCheck /> Runs only on this tab, this time.</small></div></main>;
}

function Header() { return <header><span><FileText /></span><strong>CV Maker</strong></header>; }
createRoot(document.getElementById("root")!).render(<Popup />);
