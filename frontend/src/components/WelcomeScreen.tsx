interface WelcomeScreenProps {
  onSelectAnalyzer: () => void;
  onSelectTranslator: () => void;
}

export function WelcomeScreen({
  onSelectAnalyzer,
  onSelectTranslator,
}: WelcomeScreenProps) {
  return (
    <section className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-5xl items-center justify-center py-10">
      <div className="w-full rounded-[2rem] border border-white/10 bg-white/[0.055] p-6 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-10">
        <div className="mx-auto max-w-2xl text-center">
          <img
            src="/logos/logo.png"
            alt="Learnova logo"
            className="mx-auto h-16 w-16 rounded-2xl object-contain"
          />
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Welcome to Speech Analyzer and Translator Tool
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
            Choose a focused workspace to turn your voice into clear, useful
            language insights.
          </p>
        </div>

        <div className="mx-auto mt-10 grid max-w-3xl gap-5 md:grid-cols-2">
          <ModeCard
            title="Speech Analyzer"
            description="Review transcription, timing, pace, pauses, fillers, and fluency from a recorded speech sample."
            accent="cyan"
            onClick={onSelectAnalyzer}
          />
          <ModeCard
            title="Translator"
            description="Record Urdu speech and receive the original Urdu transcript alongside its English translation."
            accent="violet"
            onClick={onSelectTranslator}
          />
        </div>
      </div>
    </section>
  );
}

function ModeCard({
  title,
  description,
  accent,
  onClick,
}: {
  title: string;
  description: string;
  accent: "cyan" | "violet";
  onClick: () => void;
}) {
  const borderClass =
    accent === "cyan"
      ? "border-cyan-300/20 hover:border-cyan-200/50 focus-visible:ring-cyan-300/70"
      : "border-violet-300/20 hover:border-violet-200/50 focus-visible:ring-violet-300/70";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group rounded-3xl border bg-slate-950/60 p-6 text-left transition duration-200 hover:-translate-y-1 hover:bg-slate-900/80 focus:outline-none focus-visible:ring-2 ${borderClass}`}
    >
      <span className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium uppercase tracking-[0.16em] text-slate-400">
          Workspace
        </span>
        <span className="text-xl text-slate-400 transition group-hover:translate-x-1 group-hover:text-white">
          →
        </span>
      </span>
      <span className="mt-8 block text-2xl font-semibold text-white">
        {title}
      </span>
      <span className="mt-3 block text-sm leading-6 text-slate-300">
        {description}
      </span>
      <span className="mt-7 block text-sm font-semibold text-cyan-200">
        Open workspace
      </span>
    </button>
  );
}
