import logging
import re
from collections import Counter
from pathlib import Path


logger = logging.getLogger(__name__)

MODEL_ID = "anmol-unitmole/grammar-correction-flan-t5-base"
MODEL_DIRECTORY = "/models/grammar_correction"
MAX_INPUT_TOKENS = 384
MAX_NEW_TOKENS = 192

PROMPT_TEMPLATE = """Task:
Correct the grammar, spelling, punctuation, and wording of the text while preserving the original meaning.

Rules:
- Preserve the original meaning.
- Do not add unsupported information.
- Do not remove important details.
- Keep named entities, numbers, technical terms, and product names unchanged unless clearly incorrect.
- Return only the corrected text.

Input:
{source_text}

Corrected Text:"""

_SENTENCE_BOUNDARY = re.compile(r"(?<=[.!?])\s+")
_PROTECTED_TOKEN = re.compile(
    r"(?:https?://\S+|www\.\S+|\b\d{1,4}[/-]\d{1,2}[/-]\d{1,4}\b|"
    r"\b(?:19|20)\d{2}\b|\b\$?\d[\d,]*(?:\.\d+)?%?\b|"
    r"\b[A-Za-z0-9]+(?:[_./:-][A-Za-z0-9]+)+\b)"
)


class GrammarCorrectionService:
    """CPU English correction service loaded once for the translator process."""

    def __init__(self, model_directory: str = MODEL_DIRECTORY) -> None:
        import torch
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

        model_path = Path(model_directory)
        if not model_path.is_dir():
            raise RuntimeError("The grammar correction model volume is not populated.")

        self._tokenizer = AutoTokenizer.from_pretrained(
            str(model_path), local_files_only=True
        )
        self._model = AutoModelForSeq2SeqLM.from_pretrained(
            str(model_path), local_files_only=True
        )
        self._model.to("cpu")
        self._model.eval()
        self._torch = torch

    def correct_or_original(self, text: str) -> str:
        original = text.strip()
        if not original:
            return original

        try:
            corrected = self._correct_long_text(original)
            if not corrected or not self._preserves_protected_tokens(original, corrected):
                raise ValueError("Correction output failed safety validation.")
            return corrected
        except Exception:
            logger.exception("Grammar correction fallbacked to the source translation.")
            return original

    def _correct_long_text(self, text: str) -> str:
        paragraphs = text.split("\n\n")
        corrected_paragraphs = []
        for paragraph in paragraphs:
            chunks = self._split_into_chunks(paragraph.strip())
            corrected_chunks = [self._correct_chunk(chunk) for chunk in chunks]
            corrected_paragraphs.append(" ".join(corrected_chunks).strip())
        return "\n\n".join(part for part in corrected_paragraphs if part)

    def _split_into_chunks(self, paragraph: str) -> list[str]:
        if not paragraph:
            return []

        sentences = [part.strip() for part in _SENTENCE_BOUNDARY.split(paragraph) if part.strip()]
        chunks: list[str] = []
        current: list[str] = []

        for sentence in sentences:
            candidate = " ".join([*current, sentence]).strip()
            if current and not self._fits_prompt(candidate):
                chunks.extend(self._split_words(" ".join(current)))
                current = [sentence]
            else:
                current = [sentence] if not current else [*current, sentence]

        if current:
            chunks.extend(self._split_words(" ".join(current)))
        return chunks

    def _split_words(self, text: str) -> list[str]:
        words = text.split()
        chunks: list[str] = []
        current: list[str] = []
        for word in words:
            candidate = " ".join([*current, word]).strip()
            if current and not self._fits_prompt(candidate):
                chunks.append(" ".join(current))
                current = [word]
            else:
                current.append(word)
        if current:
            chunks.append(" ".join(current))
        return chunks

    def _fits_prompt(self, text: str) -> bool:
        encoded = self._tokenizer(
            PROMPT_TEMPLATE.format(source_text=text),
            truncation=False,
            add_special_tokens=True,
        )
        return len(encoded["input_ids"]) <= MAX_INPUT_TOKENS

    def _correct_chunk(self, text: str) -> str:
        if not self._fits_prompt(text):
            raise ValueError("Correction chunk exceeds the model input budget.")
        encoded = self._tokenizer(
            PROMPT_TEMPLATE.format(source_text=text),
            return_tensors="pt",
            truncation=True,
            max_length=MAX_INPUT_TOKENS,
        )
        with self._torch.inference_mode():
            generated = self._model.generate(
                **encoded,
                max_new_tokens=MAX_NEW_TOKENS,
                num_beams=4,
                early_stopping=True,
            )
        result = self._tokenizer.decode(generated[0], skip_special_tokens=True).strip()
        if not result or "Corrected Text:" in result:
            raise ValueError("Correction model returned invalid output.")
        return result

    @staticmethod
    def _preserves_protected_tokens(source: str, corrected: str) -> bool:
        source_tokens = Counter(_PROTECTED_TOKEN.findall(source))
        corrected_tokens = Counter(_PROTECTED_TOKEN.findall(corrected))
        return all(corrected_tokens[token] >= count for token, count in source_tokens.items())
