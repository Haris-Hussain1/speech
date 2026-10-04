import os
from pathlib import Path

from huggingface_hub import snapshot_download


MODELS = {
    "stt": (
        "OpenVoiceOS/ai4bharat-indicconformer-ur-onnx",
        (
            "config.json",
            "model.int8.onnx",
            "vocab.txt",
        ),
    ),
    "translation": (
        "hari31416/indictrans2-indic-en-dist-200M-ONNX-int8",
        (
            "config.json",
            "generation_config.json",
            "encoder_model.onnx",
            "encoder_model.onnx.data",
            "decoder_model.onnx",
            "decoder_with_past_model.onnx",
            "decoder_shared.onnx.data",
            "dict.SRC.json",
            "dict.TGT.json",
            "model.SRC",
            "model.TGT",
            "tokenization_indictrans.py",
            "tokenizer_config.json",
            "tokenizer_meta.json",
            "tokenizer_src.json",
            "tokenizer_tgt.json",
            "translate.py",
        ),
    ),
    "grammar_correction": (
        "anmol-unitmole/grammar-correction-flan-t5-base",
        (
            "config.json",
            "generation_config.json",
            "model.safetensors",
            "special_tokens_map.json",
            "spiece.model",
            "tokenizer.json",
            "tokenizer_config.json",
        ),
    ),
}


def main() -> None:
    root = Path(os.getenv("MODEL_ROOT", "/models"))

    for directory, (repository, patterns) in MODELS.items():
        destination = root / directory
        destination.mkdir(parents=True, exist_ok=True)

        snapshot_download(
            repo_id=repository,
            local_dir=destination,
            allow_patterns=list(patterns),
        )


if __name__ == "__main__":
    main()
