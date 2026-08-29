import logging

from dataclasses import dataclass
from time import perf_counter

from faster_whisper import WhisperModel


DEFAULT_INITIAL_PROMPT = (
    "General English speech with Pakistani names and locations. "
    "Vocabulary examples: Haris Hussain, Shinkiari, Islamabad, "
    "Abbottabad, Pakistan."
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class TranscribedWord:
    text: str
    start: float
    end: float


@dataclass(frozen=True)
class TranscriptionTiming:
    model_load_seconds: float
    transcription_setup_seconds: float
    decoding_iteration_seconds: float
    word_collection_seconds: float
    total_transcription_seconds: float
    request_number: int
    segment_count: int
    word_count: int
    cpu_threads: int


class TranscriptionService:
    def __init__(
        self,
        model_size: str = "small",
        device: str = "cpu",
        compute_type: str = "int8",
        language: str | None = None,
        beam_size: int = 1,
        cpu_threads: int = 0,
        initial_prompt: str = DEFAULT_INITIAL_PROMPT,
    ) -> None:
        model_load_started_at = perf_counter()

        self.model = WhisperModel(
            model_size,
            device=device,
            compute_type=compute_type,
            cpu_threads=cpu_threads,
        )

        self.model_load_seconds = (
            perf_counter() - model_load_started_at
        )

        self.language = language
        self.beam_size = beam_size
        self.cpu_threads = cpu_threads
        self.initial_prompt = initial_prompt

        self.transcription_count = 0

        logger.info(
            "whisper_model_initialized "
            "model_size=%s device=%s compute_type=%s "
            "beam_size=%s cpu_threads=%s load=%.4fs",
            model_size,
            device,
            compute_type,
            beam_size,
            self.cpu_threads,
            self.model_load_seconds,
        )

    def transcribe(
        self,
        audio_path: str,
    ) -> tuple[list[TranscribedWord], TranscriptionTiming]:
        self.transcription_count += 1
        request_number = self.transcription_count

        total_started_at = perf_counter()

        setup_started_at = perf_counter()

        segments, _ = self.model.transcribe(
            audio_path,
            language=self.language,
            word_timestamps=True,
            vad_filter=True,
            beam_size=self.beam_size,
            initial_prompt=self.initial_prompt,
        )

        transcription_setup_seconds = (
            perf_counter() - setup_started_at
        )

        words: list[TranscribedWord] = []
        segment_count = 0
        decoding_iteration_seconds = 0.0
        word_collection_seconds = 0.0

        iteration_started_at = perf_counter()

        for segment in segments:
            decoding_iteration_seconds += (
                perf_counter() - iteration_started_at
            )

            segment_count += 1

            collection_started_at = perf_counter()

            if segment.words is None:
                word_collection_seconds += (
                    perf_counter() - collection_started_at
                )
                iteration_started_at = perf_counter()
                continue

            for word in segment.words:
                if word.start is None or word.end is None:
                    continue

                text = word.word.strip()

                if not text:
                    continue

                start = float(word.start)
                end = float(word.end)

                if start < 0:
                    start = 0.0

                if end <= start:
                    continue

                words.append(
                    TranscribedWord(
                        text=text,
                        start=start,
                        end=end,
                    )
                )

            word_collection_seconds += (
                perf_counter() - collection_started_at
            )

            iteration_started_at = perf_counter()

        total_transcription_seconds = (
            perf_counter() - total_started_at
        )

        timing = TranscriptionTiming(
            model_load_seconds=self.model_load_seconds,
            transcription_setup_seconds=transcription_setup_seconds,
            decoding_iteration_seconds=decoding_iteration_seconds,
            word_collection_seconds=word_collection_seconds,
            total_transcription_seconds=total_transcription_seconds,
            request_number=request_number,
            segment_count=segment_count,
            word_count=len(words),
            cpu_threads=self.cpu_threads,
        )

        logger.info(
            "whisper_transcription_timing "
            "request=%s model_load=%.4fs setup=%.4fs "
            "decode_iteration=%.4fs word_collection=%.4fs "
            "total=%.4fs segments=%s words=%s",
            timing.request_number,
            timing.model_load_seconds,
            timing.transcription_setup_seconds,
            timing.decoding_iteration_seconds,
            timing.word_collection_seconds,
            timing.segment_count,
            timing.word_count,
        )

        return words, timing