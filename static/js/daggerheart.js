// Simple Daggerheart level-1 character builder. Writes a JSON file in the
// format the SageSlate character card (sageslate-main.js) reads.

const DH_CHAR_DIR = './storage/daggerheard_characters';

const DH_CLASSES = {
    Bard:     { evasion: 10, hp: 5, subclasses: ['Troubadour', 'Wordsmith'] },
    Druid:    { evasion: 10, hp: 6, subclasses: ['Warden of the Elements', 'Warden of Renewal'] },
    Guardian: { evasion: 9,  hp: 7, subclasses: ['Stalwart', 'Vengeance'] },
    Ranger:   { evasion: 12, hp: 6, subclasses: ['Beastbound', 'Wayfinder'] },
    Rogue:    { evasion: 12, hp: 6, subclasses: ['Nightwalker', 'Syndicate'] },
    Seraph:   { evasion: 9,  hp: 7, subclasses: ['Divine Wielder', 'Winged Sentinel'] },
    Sorcerer: { evasion: 10, hp: 6, subclasses: ['Elemental Origin', 'Primal Origin'] },
    Warrior:  { evasion: 11, hp: 6, subclasses: ['Call of the Brave', 'Call of the Slayer'] },
    Wizard:   { evasion: 11, hp: 5, subclasses: ['School of Knowledge', 'School of War'] },
};

const DH_ANCESTRIES = ['Clank', 'Drakona', 'Dwarf', 'Elf', 'Faerie', 'Faun', 'Firbolg', 'Fungril',
    'Galapa', 'Giant', 'Goblin', 'Halfling', 'Human', 'Infernis', 'Katari', 'Orc', 'Ribbet', 'Simiah'];

const DH_COMMUNITIES = ['Highborne', 'Loreborne', 'Orderborne', 'Ridgeborne', 'Seaborne',
    'Slyborne', 'Underborne', 'Wanderborne', 'Wildborne'];

// Base thresholds; level is added on top
const DH_ARMOR = {
    'Gambeson Armor':   { score: 3, major: 5, severe: 11, evasion: 1,  agility: 0 },
    'Leather Armor':    { score: 3, major: 6, severe: 13, evasion: 0,  agility: 0 },
    'Chainmail Armor':  { score: 4, major: 7, severe: 15, evasion: -1, agility: 0 },
    'Full Plate Armor': { score: 4, major: 8, severe: 17, evasion: -2, agility: -1 },
};

const DH_WEAPONS = {
    'Broadsword':       { trait: 'Agility',   range: 'Melee',      damage: 'd8 phy' },
    'Longsword':        { trait: 'Agility',   range: 'Melee',      damage: 'd10+3 phy' },
    'Battleaxe':        { trait: 'Strength',  range: 'Melee',      damage: 'd10+3 phy' },
    'Greatsword':       { trait: 'Strength',  range: 'Melee',      damage: 'd10+3 phy' },
    'Mace':             { trait: 'Strength',  range: 'Melee',      damage: 'd8+1 phy' },
    'Warhammer':        { trait: 'Strength',  range: 'Melee',      damage: 'd12+3 phy' },
    'Dagger':           { trait: 'Finesse',   range: 'Melee',      damage: 'd8+1 phy' },
    'Quarterstaff':     { trait: 'Instinct',  range: 'Melee',      damage: 'd10+3 phy' },
    'Cutlass':          { trait: 'Presence',  range: 'Melee',      damage: 'd8+1 phy' },
    'Rapier':           { trait: 'Presence',  range: 'Melee',      damage: 'd8 phy' },
    'Halberd':          { trait: 'Strength',  range: 'Very Close', damage: 'd10+2 phy' },
    'Spear':            { trait: 'Finesse',   range: 'Very Close', damage: 'd8+3 phy' },
    'Shortbow':         { trait: 'Agility',   range: 'Far',        damage: 'd6+3 phy' },
    'Crossbow':         { trait: 'Finesse',   range: 'Far',        damage: 'd6+1 phy' },
    'Longbow':          { trait: 'Agility',   range: 'Very Far',   damage: 'd8+3 phy' },
    'Arcane Gauntlets': { trait: 'Strength',  range: 'Melee',      damage: 'd10+3 mag' },
    'Hallowed Axe':     { trait: 'Strength',  range: 'Melee',      damage: 'd8+1 mag' },
    'Glowing Rings':    { trait: 'Agility',   range: 'Very Close', damage: 'd10+1 mag' },
    'Hand Runes':       { trait: 'Instinct',  range: 'Very Close', damage: 'd10 mag' },
    'Returning Blade':  { trait: 'Finesse',   range: 'Close',      damage: 'd8 mag' },
    'Shortstaff':       { trait: 'Instinct',  range: 'Close',      damage: 'd8+1 mag' },
    'Dualstaff':        { trait: 'Instinct',  range: 'Far',        damage: 'd6+3 mag' },
    'Scepter':          { trait: 'Presence',  range: 'Far',        damage: 'd6 mag' },
    'Wand':             { trait: 'Knowledge', range: 'Far',        damage: 'd6+1 mag' },
    'Greatstaff':       { trait: 'Knowledge', range: 'Very Far',   damage: 'd6 mag' },
};

