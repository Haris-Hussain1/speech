import logging
import os
import tempfile
import wave
from pathlib import Path
from time import perf_counter

from fastapi import APIRouter, File, HTTPException, Response, UploadFile

from app.schemas.speech import SpeechAnalysisResponse
from app.services.audio_normalization import (
    AudioNormalizationError,
    AudioNormalizer,
)
from app.services.audio_validation import (
    AudioValidationError,
    validate_uploaded_audio,
)
from app.services.speech_analysis import SpeechAnalysisService
from app.services.transcription import TranscriptionService


router = APIRouter(
    prefix="/speech",
    tags=["speech"],
)

logger = logging.getLogger(__name__)

transcription_service = TranscriptionService()
analysis_service = SpeechAnalysisService()
audio_normalizer = AudioNormalizer()


@router.post(
    "/analyze",
    response_model=SpeechAnalysisResponse,
)
async def analyze_speech(
    response: Response,
    file: UploadFile = File(...),
) -> SpeechAnalysisResponse:
    if not file.content_type:
        raise HTTPException(
            status_code=400,
            detail="Audio content type is missing.",
        )

    original_path: str | None = None
    normalized_path: str | None = None

    request_started_at = perf_counter()
    timings: dict[str, float] = {}

    try:
        stage_started_at = perf_counter()

        audio_data = await file.read()

        timings["file_read_upload"] = (
            perf_counter() - stage_started_at
        )

        if not audio_data:
            raise HTTPException(
                status_code=400,
                detail="The uploaded audio file is empty.",
            )

        file_suffix = _get_file_suffix(
            filename=file.filename,
            content_type=file.content_type,
        )

        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=file_suffix,
        ) as original_file:
            original_file.write(audio_data)
            original_path = original_file.name

        stage_started_at = perf_counter()

        validate_uploaded_audio(
            audio_path=original_path,
            content_type=file.content_type,
        )

        timings["audio_validation"] = (
            perf_counter() - stage_started_at
        )

        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=".wav",
        ) as normalized_file:
            normalized_path = normalized_file.name

        stage_started_at = perf_counter()

        audio_normalizer.normalize(
            input_path=original_path,
            output_path=normalized_path,
        )

        wav_metadata = _get_wav_metadata(
            normalized_path
        )

        recording_duration = wav_metadata.duration

        if recording_duration <= 0:
            raise AudioValidationError(
                "The uploaded audio has no valid duration."
            )

        if recording_duration > 30 * 60:
            raise AudioValidationError(
                "The recording is too long. Maximum duration is 30 minutes."
            )

        timings["ffmpeg_normalization"] = (
            perf_counter() - stage_started_at
        )

        stage_started_at = perf_counter()

        words, transcription_timing = (
            transcription_service.transcribe(
                normalized_path,
            )
        )

        timings["whisper_transcription"] = (
            perf_counter() - stage_started_at
        )

        stage_started_at = perf_counter()

        analysis = analysis_service.analyze(
            words=words,
            audio_duration=recording_duration,
        )

        timings["speech_analysis_metrics"] = (
            perf_counter() - stage_started_at
        )

        timings["total"] = (
            perf_counter() - request_started_at
        )

        logger.info(
            "speech_analyze_timing "
            "request=%s "
            "file_read_upload=%.4fs "
            "audio_validation=%.4fs "
            "ffmpeg_normalization=%.4fs "
            "whisper_transcription=%.4fs "
            "speech_analysis_metrics=%.4fs "
            "total=%.4fs",
            transcription_timing.request_number,
            timings["file_read_upload"],
            timings["audio_validation"],
            timings["ffmpeg_normalization"],
            timings["whisper_transcription"],
            timings["speech_analysis_metrics"],
            timings["total"],
        )

        response.headers["X-Speech-Timing"] = (
            "request_number="
            f"{transcription_timing.request_number}; "
            "model_load="
            f"{transcription_timing.model_load_seconds:.4f}; "
            "cpu_threads="
            f"{transcription_timing.cpu_threads}; "
            "file_read_upload="
            f"{timings['file_read_upload']:.4f}; "
            "audio_validation="
            f"{timings['audio_validation']:.4f}; "
            "ffmpeg_normalization="
            f"{timings['ffmpeg_normalization']:.4f}; "
            "whisper_transcription="
            f"{timings['whisper_transcription']:.4f}; "
            "whisper_setup="
            f"{transcription_timing.transcription_setup_seconds:.4f}; "
            "whisper_decode_iteration="
            f"{transcription_timing.decoding_iteration_seconds:.4f}; "
            "word_collection="
            f"{transcription_timing.word_collection_seconds:.4f}; "
            "transcribed_segments="
            f"{transcription_timing.segment_count}; "
            "transcribed_words="
            f"{transcription_timing.word_count}; "
            "normalized_duration="
            f"{wav_metadata.duration:.4f}; "
            "normalized_sample_rate="
            f"{wav_metadata.sample_rate}; "
            "normalized_channels="
            f"{wav_metadata.channels}; "
            "speech_analysis_metrics="
            f"{timings['speech_analysis_metrics']:.4f}; "
            "total="
            f"{timings['total']:.4f}"
        )

        return SpeechAnalysisResponse(
            transcript=analysis.transcript,
            recording_duration=analysis.recording_duration,
            speaking_duration=analysis.speaking_duration,
            pause_duration=analysis.pause_duration,
            total_words=analysis.total_words,
            words_per_minute=analysis.words_per_minute,
            average_word_duration=analysis.average_word_duration,
            words=[
                {
                    "text": word.text,
                    "start": word.start,
                    "end": word.end,
                    "duration": word.duration,
                }
                for word in analysis.words
            ],
            overall_words_per_minute=(
                analysis.overall_words_per_minute
            ),
            speaking_words_per_minute=(
                analysis.speaking_words_per_minute
            ),
            pause_count=analysis.pause_count,
            average_pause_duration=(
                analysis.average_pause_duration
            ),
            longest_pause_duration=(
                analysis.longest_pause_duration
            ),
            silence_percentage=analysis.silence_percentage,
            speech_percentage=analysis.speech_percentage,
            filler_word_count=analysis.filler_word_count,
            filler_word_rate=analysis.filler_word_rate,
            pace=analysis.pace,
            fluency_score=analysis.fluency_score,
            pauses=[
                {
                    "start": pause.start,
                    "end": pause.end,
                    "duration": pause.duration,
                }
                for pause in analysis.pauses
            ],
        )

    except AudioValidationError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        ) from error

    except AudioNormalizationError as error:
        raise HTTPException(
            status_code=422,
            detail=str(error),
        ) from error

    except HTTPException:
        raise

    except Exception as error:
        logger.exception(
            "Speech analysis error: %s",
            error,
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to analyze the audio recording.",
        ) from error

    finally:
        _cleanup_file(original_path)
        _cleanup_file(normalized_path)


