import { useEffect, useRef, useState } from "react";
import {
  translateSpeech,
  type TranslationResult,
} from "../api/translation";

type TranslatorStatus =
  | "idle"
  | "recording"
  | "processing"
  | "ready"
  | "error";

export function TranslatorWorkspace({ onBack }: { onBack: () => void }) {
  const [status, setStatus] = useState<TranslatorStatus>("idle");
  const [elapsedTime, setElapsedTime] = useState(0);
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const stopTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    startTimeRef.current = null;
  };

  const startTimer = () => {
    startTimeRef.current = performance.now();
    timerRef.current = window.setInterval(() => {
      if (startTimeRef.current !== null) {
        setElapsedTime((performance.now() - startTimeRef.current) / 1000);
      }
    }, 50);
  };

  const reset = () => {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    recorderRef.current = null;
    streamRef.current = null;
    chunksRef.current = [];
    stopTimer();
    setStatus("idle");
    setElapsedTime(0);
    setResult(null);
    setError(null);
  };

  const startRecording = async () => {
    try {
      setError(null);
      setResult(null);
      setElapsedTime(0);
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone access is not supported by this browser.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const mimeType = getSupportedMimeType();
      if (!mimeType) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("This browser does not support a compatible audio format.");
      }

      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        stopTimer();
        stream.getTracks().forEach((track) => track.stop());
        setError("The browser encountered an audio recording error.");
        setStatus("error");
      };
      recorder.onstop = async () => {
        stopTimer();
        stream.getTracks().forEach((track) => track.stop());
        recorderRef.current = null;
        streamRef.current = null;
        const audioBlob = new Blob(chunksRef.current, { type: recorder.mimeType });
        if (audioBlob.size === 0) {
          setError("The recording contains no audio data.");
          setStatus("error");
          return;
        }

        setStatus("processing");
        try {
          const translated = await translateSpeech(
            audioBlob,
            `urdu-recording.${getAudioExtension(recorder.mimeType)}`,
          );
          setResult(translated);
          setStatus("ready");
        } catch (translationError) {
          setError(
            translationError instanceof Error
              ? translationError.message
              : "Unable to translate the recording.",
          );
          setStatus("error");
        }
      };

      recorder.start(250);
      setStatus("recording");
      startTimer();
    } catch (recordingError) {
      stopTimer();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setError(
        recordingError instanceof Error
          ? recordingError.message
          : "Unable to start microphone recording.",
      );
      setStatus("error");
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  };

  const isRecording = status === "recording";
  const isProcessing = status === "processing";

  return (
    <section className="mx-auto w-full max-w-5xl py-6 sm:py-10">
      <button
        type="button"
        onClick={onBack}
        className="mb-6 text-sm font-medium text-slate-300 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
      >
        ← Back to workspaces
      </button>
      <div className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-6 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-10">
        <p className="text-sm font-medium text-violet-200">Urdu translator</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-white">
          Record Urdu speech
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
          Receive an Urdu transcript and a direct English translation from the
          same recording.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isProcessing}
            className="rounded-2xl bg-violet-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-200"
          >
            {isRecording
              ? "Stop recording"
              : isProcessing
                ? "Translating..."
                : "Start recording"}
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={isRecording || isProcessing}
            className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
          >
            New recording
          </button>
          <span className="text-sm tabular-nums text-slate-400">
            {formatDuration(elapsedTime)}
          </span>
        </div>

        {isProcessing ? (
          <p className="mt-6 rounded-2xl border border-violet-300/20 bg-violet-300/10 px-4 py-3 text-sm text-violet-100">
            Processing Urdu speech on the CPU. This may take a moment.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-6 rounded-2xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </p>
        ) : null}
        {result ? (
          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            <TranslationPanel title="Urdu Transcript" text={result.urdu_transcript} rtl />
            <TranslationPanel title="English Translation" text={result.english_translation} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function TranslationPanel({
  title,
  text,
  rtl = false,
}: {
  title: string;
  text: string;
  rtl?: boolean;
}) {
  return (
    <article className="rounded-3xl border border-white/10 bg-slate-950/60 p-6">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p
        dir={rtl ? "rtl" : "ltr"}
        className="mt-5 min-h-32 whitespace-pre-wrap text-lg leading-8 text-slate-200"
      >
        {text}
      </p>
    </article>
  );
}

function getSupportedMimeType() {
  const options = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  return options.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function getAudioExtension(mimeType: string) {
  return mimeType.includes("ogg") ? "ogg" : "webm";
}

function formatDuration(seconds: number) {
  const wholeSeconds = Math.floor(seconds);
  return `${String(Math.floor(wholeSeconds / 60)).padStart(2, "0")}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}
