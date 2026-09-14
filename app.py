from flask import (
    Flask,
    render_template,
    request,
    jsonify,
    Response,
    redirect,
    url_for,
    session,
    flash
)

from textblob import TextBlob
from werkzeug.security import generate_password_hash, check_password_hash

import speech_recognition as sr
import tempfile
import os
import subprocess
import cv2
import mediapipe as mp
import math


app = Flask(__name__)

# =========================================================
# AUTHENTICATION SETTINGS
# =========================================================

# For deployment, set SECRET_KEY as an environment variable.
app.secret_key = os.environ.get(
    "SECRET_KEY",
    "change-this-secret-key-for-deployment"
)

# Demo admin credentials.
# You can change these values.
ADMIN_USERNAME = os.environ.get(
    "ADMIN_USERNAME",
    "admin"
)

ADMIN_PASSWORD = os.environ.get(
    "ADMIN_PASSWORD",
    "admin123"
)

# Password is stored as a hash, not as plain text.
ADMIN_PASSWORD_HASH = generate_password_hash(
    ADMIN_PASSWORD
)


# =========================================================
# LOGIN REQUIRED DECORATOR
# =========================================================

def login_required(function):

    def wrapper(*args, **kwargs):

        if not session.get("logged_in"):

            flash("Please login as administrator first.")

            return redirect(
                url_for("admin_login")
            )

        return function(*args, **kwargs)

    wrapper.__name__ = function.__name__

    return wrapper


# =========================================================
# AI STEP 1 - CLEAN TEXT
# =========================================================

def clean_text(text):

    text = (text or "").strip()

    if not text:
        return ""

    try:

        return str(
            TextBlob(text).correct()
        )

    except Exception:

        return text


# =========================================================
# AI STEP 2 - EMERGENCY DETECTION
# =========================================================

def detect_emergency(text):

    emergency_words = [
        "fire",
        "help",
        "emergency",
        "accident",
        "danger",
        "alert"
    ]

    for word in emergency_words:

        if word in text.lower():

            return (
                "🚨 EMERGENCY ALERT 🚨 "
                + text.upper()
            )

    return text


# =========================================================
# VOICE TO TEXT
# =========================================================

def voice_to_text(audio_path):

    recognizer = sr.Recognizer()

    try:

        with sr.AudioFile(audio_path) as source:

            audio = recognizer.record(source)

        return recognizer.recognize_google(
            audio
        )

    except sr.UnknownValueError:

        return ""

    except sr.RequestError as error:

        print(
            "Speech recognition service error:",
            error
        )

        return ""

    except Exception as error:

        print(
            "Voice processing error:",
            error
        )

        return ""


# =========================================================
# PUBLIC HOME PAGE
# =========================================================

@app.route("/", methods=["GET"])
def home():

    return render_template(
        "index.html",
        msg=""
    )


# =========================================================
# ADMIN LOGIN
# =========================================================

@app.route(
    "/admin/login",
    methods=["GET", "POST"]
)
def admin_login():

    # If already logged in
    if session.get("logged_in"):

        return redirect(
            url_for("admin_dashboard")
        )

    if request.method == "POST":

        username = request.form.get(
            "username",
            ""
        ).strip()

        password = request.form.get(
            "password",
            ""
        )

        # Check username and password
        if (
            username == ADMIN_USERNAME
            and
            check_password_hash(
                ADMIN_PASSWORD_HASH,
                password
            )
        ):

            session["logged_in"] = True

            session["username"] = username

            flash(
                "Login successful!"
            )

            return redirect(
                url_for("admin_dashboard")
            )

        flash(
            "Invalid username or password."
        )

    return render_template(
        "login.html"
    )


# =========================================================
# ADMIN DASHBOARD
# =========================================================

@app.route("/admin")
@login_required
def admin_dashboard():

    return render_template(
        "index.html",
        msg=""
    )


# =========================================================
# LOGOUT
# =========================================================

@app.route("/admin/logout")
def admin_logout():

    session.clear()

    flash(
        "You have been logged out."
    )

    return redirect(
        url_for("admin_login")
    )


# =========================================================
# SEND ANNOUNCEMENT
# =========================================================

@app.route(
    "/announcement",
    methods=["POST"]
)
@login_required
def announcement():

    user_input = request.form.get(
        "announcement",
        ""
    ).strip()

    if not user_input:

        flash(
            "Please enter an announcement."
        )

        return redirect(
            url_for("admin_dashboard")
        )

    cleaned = clean_text(
        user_input
    )

    message = detect_emergency(
        cleaned
    )

    return render_template(
        "index.html",
        msg=message
    )


