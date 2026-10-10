
 console.log("JavaScript Loaded");

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;


// =====================================================
// SPEECH TO TEXT
// =====================================================

async function startVoice() {

    const voiceButton =
        document.querySelector(".voice-btn");

    const voiceStatus =
        document.getElementById("voiceStatus");


    if (isRecording && mediaRecorder) {

        mediaRecorder.stop();

        return;
    }


    try {

        const stream =
            await navigator.mediaDevices.getUserMedia({
                audio: true
            });


        audioChunks = [];


        mediaRecorder =
            new MediaRecorder(stream);


        mediaRecorder.ondataavailable =
            function (event) {

                if (event.data.size > 0) {

                    audioChunks.push(event.data);
                }
            };


        mediaRecorder.onstart =
            function () {

                isRecording = true;

                voiceButton.innerText =
                    "⏹ Stop";

                voiceStatus.innerText =
                    "🎤 Recording... Speak now.";
            };


        mediaRecorder.onstop =
            async function () {

                isRecording = false;

                voiceButton.innerText =
                    "🎤 Speak";

                voiceStatus.innerText =
                    "⏳ Converting speech to text...";


                stream
                    .getTracks()
                    .forEach(
                        track => track.stop()
                    );


                const audioBlob =
                    new Blob(
                        audioChunks,
                        {
                            type: "audio/webm"
                        }
                    );


                const formData =
                    new FormData();


                formData.append(
                    "audio",
                    audioBlob,
                    "voice.webm"
                );


                try {

                    const response =
                        await fetch(
                            "/voice",
                            {
                                method: "POST",
                                body: formData
                            }
                        );


                    const result =
                        await response.json();


                    if (result.success) {

                        document
                            .getElementById(
                                "announcement"
                            )
                            .value = result.text;


                        voiceStatus.innerText =
                            "✅ Voice converted to text successfully.";

                    } else {

                        voiceStatus.innerText =
                            "❌ " + result.error;
                    }


                } catch (error) {

                    console.error(error);

                    voiceStatus.innerText =
                        "❌ Could not connect to the voice service.";
                }
            };


        mediaRecorder.onerror =
            function (event) {

                console.error(
                    "Recorder error:",
                    event
                );

                voiceStatus.innerText =
                    "❌ Microphone recording failed.";

                stream
                    .getTracks()
                    .forEach(
                        track => track.stop()
                    );
            };


        mediaRecorder.start();


    } catch (error) {

        console.error(
            "Microphone error:",
            error
        );


        if (
            error.name ===
            "NotAllowedError"
        ) {

            voiceStatus.innerText =
                "❌ Microphone permission was denied.";

        } else if (
            error.name ===
            "NotFoundError"
        ) {

            voiceStatus.innerText =
                "❌ No microphone was found.";

        } else {

            voiceStatus.innerText =
                "❌ Microphone error: "
                + error.message;
        }
    }
}


// =====================================================
// BROWSER-BASED HAND GESTURE RECOGNITION
// Custom rule-based poses using MediaPipe hand landmarks.
// These labels are prototype mappings, NOT standard sign-language meanings.
// =====================================================

let gestureStream = null;
let handLandmarker = null;
let gestureDetectionRunning = false;
let lastVideoTime = -1;
let previousGesture = "";
let stableGestureFrames = 0;
let lastWrittenGesture = "";

async function startGestureCamera() {
    const video = document.getElementById("gestureCamera");
    const result = document.getElementById("gestureText");

    if (!video || !result) {
        console.error("Camera elements not found.");
        return;
    }

    try {
        result.textContent = "Loading hand recognition model...";

        if (!handLandmarker) {
            const visionModule = await import(
                "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.mjs"
            );

            const vision = await visionModule.FilesetResolver.forVisionTasks(
                "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
            );

            handLandmarker = await visionModule.HandLandmarker.createFromOptions(
                vision,
                {
                    baseOptions: {
                        modelAssetPath: "/static/models/hand_landmarker.task"
                    },
                    runningMode: "VIDEO",
                    numHands: 1
                }
            );
        }

        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error(
                "Camera API unavailable. Open the site using HTTPS or localhost."
            );
        }

        if (gestureStream) {
            gestureStream.getTracks().forEach(track => track.stop());
        }

        gestureStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user" },
            audio: false
        });

        video.srcObject = gestureStream;
        await video.play();

        gestureDetectionRunning = true;
        lastVideoTime = -1;
        previousGesture = "";
        stableGestureFrames = 0;
        lastWrittenGesture = "";

        result.textContent = "Show a hand pose to the camera.";
        detectGestureFromCamera();

    } catch (error) {
        console.error("Gesture recognition error:", error);
        result.textContent = "Error: " + error.message;
    }
}

