// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dataApi } from "../lib/data";
import { VoiceRecorder, VOICE_RECORDING_LIMIT_SECONDS } from "./VoiceRecorder";

class MockMediaRecorder {
  static instances: MockMediaRecorder[] = [];
  static isTypeSupported = (type: string) => type.startsWith("audio/webm");
  state: RecordingState = "inactive";
  mimeType = "audio/webm;codecs=opus";
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor() { MockMediaRecorder.instances.push(this); }
  start() { this.state = "recording"; }
  pause() { this.state = "paused"; }
  resume() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["recorded voice"], { type: this.mimeType }) } as BlobEvent);
    this.onstop?.();
  }
}

describe("voice recorder", () => {
  let container: HTMLDivElement;
  let root: Root;
  let stopTrack: ReturnType<typeof vi.fn>;
  let mounted: boolean;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
    mounted = true;
    stopTrack = vi.fn(); MockMediaRecorder.instances = [];
    Object.defineProperty(globalThis, "MediaRecorder", { configurable: true, value: MockMediaRecorder });
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] }) } });
  });

  afterEach(() => {
    if (mounted) act(() => root.unmount());
    container.remove(); vi.restoreAllMocks(); vi.useRealTimers();
  });

  const button = (label: string) => [...container.querySelectorAll("button")].find((item) => item.textContent?.includes(label)) as HTMLButtonElement;

  it("records, pauses, resumes, and explicitly transcribes before replacing text", async () => {
    const onTranscript = vi.fn();
    vi.spyOn(dataApi, "transcribeInterviewAudio").mockResolvedValue({ text: "New spoken answer" });
    await act(async () => root.render(<VoiceRecorder onTranscript={onTranscript} />));

    await act(async () => button("Record answer").click());
    expect(container.textContent).toContain("Recording · 1:30 remaining");
    act(() => button("Pause").click()); expect(container.textContent).toContain("Paused");
    act(() => button("Resume").click());
    act(() => button("Stop").click()); expect(container.textContent).toContain("Recording ready");
    expect(onTranscript).not.toHaveBeenCalled();

    await act(async () => button("Transcribe recording").click());
    expect(dataApi.transcribeInterviewAudio).toHaveBeenCalledOnce();
    expect(onTranscript).toHaveBeenCalledWith("New spoken answer");
    expect(stopTrack).toHaveBeenCalled();
  });

  it("auto-stops after ninety active seconds but not while paused", async () => {
    vi.useFakeTimers();
    await act(async () => root.render(<VoiceRecorder onTranscript={() => undefined} />));
    await act(async () => button("Record answer").click());
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(container.textContent).toContain("1:00 remaining");
    act(() => button("Pause").click());
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(container.textContent).toContain("1:00 remaining");
    act(() => button("Resume").click());
    act(() => { vi.advanceTimersByTime((VOICE_RECORDING_LIMIT_SECONDS - 30) * 1000); });
    await act(async () => Promise.resolve());
    expect(container.textContent).toContain("Recording ready");
  });

  it("reset discards audio without producing a transcript", async () => {
    const onTranscript = vi.fn();
    await act(async () => root.render(<VoiceRecorder onTranscript={onTranscript} />));
    await act(async () => button("Record answer").click());
    act(() => (container.querySelector('[aria-label="Reset recording"]') as HTMLButtonElement).click());
    expect(container.textContent).toContain("Record answer");
    expect(onTranscript).not.toHaveBeenCalled();
    expect(stopTrack).toHaveBeenCalled();
  });

  it("keeps typing available when permission is denied", async () => {
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError")) } });
    await act(async () => root.render(<VoiceRecorder onTranscript={() => undefined} />));
    await act(async () => button("Record answer").click());
    expect(container.textContent).toContain("Microphone access was denied");
    expect(container.textContent).toContain("Try voice again");
  });

  it("falls back cleanly when MediaRecorder is unsupported", async () => {
    Object.defineProperty(globalThis, "MediaRecorder", { configurable: true, value: undefined });
    await act(async () => root.render(<VoiceRecorder onTranscript={() => undefined} />));
    expect(container.textContent).toContain("Voice recording is not supported in this browser");
    expect(container.querySelector("button")).toBeNull();
  });

  it("preserves the current answer and recording when transcription fails", async () => {
    const onTranscript = vi.fn();
    vi.spyOn(dataApi, "transcribeInterviewAudio").mockRejectedValue(new Error("Provider unavailable"));
    await act(async () => root.render(<VoiceRecorder onTranscript={onTranscript} />));
    await act(async () => button("Record answer").click());
    act(() => button("Stop").click());
    await act(async () => button("Transcribe recording").click());
    expect(onTranscript).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Provider unavailable");
    expect(container.textContent).toContain("Transcribe recording");
  });

  it("stops microphone tracks and discards unsent audio when unmounted", async () => {
    await act(async () => root.render(<VoiceRecorder onTranscript={() => undefined} />));
    await act(async () => button("Record answer").click());
    act(() => root.unmount()); mounted = false;
    expect(stopTrack).toHaveBeenCalledOnce();
  });
});
