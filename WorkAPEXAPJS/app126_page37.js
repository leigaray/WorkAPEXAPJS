// Configuration Constants
const sampleRate = 48000;               // CD-quality audio
const channelCount = 2;                 // Dual channel
const constraints = {audio: true};      // For audio-only media recording
const recordingsNeeded = 3;             // Total recordings required
const audioProcessorJSFile = '#APP_IMAGES#audio-processor.js'; // Path to audio processor script
const volumenProcessorJSFile = '#APP_IMAGES#volume-processor.js'; // Path to audio processor script


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

let volumeCanvas;
let playerCanvas;
let volumeProcessorNode;

const itemNames = ['CURRENT_AUDIO_BOX', 'SESSION_IDX', 'USER_TRACKER', 'MIN_TRX_ID'];
document.addEventListener('DOMContentLoaded', async function (event) {

    userTracker = getElementValue(pagePrefix, 'USER_TRACKER');

    if (userTracker) {


        const allRecorded = getElementValue(pagePrefix, 'ALL_RECORDED').toLowerCase().trim() === 'true';

        if (allRecorded) {
            const thankYouMessage = document.getElementById('thankYouMessage');
            if (thankYouMessage) {
                thankYouMessage.style.display = 'block';
            }
        } else {



            fetchPrompts(pageNumber, recordingsNeeded, false); //fetching prompts
            logWithStyle('DOM fully loaded and parsed', 'trace');

            const mainRegion = document.getElementById('main_region');
            const startRecorder = 1;
            const stopRecorder = recordingsNeeded
            let nextSession = parseInt(getElementValue(pagePrefix, 'SESSION_IDX'), 10);

            if (!mainRegion) {
                logWithStyle('Main region not found. Please ensure the element with id="main_region" is present in the HTML.', 'error');
                return;
            }

            for (let i = startRecorder; i <= stopRecorder; i++) {
                createRegionAndItems(i, mainRegion, pageNumber, stopRecorder, nextSession);
            }

            // Function to create the volume visualization canvas
            function createVolumeCanvas(audioPlayer) {
                const canvas = document.createElement("canvas");
                canvas.id = "volume-visualizer";
                canvas.width = audioPlayer.clientWidth;
                canvas.height = 150; // Adjust height for symmetry
                canvas.style.border = "1px solid lightgray";
                audioPlayer.parentElement.insertBefore(canvas, audioPlayer);
                return canvas;
            }

            // Function for symmetrical "river-like" spectrum visualizer
            function riverStyleSpectrumVisualizer(analyser, canvas) {
                const canvasContext = canvas.getContext("2d");
                const dataArray = new Uint8Array(analyser.frequencyBinCount);

                function drawRiver() {
                    requestAnimationFrame(drawRiver);
                    analyser.getByteFrequencyData(dataArray); // Get frequency data

                    canvasContext.clearRect(0, 0, canvas.width, canvas.height);

                    const barWidth = (canvas.width / dataArray.length) * 2.5;
                    let x = 0;

                    for (let i = 0; i < dataArray.length; i++) {
                        const barHeight = dataArray[i] / 1.5; // Scale down to fit canvas

                        // Draw bars symmetrically from the center
                        canvasContext.fillStyle = `rgb(${barHeight + 50}, 100, 200)`; // Adjust colors for a calming "river" effect

                        // Draw top half
                        canvasContext.fillRect(x, canvas.height / 2 - barHeight / 2, barWidth, barHeight / 2);

                        // Draw bottom half (mirror of top)
                        canvasContext.fillRect(x, canvas.height / 2, barWidth, barHeight / 2);

                        x += barWidth + 1; // Slight space between bars
                    }
                }

                drawRiver();
            }


            function handleRecording(sessionCount, startButton, stopButton, saveButton, audioPlayer, loggingElement) {



                let audioDataChunks = [];
                let volumeCanvas;
                let volumeProcessorNode;
                let startTime = 0.0;


                startButton.addEventListener('click', async function () {

                        logWithStyle('Start button clicked for session ' + sessionCount, 'info');
                        startTime = handleRecordingControlStates(startButton, stopButton, saveButton, audioPlayer, loggingElement, 'start');

                        if (!volumeCanvas) {
                            volumeCanvas = createVolumeCanvas(audioPlayer);
                        }

                        try {
                            const result = await initAudioWorklet(sampleRate, channelCount, audioProcessorJSFile);
                            if (result) {
                                audioContext = result.audioContext;
                                processorNode = result.processorNode;
                                stream = result.stream;
                                audioDataChunks = result.audioDataChunks;

                                await audioContext.audioWorklet.addModule(volumenProcessorJSFile);
                                volumeProcessorNode = new AudioWorkletNode(audioContext, 'volume-processor');
                                const source = audioContext.createMediaStreamSource(stream);
                                source.connect(volumeProcessorNode);
                                source.connect(processorNode);

                                // Set up the river-style visualizer
                                const volumeAnalyser = new AnalyserNode(audioContext, { fftSize: 256 });
                                source.connect(volumeAnalyser);
                                riverStyleSpectrumVisualizer(volumeAnalyser, volumeCanvas);

                                logWithStyle('Recording and volume visualization started.', 'info');
                            } else {
                                logWithStyle('Recording aborted due to low sample rate.', 'error');
                                alert('Recording cannot proceed due to insufficient audio quality. Please use a wired setup.');
                                handleRecordingControlStates(startButton, stopButton, saveButton, audioPlayer, loggingElement, 'stop');
                                startButton.disabled = true;
                                saveButton.disabled = true;
                            }
                        } catch (error) {
                            logWithStyle('Error starting recording: ' + error.message, 'error');
                            handleRecordingControlStates(startButton, stopButton, saveButton, audioPlayer, loggingElement, 'stop');
                            startButton.disabled = true;
                            saveButton.disabled = true;
                        }


                });




                stopButton.addEventListener('click', function () {
                    logWithStyle('Stop button clicked for session ' + sessionCount, 'info');
                    handleRecordingControlStates(startButton, stopButton, saveButton, audioPlayer, loggingElement, 'stop', startTime);

                    if (stream) {
                        const tracks = stream.getTracks();
                        tracks.forEach(track => track.stop());
                        logWithStyle('Audio stream stopped.', 'info');
                    }

                    const wavBlob = audioToWav(audioDataChunks, audioContext.sampleRate);
                    const audioUrl = URL.createObjectURL(wavBlob);
                    audioPlayer.src = audioUrl;
                    audioPlayer.load();
                    logWithStyle('Audio loaded into player.', 'info');

                    audioBlobToBase64(wavBlob, function (base64Audio) {
                        logWithStyle('Audio data converted to Base64 for processing.', 'info');

                        audioChunks = splitBase64AudioData(base64Audio, maxChunkSize);

                        if (audioChunks.length === 0) {
                            logWithStyle('No audio data available after splitting. Please record again.', 'error');
                            alert('Recording failed. Please try again.');
                            return;
                        }

                        if (debug) {
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

                    // Immediately disable the buttons to prevent multiple clicks
                    startButton.disabled = true;
                    saveButton.disabled = true;

                    const currentAudioBox = $v(pagePrefix + 'CURRENT_AUDIO_BOX');
                    const userTracker = $v(pagePrefix + 'USER_TRACKER');

                    if (!audioChunks || audioChunks.length === 0) {
                        alert('Audio data is missing. Please record again before saving.');
                        logWithStyle('Save aborted due to missing audio chunks.', 'error');
                        saveButton.disabled = false;
                        saveButton.style.backgroundColor = '';
                        startButton.disabled = false;
                        startButton.style.backgroundColor = '';
                        return;
                    }

                    logWithStyle(pagePrefix + "CURRENT_AUDIO_BOX before submit: " + currentAudioBox, 'trace');
                    logWithStyle("Chunks Len:", audioChunks.length, 'trace');

                    try {
                        let isPopulatedResponse = await apex.server.process(
                            'IS_AUDIO_FILE_POPULATED',
                            {
                                x01: currentAudioBox,
                                x02: userTracker
                            },
                            {
                                dataType: 'json'
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
                                        dataType: 'json'
                                    }
                                );

                                if (response.audio_updated) {
                                    console.log(`Chunk ${i + 1} saved successfully.`);
                                } else {
                                    console.warn(`Chunk ${i + 1} failed to update.`);
                                }

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

                        let isAudioFilePresent = await apex.server.process(
                            'IS_AUDIO_FILE_PRESENT',
                            {
                                x01: currentAudioBox,
                                x02: userTracker
                            },
                            {
                                dataType: 'json'
                            }
                        );
                        console.log("IS_AUDIO_FILE_PRESENT response:", isAudioFilePresent);

                        if (isPopulatedResponse) {
                            logWithStyle('Audio file successfully entered after save operation.', 'info');
                            apex.page.submit();
                            location.reload();
                        } else {
                            logWithStyle('Warning: Audio file did not populate as expected after saving.', 'warn');
                        }

                        apex.item(pagePrefix + 'CURRENT_AUDIO_BOX').refresh();

                    } catch (error) {
                        console.error('Error checking if audio is populated:', error);
                        // Re-enable buttons if an error occurs
                        startButton.disabled = false;
                        saveButton.disabled = false;
                    } finally {
                        // Ensure buttons are re-enabled at the end of the process
                        startButton.disabled = false;
                        saveButton.disabled = false;
                    }
                });

            }

            for (let sessionCount = startRecorder; sessionCount <= stopRecorder; sessionCount++) {
                const startButton = getElementById(pagePrefix, 'START_RECORDING_' + sessionCount);
                const stopButton = getElementById(pagePrefix, 'STOP_RECORDING_' + sessionCount);
                const saveButton = getElementById(pagePrefix, 'SAVE_SESSION_RECORDING_' + sessionCount);
                const audioPlayer = getElementById(pagePrefix, 'SESSION_AUDIO_PLAYER_' + sessionCount);
                const loggingElement = getElementById(pagePrefix, 'LOGGING_' + sessionCount);

                if (startButton.length && stopButton.length && saveButton.length && audioPlayer.length && loggingElement.length) {
                    handleRecording(sessionCount, startButton[0], stopButton[0], saveButton[0], audioPlayer[0], loggingElement[0]);
                } else {
                    console.error(`Missing elements for session ${sessionCount}:`, {
                        startButton,
                        stopButton,
                        saveButton,
                        audioPlayer,
                        loggingElement
                    });
                }
            }
        }

    } else {
        console.log("beginning...")

        setupCheckboxDisplayByValue(
            pagePrefix + 'NATIVE_LANGUAGE',
            'Other',
            pagePrefix + 'NATIVE_LANGUAGE_1_CONTAINER',
            pagePrefix + 'NATIVE_LANGUAGE_1_LABEL'
        );

        setupCheckboxDisplayByValue(
            pagePrefix + 'IDENTIFY_YOURSELF',
            'Other (specify)',
            pagePrefix + 'IDENTIFY_YOURSELF_1_CONTAINER',
            pagePrefix + 'IDENTIFY_YOURSELF_1_LABEL'
        );

        setupCheckboxDisplayByValue(
            pagePrefix + 'FIRST_LANGUAGE',
           'Other (specify)',
            pagePrefix + 'FIRST_LANGUAGE_1_CONTAINER',
            pagePrefix + 'FIRST_LANGUAGE_1_LABEL'
        );

        setupCheckboxDisplayByValue(
            pagePrefix + 'ASR_QUESTION',
            'Other (specify)',
            pagePrefix + 'ASR_QUESTION_1_CONTAINER',
            pagePrefix + 'ASR_QUESTION_1_LABEL'
        );

        setupCheckboxDisplayByValue(
            pagePrefix + 'SPOKEN_ENGLISH',
            'Other (specify)',
            pagePrefix + 'SPOKEN_ENGLISH_1_CONTAINER',
            pagePrefix + 'SPOKEN_ENGLISH_1_LABEL'
        );

        console.log("ending...")
    }
});
