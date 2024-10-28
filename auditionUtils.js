var mediaPlayerTimer = null;

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

// Handle Recording Control States Function
function handleRecordingControlStates(startButton, stopButton, saveButton, audioPlayer, loggingElement, controlSetting, timerData) {
    logWithStyle('Handling recording control states...', 'info');

    if (!startButton) {
        logWithStyle('Missing required element: startButton', 'error');
        return null;
    }
    if (!stopButton) {
        logWithStyle('Missing required element: stopButton', 'error');
        return null;
    }
    if (!saveButton) {
        logWithStyle('Missing required element: saveButton', 'error');
        return null;
    }
    if (!audioPlayer) {
        logWithStyle('Missing required element: audioPlayer', 'error');
        return null;
    }
    if (!loggingElement) {
        logWithStyle('Missing required element: loggingElement', 'warn');
    }

    if (controlSetting === 'start') {
        startButton.disabled = true;
        saveButton.disabled = true;
        stopButton.disabled = false;
        stopButton.style.backgroundColor = '';
        audioPlayer.disabled = true;
        startButton.classList.add('flashing');

        logWithStyle('Start button disabled, stop button enabled, flashing started.', 'info');

        // Start the timer and return its values
        const timerData = startTimer(loggingElement);

        setTimeout(function () {
            stopButton.disabled = false;
            logWithStyle('Stop button enabled after 3 seconds.', 'info');
        }, 3000);

        return timerData;

    } else if (controlSetting === 'stop') {
        stopButton.disabled = true;
        saveButton.disabled = false;
        saveButton.style.backgroundColor = '';
        audioPlayer.disabled = false;
        startButton.classList.remove('flashing');

        if (loggingElement) {
            loggingElement.style.display = 'block';
            loggingElement.innerText = "Saving your audio...";
        }

        // Stop the timer if loggingElement is provided
        if (timerData) {
            stopTimer(loggingElement, timerData.startTime, timerData.intervalId);
        }

        logWithStyle('Stop button disabled, flashing stopped.', 'info');

        setTimeout(function () {
            startButton.disabled = false;
            logWithStyle('Start button enabled after 2 seconds.', 'info');
        }, 2000);

        setTimeout(function () {
            saveButton.disabled = false;
            logWithStyle('Save button enabled after 2 seconds.', 'info');
        }, 2000);
    } else if (controlSetting === 'submit' || controlSetting === 'save') {
        startButton.disabled = false;
        stopButton.disabled = true;
        saveButton.disabled = true;
        audioPlayer.disabled = true;

        if (loggingElement) {
            loggingElement.style.display = 'block';
            loggingElement.innerText = "Saving your audio...";
            //loggingElement.classList.add('flashing'); // Apply the flashing effect
        }

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

// Create Regions and Control Items
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

// Timer Functions
function startTimer(loggingElement) {
    const startTime = Date.now();
    const intervalId = setInterval(() => {
        const elapsedTime = Date.now() - startTime;
        const minutes = Math.floor(elapsedTime / 60000);
        const seconds = Math.floor((elapsedTime % 60000) / 1000);
        const milliseconds = Math.floor((elapsedTime % 1000) / 10);
        loggingElement.innerText = `Recording... Time: ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(milliseconds).padStart(2, '0')}`;
    }, 100);
    return {startTime, intervalId};
}

function stopTimer(loggingElement, startTime, intervalId) {
    clearInterval(intervalId);
    const elapsedTime = Date.now() - startTime;
    const minutes = Math.floor(elapsedTime / 60000);
    const seconds = Math.floor((elapsedTime % 60000) / 1000);
    const milliseconds = Math.floor((elapsedTime % 1000) / 10);
    loggingElement.innerText = `Recording stopped. Total time: ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
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
