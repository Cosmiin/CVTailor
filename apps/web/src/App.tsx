import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowDown, ArrowRight, ArrowUp, BadgeCheck, BriefcaseBusiness, Check, ChevronRight, CircleAlert,
  Download, ExternalLink, FileCheck2, FileText, Gauge, Globe2, LayoutDashboard, Link2, LoaderCircle, LockKeyhole,
  LogOut, Menu, PencilLine, Plus, RefreshCw, Settings, ShieldCheck, Sparkles, Trash2, Upload, UserRound,
  WandSparkles, X,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import {
  baseCVSchema, createId, demoCV, emptyBaseCV, hasUnconfirmedClaims,
  type AiUsageSummary, type BaseCV, type CVTemplateId, type ExperienceEnrichment, type ExperienceEvidence, type JobInterviewAnswer,
  type JobTailoringSession, type ProposedExperienceEvidence, type TailoredCV,
} from "@cv-maker/shared";
import { CVPreview } from "./components/CVPreview";
import { ApplicationTracker } from "./components/ApplicationTracker";
import { ApplicationsPage } from "./components/ApplicationsPage";
import { CVForm as CompleteCVForm } from "./components/CVForm";
import { EvidenceLibrary } from "./components/EvidenceLibrary";
import { ExperienceInterview } from "./components/ExperienceInterview";
import { JobEvidenceInterview } from "./components/JobEvidenceInterview";
import { JobParseRecovery } from "./components/JobParseRecovery";
import { dataApi, type JobRecord } from "./lib/data";
import { extractCVText } from "./lib/extract";
import { appUrl, isSupabaseConfigured, supabase } from "./lib/supabase";
import { formatDurationSeconds, formatTokenCount, formatUsdCost } from "./lib/usage";

const formatDate = (value: string) => new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
const errorMessage = (error: unknown) => error instanceof Error ? error.message.replaceAll("_", " ") : "Something went wrong.";
const exportPDF = async (cv: TailoredCV, job: Pick<JobRecord, "company" | "title">) =>
  (await import("./lib/export")).exportPDF(cv, { company: job.company, role: job.title });
const exportDOCX = async (cv: TailoredCV, job: Pick<JobRecord, "company" | "title">) =>
  (await import("./lib/export")).exportDOCX(cv, { company: job.company, role: job.title });

function Brand({ inverse = false }: { inverse?: boolean }) {
  return <Link to="/" className={`brand ${inverse ? "brand-inverse" : ""}`} aria-label="CV Maker home"><span className="brand-mark"><FileText size={17} /></span><span>CV Maker</span></Link>;
}

