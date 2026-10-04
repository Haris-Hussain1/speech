from pathlib import Path


STT_MODEL_DIRECTORY = "/models/stt"
STT_MODEL_TYPE = "nemo-conformer-ctc"
STT_QUANTIZATION = "int8"


class UrduSttService:
    def __init__(self, model_directory: str = STT_MODEL_DIRECTORY) -> None:
        import onnx_asr

        model_path = Path(model_directory)

        required_files = (
            model_path / "model.int8.onnx",
            model_path / "config.json",
            model_path / "vocab.txt",
        )

        if not all(path.is_file() for path in required_files):
            raise RuntimeError(
                "The Urdu ONNX model volume is not populated."
            )

        self._model = onnx_asr.load_model(
            STT_MODEL_TYPE,
            path=model_directory,
            quantization=STT_QUANTIZATION,
        )

    def transcribe(self, audio_path: str) -> str:
        result = self._model.recognize(audio_path)

        if isinstance(result, str):
            transcript = result.strip()
        else:
            transcript = " ".join(
                str(item).strip()
                for item in result
            ).strip()

        if not transcript:
            raise ValueError("No Urdu speech was recognized.")

        return transcript