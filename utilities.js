/*Utilities*/
var recordingStartTime = null;
var mediaPlayerTimer = null;

function logWithStyle(message, level = 'info') {
    let style = 'font-weight: bold;';
    switch (level) {
        case 'info':
            style += 'color: #90ee90';
            console.log('%c FGVD - ' + message, style);
            break;
        case 'warn':
            style += 'color: yellow';
            console.warn('%c FGVD - ' + message, style);
            break;
        case 'error':
            style += 'color: red';
            console.error('%c FGVD - ' + message, style);
            break;
        case 'undefined':
            style += 'color: orange';
            console.warn('%c FGVD - ' + message, style);
            break;
        default:
            console.log('%c FGVD - ' + message, style);
    }
}

// start the timer and update every 100 milliseconds for milliseconds precision
function startTimer(loggingElement) {
    startTime = Date.now();
    timerInterval = setInterval(() => {
        const elapsedTime = Date.now() - startTime;
        const minutes = Math.floor(elapsedTime / 60000);
        const seconds = Math.floor((elapsedTime % 60000) / 1000);
        const milliseconds = Math.floor((elapsedTime % 1000) / 10); // Get centiseconds for smoother display

        // Update the logging element with formatted time (MM:SS:MS)
        loggingElement.innerText = `Recording... Time: ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(milliseconds).padStart(2, '0')}`;
    }, 100); // Update every 100 milliseconds (10 times per second)
}

// stops timer and show final time including milliseconds
function stopTimer(loggingElement) {
    clearInterval(timerInterval);
    timerInterval = null;
    const elapsedTime = Date.now() - startTime;
    const minutes = Math.floor(elapsedTime / 60000);
    const seconds = Math.floor((elapsedTime % 60000) / 1000);
    const milliseconds = Math.floor((elapsedTime % 1000) / 10);
    loggingElement.innerText = `Recording stopped. Total time: ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(milliseconds).padStart(2, '0')}`;
}

async function initAudioWorklet(sampleRate, channelCount, audioProcessorJSFile) {
    try {
        let audioContext = new (window.AudioContext || window.webkitAudioContext)({sampleRate});
        await audioContext.audioWorklet.addModule(audioProcessorJSFile);

        let processorNode = new AudioWorkletNode(audioContext, 'audio-processor');
        let audioDataChunks = [];

        processorNode.port.onmessage = (event) => {
            let chunk = event.data;
            if (!(chunk instanceof Float32Array)) {
                chunk = new Float32Array(chunk);
            }
            audioDataChunks.push(chunk);
            logWithStyle('Received audio chunk, size: ' + chunk.length, 'info');
        };

        let stream = await navigator.mediaDevices.getUserMedia({audio: {channelCount}});
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(processorNode);
        processorNode.connect(audioContext.destination);
        logWithStyle('AudioWorklet initialized with sampleRate: ' + sampleRate + ', channelCount: ' + channelCount, 'info');

        // Return necessary objects for further use
        return {
            audioContext: audioContext, processorNode: processorNode, stream: stream, audioDataChunks: audioDataChunks
        };
    } catch (error) {
        logWithStyle('Failed to initialize AudioWorkletNode: ' + error, 'error');
        // Fallback to MediaRecorder
        return null
    }
}

async function initMediaRecorder(constraints) {
    try {
        let stream = await navigator.mediaDevices.getUserMedia(constraints);
        let mediaRecorder = new MediaRecorder(stream);

        logWithStyle('New MediaRecorder initialized.', 'info');
        return {mediaRecorder, stream};
    } catch (error) {
        logWithStyle('Failed to initialize MediaRecorder: ' + error, 'error');
        throw error; // Let the caller handle the error if needed
    }
}

