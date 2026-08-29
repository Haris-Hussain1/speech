from pydantic import BaseModel, Field


class WordTiming(BaseModel):
    text: str
    start: float = Field(ge=0)
    end: float = Field(ge=0)
    duration: float = Field(ge=0)


class PauseTiming(BaseModel):
    start: float = Field(ge=0)
    end: float = Field(ge=0)
    duration: float = Field(ge=0)


class SpeechAnalysisResponse(BaseModel):
    transcript: str

    recording_duration: float = Field(ge=0)
    speaking_duration: float = Field(ge=0)
    pause_duration: float = Field(ge=0)

    total_words: int = Field(
        ge=0,
        description=(
            "Authoritative count of normalized transcribed words."
        ),
    )

    words_per_minute: float = Field(
        ge=0,
        description=(
            "Legacy alias for speaking_words_per_minute."
        ),
    )
    average_word_duration: float = Field(ge=0)

    words: list[WordTiming]

    overall_words_per_minute: float = Field(
        ge=0,
        description=(
            "Words per minute over the full recording duration."
        ),
    )
    speaking_words_per_minute: float = Field(
        ge=0,
        description=(
            "Words per minute over detected speaking duration."
        ),
    )
    pause_count: int = Field(ge=0)
    average_pause_duration: float = Field(ge=0)
    longest_pause_duration: float = Field(ge=0)
    silence_percentage: float = Field(ge=0)
    speech_percentage: float = Field(ge=0)
    filler_word_count: int = Field(ge=0)
    filler_word_rate: float = Field(ge=0)
    pace: str
    fluency_score: float = Field(ge=0, le=100)
    pauses: list[PauseTiming]
