// battle-main.js - Main entry point for the combat tracker
(function() {
    document.addEventListener('DOMContentLoaded', () => {
        console.log("Initializing Battle Tracker...");
        
        // Load all required scripts in the correct order
        loadScripts([
            '/static/js/battle/ui-controller.js',
            '/static/js/battle/combat-manager.js',
            '/static/js/battle/vtt-controller.js',
            '/static/js/battle/battle-controller.js'
        ], () => {
            // Once all scripts are loaded, initialize the application
            console.log("All scripts loaded, starting application...");
            const battleController = new BattleController();
            battleController.initialize();
        });
    });
    
    // Helper function to load scripts sequentially
    function loadScripts(urls, callback) {
        if (urls.length === 0) {
            callback();
            return;
        }
        
        const url = urls.shift();
        const script = document.createElement('script');
        script.src = url;
        script.onload = function() {
            loadScripts(urls, callback);
        };
        script.onerror = function() {
            console.error(`Failed to load script: ${url}`);
            loadScripts(urls, callback);
        };
        document.head.appendChild(script);
    }
})();