function assignAudioChunksToHolders(base64Chunks, pagePrefix, startHolderId) {
    logWithStyle('Starting assignAudioChunksToHolders.', 'info');

    if (!base64Chunks || !Array.isArray(base64Chunks) || base64Chunks.length === 0) {
        logWithStyle('Error: Invalid base64Chunks array in assignAudioChunksToHolders.', 'error');
        return 0;
    }
    if (!pagePrefix || typeof pagePrefix !== 'string') {
        logWithStyle('Error: Missing or invalid pagePrefix in assignAudioChunksToHolders.', 'error');
        return 0;
    }
    if (!startHolderId || typeof startHolderId !== 'number') {
        logWithStyle('Error: Missing or invalid startHolderId in assignAudioChunksToHolders.', 'error');
        return 0;
    }

    let itemsAssigned = 0;
    let firstItemId = '';
    let lastItemId = '';

    for (let i = 0; i < base64Chunks.length; i++) {
        let itemId = pagePrefix + 'AUDIO_HOLDER_' + (startHolderId + i);
        let apexItem = document.getElementById(itemId);

        if (apexItem) {
            apex.item(itemId).setValue(base64Chunks[i]);
            itemsAssigned++;

            if (itemsAssigned === 1) {
                firstItemId = itemId;
            }

            lastItemId = itemId;
        }
    }

    logWithStyle(`Finished assignAudioChunksToHolders. Total items assigned: ${itemsAssigned}`, 'info');
    logWithStyle(`First item assigned: ${firstItemId}`, 'info');
    logWithStyle(`Last item assigned: ${lastItemId}`, 'info');
    return itemsAssigned;
}

function assignJsonToItems(jsonData, neededSequences) {
    console.log("Using assignJsonToItems(jsonData)");
    console.log("jsonData is the prompt coming from the db to be parsed and presented in the UI.")

    if (jsonData === undefined || jsonData === null) {
        logWithStyle('Missing parameter: jsonData', 'error');
        return;
    }

    if (neededSequences === undefined || neededSequences === null) {
        logWithStyle('Missing parameter: neededSequences', 'warn');
        logWithStyle('Needed sequences will be unknown.')
        neededSequences = 'unknown total.'
    }

    Object.keys(jsonData).forEach(function (itemId) {
        let itemValue = jsonData[itemId];
        let apexItem = document.getElementById(itemId);

        if (apexItem) {
            let regex = /Prompt (\d{1,2}) of \d{1,2}:\s*(.*?),\s*\n\nDomain:\s*(.*?),\s*Genre:\s*(.*?),\s*Emotion:\s*(.*?),\s*Intensity:\s*(.*)/;
            let match = itemValue.match(regex);

            if (match) {
                let promptNum = match[1];
                let promptText = match[2].trim();
                let domain = match[3].trim();
                let genre = match[4].trim();
                let emotion = match[5].trim();
                let intensity = match[6].trim();
                let htmlContent = `
					<div class="prompt-wrapper">
						<div class="prompt-title" style="font-size: 18px; font-weight: bold; margin-bottom: 10px;">
							Prompt ${promptNum} of ${neededSequences}:
						</div>
						<div class="prompt-text" style="font-size: 16px; font-weight: bold; color: #333; margin-bottom: 10px;">
							${promptText}
						</div>
						<div class="prompt-details" style="font-size: 14px; color: #555;">
							<span><strong>Domain:</strong> ${domain}</span><br>
							<span><strong>Genre:</strong> ${genre}</span><br>
							<span><strong>Emotion:</strong> ${emotion}</span><br>
							<span><strong>Intensity:</strong> ${intensity}</span>
						</div>
					</div>
					`;
                apexItem.innerHTML = htmlContent;
                logWithStyle("Assigned value to " + itemId + ": " + htmlContent);
            } else {
                logWithStyle("No matching data for item " + itemId, 'warn');
                apexItem.innerHTML = '<div class="no-data">No data available for this prompt.</div>';
            }
        } else {
            logWithStyle('Item ' + itemId + ' not found.', 'warn');
        }
    });
}

