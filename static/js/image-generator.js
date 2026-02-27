/**
 * Screen Sage - Image Generator JavaScript
 */

document.addEventListener('DOMContentLoaded', function () {
    const imageGenForm = document.getElementById('image-gen-form');
    const generationStatus = document.getElementById('generation-status');
    const generationError = document.getElementById('generation-error');
    const imageResult = document.getElementById('image-result');
    const imageActions = document.getElementById('image-actions');
    const btnDisplayImage = document.getElementById('btn-display-image');
    const btnCopyImage = document.getElementById('btn-copy-path-image');
    const imageHistory = document.getElementById('image-history');
    const apiKeyInput = document.getElementById('api-key');
    const apiEndpointInput = document.getElementById('api-endpoint');
    const btnCheckCredits = document.getElementById('check-credits');
    const creditsInfo = document.getElementById('credits-info');

    // Current generated image info
    let currentImageUrl = '';
    let currentImagePath = '';



    // Load saved settings
    loadSavedSettings();

    // Load recent images
    loadRecentImages();

    // Handle form submission
    imageGenForm.addEventListener('submit', function (e) {
        e.preventDefault();
        generateImage();
    });

    // Handle check credits button
    btnCheckCredits.addEventListener('click', function () {
        checkCredits();
    });

    // Handle check credits button
    btnDisplayImage.addEventListener('click', function () {
        displayToDisplay(currentImagePath);
    });

    btnCopyImage.addEventListener('click', function () {
        copyMediaPath(currentImagePath);
    });

    function copyMediaPath(currentMediaPath) {
        if (!currentMediaPath) {
            return;
        }

        // Create temporary input element to copy to clipboard
        const tempInput = document.createElement('input');
        tempInput.value = currentMediaPath;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
    }

    /**
     * Load saved settings from localStorage
     */
    function loadSavedSettings() {
        // Load API key if saved
        const savedApiKey = localStorage.getItem('image_gen_api_key');
        if (savedApiKey) {
            apiKeyInput.value = savedApiKey;
        }

        // Load API endpoint if saved
        const savedEndpoint = localStorage.getItem('image_gen_endpoint');
        if (savedEndpoint) {
            apiEndpointInput.value = savedEndpoint;
        }

        // Load output format if saved
        const savedFormat = localStorage.getItem('image_gen_output_format');
        if (savedFormat) {
            document.getElementById('output-format').value = savedFormat;
        }
    }

    /**
     * Save settings to localStorage
     */
    function saveSettings() {
        // Always save the API key
        localStorage.setItem('image_gen_api_key', apiKeyInput.value);

        // Always save the endpoint
        localStorage.setItem('image_gen_endpoint', apiEndpointInput.value);

        // Save output format
        localStorage.setItem('image_gen_output_format', document.getElementById('output-format').value);
    }

    /**
     * Check remaining credits with the Stability AI API
     */
    async function checkCredits() {
        const apiKey = apiKeyInput.value.trim();

        // Validate API key
        if (!apiKey) {
            showError(generationError, "API Key is required to check credits");
            return;
        }

        // Show loading status
        creditsInfo.textContent = "Checking credits...";
        creditsInfo.style.display = 'block';

        try {
            // Send request to check credits
            const response = await fetch('/api/image-gen/check-credits', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    api_key: apiKey
                })
            });

            const result = await response.json();

            if (result.success) {
                // Display credit information
                creditsInfo.innerHTML = `
                    <strong>Credits:</strong> $${result.credits.toFixed(2)} available<br>
                    <small>Last checked: ${new Date().toLocaleTimeString()}</small>
                `;
                creditsInfo.className = "alert alert-success mt-2";
            } else {
                // Show error
                creditsInfo.textContent = `Failed to check credits: ${result.message}`;
                creditsInfo.className = "alert alert-danger mt-2";
            }
        } catch (error) {
            console.error('Error checking credits:', error);
            creditsInfo.textContent = `Error: ${error.message}`;
            creditsInfo.className = "alert alert-danger mt-2";
        }
    }

    /**
     * Generate an image using the provided form data
     */
    async function generateImage() {
        // Get form data
        const apiKey = apiKeyInput.value.trim();
        const endpoint = apiEndpointInput.value.trim();
        const prompt = document.getElementById('prompt').value.trim();
        const outputFormat = document.getElementById('output-format').value;

        // Validate required fields
        if (!apiKey) {
            showError(generationError, "API Key is required");
            return;
        }

        if (!endpoint) {
            showError(generationError, "API Endpoint is required");
            return;
        }

        if (!prompt) {
            showError(generationError, "Prompt is required");
            return;
        }

        // Save settings automatically
        saveSettings();

        // Show loading status
        showStatus(generationStatus, "Generating image... This may take a moment.");

        // Hide error if visible
        generationError.style.display = 'none';

        // Prepare request payload
        const requestData = {
            api_key: apiKey,
            endpoint: endpoint,
            prompt: prompt,
            output_format: outputFormat,
            advanced_payload: null,
            advanced_headers: null
        };

        try {
            // Send request to server
            const response = await fetch('/api/image-gen/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData)
            });

            const result = await response.json();

            if (result.success) {
                // Update UI with generated image
                currentImageUrl = result.image_url;
                currentImagePath = result.image_path;

                // Display the image
                imageResult.innerHTML = `
                    <img src="${result.image_url}" alt="Generated image" class="img-fluid" />
                `;

                // Show image actions and set path
                imageActions.style.display = 'block';
                // imagePath.value = result.image_path;

                // Hide status
                generationStatus.style.display = 'none';

                // Refresh recent images
                loadRecentImages();
            } else {
                // Show error
                showError(generationError, `Generation failed: ${result.message}`);
                generationStatus.style.display = 'none';
            }
        } catch (error) {
            console.error('Error generating image:', error);
            showError(generationError, `Error: ${error.message}`);
            generationStatus.style.display = 'none';
        }
    }

    /**
     * Load recently generated images
     */
    async function loadRecentImages() {
        try {
            const response = await fetch('/api/image-gen/list');
            const data = await response.json();

            if (data.images && data.images.length > 0) {
                // Clear current images
                imageHistory.innerHTML = '';

                // Add each image
                data.images.forEach(image => {
                    const col = document.createElement('div');
                    col.className = 'col-md-3 mb-4';

                    col.innerHTML = `
                        <div class="card">
                            <img src="${image.url}" class="card-img-top" alt="${image.name}">
                            <div class="card-body">
                                <h5 class="card-title" style="font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${image.name}</h5>
                                <button class="btn btn-sm btn-primary use-image" data-path="${image.path}" data-url="${image.url}">Use This</button>
                            </div>
                        </div>
                    `;

                    imageHistory.appendChild(col);
                });

                // Add event listeners to "Use This" buttons
                document.querySelectorAll('.use-image').forEach(button => {
                    button.addEventListener('click', function () {
                        const imagePath = this.getAttribute('data-path');
                        const imageUrl = this.getAttribute('data-url');

                        // Set as current image
                        currentImagePath = imagePath;
                        currentImageUrl = imageUrl;

                        // Update UI
                        imageResult.innerHTML = `
                            <img src="${imageUrl}" alt="Selected image" class="img-fluid" />
                        `;

                        // Show image actions and set path
                        imageActions.style.display = 'block';
                        imagePath.value = imagePath;
                    });
                });
            } else {
                imageHistory.innerHTML = '<p class="secondary-text">No images generated yet</p>';
            }
        } catch (error) {
            console.error('Error loading recent images:', error);
            imageHistory.innerHTML = `<p class="error">Error loading images: ${error.message}</p>`;
        }
    }

    /**
     * Show a status message
     * @param {HTMLElement} element - The element to show the status in
     * @param {string} message - The status message
     */
    function showStatus(element, message) {
        element.textContent = message;
        element.className = "alert alert-info mt-3";
        element.style.display = 'block';
    }

    /**
     * Show an error message
     * @param {HTMLElement} element - The element to show the error in
     * @param {string} message - The error message
     */
    function showError(element, message) {
        element.textContent = message;
        element.style.display = 'block';

        // Hide the error after 5 seconds
        setTimeout(() => {
            element.style.display = 'none';
        }, 5000);
    }

    async function displayToDisplay(path) {
        console.log(path);

        const safeCommand = `jq --arg newSrc ${JSON.stringify(path)} '.background.src = $newSrc' ./storage/scrying_glasses/display.json > tmp.json && mv tmp.json ./storage/scrying_glasses/`;

        fetch(`/run/command`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                command: "bash",
                args: ["-c", safeCommand]
            })
        })
            .then(response => response.json())
            .then(output => {
                if (output.success) {
                    console.log(output.stdout);
                } else {
                    console.error(output.stderr);
                }
            })
            .catch(error => {
                console.error('Error updating JSON file:', error);
            });
    }
});