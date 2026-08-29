from dataclasses import dataclass
from pathlib import Path
import wave


MAX_AUDIO_SIZE_BYTES = 50 * 1024 * 1024
MAX_AUDIO_DURATION_SECONDS = 30 * 60


@dataclass(frozen=True)
class AudioMetadata:
    duration: float
    size_bytes: int
    content_type: str


class AudioValidationError(ValueError):
    pass


def validate_uploaded_audio(
    audio_path: str,
    content_type: str,
) -> AudioMetadata:
    """
    Validate the uploaded audio before FFmpeg normalization.

    Browser recordings such as WebM/Opus should not be inspected
    with Mutagen here. FFmpeg is responsible for determining whether
    the actual audio bytes are decodable.
    """

    path = Path(audio_path)

    if not path.exists():
        raise AudioValidationError(
            "Audio file was not found."
        )

    size_bytes = path.stat().st_size

    if size_bytes == 0:
        raise AudioValidationError(
            "The uploaded audio file is empty."
        )

    if size_bytes > MAX_AUDIO_SIZE_BYTES:
        raise AudioValidationError(
            "The audio file is too large. Maximum size is 50 MB."
        )

    allowed_content_types = {
        "audio/webm",
        "audio/ogg",
        "audio/wav",
        "audio/wave",
        "audio/x-wav",
        "audio/mpeg",
        "audio/mp4",
        "audio/x-m4a",
    }

    normalized_content_type = (
        content_type.split(";")[0].strip().lower()
    )

    if normalized_content_type not in allowed_content_types:
        raise AudioValidationError(
            f"Unsupported audio format: {normalized_content_type}"
        )

    return AudioMetadata(
        duration=0.0,
        size_bytes=size_bytes,
        content_type=normalized_content_type,
    )


def validate_audio_file(
    audio_path: str,
    content_type: str,
) -> AudioMetadata:
    """
    Compatibility helper for direct WAV validation tests.

    Upload validation intentionally avoids decoding browser recordings;
    route-level duration checks happen after FFmpeg normalization.
    """

    metadata = validate_uploaded_audio(
        audio_path=audio_path,
        content_type=content_type,
    )

    try:
        with wave.open(audio_path, "rb") as audio_file:
            frame_count = audio_file.getnframes()
            frame_rate = audio_file.getframerate()

            if frame_rate <= 0:
                raise AudioValidationError(
                    "Unable to inspect the uploaded audio file."
                )

            duration = frame_count / float(frame_rate)

    except AudioValidationError:
        raise

    except (OSError, wave.Error) as error:
        raise AudioValidationError(
            "The uploaded file is not a valid audio file."
        ) from error

    if duration <= 0:
        raise AudioValidationError(
            "The uploaded file is not a valid audio file."
        )

    if duration > MAX_AUDIO_DURATION_SECONDS:
        raise AudioValidationError(
            "The recording is too long. Maximum duration is 30 minutes."
        )

    return AudioMetadata(
        duration=duration,
        size_bytes=metadata.size_bytes,
        content_type=metadata.content_type,
    )
