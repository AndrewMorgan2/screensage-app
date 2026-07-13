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

    function loadCharacters() {
        container.innerHTML = '<div class="loading-message">Loading characters...</div>';
        fetch('/api/kindle/admin/characters')
            .then(function (response) { return response.json(); })
            .then(renderCharacters)
            .catch(function () {
                container.innerHTML = '<div class="empty-message">Failed to load characters.</div>';
            });
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

    loadCharacters();
});
