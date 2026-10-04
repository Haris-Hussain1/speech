import json
from pathlib import Path

import numpy as np


SOURCE_LANGUAGE = "urd_Arab"
TARGET_LANGUAGE = "eng_Latn"
TRANSLATION_MODEL_DIRECTORY = "/models/translation"


def _past_feed(past_outputs: list[np.ndarray], num_layers: int):
    feed = {}
    for index in range(num_layers):
        base = index * 4
        feed[f"past_key_values.{index}.decoder.key"] = past_outputs[base]
        feed[f"past_key_values.{index}.decoder.value"] = past_outputs[base + 1]
        feed[f"past_key_values.{index}.encoder.key"] = past_outputs[base + 2]
        feed[f"past_key_values.{index}.encoder.value"] = past_outputs[base + 3]
    return feed


class UrduEnglishTranslationService:
    def __init__(self, model_directory: str = TRANSLATION_MODEL_DIRECTORY) -> None:
        import onnxruntime as ort
        from IndicTransToolkit import IndicProcessor
        from tokenizers import Tokenizer

        model_path = Path(model_directory)
        required_files = (
            model_path / "encoder_model.onnx",
            model_path / "decoder_model.onnx",
            model_path / "decoder_with_past_model.onnx",
            model_path / "tokenizer_src.json",
            model_path / "tokenizer_tgt.json",
            model_path / "tokenizer_meta.json",
        )
        if not all(path.is_file() for path in required_files):
            raise RuntimeError(
                "The IndicTrans2 ONNX model volume is not populated."
            )

        session_options = ort.SessionOptions()
        session_options.intra_op_num_threads = 2
        session_options.inter_op_num_threads = 1
        session_options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        providers = ["CPUExecutionProvider"]

        self._processor = IndicProcessor(inference=True)
        self._source_tokenizer = Tokenizer.from_file(
            str(model_path / "tokenizer_src.json")
        )
        self._target_tokenizer = Tokenizer.from_file(
            str(model_path / "tokenizer_tgt.json")
        )
        self._metadata = json.loads(
            (model_path / "tokenizer_meta.json").read_text(encoding="utf-8")
        )
        generation_config_path = model_path / "generation_config.json"
        generation_config = (
            json.loads(generation_config_path.read_text(encoding="utf-8"))
            if generation_config_path.is_file()
            else {}
        )
        self._decoder_start_id = int(
            generation_config.get("decoder_start_token_id", 2)
        )
        self._eos_id = int(generation_config.get("eos_token_id", 2))
        self._encoder = ort.InferenceSession(
            str(model_path / "encoder_model.onnx"),
            sess_options=session_options,
            providers=providers,
        )
        self._decoder = ort.InferenceSession(
            str(model_path / "decoder_model.onnx"),
            sess_options=session_options,
            providers=providers,
        )
        self._decoder_with_past = ort.InferenceSession(
            str(model_path / "decoder_with_past_model.onnx"),
            sess_options=session_options,
            providers=providers,
        )
        self._layer_count = (len(self._decoder.get_outputs()) - 1) // 4

    def translate(self, text: str, max_new_tokens: int = 128) -> str:
        if not text.strip():
            raise ValueError("No Urdu transcript was provided.")

        if hasattr(self._processor, "_placeholder_entity_maps"):
            self._processor._placeholder_entity_maps.queue.clear()

        source_text = self._processor.preprocess_batch(
            [text],
            src_lang=SOURCE_LANGUAGE,
            tgt_lang=TARGET_LANGUAGE,
        )[0]
        encoded = self._source_tokenizer.encode(source_text)
        input_ids = np.array(
            [[
                token_id
                if token_id < self._metadata["src_dict_size"]
                else self._metadata["unk_id"]
                for token_id in encoded.ids
            ]],
            dtype=np.int64,
        )
        attention_mask = np.array([encoded.attention_mask], dtype=np.int64)
        encoder_output = self._encoder.run(
            ["last_hidden_state"],
            {
                "input_ids": input_ids,
                "attention_mask": attention_mask,
            },
        )[0]

        decoder_input_ids = np.array([[self._decoder_start_id]], dtype=np.int64)
        output_ids = [self._decoder_start_id]
        past_outputs = None

        for step in range(max_new_tokens):
            if step == 0:
                decoder_outputs = self._decoder.run(
                    None,
                    {
                        "input_ids": decoder_input_ids,
                        "encoder_hidden_states": encoder_output,
                        "encoder_attention_mask": attention_mask,
                    },
                )
            else:
                decoder_outputs = self._decoder_with_past.run(
                    None,
                    {
                        "input_ids": decoder_input_ids,
                        "encoder_attention_mask": attention_mask,
                        **_past_feed(past_outputs, self._layer_count),
                    },
                )

            logits = decoder_outputs[0]
            past_outputs = list(decoder_outputs[1:])
            next_id = int(np.argmax(logits[0, -1, :]))
            output_ids.append(next_id)
            if next_id == self._eos_id:
                break
            decoder_input_ids = np.array([[next_id]], dtype=np.int64)

        safe_ids = [
            token_id
            if token_id < self._metadata["tgt_dict_size"]
            else self._metadata["unk_id"]
            for token_id in output_ids
        ]
        decoded = self._target_tokenizer.decode(
            safe_ids,
            skip_special_tokens=True,
        )
        result = self._processor.postprocess_batch(
            [decoded],
            lang=TARGET_LANGUAGE,
        )[0].strip()

        if not result:
            raise ValueError("The translation result was empty.")

        return result
