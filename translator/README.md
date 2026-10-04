# Speak1 Translator Runtime

This container is a private CPU-only runtime for Urdu speech translation. It
does not expose a host port and is intended to be called by the main backend
over the Docker Compose network.

## Models

The runtime uses these Hugging Face repositories:

- `OpenVoiceOS/ai4bharat-indicconformer-ur-onnx`
- `hari31416/indictrans2-indic-en-dist-200M-ONNX-int8`

Model weights are stored in the named `translator-model-cache` Docker volume,
not in this repository or the image. The downloader selects only the files
required by the runtime and is run explicitly.

## Initial Model Setup

Build the image, populate the persistent volume, then start the services:

```bash
docker compose build translator
docker compose run --rm translator python scripts/download_models.py
docker compose up
```

The download command requires network access to Hugging Face. It does not run
automatically during normal container startup.

The runtime expects these volume paths:

```text
/models/stt/
  config.json
  model.int8.onnx
  vocab.txt

/models/translation/
  config.json
  generation_config.json
  encoder_model.onnx
  decoder_model.onnx
  decoder_with_past_model.onnx
  tokenizer_src.json
  tokenizer_tgt.json
  tokenizer_meta.json
```

The STT model receives normalized 16 kHz mono WAV audio. Translation uses
`urd_Arab` as the source language and `eng_Latn` as the target language.

Inference is CPU-only, sequential, and protected by one application-level
lock. The runtime loads both models once during startup and returns an error if
the persistent model volume has not been populated.
