import logging
import os
import tempfile
from pathlib import Path

import httpx
from fastapi import APIRouter, File, HTTPException, UploadFile

from app.schemas.translation import TranslationResponse
from app.services.audio_normalization import (
    AudioNormalizationError,
    AudioNormalizer,
)
from app.services.audio_validation import (
    AudioValidationError,
    validate_audio_file,
    validate_uploaded_audio,
)


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/speech", tags=["translation"])
audio_normalizer = AudioNormalizer()


async def _send_to_translator(audio_path: str) -> TranslationResponse:
    service_url = os.getenv(
        "TRANSLATOR_SERVICE_URL",
        "http://translator:8001",
    ).rstrip("/")
    timeout = float(os.getenv("TRANSLATOR_TIMEOUT_SECONDS", "180"))

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            with open(audio_path, "rb") as audio_file:
                response = await client.post(
                    f"{service_url}/translate",
                    files={
                        "file": (
                            "normalized.wav",
                            audio_file,
                            "audio/wav",
                        )
                    },
                )
    except (httpx.HTTPError, OSError) as error:
        raise RuntimeError("The translator runtime is unavailable.") from error

    if response.status_code == 422:
        raise ValueError("The translator could not process this recording.")

    if response.status_code != 200:
        raise RuntimeError("The translator runtime returned an unexpected error.")

    try:
        result = response.json()
        return TranslationResponse.model_validate(result)
    except (ValueError, TypeError) as error:
        raise RuntimeError("The translator returned an invalid response.") from error


@router.post("/translate", response_model=TranslationResponse)
async def translate_speech(
    file: UploadFile | None = File(default=None),
) -> TranslationResponse:
    if file is None:
        raise HTTPException(status_code=400, detail="An audio file is required.")

    if not file.content_type:
        raise HTTPException(
            status_code=400,
            detail="Audio content type is missing.",
        )

    upload_path: str | None = None
    normalized_path: str | None = None

    try:
        suffix = Path(file.filename or "recording.webm").suffix or ".webm"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temporary:
            upload_path = temporary.name
            while chunk := await file.read(1024 * 1024):
                temporary.write(chunk)

        validate_uploaded_audio(upload_path, file.content_type)

        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temporary:
            normalized_path = temporary.name

        audio_normalizer.normalize(upload_path, normalized_path)

        validate_audio_file(normalized_path, "audio/wav")

        return await _send_to_translator(normalized_path)
    except AudioValidationError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except AudioNormalizationError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except RuntimeError as error:
        logger.warning("Translator request failed: %s", error)
        raise HTTPException(
            status_code=500,
            detail="The translator runtime is unavailable.",
        ) from error
    except Exception as error:
        logger.exception("Unexpected translator request failure")
        raise HTTPException(
            status_code=500,
            detail="Unable to translate the audio recording.",
        ) from error
    finally:
        for path in (upload_path, normalized_path):
            if path:
                try:
                    Path(path).unlink(missing_ok=True)
                except OSError:
                    logger.warning("Unable to remove translator temporary file.")
        await file.close()
