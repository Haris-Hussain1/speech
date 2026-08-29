from dataclasses import dataclass

from app.services.transcription import TranscribedWord


MIN_PAUSE_DURATION = 0.25


@dataclass(frozen=True)
class Pause:
    start: float
    end: float
    duration: float


@dataclass(frozen=True)
class PauseAnalysis:
    pauses: list[Pause]
    pause_count: int
    average_pause_duration: float
    longest_pause_duration: float


class PauseAnalysisService:
    def __init__(
        self,
        min_pause_duration: float = MIN_PAUSE_DURATION,
    ) -> None:
        self.min_pause_duration = min_pause_duration

    def analyze(
        self,
        words: list[TranscribedWord],
    ) -> PauseAnalysis:
        pauses: list[Pause] = []

        if len(words) < 2:
            return PauseAnalysis(
                pauses=[],
                pause_count=0,
                average_pause_duration=0.0,
                longest_pause_duration=0.0,
            )

        for previous_word, current_word in zip(
            words,
            words[1:],
            strict=False,
        ):
            gap_start = previous_word.end
            gap_end = current_word.start
            gap_duration = gap_end - gap_start

            if gap_duration < self.min_pause_duration:
                continue

            pauses.append(
                Pause(
                    start=gap_start,
                    end=gap_end,
                    duration=gap_duration,
                )
            )

        pause_count = len(pauses)
        total_pause_duration = sum(
            pause.duration for pause in pauses
        )

        return PauseAnalysis(
            pauses=pauses,
            pause_count=pause_count,
            average_pause_duration=(
                total_pause_duration / pause_count
                if pause_count > 0
                else 0.0
            ),
            longest_pause_duration=max(
                (pause.duration for pause in pauses),
                default=0.0,
            ),
        )
