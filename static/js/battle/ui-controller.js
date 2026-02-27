window.UiController = (function () {
    class UiController {
        constructor(battleController) {
            this.battleController = battleController;

            // Initialize DOM element references
            this.initiativeList = document.getElementById('initiative-list');
            this.combatantBatch = document.getElementById('combatant-batch');
            this.parseCombatantsBtn = document.getElementById('parse-combatants-btn');
            this.clearInputBtn = document.getElementById('clear-input-btn');
            this.exampleBtn = document.getElementById('example-btn');
            this.rollAllBtn = document.getElementById('roll-all-btn');
            this.nextTurnBtn = document.getElementById('next-turn-btn');
            this.resetCombatBtn = document.getElementById('reset-combat-btn');
            this.startCombatDisplayBtn = document.getElementById('start-combat-display-btn');
            this.endCombatDisplayBtn = document.getElementById('end-combat-display-btn');
            this.roundCounter = document.getElementById('round-counter');
            this.roundIncrementBtn = document.getElementById('round-increment-btn');
            this.roundDecrementBtn = document.getElementById('round-decrement-btn');
            this.currentTurnElem = document.getElementById('current-turn');
            this.combatNotes = document.getElementById('combat-notes');
            this.damageCommand = document.getElementById('damage-command');
            this.applyDamageBtn = document.getElementById('apply-damage-btn');
            this.damageLog = document.getElementById('damage-log');
            this.chartButton = document.getElementById('piechart-making-btn');
            this.toggleDamageEditorBtn = document.getElementById('toggle-damage-editor');
            this.damageEditorContent = document.getElementById('damage-editor-content');
            this.damageEditorArrow = document.getElementById('damage-editor-arrow');
            this.damageEditorList = document.getElementById('damage-editor-list');
        }

        // Set up all event listeners
        setupEventListeners() {
            const combatManager = this.battleController.combatManager;
            const storageManager = this.battleController.storageManager;
            const vttController = this.battleController.vttController;

            // Combat controls
            this.parseCombatantsBtn.addEventListener('click', () => combatManager.parseCombatants(true));
            this.clearInputBtn.addEventListener('click', () => combatManager.clearBatchInput());
            this.exampleBtn.addEventListener('click', () => combatManager.loadExample());
            this.rollAllBtn.addEventListener('click', () => combatManager.rollAllInitiative());
            this.nextTurnBtn.addEventListener('click', () => combatManager.nextTurn());
            this.resetCombatBtn.addEventListener('click', () => combatManager.resetCombat());
            this.roundIncrementBtn.addEventListener('click', () => combatManager.incrementRound());
            this.roundDecrementBtn.addEventListener('click', () => combatManager.decrementRound());

            // VTT controls
            this.startCombatDisplayBtn.addEventListener('click', () => vttController.startCombatDisplay());
            this.endCombatDisplayBtn.addEventListener('click', () => vttController.endCombatDisplay());

            // Damage tracking
            this.applyDamageBtn.addEventListener('click', () => combatManager.applyHealthChange());

            //Piechart Button
            this.chartButton.addEventListener('click', () => this.generateChartCommand());

            // Damage editor toggle
            this.toggleDamageEditorBtn.addEventListener('click', () => this.toggleDamageEditor());

            // Display settings
            if (this.applyLimitBtn) {
                this.applyLimitBtn.addEventListener('click', () => {
                    const limit = parseInt(this.characterLimitInput.value);
                    if (!isNaN(limit) && limit >= 10 && limit <= 100) {
                        vttController.setCharacterLimit(limit);
                        this.addSystemLogEntry(`Character limit set to: ${limit}`);
                    } else {
                        alert("Please enter a valid number between 10 and 100");
                    }
                });
            }

            // Input change handlers - debounce save to avoid excessive writes
            let saveTimeout;
            this.combatantBatch.addEventListener('input', () => {
                this.battleController.battleState.combatantText = this.combatantBatch.value;
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(() => this.battleController.saveState(), 500);
            });

            // Add event listener for Enter key in damage command
            this.damageCommand.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    combatManager.applyHealthChange();
                }
            });
        }

        // Add a system message to the log
        addSystemLogEntry(message) {
            const logEntry = document.createElement('div');
            logEntry.className = 'system-message';
            logEntry.textContent = message;
            this.damageLog.appendChild(logEntry);
            this.damageLog.scrollTop = this.damageLog.scrollHeight;
        }

        // Handle removing a combatant by index
        handleRemoveCombatant() {
            const state = this.battleController.battleState;
            const combatManager = this.battleController.combatManager;

            // Get the index from the input
            const indexToRemove = parseInt(this.removeCombatantIndex.value);

            if (isNaN(indexToRemove)) {
                alert("Please enter a valid combatant index to remove.");
                return;
            }

            // Find the combatant
            const combatantToRemove = state.parsedCombatants.find(c => c.index === indexToRemove);

            if (!combatantToRemove) {
                alert(`No combatant found with index ${indexToRemove}`);
                return;
            }

            // Confirm removal
            if (confirm(`Are you sure you want to remove ${combatantToRemove.name} from combat?`)) {
                const name = combatantToRemove.name;
                combatManager.removeCombatant(indexToRemove);
                this.addSystemLogEntry(`${name} has been removed from combat`);

                // Clear the input field
                this.removeCombatantIndex.value = '';
            }
        }

        // Render initiative list
        renderInitiativeList() {
            const state = this.battleController.battleState;

            // Clear the list
            this.initiativeList.innerHTML = '';

            if (!state.parsedCombatants || state.parsedCombatants.length === 0) {
                this.initiativeList.innerHTML = '<p>No combatants parsed yet.</p>';
                return;
            }

            // Create and append combatant elements
            state.parsedCombatants.forEach((combatant, displayIndex) => {
                const combatantElem = document.createElement('div');
                combatantElem.className = 'combatant-line';

                // Add active class if this is the current turn
                if (displayIndex === state.activeIndex) {
                    combatantElem.className += ' active-turn';
                }

                // Format: [Index] Initiative Name (AC) HP: current/max
                combatantElem.innerHTML = `
                <span class="initiative-index">${combatant.index}</span>
                <span class="initiative-value">||</span>
                <span class="combatant-name">${combatant.name}</span>
                <span class="combatant-ac">(AC: ${combatant.ac})</span>
                <span class="combatant-hp">HP: ${combatant.hp}/${combatant.originalHp}</span>
            `;

                // Append to the initiative list
                this.initiativeList.appendChild(combatantElem);
            });
        }

        // Update status panel
        updateStatusPanel() {
            const state = this.battleController.battleState;

            this.roundCounter.textContent = state.round;

            // Update current turn display
            if (state.activeIndex >= 0 && state.activeIndex < state.parsedCombatants.length) {
                const activeCombatant = state.parsedCombatants[state.activeIndex];
                this.currentTurnElem.textContent = `${activeCombatant.name} (Index ${activeCombatant.index})`;
            } else {
                this.currentTurnElem.textContent = '-';
            }
        }

        // Add an entry to the damage log
        addDamageLogEntry(sourceName, targetName, healthChange, oldHp, newHp) {
            const logEntry = document.createElement('div');
            if (healthChange > 0) {
                logEntry.className = 'healing';
                logEntry.textContent = `${sourceName} heals ${targetName} for ${healthChange} (${oldHp} → ${newHp}) from`;
            } else {
                logEntry.className = 'damage';
                logEntry.textContent = `${sourceName} damages ${targetName} for ${Math.abs(healthChange)} (${oldHp} → ${newHp})`;
            }

            this.damageLog.appendChild(logEntry);
            this.damageLog.scrollTop = this.damageLog.scrollHeight; // Scroll to bottom
        }

        // Toggle damage editor visibility
        toggleDamageEditor() {
            const isHidden = this.damageEditorContent.style.display === 'none';

            if (isHidden) {
                this.damageEditorContent.style.display = 'block';
                this.damageEditorArrow.classList.add('expanded');
                this.renderDamageEditor();
            } else {
                this.damageEditorContent.style.display = 'none';
                this.damageEditorArrow.classList.remove('expanded');
            }
        }

        // Render the damage editor list
        renderDamageEditor() {
            const state = this.battleController.battleState;

            // Clear the list
            this.damageEditorList.innerHTML = '';

            if (!state.parsedCombatants || state.parsedCombatants.length === 0) {
                this.damageEditorList.innerHTML = '<p style="color: #888;">No combatants parsed yet.</p>';
                return;
            }

            // Create editor items for each combatant
            state.parsedCombatants.forEach(combatant => {
                const editorItem = document.createElement('div');
                editorItem.className = 'damage-editor-item';

                const label = document.createElement('span');
                label.className = 'combatant-label';
                label.textContent = `${combatant.name} (Index ${combatant.index})`;

                const input = document.createElement('input');
                input.type = 'number';
                input.className = 'damage-input';
                input.value = combatant.damageDealt || 0;
                input.min = '0';
                input.dataset.combatantIndex = combatant.index;

                // Update damage value when input changes
                input.addEventListener('change', (e) => {
                    const newValue = parseInt(e.target.value) || 0;
                    combatant.damageDealt = newValue;
                    console.log(`Updated ${combatant.name}'s damage to ${newValue}`);
                    this.battleController.saveState();
                });

                editorItem.appendChild(label);
                editorItem.appendChild(input);
                this.damageEditorList.appendChild(editorItem);
            });
        }

        // Generate and run pie chart command for damage stats
        generateChartCommand() {
            const state = this.battleController.battleState;

            // Filter combatants that did damage
            const damageDealers = state.parsedCombatants.filter(c => c.damageDealt && c.damageDealt > 0);

            if (damageDealers.length === 0) {
                this.addSystemLogEntry("No damage has been dealt yet.");
                return;
            }

            // Format as "python3 piechart.py damage1 name1 damage2 name2 ..."
            let args = [];

            damageDealers.forEach(combatant => {
                args.push(combatant.damageDealt.toString());
                args.push(combatant.name);
            });

            // Build the full command string for display
            const fullCommand = `./python-env/bin/python piechart.py ${args.join(' ')}`;

            // Log the command to console
            console.log("Executing command:", fullCommand);

            // Display the command in the system log
            this.addSystemLogEntry(`Running: ${fullCommand}`);

            // Execute the command
            fetch('/execute', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    command: './python-env/bin/python',
                    args: ['./storage/piechart/piechart.py', ...args]
                })
            })
                .then(response => response.json())
                .then(result => {
                    if (result.success) {
                        this.addSystemLogEntry("Pie chart command executed successfully");

                        // If there's any output, display it
                        if (result.stdout) {
                            console.log("Command output:", result.stdout);
                            this.addSystemLogEntry(`Output: ${result.stdout}`);
                        }
                    } else {
                        console.error("Error running pie chart command:", result.stderr);
                        this.addSystemLogEntry(`Error running pie chart: ${result.stderr}`);
                    }
                })
                .catch(error => {
                    console.error("Failed to execute command:", error);
                    this.addSystemLogEntry(`Failed to execute command: ${error.message}`);
                });
        }
    }

    return UiController;
})();