import pytest

from app.services.speech_analysis import SpeechAnalysisService
from app.services.transcription import TranscribedWord


@pytest.fixture
def analysis_service() -> SpeechAnalysisService:
    return SpeechAnalysisService()


def test_basic_speech_analysis(
    analysis_service: SpeechAnalysisService,
) -> None:
    words = [
        TranscribedWord(
            text="Hello",
            start=0.5,
            end=1.0,
        ),
        TranscribedWord(
            text="world",
            start=1.2,
            end=1.8,
        ),
    ]

    result = analysis_service.analyze(
        words=words,
        audio_duration=2.0,
    )

    assert result.transcript == "Hello world"

    assert result.total_words == 2
    assert result.total_words == len(result.words)

    assert result.recording_duration == pytest.approx(2.0)

    assert result.speaking_duration == pytest.approx(1.1)

    assert result.pause_duration == pytest.approx(0.9)

    assert result.average_word_duration == pytest.approx(0.55)

    assert result.words_per_minute == pytest.approx(
        109.0909091,
    )
    assert result.words_per_minute == pytest.approx(
        result.speaking_words_per_minute
    )
    assert result.overall_words_per_minute == pytest.approx(
        60.0,
    )
    assert result.speaking_words_per_minute == pytest.approx(
        109.0909091,
    )


def test_leading_and_trailing_silence(
    analysis_service: SpeechAnalysisService,
) -> None:
    words = [
        TranscribedWord(
            text="Hello",
            start=2.0,
            end=3.0,
        ),
    ]

    result = analysis_service.analyze(
        words=words,
        audio_duration=5.0,
    )

    assert result.recording_duration == pytest.approx(5.0)

    assert result.speaking_duration == pytest.approx(1.0)

    assert result.pause_duration == pytest.approx(4.0)

    assert result.words_per_minute == pytest.approx(
        60.0,
    )
    assert result.overall_words_per_minute == pytest.approx(
        12.0,
    )
    assert result.speaking_words_per_minute == pytest.approx(
        60.0,
    )


def test_pause_between_words(
    analysis_service: SpeechAnalysisService,
) -> None:
    words = [
        TranscribedWord(
            text="Hello",
            start=0.0,
            end=1.0,
        ),
        TranscribedWord(
            text="again",
            start=3.0,
            end=4.0,
        ),
    ]

    result = analysis_service.analyze(
        words=words,
        audio_duration=5.0,
    )

    assert result.recording_duration == pytest.approx(5.0)

    assert result.speaking_duration == pytest.approx(2.0)

    assert result.pause_duration == pytest.approx(3.0)

    assert result.words_per_minute == pytest.approx(
        60.0,
    )
    assert result.overall_words_per_minute == pytest.approx(
        24.0,
    )
    assert result.speaking_words_per_minute == pytest.approx(
        60.0,
    )
    assert result.pause_count == 1
    assert result.average_pause_duration == pytest.approx(
        2.0,
    )
    assert result.longest_pause_duration == pytest.approx(
        2.0,
    )
    assert result.pauses[0].start == pytest.approx(1.0)
    assert result.pauses[0].end == pytest.approx(3.0)
    assert result.pauses[0].duration == pytest.approx(2.0)


def test_multiple_pauses(
    analysis_service: SpeechAnalysisService,
) -> None:
    words = [
        TranscribedWord(
            text="This",
            start=1.0,
            end=2.0,
        ),
        TranscribedWord(
            text="is",
            start=3.0,
            end=3.5,
        ),
        TranscribedWord(
            text="a",
            start=5.0,
            end=5.3,
        ),
        TranscribedWord(
            text="test",
            start=6.0,
            end=7.0,
        ),
    ]

    result = analysis_service.analyze(
        words=words,
        audio_duration=8.0,
    )

    assert result.total_words == 4

    assert result.recording_duration == pytest.approx(8.0)

    assert result.speaking_duration == pytest.approx(2.8)

    assert result.pause_duration == pytest.approx(5.2)

    assert result.average_word_duration == pytest.approx(
        0.7,
    )

    assert result.words_per_minute == pytest.approx(
        85.7142857,
    )
    assert result.overall_words_per_minute == pytest.approx(
        30.0,
    )
    assert result.speaking_words_per_minute == pytest.approx(
        85.7142857,
    )
    assert result.pause_count == 3
    assert result.average_pause_duration == pytest.approx(
        1.0666667,
    )
    assert result.longest_pause_duration == pytest.approx(
        1.5,
    )
    assert result.silence_percentage == pytest.approx(
        65.0,
    )
    assert result.speech_percentage == pytest.approx(
        35.0,
    )


def test_overlapping_words_are_not_double_counted(
    analysis_service: SpeechAnalysisService,
) -> None:
    words = [
        TranscribedWord(
            text="Hello",
            start=0.0,
            end=1.0,
        ),
        TranscribedWord(
            text="world",
            start=0.8,
            end=1.5,
        ),
    ]

    result = analysis_service.analyze(
        words=words,
        audio_duration=2.0,
    )

    assert result.total_words == 2

    assert result.speaking_duration == pytest.approx(
        1.5,
    )

    assert result.pause_duration == pytest.approx(
        0.5,
    )


