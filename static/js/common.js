/**
 * Screen Sage - Common JavaScript Functions
 */
//Skibibi
/**
 * Execute a command and display the result
 * @param {string} commandId - The ID of the command to execute
 */
async function executeCommand(commandId) {
    const resultElement = document.getElementById(`result-${commandId}`);
    let output = '';
        fetch(`/commands/${commandId}`, {
            method: 'POST'
        }).then(response => response.json())
        .then(result => {
            if (result.success) {
                // If there's any output, display it
                if (result.stdout) {
                    console.log("Command output:", result.stdout);
                }
                resultElement.style.display = 'block';
                output += `Success! Exit code: ${result.exit_code ?? 0}\n\n`;
                output += `Output:\n${result.stdout}\n`;
                resultElement.textContent = output;
            } else {
                resultElement.style.display = 'block';
                console.error("Error runningcommand:", result.stderr);
                output += `Failed! Exit code: ${result.exit_code ?? 'Unknown'}\n\n`;
                output += `Errors:\n${result.stderr}`;
                resultElement.textContent = output;
            }
        })
        .catch(error => {
            console.error("Failed to execute  command:", error);
        });
}

/**
 * Show an error message with a timeout
 * @param {HTMLElement} element - The element to display the error in
 * @param {string} message - The error message to display
 * @param {number} timeout - The timeout in milliseconds before hiding the error
 */
function showError(element, message, timeout = 5000) {
    element.textContent = message;
    element.style.display = 'block';
    setTimeout(() => {
        element.style.display = 'none';
    }, timeout);
}