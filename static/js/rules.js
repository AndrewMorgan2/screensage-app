/**
 * Screen Sage - Rules Assistant
 *
 * Listens to the table via the browser's SpeechRecognition API and pops up
 * the matching rule whenever a trigger phrase from the rules database is heard.
 * The rules database itself is a plain JSON file, edited through this page.
 */
(function () {
    const rulesPage = document.querySelector('.rules-page');
    const RULES_PATH = rulesPage.dataset.rulesPath;

    let rulesData = { rules: [] };
    let matchers = [];
    let recognition = null;
    let listening = false;
    let cooldownMs = 20000;
    let lastTriggered = {};
    let editingId = null;

    const rulesListEl = document.getElementById('rulesList');
    const systemFilterEl = document.getElementById('systemFilter');
    const ruleSearchEl = document.getElementById('ruleSearch');
    const systemOptionsEl = document.getElementById('systemOptions');

    const addRuleBtn = document.getElementById('addRuleBtn');
    const ruleModal = document.getElementById('ruleModal');
    const closeRuleModalEl = document.getElementById('closeRuleModal');
    const ruleModalTitle = document.getElementById('ruleModalTitle');
    const ruleSystemEl = document.getElementById('ruleSystem');
    const ruleCategoryEl = document.getElementById('ruleCategory');
    const ruleNameEl = document.getElementById('ruleName');
    const ruleKeywordsEl = document.getElementById('ruleKeywords');
    const ruleDescriptionEl = document.getElementById('ruleDescription');
    const ruleModalError = document.getElementById('ruleModalError');
    const deleteRuleBtn = document.getElementById('deleteRuleBtn');
    const saveRuleBtn = document.getElementById('saveRuleBtn');

    const toggleListenBtn = document.getElementById('toggleListenBtn');
    const voiceIndicator = document.getElementById('voiceIndicator');
    const voiceStatusText = document.getElementById('voiceStatusText');
    const transcriptText = document.getElementById('transcriptText');
    const voiceUnsupported = document.getElementById('voiceUnsupported');
    const voiceError = document.getElementById('voiceError');
    const cooldownSelect = document.getElementById('cooldownSelect');
    const toastContainer = document.getElementById('ruleToastContainer');

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        await loadRules();
        renderRules();
        rebuildMatchers();
        setupVoice();
        bindUI();
    }

    // --- Data loading / saving ---

    async function loadRules() {
        try {
            const res = await fetch(`/json/read?path=${encodeURIComponent(RULES_PATH)}`);
            if (res.ok) {
                const data = await res.json();
                rulesData = { rules: Array.isArray(data.rules) ? data.rules : [] };
            }
        } catch (e) {
            console.error('Failed to load rules database', e);
            rulesData = { rules: [] };
        }
    }

    async function saveRules() {
        const res = await fetch('/json/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: RULES_PATH, content: JSON.stringify(rulesData, null, 2) }),
        });
        if (!res.ok) {
            throw new Error(await res.text());
        }
    }

    // --- Rendering ---

    function getSystems() {
        const systems = new Set();
        rulesData.rules.forEach((r) => {
            if (r.system) systems.add(r.system);
        });
        return Array.from(systems).sort();
    }

    function renderRules() {
        const systems = getSystems();
        const currentFilter = systemFilterEl.value;

        systemFilterEl.innerHTML = '<option value="">All Systems</option>';
        systems.forEach((sys) => {
            const opt = document.createElement('option');
            opt.value = sys;
            opt.textContent = sys;
            systemFilterEl.appendChild(opt);
        });
        if (systems.includes(currentFilter)) {
            systemFilterEl.value = currentFilter;
        }

        systemOptionsEl.innerHTML = '';
        systems.forEach((sys) => {
            const opt = document.createElement('option');
            opt.value = sys;
            systemOptionsEl.appendChild(opt);
        });

        const filterSystem = systemFilterEl.value;
        const search = ruleSearchEl.value.trim().toLowerCase();

        const filtered = rulesData.rules.filter((rule) => {
            if (filterSystem && rule.system !== filterSystem) return false;
            if (!search) return true;
            const haystack = [
                rule.name,
                rule.system,
                rule.category,
                (rule.keywords || []).join(' '),
                rule.description,
            ].join(' ').toLowerCase();
            return haystack.includes(search);
        });

        rulesListEl.innerHTML = '';

        if (filtered.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent = rulesData.rules.length === 0
                ? 'No rules yet. Click "+ Add Rule" to create one.'
                : 'No rules match your filters.';
            rulesListEl.appendChild(empty);
            return;
        }

        filtered
            .slice()
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
            .forEach((rule) => rulesListEl.appendChild(buildRuleCard(rule)));
    }

    function buildRuleCard(rule) {
        const card = document.createElement('div');
        card.className = 'rule-card';
        card.dataset.id = rule.id;

        const header = document.createElement('div');
        header.className = 'rule-card-header';

        const title = document.createElement('h3');
        title.textContent = rule.name || '(Unnamed Rule)';
        header.appendChild(title);

        if (rule.system) {
            const badge = document.createElement('span');
            badge.className = 'rule-badge';
            badge.textContent = rule.system;
            header.appendChild(badge);
        }
        card.appendChild(header);

        if (rule.category) {
            const cat = document.createElement('div');
            cat.className = 'rule-category';
            cat.textContent = rule.category;
            card.appendChild(cat);
        }

        const keywords = document.createElement('div');
        keywords.className = 'rule-keywords';
        keywords.textContent = `Triggers: ${(rule.keywords || []).join(', ')}`;
        card.appendChild(keywords);

        const desc = document.createElement('p');
        desc.className = 'rule-description';
        desc.textContent = rule.description || '';
        card.appendChild(desc);

        const actions = document.createElement('div');
        actions.className = 'rule-card-actions';

        const testBtn = document.createElement('button');
        testBtn.className = 'secondary-btn';
        testBtn.textContent = 'Test Popup';
        testBtn.addEventListener('click', () => showRuleToast(rule));
        actions.appendChild(testBtn);

        const editBtn = document.createElement('button');
        editBtn.className = 'primary-btn';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => openModal(rule));
        actions.appendChild(editBtn);

        card.appendChild(actions);
        return card;
    }

    // --- Add / Edit / Delete modal ---

    function openModal(rule) {
        editingId = rule ? rule.id : null;
        ruleModalTitle.textContent = rule ? 'Edit Rule' : 'Add Rule';
        ruleSystemEl.value = rule ? (rule.system || '') : '';
        ruleCategoryEl.value = rule ? (rule.category || '') : '';
        ruleNameEl.value = rule ? (rule.name || '') : '';
        ruleKeywordsEl.value = rule ? (rule.keywords || []).join(', ') : '';
        ruleDescriptionEl.value = rule ? (rule.description || '') : '';
        ruleModalError.style.display = 'none';
        deleteRuleBtn.style.display = rule ? 'inline-block' : 'none';
        ruleModal.classList.add('open');
    }

    function closeModal() {
        ruleModal.classList.remove('open');
        editingId = null;
    }

    function slugify(text) {
        return text.toLowerCase().trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '') || `rule-${Date.now()}`;
    }

    async function handleSaveRule() {
        const name = ruleNameEl.value.trim();
        const keywords = ruleKeywordsEl.value.split(',').map((k) => k.trim()).filter(Boolean);

        if (!name) {
            showModalError('Name is required.');
            return;
        }
        if (keywords.length === 0) {
            showModalError('At least one trigger phrase is required.');
            return;
        }

        const rule = {
            id: editingId || slugify(name),
            system: ruleSystemEl.value.trim(),
            category: ruleCategoryEl.value.trim(),
            name,
            keywords,
            description: ruleDescriptionEl.value.trim(),
        };

        if (editingId) {
            const idx = rulesData.rules.findIndex((r) => r.id === editingId);
            if (idx >= 0) rulesData.rules[idx] = rule;
        } else {
            let id = rule.id;
            let suffix = 1;
            while (rulesData.rules.some((r) => r.id === id)) {
                id = `${rule.id}-${suffix++}`;
            }
            rule.id = id;
            rulesData.rules.push(rule);
        }

        try {
            await saveRules();
            closeModal();
            renderRules();
            rebuildMatchers();
        } catch (e) {
            showModalError(`Failed to save: ${e.message}`);
        }
    }

    async function handleDeleteRule() {
        if (!editingId) return;
        if (!confirm('Delete this rule?')) return;

        rulesData.rules = rulesData.rules.filter((r) => r.id !== editingId);

        try {
            await saveRules();
            closeModal();
            renderRules();
            rebuildMatchers();
        } catch (e) {
            showModalError(`Failed to delete: ${e.message}`);
        }
    }

    function showModalError(message) {
        ruleModalError.textContent = message;
        ruleModalError.style.display = 'block';
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
        matchers.forEach(({ rule, regexes }) => {
            if (!regexes.some((re) => re.test(text))) return;

            const last = lastTriggered[rule.id] || 0;
            if (now - last < cooldownMs) return;

            lastTriggered[rule.id] = now;
            showRuleToast(rule);
        });
    }

    // --- Voice recognition ---

    const RECOGNITION_ERROR_MESSAGES = {
        'not-allowed': 'Microphone permission was denied for this page. Click the mic/lock icon in the address bar, allow microphone access, then click "Start Listening" again.',
        'service-not-allowed': 'The browser blocked access to its speech recognition service. Check site permissions and try again.',
        'network': 'Speech recognition couldn’t reach the online speech-to-text service. This is common on open-source Chromium builds without Google’s API key — try Google Chrome or Edge.',
        'audio-capture': 'No microphone was found. Check that a mic is connected and selected as the default input device.',
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

        recognition.onresult = handleSpeechResult;

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);

            // Benign / transient — recognition restarts automatically via onend
            if (event.error === 'no-speech' || event.error === 'aborted') {
                return;
            }

            listening = false;
            showVoiceError(RECOGNITION_ERROR_MESSAGES[event.error] || `Speech recognition error: ${event.error}`);
            updateVoiceUI();
        };

        recognition.onend = () => {
            // Chrome stops recognition after periods of silence; restart if still toggled on
            if (listening) {
                try {
                    recognition.start();
                } catch (e) {
                    // ignore - already running or about to be restarted
                }
            }
        };
    }

    function handleSpeechResult(event) {
        let latestText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            latestText += event.results[i][0].transcript + ' ';
        }
        latestText = latestText.trim();
        if (!latestText) return;

        transcriptText.textContent = latestText;
        checkForMatches(latestText);
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

        // Request mic access explicitly first so permission failures surface a clear,
        // on-page message instead of a generic 'not-allowed' from SpeechRecognition.
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach((track) => track.stop());
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

    // --- Toast popups ---

    function showRuleToast(rule) {
        const toast = document.createElement('div');
        toast.className = 'rule-toast';

        const header = document.createElement('div');
        header.className = 'rule-toast-header';

        const title = document.createElement('strong');
        title.textContent = rule.name || '(Unnamed Rule)';
        header.appendChild(title);

        const close = document.createElement('span');
        close.className = 'rule-toast-close';
        close.textContent = '×';
        close.addEventListener('click', () => toast.remove());
        header.appendChild(close);

        toast.appendChild(header);

        if (rule.system || rule.category) {
            const meta = document.createElement('div');
            meta.className = 'rule-toast-meta';
            meta.textContent = [rule.system, rule.category].filter(Boolean).join(' • ');
            toast.appendChild(meta);
        }

        const body = document.createElement('div');
        body.className = 'rule-toast-body';
        body.textContent = rule.description || '';
        toast.appendChild(body);

        toastContainer.appendChild(toast);

        setTimeout(() => toast.remove(), 15000);
    }

    // --- UI bindings ---

    function bindUI() {
        toggleListenBtn.addEventListener('click', toggleListening);

        cooldownMs = parseInt(cooldownSelect.value, 10) || 20000;
        cooldownSelect.addEventListener('change', () => {
            cooldownMs = parseInt(cooldownSelect.value, 10) || 20000;
        });

        systemFilterEl.addEventListener('change', renderRules);
        ruleSearchEl.addEventListener('input', renderRules);

        addRuleBtn.addEventListener('click', () => openModal(null));
        closeRuleModalEl.addEventListener('click', closeModal);
        ruleModal.addEventListener('click', (e) => {
            if (e.target === ruleModal) closeModal();
        });

        saveRuleBtn.addEventListener('click', handleSaveRule);
        deleteRuleBtn.addEventListener('click', handleDeleteRule);
    }
})();
