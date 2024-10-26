const sampleRate = 44100; // CD-quality audio
const channelCount = 1; // Mono channel
let mediaRecorder = null; // Initialize mediaRecorder
const constraints = { audio: true }; // For audio-only media recording
const recordingsNeeded = 5;
const audioHoldersCapacity = 350;
const pageNumber = $v('pFlowStepId');
const pagePrefix = 'P' + pageNumber + '_';
const audioProcessorJSFile = '#APP_IMAGES#audio-processor.js';

let userTracker = $v(pagePrefix + 'USER_TRACKER');
let audioContext = null;
let stream = null;
let debug = false;


function getAudioHolderId(audioHolderId) { return pagePrefix + 'AUDIO_HOLDER_' + audioHolderId;}
function getElement(elementId) { return $('#' + elementId); }
function getValue(elementId) { return $v(elementId); }
function getPageIdFor(itemName) { return pagePrefix + itemName; }


function logElementValue(elementId) {
    const element = getElement(elementId);
    if (element) {
        const value = element.val();
        if (value === undefined || value === null || value === '') {
            //logWithStyle(elementId + ': NONE', 'warn');
        } else {
            //logWithStyle(elementId + ': ' + value);
        }
    } else {
        //logWithStyle(elementId + ' not found.', 'warn');
    }
}

const itemNames = [ 'CURRENT_AUDIO_BOX', 'SESSION_IDX', 'USER_TRACKER', 'MIN_TRX_ID'];

function sendAudioHolders(startIndex, endIndex) {
    let fullString = '';
    let populatedCount = 0;

    // Log the current range of audio holders being processed
    console.log(`Processing audio holders from ${startIndex} to ${endIndex}`);

    // Loop through the audio holders and concatenate non-empty values
    for (let i = startIndex; i <= endIndex; i++) {
        const holderValue = $v('P37_AUDIO_HOLDER_' + i);
        if (holderValue && holderValue.length > 0) {
            fullString += holderValue;
            populatedCount++;
        }
    }

    if (populatedCount > 0) {
        console.log(`Sending data for range ${startIndex}-${endIndex}, length: ${fullString.length}`);
        console.log(`First 15 chars: ${fullString.substring(0, 15)}, Last 15 chars: ${fullString.slice(-15)}`);

        // Perform the APEX server process call
        apex.server.process(
            'SAVE_AUDIO_RECORDING3',  // Replace this with the actual APEX process name
            {
                x01: fullString,  // Ensure this matches the server-side parameter name
                x02: populatedCount
            },
            {
                success: function (data) {
                    console.log('Chunk saved:', data);
                },
                error: function (jqXHR, textStatus, errorThrown) {
                    console.error('Error saving chunk:', textStatus, errorThrown);
                },
                dataType: 'json'
            }
        );

    } else {
        console.log(`No data found in holders for range ${startIndex}-${endIndex}`);
    }
}


