// general -------------------------------------------------------------------------------------------------------------

// Logging -------------------------------------------------------------------------------------------------------------

function logWithStyle(message, level = 'info', filterLevel = 'error-trace') {
    let style = 'font-weight: bold;';

    if (filterLevel === 'error-trace' && level !== 'error' && level !== 'trace') {
        return; // Exit if the log level isn't error or trace
    }

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
        case 'trace':
            style += 'color: cyan';
            console.trace('%c FGVD - ' + message, style);
            break;
        default:
            console.log('%c FGVD - ' + message, style);
    }
}

function logElementValue(elementId) {
    const element = getElement(elementId);
    if (element) {
        const value = element.val();
        if (value === undefined || value === null || value === '') {
            logWithStyle(elementId + ': NONE', 'warn');
        } else {
            logWithStyle(elementId + ': ' + value);
        }
    } else {
        logWithStyle(elementId + ' not found.', 'warn');
    }
}

function writeToLogElement(logElement, message = "") {
    if (!logElement) {
        logWithStyle('Missing parameter: logElement', 'warn');
        return;
    }
    logElement.innerText = message;
}

// Element Handling ----------------------------------------------------------------------------------------------------

function getElementById(pagePrefix, itemName) {
    return $('#' + pagePrefix + itemName);
}

function getElementValue(pagePrefix, itemName) {
    return $v(pagePrefix + itemName);
}

function buildElementId(pagePrefix, itemName) {
    return pagePrefix + itemName;
}

// select-list ---------------------------------------------------------------------------------------------------------
function setupConditionalDisplay(selectList, target, targetLabel = null, showValue = 'Yes') {
    if (selectList && selectList.tagName === 'SELECT' && target) {
        const updateDisplay = () => {
            const selectedValue = selectList.value;
            const displayValue = selectedValue === showValue ? '' : 'none';
            target.style.display = displayValue;
            if (targetLabel) targetLabel.style.display = displayValue;
            logWithStyle(`Set display for ${target.id} to ${displayValue}.`, 'trace');
        };

        updateDisplay(); // Initial display setup
        selectList.addEventListener('change', updateDisplay); // Add event listener for future changes
    } else {
        logWithStyle(`Could not find select list or target elements.`, 'warn');
    }
}

function setupConditionalDisplayById(selectListId, targetId, targetLabelId = null, showValue = 'Yes') {
    const selectList = document.getElementById(selectListId);
    const target = document.getElementById(targetId);
    const targetLabel = targetLabelId ? document.getElementById(targetLabelId) : null;
    setupConditionalDisplay(selectList, target, targetLabel, showValue);
}

// checkboxes ----------------------------------------------------------------------------------------------------------
function setupExclusiveCheckboxBehavior(noExperienceCheckbox, otherOptionsCheckboxes, showValueCheckbox, target, targetLabel) {
    const handleDisplay = () => {
        const displayValue = showValueCheckbox.is(':checked') ? 'show' : 'hide';
        if (target) $(target)[displayValue]();
        if (targetLabel) $(targetLabel)[displayValue]();
    };

    // Setup event listeners for exclusive checkbox behavior
    noExperienceCheckbox.change(function () {
        if (this.checked) {
            otherOptionsCheckboxes.prop('checked', false);
        }
        handleDisplay();
    });

    otherOptionsCheckboxes.change(function () {
        if (this.checked) {
            noExperienceCheckbox.prop('checked', false);
        }
        handleDisplay();
    });

    showValueCheckbox.change(handleDisplay);
    handleDisplay(); // Initial setup based on the current checkbox state
}

function setupExclusiveCheckboxById(noExperienceValue, allOptionsName, showValue, targetId, targetLabelId) {
    const noExperienceCheckbox = $(`input:checkbox[value="${noExperienceValue}"]`);
    const otherOptionsCheckboxes = $(`input:checkbox[name="${allOptionsName}"]`).not(noExperienceCheckbox);
    const showValueCheckbox = $(`input:checkbox[value="${showValue}"]`);
    const target = targetId ? `#${targetId}` : null;
    const targetLabel = targetLabelId ? `#${targetLabelId}` : null;
    setupExclusiveCheckboxBehavior(noExperienceCheckbox, otherOptionsCheckboxes, showValueCheckbox, target, targetLabel);
}

function setupExclusiveCheckboxByElement(noExperienceCheckbox, otherOptionsCheckboxes, showValueCheckbox, target, targetLabel) {
    setupExclusiveCheckboxBehavior(noExperienceCheckbox, otherOptionsCheckboxes, showValueCheckbox, target, targetLabel);
}