const DH_TRAITS = ['Agility', 'Strength', 'Finesse', 'Instinct', 'Presence', 'Knowledge'];
const DH_TRAIT_ARRAY = [2, 1, 1, 0, 0, -1];

document.addEventListener('DOMContentLoaded', function () {
    const $ = (id) => document.getElementById(id);
    const fill = (select, values) => {
        select.innerHTML = values.map(v => `<option value="${v}">${v}</option>`).join('');
    };
    const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

    fill($('dhClass'), Object.keys(DH_CLASSES));
    fill($('dhAncestry'), DH_ANCESTRIES);
    fill($('dhCommunity'), DH_COMMUNITIES);
    fill($('dhArmor'), Object.keys(DH_ARMOR));
    fill($('dhWeapon'), Object.keys(DH_WEAPONS));

    // Default trait spread matches the order of DH_TRAITS
    $('dhTraits').innerHTML = DH_TRAITS.map((t, i) => `
        <label>${t}
            <select data-trait="${t}">
                ${[2, 1, 0, -1].map(v => `<option value="${v}" ${v === DH_TRAIT_ARRAY[i] ? 'selected' : ''}>${signed(v)}</option>`).join('')}
            </select>
        </label>`).join('');

    function readTraits() {
        const traits = {};
        document.querySelectorAll('#dhTraits select').forEach(s => { traits[s.dataset.trait] = parseInt(s.value, 10); });
        return traits;
    }

    function traitsValid(traits) {
        const sorted = Object.values(traits).sort((a, b) => b - a);
        return sorted.every((v, i) => v === DH_TRAIT_ARRAY[i]);
    }

    function buildCharacter() {
        const cls = DH_CLASSES[$('dhClass').value];
        const armor = DH_ARMOR[$('dhArmor').value];
        const weaponName = $('dhWeapon').value;
        const level = 1;

        const traits = readTraits();
        traits.Agility += armor.agility;

        return {
            name: $('dhName').value.trim(),
            level,
            class: $('dhClass').value,
            subclass: $('dhSubclass').value,
            ancestry: $('dhAncestry').value,
            community: $('dhCommunity').value,
            traits,
            evasion: cls.evasion + armor.evasion,
            proficiency: 1,
            armor: { name: $('dhArmor').value, score: armor.score, marked: 0 },
            thresholds: { major: armor.major + level, severe: armor.severe + level },
            hp: { max: cls.hp, marked: 0 },
            stress: { max: 6, marked: 0 },
            weapon: { name: weaponName, ...DH_WEAPONS[weaponName] },
        };
    }

    function update() {
        const traitsOk = traitsValid(readTraits());
        $('dhTraitStatus').textContent = traitsOk ? '' : 'Traits must use exactly +2, +1, +1, 0, 0, -1';
        $('dhTraitStatus').className = traitsOk ? 'dh-hint' : 'dh-hint dh-err';

        const c = buildCharacter();
        $('dhSummary').innerHTML = `
            <strong>${c.name || 'Unnamed'}</strong> — Level ${c.level} ${c.ancestry} ${c.class} (${c.subclass}), ${c.community}<br>
            Evasion ${c.evasion} · Armor ${c.armor.score} · Thresholds ${c.thresholds.major} / ${c.thresholds.severe} · HP ${c.hp.max} · Stress ${c.stress.max}<br>
            ${DH_TRAITS.map(t => `${t} ${signed(c.traits[t])}`).join(' · ')}<br>
            ${c.weapon.name}: ${c.weapon.trait} · ${c.weapon.range} · ${c.weapon.damage}`;

        $('dhSaveBtn').disabled = !traitsOk || !c.name;
    }

    $('dhClass').addEventListener('change', () => {
        fill($('dhSubclass'), DH_CLASSES[$('dhClass').value].subclasses);
        update();
    });
    document.querySelectorAll('.dh-container input, .dh-container select')
        .forEach(el => el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', update));

    $('dhSaveBtn').addEventListener('click', async () => {
        const c = buildCharacter();
        const slug = c.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'character';
        const path = `${DH_CHAR_DIR}/${slug}.json`;
        const msg = $('dhMessage');

        const exists = await fetch(`/json/read?path=${encodeURIComponent(path)}`).then(r => r.ok).catch(() => false);
        if (exists && !confirm(`${slug}.json already exists. Overwrite it?`)) return;

        try {
            const res = await fetch('/json/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path, content: JSON.stringify(c, null, 2) }),
            });
            if (!res.ok) throw new Error(await res.text());
            msg.textContent = `Saved ${slug}.json. Pick it in SageSlate with "Show Character".`;
            msg.className = 'dh-hint dh-ok';
        } catch (e) {
            msg.textContent = `Save failed: ${e.message}`;
            msg.className = 'dh-hint dh-err';
        }
    });

    fill($('dhSubclass'), DH_CLASSES[$('dhClass').value].subclasses);
    update();
});
