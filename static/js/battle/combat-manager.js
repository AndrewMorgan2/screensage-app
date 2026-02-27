// combat-manager.js - Handles combat mechanics, initiative, and health tracking
window.CombatManager = (function () {
    class CombatManager {
        constructor(battleController) {
            this.battleController = battleController;
        }

        // Parse combatants from text input
        parseCombatants(showSuccess = true) {
            const uiController = this.battleController.uiController;
            const state = this.battleController.battleState;
            const vttController = this.battleController.vttController;

            const text = uiController.combatantBatch.value.trim();
            if (!text) {
                if (showSuccess) {
                    alert("Please enter combatant data first.");
                }
                return;
            }

            state.combatantText = text;
            const lines = text.split('\n');
            let parsedCombatants = [];
            let errors = [];

            lines.forEach((line, index) => {
                if (!line.trim()) return; // Skip empty lines

                // Try to parse the line
                try {
                    const parts = line.trim().split(/\s+/);

                    // Check if we have at least 4 parts: initiative, name, AC, HP
                    if (parts.length < 4) {
                        errors.push(`Line ${index + 1}: Not enough parts. Format should be: [initiative] [name] [AC] [HP]`);
                        return;
                    }

                    // Extract the initiative (first part)
                    let initiative;
                    try {
                        initiative = this.rollDice(parts[0]);
                    } catch (e) {
                        errors.push(`Line ${index + 1}: Initiative must be a number or dice notation (e.g. d20+2)`);
                        return;
                    }

                    // Extract the HP (last part)
                    let hp;
                    try {
                        hp = this.rollDice(parts[parts.length - 1]);
                    } catch (e) {
                        errors.push(`Line ${index + 1}: HP must be a number or dice notation (e.g. 2d6+1)`);
                        return;
                    }

                    // Extract the AC (second to last part)
                    const ac = parseInt(parts[parts.length - 2]);
                    if (isNaN(ac)) {
                        errors.push(`Line ${index + 1}: AC must be a number`);
                        return;
                    }

                    // Everything else in the middle is the name
                    // This allows for multi-word names
                    const name = parts.slice(1, parts.length - 2).join(' ');
                    if (!name.trim()) {
                        errors.push(`Line ${index + 1}: Name cannot be empty`);
                        return;
                    }

                    // Store the original line and parts for rebuilding
                    const originalLine = line.trim();

                    // Create the combatant
                    parsedCombatants.push({
                        index: index,
                        initiative: initiative,
                        name: name,
                        ac: ac,
                        hp: hp,
                        originalHp: hp,
                        originalLine: originalLine,
                        originalParts: parts,
                        damageDealt: 0
                    });

                } catch (error) {
                    errors.push(`Line ${index + 1}: ${error.message}`);
                }
            });

            // Show errors if any
            if (errors.length > 0) {
                alert(`Errors found:\n${errors.join('\n')}`);
                return;
            }

            // Sort by initiative (high to low)
            parsedCombatants.sort((a, b) => b.initiative - a.initiative);

            // Reindex the combatants after sorting
            parsedCombatants.forEach((c, i) => {
                c.index = i;
            });

            // Store parsed combatants
            state.parsedCombatants = parsedCombatants;

            // Update the initiative list display
            uiController.renderInitiativeList();

            // Reorder the text in the textarea to match the initiative order
            this.reorderCombatantText();

            // Save state
            this.battleController.saveState();

            // Log to console
            console.log("Combat starting...");
            console.log(`${parsedCombatants.length} combatants ready:`);
            parsedCombatants.forEach((c, i) => {
                console.log(`${i + 1}. ${c.name} - Initiative: ${c.initiative}, AC: ${c.ac}, HP: ${c.hp}`);
            });

            console.log("Display");

            vttController.updateInitiativeOrder(state.parsedCombatants, state.activeIndex, state.round);
        }

        // Roll dice function (e.g. "d20+2", "2d6+1")
        rollDice(diceNotation) {
            // Regular expression to parse dice notation
            const diceRegex = /^(\d*)d(\d+)(?:([-+])(\d+))?$/i;
            const match = diceNotation.toLowerCase().match(diceRegex);

            if (!match) {
                // Not dice notation, try to parse as a number
                const num = parseInt(diceNotation);
                if (!isNaN(num)) return num;
                throw new Error(`Invalid dice notation: ${diceNotation}`);
            }

            const numDice = match[1] ? parseInt(match[1]) : 1;
            const dieSize = parseInt(match[2]);
            const modifier = match[3] && match[4] ? (match[3] === '+' ? 1 : -1) * parseInt(match[4]) : 0;

            // Roll the dice
            let result = 0;
            for (let i = 0; i < numDice; i++) {
                result += Math.floor(Math.random() * dieSize) + 1;
            }

            // Apply the modifier
            result += modifier;

            return result;
        }

        // Reorder the text in the textarea to match the initiative order
        reorderCombatantText() {
            const uiController = this.battleController.uiController;
            const state = this.battleController.battleState;

            let orderedLines = [];

            // Rebuild the text in initiative order
            state.parsedCombatants.forEach(combatant => {
                // Format: [initiative] [name] [AC] [HP]
                orderedLines.push(`${combatant.initiative} ${combatant.name} ${combatant.ac} ${combatant.hp}`);
            });

            // Update the text area
            uiController.combatantBatch.value = orderedLines.join('\n');
            state.combatantText = uiController.combatantBatch.value;
        }

        // Clear the text input
        clearBatchInput() {
            const uiController = this.battleController.uiController;
            const state = this.battleController.battleState;

            if (confirm("This will clear all combatant data. Continue?")) {
                uiController.combatantBatch.value = '';
                state.combatantText = '';
                state.parsedCombatants = [];
                state.activeIndex = -1;
                state.round = 1;
                uiController.renderInitiativeList();
                uiController.updateStatusPanel();
                this.battleController.saveState();
            }
        }

        // Roll initiative for all combatants in the text field
        rollAllInitiative() {
            const uiController = this.battleController.uiController;
            const state = this.battleController.battleState;

            const text = uiController.combatantBatch.value.trim();
            if (!text) {
                alert("Please enter combatant data first.");
                return;
            }

            const lines = text.split('\n');
            const rollResults = [];

            lines.forEach((line, index) => {
                if (!line.trim()) return; // Skip empty lines

                try {
                    const parts = line.trim().split(/\s+/);
                    if (parts.length < 4) return;

                    // Roll for initiative if it looks like dice notation
                    const diceRegex = /^(\d*)d(\d+)(?:([-+])(\d+))?$/i;
                    if (diceRegex.test(parts[0])) {
                        // Roll the dice
                        const rolled = this.rollDice(parts[0]);

                        // Replace the initiative with the rolled value
                        const newLine = `${rolled} ${parts.slice(1).join(' ')}`;
                        lines[index] = newLine;

                        // Add to roll results
                        const name = parts.slice(1, parts.length - 2).join(' ');
                        rollResults.push(`${name}: ${rolled}`);
                    }
                } catch (error) {
                    console.error(`Error rolling initiative for line ${index + 1}:`, error);
                }
            });

            // Update the text field with new initiative values
            uiController.combatantBatch.value = lines.join('\n');
            state.combatantText = uiController.combatantBatch.value;

            // Re-parse combatants
            this.parseCombatants(false);
        }

        // Handle next turn
        nextTurn() {
            const uiController = this.battleController.uiController;
            const state = this.battleController.battleState;
            const vttController = this.battleController.vttController;

            if (state.parsedCombatants.length === 0) {
                return;
            }

            // Increment active index
            state.activeIndex++;

            // Check if we need to start a new round
            if (state.activeIndex >= state.parsedCombatants.length) {
                state.activeIndex = 0;
                state.round++;
                console.log(`Round ${state.round} begins!`);
            }

            // Log current turn to console
            const activeCombatant = state.parsedCombatants[state.activeIndex];
            console.log(`${activeCombatant.name}'s turn (Index ${activeCombatant.index}, HP: ${activeCombatant.hp}/${activeCombatant.originalHp})`);

            // Update UI and save
            uiController.renderInitiativeList();
            uiController.updateStatusPanel();
            this.battleController.saveState();

            vttController.updateInitiativeOrder(state.parsedCombatants, state.activeIndex, state.round);
        }

        // Reset combat
        resetCombat() {
            const uiController = this.battleController.uiController;
            const state = this.battleController.battleState;

            if (confirm('Are you sure you want to reset the combat? This will clear the turn order but keep your combatant list.')) {
                state.currentTurn = -1;
                state.round = 1;
                state.activeIndex = -1;

                // Update UI and save
                uiController.renderInitiativeList();
                uiController.updateStatusPanel();
                this.battleController.saveState();
            }
        }

        // Increment round number
        incrementRound() {
            const uiController = this.battleController.uiController;
            const state = this.battleController.battleState;
            const vttController = this.battleController.vttController;

            state.round++;
            console.log(`Round manually incremented to ${state.round}`);

            // Update UI and VTT
            uiController.updateStatusPanel();
            this.battleController.saveState();
            vttController.updateInitiativeOrder(state.parsedCombatants, state.activeIndex, state.round);
        }

        // Decrement round number
        decrementRound() {
            const uiController = this.battleController.uiController;
            const state = this.battleController.battleState;
            const vttController = this.battleController.vttController;

            // Don't allow round to go below 1
            if (state.round > 1) {
                state.round--;
                console.log(`Round manually decremented to ${state.round}`);

                // Update UI and VTT
                uiController.updateStatusPanel();
                this.battleController.saveState();
                vttController.updateInitiativeOrder(state.parsedCombatants, state.activeIndex, state.round);
            } else {
                console.log('Round is already at 1, cannot decrement further');
            }
        }

        // Apply damage or healing
        applyHealthChange() {
            const uiController = this.battleController.uiController;
            const state = this.battleController.battleState;

            const command = uiController.damageCommand.value.trim();

            // Parse the command: [target_index] [health_change] [source_index]
            const parts = command.split(/\s+/);

            // Parse target and source indices
            const targetIndex = parseInt(parts[0]);
            const healthChange = parseInt(parts[1]); 
            const sourceIndex = parseInt(parts[2]);

            // Find the target and source in our parsed combatants
            const targetCombatant = state.parsedCombatants.find(c => c.index === targetIndex);
            const sourceCombatant = state.parsedCombatants.find(c => c.index === sourceIndex);

            // Apply the health change
            const oldHp = targetCombatant.hp;
            targetCombatant.hp += healthChange;

            // Don't let HP go below 0
            if (targetCombatant.hp < 0) {
                targetCombatant.hp = 0;
            }

            // Don't let HP exceed original HP
            if (targetCombatant.hp > targetCombatant.originalHp) {
                targetCombatant.hp = targetCombatant.originalHp;
            }

            if (healthChange < 0) {
                // Damage dealt
                if (!sourceCombatant.damageDealt) sourceCombatant.damageDealt = 0;
                if (Math.abs(healthChange) > oldHp) {
                    sourceCombatant.damageDealt += oldHp
                } else {
                    sourceCombatant.damageDealt += Math.abs(healthChange);
                }
                // console.log(sourceCombatant.damageDealt);
            }

            // Update the text in the combatant batch to reflect the health change
            this.updateCombatantText(targetIndex, targetCombatant.hp);

            // Log to console
            if (healthChange > 0) {
                console.log(`${sourceCombatant.name} heals ${targetCombatant.name} for ${healthChange} HP (${oldHp} → ${targetCombatant.hp})`);
            } else {
                console.log(`${sourceCombatant.name} damages ${targetCombatant.name} for ${Math.abs(healthChange)} HP (${oldHp} → ${targetCombatant.hp})`);
            }

            // Add to damage log
            uiController.addDamageLogEntry(sourceCombatant.name, targetCombatant.name, healthChange, oldHp, targetCombatant.hp);

            // If target HP is now 0, ask if they want to remove it from combat
            if (targetCombatant.hp === 0) {
                this.removeCombatant(targetIndex);
                uiController.addSystemLogEntry(`${targetCombatant.name} has been removed from combat`);
            }

            // Clear the command input
            uiController.damageCommand.value = '';

            // Update UI and save
            uiController.renderInitiativeList();
            this.battleController.saveState();
        }

        // Update the HP in the combatant text directly
        updateCombatantText(targetIndex, newHp) {
            const state = this.battleController.battleState;

            // Find the combatant with the target index
            const targetCombatant = state.parsedCombatants.find(c => c.index === targetIndex);
            if (!targetCombatant) return;

            // Update the HP in the parsed combatant
            targetCombatant.hp = newHp;

            // Reorder the text in the textarea to match the initiative order
            this.reorderCombatantText();
        }

        // Remove a combatant from initiative order
        removeCombatant(targetIndex) {
            const state = this.battleController.battleState;
            const uiController = this.battleController.uiController;

            // Find the index of the combatant in the array
            const combatantIndex = state.parsedCombatants.findIndex(c => c.index === targetIndex);

            if (combatantIndex === -1) return;

            // Check if the removed combatant was before the active combatant in initiative order
            const wasBeforeActive = combatantIndex < state.activeIndex;

            // Check if we're removing the active combatant
            const removingActive = combatantIndex === state.activeIndex;

            // Remove the combatant
            const removed = state.parsedCombatants.splice(combatantIndex, 1)[0];

            // Adjust the active index if needed
            if (wasBeforeActive) {
                state.activeIndex--;
            } else if (removingActive) {
                // If we're removing the active combatant, we want to keep the same position
                // But ensure it doesn't go out of bounds
                if (state.activeIndex >= state.parsedCombatants.length) {
                    state.activeIndex = 0;
                    // If we removed the last combatant in the round, increment the round
                    if (state.parsedCombatants.length > 0) {
                        state.round++;
                    }
                }
            }

            // Reindex remaining combatants
            state.parsedCombatants.forEach((c, i) => {
                c.index = i;
            });

            // Update the batch text
            this.reorderCombatantText();

            // Update UI and save
            uiController.renderInitiativeList();
            uiController.updateStatusPanel();
            this.battleController.saveState();

            console.log(`Removed ${removed.name} from combat`);
        }

        // Load example combatants
        loadExample() {
            const uiController = this.battleController.uiController;

            uiController.combatantBatch.value = `d20+5 Aragorn 16 45
d20+2 Goblin Chief 15 30
d20+4 Legolas 14 38
d20+2 Goblin Archer 13 8
d20+2 Goblin Archer 13 8
d20+2 Gimli 17 55
d20+1 Gandalf 12 30
d20 Orc Warrior 14 22
d20 Orc Warrior 14 22
d20-1 Gollum 12 15`;
        }
    }

    return CombatManager;
})();