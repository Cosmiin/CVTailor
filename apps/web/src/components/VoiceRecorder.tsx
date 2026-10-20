import { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert, LoaderCircle, Mic, Pause, Play, RotateCcw, Square } from "lucide-react";
import { dataApi } from "../lib/data";

export const VOICE_RECORDING_LIMIT_SECONDS = 90;
export const VOICE_TRANSCRIPT_LIMIT = 2500;

type RecorderState = "idle" | "recording" | "paused" | "ready" | "transcribing" | "error";
type Props = {
  onTranscript: (text: string) => void;
  onActivityChange?: (active: boolean) => void;
  disabled?: boolean;
};

const supportedMimeType = () => {
  if (typeof MediaRecorder === "undefined") return "";
  if (typeof MediaRecorder.isTypeSupported !== "function") return "";
  return ["audio/webm;codecs=opus", "audio/mp4"]
    .find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
};

const extensionFor = (type: string) => type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : type.includes("wav") ? "wav" : "webm";
const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
const recordingSupported = () => typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

export function VoiceRecorder({ onTranscript, onActivityChange, disabled = false }: Props) {
  const [state, setState] = useState<RecorderState>("idle");
  const [remaining, setRemaining] = useState(VOICE_RECORDING_LIMIT_SECONDS);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const discardRef = useRef(false);
  const mountedRef = useRef(true);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      setState("ready");
      recorder.stop();
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      discardRef.current = true;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      releaseStream();
    };
  }, [releaseStream]);

  useEffect(() => {
    onActivityChange?.(["recording", "paused", "transcribing"].includes(state));
  }, [onActivityChange, state]);

  useEffect(() => {
    if (state !== "recording") return;
    const timer = window.setInterval(() => setRemaining((current) => {
      if (current <= 1) {
        window.queueMicrotask(stop);
        return 0;
      }
      return current - 1;
    }), 1000);
    return () => window.clearInterval(timer);
  }, [state, stop]);

  const start = async () => {
    if (disabled || !recordingSupported()) return;
    setError(""); setAudio(null); setRemaining(VOICE_RECORDING_LIMIT_SECONDS); discardRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      const preferred = supportedMimeType();
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      recorderRef.current = recorder; chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.onerror = () => {
        releaseStream();
        if (mountedRef.current) { setError("The microphone stopped unexpectedly. Reset and try again."); setState("error"); }
      };
      recorder.onstop = () => {
        releaseStream(); recorderRef.current = null;
        if (!mountedRef.current || discardRef.current) return;
        const type = recorder.mimeType || preferred || "audio/webm";
        const recording = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        if (recording.size === 0) {
          setError("No audio was captured. Reset and try again."); setState("error"); return;
        }
        setAudio(recording); setState("ready");
      };
      recorder.start(250); setState("recording");
    } catch (caught) {
      releaseStream();
      const denied = caught instanceof DOMException && ["NotAllowedError", "SecurityError"].includes(caught.name);
      setError(denied ? "Microphone access was denied. You can enable it in your browser settings or keep typing." : "The microphone is unavailable. You can keep typing your answer.");
      setState("error");
    }
  };

  const pause = () => {
    if (recorderRef.current?.state !== "recording") return;
    recorderRef.current.pause(); setState("paused");
  };
  const resume = () => {
    if (recorderRef.current?.state !== "paused") return;
    recorderRef.current.resume(); setState("recording");
  };
  const reset = () => {
    discardRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop(); else releaseStream();
    recorderRef.current = null; chunksRef.current = []; setAudio(null); setError("");
    setRemaining(VOICE_RECORDING_LIMIT_SECONDS); setState("idle");
  };
  const transcribe = async () => {
    if (!audio || state === "transcribing") return;
    setState("transcribing"); setError("");
    try {
      const result = await dataApi.transcribeInterviewAudio(audio, `interview-answer.${extensionFor(audio.type)}`);
      const text = result.text.replace(/\s+/g, " ").trim();
      if (!text) throw new Error("No speech was detected. Reset the recording and try again.");
      if (text.length > VOICE_TRANSCRIPT_LIMIT) throw new Error("The transcript is too long for one answer. Record a shorter response.");
      onTranscript(text);
      setAudio(null); setRemaining(VOICE_RECORDING_LIMIT_SECONDS); setState("idle");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The recording could not be transcribed. Your typed answer is unchanged.");
      setState("error");
    }
  };

  if (!recordingSupported()) return <div className="voice-recorder unavailable"><Mic size={14} /><span>Voice recording is not supported in this browser. You can keep typing.</span></div>;
  const recordedSeconds = VOICE_RECORDING_LIMIT_SECONDS - remaining;

  return <div className={`voice-recorder ${state}`} aria-live="polite">
    {state === "idle" && <button type="button" className="button button-small button-ghost" onClick={start} disabled={disabled}><Mic size={14} />Record answer</button>}
    {(state === "recording" || state === "paused") && <>
      <span className="voice-status"><i />{state === "paused" ? "Paused" : "Recording"} · {formatTime(remaining)} remaining</span>
      <div className="voice-actions">
        {state === "recording" ? <button type="button" className="button button-small button-ghost" onClick={pause}><Pause size={13} />Pause</button> : <button type="button" className="button button-small button-ghost" onClick={resume}><Play size={13} />Resume</button>}
        <button type="button" className="button button-small button-dark" onClick={stop}><Square size={12} />Stop</button>
        <button type="button" className="icon-button" onClick={reset} aria-label="Reset recording"><RotateCcw size={14} /></button>
      </div>
    </>}
    {(state === "ready" || (state === "error" && audio)) && <>
      <span className="voice-status ready"><Mic size={13} />Recording ready · {formatTime(recordedSeconds)}</span>
      <div className="voice-actions"><button type="button" className="button button-small button-dark" onClick={transcribe}><Mic size={13} />Transcribe recording</button><button type="button" className="button button-small button-ghost" onClick={reset}><RotateCcw size={13} />Reset</button></div>
    </>}
    {state === "transcribing" && <span className="voice-status"><LoaderCircle className="spin" size={14} />Transcribing in English…</span>}
    {state === "error" && !audio && <button type="button" className="button button-small button-ghost" onClick={start} disabled={disabled}><Mic size={14} />Try voice again</button>}
    {error && <span className="voice-error"><CircleAlert size={13} />{error}</span>}
    <small>English · recording is discarded after transcription</small>
  </div>;
}
