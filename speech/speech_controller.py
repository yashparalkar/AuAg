# for macOS install portaudio using homebrew:
# brew install portaudio


import threading
from speech.microphone import MicrophoneRecorder
from speech.transcriber import transcribe

class SpeechController:
    def __init__(self):
        self.recorder = None
        self.record_thread = None
        self.is_recording = False

    def start_recording(self):
        if self.is_recording:
            return False  # already recording

        self.recorder = MicrophoneRecorder()
        self.record_thread = threading.Thread(target=self.recorder.start)
        self.record_thread.start()
        self.is_recording = True
        return True

    def stop_recording(self):
        if not self.is_recording:
            return None

        self.recorder.stop()
        self.record_thread.join()

        audio_path = self.recorder.save("mic.wav")
        text = transcribe(audio_path)

        self.is_recording = False
        self.recorder = None
        self.record_thread = None

        return text
