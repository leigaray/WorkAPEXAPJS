// Converts an audio buffer to WAV format
function audioToWav(buffer, audioSampleRate) {
    const totalLength = buffer.reduce((sum, chunk) => sum + chunk.length, 0);
    const wavData = new Float32Array(totalLength);
    let offset = 0;

    buffer.forEach(chunk => {
        wavData.set(chunk, offset);
        offset += chunk.length;
    });

    return float32ToWav(wavData, audioSampleRate);
}

// Converts Float32 audio samples to WAV format
function float32ToWav(buffer, audioSampleRate) {
    const numChannels = 1;
    const sampleRate = audioSampleRate;
    const bytesPerSample = 4;
    const length = buffer.length * bytesPerSample + 44;

    const bufferArray = new ArrayBuffer(length);
    const view = new DataView(bufferArray);

    writeString(view, 0, 'RIFF');
    view.setUint32(4, length - 8, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 3, true); 
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
    view.setUint16(32, numChannels * bytesPerSample, true);
    view.setUint16(34, 32, true);
    writeString(view, 36, 'data');
    view.setUint32(40, buffer.length * bytesPerSample, true);

    writeFloat32Samples(view, 44, buffer);

    return new Blob([bufferArray], { type: 'audio/wav' });
}

// Writes a string into a DataView at the specified offset
function writeString(view, offset, str) {
    for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
    }
}

// Writes 32-bit float samples into a DataView
function writeFloat32Samples(output, offset, input) {
    for (let i = 0; i < input.length; i++, offset += 4) {
        output.setFloat32(offset, input[i], true);
    }
}

// Creates and downloads an audio file from a Blob
function downloadAudioBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
}

// Creates and downloads a text file with the given content
function downloadTextFile(filename, content) {
    const blob = new Blob([content], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Toggles the flashing effect on the recording button
function toggleRecButtonFlashing(startButton, isRecording) {
    if (isRecording) {
        startButton.classList.add('flashing');
    } else {
        startButton.classList.remove('flashing');
    }
}

// Writes 32-bit float samples into a DataView
function writeFloat32Samples(output, offset, input) {
    for (let i = 0; i < input.length; i++, offset += 4) {
        output.setFloat32(offset, input[i], true);
    }
}

function //logWithStyle(message, level = 'info') {
    let style = 'font-weight: bold;'; // Common style

    switch (level) {
        case 'info':
            style += 'color: #90ee90'; // Light green for info
            console.log(`%c${message}`, style);
            break;
        case 'warn':
            style += 'color: yellow'; // Yellow for warnings
            console.warn(`%c${message}`, style);
            break;
        case 'error':
            style += 'color: red'; // Red for errors
            console.error(`%c${message}`, style);
            break;
        case 'undefined':
            style += 'color: orange'; // Orange for undefined
            console.warn(`%c${message}`, style);
            break;
        default:
            console.log(`%c${message}`, style);
    }
}
function stopStream(stream) {
    if (stream) {
        const tracks = stream.getTracks();
        tracks.forEach(track => track.stop());
        //logWithStyle('All stream tracks stopped.', 'info');
    }
}
function resetAudioPlayer(audioPlayer) {
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
    audioPlayer.src = '';
    //logWithStyle('Audio player reset.', 'info');
}
function assignJsonToItems(jsonData) {
        Object.keys(jsonData).forEach(function(itemId) {
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
                    let htmlContent =
                        `
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
                        `
                    ;
                    apexItem.innerHTML = htmlContent;
                    console.log("Assigned value to " + itemId + ": " + htmlContent);
                } else {
                    console.warn("No matching data for item " + itemId);
                    apexItem.innerHTML = '<div class="no-data">No data available for this prompt.</div>';
                }
            } else {
                console.warn('Item ' + itemId + ' not found.');
            }
        });
}


