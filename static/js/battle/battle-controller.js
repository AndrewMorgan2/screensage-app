// battle-controller.js - Main controller coordinating all functionality
window.BattleController = (function() {
    const STORAGE_KEY = 'screensage_battle_state';

    class BattleController {
        constructor() {
            // Initialize state
            this.battleState = {
                combatantText: '',
                currentTurn: -1,
                round: 1,
                activeIndex: -1,
                parsedCombatants: []
            };

            // Initialize sub-controllers
            this.combatManager = new CombatManager(this);
            this.vttController = new VTTController(this);
            this.uiController = new UiController(this);
        }

        initialize() {
            // Set up event listeners
            this.uiController.setupEventListeners();

            // Restore state from localStorage
            this.loadState();
        }

        // Save current state to localStorage
        saveState() {
            try {
                const stateToSave = JSON.stringify(this.battleState);
                localStorage.setItem(STORAGE_KEY, stateToSave);
            } catch (e) {
                console.error('Failed to save battle state:', e);
            }
        }

        // Load state from localStorage
        loadState() {
            try {
                const savedState = localStorage.getItem(STORAGE_KEY);
                if (savedState) {
                    const parsed = JSON.parse(savedState);

                    // Restore state properties
                    this.battleState.combatantText = parsed.combatantText || '';
                    this.battleState.currentTurn = parsed.currentTurn ?? -1;
                    this.battleState.round = parsed.round ?? 1;
                    this.battleState.activeIndex = parsed.activeIndex ?? -1;
                    this.battleState.parsedCombatants = parsed.parsedCombatants || [];

                    // Restore UI from state
                    this.uiController.combatantBatch.value = this.battleState.combatantText;
                    this.uiController.renderInitiativeList();
                    this.uiController.updateStatusPanel();

                    console.log('Battle state restored from localStorage');
                }
            } catch (e) {
                console.error('Failed to load battle state:', e);
            }
        }

        // Clear saved state
        clearState() {
            try {
                localStorage.removeItem(STORAGE_KEY);
            } catch (e) {
                console.error('Failed to clear battle state:', e);
            }
        }
    }

    return BattleController;
})();