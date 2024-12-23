// Initializes AudioWorklet with given parameters
async function initAudioWorklet(sampleRate, channelCount, audioProcessorJSFile) {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)({sampleRate});
        console.log("Sample rate in Audio Context:", audioContext.sampleRate);
        console.log("Channel Count:", channelCount);
        await audioContext.audioWorklet.addModule(audioProcessorJSFile);

        const processorNode = new AudioWorkletNode(audioContext, 'audio-processor');
        const audioDataChunks = [];

        processorNode.port.onmessage = (event) => {
            const chunk = event.data instanceof Float32Array ? event.data : new Float32Array(event.data);
            audioDataChunks.push(chunk);
            logWithStyle(`Received audio chunk, size: ${chunk.length}`, 'info');
        };

        const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount } });
        const tracks = stream.getAudioTracks();
        const settings = tracks[0].getSettings();

        // Check sample rate and alert if below 48000
        if (settings.sampleRate < 48000) {
            alert('Detected low-resolution audio. If you are using a Bluetooth headset, please switch to a wired setup.');

            // Stop the stream and disconnect the processor node
            processorNode.disconnect();
            stream.getTracks().forEach(track => track.stop());

            return false; // Return false to indicate recording should not proceed
        }

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(processorNode);
        processorNode.connect(audioContext.destination);

        logWithStyle(`AudioWorklet initialized with sampleRate: ${sampleRate}, channelCount: ${channelCount}`, 'trace');

        return { audioContext, processorNode, stream, audioDataChunks, proceed: true }; // Return true to proceed with recording
    } catch (error) {
        logWithStyle(`Failed to initialize AudioWorkletNode: ${error}`, 'error');
        return false; // Return false on error
    }
}


// Initializes MediaRecorder with given audio constraints
async function initMediaRecorder(constraints) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        const mediaRecorder = new MediaRecorder(stream);
        logWithStyle('New MediaRecorder initialized.', 'info');
        return { mediaRecorder, stream };
    } catch (error) {
        logWithStyle(`Failed to initialize MediaRecorder: ${error}`, 'error');
        throw error;
    }
}

async function checkMicrophoneQuality() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === 'audioinput');

        if (audioInputs.length === 0) {
            alert("No audio input devices found. Please connect a microphone.");
            return false;
        }

        console.log("Available audio input devices:");
        let highestQualityDevice = null;
        let highestSampleRate = 0;
        let defaultDeviceSampleRate = 0;
        let defaultDeviceId = audioInputs[0].deviceId;
        let defaultDeviceLabel = audioInputs[0].label; // store default device name for later use

        for (const device of audioInputs) {
            console.log(`Checking device: ${device.label} (ID: ${device.deviceId})`);

            const testStream = await navigator.mediaDevices.getUserMedia({
                audio: { deviceId: device.deviceId }
            });
            const testAudioContext = new (window.AudioContext || window.webkitAudioContext)();
            const sampleRate = testAudioContext.sampleRate;
            console.log(`Sample rate for ${device.label}: ${sampleRate} Hz`);

            if (sampleRate > highestSampleRate) {
                highestSampleRate = sampleRate;
                highestQualityDevice = device;
            }

            if (device.deviceId === defaultDeviceId) {
                defaultDeviceSampleRate = sampleRate;

                if (sampleRate >= 48000) {
                    console.log(`Default microphone "${device.label}" meets the quality standard of 48,000 Hz or higher.`);
                    testStream.getTracks().forEach(track => track.stop());
                    testAudioContext.close();
                    return true;
                }
            }

            testStream.getTracks().forEach(track => track.stop());
            testAudioContext.close();
        }

        if (highestSampleRate >= 48000) {
            alert(`Your default microphone "${defaultDeviceLabel}" (ID: ${defaultDeviceId}) does not meet the 48,000 Hz quality criteria. Consider switching to "${highestQualityDevice.label}" with a sample rate of ${highestSampleRate} Hz.`);
            return false;
        } else {
            alert(`No audio devices found with a sample rate of 48,000 Hz or higher. Default microphone "${defaultDeviceLabel}" (ID: ${defaultDeviceId}) has a sample rate of ${defaultDeviceSampleRate} Hz.`);
            return false;
        }

    } catch (error) {
        alert("Microphone access failed or is not available. Please ensure a working microphone is connected.");
        console.error("Microphone quality check failed:", error);
        return false;
    }
}

