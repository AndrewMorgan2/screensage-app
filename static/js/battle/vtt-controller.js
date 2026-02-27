window.VTTController = (function () {
    class VTTController {
        constructor(battleController) {
            this.battleController = battleController;
            // Default character limit for initiative order text
            this.characterLimit = 70;
            // Global JSON file reference
            this.jsonFile = "display.json";
        }

        // Update the turn indicator in vtt
        updateTurnIndicator(turnNumber) {
            const turnText = `Turn: ${turnNumber}`;
            
            // Update the turn text element
            const updateCommand = `jq --arg turnText "${turnText}" '(.elements[] | select(.id == "turn_display") | .text) = $turnText' ./storage/scrying_glasses/${this.jsonFile} > tmp.json && mv tmp.json ./storage/scrying_glasses/${this.jsonFile}`;
            
            fetch(`/run/command`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    command: "bash",
                    args: ["-c", updateCommand]
                })
            })
            .then(response => response.text())
            .then(result => {
                console.log('Turn indicator update result:', result);
            })
            .catch(error => {
                console.error('Error updating turn indicator:', error);
            });
        }

        // Update the initiative order text in VTT (updates the title text)
        updateInitiativeOrder(combatants, activeIndex, turnNumber) {
            // Create text showing the next few combatants
            let orderText = this.formatInitiativeOrder(combatants, activeIndex);
            
            // Update the title text element with initiative order
            const updateCommand = `jq --arg orderText "${orderText.replace(/"/g, '\\"')}" '(.elements[] | select(.id == "title") | .text) = $orderText' ./storage/scrying_glasses/${this.jsonFile} > ./storage/scrying_glasses/tmp.json && mv ./storage/scrying_glasses/tmp.json ./storage/scrying_glasses/${this.jsonFile}`;
            
            fetch(`/run/command`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    command: "bash",
                    args: ["-c", updateCommand]
                })
            })
            .then(response => response.text())
            .then(result => {
                console.log('Initiative order update result:', result);
                this.updateTurnIndicator(turnNumber);
            })
            .catch(error => {
                console.error('Error updating initiative order:', error);
            });
        }

        formatInitiativeOrder(combatants, activeIndex) {
            if (!combatants || combatants.length === 0) {
                return "";
            }

            // Sort combatants by their index
            const sortedCombatants = [...combatants].sort((a, b) => a.index - b.index);

            // Find the active combatant in the sorted list
            const activeIndexInSorted = sortedCombatants.findIndex(c => c === combatants[activeIndex]);

            // Get up to 4 combatants starting from the active one
            const displayCombatants = [];
            for (let i = 0; i < 4; i++) {
                // Get index in the sorted array, wrapping around if needed
                const idx = (activeIndexInSorted + i) % sortedCombatants.length;
                displayCombatants.push(sortedCombatants[idx]);
            }

            // Get names and highlight the active combatant
            const names = displayCombatants.map((combatant, idx) => {
                if (!combatant) {
                    return ``;
                }
                return idx === 0 ? `${combatant.name}` : combatant.name;
            });

            // Join with » symbol
            let orderText = names.join(" » ");

            // Apply character limit
            if (orderText.length > this.characterLimit) {
                orderText = orderText.substring(0, this.characterLimit - 3) + "...";
            }

            return orderText;
        }

        // Start the combat display in VTT by loading elements from a JSON file
        startCombatDisplay() {
            console.log("Starting Combat Display - Loading from combat_overlay.json");

            // Load combat overlay configuration from JSON file
            fetch('/json/read?path=./storage/scrying_glasses/combat_overlay.json')
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`Failed to load combat_overlay.json: ${response.status}`);
                    }
                    return response.json();
                })
                .then(overlayConfig => {
                    // Extract elements from the overlay config
                    const overlayElements = overlayConfig.elements || [];

                    if (overlayElements.length === 0) {
                        console.warn("No elements found in combat_overlay.json");
                        return;
                    }

                    console.log(`Loaded ${overlayElements.length} overlay elements from combat_overlay.json`);

                    // Prepare elements as JSON string for jq command
                    const elementsJson = JSON.stringify(overlayElements);

                    // Use jq to add all elements at once
                    const addCommand = `jq --argjson newElements '${elementsJson}' '.elements += $newElements' ./storage/scrying_glasses/${this.jsonFile} > tmp.json && mv tmp.json ./storage/scrying_glasses/${this.jsonFile}`;

                    return fetch(`/run/command`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            command: "bash",
                            args: ["-c", addCommand]
                        })
                    });
                })
                .then(response => {
                    if (response) {
                        return response.text();
                    }
                })
                .then(result => {
                    if (result) {
                        console.log("Combat overlay elements added successfully:", result);
                    }
                })
                .catch(error => {
                    console.error("Error loading combat overlay:", error);
                    // Fallback to hardcoded overlay if JSON file doesn't exist
                    console.log("Falling back to default hardcoded overlay");
                    this.startCombatDisplayFallback();
                });
        }

        // Fallback method with hardcoded overlay (original implementation)
        startCombatDisplayFallback() {
            console.log("Using fallback hardcoded combat overlay");

            const topBanner = {
                "collapsed": false,
                "height": 200,
                "id": "top_banner",
                "src": "./storage/images/battle_display_top.png",
                "type": "image",
                "width": 1400,
                "x": 300,
                "y": -30
            };

            const title = {
                "alignment": "center",
                "collapsed": false,
                "color": "#ffffff",
                "font": "Arial",
                "id": "title",
                "size": 40,
                "text": "Roll Initative",
                "type": "text",
                "x": 1000,
                "y": 40
            };

            const turnDisplay = {
                "alignment": "left",
                "collapsed": false,
                "color": "#ffff00",
                "font": "Arial",
                "id": "turn_display",
                "size": 80,
                "text": "Turn: 1",
                "type": "text",
                "x": 50,
                "y": 950
            };

            const addCommand = `jq --argjson banner '${JSON.stringify(topBanner)}' --argjson title '${JSON.stringify(title)}' --argjson turnDisplay '${JSON.stringify(turnDisplay)}' '.elements += [$banner, $title, $turnDisplay]' ./storage/scrying_glasses/${this.jsonFile} > tmp.json && mv tmp.json ./storage/scrying_glasses/${this.jsonFile}`;

            fetch(`/run/command`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    command: "bash",
                    args: ["-c", addCommand]
                })
            })
            .then(response => response.text())
            .then(result => {
                console.log("Add elements result:", result);
            })
            .catch(error => {
                console.error("Error in startCombatDisplayFallback:", error);
            });
        }

        // Set the character limit for initiative order text
        setCharacterLimit(limit) {
            this.characterLimit = parseInt(limit) || 40;
            // Update the display if active
                this.updateInitiativeOrder(
                    this.battleController.battleState.parsedCombatants,
                    this.battleController.battleState.activeIndex
                );
        }

        // End the combat display in VTT
        endCombatDisplay() {
            console.log("Ending Combat Display");
            const removeCommand = `jq '.elements = (.elements | map(select(.id != "top_banner" and .id != "title" and .id != "turn_display")))' ./storage/scrying_glasses/${this.jsonFile} > tmp.json && mv tmp.json ./storage/scrying_glasses/${this.jsonFile}`;

            fetch(`/run/command`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    command: "bash",
                    args: ["-c", removeCommand]
                })
            })
            .then(response => response.text())
            .then(result => {
                console.log("Remove result:", result);
            })
            .catch(error => {
                console.error("Error in endCombatDisplay:", error);
            });
        }
    }
    return VTTController;
})();