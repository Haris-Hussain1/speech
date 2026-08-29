import shutil
import subprocess
from pathlib import Path


class AudioNormalizationError(Exception):
    """Raised when audio normalization fails."""


class AudioNormalizer:
    def __init__(
        self,
        ffmpeg_path: str = "ffmpeg",
        sample_rate: int = 16000,
        channels: int = 1,
    ) -> None:
        self.ffmpeg_path = ffmpeg_path
        self.sample_rate = sample_rate
        self.channels = channels

    def normalize(
        self,
        input_path: str,
        output_path: str,
    ) -> str:
        if shutil.which(self.ffmpeg_path) is None:
            raise AudioNormalizationError(
                "FFmpeg is not installed or is not available on PATH."
            )

        output = Path(output_path)
        output.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        command = [
            self.ffmpeg_path,
            "-y",
            "-i",
            input_path,
            "-vn",
            "-ac",
            str(self.channels),
            "-ar",
            str(self.sample_rate),
            "-c:a",
            "pcm_s16le",
            str(output),
        ]

        try:
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                check=False,
            )
        except OSError as error:
            raise AudioNormalizationError(
                "Unable to execute FFmpeg."
            ) from error

        if result.returncode != 0:
            raise AudioNormalizationError(
                "FFmpeg could not normalize the audio."
            )

        if not output.is_file():
            raise AudioNormalizationError(
                "FFmpeg completed without producing the normalized audio."
            )

        return str(output)
