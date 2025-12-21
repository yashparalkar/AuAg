import threading
import time
import assemblyai as aai
import os
from dotenv import load_dotenv

load_dotenv()

# aai.settings.api_key = os.getenv("ASSEMBLYAI_API_KEY")
aai.settings.api_key = os.environ.get("ASSEMBLYAI_API_KEY")


def transcribe(audio_file: str) -> str:
    config = aai.TranscriptionConfig(
        speech_models=["universal"]
    )
    transcript = aai.Transcriber(config=config).transcribe(audio_file)

    if transcript.status == "error":
        raise RuntimeError(transcript.error)

    return transcript.text
