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
