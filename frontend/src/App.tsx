import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  analyzeSpeech,
  type SpeechAnalysisResult,
} from "./api/speech";

type RecordingStatus =
  | "idle"
  | "recording"
  | "stopping"
  | "ready"
  | "error";

type MetricTone = "cyan" | "violet" | "blue" | "neutral";

function App() {
  const [status, setStatus] = useState<RecordingStatus>("idle");
  const [elapsedTime, setElapsedTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] =
    useState<SpeechAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordedAudioRef = useRef<Blob | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
      }

      mediaStreamRef.current?.getTracks().forEach((track) => {
        track.stop();
      });

      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  const startTimer = () => {
    startTimeRef.current = performance.now();

    timerRef.current = window.setInterval(() => {
      if (startTimeRef.current === null) {
        return;
      }

      const elapsed =
        performance.now() - startTimeRef.current;

      setElapsedTime(elapsed / 1000);
    }, 50);
  };

  const stopTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (startTimeRef.current !== null) {
      const elapsed =
        performance.now() - startTimeRef.current;

      setElapsedTime(elapsed / 1000);
      startTimeRef.current = null;
    }
  };

  const startRecording = async () => {
    try {
      setError(null);
      setAnalysis(null);
      setIsAnalyzing(false);

      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }

      setAudioUrl(null);
      setElapsedTime(0);
      audioChunksRef.current = [];
      recordedAudioRef.current = null;

      if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        throw new Error(
          "Microphone access is not supported by this browser.",
        );
      }

      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

      mediaStreamRef.current = stream;

      const mimeType = getSupportedMimeType();

      if (!mimeType) {
        stream.getTracks().forEach((track) => {
          track.stop();
        });

        mediaStreamRef.current = null;

        throw new Error(
          "This browser does not support a compatible audio recording format.",
        );
      }

      const recorder = new MediaRecorder(stream, {
        mimeType,
      });

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        stopTimer();

        setError(
          "The browser encountered an audio recording error.",
        );

        setStatus("error");

        mediaStreamRef.current?.getTracks().forEach((track) => {
          track.stop();
        });

        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType,
        });

        recordedAudioRef.current = audioBlob;

        mediaStreamRef.current?.getTracks().forEach((track) => {
          track.stop();
        });

        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;

        if (audioBlob.size === 0) {
          setError("The recording contains no audio data.");
          setStatus("error");
          return;
        }

        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        setStatus("ready");
        setIsAnalyzing(true);
        setError(null);

        try {
          const extension = getAudioExtension(
            recorder.mimeType,
          );

          const result = await analyzeSpeech(
            audioBlob,
            `speech-recording.${extension}`,
          );

          setAnalysis(result);
        } catch (analysisError) {
          console.error(analysisError);

          setError(
            analysisError instanceof Error
              ? analysisError.message
              : "Unable to analyze the recording.",
          );
        } finally {
          setIsAnalyzing(false);
        }
      };

      recorder.start(250);
      setStatus("recording");
      startTimer();
    } catch (recordingError) {
      console.error(recordingError);

      stopTimer();

      mediaStreamRef.current?.getTracks().forEach((track) => {
        track.stop();
      });

      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;

      setError(
        recordingError instanceof Error
          ? recordingError.message
          : "Unable to start microphone recording.",
      );

      setStatus("error");
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;

    if (!recorder || recorder.state !== "recording") {
      return;
    }

    setStatus("stopping");
    stopTimer();
    recorder.stop();
  };

  const resetRecording = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }

    audioChunksRef.current = [];
    recordedAudioRef.current = null;

    setAudioUrl(null);
    setAnalysis(null);
    setElapsedTime(0);
    setError(null);
    setIsAnalyzing(false);
    setStatus("idle");
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#060914] text-slate-100">
      <div className="pointer-events-none fixed inset-0 [background:radial-gradient(circle_at_20%_10%,rgba(34,211,238,0.16),transparent_32rem),radial-gradient(circle_at_80%_0%,rgba(124,58,237,0.16),transparent_30rem),linear-gradient(180deg,#060914_0%,#0b1020_52%,#080b14_100%)]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">
              Speech Analyzer
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white [overflow-wrap:anywhere] sm:text-3xl">
              Professional speech clarity workspace
            </h1>
          </div>

          <StatusBadge status={status} isAnalyzing={isAnalyzing} />
        </header>

        <section className="grid flex-1 items-start gap-6 py-6 lg:grid-cols-[21rem_minmax(0,1fr)] lg:py-10">
          <RecorderPanel
            status={status}
            elapsedTime={elapsedTime}
            isAnalyzing={isAnalyzing}
            audioUrl={audioUrl}
            onStart={startRecording}
            onStop={stopRecording}
            onReset={resetRecording}
          />

          <div className="min-w-0">
            {error ? <ErrorState message={error} /> : null}

            {isAnalyzing ? <LoadingState /> : null}

            {analysis ? (
              <AnalysisWorkspace analysis={analysis} />
            ) : (
              <EmptyAnalysisState
                isRecording={status === "recording"}
                hasAudio={audioUrl !== null}
              />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function RecorderPanel({
  status,
  elapsedTime,
  isAnalyzing,
  audioUrl,
  onStart,
  onStop,
  onReset,
}: {
  status: RecordingStatus;
  elapsedTime: number;
  isAnalyzing: boolean;
  audioUrl: string | null;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
}) {
  const isRecording = status === "recording";
  const isStopping = status === "stopping";
  const canStart = status === "idle" || status === "error";
  const isReady = status === "ready";

  return (
    <div className="sticky top-6 w-full min-w-0 rounded-[1.75rem] border border-white/10 bg-white/[0.055] p-5 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-7">
      <div className="w-full min-w-0 rounded-3xl border border-cyan-300/15 bg-slate-950/70 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-cyan-200">
              Recording console
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white [overflow-wrap:anywhere]">
              Capture a natural speech sample
            </h2>
          </div>

          <div
            aria-hidden="true"
            className={`relative h-12 w-12 shrink-0 rounded-2xl border ${
              isRecording
                ? "border-red-300/50 bg-red-500/15"
                : "border-cyan-300/30 bg-cyan-300/10"
            }`}
          >
            <span
              className={`absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                isRecording
                  ? "animate-pulse bg-red-400"
                  : "bg-cyan-300"
              }`}
            />
          </div>
        </div>

        <p className="mt-4 text-sm leading-6 text-slate-300 [overflow-wrap:anywhere]">
          Speak naturally in a quiet environment. Your recording will be
          analyzed after you stop recording, using speech metrics and
          word-level timing.
        </p>

        <div className="mt-8 min-w-0 rounded-3xl border border-white/10 bg-[#080d1a] px-4 py-5 sm:p-5">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium text-slate-400">
              {getStatusText(status)}
            </p>
            {isRecording ? (
              <div className="flex h-8 items-end gap-1">
                {[12, 20, 15, 26, 18].map((height, index) => (
                  <span
                    key={height}
                    className="w-1.5 animate-[pulse_1.4s_ease-in-out_infinite] rounded-full bg-cyan-300/80 motion-reduce:animate-none"
                    style={{
                      height,
                      animationDelay: `${index * 120}ms`,
                    }}
                  />
                ))}
              </div>
            ) : null}
          </div>

          <div className="mx-auto mt-4 w-full max-w-full text-center font-mono text-[2.65rem] font-semibold leading-none tracking-tight text-white tabular-nums min-[390px]:text-5xl sm:text-6xl lg:text-[2.35rem]">
            {formatDuration(elapsedTime)}
          </div>

          {isReady ? (
            <p className="mt-3 text-sm font-medium text-emerald-300">
              Recording ready for analysis.
            </p>
          ) : null}
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {canStart ? (
            <button
              type="button"
              onClick={onStart}
              disabled={isAnalyzing}
              className="inline-flex min-h-12 flex-1 items-center justify-center rounded-2xl bg-cyan-300 px-5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Start recording
            </button>
          ) : null}

          {isRecording ? (
            <button
              type="button"
              onClick={onStop}
              className="inline-flex min-h-12 flex-1 items-center justify-center rounded-2xl bg-red-500 px-5 text-sm font-semibold text-white transition hover:bg-red-400 focus:outline-none focus:ring-2 focus:ring-red-300 focus:ring-offset-2 focus:ring-offset-slate-950"
            >
              Stop recording
            </button>
          ) : null}

          {isStopping ? (
            <button
              type="button"
              disabled
              className="inline-flex min-h-12 flex-1 cursor-wait items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-semibold text-slate-300"
            >
              Finalizing
            </button>
          ) : null}

          {isReady && !isAnalyzing ? (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex min-h-12 flex-1 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.06] px-5 text-sm font-semibold text-slate-100 transition hover:border-cyan-300/40 hover:bg-white/[0.09] focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:ring-offset-2 focus:ring-offset-slate-950"
            >
              Record again
            </button>
          ) : null}
        </div>

        {audioUrl ? (
          <div className="mt-7 border-t border-white/10 pt-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-slate-200">
                Recorded audio
              </p>
              <p className="text-xs text-slate-500">
                Browser recording
              </p>
            </div>

            <audio
              className="w-full accent-cyan-300"
              controls
              preload="metadata"
              src={audioUrl}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AnalysisWorkspace({
  analysis,
}: {
  analysis: SpeechAnalysisResult;
}) {
  const [expandedResultContent, setExpandedResultContent] = useState({
    speakingRate: false,
    pauses: false,
    fillers: false,
    quality: false,
  });

  const toggleResultContent = (
    section: keyof typeof expandedResultContent,
  ) => {
    setExpandedResultContent((current) => ({
      ...current,
      [section]: !current[section],
    }));
  };

  return (
    <section className="animate-[fadeIn_420ms_ease-out] rounded-[1.75rem] border border-white/10 bg-white/[0.055] p-5 shadow-2xl shadow-black/25 backdrop-blur-xl motion-reduce:animate-none sm:p-7">
      <div className="flex flex-col gap-2 border-b border-white/10 pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">
          Analysis
        </p>
        <h2 className="text-3xl font-semibold tracking-tight text-white">
          Speech Results
        </h2>
        <p className="max-w-2xl text-sm leading-6 text-slate-300">
          Metrics below come directly from the speech-analysis.
          Words are counted once from the recognized word timeline.
        </p>
      </div>

      <div className="mt-8">
        <div className="min-w-0 space-y-10">
          <TranscriptSection transcript={analysis.transcript} />

          <SectionBlock
            eyebrow="Core Metrics"
            title="Recording summary"
            description="The primary measures for the captured speech sample."
          >
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricTile
                label="Words"
                value={analysis.total_words.toString()}
                description="Recognized words"
                tone="cyan"
              />
              <MetricTile
                label="Speaking duration"
                value={formatSeconds(analysis.speaking_duration)}
                description="Detected speech time"
                tone="blue"
              />
              <MetricTile
                label="Silence duration"
                value={formatSeconds(analysis.pause_duration)}
                description="Recording minus speech"
                tone="violet"
              />
              <MetricTile
                label="Speaking WPM"
                value={analysis.speaking_words_per_minute.toFixed(1)}
                suffix="WPM"
                description="Rate during speech"
                tone="cyan"
              />
            </div>
          </SectionBlock>

          <SectionBlock
            eyebrow="Pace"
            title="Speaking rate"
            description="Overall WPM uses the full recording. Speaking WPM uses only detected speaking time."
          >
            <ResultContentDisclosure
              label="Speaking rate results"
              isOpen={expandedResultContent.speakingRate}
              onToggle={() => toggleResultContent("speakingRate")}
            >
              <div className="grid gap-4 lg:grid-cols-3">
                <MetricTile
                  label="Overall WPM"
                  value={analysis.overall_words_per_minute.toFixed(1)}
                  suffix="WPM"
                  description="Total words / recording duration"
                  tooltip="Total words divided by the complete recording duration, multiplied by 60."
                  tone="blue"
                />
                <MetricTile
                  label="Speaking WPM"
                  value={analysis.speaking_words_per_minute.toFixed(1)}
                  suffix="WPM"
                  description="Total words / speaking duration"
                  tooltip="Total words divided by detected speaking duration, multiplied by 60."
                  tone="cyan"
                />
                <div className="min-w-0 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-5">
                  <p className="text-sm font-medium text-cyan-200">
                    Classification
                  </p>
                  <p className="mt-3 text-3xl font-semibold tracking-tight text-white [overflow-wrap:anywhere]">
                    {analysis.pace}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    Based on speaking WPM.
                  </p>
                </div>
              </div>
            </ResultContentDisclosure>
          </SectionBlock>

          <SectionBlock
            eyebrow="Pauses"
            title="Speech and silence balance"
            description="Pause events are detected from gaps between consecutive recognized words."
          >
            <ResultContentDisclosure
              label="Pause results"
              isOpen={expandedResultContent.pauses}
              onToggle={() => toggleResultContent("pauses")}
            >
              <SpeechSilenceBar
                speechPercentage={analysis.speech_percentage}
                silencePercentage={analysis.silence_percentage}
              />

              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <MetricTile
                  label="Pause count"
                  value={analysis.pause_count.toString()}
                  description="Detected pauses"
                />
                <MetricTile
                  label="Average pause"
                  value={analysis.average_pause_duration.toFixed(2)}
                  suffix="sec"
                  description="Mean pause length"
                  tone="violet"
                />
                <MetricTile
                  label="Longest pause"
                  value={analysis.longest_pause_duration.toFixed(2)}
                  suffix="sec"
                  description="Largest gap"
                  tone="violet"
                />
                <MetricTile
                  label="Silence"
                  value={analysis.silence_percentage.toFixed(1)}
                  suffix="%"
                  description="Of recording"
                  tooltip="Silence duration divided by recording duration."
                  tone="blue"
                />
                <MetricTile
                  label="Speech"
                  value={analysis.speech_percentage.toFixed(1)}
                  suffix="%"
                  description="Of recording"
                  tooltip="Speaking duration divided by recording duration."
                  tone="cyan"
                />
              </div>
            </ResultContentDisclosure>
          </SectionBlock>

          <div className="grid gap-8 xl:grid-cols-2">
            <SectionBlock
              eyebrow="Fillers"
              title="Hesitation markers"
              description="Filler detection identifies recognized hesitation expressions such as um, uh, like, and you know."
            >
              <ResultContentDisclosure
                label="Filler results"
                isOpen={expandedResultContent.fillers}
                onToggle={() => toggleResultContent("fillers")}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <MetricTile
                    label="Filler word count"
                    value={analysis.filler_word_count.toString()}
                    description="Detected fillers"
                  />
                  <MetricTile
                    label="Filler rate"
                    value={analysis.filler_word_rate.toFixed(1)}
                    suffix="%"
                    description="Fillers / words"
                    tooltip="Detected filler words divided by total recognized words."
                    tone="violet"
                  />
                </div>
                <p className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-sm leading-6 text-slate-300 [overflow-wrap:anywhere]">
                  {analysis.filler_word_count === 0
                    ? "No filler words detected."
                    : `${analysis.filler_word_count} filler word${
                        analysis.filler_word_count === 1 ? "" : "s"
                      } detected in the recognized transcript.`}
                </p>
              </ResultContentDisclosure>
            </SectionBlock>

            <SectionBlock
              eyebrow="Quality"
              title="Fluency indicator"
              description="A derived score from speaking pace, pauses, average pause duration, and filler-word rate."
            >
              <ResultContentDisclosure
                label="Quality results"
                isOpen={expandedResultContent.quality}
                onToggle={() => toggleResultContent("quality")}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <ScoreMeter score={analysis.fluency_score} />
                  <MetricTile
                    label="Avg. word duration"
                    value={analysis.average_word_duration.toFixed(2)}
                    suffix="sec"
                    description="Per recognized word"
                    tooltip="Word duration is each word end timestamp minus start timestamp. This metric averages those durations."
                    tone="blue"
                  />
                </div>
                <p className="mt-5 rounded-2xl border border-white/10 bg-white/[0.035] p-5 text-sm leading-6 text-slate-400">
                  This is an application metric, not a medical,
                  psychological, or definitive language assessment.
                </p>
              </ResultContentDisclosure>
            </SectionBlock>
          </div>

          <WordTimeline words={analysis.words} />
          <PauseTimeline pauses={analysis.pauses} />
          <TerminologyPanel />
        </div>
      </div>
    </section>
  );
}
function EmptyAnalysisState({
  isRecording,
  hasAudio,
}: {
  isRecording: boolean;
  hasAudio: boolean;
}) {
  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-white/[0.045] p-8 shadow-2xl shadow-black/20 backdrop-blur-xl">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">
        Workspace
      </p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">
        {isRecording
          ? "Listening for your speech"
          : hasAudio
            ? "Preparing your analysis"
            : "Ready when you are"}
      </h2>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
        Record a complete speech sample and the results will appear
        here with pace, pauses, fillers, transcript, and word-level
        timing.
      </p>
    </section>
  );
}

function LoadingState() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-5 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4 text-sm text-cyan-50 shadow-lg shadow-cyan-950/20"
    >
      <div className="flex items-center gap-3">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-cyan-300 motion-reduce:animate-none" />
        <span>
          Analyzing your recording. This may take a moment for
          longer speech samples.
        </span>
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="mb-5 rounded-2xl border border-red-300/25 bg-red-500/10 p-4 text-sm leading-6 text-red-100"
    >
      <p className="font-semibold text-red-50">
        Analysis could not be completed
      </p>
      <p className="mt-1 text-red-100/85">{message}</p>
    </div>
  );
}

function SectionBlock({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300/90">
          {eyebrow}
        </p>
        <h3 className="mt-1 text-xl font-semibold tracking-tight text-white">
          {title}
        </h3>
        {description ? (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            {description}
          </p>
        ) : null}
      </div>

      {children}
    </section>
  );
}

function ResultContentDisclosure({
  label,
  isOpen,
  onToggle,
  children,
}: {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const contentId = `${label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")}-content`;

  return (
    <div>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={contentId}
        onClick={onToggle}
        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-300/40 hover:bg-white/[0.07] focus:outline-none focus:ring-2 focus:ring-cyan-200"
      >
        <span>{isOpen ? "Hide" : "Show"} {label}</span>
        <span
          aria-hidden="true"
          className={`text-base leading-none text-cyan-200 transition-transform duration-200 ${
            isOpen ? "rotate-90" : ""
          }`}
        >
          &rsaquo;
        </span>
      </button>

      <div
        id={contentId}
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </div>
  );
}
function MetricTile({
  label,
  value,
  suffix,
  description,
  tooltip,
  tone = "neutral",
}: {
  label: string;
  value: string;
  suffix?: string;
  description: string;
  tooltip?: string;
  tone?: MetricTone;
}) {
  return (
    <div
      className={`min-w-0 rounded-2xl border p-5 transition duration-200 hover:-translate-y-0.5 hover:bg-white/[0.08] motion-reduce:hover:translate-y-0 ${getMetricToneClasses(
        tone,
      )}`}
    >
      <MetricTileContent
        label={label}
        value={value}
        suffix={suffix}
        description={description}
        tooltip={tooltip}
      />
    </div>
  );
}

function MetricTileContent({
  label,
  value,
  suffix,
  description,
  tooltip,
  showLabel = true,
  valueClassName = "text-3xl font-semibold tracking-tight text-white",
}: {
  label: string;
  value: string;
  suffix?: string;
  description: string;
  tooltip?: string;
  showLabel?: boolean;
  valueClassName?: string;
}) {
  return (
    <>
      {showLabel ? (
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 text-sm font-medium leading-5 text-slate-400 [overflow-wrap:anywhere]">
            {label}
          </p>
          {tooltip ? <InfoDot text={tooltip} /> : null}
        </div>
      ) : null}
      <p
        className={`mt-3 [overflow-wrap:anywhere] ${valueClassName}`}
      >
        <span className="tabular-nums">{value}</span>
        {suffix ? (
          <span className="ml-1 align-baseline text-sm font-medium text-slate-400">
            {suffix}
          </span>
        ) : null}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-400 [overflow-wrap:anywhere]">
        {description}
      </p>
      {!showLabel && tooltip ? (
        <p className="mt-3 text-xs leading-5 text-slate-500 [overflow-wrap:anywhere]">
          {tooltip}
        </p>
      ) : null}
    </>
  );
}

function InfoDot({ text }: { text: string }) {
  return (
    <span
      title={text}
      aria-label={text}
      className="inline-flex h-5 w-5 shrink-0 cursor-help items-center justify-center rounded-full border border-white/15 bg-white/5 text-[11px] font-semibold leading-none text-slate-300"
    >
      i
    </span>
  );
}

function SpeechSilenceBar({
  speechPercentage,
  silencePercentage,
}: {
  speechPercentage: number;
  silencePercentage: number;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-sm font-medium text-slate-300">
            Speech
          </p>
          <p className="mt-1 text-2xl font-semibold text-white">
            {speechPercentage.toFixed(1)}
            <span className="ml-1 text-sm text-slate-400">%</span>
          </p>
        </div>
        <div>
          <p className="text-sm font-medium text-slate-300">
            Silence
          </p>
          <p className="mt-1 text-2xl font-semibold text-white">
            {silencePercentage.toFixed(1)}
            <span className="ml-1 text-sm text-slate-400">%</span>
          </p>
        </div>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-violet-400 transition-[width] duration-500"
          style={{
            width: `${clampPercentage(speechPercentage)}%`,
          }}
        />
      </div>
    </div>
  );
}
function ScoreMeter({ score }: { score: number }) {
  const clampedScore = clampPercentage(score);

  return (
    <div className="min-w-0 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-sm font-medium text-cyan-200">
          Fluency score
        </p>
        <InfoDot text="Derived from pace, pause frequency, average pause duration, and filler-word rate." />
      </div>
      <p className="mt-3 text-3xl font-semibold text-white">
        <span className="tabular-nums">
          {score.toFixed(0)}
        </span>
        <span className="text-base font-medium text-slate-400">
          /100
        </span>
      </p>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-400 to-cyan-300 transition-[width] duration-500"
          style={{
            width: `${clampedScore}%`,
          }}
        />
      </div>
    </div>
  );
}

function TranscriptSection({
  transcript,
}: {
  transcript: string;
}) {
  return (
    <SectionBlock
      eyebrow="Transcript"
      title="Recognized speech"
      description="A readable transcript from the same word-level recognition pass used for timing."
    >
      <div className="max-h-[28rem] overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/75 p-5 text-base leading-8 text-slate-100 shadow-inner shadow-black/20 [overflow-wrap:anywhere] sm:p-6">
        {transcript || (
          <span className="text-slate-500">No speech detected.</span>
        )}
      </div>
    </SectionBlock>
  );
}

function WordTimeline({
  words,
}: {
  words: SpeechAnalysisResult["words"];
}) {
  return (
    <SectionBlock
      eyebrow="Word Timeline"
      title="Word-level timing"
      description="Timestamps come from word-level speech recognition timestamps."
    >
      <TimelineExplanation
        items={[
          {
            label: "Start",
            text: "The timestamp at which Whisper detected the word beginning.",
          },
          {
            label: "End",
            text: "The timestamp at which Whisper detected the word ending.",
          },
          {
            label: "Duration",
            text: "End timestamp minus start timestamp. If a word starts at 4.20s and ends at 4.56s, duration is 0.36 seconds.",
          },
        ]}
      />

      <div className="mt-4 max-h-[30rem] overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/60">
        {words.length > 0 ? (
          <>
            <div className="divide-y divide-white/[0.06] sm:hidden">
              {words.map((word, index) => (
                <div
                  key={`${word.start}-${word.end}-${index}`}
                  className="p-4"
                >
                  <p className="font-medium text-slate-100 [overflow-wrap:anywhere]">
                    {word.text}
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                    <TimelineDatum
                      label="Start"
                      value={`${word.start.toFixed(2)}s`}
                    />
                    <TimelineDatum
                      label="End"
                      value={`${word.end.toFixed(2)}s`}
                    />
                    <TimelineDatum
                      label="Duration"
                      value={`${word.duration.toFixed(2)}s`}
                    />
                  </div>
                </div>
              ))}
            </div>

            <table className="hidden w-full table-fixed border-collapse text-sm sm:table">
              <thead className="sticky top-0 z-10 bg-[#10172a] text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                <tr>
                  <th className="w-[46%] px-4 py-3 text-left">
                    Word
                  </th>
                  <th className="w-[18%] px-4 py-3 text-right">
                    Start
                  </th>
                  <th className="w-[18%] px-4 py-3 text-right">
                    End
                  </th>
                  <th className="w-[18%] px-4 py-3 text-right">
                    Duration
                  </th>
                </tr>
              </thead>
              <tbody>
                {words.map((word, index) => (
                  <tr
                    key={`${word.start}-${word.end}-${index}`}
                    className="border-t border-white/[0.06] transition hover:bg-white/[0.035]"
                  >
                    <td className="px-4 py-3 align-top font-medium text-slate-100 [overflow-wrap:anywhere]">
                      {word.text}
                    </td>
                    <td className="px-4 py-3 text-right align-top font-mono text-slate-400">
                      {word.start.toFixed(2)}s
                    </td>
                    <td className="px-4 py-3 text-right align-top font-mono text-slate-400">
                      {word.end.toFixed(2)}s
                    </td>
                    <td
                      className="px-4 py-3 text-right align-top font-mono text-slate-400"
                      title="End timestamp minus start timestamp."
                    >
                      {word.duration.toFixed(2)}s
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            No words were detected.
          </div>
        )}
      </div>
    </SectionBlock>
  );
}

function PauseTimeline({
  pauses,
}: {
  pauses: SpeechAnalysisResult["pauses"];
}) {
  return (
    <SectionBlock
      eyebrow="Pause Timeline"
      title="Detected speech gaps"
      description="Pauses are detected from gaps between consecutive recognized words that meet the application's pause threshold."
    >
      <TimelineExplanation
        items={[
          {
            label: "Pause start",
            text: "The timestamp where the detected pause begins.",
          },
          {
            label: "Pause end",
            text: "The timestamp where the detected pause ends.",
          },
          {
            label: "Pause duration",
            text: "Pause end minus pause start.",
          },
        ]}
      />

      <div className="mt-4 max-h-[24rem] overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/60">
        {pauses.length > 0 ? (
          <>
            <div className="divide-y divide-white/[0.06] sm:hidden">
              {pauses.map((pause, index) => (
                <div
                  key={`${pause.start}-${pause.end}-${index}`}
                  className="p-4"
                >
                  <p className="font-medium text-slate-100">
                    Pause {index + 1}
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                    <TimelineDatum
                      label="Start"
                      value={formatTimestamp(pause.start)}
                    />
                    <TimelineDatum
                      label="End"
                      value={formatTimestamp(pause.end)}
                    />
                    <TimelineDatum
                      label="Duration"
                      value={`${pause.duration.toFixed(2)} sec`}
                    />
                  </div>
                </div>
              ))}
            </div>

            <table className="hidden w-full table-fixed border-collapse text-sm sm:table">
              <thead className="sticky top-0 z-10 bg-[#10172a] text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                <tr>
                  <th className="w-[40%] px-4 py-3 text-left">
                    Pause
                  </th>
                  <th className="w-[20%] px-4 py-3 text-right">
                    Start
                  </th>
                  <th className="w-[20%] px-4 py-3 text-right">
                    End
                  </th>
                  <th className="w-[20%] px-4 py-3 text-right">
                    Duration
                  </th>
                </tr>
              </thead>
              <tbody>
                {pauses.map((pause, index) => (
                  <tr
                    key={`${pause.start}-${pause.end}-${index}`}
                    className="border-t border-white/[0.06] transition hover:bg-white/[0.035]"
                  >
                    <td className="px-4 py-3 align-top font-medium text-slate-100">
                      Pause {index + 1}
                    </td>
                    <td className="px-4 py-3 text-right align-top font-mono text-slate-400">
                      {formatTimestamp(pause.start)}
                    </td>
                    <td className="px-4 py-3 text-right align-top font-mono text-slate-400">
                      {formatTimestamp(pause.end)}
                    </td>
                    <td
                      className="px-4 py-3 text-right align-top font-mono text-cyan-200"
                      title="Pause end minus pause start."
                    >
                      {pause.duration.toFixed(2)} sec
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            No significant pauses detected.
          </div>
        )}
      </div>
    </SectionBlock>
  );
}

function TimelineDatum({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-slate-300 [overflow-wrap:anywhere]">
        {value}
      </p>
    </div>
  );
}

function TimelineExplanation({
  items,
}: {
  items: Array<{
    label: string;
    text: string;
  }>;
}) {
  return (
    <details className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-sm text-slate-300 open:bg-white/[0.06]">
      <summary className="cursor-pointer font-semibold text-slate-100">
        How this is calculated
      </summary>
      <div className="mt-3 grid gap-3">
        {items.map((item) => (
          <p key={item.label} className="leading-6">
            <span className="font-semibold text-cyan-200">
              {item.label}:
            </span>{" "}
            {item.text}
          </p>
        ))}
      </div>
    </details>
  );
}

function TerminologyPanel() {
  return (
    <aside className="min-w-0">
      <details
        className="rounded-2xl border border-white/10 bg-slate-950/70 p-5 backdrop-blur-xl"
        open
      >
        <summary className="cursor-pointer text-sm font-semibold uppercase tracking-[0.18em] text-cyan-300 2xl:pointer-events-none">
          Metric guide
        </summary>

        <div className="mt-5 max-h-[calc(100vh-8rem)] space-y-6 overflow-y-auto pr-1 text-sm leading-6 text-slate-400">
          <GuideGroup title="Core Metrics">
            <GuideItem
              title="Words"
              text="Total number of recognized words in the recording."
            />
            <GuideItem
              title="Speaking Duration"
              text="Total amount of time during which recognized speech is occurring."
            />
            <GuideItem
              title="Silence Duration"
              text="Recording duration minus detected speaking duration."
            />
          </GuideGroup>

          <GuideGroup title="Pace">
            <GuideItem
              title="Overall WPM"
              text="Words per minute calculated using the complete recording duration. Formula: total words / recording duration x 60."
            />
            <GuideItem
              title="Speaking WPM"
              text="Words per minute calculated using detected speaking duration. Formula: total words / speaking duration x 60."
            />
            <GuideItem
              title="Pace Classification"
              text="The application classifies speaking pace based on speaking rate."
            />
          </GuideGroup>

          <GuideGroup title="Pauses">
            <GuideItem
              title="Pause Count"
              text="Number of detected pauses meeting the application's pause threshold."
            />
            <GuideItem
              title="Average Pause"
              text="Average duration of detected pauses."
            />
            <GuideItem
              title="Longest Pause"
              text="Duration of the longest detected pause."
            />
            <GuideItem
              title="Silence %"
              text="Percentage of the recording classified as silence."
            />
            <GuideItem
              title="Speech %"
              text="Percentage of the recording classified as speaking time."
            />
          </GuideGroup>

          <GuideGroup title="Fillers">
            <GuideItem
              title="Filler Word Count"
              text="Number of detected filler or hesitation words."
            />
            <GuideItem
              title="Filler Rate"
              text="Percentage of recognized words classified as fillers."
            />
          </GuideGroup>

          <GuideGroup title="Quality">
            <GuideItem
              title="Fluency Score"
              text="The application's derived fluency indicator based on implemented speech metrics."
            />
            <GuideItem
              title="Average Word Duration"
              text="Average duration of recognized words."
            />
          </GuideGroup>

          <GuideGroup title="Timelines">
            <GuideItem
              title="Word Start"
              text="Timestamp where the recognized word begins."
            />
            <GuideItem
              title="Word End"
              text="Timestamp where the recognized word ends."
            />
            <GuideItem
              title="Word Duration"
              text="End timestamp minus start timestamp."
            />
            <GuideItem
              title="Pause Start"
              text="Timestamp where the detected pause begins."
            />
            <GuideItem
              title="Pause End"
              text="Timestamp where the detected pause ends."
            />
            <GuideItem
              title="Pause Duration"
              text="Pause end minus pause start."
            />
          </GuideGroup>
        </div>
      </details>
    </aside>
  );
}

function GuideGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="border-t border-white/10 pt-4 first:border-t-0 first:pt-0">
      <h4 className="text-sm font-semibold text-slate-100">
        {title}
      </h4>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

function GuideItem({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <p className="[overflow-wrap:anywhere]">
      <span className="block font-medium text-slate-200">
        {title}
      </span>
      <span className="mt-0.5 block text-slate-400">{text}</span>
    </p>
  );
}

function StatusBadge({
  status,
  isAnalyzing,
}: {
  status: RecordingStatus;
  isAnalyzing: boolean;
}) {
  const label = isAnalyzing
    ? "Analyzing"
    : status === "recording"
      ? "Recording"
      : status === "ready"
        ? "Ready"
        : status === "error"
          ? "Needs attention"
          : "Idle";

  return (
    <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-slate-300 sm:flex">
      <span
        className={`h-2 w-2 rounded-full ${
          status === "recording"
            ? "animate-pulse bg-red-400 motion-reduce:animate-none"
            : isAnalyzing
              ? "animate-pulse bg-cyan-300 motion-reduce:animate-none"
              : status === "ready"
                ? "bg-emerald-300"
                : status === "error"
                  ? "bg-red-300"
                  : "bg-slate-500"
        }`}
      />
      {label}
    </div>
  );
}

function getMetricToneClasses(tone: MetricTone): string {
  switch (tone) {
    case "cyan":
      return "border-cyan-300/20 bg-cyan-300/[0.075]";
    case "violet":
      return "border-violet-300/20 bg-violet-300/[0.07]";
    case "blue":
      return "border-blue-300/20 bg-blue-300/[0.07]";
    default:
      return "border-white/10 bg-white/[0.045]";
  }
}

function clampPercentage(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function getSupportedMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") {
    return null;
  }

  const mimeTypes = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];

  for (const mimeType of mimeTypes) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }

  return null;
}

function getAudioExtension(mimeType: string): string {
  if (mimeType.includes("ogg")) {
    return "ogg";
  }

  return "webm";
}

function formatDuration(seconds: number): string {
  const totalMilliseconds = Math.max(
    0,
    Math.floor(seconds * 1000),
  );

  const minutes = Math.floor(
    totalMilliseconds / 60_000,
  );

  const remainingMilliseconds =
    totalMilliseconds % 60_000;

  const wholeSeconds = Math.floor(
    remainingMilliseconds / 1000,
  );

  const milliseconds = remainingMilliseconds % 1000;

  return `${String(minutes).padStart(
    2,
    "0",
  )}:${String(wholeSeconds).padStart(
    2,
    "0",
  )}.${String(milliseconds).padStart(3, "0")}`;
}

function formatSeconds(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  return `${String(minutes).padStart(
    2,
    "0",
  )}:${remainingSeconds.toFixed(2).padStart(5, "0")}`;
}

function formatTimestamp(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  return `${String(minutes).padStart(
    2,
    "0",
  )}:${remainingSeconds.toFixed(2).padStart(5, "0")}`;
}

function getStatusText(
  status: RecordingStatus,
): string {
  switch (status) {
    case "recording":
      return "Recording in progress";

    case "stopping":
      return "Finalizing recording";

    case "ready":
      return "Recording ready for analysis";

    case "error":
      return "Recording needs attention";

    default:
      return "Ready to record";
  }
}

export default App;
