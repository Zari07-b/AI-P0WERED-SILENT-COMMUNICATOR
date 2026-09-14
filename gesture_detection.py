
import os

MODEL_PATH = "models/hand_landmarker.task"

print("Current folder:", os.getcwd())
print("Model exists:", os.path.exists(MODEL_PATH))
print("Model size:", os.path.getsize(MODEL_PATH) if os.path.exists(MODEL_PATH) else "NOT FOUND")
import cv2
import mediapipe as mp

# MediaPipe setup
BaseOptions = mp.tasks.BaseOptions
HandLandmarker = mp.tasks.vision.HandLandmarker
HandLandmarkerOptions = mp.tasks.vision.HandLandmarkerOptions
VisionRunningMode = mp.tasks.vision.RunningMode

MODEL_PATH = "models/hand_landmarker.task"

# Hand detector settings
options = HandLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=MODEL_PATH),
    running_mode=VisionRunningMode.VIDEO,
    num_hands=1,
    min_hand_detection_confidence=0.7,
    min_hand_presence_confidence=0.7,
    min_tracking_confidence=0.7
)

# Open webcam
cap = cv2.VideoCapture(1)
cap = cv2.VideoCapture(0)

if not cap.isOpened():
    print("Camera 0 not detected!")
    cap = cv2.VideoCapture(1)

if not cap.isOpened():
    print("Camera 1 not detected!")
    print("Please check your webcam permissions.")
    exit()
timestamp_ms = 0


def count_fingers(landmarks):

    fingers = []

    # Thumb
    if landmarks[4].x < landmarks[3].x:
        fingers.append(1)
    else:
        fingers.append(0)

    # Index Finger
    if landmarks[8].y < landmarks[6].y:
        fingers.append(1)
    else:
        fingers.append(0)

    # Middle Finger
    if landmarks[12].y < landmarks[10].y:
        fingers.append(1)
    else:
        fingers.append(0)

    # Ring Finger
    if landmarks[16].y < landmarks[14].y:
        fingers.append(1)
    else:
        fingers.append(0)

    # Pinky Finger
    if landmarks[20].y < landmarks[18].y:
        fingers.append(1)
    else:
        fingers.append(0)

    return fingers


def detect_gesture(fingers):

    # Closed fist
    if fingers == [0, 0, 0, 0, 0]:
        return "HELP"

    # Open palm
    elif fingers == [1, 1, 1, 1, 1]:
        return "STOP"

    # Thumbs Up
    elif fingers == [1, 0, 0, 0, 0]:
        return "YES"

    # One finger
    elif fingers == [0, 1, 0, 0, 0]:
        return "HELLO"

    # Two fingers
    elif fingers == [0, 1, 1, 0, 0]:
        return "NO"

    else:
        return ""


# Create hand detector
with HandLandmarker.create_from_options(options) as landmarker:

    while True:

        success, frame = cap.read()

        if not success:
            print("Camera not detected!")
            break

        # Flip camera
        frame = cv2.flip(frame, 1)

        # Convert BGR to RGB
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # Convert to MediaPipe Image
        mp_image = mp.Image(
            image_format=mp.ImageFormat.SRGB,
            data=rgb_frame
        )

        # Update timestamp
        timestamp_ms += 33

        # Detect hand
        result = landmarker.detect_for_video(
            mp_image,
            timestamp_ms
        )

        gesture = ""

        # If hand detected
        if result.hand_landmarks:

            for hand_landmarks in result.hand_landmarks:

                height, width, _ = frame.shape

                # Draw landmarks
                for landmark in hand_landmarks:

                    x = int(landmark.x * width)
                    y = int(landmark.y * height)

                    cv2.circle(
                        frame,
                        (x, y),
                        5,
                        (0, 255, 0),
                        -1
                    )

                # Count fingers
                fingers = count_fingers(hand_landmarks)

                # Detect gesture
                gesture = detect_gesture(fingers)

        # Display gesture text
        if gesture != "":
            cv2.putText(
                frame,
                gesture,
                (50, 70),
                cv2.FONT_HERSHEY_SIMPLEX,
                2,
                (0, 255, 0),
                3
            )

        # Show camera
        cv2.imshow(
            "AI Powered Silent Communicator",
            frame
        )

        # Press Q to exit
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break


# Close camera
cap.release()
cv2.destroyAllWindows()