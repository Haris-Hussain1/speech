import asyncio
import logging
import os
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from starlette.concurrency import run_in_threadpool

from app.services.stt import UrduSttService
from app.services.translation import UrduEnglishTranslationService
from app.services.grammar_correction import GrammarCorrectionService


logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        app.state.stt = UrduSttService(
            os.getenv("STT_MODEL_DIRECTORY", "/models/stt")
        )
        app.state.translation = UrduEnglishTranslationService(
            os.getenv("TRANSLATION_MODEL_DIRECTORY", "/models/translation")
        )
        try:
            app.state.grammar_correction = GrammarCorrectionService(
                os.getenv("GRAMMAR_MODEL_DIRECTORY", "/models/grammar_correction")
            )
        except Exception:
            logger.exception(
                "Grammar correction unavailable; the original translation will be returned."
            )
            app.state.grammar_correction = None
    except Exception:
        logger.exception("Translator model initialization failed")
        raise

    app.state.inference_lock = asyncio.Lock()
    yield


app = FastAPI(
    title="Speak1 Translator Runtime",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health(request: Request) -> dict[str, str]:
    if not hasattr(request.app.state, "inference_lock"):
        raise HTTPException(status_code=503, detail="Translator is unavailable.")
    return {"status": "ok"}


@app.post("/translate")
async def translate(
    request: Request,
    file: UploadFile | None = File(default=None),
) -> dict[str, str]:
    if file is None:
        raise HTTPException(status_code=400, detail="An audio file is required.")

    temporary_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temporary:
            temporary_path = temporary.name
            while chunk := await file.read(1024 * 1024):
                temporary.write(chunk)

        async with request.app.state.inference_lock:
            urdu_transcript = await run_in_threadpool(
                request.app.state.stt.transcribe,
                temporary_path,
            )
            english_translation = await run_in_threadpool(
                request.app.state.translation.translate,
                urdu_transcript,
            )
            if request.app.state.grammar_correction is not None:
                english_translation = await run_in_threadpool(
                    request.app.state.grammar_correction.correct_or_original,
                    english_translation,
                )

        return {
            "urdu_transcript": urdu_transcript,
            "english_translation": english_translation,
        }
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:
        logger.exception("Translator inference failed")
        raise HTTPException(
            status_code=500,
            detail="Translator inference failed.",
        ) from error
    finally:
        if temporary_path:
            try:
                Path(temporary_path).unlink(missing_ok=True)
            except OSError:
                logger.warning("Unable to remove translator input file.")
        await file.close()
