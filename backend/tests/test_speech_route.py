from pathlib import Path

import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from app.api.routes import speech
from app.main import app
from app.services.transcription import TranscribedWord


client = TestClient(app)


def _create_test_wav(path: Path) -> None:
    sample_rate = 16000
    samples = [0.0] * sample_rate

    sf.write(
        str(path),
        samples,
        sample_rate,
    )


def test_speech_analyze_success(
    tmp_path: Path,
    monkeypatch,
) -> None:
    audio_path = tmp_path / "test.wav"
    _create_test_wav(audio_path)

    def fake_transcribe(
        _audio_path: str,
    ) -> list[TranscribedWord]:
        return [
            TranscribedWord(
                text="hello",
                start=0.10,
                end=0.40,
            ),
            TranscribedWord(
                text="world",
                start=0.50,
                end=0.90,
            ),
        ]

    monkeypatch.setattr(
        speech.transcription_service,
        "transcribe",
        fake_transcribe,
    )

    with audio_path.open("rb") as audio_file:
        response = client.post(
            "/speech/analyze",
            files={
                "file": (
                    "test.wav",
                    audio_file,
                    "audio/wav",
                )
            },
        )

    assert response.status_code == 200

    data = response.json()

    assert data["transcript"] == "hello world"
    assert data["recording_duration"] == 1.0
    assert data["total_words"] == 2
    assert data["total_words"] == len(data["words"])

    assert data["speaking_duration"] == pytest.approx(0.7)
    assert data["pause_duration"] == pytest.approx(0.3)
    assert data["average_word_duration"] == pytest.approx(0.35)
    assert data["words_per_minute"] == pytest.approx(
        171.428571,
        rel=1e-6,
    )
    assert data["words_per_minute"] == pytest.approx(
        data["speaking_words_per_minute"],
        rel=1e-6,
    )
    assert data["overall_words_per_minute"] == pytest.approx(
        120.0,
        rel=1e-6,
    )
    assert data["speaking_words_per_minute"] == pytest.approx(
        171.428571,
        rel=1e-6,
    )
    assert data["pause_count"] == 0
    assert data["average_pause_duration"] == pytest.approx(0.0)
    assert data["longest_pause_duration"] == pytest.approx(0.0)
    assert data["silence_percentage"] == pytest.approx(30.0)
    assert data["speech_percentage"] == pytest.approx(70.0)
    assert data["filler_word_count"] == 0
    assert data["filler_word_rate"] == pytest.approx(0.0)
    assert data["pace"] == "Fast"
    assert data["fluency_score"] == pytest.approx(92.8571428)
    assert data["pauses"] == []

    assert len(data["words"]) == 2

    assert data["words"][0]["text"] == "hello"
    assert data["words"][0]["start"] == pytest.approx(0.1)
    assert data["words"][0]["end"] == pytest.approx(0.4)
    assert data["words"][0]["duration"] == pytest.approx(0.3)

    assert data["words"][1]["text"] == "world"
    assert data["words"][1]["start"] == pytest.approx(0.5)
    assert data["words"][1]["end"] == pytest.approx(0.9)
    assert data["words"][1]["duration"] == pytest.approx(0.4)


def test_speech_analyze_rejects_empty_audio() -> None:
    response = client.post(
        "/speech/analyze",
        files={
            "file": (
                "empty.wav",
                b"",
                "audio/wav",
            )
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "The uploaded audio file is empty."
    )


def test_speech_analyze_rejects_unsupported_content_type(
    tmp_path: Path,
) -> None:
    audio_path = tmp_path / "test.txt"

    audio_path.write_text(
        "not audio",
        encoding="utf-8",
    )

    with audio_path.open("rb") as audio_file:
        response = client.post(
            "/speech/analyze",
            files={
                "file": (
                    "test.txt",
                    audio_file,
                    "text/plain",
                )
            },
        )

    assert response.status_code == 400
    assert "Unsupported audio format" in response.json()["detail"]


def test_speech_analyze_rejects_invalid_audio(
    tmp_path: Path,
) -> None:
    audio_path = tmp_path / "invalid.wav"

    audio_path.write_bytes(
        b"this is not a real wav file",
    )

    with audio_path.open("rb") as audio_file:
        response = client.post(
            "/speech/analyze",
            files={
                "file": (
                    "invalid.wav",
                    audio_file,
                    "audio/wav",
                )
            },
        )

    assert response.status_code == 422
    assert response.json()["detail"] == (
        "FFmpeg could not normalize the audio."
    )


def test_speech_analyze_handles_transcription_failure(
    tmp_path: Path,
    monkeypatch,
) -> None:
    audio_path = tmp_path / "test.wav"
    _create_test_wav(audio_path)

    def failing_transcribe(
        _audio_path: str,
    ) -> list[TranscribedWord]:
        raise RuntimeError("transcription failed")

    monkeypatch.setattr(
        speech.transcription_service,
        "transcribe",
        failing_transcribe,
    )

    with audio_path.open("rb") as audio_file:
        response = client.post(
            "/speech/analyze",
            files={
                "file": (
                    "test.wav",
                    audio_file,
                    "audio/wav",
                )
            },
        )

    assert response.status_code == 500
    assert response.json()["detail"] == (
        "Unable to analyze the audio recording."
    )
