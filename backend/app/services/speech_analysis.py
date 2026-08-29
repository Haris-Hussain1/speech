from dataclasses import dataclass

from app.services.pause_analysis import (
    Pause,
    PauseAnalysisService,
)
from app.services.speech_metrics import SpeechMetricsService
from app.services.transcription import TranscribedWord


@dataclass(frozen=True)
class AnalyzedWord:
    text: str
    start: float
    end: float
    duration: float


@dataclass(frozen=True)
class SpeechAnalysis:
    transcript: str

    recording_duration: float
    speaking_duration: float
    pause_duration: float

    total_words: int

    words_per_minute: float
    average_word_duration: float

    words: list[AnalyzedWord]

    overall_words_per_minute: float
    speaking_words_per_minute: float
    pause_count: int
    average_pause_duration: float
    longest_pause_duration: float
    silence_percentage: float
    speech_percentage: float
    filler_word_count: int
    filler_word_rate: float
    pace: str
    fluency_score: float
    pauses: list[Pause]


class SpeechAnalysisService:
    def __init__(
        self,
        pause_analysis_service: PauseAnalysisService | None = None,
        speech_metrics_service: SpeechMetricsService | None = None,
    ) -> None:
        self.pause_analysis_service = (
            pause_analysis_service
            or PauseAnalysisService()
        )
        self.speech_metrics_service = (
            speech_metrics_service
            or SpeechMetricsService()
        )

    def analyze(
        self,
        words: list[TranscribedWord],
        audio_duration: float,
    ) -> SpeechAnalysis:
        if audio_duration <= 0:
            raise ValueError(
                "Audio duration must be greater than zero"
            )

        normalized_words = self._normalize_words(
            words,
            audio_duration,
        )

        total_words = len(normalized_words)

        transcript = " ".join(
            word.text for word in normalized_words
        )

        if not normalized_words:
            pause_analysis = self.pause_analysis_service.analyze(
                normalized_words
            )
            speech_metrics = (
                self.speech_metrics_service.calculate(
                    transcript="",
                    total_words=0,
                    recording_duration=audio_duration,
                    speaking_duration=0.0,
                    pause_duration=audio_duration,
                    pause_analysis=pause_analysis,
                )
            )

            return SpeechAnalysis(
                transcript="",
                recording_duration=audio_duration,
                speaking_duration=0.0,
                pause_duration=audio_duration,
                total_words=0,
                words_per_minute=0.0,
                average_word_duration=0.0,
                words=[],
                overall_words_per_minute=(
                    speech_metrics.overall_words_per_minute
                ),
                speaking_words_per_minute=(
                    speech_metrics.speaking_words_per_minute
                ),
                pause_count=pause_analysis.pause_count,
                average_pause_duration=(
                    pause_analysis.average_pause_duration
                ),
                longest_pause_duration=(
                    pause_analysis.longest_pause_duration
                ),
                silence_percentage=(
                    speech_metrics.silence_percentage
                ),
                speech_percentage=(
                    speech_metrics.speech_percentage
                ),
                filler_word_count=(
                    speech_metrics.filler_word_count
                ),
                filler_word_rate=(
                    speech_metrics.filler_word_rate
                ),
                pace=speech_metrics.pace,
                fluency_score=speech_metrics.fluency_score,
                pauses=pause_analysis.pauses,
            )

        analyzed_words = [
            AnalyzedWord(
                text=word.text,
                start=word.start,
                end=word.end,
                duration=word.end - word.start,
            )
            for word in normalized_words
        ]

        speaking_duration = self._calculate_speaking_duration(
            normalized_words
        )

        pause_duration = max(
            0.0,
            audio_duration - speaking_duration,
        )

        total_word_duration = sum(
            word.duration for word in analyzed_words
        )

        average_word_duration = (
            total_word_duration / total_words
        )

        words_per_minute = (
            total_words / speaking_duration * 60.0
            if speaking_duration > 0
            else 0.0
        )

        pause_analysis = self.pause_analysis_service.analyze(
            normalized_words
        )
        speech_metrics = self.speech_metrics_service.calculate(
            transcript=transcript,
            total_words=total_words,
            recording_duration=audio_duration,
            speaking_duration=speaking_duration,
            pause_duration=pause_duration,
            pause_analysis=pause_analysis,
        )

        return SpeechAnalysis(
            transcript=transcript,
            recording_duration=audio_duration,
            speaking_duration=speaking_duration,
            pause_duration=pause_duration,
            total_words=total_words,
            words_per_minute=words_per_minute,
            average_word_duration=average_word_duration,
            words=analyzed_words,
            overall_words_per_minute=(
                speech_metrics.overall_words_per_minute
            ),
            speaking_words_per_minute=(
                speech_metrics.speaking_words_per_minute
            ),
            pause_count=pause_analysis.pause_count,
            average_pause_duration=(
                pause_analysis.average_pause_duration
            ),
            longest_pause_duration=(
                pause_analysis.longest_pause_duration
            ),
            silence_percentage=speech_metrics.silence_percentage,
            speech_percentage=speech_metrics.speech_percentage,
            filler_word_count=speech_metrics.filler_word_count,
            filler_word_rate=speech_metrics.filler_word_rate,
            pace=speech_metrics.pace,
            fluency_score=speech_metrics.fluency_score,
            pauses=pause_analysis.pauses,
        )

    def _normalize_words(
        self,
        words: list[TranscribedWord],
        audio_duration: float,
    ) -> list[TranscribedWord]:
        normalized: list[TranscribedWord] = []

        for word in words:
            text = word.text.strip()

            if not text:
                continue

            start = float(word.start)
            end = float(word.end)

            if start < 0:
                start = 0.0

            if end > audio_duration:
                end = audio_duration

            if end <= start:
                continue

            normalized.append(
                TranscribedWord(
                    text=text,
                    start=start,
                    end=end,
                )
            )

        normalized.sort(key=lambda word: word.start)

        return normalized

    def _calculate_speaking_duration(
        self,
        words: list[TranscribedWord],
    ) -> float:
        if not words:
            return 0.0

        speaking_duration = 0.0

        current_start = words[0].start
        current_end = words[0].end

        for word in words[1:]:
            if word.start <= current_end:
                current_end = max(
                    current_end,
                    word.end,
                )
                continue

            speaking_duration += (
                current_end - current_start
            )

            current_start = word.start
            current_end = word.end

        speaking_duration += (
            current_end - current_start
        )

        return speaking_duration