function Landing() {
  return <div className="landing">
    <nav className="landing-nav"><Brand /><div className="nav-actions"><a href="#how">How it works</a><Link className="button button-ghost" to="/auth">Sign in</Link><Link className="button button-dark" to="/app">{isSupabaseConfigured ? "Create your CV" : "Try the demo"}<ArrowRight size={16} /></Link></div></nav>
    <main>
      <section className="hero">
        <div className="hero-copy"><div className="eyebrow"><Sparkles size={14} /> Truthful tailoring, without the blank page</div><h1>Your experience.<br /><em>Right for the role.</em></h1><p>Turn one trusted career profile into a clear, ATS-ready CV for every job—without inventing a thing.</p><div className="hero-actions"><Link className="button button-primary button-large" to="/app">Build a tailored CV <ArrowRight size={18} /></Link><span><ShieldCheck size={17} /> You approve every claim</span></div></div>
        <div className="hero-demo" aria-label="Illustration of a tailored CV"><div className="job-pill"><span className="signal-dot" /> Senior Product Operations Manager</div><div className="document-stack"><div className="paper paper-back" /><div className="paper paper-front"><div className="paper-head"><div><strong>Alex Morgan</strong><small>Product Operations Lead</small></div><BadgeCheck size={22} /></div><div className="paper-line wide" /><div className="paper-line" /><div className="paper-section">Profile</div><p>Operations leader aligning planning, experimentation and customer insight to improve product outcomes.</p><div className="paper-section">Experience</div><div className="paper-role"><strong>Product Operations Lead</strong><span>2022—Now</span></div><div className="paper-line wide" /><div className="paper-line medium" /><div className="paper-tag-row"><span>Planning systems</span><span>Customer insight</span><span>Experimentation</span></div></div></div><div className="proof-card"><Check size={15} /> 11 facts verified <span>1 to review</span></div></div>
      </section>
      <section className="trust-strip"><span>One source of truth</span><span>•</span><span>Two ATS-ready templates</span><span>•</span><span>PDF & DOCX export</span><span>•</span><span>Your data stays private</span></section>
      <section id="how" className="how-section"><div className="section-kicker">A calmer way to apply</div><div className="section-heading"><h2>From job post to ready-to-send CV.</h2><p>Keep the facts. Change the focus. Every step stays visible and under your control.</p></div><div className="steps"><article><span>01</span><Upload /><h3>Build your source</h3><p>Upload PDF or DOCX, then correct the structured career profile once.</p></article><article><span>02</span><Link2 /><h3>Bring the role</h3><p>Paste a link, add the description, or capture it from Chrome in one click.</p></article><article><span>03</span><WandSparkles /><h3>Tailor with evidence</h3><p>AI reshapes verified experience. Inferences are clearly flagged for approval.</p></article><article><span>04</span><FileCheck2 /><h3>Edit and export</h3><p>Choose an ATS layout, make final edits, then download PDF or DOCX.</p></article></div></section>
      <section className="principles"><div><div className="section-kicker light">Built for confidence</div><h2>A strong CV should sound like you—on your best, clearest day.</h2></div><div className="principle-list"><article><ShieldCheck /><div><h3>Truth has a paper trail</h3><p>Every rewritten item carries its source. Suggested skills cannot enter an export until you confirm them.</p></div></article><article><Gauge /><div><h3>Designed for focus</h3><p>No vanity score or keyword theatre—just the strongest relevant version of your real experience.</p></div></article><article><LockKeyhole /><div><h3>Private by design</h3><p>Your CV files live in private storage with row-level access controls and complete account deletion.</p></div></article></div></section>
      <section className="final-cta"><div><span className="section-kicker">Your next application</span><h2>Start with the experience you already have.</h2></div><Link className="button button-primary button-large" to="/app">Make it fit the moment <ArrowRight size={18} /></Link></section>
    </main><footer><Brand /><p>© 2026 CV Maker. Built for honest applications.</p><div><a href="#how">How it works</a><Link to="/auth">Sign in</Link></div></footer>
  </div>;
}

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [name, setName] = useState("");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      if (!supabase) { navigate("/app"); return; }
      if (mode === "signup") {
        const result = await supabase.auth.signUp({ email, password, options: { data: { display_name: name }, emailRedirectTo: `${appUrl}/app` } });
        if (result.error) throw result.error; setMessage("Check your inbox to verify your email, then sign in.");
      } else if (mode === "reset") {
        const result = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${appUrl}/auth` });
        if (result.error) throw result.error; setMessage("Password reset instructions are on their way.");
      } else {
        const result = await supabase.auth.signInWithPassword({ email, password });
        if (result.error) throw result.error; navigate("/app");
      }
    } catch (caught) { setError(errorMessage(caught)); } finally { setBusy(false); }
  };
  return <div className="auth-page"><div className="auth-aside"><Brand inverse /><div><div className="eyebrow dark"><Sparkles size={14} /> A better starting point</div><h1>One trusted CV.<br />Every role, considered.</h1><p>Keep a private career profile, capture the job, and shape a version that is relevant without drifting from the truth.</p></div><small>Private by design · Export anytime</small></div><main className="auth-main"><Link to="/" className="auth-back">← Back home</Link><form className="auth-card" onSubmit={submit}><div><span className="section-kicker">{mode === "signup" ? "Create your workspace" : mode === "reset" ? "Reset your password" : "Welcome back"}</span><h2>{mode === "signup" ? "Start tailoring with confidence." : mode === "reset" ? "We’ll send a secure link." : "Continue your applications."}</h2></div>{mode === "signup" && <label>Full name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required /></label>}<label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>{mode !== "reset" && <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={8} required /></label>}{error && <div className="notice error"><CircleAlert size={16} />{error}</div>}{message && <div className="notice success"><Check size={16} />{message}</div>}<button className="button button-primary button-full" disabled={busy}>{busy && <LoaderCircle className="spin" size={16} />}{mode === "signup" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in"}</button><div className="auth-switch">{mode === "signin" ? <><button type="button" onClick={() => setMode("reset")}>Forgot password?</button><span>New here? <button type="button" onClick={() => setMode("signup")}>Create an account</button></span></> : <span>Already have an account? <button type="button" onClick={() => setMode("signin")}>Sign in</button></span>}</div>{!isSupabaseConfigured && <div className="demo-note"><Sparkles size={15} /><span>Supabase is not configured, so this runs as a browser-only demo.</span></div>}</form></main></div>;
}

function AppShell({ session }: { session: Session | null }) {
  const location = useLocation(); const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false); const [isAdmin, setIsAdmin] = useState(false);
  const [quota, setQuota] = useState<{ limit: number; used: number; remaining: number } | null>(null);
  const refreshQuota = useCallback(() => dataApi.getQuota().then(setQuota).catch(() => undefined), []);
  useEffect(() => { refreshQuota(); if (supabase) supabase.from("admins").select("user_id").maybeSingle().then(({ data }) => setIsAdmin(Boolean(data))); }, [refreshQuota]);
  const logout = async () => { await supabase?.auth.signOut(); navigate("/"); };
  const nav = [{ to: "/app", label: "Applications", icon: BriefcaseBusiness }, { to: "/app/base-cv", label: "Base CV", icon: UserRound }, { to: "/app/settings", label: "Settings", icon: Settings }, ...(isAdmin || !isSupabaseConfigured ? [{ to: "/app/admin", label: "Admin", icon: Gauge }] : [])];
  return <div className="app-shell"><aside className={mobileOpen ? "sidebar open" : "sidebar"}><div className="sidebar-top"><Brand inverse /><button className="icon-button close-mobile" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X /></button></div><nav>{nav.map(({ to, label, icon: Icon }) => <Link key={to} to={to} onClick={() => setMobileOpen(false)} className={(to === "/app" ? location.pathname === to || location.pathname.startsWith("/app/jobs") : location.pathname.startsWith(to)) ? "active" : ""}><Icon size={18} />{label}</Link>)}</nav><div className="sidebar-bottom">{quota && <div className="quota-card"><div><span>Monthly tailoring</span><strong>{quota.remaining} left</strong></div><div className="quota-track"><span style={{ width: `${quota.limit ? Math.min((quota.used / quota.limit) * 100, 100) : 100}%` }} /></div><small>{quota.used} of {quota.limit} runs used</small></div>}<div className="user-chip"><span>{(session?.user.email || "Demo user").slice(0, 1).toUpperCase()}</span><div><strong>{session?.user.user_metadata.display_name || "Demo user"}</strong><small>{session?.user.email || "Local workspace"}</small></div>{supabase && <button className="icon-button" onClick={logout} aria-label="Sign out"><LogOut size={17} /></button>}</div></div></aside><div className="app-area"><header className="mobile-header"><button className="icon-button" onClick={() => setMobileOpen(true)}><Menu /></button><Brand />{quota && <span className="mobile-quota">{quota.remaining} left</span>}</header><Routes><Route index element={<JobsPage onUsage={refreshQuota} />} /><Route path="jobs/:jobId" element={<JobEditorPage onUsage={refreshQuota} />} /><Route path="base-cv" element={<BaseCVPage />} /><Route path="settings" element={<SettingsPage onLogout={logout} />} /><Route path="admin" element={<AdminPage />} /></Routes></div></div>;
}

function JobsPage({ onUsage }: { onUsage: () => void }) {
  return <ApplicationsPage onUsage={onUsage} />;
}
function BaseCVPage() {
  const [cv, setCV] = useState<BaseCV | null>(null); const [enrichments, setEnrichments] = useState<Record<string, ExperienceEnrichment>>({}); const [evidence, setEvidence] = useState<ExperienceEvidence[]>([]); const [interviewId, setInterviewId] = useState<string | null>(null); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [saved, setSaved] = useState(false); const [error, setError] = useState(""); const [fileBusy, setFileBusy] = useState(false); const pendingFile = useRef<File | undefined>(undefined); const first = useRef(true);
  const [baseView, setBaseView] = useState<"editor" | "evidence">("editor");
  const [selectedEvidenceExperienceId, setSelectedEvidenceExperienceId] = useState<string | null>(null);
  useEffect(() => { Promise.all([dataApi.getBaseCV(), dataApi.listExperienceEnrichments(), dataApi.listExperienceEvidence()]).then(([value, records, savedEvidence]) => { setCV(value ?? emptyBaseCV()); setEnrichments(Object.fromEntries(records.map((record) => [record.experienceId, record]))); setEvidence(savedEvidence); }).catch((caught) => setError(errorMessage(caught))).finally(() => setLoading(false)); }, []);
  useEffect(() => { if (!cv || loading || first.current) { first.current = false; return; } setSaved(false); const timer = setTimeout(async () => { setSaving(true); try { await dataApi.saveBaseCV(cv, pendingFile.current); pendingFile.current = undefined; setSaved(true); } catch (caught) { setError(errorMessage(caught)); } finally { setSaving(false); } }, 900); return () => clearTimeout(timer); }, [cv, loading]);
  const changeCV = (next: BaseCV) => {
    const removed = cv?.experience.filter((item) => !next.experience.some((candidate) => candidate.id === item.id)).map((item) => item.id) ?? [];
    setCV(next);
    removed.forEach((id) => Promise.all([dataApi.deleteExperienceContext(id), dataApi.deleteRoleEvidence(id)]).then(() => { setEnrichments((current) => { const copy = { ...current }; delete copy[id]; return copy; }); setEvidence((current) => current.filter((item) => item.experienceId !== id)); }).catch((caught) => setError(errorMessage(caught))));
  };
  const upload = async (file?: File) => {
    if (!file) return; setFileBusy(true); setError("");
    try {
      const text = await extractCVText(file);
      if (supabase) {
        const { data, error: invokeError } = await supabase.functions.invoke("parse-cv", { body: { text, fileName: file.name } });
        if (invokeError || data?.error) throw new Error(data?.error || invokeError.message); changeCV(baseCVSchema.parse(data.cv));
      } else changeCV({ ...demoCV, contact: { ...demoCV.contact, fullName: file.name.replace(/\.(pdf|docx)$/i, "") || demoCV.contact.fullName } });
      pendingFile.current = file;
    } catch (caught) { setError(errorMessage(caught)); } finally { setFileBusy(false); }
  };
  if (loading || !cv) return <Loading />;
  const interviewExperience = interviewId ? cv.experience.find((item) => item.id === interviewId) : null;
  const updateEnrichment = (record: ExperienceEnrichment | null) => { if (!interviewId) return; setEnrichments((current) => { const next = { ...current }; if (record) next[interviewId] = record; else delete next[interviewId]; return next; }); };
  const openInterview = async (id: string) => { try { await dataApi.saveBaseCV(cv); setInterviewId(id); } catch (caught) { setError(errorMessage(caught)); } };
  const confirmContext = async (id: string) => { try { await dataApi.saveBaseCV(cv); const record = await dataApi.confirmExperienceContext(id); setEnrichments((current) => ({ ...current, [id]: record })); } catch (caught) { setError(errorMessage(caught)); } };
  const deleteContext = async (id: string) => { if (!window.confirm("Remove the supporting evidence created through this role interview?")) return; try { await dataApi.deleteExperienceContext(id); setEnrichments((current) => { const next = { ...current }; delete next[id]; return next; }); } catch (caught) { setError(errorMessage(caught)); } };
  const commitPhotoPreference = async (next: BaseCV) => { setCV(next); setSaving(true); setError(""); try { await dataApi.saveBaseCV(next, pendingFile.current); pendingFile.current = undefined; setSaved(true); } catch (caught) { setError(errorMessage(caught)); } finally { setSaving(false); } };
  const editEvidence = async (id: string, input: { label: string; statement: string }) => { try { await dataApi.updateExperienceEvidence(id, input); setEvidence((current) => current.map((item) => item.id === id ? { ...item, ...input, confirmedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : item)); } catch (caught) { setError(errorMessage(caught)); } };
  const deleteEvidence = async (id: string) => { if (!window.confirm("Remove this saved evidence?")) return; try { await dataApi.deleteExperienceEvidence(id); setEvidence((current) => current.filter((item) => item.id !== id)); } catch (caught) { setError(errorMessage(caught)); } };
  const selectBaseView = (view: "editor" | "evidence") => setBaseView(view);
  const viewRoleEvidence = (experienceId: string) => {
    setSelectedEvidenceExperienceId(experienceId); setBaseView("evidence");
    window.requestAnimationFrame(() => document.getElementById("selected-evidence-role")?.focus());
  };
  return <main className="workspace editor-workspace">
    <header className="workspace-header"><div><span className="section-kicker">Your source of truth</span><h1>Base CV</h1><p>Build the CV employers see, then keep deeper supporting evidence ready for relevant applications.</p></div><div className="save-state">{saving ? <><LoaderCircle className="spin" size={15} /> Saving</> : saved ? <><Check size={15} /> Saved</> : "Autosave on"}</div></header>
    <div className="base-page-actions"><div className="base-view-tabs" role="tablist" aria-label="Base CV workspace"><button id="base-editor-tab" role="tab" aria-selected={baseView === "editor"} aria-controls="base-editor-panel" tabIndex={baseView === "editor" ? 0 : -1} className={baseView === "editor" ? "active" : ""} onClick={() => selectBaseView("editor")} onKeyDown={(event) => { if (event.key === "ArrowRight") { event.preventDefault(); selectBaseView("evidence"); document.getElementById("base-evidence-tab")?.focus(); } }}><PencilLine size={15} />CV Editor</button><button id="base-evidence-tab" role="tab" aria-selected={baseView === "evidence"} aria-controls="base-evidence-panel" tabIndex={baseView === "evidence" ? 0 : -1} className={baseView === "evidence" ? "active" : ""} onClick={() => selectBaseView("evidence")} onKeyDown={(event) => { if (event.key === "ArrowLeft") { event.preventDefault(); selectBaseView("editor"); document.getElementById("base-editor-tab")?.focus(); } }}><ShieldCheck size={15} />Evidence Library<span>{evidence.length + Object.values(enrichments).filter((item) => item.active).length}</span></button></div>{baseView === "editor" && <div className="base-toolbar"><label className="button button-ghost file-button">{fileBusy ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />} {fileBusy ? "Reading file…" : "Replace from PDF or DOCX"}<input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => upload(event.target.files?.[0])} /></label><span>We extract the facts first, then you can correct or expand every section below.</span></div>}</div>
    {error && <div className="notice error"><CircleAlert size={16} />{error}</div>}
    <div className="editor-layout">
      <div id={baseView === "editor" ? "base-editor-panel" : "base-evidence-panel"} role="tabpanel" aria-labelledby={baseView === "editor" ? "base-editor-tab" : "base-evidence-tab"}>
        {baseView === "editor" ? <CompleteCVForm cv={cv} onChange={changeCV} baseMode enrichments={enrichments} evidence={evidence} onOpenInterview={openInterview} onViewEvidence={viewRoleEvidence} onPhotoCommit={commitPhotoPreference} /> : <EvidenceLibrary cv={cv} enrichments={enrichments} evidence={evidence} selectedExperienceId={selectedEvidenceExperienceId} onSelectExperience={setSelectedEvidenceExperienceId} onOpenInterview={openInterview} onConfirmContext={confirmContext} onDeleteContext={deleteContext} onEditEvidence={editEvidence} onDeleteEvidence={deleteEvidence} />}
      </div>
      <div className={`preview-column sticky ${baseView === "evidence" ? "evidence-preview" : ""}`}><div className="preview-label"><span>Live base CV</span><small>{baseView === "evidence" ? "Supporting evidence stays private" : "Updates as you edit"}</small></div><CVPreview cv={cv} /></div>
    </div>
    {interviewExperience && <ExperienceInterview experience={interviewExperience} record={enrichments[interviewExperience.id] ?? null} onChange={updateEnrichment} onClose={() => setInterviewId(null)} />}
  </main>;
}

function JobEditorPage({ onUsage }: { onUsage: () => void }) {
  const { jobId } = useParams(); const navigate = useNavigate(); const [job, setJob] = useState<JobRecord | null>(null); const [cv, setCV] = useState<TailoredCV | null>(null); const [baseCV, setBaseCV] = useState<BaseCV | null>(null); const [snapshot, setSnapshot] = useState<TailoredCV | null>(null); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [saved, setSaved] = useState(true); const firstSave = useRef(true);
  const [interviewSession, setInterviewSession] = useState<JobTailoringSession | null>(null); const [interviewOpen, setInterviewOpen] = useState(false); const [interviewError, setInterviewError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);
  useEffect(() => { if (!jobId) return; Promise.all([dataApi.getJob(jobId), dataApi.getBaseCV(), dataApi.getJobInterview(jobId)]).then(([found, base, session]) => { const latest = found?.latestTailoredCV ? { ...found.latestTailoredCV, photo: base?.photo ?? null } : null; setJob(found ? { ...found, latestTailoredCV: latest } : null); setBaseCV(base); setCV(latest); setSnapshot(latest); setInterviewSession(session); }).catch((caught) => setError(errorMessage(caught))).finally(() => setLoading(false)); }, [jobId]);
  useEffect(() => {
    if (!jobId || job?.parseStatus !== "pending") return;
    const timer = window.setInterval(async () => {
      try {
        const refreshed = await dataApi.refreshJobParse(jobId);
        setJob(refreshed);
      } catch { /* Keep the saved capture visible and retry on the next poll. */ }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [jobId, job?.parseStatus]);
  useEffect(() => { if (!cv || !job || firstSave.current) { firstSave.current = false; return; } setSaved(false); const timer = setTimeout(() => dataApi.saveTailoredJob(job.id, cv).then(() => setSaved(true)).catch((caught) => setError(errorMessage(caught))), 800); return () => clearTimeout(timer); }, [cv, job]);
  const runInterviewAction = async (action: () => Promise<JobTailoringSession>) => { setBusy(true); setInterviewError(""); try { const session = await action(); setInterviewSession(session); } catch (caught) { setInterviewError(errorMessage(caught)); throw caught; } finally { setBusy(false); } };
  const tailor = async () => {
    if (!job || job.parseStatus !== "completed") return;
    setBusy(true); setError(""); setInterviewError("");
    try { const session = await dataApi.analyzeJobInterview(job.id); setInterviewSession(session); setInterviewOpen(true); }
    catch (caught) { setError(errorMessage(caught)); }
    finally { setBusy(false); }
  };
  const retryJobParsing = async () => {
    if (!job) return;
    setBusy(true); setError("");
    try { const updated = await dataApi.retryJobParse(job.id); setJob(updated); }
    catch (caught) { setError(errorMessage(caught)); }
    finally { setBusy(false); }
  };
  const saveManualJob = async (input: { title: string; company: string; description: string }) => {
    if (!job) return;
    setBusy(true); setError("");
    try { const updated = await dataApi.saveManualJob(job.id, input); setJob(updated); setInterviewSession(null); }
    catch (caught) { setError(errorMessage(caught)); throw caught; }
    finally { setBusy(false); }
  };
  const generateTailoredCV = async () => {
    if (!job || !interviewSession) return;
    setBusy(true); setGenerating(true); setInterviewError("");
    try { const result = await dataApi.tailorJob(job, job.templateId, interviewSession.id); setCV(result); setSnapshot(result); setJob({ ...job, latestTailoredCV: result }); setInterviewOpen(false); setInterviewSession(null); onUsage(); }
    catch (caught) { setInterviewError(errorMessage(caught)); }
    finally { setBusy(false); setGenerating(false); }
  };
  const saveInterviewAnswer = async (answer: JobInterviewAnswer, currentIndex: number) => { if (!job || !interviewSession) return; await runInterviewAction(() => dataApi.saveJobInterviewAnswer(job.id, interviewSession.id, answer, currentIndex)); };
  const reconfirmEvidence = async (ids: string[]) => { if (!job || !interviewSession) return; await runInterviewAction(() => dataApi.reconfirmJobEvidence(job.id, interviewSession.id, ids)); };
  const synthesizeEvidence = async () => { if (!job || !interviewSession) return; await runInterviewAction(() => dataApi.synthesizeJobEvidence(job.id, interviewSession.id)); };
  const approveEvidence = async (evidence: ProposedExperienceEvidence[]) => { if (!job || !interviewSession) return; await runInterviewAction(() => dataApi.approveJobEvidence(job.id, interviewSession.id, evidence)); };
  const discardInterview = async () => { if (!job || !interviewSession) return; setBusy(true); try { await dataApi.discardJobInterview(job.id, interviewSession.id); setInterviewSession(null); setInterviewOpen(false); } catch (caught) { setInterviewError(errorMessage(caught)); } finally { setBusy(false); } };
  const download = async (format: "pdf" | "docx") => {
    if (!cv || !job || exporting) return;
    setExporting(format); setError("");
    try {
      if (format === "pdf") await exportPDF(cv, job); else await exportDOCX(cv, job);
    } catch (caught) {
      setError(`Could not create the ${format.toUpperCase()} file. ${errorMessage(caught)}`);
    } finally { setExporting(null); }
  };
  const interview = interviewOpen && interviewSession && baseCV ? <JobEvidenceInterview session={interviewSession} experiences={baseCV.experience} busy={busy} generating={generating} error={interviewError} onClose={() => setInterviewOpen(false)} onSaveAnswer={saveInterviewAnswer} onReconfirm={reconfirmEvidence} onSynthesize={synthesizeEvidence} onApprove={approveEvidence} onGenerate={generateTailoredCV} onDiscard={discardInterview} /> : null;
  if (loading) return <Loading />; if (!job) return <main className="workspace"><div className="empty-state"><h2>Job not found</h2><button className="button" onClick={() => navigate("/app")}>Back to jobs</button></div></main>;
  if (!cv) return <main className="workspace"><button className="back-link" onClick={() => navigate("/app")}>← All jobs</button><div className="tailor-intro"><div><span className="company-avatar large">{(job.company || job.title)[0]}</span><span className="section-kicker">{job.parseStatus === "pending" ? "AI processing in the background" : job.parseStatus === "failed" ? "Job parsing needs attention" : "Ready to tailor"}</span><h1>{job.title}</h1><p className="tailor-company">{job.company || "Company not set"}</p><p>{job.parseStatus === "pending" ? "Your job is safely saved. You can leave this page and come back—every parsed detail will appear here automatically." : "CV Maker will check important requirements against your saved evidence and ask only when a useful fact is unclear."}</p>{error && <div className="notice error"><CircleAlert size={16} />{error}</div>}<button className="button button-primary button-large" onClick={tailor} disabled={busy || job.parseStatus !== "completed"}>{busy ? <LoaderCircle className="spin" /> : job.parseStatus === "pending" ? <LoaderCircle className="spin" /> : <WandSparkles />}{busy ? "Checking evidence…" : job.parseStatus === "pending" ? "Organizing job details…" : interviewSession ? "Resume tailoring" : "Tailor my CV"}</button></div><div className="tailor-facts"><article><ShieldCheck /><div><strong>Facts stay grounded</strong><span>Contact details, dates and employers cannot be invented.</span></div></article><article><PencilLine /><div><strong>Questions only when useful</strong><span>Skip anything you cannot or do not want to confirm.</span></div></article><article><FileCheck2 /><div><strong>Evidence stays reusable</strong><span>Approved facts can reduce questions in future applications.</span></div></article></div></div><JobDetails job={job} busy={busy} onRetry={retryJobParsing} onSaveManual={saveManualJob} />{interview}</main>;
  return <main className="workspace editor-workspace"><header className="job-editor-header"><div><button className="back-link" onClick={() => navigate("/app")}>← All applications</button><span className="section-kicker">Tailored for</span><h1>{job.title}</h1><p>{job.company}</p></div><div className="editor-header-actions"><span className="save-state">{saved ? <><Check size={14} /> Saved</> : <><LoaderCircle className="spin" size={14} /> Saving</>}</span><button className="button button-ghost" onClick={() => snapshot && setCV(structuredClone(snapshot))} disabled={!snapshot}><RefreshCw size={15} /> Undo edits</button><button className="button button-ghost" onClick={tailor} disabled={busy}>{busy ? <LoaderCircle className="spin" size={15} /> : <WandSparkles size={15} />} {interviewSession ? "Resume re-tailoring" : "Re-tailor"}</button></div></header>{error && <div className="notice error"><CircleAlert size={16} />{error}</div>}<ApplicationTracker job={job} cv={cv} onChange={setJob} /><JobDetails job={job} busy={busy} onRetry={retryJobParsing} onSaveManual={saveManualJob} /><div className="editor-layout"><div><InferencePanel cv={cv} onChange={setCV} /><CompleteCVForm cv={cv} onChange={(value) => setCV({ ...cv, ...value })} /></div><div className="preview-column sticky"><div className="preview-toolbar"><div className="segmented compact"><button className={cv.templateId === "clarity" ? "active" : ""} onClick={() => setCV({ ...cv, templateId: "clarity" })}>Clarity</button><button className={cv.templateId === "compact" ? "active" : ""} onClick={() => setCV({ ...cv, templateId: "compact" })}>Compact</button></div><div className="export-actions"><button className="button button-small button-ghost" onClick={() => download("pdf")} disabled={Boolean(exporting)} title={hasUnconfirmedClaims(cv) ? "Unconfirmed items are omitted" : "Download PDF"}>{exporting === "pdf" ? <LoaderCircle className="spin" size={14} /> : <Download size={14} />}PDF</button><button className="button button-small button-dark" onClick={() => download("docx")} disabled={Boolean(exporting)}>{exporting === "docx" ? <LoaderCircle className="spin" size={14} /> : <Download size={14} />}DOCX</button></div></div>{hasUnconfirmedClaims(cv) && <div className="export-warning"><CircleAlert size={14} />Unconfirmed items are omitted from exports.</div>}<CVPreview cv={cv} templateId={cv.templateId} /></div></div>{interview}</main>;
}

function JobDetails({ job, busy = false, onRetry, onSaveManual }: { job: JobRecord; busy?: boolean; onRetry?: () => Promise<void>; onSaveManual?: (input: { title: string; company: string; description: string }) => Promise<void> }) {
  const details = job.structuredData;
  const sourceLink = /^https?:\/\//i.test(job.url) ? <a className="job-source-link" href={job.url} target="_blank" rel="noreferrer"><ExternalLink size={15} />View original job posting</a> : null;
  if (!details && job.parseStatus === "failed" && onRetry && onSaveManual) return <JobParseRecovery job={job} busy={busy} onRetry={onRetry} onSaveManual={onSaveManual} />;
  if (!details) return <section className={`job-processing ${job.parseStatus}`}><div>{job.parseStatus === "pending" ? <LoaderCircle className="spin" size={20} /> : <CircleAlert size={20} />}<span><strong>{job.parseStatus === "pending" ? "AI is organizing this job" : "Job details are unavailable"}</strong><small>{job.parseStatus === "pending" ? "The reliable background parser is still working. This page refreshes automatically when every section is ready." : "Open this job to add its details manually."}</small></span></div>{sourceLink}</section>;
  const compensation = details.compensation;
  const pay = compensation.minimum !== null || compensation.maximum !== null
    ? `${compensation.minimum ?? "—"}–${compensation.maximum ?? "—"} ${compensation.currency ?? ""}${compensation.period ? ` / ${compensation.period}` : ""}`
    : "Not specified";
  const list = (title: string, items: string[]) => items.length > 0 ? <section><h3>{title}</h3><ul>{items.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}</ul></section> : null;
  const legacyKeyword = (value: string) => value
    .replace(/^(ability to understand and use|knowledge of|basic understanding of|experience with|proven experience in|strong|excellent)\s+/i, "")
    .replace(/\b(such as|for example|including)\b.*$/i, "")
    .replace(/\band (?:the )?ability to\b.*$/i, "")
    .replace(/\s+for initial prototypes$/i, "")
    .trim().split(/\s+/).slice(0, 6).join(" ");
  const keywordSource = details.atsKeywords?.length
    ? details.atsKeywords
    : [details.title, ...details.requirements.skills.map(legacyKeyword)];
  const atsKeywords = [...new Set(keywordSource.map((keyword) => keyword.trim()).filter(Boolean))].slice(0, 15);
  return <details className="job-details" open={!job.latestTailoredCV}><summary><span><Sparkles size={17} />AI-organized job details</span><ChevronRight /></summary><div className="job-details-body"><div className="job-details-lead"><div><span className="section-kicker">{details.company.displayName}</span><h2>{details.title}</h2>{details.company.legalName && details.company.legalName !== details.company.displayName && <small>Legal name: {details.company.legalName}</small>}</div>{sourceLink}</div>{details.company.description && <p className="job-company-description">{details.company.description}</p>}{atsKeywords.length > 0 && <section className="ats-keywords"><div><span className="section-kicker">Proposed ATS keywords</span><p>Priority terms from this job posting. Use them only where your experience genuinely supports them.</p></div><div>{atsKeywords.map((keyword) => <span key={keyword}>{keyword}</span>)}</div></section>}<div className="job-fact-grid"><div><small>Location</small><strong>{details.location.original || [details.location.city, details.location.country].filter(Boolean).join(", ") || "Not specified"}</strong></div><div><small>Arrangement</small><strong>{details.location.remotePolicy === "unknown" ? "Not specified" : details.location.remotePolicy}</strong></div><div><small>Employment</small><strong>{details.employmentType || "Not specified"}</strong></div><div><small>Seniority</small><strong>{details.seniority || "Not specified"}</strong></div><div><small>Compensation</small><strong>{pay}</strong></div><div><small>Posted</small><strong>{details.datePosted || "Not provided"}</strong></div><div><small>Closing date</small><strong>{details.validThrough || "Not provided"}</strong></div><div><small>Language</small><strong>{details.sourceLanguage || "Not identified"}</strong></div></div>{details.summary && <section className="job-narrative"><h3>Role overview</h3><p>{details.summary}</p></section>}<div className="job-list-grid">{list("Responsibilities", details.responsibilities)}{list("Required qualifications", details.requirements.required)}{list("Preferred qualifications", details.requirements.preferred)}{list("Skills", details.requirements.skills)}{list("Experience", details.requirements.experience)}{list("Education", details.requirements.education)}{list("Benefits", details.benefits)}{details.languages.length > 0 && <section><h3>Languages</h3><ul>{details.languages.map((item, index) => <li key={`${item.name}-${index}`}>{item.name}{item.level ? ` — ${item.level}` : ""}</li>)}</ul></section>}</div><details className="job-clean-description"><summary>Complete cleaned job description <ChevronRight size={15} /></summary><p>{details.cleanDescription}</p></details>{details.warnings.length > 0 && <div className="job-warnings"><CircleAlert size={14} /><span><strong>Parsing notes</strong>{details.warnings.join(" ")}</span></div>}</div></details>;
}

function InferencePanel({ cv, onChange }: { cv: TailoredCV; onChange: (cv: TailoredCV) => void }) {
  const inferred = cv.skills.filter((item) => item.provenance.status === "inferred_unconfirmed");
  if (!inferred.length) return null;
  const decide = (id: string, accept: boolean) => onChange({ ...cv, skills: cv.skills.flatMap((item) => item.id !== id ? [item] : accept ? [{ ...item, provenance: { ...item.provenance, status: "confirmed_by_user" as const } }] : []) });
  return <section className="inference-panel"><div><span className="section-kicker">Needs your review</span><h2>{inferred.length} inferred {inferred.length === 1 ? "skill" : "skills"}</h2><p>Only accept what you can confidently discuss in an interview.</p></div>{inferred.map((item) => <article key={item.id}><div><strong>{item.text}</strong><span>{item.provenance.rationale || "Suggested from the job description."}</span></div><button className="icon-button reject" onClick={() => decide(item.id, false)} aria-label={`Reject ${item.text}`}><X /></button><button className="icon-button accept" onClick={() => decide(item.id, true)} aria-label={`Accept ${item.text}`}><Check /></button></article>)}</section>;
}

function CVForm({ cv, onChange, baseMode = false }: { cv: BaseCV; onChange: (cv: BaseCV) => void; baseMode?: boolean }) {
  const updateContact = (key: keyof BaseCV["contact"], value: string) => onChange({ ...cv, contact: { ...cv.contact, [key]: value } });
  const moveSection = (index: number, direction: number) => { const next = [...cv.sectionOrder]; const target = index + direction; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; onChange({ ...cv, sectionOrder: next }); };
  const updateBullet = (experienceId: string, bulletId: string, text: string) => onChange({ ...cv, experience: cv.experience.map((item) => item.id === experienceId ? { ...item, bullets: item.bullets.map((bullet) => bullet.id === bulletId ? { ...bullet, text } : bullet) } : item) });
  return <div className="cv-form"><details open><summary><span><UserRound size={17} />Contact</span><ChevronRight /></summary><div className="details-body form-grid"><label>Full name<input value={cv.contact.fullName} onChange={(event) => updateContact("fullName", event.target.value)} /></label><label>Professional headline<input value={cv.contact.headline} onChange={(event) => updateContact("headline", event.target.value)} /></label><label>Email<input value={cv.contact.email} onChange={(event) => updateContact("email", event.target.value)} /></label><label>Phone<input value={cv.contact.phone} onChange={(event) => updateContact("phone", event.target.value)} /></label><label>Location<input value={cv.contact.location} onChange={(event) => updateContact("location", event.target.value)} /></label><label>LinkedIn<input value={cv.contact.linkedin} onChange={(event) => updateContact("linkedin", event.target.value)} /></label></div></details><details open><summary><span><PencilLine size={17} />Profile</span><ChevronRight /></summary><div className="details-body"><label>Summary<textarea rows={5} value={cv.summary.text} onChange={(event) => onChange({ ...cv, summary: { ...cv.summary, text: event.target.value } })} /></label></div></details><details open><summary><span><BriefcaseBusiness size={17} />Experience</span><ChevronRight /></summary><div className="details-body repeat-list">{cv.experience.map((item, itemIndex) => <article className="repeat-card" key={item.id}><div className="form-row"><label>Role<input value={item.role} onChange={(event) => onChange({ ...cv, experience: cv.experience.map((entry) => entry.id === item.id ? { ...entry, role: event.target.value } : entry) })} /></label><label>Company<input value={item.company} onChange={(event) => onChange({ ...cv, experience: cv.experience.map((entry) => entry.id === item.id ? { ...entry, company: event.target.value } : entry) })} /></label></div>{item.bullets.map((bullet) => <div className="bullet-edit" key={bullet.id}><span>•</span><textarea rows={2} value={bullet.text} onChange={(event) => updateBullet(item.id, bullet.id, event.target.value)} /><button className="icon-button" onClick={() => onChange({ ...cv, experience: cv.experience.map((entry) => entry.id === item.id ? { ...entry, bullets: entry.bullets.filter((value) => value.id !== bullet.id) } : entry) })}><X size={14} /></button></div>)}<button className="text-button" onClick={() => onChange({ ...cv, experience: cv.experience.map((entry) => entry.id === item.id ? { ...entry, bullets: [...entry.bullets, { id: createId("bullet"), text: "New achievement", visible: true, provenance: { status: "verified", sourceRefs: [baseMode ? `base.experience.${itemIndex}` : "user.edit"] } }] } : entry) })}><Plus size={14} />Add bullet</button></article>)}</div></details><details open><summary><span><Sparkles size={17} />Skills</span><ChevronRight /></summary><div className="details-body"><div className="skill-editor">{cv.skills.map((skill) => <div key={skill.id} className={skill.provenance.status === "inferred_unconfirmed" ? "inferred" : ""}><input value={skill.text} onChange={(event) => onChange({ ...cv, skills: cv.skills.map((item) => item.id === skill.id ? { ...item, text: event.target.value } : item) })} /><button className="icon-button" onClick={() => onChange({ ...cv, skills: cv.skills.filter((item) => item.id !== skill.id) })}><X size={13} /></button></div>)}<button className="skill-add" onClick={() => onChange({ ...cv, skills: [...cv.skills, { id: createId("skill"), text: "New skill", visible: true, provenance: { status: "verified", sourceRefs: ["user.edit"] } }] })}><Plus size={14} /> Add skill</button></div></div></details><details><summary><span><LayoutDashboard size={17} />Section order</span><ChevronRight /></summary><div className="details-body section-order">{cv.sectionOrder.map((section, index) => <div key={section}><span>{section}</span><div><button className="icon-button" disabled={index === 0} onClick={() => moveSection(index, -1)}><ArrowUp size={14} /></button><button className="icon-button" disabled={index === cv.sectionOrder.length - 1} onClick={() => moveSection(index, 1)}><ArrowDown size={14} /></button></div></div>)}</div></details></div>;
}

function SettingsPage({ onLogout }: { onLogout: () => void }) {
  const [busy, setBusy] = useState(false); const [usage, setUsage] = useState<AiUsageSummary | null>(null); const [usageError, setUsageError] = useState(""); const navigate = useNavigate();
  useEffect(() => { dataApi.getAiUsageSummary().then(setUsage).catch((caught) => setUsageError(errorMessage(caught))); }, []);
  const remove = async () => { if (!supabase || !confirm("Permanently delete your account, CV, jobs and files? This cannot be undone.")) return; setBusy(true); const { data, error } = await supabase.functions.invoke("delete-account"); if (error || data?.error) { alert(data?.error || error.message); setBusy(false); return; } navigate("/"); };
  return <main className="workspace narrow">
    <header className="workspace-header"><div><span className="section-kicker">Account</span><h1>Settings</h1><p>Control your session, AI usage, browser extension, and stored data.</p></div></header>
    <section className="extension-card"><div className="extension-card-main"><div className="extension-card-copy"><span className="status-badge ready"><Check size={12} />Chrome ready</span><h2>Capture jobs while you browse</h2><p>Download the CV Maker extension, then capture a job listing straight from its page and continue tailoring here.</p></div><div className="extension-download"><a className="button button-primary button-large" href="/downloads/cv-maker-extension.zip" download="cv-maker-extension.zip"><Download size={18} />Download extension</a><small>Chrome · v0.1.0 · ZIP</small></div></div><div className="extension-install"><div><span>1</span><p><strong>Download and extract</strong>Open the ZIP and extract it to a permanent folder.</p></div><div><span>2</span><p><strong>Open Extensions</strong>Enter <code>chrome://extensions</code> in Chrome.</p></div><div><span>3</span><p><strong>Enable Developer mode</strong>Turn on the switch in the top-right corner.</p></div><div><span>4</span><p><strong>Load and sign in</strong>Choose “Load unpacked,” select the extracted folder, then sign in.</p></div></div><p className="extension-note"><CircleAlert size={14} />Chrome requires this manual installation until CV Maker is published in the Chrome Web Store. Keep the extracted folder after installing.</p></section>
    <section className="usage-card">
      <div className="usage-card-heading"><div><span className="section-kicker">AI model usage</span><h2>{usage ? formatUsdCost(usage.costUsd) : "Loading…"}</h2><p>Estimated API cost from tracked text-token and voice-transcription usage.</p></div>{usage && <span className="usage-event-count">{usage.eventCount} AI {usage.eventCount === 1 ? "call" : "calls"}</span>}</div>
      {usageError && <div className="notice error"><CircleAlert size={16} />{usageError}</div>}
      {usage && <>
        <div className="usage-totals"><div><small>Input tokens</small><strong>{formatTokenCount(usage.inputTokens)}</strong></div><div><small>Output tokens</small><strong>{formatTokenCount(usage.outputTokens)}</strong></div><div><small>Total tokens</small><strong>{formatTokenCount(usage.totalTokens)}</strong></div><div><small>Voice transcription</small><strong>{formatDurationSeconds(usage.durationSeconds)}</strong></div></div>
        {usage.byModel.length > 0 ? <div className="usage-models"><div className="usage-model-row heading"><span>Model</span><span>Input</span><span>Output</span><span>Audio</span><span>Cost</span></div>{usage.byModel.map((model) => <div className="usage-model-row" key={model.model}><strong>{model.model}</strong><span>{formatTokenCount(model.inputTokens)}</span><span>{formatTokenCount(model.outputTokens)}</span><span>{model.durationSeconds > 0 ? formatDurationSeconds(model.durationSeconds) : "—"}</span><span>{formatUsdCost(model.unpricedEvents ? null : model.costUsd)}</span></div>)}</div> : <div className="usage-empty">No tracked AI usage yet. New model calls will appear here.</div>}
        {usage.unpricedEvents > 0 && <p className="usage-note">{usage.unpricedEvents} {usage.unpricedEvents === 1 ? "call uses" : "calls use"} a model or usage shape without a saved rate and is excluded from the USD total.</p>}
      </>}
    </section>
    <section className="settings-card"><div><h2>Sign out</h2><p>Your saved CV and jobs remain in your private workspace.</p></div><button className="button button-ghost" onClick={onLogout}><LogOut size={16} />Sign out</button></section>
    <section className="settings-card danger-zone"><div><h2>Delete account</h2><p>Permanently remove your account, CV source file, jobs and generated drafts.</p></div><button className="button button-danger" onClick={remove} disabled={busy || !supabase}><Trash2 size={16} />{busy ? "Deleting…" : "Delete everything"}</button></section>
  </main>;
}

function AdminPage() {
  const [limit, setLimit] = useState(5);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [overrides, setOverrides] = useState<Record<string, { monthly_limit: number | null; disabled: boolean }>>({});
  const [saved, setSaved] = useState(false);
  const [savedUser, setSavedUser] = useState("");
  useEffect(() => {
    if (!supabase) return;
    Promise.all([
      supabase.from("app_settings").select("global_monthly_limit").single(),
      supabase.from("profiles").select("id, display_name, disabled, created_at").order("created_at", { ascending: false }),
      supabase.from("tailor_runs").select("user_id,status,input_tokens,output_tokens,created_at"),
      supabase.from("user_quota_overrides").select("user_id,monthly_limit,disabled"),
    ]).then(([settings, users, usage, userOverrides]) => {
      if (settings.data) setLimit(settings.data.global_monthly_limit);
      setProfiles(users.data ?? []); setRuns(usage.data ?? []);
      setOverrides(Object.fromEntries((userOverrides.data ?? []).map((item) => [item.user_id, { monthly_limit: item.monthly_limit, disabled: item.disabled }])));
    });
  }, []);
  const save = async () => {
    if (!supabase) { setSaved(true); return; }
    const { error } = await supabase.from("app_settings").update({ global_monthly_limit: limit }).eq("singleton", true);
    if (error) alert(error.message); else setSaved(true);
  };
  const saveOverride = async (userId: string, value = overrides[userId] ?? { monthly_limit: null, disabled: false }) => {
    setOverrides((current) => ({ ...current, [userId]: value }));
    if (supabase) {
      const { error } = await supabase.from("user_quota_overrides").upsert({ user_id: userId, ...value });
      if (error) { alert(error.message); return; }
    }
    setSavedUser(userId); setTimeout(() => setSavedUser(""), 1400);
  };
  const completed = runs.filter((run) => run.status === "completed");
  const shownProfiles = supabase ? profiles : [
    { id: "demo-1", display_name: "Alex Morgan", created_at: new Date().toISOString() },
    { id: "demo-2", display_name: "Jamie Chen", created_at: new Date(Date.now() - 86400000 * 4).toISOString() },
  ];
  return <main className="workspace"><header className="workspace-header"><div><span className="section-kicker">Owner controls</span><h1>Admin</h1><p>Usage, access and limits without a redeploy.</p></div></header><div className="metric-grid"><article><span>Registered users</span><strong>{supabase ? profiles.length : 24}</strong><small>All time</small></article><article><span>Successful runs</span><strong>{supabase ? completed.length : 87}</strong><small>This workspace</small></article><article><span>Input tokens</span><strong>{supabase ? completed.reduce((sum, run) => sum + run.input_tokens, 0).toLocaleString() : "318k"}</strong><small>Successful runs</small></article></div><section className="admin-card"><div><h2>Default monthly limit</h2><p>Applied to every user without a personal override. Failed runs are refunded automatically.</p></div><div className="limit-control"><button onClick={() => setLimit(Math.max(0, limit - 1))}>−</button><input aria-label="Default monthly limit" type="number" min="0" max="1000" value={limit} onChange={(event) => { setLimit(Number(event.target.value)); setSaved(false); }} /><button onClick={() => setLimit(Math.min(1000, limit + 1))}>+</button><button className="button button-dark" onClick={save}>{saved ? <Check size={15} /> : null}{saved ? "Saved" : "Save limit"}</button></div></section><section className="admin-card table-card"><div><h2>Accounts</h2><p>Set a personal monthly limit, or pause an account immediately.</p></div><div className="admin-table"><div className="admin-table-row heading"><span>User</span><span>Monthly limit</span><span>Status</span><span>Action</span></div>{shownProfiles.map((profile) => { const value = overrides[profile.id] ?? { monthly_limit: null, disabled: false }; return <div className="admin-table-row" key={profile.id}><span><strong>{profile.display_name || "Unnamed user"}</strong><small>{profile.id.slice(0, 12)}… · joined {formatDate(profile.created_at)}</small></span><input aria-label={`Monthly limit for ${profile.display_name || profile.id}`} type="number" min="0" max="1000" placeholder={String(limit)} value={value.monthly_limit ?? ""} onChange={(event) => setOverrides((current) => ({ ...current, [profile.id]: { ...value, monthly_limit: event.target.value === "" ? null : Number(event.target.value) } }))} /><span className={`status-badge ${value.disabled ? "draft" : "ready"}`}>{value.disabled ? "Paused" : "Active"}</span><div className="account-actions"><button className="button button-small button-ghost" onClick={() => saveOverride(profile.id)}>{savedUser === profile.id ? <Check size={13} /> : null}{savedUser === profile.id ? "Saved" : "Save"}</button><button className={`button button-small ${value.disabled ? "button-dark" : "button-danger"}`} onClick={() => saveOverride(profile.id, { ...value, disabled: !value.disabled })}>{value.disabled ? "Enable" : "Pause"}</button></div></div>; })}</div></section></main>;
}

function Loading() { return <div className="loading-state"><LoaderCircle className="spin" /><span>Loading your workspace…</span></div>; }

export default function App() {
  const [session, setSession] = useState<Session | null>(null); const [loading, setLoading] = useState(isSupabaseConfigured);
  const location = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, left: 0 }); }, [location.pathname]);
  useEffect(() => { if (!supabase) return; supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); }); const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next)); return () => data.subscription.unsubscribe(); }, []);
  if (loading) return <Loading />;
  return <Routes><Route path="/" element={<Landing />} /><Route path="/auth" element={session ? <Navigate to="/app" /> : <AuthPage />} /><Route path="/app/*" element={isSupabaseConfigured && !session ? <Navigate to="/auth" /> : <AppShell session={session} />} /><Route path="*" element={<Navigate to="/" />} /></Routes>;
}
