from pathlib import Path

import pytest

from app.services.audio_validation import (
    AudioValidationError,
    validate_audio_file,
)


def test_missing_audio_file_is_rejected() -> None:
    with pytest.raises(
        AudioValidationError,
        match="Audio file was not found.",
    ):
        validate_audio_file(
            audio_path="does-not-exist.wav",
            content_type="audio/wav",
        )


def test_empty_audio_file_is_rejected(tmp_path: Path) -> None:
    audio_path = tmp_path / "empty.wav"
    audio_path.write_bytes(b"")

    with pytest.raises(
        AudioValidationError,
        match="uploaded audio file is empty",
    ):
        validate_audio_file(
            audio_path=str(audio_path),
            content_type="audio/wav",
        )


def test_unsupported_content_type_is_rejected(
    tmp_path: Path,
) -> None:
    audio_path = tmp_path / "audio.wav"
    audio_path.write_bytes(b"fake-audio-data")

    with pytest.raises(
        AudioValidationError,
        match="Unsupported audio format",
    ):
        validate_audio_file(
            audio_path=str(audio_path),
            content_type="video/mp4",
        )


def test_content_type_parameters_are_normalized(
    tmp_path: Path,
) -> None:
    audio_path = tmp_path / "audio.wav"
    audio_path.write_bytes(b"fake-audio-data")

    with pytest.raises(AudioValidationError) as error:
        validate_audio_file(
            audio_path=str(audio_path),
            content_type="audio/wav;codecs=pcm",
        )

    assert "Unable to inspect" in str(error.value) or "valid audio" in str(
        error.value
    )


def test_valid_audio_metadata_is_returned(
    tmp_path: Path,
) -> None:
    pytest.importorskip("soundfile")
    import soundfile as sf

    audio_path = tmp_path / "valid.wav"

    sample_rate = 16000
    duration_seconds = 1.0
    samples = [0.0] * sample_rate

    sf.write(
        str(audio_path),
        samples,
        sample_rate,
    )

    metadata = validate_audio_file(
        audio_path=str(audio_path),
        content_type="audio/wav",
    )

    assert metadata.duration == pytest.approx(
        duration_seconds,
        abs=0.01,
    )
    assert metadata.size_bytes > 0
    assert metadata.content_type == "audio/wav"


def test_content_type_is_case_insensitive(
    tmp_path: Path,
) -> None:
    pytest.importorskip("soundfile")
    import soundfile as sf

    audio_path = tmp_path / "valid.wav"

    sf.write(
        str(audio_path),
        [0.0] * 16000,
        16000,
    )

    metadata = validate_audio_file(
        audio_path=str(audio_path),
        content_type="AUDIO/WAV",
    )

    assert metadata.content_type == "audio/wav"