def test_words_are_sorted_by_timestamp(
    analysis_service: SpeechAnalysisService,
) -> None:
    words = [
        TranscribedWord(
            text="world",
            start=1.0,
            end=1.5,
        ),
        TranscribedWord(
            text="Hello",
            start=0.0,
            end=0.8,
        ),
    ]

    result = analysis_service.analyze(
        words=words,
        audio_duration=2.0,
    )

    assert result.transcript == "Hello world"

    assert result.words[0].text == "Hello"

    assert result.words[1].text == "world"


def test_invalid_word_timestamps_are_removed(
    analysis_service: SpeechAnalysisService,
) -> None:
    words = [
        TranscribedWord(
            text="valid",
            start=1.0,
            end=2.0,
        ),
        TranscribedWord(
            text="invalid",
            start=3.0,
            end=2.0,
        ),
    ]

    result = analysis_service.analyze(
        words=words,
        audio_duration=5.0,
    )

    assert result.total_words == 1

    assert result.transcript == "valid"

    assert result.words[0].text == "valid"


def test_timestamps_are_clamped_to_recording(
    analysis_service: SpeechAnalysisService,
) -> None:
    words = [
        TranscribedWord(
            text="Hello",
            start=-1.0,
            end=6.0,
        ),
    ]

    result = analysis_service.analyze(
        words=words,
        audio_duration=5.0,
    )

    assert result.total_words == 1

    assert result.words[0].start == pytest.approx(0.0)

    assert result.words[0].end == pytest.approx(5.0)

    assert result.words[0].duration == pytest.approx(5.0)

    assert result.speaking_duration == pytest.approx(
        5.0,
    )

    assert result.pause_duration == pytest.approx(
        0.0,
    )


def test_empty_transcription(
    analysis_service: SpeechAnalysisService,
) -> None:
    result = analysis_service.analyze(
        words=[],
        audio_duration=10.0,
    )

    assert result.transcript == ""

    assert result.total_words == 0

    assert result.recording_duration == pytest.approx(
        10.0,
    )

    assert result.speaking_duration == pytest.approx(
        0.0,
    )

    assert result.pause_duration == pytest.approx(
        10.0,
    )

    assert result.average_word_duration == pytest.approx(
        0.0,
    )

    assert result.words_per_minute == pytest.approx(
        0.0,
    )
    assert result.overall_words_per_minute == pytest.approx(
        0.0,
    )
    assert result.speaking_words_per_minute == pytest.approx(
        0.0,
    )
    assert result.pause_count == 0
    assert result.average_pause_duration == pytest.approx(
        0.0,
    )
    assert result.longest_pause_duration == pytest.approx(
        0.0,
    )
    assert result.silence_percentage == pytest.approx(
        100.0,
    )
    assert result.speech_percentage == pytest.approx(
        0.0,
    )

    assert result.words == []


def test_tiny_timestamp_gaps_are_not_meaningful_pauses(
    analysis_service: SpeechAnalysisService,
) -> None:
    words = [
        TranscribedWord(
            text="small",
            start=0.0,
            end=0.4,
        ),
        TranscribedWord(
            text="gap",
            start=0.6,
            end=1.0,
        ),
    ]

    result = analysis_service.analyze(
        words=words,
        audio_duration=2.0,
    )

    assert result.pause_count == 0
    assert result.pauses == []
    assert result.speaking_duration == pytest.approx(0.8)
    assert result.pause_duration == pytest.approx(1.2)


def test_filler_detection_uses_tokens_not_substrings(
    analysis_service: SpeechAnalysisService,
) -> None:
    words = [
        TranscribedWord(
            text="umbrella",
            start=0.0,
            end=0.3,
        ),
        TranscribedWord(
            text="actually",
            start=0.4,
            end=0.7,
        ),
        TranscribedWord(
            text="you",
            start=0.8,
            end=1.0,
        ),
        TranscribedWord(
            text="know",
            start=1.1,
            end=1.3,
        ),
    ]

    result = analysis_service.analyze(
        words=words,
        audio_duration=2.0,
    )

    assert result.total_words == 4
    assert result.filler_word_count == 2
    assert result.filler_word_rate == pytest.approx(50.0)


def test_zero_duration_audio_is_rejected(
    analysis_service: SpeechAnalysisService,
) -> None:
    with pytest.raises(
        ValueError,
        match="Audio duration must be greater than zero",
    ):
        analysis_service.analyze(
            words=[],
            audio_duration=0.0,
        )


def test_negative_duration_audio_is_rejected(
    analysis_service: SpeechAnalysisService,
) -> None:
    with pytest.raises(
        ValueError,
        match="Audio duration must be greater than zero",
    ):
        analysis_service.analyze(
            words=[],
            audio_duration=-1.0,
        )
