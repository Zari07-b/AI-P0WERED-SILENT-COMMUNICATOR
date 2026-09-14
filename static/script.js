
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
// GESTURE DETECTION
// =====================================================

function updateGesture() {

    fetch("/gesture")

        .then(response =>
            response.json()
        )

        .then(data => {

            const gesture =
                data.gesture;


            const gestureText =
                document.getElementById(
                    "gestureText"
                );


            const announcement =
                document.getElementById(
                    "announcement"
                );


            if (!gestureText) {
                return;
            }


            gestureText.innerText =
                gesture;


            if (
                gesture &&
                gesture !==
                "No gesture detected"
            ) {

                announcement.value =
                    gesture;
            }

        })

        .catch(error => {

            console.error(
                "Gesture API error:",
                error
            );
        });
}


// Check gesture every 500ms

setInterval(
    updateGesture,
    500
);// console.log("JavaScript Loaded");

// let mediaRecorder = null;
// let audioChunks = [];
// let isRecording = false;

// async function startVoice() {
//     const voiceButton = document.querySelector(".voice-btn");
//     const voiceStatus = document.getElementById("voiceStatus");

//     // If already recording, stop it.
//     if (isRecording && mediaRecorder) {
//         mediaRecorder.stop();
//         return;
//     }

//     try {
//         // Ask the browser for microphone permission.
//         const stream = await navigator.mediaDevices.getUserMedia({
//             audio: true
//         });

//         audioChunks = [];

//         // Browser records audio locally.
//         mediaRecorder = new MediaRecorder(stream);

//         mediaRecorder.ondataavailable = function (event) {
//             if (event.data.size > 0) {
//                 audioChunks.push(event.data);
//             }
//         };

//         mediaRecorder.onstart = function () {
//             isRecording = true;
//             voiceButton.innerText = "⏹ Stop";
//             voiceStatus.innerText = "🎤 Recording... Speak now.";
//         };

//         mediaRecorder.onstop = async function () {
//             isRecording = false;
//             voiceButton.innerText = "🎤 Speak";
//             voiceStatus.innerText = "⏳ Converting speech to text...";

//             // Stop microphone tracks.
//             stream.getTracks().forEach(track => track.stop());

//             const audioBlob = new Blob(audioChunks, {
//                 type: "audio/webm"
//             });

//             const formData = new FormData();
//             formData.append("audio", audioBlob, "voice.webm");

//             try {
//                 const response = await fetch("/voice", {
//                     method: "POST",
//                     body: formData
//                 });

//                 const result = await response.json();

//                 if (result.success) {
//                     document.getElementById("announcement").value =
//                         result.text;

//                     voiceStatus.innerText =
//                         "✅ Voice converted to text successfully.";
//                 } else {
//                     voiceStatus.innerText =
//                         "❌ " + result.error;
//                 }

//             } catch (error) {
//                 console.error(error);
//                 voiceStatus.innerText =
//                     "❌ Could not connect to the voice service.";
//             }
//         };

//         mediaRecorder.onerror = function (event) {
//             console.error("Recorder error:", event);
//             voiceStatus.innerText =
//                 "❌ Microphone recording failed.";
//             stream.getTracks().forEach(track => track.stop());
//         };

//         mediaRecorder.start();

//     } catch (error) {
//         console.error("Microphone error:", error);

//         if (error.name === "NotAllowedError") {
//             voiceStatus.innerText =
//                 "❌ Microphone permission was denied. Allow microphone access in Chrome.";
//         } else if (error.name === "NotFoundError") {
//             voiceStatus.innerText =
//                 "❌ No microphone was found.";
//         } else {
//             voiceStatus.innerText =
//                 "❌ Microphone error: " + error.message;
//         }
//     }
// }
