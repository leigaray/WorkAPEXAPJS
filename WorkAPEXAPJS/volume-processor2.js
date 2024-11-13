// volume-processor.js
class VolumeProcessor extends AudioWorkletProcessor {
    process(inputs) {
        const input = inputs[0];
        if (input && input.length > 0) {
            const channelData = input[0];

            // Calculate RMS for volume level
            const rms = Math.sqrt(channelData.reduce((acc, val) => acc + val ** 2, 0) / channelData.length);
            const volumePercentage = Math.min(1, rms) * 100;

            // Send volume level for visualization
            this.port.postMessage({ volume: volumePercentage });
        }
        return true;
    }
}

registerProcessor('volume-processor', VolumeProcessor);
