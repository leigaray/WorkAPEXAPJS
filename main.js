// Configuration Constants
const sampleRate = 44100;           // CD-quality audio
const channelCount = 1;             // Mono channel
const constraints = { audio: true }; // For audio-only media recording
const recordingsNeeded = 5;         // Total recordings required
const audioProcessorJSFile = '#APP_IMAGES#audio-processor.js'; // Path to audio processor script

// Page and User Information
const pageNumber = $v('pFlowStepId');
const pagePrefix = 'P' + pageNumber + '_';

// Audio and Recording Variables
let audioContext = null;  // Audio context for managing audio processing
let stream = null;        // Stream to capture audio data
let mediaRecorder = null; // Recorder instance for capturing audio
const maxChunkSize = 30000;

// Debugging and State Management
let debug = false;        // Debug mode flag

const itemNames = [ 'CURRENT_AUDIO_BOX', 'SESSION_IDX', 'USER_TRACKER', 'MIN_TRX_ID'];

async function checkMicrophoneQuality() {
    try {
        // List all available audio devices
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === 'audioinput');

        if (audioInputs.length === 0) {
            alert("No audio input devices found. Please connect a microphone.");
            return;
        }

        console.log("Available audio input devices:");
        let highestQualityDevice = null;
        let highestSampleRate = 0;
        let selectedDeviceSampleRate = 0;

        for (const device of audioInputs) {
            console.log(`Checking device: ${device.label} (ID: ${device.deviceId})`);

            // Attempt to access each microphone and get its sample rate
            const testStream = await navigator.mediaDevices.getUserMedia({
                audio: { deviceId: device.deviceId }
            });
            const testAudioContext = new (window.AudioContext || window.webkitAudioContext)();
            const testSource = testAudioContext.createMediaStreamSource(testStream);

            // Get sample rate for the device
            const sampleRate = testAudioContext.sampleRate;
            console.log(`Sample rate for ${device.label}: ${sampleRate} Hz`);

            // Determine if this device has the highest sample rate so far
            if (sampleRate > highestSampleRate) {
                highestSampleRate = sampleRate;
                highestQualityDevice = device;
            }

            // Check if the device is the default selected device (usually the system's default)
            if (device.deviceId === audioInputs[0].deviceId) {
                selectedDeviceSampleRate = sampleRate;

                // Check if the default microphone's quality meets the acceptable rate
                if (sampleRate < 44100) {
                    alert(`Warning: Your default microphone, "${device.label}", has a sample rate of ${sampleRate} Hz, which is below CD quality. Quality may be affected.`);
                } else {
                    console.log(`Default microphone "${device.label}" has an acceptable sample rate of ${sampleRate} Hz.`);
                }
            }

            // Cleanup: Stop the audio stream and close the audio context after the check
            testStream.getTracks().forEach(track => track.stop());
            testAudioContext.close();
        }

        // Log and notify if there’s a recommended device with a higher sample rate
        if (highestQualityDevice && highestSampleRate > selectedDeviceSampleRate) {
            console.log(`Recommended device for higher quality: ${highestQualityDevice.label} with a sample rate of ${highestSampleRate} Hz.`);
            alert(`For better quality, consider using "${highestQualityDevice.label}" which has a sample rate of ${highestSampleRate} Hz.`);
        }

        // Inform user if the default device does not meet criteria, but another device does
        if (selectedDeviceSampleRate < 44100 && highestSampleRate >= 44100) {
            alert(`Your default microphone does not meet the quality criteria. Consider using "${highestQualityDevice.label}" which meets the quality standard.`);
        }

    } catch (error) {
        alert("Microphone access failed or is not available. Please ensure a working microphone is connected.");
        console.error("Microphone quality check failed:", error);
    }
}

