/**
 * Screen Sage - Rules Assistant
 *
 * Listens via the browser's SpeechRecognition API. Trigger phrases from the
 * selected system's rule file are matched and the rule is displayed until a
 * different one is detected.
 *
 * Rule files live in storage/rules/ — one JSON file per system (e.g. dnd5e.json).
 * Drop a new file there and it appears in the dropdown automatically.
 */
(function () {
    const rulesPage = document.querySelector('.rules-page');
    const RULES_DIR  = rulesPage.dataset.rulesDir;

    let rulesData    = { rules: [] };
    let matchers     = [];
    let recognition  = null;
    let listening    = false;
    let cooldownMs   = 20000;
    let lastTriggered = {};
    let currentRuleId   = null;
    let currentSystem   = '';

    const toggleListenBtn  = document.getElementById('toggleListenBtn');
    const voiceIndicator   = document.getElementById('voiceIndicator');
    const voiceStatusText  = document.getElementById('voiceStatusText');
    const transcriptText   = document.getElementById('transcriptText');
    const voiceUnsupported = document.getElementById('voiceUnsupported');
    const voiceError       = document.getElementById('voiceError');
    const cooldownSelect   = document.getElementById('cooldownSelect');
    const systemSelect     = document.getElementById('systemSelect');

    const currentRuleEl   = document.getElementById('currentRule');
    const currentRuleCard = currentRuleEl.querySelector('.current-rule-card');
    const currentRuleName = document.getElementById('currentRuleName');
    const currentRuleBadge = document.getElementById('currentRuleBadge');
    const currentRuleMeta  = document.getElementById('currentRuleMeta');
    const currentRuleDesc  = document.getElementById('currentRuleDescription');

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        await loadSystems();
        await loadRules();
        rebuildMatchers();
        setupVoice();
        bindUI();
    }

    // --- System list ---

    async function loadSystems() {
        try {
            const res = await fetch('/api/rules/systems');
            if (!res.ok) return;
            const systems = await res.json();
            systemSelect.innerHTML = '';
            systems.forEach((sys) => {
                const opt = document.createElement('option');
                opt.value = sys;
                opt.textContent = sys;
                systemSelect.appendChild(opt);
            });
        } catch (e) {
            console.error('Failed to load rule systems', e);
        }
    }

    // --- Rules loading ---

    async function loadRules() {
        const system = systemSelect.value;
        if (!system) { rulesData = { rules: [] }; return; }
        currentSystem = system;
        try {
            const path = `${RULES_DIR}/${system}.json`;
            const res = await fetch(`/json/read?path=${encodeURIComponent(path)}`);
            if (res.ok) {
                const data = await res.json();
                rulesData = { rules: Array.isArray(data.rules) ? data.rules : [] };
            }
        } catch (e) {
            console.error('Failed to load rules for system:', system, e);
            rulesData = { rules: [] };
        }
    }

    // --- Rule display ---

    function displayRule(rule) {
        currentRuleId = rule.id;

        currentRuleName.textContent = rule.name || '(Unnamed Rule)';
        currentRuleDesc.textContent = rule.description || '';

        const meta = [currentSystem, rule.category].filter(Boolean).join(' • ');
        currentRuleMeta.textContent = meta;

        currentRuleBadge.textContent = currentSystem;
        currentRuleBadge.style.display = currentSystem ? '' : 'none';

        // Replay slide-in animation on every new match
        currentRuleCard.style.animation = 'none';
        void currentRuleCard.offsetHeight;
        currentRuleCard.style.animation = '';

        currentRuleEl.style.display = '';
    }

    function clearRule() {
        currentRuleEl.style.display = 'none';
        currentRuleId = null;
    }

    // --- Keyword matching ---

    function escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function rebuildMatchers() {
        matchers = rulesData.rules
            .filter((r) => Array.isArray(r.keywords) && r.keywords.length > 0)
            .map((r) => ({
                rule: r,
                regexes: r.keywords
                    .filter(Boolean)
                    .map((k) => new RegExp(`\\b${escapeRegex(k.trim())}\\b`, 'i')),
            }));
    }

    function checkForMatches(text) {
        const now = Date.now();
        for (const { rule, regexes } of matchers) {
            if (!regexes.some((re) => re.test(text))) continue;
            if (rule.id === currentRuleId) continue; // already showing — leave it up
            const last = lastTriggered[rule.id] || 0;
            if (now - last < cooldownMs) continue;
            lastTriggered[rule.id] = now;
            displayRule(rule);
            break;
        }
    }

    // --- Voice recognition ---

    const RECOGNITION_ERROR_MESSAGES = {
        'not-allowed':         'Microphone permission was denied. Click the mic/lock icon in the address bar, allow microphone access, then try again.',
        'service-not-allowed': 'The browser blocked access to its speech recognition service. Check site permissions and try again.',
        'network':             'Speech recognition couldn’t reach the online speech-to-text service. This is common on open-source Chromium builds without Google’s API key — try Google Chrome or Edge.',
        'audio-capture':       'No microphone was found. Check that a mic is connected and selected as the default input device.',
    };

    function showVoiceError(message) {
        voiceError.textContent = message;
        voiceError.style.display = 'block';
    }

    function hideVoiceError() {
        voiceError.style.display = 'none';
    }

    function mapGetUserMediaError(e) {
        switch (e.name) {
            case 'NotAllowedError':
            case 'SecurityError':
                return 'Microphone permission was denied. Click the mic/lock icon in the address bar, allow microphone access for this site, then try again.';
            case 'NotFoundError':
                return 'No microphone was found. Check that a mic is connected and selected as the default input device.';
            default:
                return `Could not access the microphone (${e.name}: ${e.message}).`;
        }
    }

    function setupVoice() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            voiceUnsupported.style.display = 'block';
            toggleListenBtn.disabled = true;
            return;
        }

        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event) => {
            let text = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                text += event.results[i][0].transcript + ' ';
            }
            text = text.trim();
            if (!text) return;
            transcriptText.textContent = text;
            checkForMatches(text);
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            if (event.error === 'no-speech' || event.error === 'aborted') return;
            listening = false;
            showVoiceError(RECOGNITION_ERROR_MESSAGES[event.error] || `Speech recognition error: ${event.error}`);
            updateVoiceUI();
        };

        recognition.onend = () => {
            if (listening) {
                try { recognition.start(); } catch (_) {}
            }
        };
    }

    async function toggleListening() {
        if (!recognition) return;

        if (listening) {
            listening = false;
            recognition.stop();
            updateVoiceUI();
            return;
        }

        hideVoiceError();

        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach((t) => t.stop());
            } catch (e) {
                showVoiceError(mapGetUserMediaError(e));
                return;
            }
        }

        listening = true;
        try {
            recognition.start();
        } catch (e) {
            console.error('Failed to start recognition', e);
            listening = false;
        }
        updateVoiceUI();
    }

    function updateVoiceUI() {
        if (listening) {
            voiceIndicator.classList.add('listening');
            voiceStatusText.textContent = 'Listening...';
            toggleListenBtn.textContent = 'Stop Listening';
        } else {
            voiceIndicator.classList.remove('listening');
            voiceStatusText.textContent = 'Not listening';
            toggleListenBtn.textContent = 'Start Listening';
        }
    }

    // --- UI bindings ---

    function bindUI() {
        toggleListenBtn.addEventListener('click', toggleListening);

        cooldownMs = parseInt(cooldownSelect.value, 10) || 20000;
        cooldownSelect.addEventListener('change', () => {
            cooldownMs = parseInt(cooldownSelect.value, 10) || 20000;
        });

        systemSelect.addEventListener('change', async () => {
            clearRule();
            lastTriggered = {};
            await loadRules();
            rebuildMatchers();
        });
    }
})();