document.addEventListener('DOMContentLoaded', function (event) {

    userTracker = $v(pagePrefix + 'USER_TRACKER');

    if (userTracker) {

        // Fetch prompts
        fetchPrompts(pageNumber, recordingsNeeded);

        // Proceed with additional setup here, e.g., control states, recording handlers
        //logWithStyle('DOM fully loaded and parsed', 'info');

        const mainRegion = document.getElementById('main_region');
        if (!mainRegion) {
            console.error('Main region not found. Please ensure the element with id="main_region" is present in the HTML.');
            return;
        }

        const startRecorder = 1;
        const stopRecorder = recordingsNeeded
        let nextSession = parseInt($v(pagePrefix +  'SESSION_IDX'), 10);

        // Create regions and items based on
        for (let i = startRecorder; i <= stopRecorder; i++) {
            createRegionAndItems(i, mainRegion, pageNumber, stopRecorder, nextSession);
        }



        // Function to handle recording states
        function handleRecording(sessionCount, startButton, stopButton, saveButton, audioPlayer) {
            startButton.addEventListener('click', async function () {
                //logWithStyle('Start button clicked for session ' + sessionCount, 'info');
                clearSequencedItems(pagePrefix, 'AUDIO_HOLDER', 1, 350) ;
                handleRecordingControlStates(startButton, stopButton, saveButton, audioPlayer, 'start');

                try {
                    const result = await initAudioWorklet(44100, 1, '#APP_IMAGES#audio-processor.js');
                    if (result) {
                        audioContext = result.audioContext;
                        processorNode = result.processorNode;
                        stream = result.stream;
                        audioDataChunks = result.audioDataChunks;
                    } else {
                        //logWithStyle('Failed to initialize AudioWorkletNode. Fallback required.', 'error');
                    }
                } catch (error) {
                    //logWithStyle('Error starting recording: ' + error.message, 'error');
                }
            });

            stopButton.addEventListener('click', function () {
                //logWithStyle('Stop button clicked for session ' + sessionCount, 'info');

                // Update recording control states
                handleRecordingControlStates(startButton, stopButton, saveButton, audioPlayer, 'stop');

                // Stop the audio stream
                if (stream) {
                    const tracks = stream.getTracks();
                    tracks.forEach(track => track.stop());
                    //logWithStyle('Audio stream stopped.', 'info');
                }


                // Convert the audio chunks into a WAV blob
                const wavBlob = audioToWav(audioDataChunks, audioContext.sampleRate);

                // Load the blob into the audio player for playback
                const audioUrl = URL.createObjectURL(wavBlob);
                audioPlayer.src = audioUrl;
                audioPlayer.load();
                //logWithStyle('Audio loaded into player.', 'info');

                // Convert the audio blob to Base64 and process it
                audioBlobToBase64(wavBlob, function(base64Audio) {
                    //logWithStyle('Audio data converted to Base64 for processing.', 'info');

                    // Split the Base64 audio data into chunks of 30,000 characters each
                    const maxChunkSize = 30000;
                    const audioChunks = splitBase64AudioData(base64Audio, maxChunkSize);

                    if (audioChunks.length === 0) {
                        //logWithStyle('No audio data available after splitting.', 'error');
                        return;
                    }

                    // assign the audio chunks to the appropriate page items
                    const audioHoldersCapacity = 350;  // The total number of available holders
                    const itemsAssigned = assignAudioChunksToHolders(audioChunks, pagePrefix, 1);

                    //logWithStyle(`Audio data has been assigned to ${itemsAssigned} page items.`, 'info');

                    // combine the chunks and download as a text file for debugging
                    const combinedChunks = audioChunks.join('\n');


                    if(debug) {
                        debugFilename = 'audio_recording';
                        downloadCustomTextFile(audioChunks, debugFilename, userTracker, sessionCount);
                        downloadAudioBlob(wavBlob, debugFilename);
                        //logWithStyle('Audio chunks saved to text file for debugging.', 'info');
                    }


                    itemNames.forEach(itemName => {
                        const elementId = getPageIdFor(itemName);
                        logElementValue(elementId);
                    });

                    //checkAudioHolders(pagePrefix, startRange, endRange)
                    checkAudioHolders(pagePrefix, 1, 350)
                });
            });



            saveButton.addEventListener('click', function () {
                //logWithStyle('Save button clicked for session ' + sessionCount, 'info');

                // Disable buttons during processing
                saveButton.disabled = true;
                saveButton.style.backgroundColor = 'grey';
                startButton.disabled = true;
                stopButton.disabled = true;

                const currentAudioBox = $v('P37_CURRENT_AUDIO_BOX');
                const userTracker = $v('P37_USER_TRACKER');

                console.log("P37_CURRENT_AUDIO_BOX before submit: " + currentAudioBox);

                console.log("Chunks Len:", audioChunks.length);

                // Execute APEX server process with necessary user data only
                /*
                apex.server.process(
                    'SAVE_AUDIO_RECORDING3',
                    { x01: currentAudioBox, x02: userTracker },
                    {
                        success: function(data) {
                            console.log('Data saved successfully:', data);
                        },
                        error: function(jqXHR, textStatus, errorThrown) {
                            console.error('Error saving data:', textStatus, errorThrown);
                            console.error('Response text:', jqXHR.responseText); // Log the raw response
                        },
                        dataType: 'json'  // Ensure that this is correct
                    }
                );

                */
                // Restore button states after processing
                handleRecordingControlStates(startButton, stopButton, saveButton, audioPlayer, 'submit');
            });


        }


        for (let sessionCount = startRecorder; sessionCount <= stopRecorder; sessionCount++) {
            const startButton = document.getElementById('P' + pageNumber + '_START_RECORDING_' + sessionCount);
            const stopButton = document.getElementById('P' + pageNumber + '_STOP_RECORDING_' + sessionCount);
            const saveButton = document.getElementById('P' + pageNumber + '_SAVE_SESSION_RECORDING_' + sessionCount);
            const audioPlayer = document.getElementById('P' + pageNumber + '_SESSION_AUDIO_PLAYER_' + sessionCount);

            if (startButton && stopButton && saveButton && audioPlayer) {
                handleRecording(sessionCount, startButton, stopButton, saveButton, audioPlayer);
            } else {
                console.error(`Missing elements for session ${sessionCount}:`, { startButton, stopButton, saveButton, audioPlayer });
            }
        }
    }

});
