// Initializes AudioWorklet with given parameters
async function initAudioWorklet(sampleRate, channelCount, audioProcessorJSFile) {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)({sampleRate});
        await audioContext.audioWorklet.addModule(audioProcessorJSFile);

        const processorNode = new AudioWorkletNode(audioContext, 'audio-processor');
        const audioDataChunks = [];

        processorNode.port.onmessage = (event) => {
            const chunk = event.data instanceof Float32Array ? event.data : new Float32Array(event.data);
            audioDataChunks.push(chunk);
            logWithStyle(`Received audio chunk, size: ${chunk.length}`, 'info');
        };

        const stream = await navigator.mediaDevices.getUserMedia({audio: {channelCount}});
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(processorNode);
        processorNode.connect(audioContext.destination);

        logWithStyle(`AudioWorklet initialized with sampleRate: ${sampleRate}, channelCount: ${channelCount}`, 'info');

        return { audioContext, processorNode, stream, audioDataChunks };
    } catch (error) {
        logWithStyle(`Failed to initialize AudioWorkletNode: ${error}`, 'error');
        return null;
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

// Converts an audio Blob to Base64 and executes a callback with the result
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
