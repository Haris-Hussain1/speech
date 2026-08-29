import re
from dataclasses import dataclass

from app.services.pause_analysis import PauseAnalysis


FILLER_PHRASES = {
    ("you", "know"),
}

FILLER_WORDS = {
    "um",
    "uh",
    "erm",
    "hmm",
    "like",
    "basically",
    "actually",
    "literally",
}

WORD_TOKEN_PATTERN = re.compile(
    r"[a-z]+(?:'[a-z]+)?",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class SpeechMetrics:
    overall_words_per_minute: float
    speaking_words_per_minute: float
    silence_percentage: float
    speech_percentage: float
    filler_word_count: int
    filler_word_rate: float
    pace: str
    fluency_score: float


class SpeechMetricsService:
    def calculate(
        self,
        *,
        transcript: str,
        total_words: int,
        recording_duration: float,
        speaking_duration: float,
        pause_duration: float,
        pause_analysis: PauseAnalysis,
    ) -> SpeechMetrics:
        overall_words_per_minute = (
            total_words / recording_duration * 60.0
            if recording_duration > 0
            else 0.0
        )

        speaking_words_per_minute = (
            total_words / speaking_duration * 60.0
            if speaking_duration > 0
            else 0.0
        )

        silence_percentage = (
            pause_duration / recording_duration * 100.0
            if recording_duration > 0
            else 0.0
        )

        speech_percentage = (
            speaking_duration / recording_duration * 100.0
            if recording_duration > 0
            else 0.0
        )

        filler_word_count = self._count_fillers(
            transcript
        )

        filler_word_rate = (
            filler_word_count / total_words * 100.0
            if total_words > 0
            else 0.0
        )

        return SpeechMetrics(
            overall_words_per_minute=overall_words_per_minute,
            speaking_words_per_minute=speaking_words_per_minute,
            silence_percentage=silence_percentage,
            speech_percentage=speech_percentage,
            filler_word_count=filler_word_count,
            filler_word_rate=filler_word_rate,
            pace=self._classify_pace(
                speaking_words_per_minute
            ),
            fluency_score=self._calculate_fluency_score(
                total_words=total_words,
                speaking_words_per_minute=(
                    speaking_words_per_minute
                ),
                speaking_duration=speaking_duration,
                pause_analysis=pause_analysis,
                filler_word_rate=filler_word_rate,
            ),
        )

    def _count_fillers(
        self,
        transcript: str,
    ) -> int:
        tokens = [
            token.lower()
            for token in WORD_TOKEN_PATTERN.findall(
                transcript
            )
        ]

        count = sum(
            1 for token in tokens if token in FILLER_WORDS
        )

        for phrase in FILLER_PHRASES:
            phrase_length = len(phrase)

            for index in range(
                0,
                len(tokens) - phrase_length + 1,
            ):
                if tuple(
                    tokens[index : index + phrase_length]
                ) == phrase:
                    count += 1

        return count

    def _classify_pace(
        self,
        speaking_words_per_minute: float,
    ) -> str:
        if speaking_words_per_minute < 110:
            return "Slow"

        if speaking_words_per_minute <= 150:
            return "Moderate"

        if speaking_words_per_minute <= 180:
            return "Fast"

        return "Very fast"

    def _calculate_fluency_score(
        self,
        *,
        total_words: int,
        speaking_words_per_minute: float,
        speaking_duration: float,
        pause_analysis: PauseAnalysis,
        filler_word_rate: float,
    ) -> float:
        if total_words == 0:
            return 0.0

        score = 100.0

        if speaking_words_per_minute < 110:
            score -= min(
                20.0,
                (110 - speaking_words_per_minute) / 110 * 20.0,
            )
        elif speaking_words_per_minute > 180:
            score -= min(
                25.0,
                (speaking_words_per_minute - 180) / 120 * 25.0,
            )
        elif speaking_words_per_minute > 150:
            score -= min(
                10.0,
                (speaking_words_per_minute - 150) / 30 * 10.0,
            )

        pause_frequency = (
            pause_analysis.pause_count
            / speaking_duration
            * 60.0
            if speaking_duration > 0
            else 0.0
        )

        if pause_frequency > 6:
            score -= min(
                25.0,
                (pause_frequency - 6) * 2.5,
            )

        if pause_analysis.average_pause_duration > 0.75:
            score -= min(
                20.0,
                (
                    pause_analysis.average_pause_duration
                    - 0.75
                )
                / 2.25
                * 20.0,
            )

        score -= min(
            25.0,
            filler_word_rate * 3.0,
        )

        return max(
            0.0,
            min(
                100.0,
                score,
            ),
        )