# =========================================================
# VOICE API
# =========================================================

@app.route(
    "/voice",
    methods=["POST"]
)
@login_required
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

    webm_path = None
    wav_path = None

    try:

        # Save browser audio
        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=".webm"
        ) as temp:

            audio_file.save(
                temp.name
            )

            webm_path = temp.name

        wav_path = (
            webm_path + ".wav"
        )

        # Convert WebM to WAV
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

        # Speech recognition
        text = voice_to_text(
            wav_path
        )

        if not text:

            return jsonify({
                "success": False,
                "error":
                    "Could not understand the speech."
            })

        return jsonify({
            "success": True,
            "text": text
        })

    except FileNotFoundError:

        return jsonify({
            "success": False,
            "error":
                "FFmpeg is not installed or is not available in PATH."
        }), 500

    except subprocess.CalledProcessError:

        return jsonify({
            "success": False,
            "error":
                "Could not convert the recorded audio."
        }), 500

    except Exception as error:

        print(
            "Voice API error:",
            error
        )

        return jsonify({
            "success": False,
            "error":
                "Voice processing failed."
        }), 500

    finally:

        # Delete temporary files
        for path in (
            webm_path,
            wav_path
        ):

            if (
                path
                and
                os.path.exists(path)
            ):

                try:

                    os.remove(path)

                except OSError:

                    pass


# =========================================================
# GESTURE DETECTION
# =========================================================

MODEL_PATH = (
    "models/hand_landmarker.task"
)


BaseOptions = mp.tasks.BaseOptions

HandLandmarker = (
    mp.tasks.vision.HandLandmarker
)

HandLandmarkerOptions = (
    mp.tasks.vision.HandLandmarkerOptions
)

RunningMode = (
    mp.tasks.vision.RunningMode
)


gesture_options = (
    HandLandmarkerOptions(

        base_options=BaseOptions(
            model_asset_path=MODEL_PATH
        ),

        running_mode=RunningMode.VIDEO,

        num_hands=1,

        min_hand_detection_confidence=0.7,

        min_hand_presence_confidence=0.7,

        min_tracking_confidence=0.7
    )
)


# =========================================================
# CAMERA
# =========================================================

camera = cv2.VideoCapture(0)

if not camera.isOpened():

    print(
        "WARNING: Camera could not be opened."
    )


latest_gesture = (
    "No gesture detected"
)

timestamp_ms = 0


# =========================================================
# DISTANCE
# =========================================================

def distance(a, b):

    return math.sqrt(
        (a.x - b.x) ** 2
        +
        (a.y - b.y) ** 2
    )


# =========================================================
# COUNT FINGERS
# =========================================================

def count_fingers(hand):

    fingers = []

    # Index
    fingers.append(
        1 if hand[8].y < hand[6].y
        else 0
    )

    # Middle
    fingers.append(
        1 if hand[12].y < hand[10].y
        else 0
    )

    # Ring
    fingers.append(
        1 if hand[16].y < hand[14].y
        else 0
    )

    # Pinky
    fingers.append(
        1 if hand[20].y < hand[18].y
        else 0
    )

    return fingers


# =========================================================
# GESTURE DETECTION
# =========================================================

