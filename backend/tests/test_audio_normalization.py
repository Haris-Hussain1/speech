from pathlib import Path

import pytest

from app.services.audio_normalization import (
    AudioNormalizer,
    AudioNormalizationError,
)


def test_ffmpeg_is_available() -> None:
    normalizer = AudioNormalizer()

    try:
        normalizer.normalize(
            input_path="does-not-exist.webm",
            output_path="output.wav",
        )
    except AudioNormalizationError as error:
        message = str(error)

        assert "FFmpeg" not in message or "could not normalize" in message