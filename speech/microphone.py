# for macOS, install portaudio using homebrew:
# brew install portaudio

import pyaudio
import wave
from typing import List


class MicrophoneRecorder:
    def __init__(
        self,
        sample_rate: int = 16000,
        channels: int = 1,
        chunk_size: int = 1024,
    ):
        self.sample_rate = sample_rate
        self.channels = channels
        self.chunk_size = chunk_size

        self._audio = None
        self._stream = None
        self._frames: List[bytes] = []
        self._recording = False

    def start(self) -> None:
        if self._recording:
            raise RuntimeError("Recording already in progress")

        self._audio = pyaudio.PyAudio()
        self._frames.clear()

        self._stream = self._audio.open(
            format=pyaudio.paInt16,
            channels=self.channels,
            rate=self.sample_rate,
            input=True,
            frames_per_buffer=self.chunk_size,
        )

        self._recording = True
        print("Recording started")

        while self._recording:
            data = self._stream.read(
                self.chunk_size, exception_on_overflow=False
            )
            self._frames.append(data)

    def stop(self) -> None:
        if not self._recording:
            return

        self._recording = False
        print("Recording stopped")

    def save(self, output_file: str) -> str:
        if not self._frames:
            raise RuntimeError("No audio recorded")

        self._stream.stop_stream()
        self._stream.close()
        self._audio.terminate()

        with wave.open(output_file, "wb") as wf:
            wf.setnchannels(self.channels)
            wf.setsampwidth(self._audio.get_sample_size(pyaudio.paInt16))
            wf.setframerate(self.sample_rate)
            wf.writeframes(b"".join(self._frames))

        return output_file