function audioBlobToBase64(blob, callback) {
    if (!blob || typeof callback !== 'function') {
        logWithStyle('Error: Invalid parameters for audioBlobToBase64.', 'error');
        return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = () => callback(reader.result.split(',')[1]);
    reader.onerror = (error) => logWithStyle(`Error during audioBlobToBase64 conversion: ${error}`, 'error');
}

// Converts an array of audio buffers to WAV format
function audioToWav(buffer, sampleRate) {
    const totalLength = buffer.reduce((sum, chunk) => sum + chunk.length, 0);
    const wavData = new Float32Array(totalLength);
    let offset = 0;

    buffer.forEach(chunk => {
        wavData.set(chunk, offset);
        offset += chunk.length;
    });

    return float32ToWav(wavData, sampleRate);
}

// Converts Float32 audio samples to WAV format
function float32ToWav(buffer, sampleRate) {
    const numChannels = 1;
    const bytesPerSample = 4;
    const length = buffer.length * bytesPerSample + 44;

    const bufferArray = new ArrayBuffer(length);
    const view = new DataView(bufferArray);

    writeString(view, 0, 'RIFF');
    view.setUint32(4, length - 8, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 3, true); // Format 3: IEEE float
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

// Writes a string into a DataView at a specified offset
function writeString(view, offset, str) {
    for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
    }
}

// Writes 32-bit float samples into a DataView
function writeFloat32Samples(view, offset, samples) {
    for (let i = 0; i < samples.length; i++, offset += 4) {
        view.setFloat32(offset, samples[i], true);
    }
}

// Splits a Base64 audio string into chunks of a specified maximum length
function splitBase64AudioData(base64Data, maxLength) {
    if (!base64Data || typeof maxLength !== 'number') {
        logWithStyle('Error: Invalid parameters for splitBase64AudioData.', 'error');
        return [];
    }

    const chunks = [];
    for (let i = 0; i < base64Data.length; i += maxLength) {
        chunks.push(base64Data.substring(i, i + maxLength));
    }

    logWithStyle(`splitBase64AudioData complete. Total chunks: ${chunks.length}`, 'info');
    return chunks;
}

//_UNSORTED_____________
// Draw the waveform on the canvas
function drawWaveform(animationFrameIdRef, analyser, dataArray, canvasContext, canvas, color = 'green') {
    const animate = () => {
        animationFrameIdRef.current = requestAnimationFrame(animate);
        analyser.getByteTimeDomainData(dataArray);

        canvasContext.clearRect(0, 0, canvas.width, canvas.height);
        canvasContext.lineWidth = 4;
        canvasContext.strokeStyle = color;
        canvasContext.beginPath();

        const sliceWidth = canvas.width / dataArray.length;
        let x = 0;

        for (let i = 0; i < dataArray.length; i++) {
            const v = dataArray[i] / 128.0;
            const y = (v * canvas.height) / 2 * 1.5;

            if (i === 0) {
                canvasContext.moveTo(x, y);
            } else {
                canvasContext.lineTo(x, y);
            }

            x += sliceWidth;
        }

        canvasContext.lineTo(canvas.width, canvas.height / 2);
        canvasContext.stroke();
    };

    animate();
}

// Utility function to clear waveform from a canvas
function clearWaveform(canvasContext, canvas, color = 'green') {
    canvasContext.clearRect(0, 0, canvas.width, canvas.height);
    canvasContext.lineWidth = 4;
    canvasContext.strokeStyle = color;
    canvasContext.beginPath();
    canvasContext.moveTo(0, canvas.height / 2);
    canvasContext.lineTo(canvas.width, canvas.height / 2);
    canvasContext.stroke();
}

// Start recording waveform visualization
function startRecordingWaveform(analyser, dataArray, canvasContext, canvas, animationFrameIdRef) {
    drawWaveform(animationFrameIdRef, analyser, dataArray, canvasContext, canvas, 'green');
}

// Start playback waveform visualization
function startPlaybackWaveform(playbackAnalyser, playbackDataArray, playbackCanvasContext, playbackCanvas, playbackAnimationFrameIdRef) {
    drawWaveform(playbackAnimationFrameIdRef, playbackAnalyser, playbackDataArray, playbackCanvasContext, playbackCanvas, 'blue');
}

// Clear recording waveform
function clearRecordingWaveform(canvasContext, canvas) {
    clearWaveform(canvasContext, canvas, 'green');
}

// Clear playback waveform
function clearPlaybackWaveform(playbackCanvasContext, playbackCanvas) {
    clearWaveform(playbackCanvasContext, playbackCanvas, 'blue');
}

// Helper to create a new canvas element
function createCanvas(audioPlayer, canvasId, display = 'block') {
    const canvas = document.createElement("canvas");
    canvas.id = canvasId;
    canvas.width = audioPlayer.clientWidth;
    canvas.height = 100;
    canvas.style.display = display;
    audioPlayer.parentElement.insertBefore(canvas, audioPlayer);
    return canvas;
}

// Stop the audio stream
function stopStream(stream) {
    const tracks = stream.getTracks();
    tracks.forEach(track => track.stop());
    logWithStyle('Audio stream stopped.', 'info');
}

// Cancel the animation frame
function cancelAnimation(animationFrameId) {
    if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
    }
}

