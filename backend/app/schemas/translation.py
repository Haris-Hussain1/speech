from pydantic import BaseModel


class TranslationResponse(BaseModel):
    urdu_transcript: str
    english_translation: str