// Returns true when the finger appears extended.
// This simple geometric rule works best when the palm faces the camera.
function isFingerExtended(landmarks, tipIndex, pipIndex) {
    return landmarks[tipIndex].y < landmarks[pipIndex].y;
}

function distance2D(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function classifyGesture(landmarks) {
    // Finger order: thumb, index, middle, ring, pinky.
    const index = isFingerExtended(landmarks, 8, 6);
    const middle = isFingerExtended(landmarks, 12, 10);
    const ring = isFingerExtended(landmarks, 16, 14);
    const pinky = isFingerExtended(landmarks, 20, 18);

    // Thumb extension is estimated by comparing its tip and joint distance
    // from the index-finger base. This is approximate and can vary by hand angle.
    const thumb = distance2D(landmarks[4], landmarks[5]) >
                  distance2D(landmarks[3], landmarks[5]) * 1.15;

    const pattern = [thumb, index, middle, ring, pinky]
        .map(Boolean)
        .map(value => value ? "1" : "0")
        .join("");

    // Custom 5-bit pose mapping. The labels are messages for this prototype;
    // they are not claims of standard or universally recognized sign language.
    const gestures = {
        "00000": "HELP",
        "10000": "YES",
        "01000": "ONE",
        "01100": "PEACE",
        "01110": "THREE",
        "01111": "FOUR",
        "11111": "STOP",
        "00001": "WAIT",
        "10001": "HELLO",
        "11000": "OK",
        "11001": "THANK YOU",
        "10100": "NO",
        "10110": "PLEASE",
        "10111": "WATER",
        "11010": "NEED DOCTOR",
        "11011": "DANGER",
        "11100": "ATTENTION",
        "11101": "NEED HELP",
        "00100": "COME HERE",
        "00110": "I LOVE YOU"
    };

    return gestures[pattern] || "POSE NOT MAPPED";
}

function detectGestureFromCamera() {
    if (!gestureDetectionRunning) return;

    const video = document.getElementById("gestureCamera");
    const result = document.getElementById("gestureText");

    if (
        video &&
        result &&
        handLandmarker &&
        video.readyState >= 2 &&
        video.currentTime !== lastVideoTime
    ) {
        lastVideoTime = video.currentTime;

        try {
            const output = handLandmarker.detectForVideo(video, performance.now());

            if (output.landmarks && output.landmarks.length > 0) {
                const gesture = classifyGesture(output.landmarks[0]);
                result.textContent = gesture;

                if (gesture === previousGesture) {
                    stableGestureFrames++;
                } else {
                    previousGesture = gesture;
                    stableGestureFrames = 1;
                }

                // Only write to the announcement field after the same pose
                // has been detected for several frames, reducing flicker.
                if (stableGestureFrames >= 5 && gesture !== lastWrittenGesture) {
                    const announcement = document.querySelector(
                        'textarea[name="announcement"]'
                    );

                    if (announcement && gesture !== "POSE NOT MAPPED") {
                        announcement.value = gesture;
                        lastWrittenGesture = gesture;
                    }
                }
            } else {
                result.textContent = "No hand detected";
                previousGesture = "";
                stableGestureFrames = 0;
            }
        } catch (error) {
            console.error("Detection error:", error);
            result.textContent = "Gesture detection error.";
        }
    }

    if (gestureDetectionRunning) {
        requestAnimationFrame(detectGestureFromCamera);
    }
}

function stopGestureCamera() {
    gestureDetectionRunning = false;

    if (gestureStream) {
        gestureStream.getTracks().forEach(track => track.stop());
        gestureStream = null;
    }

    const video = document.getElementById("gestureCamera");
    if (video) video.srcObject = null;

    if (handLandmarker) {
        handLandmarker.close();
        handLandmarker = null;
    }
}

window.addEventListener("beforeunload", stopGestureCamera);
//     console.log("JavaScript Loaded");

// let mediaRecorder = null;
// let audioChunks = [];
// let isRecording = false;


// // =====================================================
// // SPEECH TO TEXT
// // =====================================================

// async function startVoice() {

//     const voiceButton =
//         document.querySelector(".voice-btn");

//     const voiceStatus =
//         document.getElementById("voiceStatus");


//     if (isRecording && mediaRecorder) {

//         mediaRecorder.stop();

//         return;
//     }


//     try {

//         const stream =
//             await navigator.mediaDevices.getUserMedia({
//                 audio: true
//             });


//         audioChunks = [];


//         mediaRecorder =
//             new MediaRecorder(stream);


//         mediaRecorder.ondataavailable =
//             function (event) {

//                 if (event.data.size > 0) {

//                     audioChunks.push(event.data);
//                 }
//             };


//         mediaRecorder.onstart =
//             function () {

//                 isRecording = true;

//                 voiceButton.innerText =
//                     "⏹ Stop";

//                 voiceStatus.innerText =
//                     "🎤 Recording... Speak now.";
//             };


//         mediaRecorder.onstop =
//             async function () {

//                 isRecording = false;

//                 voiceButton.innerText =
//                     "🎤 Speak";

//                 voiceStatus.innerText =
//                     "⏳ Converting speech to text...";


//                 stream
//                     .getTracks()
//                     .forEach(
//                         track => track.stop()
//                     );


//                 const audioBlob =
//                     new Blob(
//                         audioChunks,
//                         {
//                             type: "audio/webm"
//                         }
//                     );


//                 const formData =
//                     new FormData();


//                 formData.append(
//                     "audio",
//                     audioBlob,
//                     "voice.webm"
//                 );


//                 try {

//                     const response =
//                         await fetch(
//                             "/voice",
//                             {
//                                 method: "POST",
//                                 body: formData
//                             }
//                         );


//                     const result =
//                         await response.json();


//                     if (result.success) {

//                         document
//                             .getElementById(
//                                 "announcement"
//                             )
//                             .value = result.text;


//                         voiceStatus.innerText =
//                             "✅ Voice converted to text successfully.";

//                     } else {

//                         voiceStatus.innerText =
//                             "❌ " + result.error;
//                     }


//                 } catch (error) {

//                     console.error(error);

//                     voiceStatus.innerText =
//                         "❌ Could not connect to the voice service.";
//                 }
//             };


//         mediaRecorder.onerror =
//             function (event) {

//                 console.error(
//                     "Recorder error:",
//                     event
//                 );

//                 voiceStatus.innerText =
//                     "❌ Microphone recording failed.";

//                 stream
//                     .getTracks()
//                     .forEach(
//                         track => track.stop()
//                     );
//             };


//         mediaRecorder.start();


//     } catch (error) {

//         console.error(
//             "Microphone error:",
//             error
//         );


//         if (
//             error.name ===
//             "NotAllowedError"
//         ) {

//             voiceStatus.innerText =
//                 "❌ Microphone permission was denied.";

//         } else if (
//             error.name ===
//             "NotFoundError"
//         ) {

//             voiceStatus.innerText =
//                 "❌ No microphone was found.";

//         } else {

//             voiceStatus.innerText =
//                 "❌ Microphone error: "
//                 + error.message;
//         }
//     }
// }


// // =====================================================
// // GESTURE DETECTION
// // =================================================
// // =====================================================
// // BROWSER-BASED HAND GESTURE RECOGNITION
// // =====================================================

// let gestureStream = null;
// let handLandmarker = null;
// let gestureDetectionRunning = false;
// let lastVideoTime = -1;

// async function startGestureCamera() {
//     const video = document.getElementById("gestureCamera");
//     const result = document.getElementById("gestureText");

//     if (!video || !result) {
//         console.error("Camera elements not found.");
//         return;
//     }

//     try {
//         result.textContent = "Loading hand recognition model...";

//         // Load MediaPipe Tasks Vision in the browser
//         if (!handLandmarker) {
//             const visionModule = await import(
//                 "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.mjs");

//             const vision = await visionModule.FilesetResolver.forVisionTasks(
//                 "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
//             );

//             handLandmarker =
//                 await visionModule.HandLandmarker.createFromOptions(
//                     vision,
//                     {
//                         baseOptions: {
//                             modelAssetPath:
//                                 "/static/models/hand_landmarker.task"
//                         },
//                         runningMode: "VIDEO",
//                         numHands: 1
//                     }
//                 );
//         }

//         // Open the visitor's webcam
//         if (gestureStream) {
//             gestureStream.getTracks().forEach(track => track.stop());
//         }

//         if (!navigator.mediaDevices ||
//     !navigator.mediaDevices.getUserMedia) {
//     throw new Error(
//         "Camera API unavailable. Open the site using HTTPS or localhost."
//     );
// }

// gestureStream = await navigator.mediaDevices.getUserMedia({
//     video: { facingMode: "user" },
//     audio: false
// });
//         video.srcObject = gestureStream;
//         await video.play();

//         gestureDetectionRunning = true;
//         lastVideoTime = -1;

//         result.textContent = "Show your hand to the camera.";
//         detectGestureFromCamera();

//     } catch (error) {
//         console.error("Gesture recognition error:", error);
//         result.textContent = "Error: " + error.message;
//     }
// }


// // Simple landmark-based gesture classifier.
// // These are prototype heuristics, not full sign-language recognition.
// function classifyGesture(landmarks) {
//     const tips = [8, 12, 16, 20];
//     const bases = [6, 10, 14, 18];

//     const extended = tips.map((tip, i) =>
//         landmarks[tip].y < landmarks[bases[i]].y
//     );

//     const count = extended.filter(Boolean).length;

//     if (count === 0) return "Fist";
//     if (count === 4) return "Open Palm";
//     if (extended[0] && !extended[1] &&
//         !extended[2] && !extended[3]) return "One Finger";
//     if (extended[0] && extended[1] &&
//         !extended[2] && !extended[3]) return "Two Fingers";
//     if (count === 3) return "Three Fingers";

//     return "Hand Detected";
// }


// function detectGestureFromCamera() {
//     if (!gestureDetectionRunning) return;

//     const video = document.getElementById("gestureCamera");
//     const result = document.getElementById("gestureText");

//     if (
//         video &&
//         result &&
//         handLandmarker &&
//         video.readyState >= 2 &&
//         video.currentTime !== lastVideoTime
//     ) {
//         lastVideoTime = video.currentTime;

//         try {
//             const output = handLandmarker.detectForVideo(
//                 video,
//                 performance.now()
//             );

//             if (output.landmarks && output.landmarks.length > 0) {
//                 const gesture = classifyGesture(output.landmarks[0]);
//                 result.textContent = gesture;

//                 // Put the detected gesture in the announcement field.
//                 const announcement =
//                     document.querySelector('textarea[name="announcement"]');

//                 if (announcement) {
//                     announcement.value = gesture;
//                 }
//             } else {
//                 result.textContent = "No hand detected";
//             }
//         } catch (error) {
//             console.error("Detection error:", error);
//         }
//     }

//     requestAnimationFrame(detectGestureFromCamera);
// }


// // Optional: stop the webcam when leaving the page.
// window.addEventListener("beforeunload", () => {
//     gestureDetectionRunning = false;

//     if (gestureStream) {
//         gestureStream.getTracks().forEach(track => track.stop());
//     }

//     if (handLandmarker) {
//         handLandmarker.close();
//     }
// });