def detect_gesture(hand):

    fingers = count_fingers(
        hand
    )

    index = fingers[0]
    middle = fingers[1]
    ring = fingers[2]
    pinky = fingers[3]

    thumb_tip = hand[4]
    thumb_ip = hand[3]

    index_tip = hand[8]
    middle_tip = hand[12]

    # 1 - HELP
    if fingers == [
        0, 0, 0, 0
    ]:

        return "HELP"


    # 2 - STOP
    if fingers == [
        1, 1, 1, 1
    ]:

        return "STOP"


    # 3 - YES
    if (
        thumb_tip.y < thumb_ip.y
        and
        fingers == [
            0, 0, 0, 0
        ]
    ):

        return "YES"


    # 4 - NO
    if fingers == [
        1, 1, 0, 0
    ]:

        return "NO"


    # 5 - HELLO
    if fingers == [
        1, 0, 0, 0
    ]:

        return "HELLO"


    # 6 - THANK YOU
    if fingers == [
        1, 1, 1, 0
    ]:

        return "THANK YOU"


    # 7 - OK
    if (
        distance(
            thumb_tip,
            index_tip
        ) < 0.08
        and
        middle == 1
        and
        ring == 1
        and
        pinky == 1
    ):

        return "OK"


    # 8 - PLEASE
    if (
        distance(
            thumb_tip,
            index_tip
        ) < 0.05
    ):

        return "PLEASE"


    # 9 - PEACE
    if (
        index == 1
        and
        middle == 1
        and
        ring == 0
        and
        pinky == 0
    ):

        return "PEACE"


    # 10 - THREE
    if (
        index == 1
        and
        middle == 1
        and
        ring == 1
        and
        pinky == 0
    ):

        return "THREE"


    # 11 - FOUR
    if (
        index == 1
        and
        middle == 1
        and
        ring == 1
        and
        pinky == 1
    ):

        return "FOUR"


    # 12 - CALL ME
    if (
        index == 0
        and
        middle == 0
        and
        ring == 0
        and
        pinky == 1
        and
        thumb_tip.y < thumb_ip.y
    ):

        return "CALL ME"


    # 13 - I LOVE YOU
    if (
        index == 1
        and
        middle == 0
        and
        ring == 0
        and
        pinky == 1
        and
        thumb_tip.y < thumb_ip.y
    ):

        return "I LOVE YOU"


    # 14 - WATER
    if (
        index == 1
        and
        middle == 1
        and
        ring == 0
        and
        pinky == 1
    ):

        return "WATER"


    # 15 - DANGER
    if (
        index == 1
        and
        middle == 0
        and
        ring == 0
        and
        pinky == 1
    ):

        return "DANGER"


    # 16 - NEED DOCTOR
    if (
        distance(
            index_tip,
            middle_tip
        ) < 0.05
        and
        ring == 0
        and
        pinky == 0
    ):

        return "NEED DOCTOR"


    # 17 - COME HERE
    if (
        index == 1
        and
        middle == 0
        and
        ring == 0
        and
        pinky == 0
        and
        distance(
            thumb_tip,
            index_tip
        ) > 0.15
    ):

        return "COME HERE"


    # 18 - ATTENTION
    if (
        index == 1
        and
        middle == 0
        and
        ring == 0
        and
        pinky == 0
    ):

        return "ATTENTION"


    # 19 - WAIT
    if (
        index == 0
        and
        middle == 1
        and
        ring == 0
        and
        pinky == 0
    ):

        return "WAIT"


    # 20 - NEED HELP
    if (
        index == 0
        and
        middle == 1
        and
        ring == 1
        and
        pinky == 0
    ):

        return "NEED HELP"


    return ""


# =========================================================
# VIDEO STREAM
# =========================================================

def generate_frames():

    global timestamp_ms
    global latest_gesture

    with HandLandmarker.create_from_options(
        gesture_options
    ) as landmarker:

        while True:

            success, frame = (
                camera.read()
            )

            if not success:

                break

            # Mirror camera
            frame = cv2.flip(
                frame,
                1
            )

            # BGR → RGB
            rgb = cv2.cvtColor(
                frame,
                cv2.COLOR_BGR2RGB
            )

            # MediaPipe image
            mp_image = mp.Image(
                image_format=
                    mp.ImageFormat.SRGB,
                data=rgb
            )

            timestamp_ms += 33

            result = (
                landmarker.detect_for_video(
                    mp_image,
                    timestamp_ms
                )
            )

            gesture = ""

            if result.hand_landmarks:

                hand = (
                    result.hand_landmarks[0]
                )

                gesture = detect_gesture(
                    hand
                )

                height, width, _ = (
                    frame.shape
                )

                # Draw landmarks
                for landmark in hand:

                    x = int(
                        landmark.x * width
                    )

                    y = int(
                        landmark.y * height
                    )

                    cv2.circle(
                        frame,
                        (x, y),
                        5,
                        (0, 255, 0),
                        -1
                    )


            if gesture:

                latest_gesture = gesture

                cv2.putText(
                    frame,
                    gesture,
                    (30, 60),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    1.5,
                    (0, 255, 0),
                    3
                )

            else:

                latest_gesture = (
                    "No gesture detected"
                )


            # Convert frame to JPEG
            ret, buffer = (
                cv2.imencode(
                    ".jpg",
                    frame
                )
            )

            if not ret:

                continue

            frame_bytes = (
                buffer.tobytes()
            )

            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n"
                +
                frame_bytes
                +
                b"\r\n"
            )


# =========================================================
# CAMERA ROUTE
# =========================================================

@app.route("/video_feed")
@login_required
def video_feed():

    return Response(
        generate_frames(),
        mimetype=
        "multipart/x-mixed-replace; boundary=frame"
    )


# =========================================================
# GESTURE API
# =========================================================

@app.route("/gesture")
@login_required
def gesture():

    return jsonify({
        "gesture":
            latest_gesture
    })


# =========================================================
# RUN
# =========================================================

if __name__ == "__main__":

    app.run(
        host="0.0.0.0",
        port=10000,
        debug=True,
        threaded=True
    )