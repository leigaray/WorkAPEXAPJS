class AudioProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [];
    }

    constructor() {
        super();
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input.length > 0) {
            const channelData = input[0];
            this.port.postMessage(new Float32Array(channelData));
        }
        return true;
    }
}

registerProcessor('audio-processor', AudioProcessor);