document.addEventListener('DOMContentLoaded', async function (event) {



    userTracker = getElementValue(pagePrefix, 'USER_TRACKER');

    if (userTracker) {
        fetchPrompts(pageNumber, recordingsNeeded); //fetching prompts
        logWithStyle('DOM fully loaded and parsed', 'trace');

        // Set main_region, startRecorder, stopRecorder, nextSession
        const mainRegion = document.getElementById('main_region');
        const startRecorder = 1;
        const stopRecorder = recordingsNeeded
        let nextSession = parseInt(getElementValue(pagePrefix, 'SESSION_IDX'), 10);

        if (!mainRegion) {
            logWithStyle('Main region not found. Please ensure the element with id="main_region" is present in the HTML.', 'error');
            return;
        }

        // create regions and control elements
        for (let i = startRecorder; i <= stopRecorder; i++) {
            createRegionAndItems(i, mainRegion, pageNumber, stopRecorder, nextSession);
        }

        // handle each audio recording
        function handleRecording(sessionCount, startButton, stopButton, saveButton, audioPlayer, loggingElement) {

            // set audioChunks and startTime
            let audioChunks = []
            let startTime = 0.0;

            startButton.addEventListener('click', async function () {
               logWithStyle('Start button clicked for session ' + sessionCount, 'info');
               startTime = handleRecordingControlStates(startButton, stopButton, saveButton, audioPlayer, loggingElement, 'start');

                try {
                    const result = await initAudioWorklet(sampleRate, channelCount, audioProcessorJSFile);
                    if (result) {
                        audioContext = result.audioContext;
                        processorNode = result.processorNode;
                        stream = result.stream;
                        audioDataChunks = result.audioDataChunks;
                    } else {
                        logWithStyle('Failed to initialize AudioWorkletNode. Fallback required.', 'error');
                    }
                } catch (error) {
                    logWithStyle('Error starting recording: ' + error.message, 'error');
                }
            });

            stopButton.addEventListener('click', function () {
                logWithStyle('Stop button clicked for session ' + sessionCount, 'info');
                handleRecordingControlStates(startButton, stopButton, saveButton, audioPlayer, loggingElement, 'stop', startTime);

                // If there's an active audio stream, stop each track in the stream to halt audio capture
                if (stream) {
                    const tracks = stream.getTracks();
                    tracks.forEach(track => track.stop());
                    logWithStyle('Audio stream stopped.', 'info');
                }

                // Convert audio chunks in `audioDataChunks` into a WAV format blob using the provided sample rate
                const wavBlob = audioToWav(audioDataChunks, audioContext.sampleRate);
                // Create a URL for the audio blob to use it as a source for playback in `audioPlayer`
                const audioUrl = URL.createObjectURL(wavBlob);
                audioPlayer.src = audioUrl;
                audioPlayer.load(); // Load the audio file for playback
                logWithStyle('Audio loaded into player.', 'info');

                // Convert the audio blob to a Base64 string for further processing, especially for splitting into chunks
                audioBlobToBase64(wavBlob, function(base64Audio) {
                    logWithStyle('Audio data converted to Base64 for processing.', 'info');

                    // Splits Base64 audio data into manageable chunks
                    audioChunks = splitBase64AudioData(base64Audio, maxChunkSize);

                    // If no valid audio data was obtained after splitting, log an error and alert the user
                    if (audioChunks.length === 0) {
                        logWithStyle('No audio data available after splitting. Please record again.', 'error');
                        alert('Recording failed. Please try again.');
                        return;
                    }
                    // If debug mode is active, download the audio chunks and blob as files for testing
                    if(debug) {
                        debugFilename = 'audio_recording';
                        downloadCustomTextFile(audioChunks, debugFilename, userTracker, sessionCount);
                        downloadAudioBlob(wavBlob, debugFilename);
                        logWithStyle('Audio chunks saved to text file for debugging.', 'info');
                    }
                });
            });

            saveButton.addEventListener('click', async function () {
                logWithStyle('Save button clicked for session ' + sessionCount, 'info');
                handleRecordingControlStates(startButton, stopButton, saveButton, audioPlayer, loggingElement, 'submit', startTime);

                const currentAudioBox = $v('P37_CURRENT_AUDIO_BOX');
                const userTracker = $v('P37_USER_TRACKER');

                if (!audioChunks || audioChunks.length === 0) {
                    alert('Audio data is missing. Please record again before saving.');
                    logWithStyle('Save aborted due to missing audio chunks.', 'error');
                    saveButton.disabled = false;
                    saveButton.style.backgroundColor = ''; // Reset button color
                    return;
                }

                logWithStyle("P37_CURRENT_AUDIO_BOX before submit: " + currentAudioBox, 'trace');
                logWithStyle("Chunks Len:", audioChunks.length, 'trace');

                try {
                    // Initial check for audio_file_2 population status
                    let isPopulatedResponse = await apex.server.process(
                        'IS_AUDIO_FILE_POPULATED',
                        {
                            x01: currentAudioBox,
                            x02: userTracker
                        },
                        {
                            dataType: 'json'  // Expect JSON response
                        }
                    );

                    if (isPopulatedResponse.audio_populated) {
                        logWithStyle('Audio file already populated. Save operation aborted.', 'warn');
                        alert('This audio file is already populated. No need to save again.');
                        apex.page.submit();
                        location.reload();
                        return;
                    }

                    let chunkCount = 0;

                    for (let i = 0; i < audioChunks.length; i++) {
                        const chunk = audioChunks[i];
                        chunkCount += 1;

                        console.log(`Sending chunk ${chunkCount}, Length: ${chunk.length}, Content: ${chunk.slice(0, 25)}...`);

                        try {
                            const response = await apex.server.process(
                                'SAVE_AUDIO_FILE_2',
                                {
                                    x01: currentAudioBox,
                                    x02: userTracker,
                                    x03: chunk
                                },
                                {
                                    dataType: 'json'  // Expect JSON response
                                }
                            );

                            if (response.audio_updated) {
                                console.log(`Chunk ${i + 1} saved successfully.`);
                            } else {
                                console.warn(`Chunk ${i + 1} failed to update.`);
                            }

                            // Pause every 50 chunks
                            if (chunkCount % 50 === 0) {
                                console.log("Pausing for 500ms...");
                                await new Promise(resolve => setTimeout(resolve, 500)); // Pause for 500ms
                            }
                        } catch (error) {
                            console.error(`Error in AJAX call for chunk ${i + 1}:`, error);
                        }
                    }

                    if (loggingElement) {
                        loggingElement.style.display = 'none';
                    }

                    // Final check after saving all chunks
                    isPopulatedResponse = await apex.server.process(
                        'IS_AUDIO_FILE_POPULATED',
                        {
                            x01: currentAudioBox,
                            x02: userTracker
                        },
                        {
                            dataType: 'json'  // Expect JSON response
                        }
                    );
                    console.log("IS_AUDIO_FILE_POPULATED response:", isPopulatedResponse);

                    if (isPopulatedResponse) {
                        logWithStyle('Audio file successfully populated after save operation.', 'info');
                        apex.page.submit();
                        location.reload();
                    } else {
                        logWithStyle('Warning: Audio file did not populate as expected after saving.', 'warn');
                    }

                    apex.item('P37_CURRENT_AUDIO_BOX').refresh();

                } catch (error) {
                    console.error('Error checking if audio is populated:', error);
                }
            });
        }

        // iterate through the audio recordings elements
        for (let sessionCount = startRecorder; sessionCount <= stopRecorder; sessionCount++) {
            const startButton = getElementById(pagePrefix, 'START_RECORDING_' + sessionCount);
            const stopButton = getElementById(pagePrefix, 'STOP_RECORDING_' + sessionCount);
            const saveButton = getElementById(pagePrefix, 'SAVE_SESSION_RECORDING_' + sessionCount);
            const audioPlayer = getElementById(pagePrefix, 'SESSION_AUDIO_PLAYER_' + sessionCount);
            const loggingElement = getElementById(pagePrefix, 'LOGGING_' + sessionCount);

            if (startButton.length && stopButton.length && saveButton.length && audioPlayer.length && loggingElement.length) {
                handleRecording(sessionCount, startButton[0], stopButton[0], saveButton[0], audioPlayer[0], loggingElement[0]);
            } else {
                console.error(`Missing elements for session ${sessionCount}:`, { startButton, stopButton, saveButton, audioPlayer, loggingElement });
            }
        }

   } else {

       await checkMicrophoneQuality();

       setupConditionalDisplayById(
            pagePrefix + 'RECORDING_MIC',
            pagePrefix + 'RECORDING_MIC_YES',
            pagePrefix + 'RECORDING_MIC_YES_LABEL', 'Yes'
       );

       setupConditionalDisplayById(
            pagePrefix + 'SIGNUP_REFERRAL',
            pagePrefix + 'SIGNUP_REFERRAL_OTHER',
            pagePrefix + 'SIGNUP_REFERRAL_OTHER_LABEL', 'Other'
       );

        setupExclusiveCheckboxById(
            'No Experience',
            'P37_RECORDING_EXPERIENCE',
            'Other',
            'P37_RECORDING_EXPERIENCE_OTHER',
            'P37_RECORDING_EXPERIENCE_OTHER_LABEL'
        );
   }
});