function audioBlobToBase64(blob, callback) {
    logWithStyle('Starting audioBlobToBase64 conversion.', 'info');

    // Check if required parameters are provided
    if (!blob) {
        logWithStyle('Error: Missing blob parameter in audioBlobToBase64.', 'error');
        return;
    }
    if (typeof callback !== 'function') {
        logWithStyle('Error: Missing or invalid callback function in audioBlobToBase64.', 'error');
        return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(blob);

    reader.onloadend = function () {
        const base64Data = reader.result.split(',')[1]; // Extract Base64 part
        callback(base64Data);
        logWithStyle('Finished audioBlobToBase64 conversion.', 'info');
    };

    reader.onerror = function (error) {
        logWithStyle('Error during audioBlobToBase64 conversion: ' + error, 'error');
    };
}

function checkAudioHolders(pagePrefix, startRange, endRange) {
    let emptyCount = 0;
    let populatedCount = 0;
    let firstPopulated = [];
    let lastPopulated = null;

    logWithStyle(`Checking audio holders from ${startRange} to ${endRange}`, 'info');

    for (let i = startRange; i <= endRange; i++) {
        let itemId = pagePrefix + 'AUDIO_HOLDER_' + i;
        let itemValue = $v(itemId);

        if (!itemValue || itemValue.trim() === '') {
            emptyCount++;
        } else {
            populatedCount++;
            if (firstPopulated.length < 3) {
                firstPopulated.push({itemId, itemValue: itemValue.substring(0, 30)});
            }
            lastPopulated = {itemId, itemValue: itemValue.substring(0, 30)};
        }
    }

    if (firstPopulated.length > 0) {
        logWithStyle('First 3 populated items:', 'info');
        firstPopulated.forEach(item => {
            logWithStyle(`Item: ${item.itemId}, Value: ${item.itemValue}`, 'info');
        });
    }

    if (lastPopulated) {
        logWithStyle('Last populated item:', 'info');
        logWithStyle(`Item: ${lastPopulated.itemId}, Value: ${lastPopulated.itemValue}`, 'info');
    }

    logWithStyle(`Total populated items: ${populatedCount}`, 'info');
    logWithStyle(`Total empty items: ${emptyCount}`, 'info');
}

function clearSequencedItems(pagePrefix, itemName, fromRange, toRange) {
    let clearedCount = 0;
    let notClearedCount = 0;

    for (let i = fromRange; i <= toRange; i++) {
        let itemId = pagePrefix + itemName + '_' + i;
        let itemElem = apex.item(itemId);

        if (itemElem) {
            itemElem.setValue('');
        }
    }

    for (let i = fromRange; i <= toRange; i++) {
        let itemId = pagePrefix + itemName + '_' + i;
        let itemElem = apex.item(itemId);

        if (itemElem && itemElem.getValue() === '') {
            clearedCount++;
        } else {
            notClearedCount++;
        }
    }

    // Log the results to the console
    if (itemName) {
        logWithStyle(`Total ${itemName} items cleared: ${clearedCount}`, 'info');
        logWithStyle(`Total ${itemName} items not cleared: ${notClearedCount}`, 'warn');
    } else {
        logWithStyle(`Total items cleared: ${clearedCount}`, 'info');
        logWithStyle(`Total items not cleared: ${notClearedCount}`, 'warn');
    }
}

function createRegionAndItems(sessionCount, mainRegion, pageNumber, stopRecorder, visibleSession) {
    logWithStyle('Starting function createRegionAndItems.', 'info');

    // Validate the parameters and log if they are missing
    if (sessionCount === undefined || sessionCount === null) {
        logWithStyle('Missing parameter: sessionCount', 'error');
        return;
    }
    if (mainRegion === undefined || mainRegion === null) {
        logWithStyle('Missing parameter: mainRegion', 'error');
        return;
    }
    if (pageNumber === undefined || pageNumber === null) {
        logWithStyle('Missing parameter: pageNumber', 'error');
        return;
    }
    if (stopRecorder === undefined || stopRecorder === null) {
        logWithStyle('Missing parameter: stopRecorder', 'error');
        return;
    }
    if (visibleSession === undefined || visibleSession === null) {
        logWithStyle('Missing parameter: visibleSession. Defaulting to session 1', 'warn');
        visibleSession = 1; // Fallback to first session if not provided
    }

    logWithStyle('Creating region and items for session ' + sessionCount);

    // Create the region container for each session
    const regionId = 'ses_rec_' + String(sessionCount).padStart(2, '0');
    const regionContainer = document.createElement('div');
    regionContainer.id = regionId;
    regionContainer.classList.add('session-region', 'carousel-item');

    // Determine which session to make visible
    if (sessionCount !== visibleSession) {
        regionContainer.style.display = 'none';  // Hide all except the visible session
    }

    // Create prompt container and prompt
    const promptContainer = document.createElement('div');
    promptContainer.classList.add('prompt-container');
    const prompt = document.createElement('div');
    prompt.id = 'P' + pageNumber + '_PROMPT_' + sessionCount;
    prompt.classList.add('prompt');
    promptContainer.appendChild(prompt);

    // Create button row with Start, Stop, and Save buttons
    const buttonContainer = document.createElement('div');
    buttonContainer.classList.add('button-row');
    const startButton = document.createElement('button');
    startButton.id = 'P' + pageNumber + '_START_RECORDING_' + sessionCount;
    startButton.innerText = 'REC';
    startButton.classList.add('btn', 'btn-start');
    const stopButton = document.createElement('button');
    stopButton.id = 'P' + pageNumber + '_STOP_RECORDING_' + sessionCount;
    stopButton.innerText = 'STOP';
    stopButton.classList.add('btn', 'btn-stop');
    stopButton.disabled = true;
    stopButton.style.backgroundColor = 'grey';
    const saveButton = document.createElement('button');
    saveButton.id = 'P' + pageNumber + '_SAVE_SESSION_RECORDING_' + sessionCount;
    saveButton.innerText = 'SAVE';
    saveButton.classList.add('btn', 'btn-save');
    saveButton.disabled = true;
    saveButton.style.backgroundColor = 'grey';
    buttonContainer.appendChild(startButton);
    buttonContainer.appendChild(stopButton);
    buttonContainer.appendChild(saveButton);

    // Create audio player container and player
    const audioPlayerContainer = document.createElement('div');
    audioPlayerContainer.classList.add('audio-player-container');
    const audioPlayer = document.createElement('audio');
    audioPlayer.id = 'P' + pageNumber + '_SESSION_AUDIO_PLAYER_' + sessionCount;
    audioPlayer.controls = true;
    audioPlayer.disabled = true;
    audioPlayer.style.opacity = '0.5';
    audioPlayerContainer.appendChild(audioPlayer);

    // Add a logging container to display messages for this session
    const loggingContainer = document.createElement('div');
    loggingContainer.id = 'P' + pageNumber + '_LOGGING_' + sessionCount;
    loggingContainer.classList.add('logging-container');
    loggingContainer.style.color = 'blue';
    loggingContainer.style.fontStyle = 'italic';
    loggingContainer.style.padding = '5px';
    regionContainer.appendChild(loggingContainer);


    // Append the elements to the region container
    regionContainer.appendChild(promptContainer);
    regionContainer.appendChild(buttonContainer);
    regionContainer.appendChild(audioPlayerContainer);
    regionContainer.appendChild(loggingContainer);

    // Append the region container to the main region
    mainRegion.appendChild(regionContainer);
    logWithStyle('Appended region container to main region for session ' + sessionCount);

    // Handle special case for the last session (stopRecorder)
    if (sessionCount === stopRecorder) {
        saveButton.innerText = 'SUBMIT';
        saveButton.addEventListener('click', function () {
            const completionMessage = document.createElement('div');
            completionMessage.innerText = 'Thank you for completing the recordings! You will be notified by email of next steps once your samples and information have been reviewed.';
            completionMessage.style.fontSize = '18px';
            completionMessage.style.color = 'green';
            mainRegion.appendChild(completionMessage);

            setTimeout(function () {
                window.close();  // Close the window after submission
            }, 7000);
        });
    }

    function logMessage(message, type = 'info') {
        const loggingElement = document.getElementById('P' + pageNumber + '_LOGGING_' + sessionCount);
        if (loggingElement) {
            loggingElement.innerText = `[${type.toUpperCase()}] ${message}`;
        }
        console[type === 'error' ? 'error' : 'log'](message);  // Fallback console logging
    }

    //logMessage(`Session ${sessionCount} region created and initialized.`); // Example usage


    logWithStyle('Finished creating region for session ' + sessionCount, 'info');
}

function downloadAudioBlob(blob, filename) {
    if (!blob) {
        logWithStyle('No blob provided for download.', 'error');
        return;
    }

    if (!filename || filename.trim() === '') {
        const defaultFilename = `audio_recording_${Date.now()}.wav`;
        logWithStyle(`Filename not provided. Defaulting to: ${defaultFilename}`, 'warn');
        filename = defaultFilename;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);

    logWithStyle(`Audio blob downloaded as ${filename}`, 'info');
}

function downloadCustomTextFile(chunks, filename = 'audio_chunks', userTracker = null, sessionCount = null) {
    let chunkCounter = 1;
    let cumulativeSize = 0;
    let fileContent = '';

    // Add user tracker and session count if provided
    if (userTracker && sessionCount) {
        filename += `_${userTracker}_rec${sessionCount}_${Date.now()}.txt`;
    } else if (userTracker || sessionCount) {
        filename += `_${userTracker || 'unknownUser'}_rec${sessionCount || 'unknownSession'}_${Date.now()}.txt`;
    } else {
        filename += `_${Date.now()}.txt`;
    }

    // Process each chunk
    chunks.forEach(chunk => {
        const chunkSize = chunk.length;
        cumulativeSize += chunkSize;

        // Preface each chunk with the necessary information
        const chunkHeader = `AUDIO_HOLDER_${chunkCounter}, length=${chunkSize}, cumulative=${cumulativeSize}\n`;
        const chunkPreview = `chunk(first 200 chars): ${chunk.slice(0, 200)}\nchunk(last 200 chars): ${chunk.slice(-200)}\n`;

        // Append chunk header and preview to the content
        fileContent += `${chunkHeader}${chunkPreview}\n`;

        // Increment the chunk counter
        chunkCounter++;
    });

    // Create a Blob with the file content
    const blob = new Blob([fileContent], {type: 'text/plain'});

    // Create a link element to trigger the download
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;

    // Append link to the document and trigger the download
    document.body.appendChild(link);
    link.click();

    // Clean up by removing the link from the document
    document.body.removeChild(link);

    console.log(`Download triggered for file: ${filename}`);
}

function enableNextSessionFromItem(sessionCount, pagePrefix, totalSessions) {
    logWithStyle('Starting enableNextSessionFromItem.', 'info');

    if (sessionCount === undefined || sessionCount === null || isNaN(parseInt(sessionCount))) {
        logWithStyle('Error: Missing or invalid sessionCount.', 'error');
        return;
    }
    if (pagePrefix === undefined || typeof pagePrefix !== 'string') {
        logWithStyle('Error: Missing or invalid pagePrefix.', 'error');
        return;
    }
    if (totalSessions === undefined || isNaN(parseInt(totalSessions)) || totalSessions <= 0) {
        logWithStyle('Error: Missing or invalid totalSessions.', 'error');
        return;
    }

    sessionCount = parseInt(sessionCount, 10);
    totalSessions = parseInt(totalSessions, 10);

    let itemsAssigned = 0;
    for (let i = 1; i <= totalSessions; i++) {
        const regionId = pagePrefix + 'ses_rec_' + String(i).padStart(2, '0');
        const region = document.getElementById(regionId);

        if (region) {
            if (i === sessionCount) {
                region.style.display = 'block';
                logWithStyle('Showing session ' + sessionCount, 'info');
            } else {
                region.style.display = 'none';
            }
            itemsAssigned++;
        } else {
            logWithStyle('Warning: Session region ' + regionId + ' not found.', 'warn');
        }
    }

    const nextSessionCount = sessionCount + 1;
    logWithStyle('Next session will be: ' + nextSessionCount, 'info');

    logWithStyle('Finished enableNextSessionFromItem. Total sessions processed: ' + itemsAssigned, 'info');
}

function enableOnlyNextSession(sessionCount, stopRecorder) {
    console.log("Using function enableOnlyNextSession(sessionCount, stopRecorder))");
    console.log("sessionCount is equivalent to the number of the current recording.")
    console.log("stopRecorder is equivalent to the number of recordings needed.")
    if (sessionCount === undefined || sessionCount === null) {
        logWithStyle('Missing parameter: sessionCount', 'error');
        return;
    }
    if (stopRecorder === undefined || stopRecorder === null) {
        logWithStyle('Missing parameter: stopRecorder', 'error');
        return;
    }
    for (let i = 1; i <= stopRecorder; i++) {
        let element_id = 'ses_rec_' + String(i).padStart(2, '0');
        const region = document.getElementById(element_id);
        if (region) {
            if (i === sessionCount) {
                region.style.display = 'block';
            } else {
                region.style.display = 'none';
            }
        } else {
            logWithStyle('Element ' + element_id + ' was not found', 'error');
        }
    }
}

function fetchPrompts(pageNumber, recordingsNeeded) {

    apex.server.process('FETCH_PROMPTS', {}, {
        success: function (data) {
            logWithStyle('Raw data: ' + JSON.stringify(data));  // Log raw data

            let parsedData;
            if (typeof data === 'object') {
                parsedData = data;
            } else {
                parsedData = JSON.parse(data);  // Parse if it's not an object
            }

            logWithStyle('Parsed data: ' + JSON.stringify(parsedData));  // Log parsed data

            let minTrxId = parsedData.min_trx_id;

            // Set minTrxId dynamically based on the page number
            let minTrxIdItem = 'P' + pageNumber + '_MIN_TRX_ID';
            $s(minTrxIdItem, minTrxId);  // Set the value in APEX
            logWithStyle(minTrxIdItem + " set to: " + minTrxId);  // Log the change

            // Set the audio box dynamically
            //let currentAudioBoxItem = 'P' + pageNumber + '_CURRENT_AUDIO_BOX';
            //$s(currentAudioBoxItem, minTrxId);  // Set the value in APEX
            //logWithStyle(currentAudioBoxItem + " set to: " + minTrxId);  // I commented this at 2024-10-26|21:01

            // Call the assignJsonToItems function, pass parsedData.prompts and recordingsNeeded
            assignJsonToItems(parsedData.prompts, recordingsNeeded);
        }, error: function (jqXHR, textStatus, errorThrown) {
            console.error('Error retrieving data:', textStatus, errorThrown);  // Keep this as error logging
        }
    });
}

function handleRecordingControlStates(startButton, stopButton, saveButton, audioPlayer, logElement, controlSetting = 'start') {
    logWithStyle('Handling recording control states...', 'info');

    if (!startButton) {
        logWithStyle('Missing parameter: startButton', 'error');
        return false;
    }
    if (!stopButton) {
        logWithStyle('Missing parameter: stopButton', 'error');
        return false;
    }
    if (!saveButton) {
        logWithStyle('Missing parameter: saveButton', 'error');
        return false;
    }
    if (!audioPlayer) {
        logWithStyle('Missing parameter: audioPlayer', 'error');
        return false;
    }

    if (!logElement) {
        logWithStyle('Missing parameter: audioPlayer', 'warn');
    }

    if (controlSetting === 'start') {
        startButton.disabled = true;
        saveButton.disabled = true;
        stopButton.style.backgroundColor = '';
        audioPlayer.disabled = true;
        audioPlayer.style.opacity = '1';
        startButton.classList.add('flashing');

        logWithStyle('Start button disabled, stop button enabled, flashing started.', 'info');

        recordingStartTime = Date.now();
        logWithStyle('Recording started at ' + new Date(recordingStartTime).toLocaleTimeString(), 'info');

        mediaPlayerTimer = setInterval(function () {
            if (logElement) {
                startTimer(logElement);
            }
            let elapsedSeconds = Math.floor((Date.now() - recordingStartTime) / 1000);
            audioPlayer.innerText = 'Recording... ' + elapsedSeconds + ' sec';
            logWithStyle('Media player updated: ' + elapsedSeconds + ' sec elapsed', 'info');
        }, 1000);

        setTimeout(function () {
            stopButton.disabled = false;
            logWithStyle('Stop button enabled after 3 seconds.', 'info');
        }, 3000);

    } else if (controlSetting === 'stop') {
        stopButton.disabled = true;
        saveButton.style.backgroundColor = '';
        audioPlayer.disabled = false;
        startButton.classList.remove('flashing');

        if (logElement) {
            stopTimer(logElement);
        }

        logWithStyle('Stop button disabled,  flashing stopped.', 'info');

        if (recordingStartTime) {
            let elapsedSeconds = Math.floor((Date.now() - recordingStartTime) / 1000);
            logWithStyle('Recording stopped after ' + elapsedSeconds + ' seconds.', 'info');
        }

        if (mediaPlayerTimer) {
            clearInterval(mediaPlayerTimer);
            logWithStyle('Media player timer cleared.', 'info');
        }

        setTimeout(function () {
            startButton.disabled = false;
            logWithStyle('Start button enabled after 3 seconds.', 'info');
        }, 2000);

        setTimeout(function () {
            saveButton.disabled = false;
            saveButton.style.backgroundColor = '';
            logWithStyle('Save button enabled after 3 seconds.', 'info');
        }, 2000);

    } else if (controlSetting === 'submit' || controlSetting === 'save') {
        startButton.disabled = false; // **Fix: Start button re-enabled after Save**
        stopButton.disabled = true;
        saveButton.disabled = true;
        audioPlayer.disabled = true;

        logWithStyle('All buttons disabled, recording process complete.', 'info');

        if (mediaPlayerTimer) {
            clearInterval(mediaPlayerTimer);
            logWithStyle('Media player timer cleared on submission.', 'info');
        }
    } else {
        logWithStyle('Invalid control setting: ' + controlSetting, 'error');
        return false;
    }

    return true;
}

function writeToLogElement(logElement, message = "") {

    if (!logElement) {
        logWithStyle('Missing parameter: startButton', 'warn');
    }

    if (logElement) {

        loggingElement.innerText = message;
    }

}

function splitBase64AudioData(base64Data, maxLength) {
    logWithStyle('Starting splitBase64AudioData.', 'info');

    // Check if parameters are provided and valid
    if (!base64Data) {
        logWithStyle('Error: Missing base64Data parameter in splitBase64AudioData.', 'error');
        return [];
    }
    if (!maxLength || typeof maxLength !== 'number') {
        logWithStyle('Error: Invalid maxLength parameter in splitBase64AudioData.', 'error');
        return [];
    }

    let chunks = [];
    for (let i = 0; i < base64Data.length; i += maxLength) {
        chunks.push(base64Data.substring(i, i + maxLength));
    }

    logWithStyle('Finished splitBase64AudioData. Total chunks created: ' + chunks.length, 'info');
    return chunks;
}

function stopMediaPlayerTimer(mediaPlayer, mediaPlayerTimer, recordingStartTime) {
    logWithStyle('Stopping media player timer...', 'info');

    if (mediaPlayer === undefined || mediaPlayer === null) {
        logWithStyle('Missing parameter: mediaPlayer', 'error');
    }
    if (mediaPlayerTimer === undefined || mediaPlayerTimer === null) {
        logWithStyle('Missing parameter: mediaPlayerTimer', 'error');
        return;
    }
    if (recordingStartTime === undefined || recordingStartTime === null) {
        logWithStyle('Missing parameter: recordingStartTime', 'error');
        return;
    }

    clearInterval(mediaPlayerTimer);  // Stop the timer

    const recordedDuration = Math.floor((Date.now() - recordingStartTime) / 1000);
    mediaPlayer.innerText = `Recording completed: ${recordedDuration} sec`;
    logWithStyle(`Recording completed. Total duration: ${recordedDuration} seconds.`, 'info');

    return mediaPlayerTimer;  // Return updated timer (should be null)
}

function updateMediaPlayerTimer(mediaPlayer, isRecording, mediaPlayerTimer, recordingStartTime) {
    logWithStyle('Updating media player timer...', 'info');

    if (mediaPlayer === undefined || mediaPlayer === null) {
        logWithStyle('Missing parameter: mediaPlayer', 'error');
    }
    if (isRecording === undefined || isRecording === null) {
        logWithStyle('Missing parameter: isRecording', 'error');
        return;
    }
    if (mediaPlayerTimer === undefined || mediaPlayerTimer === null) {
        logWithStyle('Missing parameter: mediaPlayerTimer', 'error');
        return;
    }
    if (recordingStartTime === undefined || recordingStartTime === null) {
        logWithStyle('Missing parameter: recordingStartTime', 'error');
        return;
    }

    if (isRecording) {
        recordingStartTime = Date.now(); // Start the timer
        logWithStyle('Recording started, initializing timer...', 'info');

        mediaPlayerTimer = setInterval(function () {
            const elapsedSeconds = Math.floor((Date.now() - recordingStartTime) / 1000);
            mediaPlayer.innerText = `Recording... ${elapsedSeconds} sec`;
            logWithStyle(`Media player updated: ${elapsedSeconds} sec elapsed`, 'info');
        }, 1000);  // Update every second
    } else {
        clearInterval(mediaPlayerTimer);
        logWithStyle('Recording stopped, media player timer cleared.', 'info');
    }

    return {mediaPlayerTimer, recordingStartTime};  // Return the updated values
}

function hi_from_utilities() {
    return 'Hi from Utilities';
}

