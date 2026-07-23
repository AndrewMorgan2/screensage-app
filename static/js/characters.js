document.addEventListener('DOMContentLoaded', function () {
    const container = document.getElementById('characters-container');

    function renderCharacters(characters) {
        container.innerHTML = '';

        if (characters.length === 0) {
            container.innerHTML = '<div class="empty-message">No characters found in storage/kindle_characters/.</div>';
            return;
        }

        characters.forEach(function (c) {
            const card = document.createElement('div');
            card.className = 'character-card' + (c.enabled ? '' : ' disabled');

            const hpLabel = c.hp ? (c.hp.current + ' / ' + c.hp.max + ' HP') : '';

            card.innerHTML = `
                <div class="character-header">
                    <div>
                        <div class="character-name">${c.name}</div>
                        <div class="character-sub">${c.class} - Level ${c.level}</div>
                    </div>
                    <button class="btn-char-toggle ${c.enabled ? 'is-enabled' : 'is-disabled'}" data-id="${c.id}">
                        ${c.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                </div>
                <div class="character-hp">${hpLabel}</div>
            `;

            container.appendChild(card);
        });

        container.querySelectorAll('.btn-char-toggle').forEach(function (btn) {
            btn.addEventListener('click', function () {
                toggleCharacter(btn.getAttribute('data-id'), btn);
            });
        });
    }

    function loadCharacters(silent) {
        if (!silent) {
            container.innerHTML = '<div class="loading-message">Loading characters...</div>';
        }
        fetch('/api/kindle/admin/characters')
            .then(function (response) { return response.json(); })
            .then(renderCharacters)
            .catch(function () {
                if (!silent) {
                    container.innerHTML = '<div class="empty-message">Failed to load characters.</div>';
                }
            });
    }

    // Listens for HP/ability/enabled-state changes broadcast from the server
    // (see kindle_handlers.rs) so this page updates without a manual reload —
    // e.g. an HP change made from the KOReader plugin or the /kindle browser
    // page shows up here live. Reconnects on drop, same pattern as draw.js.
    function setupRefreshListener() {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${location.host}/ws`);

        ws.onmessage = (event) => {
            let data;
            try {
                data = JSON.parse(event.data);
            } catch {
                return;
            }
            if (data.type === 'kindle_refresh') {
                loadCharacters(true);
            }
        };

        ws.onclose = () => {
            setTimeout(setupRefreshListener, 2000);
        };
    }

    function toggleCharacter(id, btn) {
        btn.disabled = true;
        fetch('/api/kindle/admin/character/' + encodeURIComponent(id) + '/toggle', {
            method: 'POST',
        })
            .then(function (response) { return response.json(); })
            .then(function () {
                loadCharacters();
            })
            .catch(function () {
                btn.disabled = false;
            });
    }

    function createCharacter() {
        const nameInput = document.getElementById('newCharName');
        const classInput = document.getElementById('newCharClass');
        const name = nameInput.value.trim();
        const charClass = classInput.value.trim();
        if (!name || !charClass) {
            alert('Enter a name and class.');
            return;
        }

        const btn = document.getElementById('newCharBtn');
        btn.disabled = true;
        fetch('/api/kindle/character/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name, class: charClass }),
        })
            .then(function (response) { return response.json(); })
            .then(function () {
                nameInput.value = '';
                classInput.value = '';
                btn.disabled = false;
                loadCharacters();
            })
            .catch(function () {
                btn.disabled = false;
                alert('Failed to create character.');
            });
    }

    document.getElementById('newCharBtn').addEventListener('click', createCharacter);

    loadCharacters();
    setupRefreshListener();
});
