from flask import Flask, render_template, request, jsonify
from textblob import TextBlob
import speech_recognition as sr
import tempfile
import os
import subprocess

app = Flask(__name__)


# -----------------------------
# AI Step 1 – Clean Text
# -----------------------------
def clean_text(text):
    text = (text or "").strip()
    if not text:
        return ""
    try:
        return str(TextBlob(text).correct())
    except Exception:
        return text


# -----------------------------
# AI Step 2 – Emergency Detection
# -----------------------------
def detect_emergency(text):
    emergency_words = [
        "fire", "help", "emergency", "accident",
        "danger", "alert"
    ]

    for word in emergency_words:
        if word in text.lower():
            return "🚨 EMERGENCY ALERT 🚨 " + text.upper()

    return text


# -----------------------------
# Voice to Text
# Browser sends recorded audio here.
# -----------------------------
def voice_to_text(audio_path):
    recognizer = sr.Recognizer()

    try:
        with sr.AudioFile(audio_path) as source:
            audio = recognizer.record(source)

        # Uses Google's speech recognition service.
        return recognizer.recognize_google(audio)

    except sr.UnknownValueError:
        return ""

    except sr.RequestError as error:
        print("Speech recognition service error:", error)
        return ""

    except Exception as error:
        print("Voice processing error:", error)
        return ""


# -----------------------------
# Home page
# -----------------------------
@app.route("/", methods=["GET", "POST"])
def home():
    message = ""

    if request.method == "POST":
        user_input = request.form.get("announcement", "").strip()

        cleaned = clean_text(user_input)
        message = detect_emergency(cleaned)

    return render_template("index.html", msg=message)


# -----------------------------
# Voice API
# -----------------------------
@app.route("/voice", methods=["POST"])
def voice():
    if "audio" not in request.files:
        return jsonify({
            "success": False,
            "error": "No audio file received."
        }), 400

    audio_file = request.files["audio"]

    if audio_file.filename == "":
        return jsonify({
            "success": False,
            "error": "Empty audio file."
        }), 400

    # MediaRecorder normally sends WebM/Opus.
    # SpeechRecognition needs WAV/AIFF/FLAC, so convert using ffmpeg.
    webm_path = None
    wav_path = None

    try:
        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=".webm"
        ) as temp:
            audio_file.save(temp.name)
            webm_path = temp.name

        wav_path = webm_path + ".wav"

        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                webm_path,
                "-ar",
                "16000",
                "-ac",
                "1",
                wav_path
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )

        text = voice_to_text(wav_path)

        if not text:
            return jsonify({
                "success": False,
                "error": "Could not understand the speech."
            })

        return jsonify({
            "success": True,
            "text": text
        })

    except FileNotFoundError:
        return jsonify({
            "success": False,
            "error": "FFmpeg is not installed or is not available in PATH."
        }), 500

    except subprocess.CalledProcessError:
        return jsonify({
            "success": False,
            "error": "Could not convert the recorded audio."
        }), 500

    except Exception as error:
        print("Voice API error:", error)
        return jsonify({
            "success": False,
            "error": "Voice processing failed."
        }), 500

    finally:
        for path in (webm_path, wav_path):
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                except OSError:
                    pass


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=10000,
        debug=True
    )