def _get_file_suffix(
    filename: str | None,
    content_type: str,
) -> str:
    if filename:
        suffix = Path(filename).suffix.lower()

        if suffix:
            return suffix

    content_type_suffixes = {
        "audio/webm": ".webm",
        "audio/ogg": ".ogg",
        "audio/wav": ".wav",
        "audio/wave": ".wav",
        "audio/x-wav": ".wav",
        "audio/mpeg": ".mp3",
        "audio/mp4": ".mp4",
        "audio/x-m4a": ".m4a",
    }

    normalized_content_type = (
        content_type.split(";")[0].strip().lower()
    )

    return content_type_suffixes.get(
        normalized_content_type,
        ".webm",
    )


class WavMetadata:
    def __init__(
        self,
        *,
        duration: float,
        sample_rate: int,
        channels: int,
    ) -> None:
        self.duration = duration
        self.sample_rate = sample_rate
        self.channels = channels


def _get_wav_metadata(
    audio_path: str,
) -> WavMetadata:
    try:
        with wave.open(audio_path, "rb") as wav_file:
            frame_count = wav_file.getnframes()
            frame_rate = wav_file.getframerate()
            channels = wav_file.getnchannels()

            if frame_rate <= 0:
                raise AudioValidationError(
                    "Unable to determine the audio sample rate."
                )

            return WavMetadata(
                duration=frame_count / float(frame_rate),
                sample_rate=frame_rate,
                channels=channels,
            )

    except AudioValidationError:
        raise

    except (wave.Error, OSError) as error:
        raise AudioValidationError(
            "Unable to read the normalized audio file."
        ) from error


def _cleanup_file(
    path: str | None,
) -> None:
    if path is None:
        return

    try:
        os.remove(path)
    except OSError:
        pass