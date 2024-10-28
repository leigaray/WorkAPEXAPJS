function downloadTextFile(filename, content) {
    const blob = new Blob([content], {type: 'text/plain'});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
