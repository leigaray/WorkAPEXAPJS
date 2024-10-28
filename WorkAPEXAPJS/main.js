// Configuration Constants
const sampleRate = 48000;           // CD-quality audio
const channelCount = 2;             // Mono channel
const constraints = {audio: true}; // For audio-only media recording
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

const itemNames = ['CURRENT_AUDIO_BOX', 'SESSION_IDX', 'USER_TRACKER', 'MIN_TRX_ID'];
document.addEventListener('DOMContentLoaded', async function (event) {

    userTracker = getElementValue(pagePrefix, 'USER_TRACKER');

    if (userTracker) {

        fetchPrompts(pageNumber, recordingsNeeded); //fetching prompts
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

        function handleRecording(sessionCount, startButton, stopButton, saveButton, audioPlayer, loggingElement) {

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
                        logWithStyle('Recording started successfully.', 'info');
                    } else {
                        logWithStyle('Recording aborted due to low sample rate.', 'error');
                        alert('Recording cannot proceed due to insufficient audio quality. Please use a wired setup.');
                        handleRecordingControlStates(startButton, stopButton, saveButton, audioPlayer, loggingElement, 'stop'); // Reset button states
                        startButton.disabled = true;
                        saveButton.disabled = true;
                    }
                } catch (error) {
                    logWithStyle('Error starting recording: ' + error.message, 'error');
                    handleRecordingControlStates(startButton, stopButton, saveButton, audioPlayer, loggingElement, 'stop'); // Reset button states on error
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

                const currentAudioBox = $v('P37_CURRENT_AUDIO_BOX');
                const userTracker = $v('P37_USER_TRACKER');

                if (!audioChunks || audioChunks.length === 0) {
                    alert('Audio data is missing. Please record again before saving.');
                    logWithStyle('Save aborted due to missing audio chunks.', 'error');
                    saveButton.disabled = false;
                    saveButton.style.backgroundColor = '';
                    return;
                }

                logWithStyle("P37_CURRENT_AUDIO_BOX before submit: " + currentAudioBox, 'trace');
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

                    isPopulatedResponse = await apex.server.process(
                        'IS_AUDIO_FILE_POPULATED',
                        {
                            x01: currentAudioBox,
                            x02: userTracker
                        },
                        {
                            dataType: 'json'
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

    } else {

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