// Handle errors during recording
function handleRecordingError(startButton, stopButton, saveButton, audioPlayer, loggingElement, message = 'Recording aborted due to low sample rate.') {
    logWithStyle(message, 'error');
    alert('Recording cannot proceed due to insufficient audio quality. Please use a wired setup.');
    handleRecordingControlStates(startButton, stopButton, saveButton, audioPlayer, loggingElement, 'stop');
    startButton.disabled = true;
    saveButton.disabled = true;
}

// Setup playback visualization
function setupPlayback(audioPlayer, playbackCanvas, canvas, wavBlob, playbackContext, playbackAnalyser, playbackDataArray, playbackCanvasContext, playbackAnimationFrameId) {
    audioPlayer.onplay = async function() {
        playbackCanvas.style.display = 'block';
        canvas.style.display = 'none';

        if (!playbackContext) {
            playbackContext = new AudioContext();
            playbackAnalyser = playbackContext.createAnalyser();
            playbackAnalyser.fftSize = 2048;
            playbackDataArray = new Uint8Array(playbackAnalyser.frequencyBinCount);
        }

        const arrayBuffer = await wavBlob.arrayBuffer();
        const audioBuffer = await playbackContext.decodeAudioData(arrayBuffer);

        const playbackSource = playbackContext.createBufferSource();
        playbackSource.buffer = audioBuffer;
        playbackSource.connect(playbackAnalyser);
        playbackAnalyser.connect(playbackContext.destination);
        playbackSource.start();

        startPlaybackWaveform(playbackAnalyser, playbackDataArray, playbackCanvasContext, playbackCanvas, playbackAnimationFrameId);

        playbackSource.onended = () => cancelAnimation(playbackAnimationFrameId);
    };

    audioPlayer.onpause = function() {
        cancelAnimation(playbackAnimationFrameId);
        clearPlaybackWaveform(playbackCanvasContext, playbackCanvas);
    };
}
