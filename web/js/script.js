// QuietSpot: script.js 
// Sections: helpers, model, data, ui, spot-list, dashboard, spot-detail, events,
// palette, feed, feed-extras, reco, auth, main

// =====================================================
// helpers.js: Small helper functions used everywhere
// (DOM lookup, escaping text, time formatting).
// =====================================================

const $ = id => document.getElementById(id);
const CURRENT = document.body.dataset.page || 'home';   // which page file is open (set on <body data-page="...">)
const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };   // add a listener only if the element exists on this page
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const NOISE = ['', 'Quiet', 'Moderate', 'Loud'];
const CROWD = ['', 'Low', 'Medium', 'High'];
const fmtHour = h => (h % 12 || 12) + ((h % 24) < 12 ? ' AM' : ' PM');
const shortHour = h => (h % 12 || 12) + ((h % 24) < 12 ? 'a' : 'p');
const ago = ts => {
    const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
    if (m < 1)
        return 'just now';
    if (m < 60)
        return m + ' min ago';
    const h = Math.floor(m / 60);
    return h + (h === 1 ? ' hr ago' : ' hrs ago');
};
const busyCurve = (peak, w, base = 8) => Array.from({ length: 13 }, (_, i) => Math.min(100, Math.round(base + 85 * Math.exp(-((8 + i - peak) ** 2) / (2 * w * w)))));
const walk = m => Math.max(1, Math.ceil(m / 80)) + ' min';

// =====================================================
// model.js: OOP model: Spot classes 
// (Cafe, Library, StudyRoom...) and User.
// =====================================================

class Facility {
    constructor({ wifi = false, mbps = 0, outlets = false, aircon = false, food = false } = {}) { Object.assign(this, { wifi, mbps, outlets, aircon, food }); }
    checkFacility(k) { return !!this[k]; }
    displayFacilities() {
        return [
            { label: this.wifi ? `Wi-Fi (${this.mbps} Mbps, as listed)` : 'Wi-Fi', on: this.wifi },
            { label: 'Power outlets', on: this.outlets }, { label: 'Air-conditioning', on: this.aircon }, { label: 'Food available', on: this.food }
        ];
    }
}
class StudySpot {
    constructor(o) {
        Object.assign(this, {
            id: o.id, name: o.name, address: o.address, x: o.x, y: o.y, hours: o.hours, price: o.price, rules: o.rules || '', description: o.description || ''
        });
        this.facility = new Facility(o.fac);
        this.noise = o.noise;
        this.crowd = o.crowd;
        this.busy = o.busy || busyCurve(14, 4, 15);
        this.updatedAt = o.updatedAt || Date.now();
        this.reports = [];
        this.photos = [];
        this.isNew = !!o.isNew;
    }
    get kind() { return 'Study spot'; }
    get isOpen() { const h = new Date().getHours(); return h >= this.hours[0] && h < this.hours[1]; }
    priceLabel() { return this.price === 0 ? 'Free' : `₱${this.price}`; }
    extraInfo() { return ''; }
    addPhoto(p) {
        if (this.photos.length >= 12)
            throw new RangeError('A spot can have up to 12 photos. Remove one to add another.');
        this.photos.unshift(p);
    }
    removePhoto(id) { this.photos = this.photos.filter(p => p.id !== id); }
    distance(p) { return Math.round(Math.hypot(this.x - p.x, this.y - p.y) * 18); }
    updateStatus({ noise, crowd }) { this.noise = noise; this.crowd = crowd; this.updatedAt = Date.now(); }
    syncFrom(r) { this.noise = r.noise; this.crowd = r.crowd; this.updatedAt = r.ts; }
    displayInfo() { return `${this.name} (${this.kind}): ${NOISE[this.noise]} noise, ${CROWD[this.crowd]} crowd. ${this.extraInfo()}`.trim(); }
    bestTime() {
        const nowH = new Date().getHours(), start = Math.max(this.hours[0], Math.min(Math.max(nowH, 8), 20));
        let best = null;
        for (let h = start; h < Math.min(this.hours[1], 21); h++) {
            const v = this.busy[h - 8];
            if (best === null || v < best.v)
                best = { h, v };
        }
        return best;
    }
}
class Cafe extends StudySpot {
    get kind() { return 'Café'; }
    priceLabel() { return this.price === 0 ? 'No minimum' : `₱${this.price} min. purchase`; }
    extraInfo() { return 'Purchase expected while seated.'; }
}
class Library extends StudySpot {
    get kind() { return 'Library'; }
    extraInfo() { return 'Silence policy applies.'; }
}
class StudyRoom extends StudySpot {
    get kind() { return 'Study room'; }
    priceLabel() { return this.price === 0 ? 'Free' : `₱${this.price} per hour`; }
    extraInfo() { return ''; }
}
class CoworkingSpace extends StudySpot {
    get kind() { return 'Co-working space'; }
    priceLabel() { return this.price === 0 ? 'Free' : `₱${this.price} per hour`; }
    extraInfo() { return 'Day and hourly passes may be offered.'; }
}
const TYPES = { Cafe, Library, StudyRoom, CoworkingSpace };
class Photo {
    constructor(o) { Object.assign(this, { caption: '', mine: false }, o); }
}
class Report {
    constructor(o) { Object.assign(this, { note: '', up: 0, down: 0, mine: false, myVote: 0 }, o); }
    net() { return this.up - this.down; }
}
class User {
    constructor(name, type) { this.userName = name; this.userType = type; this.points = 20; this.favoriteSpots = new Set(); this.reportsMade = 0; this.spotsAdded = 0; this.photosAdded = 0; this.streak = 0; this.bestStreak = 0; }
    toggleFavorite(id) { if (this.favoriteSpots.has(id)) {
        this.favoriteSpots.delete(id);
        return false;
    } this.favoriteSpots.add(id); return true; }
    badges() {
        // have/need drive the progress bar on locked badges in the shelf
        const b = (id, name, desc, icon, have, need) => ({ id, name, desc, icon, have: Math.min(have, need), need, earned: have >= need });
        return [
            b('first', 'First report', 'Send your first update', 'chat', this.reportsMade, 1),
            b('scout', 'Spot scout', 'Add a new study spot', 'pin', this.spotsAdded, 1),
            b('photo', 'Photographer', 'Share a photo of a spot', 'camera', this.photosAdded, 1),
            b('fans', 'Favorites fan', 'Save 3 favorite spots', 'star', this.favoriteSpots.size, 3),
            b('trusted', 'Trusted reporter', 'Reach 50 points', 'shield', this.points, 50),
            b('century', 'Century club', 'Reach 100 points', 'gem', this.points, 100),
            b('roll', 'On a roll', 'Be active 3 days in a row', 'flame', this.bestStreak, 3),
            b('week', 'Week warrior', 'Be active 7 days in a row', 'bolt', this.bestStreak, 7)
        ];
    }
}

// =====================================================
// data.js: Sample spots and the shared app state.
// =====================================================

const mins = m => Date.now() - m * 60000;
let spots = [];
let rid = 1, pid = 1;
let loggedIn = false;
let nextPage = 'home';
let user = new User('Guest', 'Student');
const PUBLIC_PAGES = [
    'home', 
    'about', 
    'login', 
    'signup'
];
const state = {
    pos: {
         x: 40, 
         y: 35 
        },
    sel: null,
    dashSpot: null,
    ver: { spot: 'all', show: 'all' },   // Community verification filters on the dashboard
    f: {
        q: '', 
        noise: 'any', 
        crowd: 'any', 
        price: 'any', 
        sort: 'near',
        wifi: false, 
        outlets: false, 
        open: false, 
        saved: false
    }
};

const byId = id => spots.find(s => s.id == id);

async function loadSpotsFromJava() {
    try {
        const res = await fetch('/api/spots');
        if (!res.ok) throw new Error('Failed to load spots');
        const data = await res.json();

        spots = data.map(o => {
            const fac = o.fac || {};
            const base = {
                id: o.id,
                name: o.name,
                address: o.address,
                x: o.x,
                y: o.y,
                hours: o.hours,
                price: o.price,
                noise: o.noise,
                crowd: o.crowd,
                description: o.description || '',
                rules: o.rules || '',
                fac: {
                    wifi: !!fac.wifi,
                    mbps: fac.mbps || 0,
                    outlets: !!fac.outlets,
                    aircon: !!fac.aircon,
                    food: !!fac.food
                },
                updatedAt: Date.now()
            };

            //Create the correct subclass
            switch (o.type) {
            case 'Library':
                return new Library(base);
            case 'StudyRoom':
                return new StudyRoom(base);
            case 'CoworkingSpace':
                return new CoworkingSpace(base);
            default:
                return new Cafe(base);
            }
        });

        const photoMap = {
            "Libro Espresso": "images/libroespresso.jpg",
            "But First, Coffee": "images/butfirstcoffee.jpg",
            "BSU Student Area": "images/bsustudentarea.jpg",
            "BSU Library": "images/bsulibrary.jpg",
            "Batangas City Public Library and Information Center": "images/batangascitylibrary.jpg"
        };

        spots.forEach(s => {
            const src = photoMap[s.name];
            if (src) {
                s.photos = [{
                    id: pid++,
                    src: src,
                    caption: s.name,
                    mine: false
                }];
            }
        });

        console.log(`Loaded ${spots.length} spots from Java backend (with photos)`);
        return true;

    } catch (err) {
        console.error('Could not load spots from Java:', err);
        toast('Cannot connect to Java server. Make sure Main.java is running.');
        return false;
    }
}


// =====================================================
// ui.js: Theme (Light/Dark), toasts, dialogs, 
// and page navigation.
// =====================================================

function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    $('themeBtn').setAttribute('aria-checked', t === 'dark');
    $('themeLabel').textContent = t === 'dark' ? 'Dark' : 'Light';
    try {
        localStorage.setItem('qs-theme', t);
    }
    catch (e) { }
}
$('themeBtn').addEventListener('click', () => applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));
applyTheme(document.documentElement.getAttribute('data-theme'));
function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3000); }
function award(n, why) {
    user.points += n;
    track(n);          // counts toward today's streak and this week's leaderboard
    toast(`+${n} points: ${why}`);
    gameSync();        // unlock popups for new badges or levels
    renderDash();
    save();
}
function meter(lv, label, big) {
    let b = '';
    for (let i = 1; i <= 3; i++)
        b += `<i class="${i <= lv ? 'on' : ''}" style="height:${(big ? 10 : 6) + i * (big ? 6 : 4)}px"></i>`;
    return `<span class="meter lv${lv} ${big ? 'big' : ''}" role="img" aria-label="${label}">${b}</span>`;
}
function renderChip() {
    const c = $('whoChip');
    if (!c) return;
    if (!loggedIn) { c.textContent = `${user.userName}, ${user.points} pts`; c.classList.remove('rich'); return; }
    const L = levelOf(user.points), g = G(), done = g.last === dayKey(new Date());
    c.classList.add('rich');
    c.style.setProperty('--p', L.pct + '%');
    c.setAttribute('role', 'button');
    c.tabIndex = 0;
    c.title = L.next ? `${L.toNext} points to ${L.next.n}. Open your dashboard.` : 'Top level reached. Open your dashboard.';
    c.setAttribute('aria-label', `${user.userName}, level ${L.idx + 1} ${L.cur.n}, ${g.streak} day streak, ${user.points} points. Open dashboard.`);
    c.innerHTML = `<span class="who">${esc(user.userName)}</span><span class="lvl">Lv ${L.idx + 1}</span><span class="sk ${done ? '' : 'idle'}">${icon('flame')}${g.streak}</span><span>${user.points} pts</span>`;
    if (!c.dataset.bound) {
        c.dataset.bound = '1';
        const open = () => { if (CURRENT !== 'dash') go('dash'); };
        c.addEventListener('click', open);
        c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    }
}

// Which file each page name opens. Navigation now opens another HTML file.
const PAGE_FILES = {
    home: 'index.html', feed: 'feed.html', reco: 'reco.html', spots: 'spots.html',
    dash: 'dashboard.html', about: 'about.html', login: 'login.html', signup: 'signup.html'
};
function go(page, msg) {
    if (!PUBLIC_PAGES.includes(page) && !loggedIn) {
        nextPage = page;
        page = 'login';
        msg = msg || 'Please log in to continue.';
    }
    save();
    try {
        sessionStorage.setItem('qs-next', nextPage);
        if (msg) sessionStorage.setItem('qs-flash', msg);   // shown as a toast on the next page
    }
    catch (e) { }
    if (PAGE_FILES[page]) location.href = PAGE_FILES[page];
}

// =====================================================
// spot-list.js: Search/filter for the Spots page and 
// the table, map, and home renderers.
// =====================================================

function filtered() {
    const f = state.f;
    const list = spots.filter(s => (!f.q || (s.name + ' ' + s.kind).toLowerCase().includes(f.q.toLowerCase())) &&
        (f.noise === 'any' || s.noise <= +f.noise) && (f.crowd === 'any' || s.crowd <= +f.crowd) &&
        (f.price === 'any' || s.price <= +f.price) && (!f.wifi || s.facility.wifi) && (!f.outlets || s.facility.outlets) &&
        (!f.open || s.isOpen) && (!f.saved || user.favoriteSpots.has(s.id)));
    const p = state.pos;
    if (f.sort === 'near')
        list.sort((a, b) => a.distance(p) - b.distance(p));
    if (f.sort === 'quiet')
        list.sort((a, b) => (a.noise - b.noise) || (a.crowd - b.crowd));
    return list;
}
function readFilters() {
    const f = state.f;
    f.q = $('q').value.trim();
    f.noise = $('fNoise').value;
    f.crowd = $('fCrowd').value;
    f.price = $('fPrice').value;
    f.sort = $('fSort').value;
    f.wifi = $('cWifi').checked;
    f.outlets = $('cOutlets').checked;
    f.open = $('cOpen').checked;
    f.saved = $('cSaved').checked;
    renderRows();
    renderMap();
}
function clearFilters() {
    if (!$('q')) return;
    $('q').value = '';
    ['fNoise', 'fCrowd', 'fPrice'].forEach(i => $(i).value = 'any');
    $('fSort').value = 'near';
    ['cWifi', 'cOutlets', 'cOpen', 'cSaved'].forEach(i => $(i).checked = false);
    readFilters();
}
function renderHome() {
    if (!$('waiting')) return;
    const n = spots.filter(s => s.noise === 1).length;
    $('waiting').innerHTML = `<b>${n}</b> ${n === 1 ? 'spot is' : 'spots are'} quiet right now`;
}
function renderRows() {
    if (!$('rows')) return;
    const list = filtered();
    $('rows').innerHTML = list.length ? list.map(s => {
        const d = s.distance(state.pos), fav = user.favoriteSpots.has(s.id);
        return `<tr>
      <td><div class="rt">${s.photos.length ? `<img class="rthumb" src="${s.photos[0].src}" alt="Photo of ${esc(s.name)}">` : ''}<div><strong>${esc(s.name)}</strong>${s.isNew ? '<span class="tag solid">New</span>' : ''}<small>${esc(s.kind)}${s.isOpen ? '' : ', closed now'}${s.photos.length ? ', ' + s.photos.length + (s.photos.length === 1 ? ' photo' : ' photos') : ''}</small><span class="jv">${s.constructor.name} extends StudySpot</span></div></div></td>
      <td>${walk(d)}<small>${d} m</small></td>
      <td><span class="lv">${meter(s.noise, NOISE[s.noise] + ' noise')} ${NOISE[s.noise]}</span></td>
      <td><span class="lv">${meter(s.crowd, CROWD[s.crowd] + ' crowd')} ${CROWD[s.crowd]}</span></td>
      <td>${esc(s.priceLabel())}</td><td>${ago(s.updatedAt)}</td>
      <td><div class="acts">
        <button class="btn sm" data-act="view" data-id="${s.id}" aria-label="View ${esc(s.name)}">View</button>
        <button class="btn sm" data-act="report" data-id="${s.id}" aria-label="Report status of ${esc(s.name)}">Report</button>
        <button class="btn sm star" data-act="fav" data-id="${s.id}" aria-pressed="${fav}" aria-label="${fav ? 'Remove from favorites' : 'Save to favorites'}">${fav ? '★' : '☆'}</button>
      </div></td></tr>`;
    }).join('') : `<tr><td colspan="7" class="empty">No spots match these filters. <button class="btn sm" data-act="clear">Clear filters</button></td></tr>`;
}
function renderMap() {
    if (!$('map')) return;
    const match = new Set(filtered().map(s => s.id));
    let g = `<rect x="6" y="8" width="38" height="26" rx="3" fill="none" stroke="var(--ink)" stroke-width=".5" stroke-dasharray="2 1.5"/><text x="9" y="14" font-size="2.8" fill="var(--muted)">Campus (sample)</text>`;
    g += `<path d="M0 44 L100 40 M30 0 L34 70 M68 0 L72 70" stroke="var(--line)" stroke-width="2.4" fill="none"/>`;
    spots.forEach(s => {
        const sel = s.id === state.sel;
        g += `<g class="pin" data-act="view" data-id="${s.id}" tabindex="0" role="button" opacity="${match.has(s.id) ? 1 : .25}" aria-label="${esc(s.name)}">
      <circle cx="${s.x}" cy="${s.y}" r="4.6" fill="var(--ink)" stroke="var(--surface)" stroke-width="1"/>
      ${sel ? `<circle cx="${s.x}" cy="${s.y}" r="7" fill="none" stroke="var(--ink)" stroke-width=".7"/>` : ''}</g>`;
    });
    const p = state.pos;
    g += `<g aria-label="Your location"><rect x="${p.x - 2.4}" y="${p.y - 2.4}" width="4.8" height="4.8" transform="rotate(45 ${p.x} ${p.y})" fill="var(--surface)" stroke="var(--ink)" stroke-width="1"/><text x="${p.x}" y="${p.y + 7}" text-anchor="middle" font-size="2.8" font-weight="700" fill="var(--ink)" stroke="var(--surface2)" stroke-width="1" paint-order="stroke">You</text></g>`;
    $('map').innerHTML = g;
}

// =====================================================
// game.js: Levels, daily streaks, badge unlocks,
// the weekly leaderboard, and the unlock popup.
// Streaks and weekly points are kept per username in
// this browser (localStorage key "qs-game-v1").
// =====================================================

const GAME_KEY = 'qs-game-v1';
const LEVELS = [
    { n: 'Newcomer', min: 0 }, { n: 'Contributor', min: 30 }, { n: 'Trusted reporter', min: 50 },
    { n: 'Campus guide', min: 100 }, { n: 'Spot expert', min: 175 }, { n: 'QuietSpot legend', min: 300 }
];
const RIVALS = ['Mika', 'Paolo', 'Jen', 'Ria', 'Ana', 'Rico'];   // sample students for the weekly board
const STREAK_MARKS = [3, 7, 14, 30];
const ICONS = {
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    pin: '<path d="M12 21s-6-5.6-6-10a6 6 0 0 1 12 0c0 4.4-6 10-6 10z"/><circle cx="12" cy="11" r="2"/>',
    camera: '<path d="M3 8h4l2-3h6l2 3h4v11H3z"/><circle cx="12" cy="13" r="3.5"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
    gem: '<path d="M6 4h12l3 5-9 11L3 9z"/><path d="M3 9h18"/>',
    flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.2 2-4 0 2 1 2.5 1.5 2.5C10 9 10.5 5.5 12 3z"/>',
    bolt: '<path d="M13 2L5 14h6l-1 8 8-12h-6z"/>',
    level: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 16V8M9 11l3-3 3 3"/>'
};
const icon = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ICONS.star}</svg>`;

const dayKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
function weekStart(d = new Date()) {   // Monday 00:00 of this week
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() - (x.getDay() + 6) % 7);
    return x;
}

function levelOf(pts) {
    let idx = 0;
    LEVELS.forEach((l, i) => { if (pts >= l.min) idx = i; });
    const cur = LEVELS[idx], next = LEVELS[idx + 1];
    return { idx, cur, next, toNext: next ? next.min - pts : 0, pct: next ? Math.round((pts - cur.min) / (next.min - cur.min) * 100) : 100 };
}

// ---- saved progress (per username) ----
let game = null, gameFor = null;
function G() {
    if (gameFor !== user.userName) {
        gameFor = user.userName;
        let all = {};
        try { all = JSON.parse(localStorage.getItem(GAME_KEY)) || {}; } catch (e) { }
        game = Object.assign({ last: '', streak: 0, best: 0, days: [], wk: '', wkPts: 0, lvl: null, seen: null, fresh: [] }, all[gameFor] || {});
    }
    const wk = dayKey(weekStart());
    if (game.wk !== wk) { game.wk = wk; game.wkPts = 0; }                       // new week, board resets
    if (game.last && game.last !== dayKey(new Date()) && game.last !== dayKey(addDays(new Date(), -1))) game.streak = 0;   // missed a day
    return game;
}
function gameSave() {
    let all = {};
    try { all = JSON.parse(localStorage.getItem(GAME_KEY)) || {}; } catch (e) { }
    all[gameFor] = game;
    try { localStorage.setItem(GAME_KEY, JSON.stringify(all)); } catch (e) { }
}

// Call whenever the student does something that earns points.
function track(gain) {
    if (!loggedIn) return;
    const g = G(), today = dayKey(new Date());
    if (gain > 0) g.wkPts += gain;
    if (g.last !== today) {
        g.streak = g.last === dayKey(addDays(new Date(), -1)) ? g.streak + 1 : 1;
        g.last = today;
        g.best = Math.max(g.best, g.streak);
        g.days = [...g.days.filter(d => d !== today), today].slice(-21);
        if (STREAK_MARKS.includes(g.streak)) queueCelebration({ kind: 'streak', title: `${g.streak}-day streak`, sub: 'Come back tomorrow to keep it going.', icon: 'flame' });
    }
    gameSave();
}

// Looks for new badges and level-ups and celebrates them. Safe to call often.
function gameSync() {
    if (!loggedIn) { renderChip(); return; }
    const g = G();
    user.streak = g.streak;
    user.bestStreak = g.best;
    const all = user.badges(), earned = all.filter(b => b.earned).map(b => b.id), lvl = levelOf(user.points).idx;
    if (g.seen === null) { g.seen = earned; g.lvl = lvl; }   // first visit: record what they already have, no popups
    else {
        all.filter(b => b.earned && !g.seen.includes(b.id)).forEach(b => {
            g.fresh.push(b.id);
            queueCelebration({ kind: 'badge', title: 'Badge unlocked', sub: `${b.name}: ${b.desc}`, icon: b.icon });
        });
        if (lvl > g.lvl) queueCelebration({ kind: 'level', title: `Level ${lvl + 1} reached`, sub: LEVELS[lvl].n, icon: 'level' });
        g.seen = earned;
        g.lvl = lvl;
    }
    gameSave();
    renderChip();
}

// ---- weekly leaderboard (sample students grow through the week) ----
function rivalPts(name, wk) {
    let h = 0;
    for (const c of name + wk) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const now = new Date(), frac = ((now.getDay() + 6) % 7 + now.getHours() / 24) / 7;
    return Math.round((40 + h % 80) * Math.min(1, frac + 0.1));
}
function weeklyBoard() {
    const wk = dayKey(weekStart());
    const rows = [...RIVALS.map(n => ({ n, p: rivalPts(n, wk), me: false })), { n: user.userName, p: G().wkPts, me: true }];
    rows.sort((a, b) => b.p - a.p || (a.me ? 1 : -1));
    return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

// ---- unlock popup with confetti ----
const celebrateQ = [];
let celebrating = false;
function queueCelebration(c) { celebrateQ.push(c); if (!celebrating) nextCelebration(); }
function nextCelebration() {
    const c = celebrateQ.shift();
    if (!c) { celebrating = false; return; }
    celebrating = true;
    let host = $('celebrate');
    if (!host) {
        host = document.createElement('div');
        host.id = 'celebrate';
        host.setAttribute('popover', 'manual');   // top layer, so it also shows above open dialogs
        host.setAttribute('role', 'status');
        host.setAttribute('aria-live', 'polite');
        document.body.appendChild(host);
    }
    const bits = Array.from({ length: 22 }, (_, i) => {
        const a = i / 22 * Math.PI * 2 + Math.random() * .4, r = 60 + Math.random() * 70;
        return `<i class="k${i % 5}" style="--dx:${Math.round(Math.cos(a) * r)}px;--dy:${Math.round(Math.sin(a) * r)}px;--r:${Math.round(Math.random() * 720 - 360)}deg"></i>`;
    }).join('');
    host.innerHTML = `<div class="cele ${c.kind}"><span class="medal">${icon(c.icon)}</span><div><b>${esc(c.title)}</b><p>${esc(c.sub)}</p></div><span class="bits" aria-hidden="true">${bits}</span></div>`;
    try { if (host.showPopover && !host.matches(':popover-open')) host.showPopover(); } catch (e) { }
    const card = host.firstElementChild;
    let closed = false;
    const done = () => {
        if (closed) return;
        closed = true;
        card.classList.add('out');
        setTimeout(() => { try { if (host.hidePopover && !celebrateQ.length) host.hidePopover(); } catch (e) { } nextCelebration(); }, 260);
    };
    card.addEventListener('click', done);
    setTimeout(done, 3800);
}

// =====================================================
// dashboard.js: Dashboard page: points, badges, 
// leaderboard, verification.
// =====================================================

const verdict = r => r.net() >= 3 ? 'Verified' : r.net() <= -1 ? 'Disputed' : 'Needs votes';
function busyBars(s) {
    const nowH = new Date().getHours();
    return s.busy.map((v, i) => { const h = 8 + i; return `<div class="${h === nowH ? 'now' : ''}" title="${fmtHour(h)}: ${v}% busy"><b style="height:${Math.max(6, v * .72)}px"></b><span>${i % 2 === 0 ? shortHour(h) : ' '}</span></div>`; }).join('');
}
function renderStats() {
    const quiet = spots.filter(s => s.noise === 1).length;
    let verified = 0;
    spots.forEach(s => s.reports.forEach(r => { if (r.net() >= 3)
        verified++; }));
    $('stats').innerHTML = [
        ['Total spots', spots.length], ['Quiet right now', quiet], ['Verified reports', verified]
    ].map(([t, v]) => `<div class="card stat"><span>${t}</span><b>${v}</b></div>`).join('');
}
function renderProfilePanel() {
    if (!byId(state.dashSpot))
        state.dashSpot = spots[0].id;
    const s = byId(state.dashSpot), d = s.distance(state.pos), best = s.bestTime();
    const q = encodeURIComponent(s.name + ' Alangilan Batangas City');
    $('dProfile').innerHTML = `
    <h3 class="ph3">Spot profile</h3>
    <p class="meta" style="margin-bottom:10px">Everything about a place in one view: description, hours, location, facilities, rules, and busy hours.</p>
    <label class="f">Choose a spot<select id="dSpotSel">${spots.map(x => `<option value="${x.id}" ${x.id === s.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
    <h2 class="pname">${esc(s.name)}</h2>
    <p class="meta"><span class="tag" style="margin:0">${esc(s.kind)}</span> ${s.isNew ? '<span class="tag solid">New, unverified</span>' : ''}</p>
    <p class="desc">${s.description ? esc(s.description) : 'No description has been added for this place yet.'}</p>
    <dl class="det">
      <dt>Location</dt><dd>${esc(s.address)}, ${walk(d)} walk (${d} m)</dd>
      <dt>Opening hours</dt><dd>${fmtHour(s.hours[0])} to ${fmtHour(s.hours[1])}, ${s.isOpen ? 'open now' : 'closed now'}</dd>
      <dt>Price</dt><dd>${esc(s.priceLabel())}</dd>
      <dt>Rules</dt><dd>${s.rules ? esc(s.rules) : 'None listed'}</dd>
    </dl>
    <div class="status">
      <div><div class="lbl">Noise level</div><div class="val">${meter(s.noise, NOISE[s.noise], true)} ${NOISE[s.noise]}</div></div>
      <div><div class="lbl">Crowd level</div><div class="val">${meter(s.crowd, CROWD[s.crowd], true)} ${CROWD[s.crowd]}</div></div>
    </div>
    <h3 class="sec">Facilities</h3>
    <div class="facs">${s.facility.displayFacilities().map(f => `<span class="fac ${f.on ? '' : 'off'}">${esc(f.label)}</span>`).join('')}</div>
    <h3 class="sec">Usual busy hours</h3>
    <div class="bars" role="img" aria-label="Bar chart of usual busy hours from 8 AM to 8 PM. The hatched bar is the current hour.">${busyBars(s)}</div>
    <p class="meta">${best ? `Usually least busy around ${fmtHour(best.h)} from now until closing.` : 'Closed for the rest of today.'}</p>
    ${s.photos.length ? `<h3 class="sec">Photos (${s.photos.length})</h3><div class="strip">${s.photos.slice(0, 4).map(p => `<img src="${p.src}" alt="${esc(p.caption || 'Photo of ' + s.name)}">`).join('')}</div>` : ''}
    <div class="acts" style="margin-top:16px;flex-wrap:wrap">
      <button class="btn solid" data-act="view" data-id="${s.id}">All photos and reports</button>
      <button class="btn" data-act="report" data-id="${s.id}">Report status</button>
      <a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${q}">Google Maps</a>
      <a class="btn" target="_blank" rel="noopener" href="https://waze.com/ul?q=${q}">Waze</a>
    </div>`;
}
function renderPicks() {
    const p = state.pos, nowH = new Date().getHours();
    const ranked = [...spots].sort((x, y) => (y.isOpen - x.isOpen) || (x.noise - y.noise) || (x.crowd - y.crowd) || (x.distance(p) - y.distance(p))).slice(0, 4);
    const list = ranked.map((s, i) => {
        const d = s.distance(p);
        return `<li class="pick">
          <em>${i + 1}</em>
          ${s.photos.length ? `<img class="rthumb" src="${s.photos[0].src}" alt="">` : ''}
          <div class="pi">
            <b>${esc(s.name)}</b>
            <small>${esc(s.kind)}, ${walk(d)} walk (${d} m), ${s.isOpen ? 'open now' : 'closed now'}, updated ${ago(s.updatedAt)}</small>
            <div class="lvs"><span class="lv">${meter(s.noise, NOISE[s.noise] + ' noise')} ${NOISE[s.noise]}</span><span class="lv">${meter(s.crowd, CROWD[s.crowd] + ' crowd')} ${CROWD[s.crowd]} crowd</span></div>
          </div>
          <div class="acts"><button class="btn sm" data-act="view" data-id="${s.id}" aria-label="View ${esc(s.name)}">View</button><button class="btn sm solid" data-act="report" data-id="${s.id}" aria-label="Report status of ${esc(s.name)}">Report</button></div>
        </li>`;
    }).join('');

    // busy-hours heatmap: one row per spot, 8 AM to 8 PM
    const hours = Array.from({ length: 13 }, (_, i) => 8 + i);
    let best = null;
    spots.forEach(s => hours.forEach(h => {
        if (h < nowH || h < s.hours[0] || h >= s.hours[1]) return;
        const v = s.busy[h - 8];
        if (!best || v < best.v) best = { s, h, v };
    }));
    const rows = spots.map(s => `<div class="hn" title="${esc(s.name)}">${esc(s.name)}</div>` + hours.map(h => {
        const open = h >= s.hours[0] && h < s.hours[1], v = s.busy[h - 8];
        return `<i class="${open ? '' : 'off'} ${h === nowH ? 'now' : ''}" style="--v:${(v / 100).toFixed(2)}" title="${esc(s.name)}, ${fmtHour(h)}: ${open ? v + '% busy' : 'closed'}"></i>`;
    }).join('')).join('');

    $('dVerify').innerHTML = `
    <h3 class="ph3">Quietest right now</h3>
    <p class="meta" style="margin-bottom:12px">Open spots first, then the lowest noise, the lowest crowd, and the shortest walk from you.</p>
    ${ranked.length ? `<ol class="picks">${list}</ol>` : '<div class="empty">No spots yet. Add one from the Spots page.</div>'}
    <h3 class="sec">Busy hours across spots</h3>
    <p class="meta" style="margin-bottom:10px">${best ? `Best bet for the rest of today: <b style="color:var(--ink)">${esc(best.s.name)}</b> around ${fmtHour(best.h)} (${best.v}% busy).` : 'Every spot is closed for the rest of today.'}</p>
    <div class="heatwrap"><div class="heat" role="img" aria-label="Heatmap of usual busy hours for each spot from 8 AM to 8 PM. Darker means busier. The outlined column is the current hour.">
      <div></div>${hours.map((h, i) => `<span>${i % 2 === 0 ? shortHour(h) : ''}</span>`).join('')}${rows}
    </div></div>
    <p class="legend" style="margin-top:8px"><span class="lg"><i style="--v:.1"></i> Quiet</span><span class="lg"><i style="--v:.9"></i> Busy</span><span class="lg"><i class="off"></i> Closed</span></p>`;
}
let freshNow = new Set(), freshTimer = null;   // badges that should play the unlock animation on the shelf
function renderRewards() {
    const pts = user.points, L = levelOf(pts), g = G(), today = dayKey(new Date()), ws = weekStart();
    if (g.fresh.length) {
        g.fresh.forEach(id => freshNow.add(id));
        g.fresh = [];
        gameSave();
        clearTimeout(freshTimer);
        freshTimer = setTimeout(() => freshNow.clear(), 2500);
    }
    const week = Array.from({ length: 7 }, (_, i) => { const k = dayKey(addDays(ws, i)); return { l: 'MTWTFSS'[i], on: g.days.includes(k), now: k === today, future: k > today }; });
    const doneToday = g.last === today, CIRC = 276.5, off = (CIRC * (1 - L.pct / 100)).toFixed(1);
    const board = weeklyBoard(), me = board.find(x => x.me), above = board[me.rank - 2];
    const shown = board.slice(0, 5), left = Math.ceil((addDays(ws, 7) - new Date()) / 864e5);
    const row = x => `<li class="${x.me ? 'me' : ''}"><em>${x.rank}</em><span class="nm">${esc(x.n)}${x.me ? ' <span class="tag solid" style="margin:0">You</span>' : ''}</span><b>${x.p}</b></li>`;
    const earnedN = user.badges().filter(b => b.earned).length;
    const shelf = user.badges().map(b => {
        const fresh = freshNow.has(b.id);
        return `<div class="slot ${b.earned ? 'got' : 'locked'} ${fresh ? 'fresh' : ''}">
          <span class="medal">${icon(b.icon)}${fresh ? '<em class="newtag">New</em>' : ''}</span>
          <b>${esc(b.name)}</b><small>${esc(b.desc)}</small>
          ${b.earned ? '<span class="vh">Earned</span>' : `<span class="prog" role="progressbar" aria-label="Progress to ${esc(b.name)}" aria-valuenow="${b.have}" aria-valuemin="0" aria-valuemax="${b.need}"><i style="width:${Math.round(b.have / b.need * 100)}%"></i></span><small>${b.have} of ${b.need}</small>`}
        </div>`;
    }).join('');
    $('dRewards').innerHTML = `
    <h3 class="ph3">Gamification and rewards</h3>
    <p class="meta" style="margin-bottom:18px">Students who share accurate, helpful updates earn points, levels, streaks, and badges. Rewards are points and badges only.</p>
    <div class="rgrid">
      <div>
        <div class="lvlcard">
          <div class="ring" role="img" aria-label="Level ${L.idx + 1}, ${L.pct} percent to the next level">
            <svg viewBox="0 0 100 100"><circle class="trk" cx="50" cy="50" r="44"/><circle class="val" cx="50" cy="50" r="44" style="stroke-dasharray:${CIRC};stroke-dashoffset:${off};--full:${CIRC}"/></svg>
            <div><small>Level</small><b>${L.idx + 1}</b></div>
          </div>
          <div>
            <p class="lvname">${esc(L.cur.n)}</p>
            <p class="meta">${esc(user.userName)}, ${pts} points</p>
            <p class="meta">${L.next ? `${L.toNext} points to ${esc(L.next.n)}` : 'Top level reached.'}</p>
          </div>
        </div>
        <div class="streak ${doneToday ? 'done' : ''}">
          <div class="sline"><span class="flame">${icon('flame')}</span><div><b>${g.streak} day streak</b><small>${doneToday ? 'Counted for today. See you tomorrow.' : g.streak ? 'Send a report or rate a spot today to keep it.' : 'Do one thing today to start a streak.'}</small></div></div>
          <div class="wkdots" role="img" aria-label="Active days this week: ${week.filter(d => d.on).length} of 7">${week.map(d => `<span class="${d.on ? 'on' : ''} ${d.now ? 'now' : ''} ${d.future ? 'future' : ''}"><i></i>${d.l}</span>`).join('')}</div>
          <p class="meta">Best streak: ${g.best} ${g.best === 1 ? 'day' : 'days'}. ${user.reportsMade} reports, ${user.spotsAdded} spots added, ${user.photosAdded} photos.</p>
        </div>
      </div>
      <div>
        <h3 class="sec" style="margin-top:0">This week's leaderboard</h3>
        <p class="meta" style="margin-bottom:10px">${left <= 1 ? 'Resets at midnight tonight' : `Resets Monday, in ${left} days`}. Other students are sample data.</p>
        <ol class="wk">${shown.map(row).join('')}${me.rank > 5 ? `<li class="gap" aria-hidden="true">...</li>${row(me)}` : ''}</ol>
        <p class="meta" style="margin-top:8px">${above ? `${above.p - me.p + 1} points to pass ${esc(above.n)}.` : 'You lead the board this week.'}</p>
      </div>
      <div>
        <h3 class="sec" style="margin-top:0">How to earn points</h3>
        <ul class="earn">
          <li><b>+10</b> Send a status report</li>
          <li><b>+25</b> Add a new study spot</li>
          <li><b>+5</b> Share a photo of a spot</li>
          <li><b>+2</b> Another student upvotes your report</li>
          <li><b>+15</b> Your report is verified by the community</li>
        </ul>
        <p class="meta" style="margin-top:10px">Any of these also counts for today's streak.</p>
      </div>
    </div>
    <h3 class="sec">Badge shelf (${earnedN} of ${user.badges().length})</h3>
    <div class="shelf">${shelf}</div>`;
}
function renderDash() { if (!$('stats')) return; renderStats(); renderProfilePanel(); renderPicks(); renderRewards(); }

// =====================================================
// spot-detail.js: Spot detail popup, status reports, 
// votes, and the Add spot form.
// =====================================================

function renderTop() {
    const s = byId(state.sel);
    if (!s)
        return;
    const d = s.distance(state.pos), fav = user.favoriteSpots.has(s.id), best = s.bestTime(), nowH = new Date().getHours();
    const q = encodeURIComponent(s.name + ' Alangilan Batangas City');
    const bars = busyBars(s);
    $('dTop').innerHTML = `
    <div class="dhead">
      <div><h2>${esc(s.name)}</h2>
        <p class="meta"><span class="tag" style="margin:0">${esc(s.kind)}</span> ${s.isNew ? '<span class="tag solid">New, unverified</span>' : ''} ${esc(s.address)}</p>
        <p class="meta">${fmtHour(s.hours[0])} to ${fmtHour(s.hours[1])}, ${s.isOpen ? 'open now' : 'closed now'}. ${walk(d)} walk (${d} m).</p>
        ${s.description ? `<p style="margin:10px 0 0">${esc(s.description)}</p>` : ''}</div>
      <div class="acts" style="align-self:flex-start"><button class="btn sm star" data-act="fav" data-id="${s.id}" aria-pressed="${fav}">${fav ? '★ Saved' : '☆ Save spot'}</button>
      <button class="btn sm solid" data-act="report" data-id="${s.id}">Report status</button></div>
    </div>
    <div class="status" aria-live="polite">
      <div><div class="lbl">Noise level</div><div class="val">${meter(s.noise, NOISE[s.noise], true)} ${NOISE[s.noise]}</div></div>
      <div><div class="lbl">Crowd level</div><div class="val">${meter(s.crowd, CROWD[s.crowd], true)} ${CROWD[s.crowd]}</div></div>
      <div><div class="lbl">Price</div><div class="val" style="font-size:1.05rem">${esc(s.priceLabel())}</div><div class="lbl">Updated ${ago(s.updatedAt)}</div></div>
    </div>
    <h3 class="sec">Facilities</h3>
    <div class="facs">${s.facility.displayFacilities().map(f => `<span class="fac ${f.on ? '' : 'off'}">${esc(f.label)}</span>`).join('')}</div>
    ${s.rules ? `<h3 class="sec">Rules</h3><p class="meta">${esc(s.rules)}</p>` : ''}
    <h3 class="sec">Usual busy hours</h3>
    <div class="bars" role="img" aria-label="Bar chart of usual busy hours from 8 AM to 8 PM. The hatched bar is the current hour.">${bars}</div>
    <p class="meta">${best ? `Usually least busy around ${fmtHour(best.h)} from now until closing.` : 'Closed for the rest of today.'}</p>
    <div class="acts" style="margin-top:14px;flex-wrap:wrap">
      <a class="btn solid" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${q}">Directions in Google Maps</a>
      <a class="btn" target="_blank" rel="noopener" href="https://waze.com/ul?q=${q}">Open in Waze</a></div>`;
}
function renderReports() {
    const s = byId(state.sel);
    if (!s)
        return;
    $('dReports').innerHTML = `<h3 class="sec" style="margin-top:22px">Recent reports</h3>` +
        (s.reports.length ? s.reports.map(r => `<div class="report"><div>
      <p><strong>${esc(r.user)}${r.mine ? ' (you)' : ''}</strong> <span class="tag ${r.net() >= 3 ? 'solid' : ''}" style="margin-left:4px">${verdict(r)}</span> <span class="meta">${ago(r.ts)}</span></p>
      <p class="meta">${NOISE[r.noise]} noise, ${CROWD[r.crowd]} crowd${r.net() < 3 && r.net() > -1 ? `. Needs ${3 - r.net()} more ${3 - r.net() === 1 ? 'upvote' : 'upvotes'} to be verified` : ''}</p>${r.note ? `<p>${esc(r.note)}</p>` : ''}</div>
      <div class="votes" aria-label="Is this report accurate?">
        <button data-act="vote" data-id="${r.id}" data-dir="1" aria-pressed="${r.myVote === 1}" aria-label="Upvote, report is accurate" ${r.mine ? 'disabled' : ''}>▲</button>
        <span>${r.net()}</span>
        <button data-act="vote" data-id="${r.id}" data-dir="-1" aria-pressed="${r.myVote === -1}" aria-label="Downvote, report is not accurate" ${r.mine ? 'disabled' : ''}>▼</button>
      </div></div>`).join('') : '<div class="empty">No reports yet. Be the first to send an update.</div>') +
        ``;
}
function renderPhotos(keepErr) {
    const s = byId(state.sel);
    if (!s)
        return;
    const prevErr = keepErr && $('phErr') ? $('phErr').textContent : '';
    $('dPhotos').innerHTML = `<h3 class="sec" style="margin-top:22px">Photos of this spot (${s.photos.length})</h3>` +
        (s.photos.length ? `<div class="gallery">${s.photos.map(p => `<figure class="ph">
      <button data-act="zoom" data-id="${p.id}" aria-label="Enlarge photo by ${esc(p.user)}"><img src="${p.src}" alt="${esc(p.caption || 'Photo of ' + s.name)}"></button>
      <figcaption><span><b>${esc(p.mine ? 'You' : p.user)}</b><br>${esc(p.caption || ago(p.ts))}</span>${p.mine ? `<button class="rm" data-act="delphoto" data-id="${p.id}" aria-label="Remove your photo">Remove</button>` : ''}</figcaption></figure>`).join('')}</div>`
            : '<div class="empty">No photos yet. Add one so other students can see what this spot looks like.</div>') +
        `<div class="upload">
      <label class="f">Caption (optional)<input type="text" id="ph-cap" maxlength="60" placeholder="e.g. Back tables near the window"></label>
      <label class="filebtn">＋ Add photo<input type="file" id="ph-file" accept="image/*"></label>
    </div>
    <p class="err" id="phErr" role="alert">${esc(prevErr)}</p>`;
}
// Photo chosen in the Add spot form (kept until the spot is saved)
let addPhotoSrc = null;
function resetAddPhoto() {
    addPhotoSrc = null;
    if ($('a-photo')) $('a-photo').value = '';
    if ($('a-prev')) { $('a-prev').hidden = true; $('a-prev').removeAttribute('src'); }
    if ($('a-photoRm')) $('a-photoRm').hidden = true;
    if ($('a-photoLbl')) $('a-photoLbl').textContent = '＋ Choose photo';
}
async function pickAddPhoto(file) {
    const err = $('addErr');
    try {
        addPhotoSrc = await loadImage(file);
        $('a-prev').src = addPhotoSrc;
        $('a-prev').hidden = false;
        $('a-photoRm').hidden = false;
        $('a-photoLbl').textContent = 'Change photo';
        if (err) err.textContent = '';
    }
    catch (ex) {
        resetAddPhoto();
        if (err) err.textContent = ex.message;
    }
}
on('a-photoRm', 'click', resetAddPhoto);
function loadImage(file) {
    return new Promise((resolve, reject) => {
        if (!file.type.startsWith('image/'))
            return reject(new Error('Please choose an image file.'));
        if (file.size > 10 * 1024 * 1024)
            return reject(new Error('That image is over 10 MB. Choose a smaller one.'));
        const url = URL.createObjectURL(file), img = new Image();
        img.onload = () => {
            const max = 1200, k = Math.min(1, max / Math.max(img.width, img.height));
            const c = document.createElement('canvas');
            c.width = Math.round(img.width * k);
            c.height = Math.round(img.height * k);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            URL.revokeObjectURL(url);
            resolve(c.toDataURL('image/jpeg', 0.82));
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image. Try a JPG or PNG.')); };
        img.src = url;
    });
}
async function uploadPhoto(file) {
    const s = byId(state.sel), err = $('phErr');
    try {
        const src = await loadImage(file);
        s.addPhoto(new Photo({
            id: pid++, user: user.userName, mine: true, src, caption: $('ph-cap').value.trim(), ts: Date.now()
        }));
        user.photosAdded++;
        refreshAll();
        award(5, 'photo added');
    }
    catch (ex) {
        err.textContent = ex.message;
        $('ph-file').value = '';
    }
}
function openPhoto(photoId) {
    const s = byId(state.sel), p = s.photos.find(x => x.id === photoId);
    if (!p)
        return;
    $('lbImg').src = p.src;
    $('lbImg').alt = p.caption || 'Photo of ' + s.name;
    $('lbCap').textContent = `${p.mine ? 'You' : p.user}, ${ago(p.ts)}${p.caption ? ': ' + p.caption : ''}`;
    $('dlgPhoto').showModal();
}
function openSpot(id) { if (!requireLogin('Please log in to continue.')) return; state.sel = id; renderTop(); renderPhotos(); renderReports(); renderMap(); $('dlgSpot').showModal(); }
function refreshAll() { gameSync(); renderFeed(); renderHome(); renderRows(); renderMap(); renderDash(); renderChip(); save(); if ($('dlgSpot') && $('dlgSpot').open) {
    renderTop();
    renderPhotos(true);
    renderReports();
} }
function openReport(id) {
    if (!requireLogin('Please log in first to report a status.')) return;
    const s = byId(id);
    state.sel = id;
    $('reportForm').innerHTML = `
    <h2>Report status</h2><p class="sub">${esc(s.name)}: tell others what it's like right now.</p>
    <div class="fgrid">
      <div><div class="meta" style="margin-bottom:6px;font-weight:700">Noise</div><div class="seg" role="radiogroup" aria-label="Noise">${[1, 2, 3].map(n => `<label><input type="radio" name="r-noise" value="${n}" ${n === s.noise ? 'checked' : ''}><span>${NOISE[n]}</span></label>`).join('')}</div></div>
      <div><div class="meta" style="margin-bottom:6px;font-weight:700">Crowd</div><div class="seg" role="radiogroup" aria-label="Crowd">${[1, 2, 3].map(n => `<label><input type="radio" name="r-crowd" value="${n}" ${n === s.crowd ? 'checked' : ''}><span>${CROWD[n]}</span></label>`).join('')}</div></div>
      <label class="f">Note (optional)<input type="text" id="r-note" maxlength="100" placeholder="e.g. Outlets near the window are free"></label>
    </div>
    <p class="err" id="repErr" role="alert"></p>
    <div class="foot"><button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn solid">Send update (+10 points)</button></div>`;
    $('dlgReport').showModal();
}
on('reportForm', 'submit', async e => {
    e.preventDefault();

    const s = byId(state.sel);
    if (!s) return;

    const noiseEl = document.querySelector('input[name="r-noise"]:checked');
    const crowdEl = document.querySelector('input[name="r-crowd"]:checked');
    const noteEl  = $('r-note');
    const errEl   = $('repErr');

    if (errEl) errEl.textContent = '';

    if (!noiseEl || !crowdEl) {
        if (errEl) errEl.textContent = 'Please select both noise and crowd levels.';
        return;
    }

    const noise = +noiseEl.value;
    const crowd = +crowdEl.value;
    const note  = noteEl ? noteEl.value.trim() : '';

    try {
        const res = await fetch('/api/report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                username: user.userName,
                spotId: s.id,
                noise: noise,
                crowd: crowd,
                note: note
            })
        });

        const data = await res.json();

        if (!data.ok) {
            if (errEl) errEl.textContent = data.error || 'Report failed';
            toast(data.error || 'Report failed');
            return;
        }

        // Add the new report first
        const report = new Report({
            id: rid++,
            spotId: s.id,
            user: user.userName,
            noise, crowd, note,
            ts: Date.now(),
            up: 0, down: 0, mine: true
        });
        s.reports.unshift(report);

        // Average all reports for this spot
        if (s.reports.length > 0) {
            let noiseSum = 0, crowdSum = 0;
            s.reports.forEach(r => {
                noiseSum += r.noise;
                crowdSum += r.crowd;
            });
            const count = s.reports.length;
            s.noise = Math.round(noiseSum / count);
            s.crowd = Math.round(crowdSum / count);
        }
        s.updatedAt = Date.now();

        // Points (use the server's total when it is higher, never lower the student's points)
        user.reportsMade++;
        const gain = (typeof data.points === 'number' && data.points > user.points) ? data.points - user.points : 5;
        user.points += gain;
        track(gain);   // streak and weekly leaderboard

        toast(`Report submitted! +${gain} points`);
        $('dlgReport').close();
        refreshAll();
        save();

    } catch (err) {
        console.error(err);
        if (errEl) errEl.textContent = 'Cannot connect to Java server.';
        toast('Cannot connect to Java server.');
    }
});
on('addForm', 'submit', async e => {
    e.preventDefault();
    const err = $('addErr');
    err.textContent = '';

    try {
        const name = $('a-name').value.trim();
        if (name.length < 3)
            throw new Error('Enter a name with at least 3 characters.');
        if (spots.some(s => s.name.toLowerCase() === name.toLowerCase()))
            throw new Error('This spot is already listed.');

        const open  = +$('a-open').value;
        const close = +$('a-close').value;
        if (close <= open)
            throw new Error('Closing time must be later than opening time.');

        const price = Number($('a-price').value);
        const mbps  = Number($('a-mbps').value);
        if (!(price >= 0)) throw new Error('Price cannot be negative.');
        if (!(mbps  >= 0)) throw new Error('Wi-Fi speed cannot be negative.');

        const spotType = $('a-type').value;
        const address  = $('a-addr').value.trim() || 'Location pinned on the map';
        const noise    = +$('a-noise').value;
        const crowd    = +$('a-crowd').value;
        const outlets  = $('a-outlets').checked;
        const aircon   = $('a-aircon').checked;
        const food     = $('a-food').checked;
        const description = $('a-desc').value.trim();
        const rules       = $('a-rules').value.trim();

        // small random offset so pins don’t stack exactly on the user’s location
        const jit = () => (Math.random() - 0.5) * 8;
        const x = Math.min(94, Math.max(6, state.pos.x + jit()));
        const y = Math.min(64, Math.max(6, state.pos.y + jit()));

        // Send to backend first
        const res = await fetch('/api/add-spot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                type:        spotType,
                name,
                address,
                x, y,
                open, close,
                price,
                mbps,
                noise, crowd,
                outlets, aircon, food,
                description, rules
            })
        });

        const data = await res.json();
        if (!data.ok) {
            throw new Error(data.error || 'Could not add spot on the server.');
        }

        // Create local object with the REAL id
        const spot = new TYPES[spotType]({
            id: data.id,
            name, address, x, y,
            hours: [open, close],
            price,
            noise, crowd,
            rules, description,
            isNew: true,
            fac: {
                wifi: mbps > 0,
                mbps,
                outlets, aircon, food
            }
        });

        // Attach the chosen photo (if any) to the new spot
        if (addPhotoSrc) {
            spot.addPhoto(new Photo({
                id: pid++, user: user.userName, mine: true, src: addPhotoSrc, caption: name, ts: Date.now()
            }));
            user.photosAdded++;
        }

        spots.push(spot);
        user.spotsAdded++;

        $('addForm').reset();
        resetAddPhoto();
        fillHours();
        $('dlgAdd').close();
        clearFilters();
        state.sel = spot.id;
        refreshAll();
        award(25, 'new study spot added');
        save();

    } catch (ex) {
        err.textContent = ex.message;
    }
});
function vote(id, dir) {
    let found = null;
    spots.forEach(s => s.reports.forEach(r => { if (r.id === id)
        found = { s, r }; }));
    if (!found)
        return;
    const { s, r } = found;
    if (r.myVote === 1)
        r.up--;
    if (r.myVote === -1)
        r.down--;
    r.myVote = r.myVote === dir ? 0 : dir;
    if (r.myVote === 1)
        r.up++;
    if (r.myVote === -1)
        r.down++;
    if (r.net() <= -3) {
        s.reports = s.reports.filter(x => x !== r);
        if (s.reports[0])
            s.syncFrom(s.reports[0]);
        toast('Report removed after community downvotes. Status restored to the previous report.');
    }
    refreshAll();
}
function fillHours() {
    if (!$('a-open')) return;
    let o = '', c = '';
    for (let h = 5; h <= 23; h++)
        o += `<option value="${h}" ${h === 8 ? 'selected' : ''}>${fmtHour(h)}</option>`;
    for (let h = 6; h <= 24; h++)
        c += `<option value="${h}" ${h === 20 ? 'selected' : ''}>${fmtHour(h)}</option>`;
    $('a-open').innerHTML = o;
    $('a-close').innerHTML = c;
}

// =====================================================
// events.js: Click, keyboard, and form event listeners.
// =====================================================

document.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) {
        e.target.closest('dialog').close();
        return;
    }
    const el = e.target.closest('[data-act]');
    if (!el)
        return;
    const act = el.dataset.act, id = +el.dataset.id;
    if (act === 'go')
        go(el.dataset.page);
    if (act === 'go-search') {
        go('feed');
    }
    if (act === 'go-report') {
        if (requireLogin('Please log in first to report a status.', 'spots')) {
            go('spots', 'Choose a spot, then tap Report.');
        }
    }
    if (act === 'go-add') {
    if ($('dlgAdd')) {
        $('addErr').textContent = '';
        resetAddPhoto();
        fillHours();
        $('dlgAdd').showModal();
    }
    else {
        try { sessionStorage.setItem('qs-add', '1'); } catch (x) { }
        go('spots');
    }
}
    if (act === 'view')
        openSpot(id);
    if (act === 'report')
        openReport(id);
    if (act === 'fav') {
        const on = user.toggleFavorite(id);
        toast(on ? 'Saved to favorites' : 'Removed from favorites');
        refreshAll();
    }
    if (act === 'vote')
        vote(id, +el.dataset.dir);
    if (act === 'zoom')
        openPhoto(id);
    if (act === 'delphoto') {
        byId(state.sel).removePhoto(id);
        refreshAll();
        toast('Photo removed');
    }
    if (act === 'clear')
        clearFilters();
});
document.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.pin')) {
        e.preventDefault();
        openSpot(+e.target.dataset.id);
    }
});
if ($('map')) $('map').addEventListener('click', e => {
    if (e.target.closest('.pin'))
        return;
    const svg = $('map'), pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    state.pos = { x: Math.min(97, Math.max(3, p.x)), y: Math.min(67, Math.max(3, p.y)) };
    refreshAll();
    toast('Location updated. Distances recalculated.');
});
[
    'q', 'fNoise', 'fCrowd', 'fPrice', 'fSort', 'cWifi', 'cOutlets', 'cOpen', 'cSaved'
].forEach(i => on(i, i === 'q' ? 'input' : 'change', readFilters));
document.addEventListener('change', e => {
    const id = e.target.id;
    if (id === 'ph-file' && e.target.files[0])
        uploadPhoto(e.target.files[0]);
    if (id === 'a-photo' && e.target.files[0])
        pickAddPhoto(e.target.files[0]);
    if (id === 'dSpotSel') {
        state.dashSpot = +e.target.value;
        renderProfilePanel();
    }
});

// =====================================================
// palette.js: Color palette picker 
// (saved in the browser).
// =====================================================

(function () {
    const sel = document.getElementById('palette');
    let p = 'bw';
    try {
        p = localStorage.getItem('qs-palette') || 'bw';
    }
    catch (e) { }
    const apply = v => { document.documentElement.setAttribute('data-palette', v); sel.value = v; };
    apply(p);
    sel.addEventListener('change', () => {
        apply(sel.value);
        try {
            localStorage.setItem('qs-palette', sel.value);
        }
        catch (e) { }
    });
})();

// =====================================================
// feed.js: Feed page: spot posts with photo, rating, 
// and comments.
// =====================================================

const social = {};
const hsh = s => [...s.name].reduce((a, c) => a + c.charCodeAt(0), 0);
function soc(s) {
    if (!social[s.id]) {
        const h = hsh(s), count = 18 + h % 60, avg = 3.8 + (h % 11) / 10;
        const names = ['Mika', 'Jen', 'Paolo', 'Ana', 'Rico', 'Lea'];
        const lines = [
            'Tahimik dito, sakto pang review.', 'Maraming outlet, pero minsan puno na pag hapon.', 'May wifi naman pero mahina at mainit.', 'Sulit, at mabilis ang update ng mga reports.', 'Medyo maingay pag lunch break.', 'Maganda pumunta bago mag 10 am.'
        ];
        social[s.id] = {
            sum: Math.round(avg * count), count, mine: 0, open: false, draft: '',
            comments: [0, 1].map(i => ({
                user: names[(h + i * 2) % 6], text: lines[(h + i * 3) % 6], ts: Date.now() - (h % 50 + 5 + i * 37) * 60000
            }))
        };
    }
    social[s.id].comments.forEach((m, i) => {   // sample votes from other students, set once
        if (!m.mine && m.up === undefined && m.down === undefined) {
            const h = hsh(s);
            m.up = 1 + (h + i * 5) % 8;
            m.down = (h + i * 3) % 3;
        }
    });
    return social[s.id];
}
function spotArt(s) {
    const h = hsh(s) % 360, k = s.kind + ' ' + s.name, t = /caf|coffee|espresso|food|resto/i.test(k) ? 'c' : /lib|study room|reading/i.test(k) ? 'l' : 'd';
    const c = (l, sat) => `hsl(${h} ${sat || 40}% ${l}%)`;
    let g = `<rect width="640" height="400" fill="${c(88)}"/><rect y="280" width="640" height="120" fill="${c(68, 35)}"/><rect x="40" y="40" width="150" height="140" rx="8" fill="${c(97, 70)}" stroke="${c(35, 30)}" stroke-width="6"/><path d="M115 40v140M40 110h150" stroke="${c(35, 30)}" stroke-width="5"/>`;
    if (t === 'c') {
        [300, 420, 540].forEach(x => g += `<path d="M${x} 0v60" stroke="${c(30)}" stroke-width="4"/><circle cx="${x}" cy="74" r="22" fill="#F5C451"/>`);
        [250, 450].forEach(x => g += `<rect x="${x}" y="250" width="150" height="14" rx="6" fill="${c(30)}"/><path d="M${x + 75} 264v90" stroke="${c(30)}" stroke-width="10"/><rect x="${x + 55}" y="222" width="26" height="28" rx="5" fill="#fff"/><rect x="${x + 95}" y="228" width="24" height="22" rx="5" fill="#fff"/>`);
    }
    else if (t === 'l') {
        g += `<rect x="250" y="30" width="360" height="260" rx="6" fill="${c(30)}"/>`;
        [0, 1, 2].forEach(r => { let x = 262; for (let i = 0; i < 12; i++) {
            const w = 14 + (i * 7 + r * 5) % 12;
            g += `<rect x="${x}" y="${48 + r * 82}" width="${w}" height="64" fill="hsl(${(h + i * 37 + r * 60) % 360} 55% 60%)"/>`;
            x += w + 4;
        } });
    }
    else {
        [230, 430].forEach(x => g += `<rect x="${x}" y="240" width="170" height="16" rx="6" fill="${c(30)}"/><path d="M${x + 20} 256v100M${x + 150} 256v100" stroke="${c(30)}" stroke-width="10"/><rect x="${x + 45}" y="186" width="70" height="50" rx="5" fill="#2B3A4A"/><rect x="${x + 35}" y="236" width="90" height="6" rx="3" fill="#8A99A8"/>`);
    }
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400">${g}</svg>`);
}
// Comment votes: m.up and m.down are totals, m.vote is this student's own vote (1, -1 or 0).
const cmMine = m => m.vote ?? (m.liked ? 1 : 0);
const cmNet = m => (m.up || 0) - (m.down || 0);
function cmVote(m, dir) {
    const cur = cmMine(m);
    if (cur === 1) m.up = (m.up || 0) - 1;
    if (cur === -1) m.down = (m.down || 0) - 1;
    const next = cur === dir ? 0 : dir;
    if (next === 1) m.up = (m.up || 0) + 1;
    if (next === -1) m.down = (m.down || 0) + 1;
    m.vote = next;
    delete m.liked;
}
function renderFeed() {
    if (!$('feed')) return;
    const q = $('fq').value.trim().toLowerCase(), so = $('fsort').value, quiet = $('fquiet').checked, rt = x => soc(x).sum / soc(x).count;
    const list = spots.filter(s => (!q || (s.name + ' ' + s.kind).toLowerCase().includes(q)) && (!quiet || s.noise === 1));
    list.sort(so === 'rated' ? (a, b) => rt(b) - rt(a) : (a, b) => a.distance(state.pos) - b.distance(state.pos));
    if (!list.length) {
        $('feed').innerHTML = '<div class="empty">No spots match your search.</div>';
        return;
    }
    $('feed').innerHTML = list.map(s => {
        const sc = soc(s), avg = sc.sum / sc.count, fill = Math.round(sc.mine || avg), fav = user.favoriteSpots.has(s.id), d = s.distance(state.pos);
        const real = s.photos.length > 0, img = real ? s.photos[0].src : spotArt(s);
        const stars = [1, 2, 3, 4, 5].map(i => `<button class="star ${i <= fill ? 'on' : ''}" data-act="rate" data-id="${s.id}" data-n="${i}" aria-label="Rate ${i} of 5 stars">★</button>`).join('');
        const cms = sc.open ? `<div class="cms">${sc.comments.map((m, i) => `<div class="cm ${cmNet(m) <= -3 ? 'low' : ''}"><span class="av">${esc(m.user[0].toUpperCase())}</span><div class="bub"><b>${esc(m.user)}${m.mine ? ' (you)' : ''}</b> <small>${ago(m.ts)}</small><p>${esc(m.text)}</p><span class="cvote" role="group" aria-label="Votes on this comment"><button class="lk" data-act="cm-like" data-id="${s.id}" data-i="${i}" aria-pressed="${cmMine(m) === 1}" aria-label="Upvote, helpful. ${m.up || 0} upvotes" ${m.mine ? 'disabled' : ''}>▲ ${m.up || 0}</button><button class="lk" data-act="cm-down" data-id="${s.id}" data-i="${i}" aria-pressed="${cmMine(m) === -1}" aria-label="Downvote, not helpful. ${m.down || 0} downvotes" ${m.mine ? 'disabled' : ''}>▼ ${m.down || 0}</button></span>${m.mine ? `<button class="lk" data-act="cm-del" data-id="${s.id}" data-i="${i}">Delete</button>` : ''}${cmNet(m) <= -3 ? '<span class="lowtag">Downvoted by students</span>' : ''}</div></div>`).join('')}
      <div class="cmrow"><input type="text" class="cm-in" data-id="${s.id}" placeholder="Write feedback about this spot" value="${esc(sc.draft)}" aria-label="Comment on ${esc(s.name)}"><button class="btn solid sm" data-act="cm-post" data-id="${s.id}">Post</button></div></div>` : '';
        return `<article class="card post">
      <header><span class="av">${esc(s.name[0])}</span><div><h3>${esc(s.name)}</h3><small>${esc(s.kind)}${s.isOpen ? '' : ', closed now'} · ${Math.max(1, Math.round(d / 60))} min walk (${d} m)</small></div>${s.isNew ? '<span class="tag solid">New</span>' : ''}</header>
      <button class="pic" data-act="view" data-id="${s.id}" aria-label="Open details of ${esc(s.name)}"><img src="${img}" alt="${real ? 'Photo' : 'Illustration'} of ${esc(s.name)}">${real ? '' : '<span class="cap">Illustration · open the spot to add a real photo</span>'}</button>
      <div class="stat"><span class="lv">${meter(s.noise, NOISE[s.noise] + ' noise')} ${NOISE[s.noise]}</span><span class="lv">${meter(s.crowd, CROWD[s.crowd] + ' crowd')} ${CROWD[s.crowd]} crowd</span>${extra(s)}<small>Updated ${ago(s.updatedAt)}</small></div>
      <div class="rate"><span class="stars" role="group" aria-label="Rating">${stars}</span><b>${avg.toFixed(1)}</b><small>(${sc.count} ratings)${sc.mine ? ', you rated ' + sc.mine : ''}</small></div>
      <div class="acts"><button class="btn sm" data-act="cm-toggle" data-id="${s.id}">Comments (${sc.comments.length})</button><button class="btn sm" data-act="report" data-id="${s.id}">Report status</button><button class="btn sm" data-act="feed-photo" data-id="${s.id}">Add photo</button><button class="btn sm" data-act="share" data-id="${s.id}">Share</button><button class="btn sm" data-act="fav" data-id="${s.id}" aria-pressed="${fav}">${fav ? '★ Saved' : '☆ Save'}</button><button class="btn sm solid" data-act="view" data-id="${s.id}">Details</button></div>
      ${cms}</article>`;
    }).join('');
}
document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el)
        return;
    const a = el.dataset.act, s = byId(+el.dataset.id);
    if (a === 'rate') {
        const sc = soc(s), n = +el.dataset.n;
        if (sc.mine)
            sc.sum -= sc.mine;
        else {
            sc.count++;
            award(2, 'rating shared');
        }
        sc.sum += n;
        sc.mine = n;
        renderFeed();
    }
    if (a === 'cm-toggle') {
        const sc = soc(s);
        sc.open = !sc.open;
        renderFeed();
    }
    if (a === 'cm-post') {
        const sc = soc(s), txt = sc.draft.trim();
        if (!txt) {
            toast('Write a comment first.');
            return;
        }
        sc.comments.push({ user: user.userName, text: txt, ts: Date.now(), mine: true });
        sc.draft = '';
        sc.open = true;
        renderFeed();
        award(3, 'feedback shared');
    }
});
document.addEventListener('input', e => { if (e.target.classList.contains('cm-in'))
    soc(byId(+e.target.dataset.id)).draft = e.target.value; });
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList.contains('cm-in')) {
    e.preventDefault();
    e.target.nextElementSibling.click();
} });

// =====================================================
// feed-extras.js: Feed extras: Add photo, Share, 
// comment upvotes/delete, badges.
// =====================================================

function extra(s) {
    const left = s.hours[1] - new Date().getHours(), b = s.bestTime();
    return (s.isOpen && left <= 1 ? '<span class="chip">Closes soon</span>' : '') + (b ? `<span class="chip">Quietest around ${fmtHour(b.h)}</span>` : '');
}
const fp = document.createElement('input');
fp.type = 'file';
fp.accept = 'image/*';
fp.hidden = true;
document.body.appendChild(fp);
fp.addEventListener('change', () => { if (fp.files[0])
    uploadPhoto(fp.files[0]); fp.value = ''; });
document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el)
        return;
    const a = el.dataset.act, s = byId(+el.dataset.id), i = +el.dataset.i;
    if (a === 'feed-photo') {
        state.sel = s.id;
        fp.click();
    }
    if (a === 'share') {
        const t = `${s.name}: ${NOISE[s.noise]} noise right now (QuietSpot)`;
        try {
            navigator.clipboard.writeText(t).then(() => toast('Copied: ' + t), () => toast(t));
        }
        catch (x) {
            toast(t);
        }
    }
    if (a === 'cm-like' || a === 'cm-down') {
        const m = soc(s).comments[i];
        if (m.mine) return;
        cmVote(m, a === 'cm-like' ? 1 : -1);
        renderFeed();
    }
    if (a === 'cm-del') {
        soc(s).comments.splice(i, 1);
        renderFeed();
        toast('Comment deleted');
    }
});
['fq', 'fsort', 'fquiet'].forEach(i => on(i, i === 'fq' ? 'input' : 'change', renderFeed));

// =====================================================
// reco.js: Reco page: ranks spots by what the 
// student needs.
// =====================================================

const RC = [
    ['quiet', 'Quiet', 1], ['outlets', 'Power outlets', 1], ['wifi', 'Wi-Fi'], ['aircon', 'Air-conditioning'], ['cheap', 'Free or cheap'], ['open', 'Open now']
];
if ($('recoChecks')) $('recoChecks').innerHTML = RC.map(r => `<label><input type="checkbox" value="${r[0]}" ${r[2] ? 'checked' : ''}> ${r[1]}</label>`).join('');
on('recoChecks', 'change', renderReco);
function renderReco() {
    if (!$('recoOut')) return;
    const pick = [...document.querySelectorAll('#recoChecks input:checked')].map(x => x.value);
    const T = {
        quiet: s => s.noise === 1, outlets: s => s.facility.outlets, wifi: s => s.facility.wifi, aircon: s => s.facility.aircon, cheap: s => s.price <= 50, open: s => s.isOpen
    };
    if (!pick.length) {
        $('recoOut').innerHTML = '<div class="empty">Tick at least one need above.</div>';
        return;
    }
    const r = spots.map(s => ({ s, hit: pick.filter(p => T[p](s)) })).sort((a, b) => b.hit.length - a.hit.length || a.s.distance(state.pos) - b.s.distance(state.pos));
    $('recoOut').innerHTML = r.slice(0, 5).map(({ s, hit }, n) => { const pc = Math.round(hit.length / pick.length * 100); return `<article class="card post rcard"><div class="stat"><b>#${n + 1} ${esc(s.name)}</b><span class="chip">${pc}% match</span><small>${s.distance(state.pos)} m away</small></div><div class="match"><i style="width:${pc}%"></i></div><p class="sub" style="margin:8px 0 10px">Matches: ${hit.map(h => RC.find(x => x[0] === h)[1]).join(', ') || 'none'}</p><button class="btn sm solid" data-act="view" data-id="${s.id}">Details</button></article>`; }).join('');
}

// =====================================================
// auth.js: Login and Sign Up connected to Java 
// AuthService.
// =====================================================

// While logged out, only navigation and logout buttons work.
document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el || loggedIn || ['go', 'logout'].includes(el.dataset.act)) return;
    e.stopImmediatePropagation();
    requireLogin('Please log in to continue.', {'go-search': 'feed', 'go-report': 'spots'}[el.dataset.act]);
}, true);
function requireLogin(message, backTo) {
    if (loggedIn) return true;
    const open = [...document.querySelectorAll('.page')].find(p => !p.hidden);
    nextPage = backTo || (open && !/login|signup/.test(open.id) ? open.id.slice(2) : 'home');
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
    go('login', message);
    return false;
}
function authDone(name) {
    user = new User(name, 'Student');
    loggedIn = true;
    const b = $('authBtn');
    b.textContent = 'Logout';
    b.dataset.act = 'logout';
    refreshAll();
    const dest = nextPage;
    nextPage = 'home';
    go(dest, `Welcome, ${name}!`);
}
document.addEventListener('click', e => {
    if (!e.target.closest('[data-act="logout"]')) return;
    loggedIn = false;
    user = new User('Guest', 'Student');
    const b = $('authBtn');
    b.textContent = 'Login';
    b.dataset.act = 'go';
    b.dataset.page = 'login';
    refreshAll();
    go('home', 'Logged out.');
});
on('loginForm', 'submit', async e => {
    e.preventDefault();
    const u = $('l-user').value.trim();
    const p = $('l-pass').value;
    $('lErr').textContent = '';

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            body: new URLSearchParams({ username: u, password: p })
        });
        const data = await res.json();
        if (!data.ok) {
            $('lErr').textContent = data.error;
            return;
        }
        authDone(data.userName);
    } catch (err) {
        $('lErr').textContent = 'Cannot connect to Java server. Make sure Main.java is running.';
    }
});
on('signupForm', 'submit', async e => {
    e.preventDefault();
    const n = $('s-name').value.trim(), u = $('s-user').value.trim(), p = $('s-pass').value;
    if (!n || !u) {
        $('sErr').textContent = 'Full name and username are required.';
        return;
    }
    if (!/^\S+@\S+\.\S+$/.test($('s-mail').value.trim())) {
        $('sErr').textContent = 'Enter a valid email.';
        return;
    }
    $('sErr').textContent = '';

    try {
        const res = await fetch('/api/signup', {
            method: 'POST',
            body: new URLSearchParams({ username: u, password: p, userType: 'STUDENT' })
        });
        const data = await res.json();
        if (!data.ok) {
            $('sErr').textContent = data.error;
            return;
        }
        authDone(data.userName);
    } catch (err) {
        $('sErr').textContent = 'Cannot connect to Java server. Make sure Main.java is running.';
    }
});

// Sample reports from other students, added once per browser so the voting
// (verify / dispute) can be tried. They match each spot's current status.
function seedSampleReports() {
    let done = null;
    try { done = localStorage.getItem('qs-seed-v1'); } catch (e) { }
    if (done || !spots.length) return;
    const sets = [
        [['Mika', 2, 0, 12, 'Tahimik pa dito, kaunti lang ang tao.'], ['Jen', 3, 0, 95, 'Maraming outlet malapit sa bintana.']],
        [['Paolo', 1, 1, 25, 'Medyo maingay pag lunch break.'], ['Mika', 0, 2, 140, 'Puno na kanina, wala nang upuan.']],
        [['Jen', 2, 0, 8, 'Okay ang Wi-Fi at malamig ang aircon.'], ['Paolo', 0, 0, 60, 'Maganda pumunta bago mag 10 am.']]
    ];
    spots.forEach((s, i) => {
        if (s.reports.length) return;
        s.reports = sets[i % sets.length].map(([user, up, down, m, note]) =>
            new Report({ id: rid++, spotId: s.id, user, noise: s.noise, crowd: s.crowd, note, ts: mins(m), up, down }));
    });
    try { localStorage.setItem('qs-seed-v1', '1'); } catch (e) { }
}

// =====================================================
// main.js: Start-up: runs when the page loads.
// =====================================================

// Saved state: keeps login, points, spots, reports, photos, ratings between pages
const STORE = 'qs-data-v4';
const Social = {};
function save() {
    const data = {
        loggedIn, pos: state.pos, rid, pid, social,
        user: {
            userName: user.userName, userType: user.userType, points: user.points, fav: [...user.favoriteSpots],
            reportsMade: user.reportsMade, spotsAdded: user.spotsAdded, photosAdded: user.photosAdded
        },
        spots: spots.map(s => ({
            id: s.id, type: s.constructor.name, isNew: s.isNew, name: s.name, address: s.address, x: s.x, y: s.y, hours: s.hours,
            price: s.price, rules: s.rules, description: s.description, fac: { ...s.facility },
            noise: s.noise, crowd: s.crowd, busy: s.busy, updatedAt: s.updatedAt, reports: s.reports, photos: s.photos
        }))
    };
    try {
        localStorage.setItem(STORE, JSON.stringify(data));
    }
    catch (e) {
        try {   // probably too many photos for the browser's storage limit: save everything except photos
            data.spots.forEach(x => x.photos = []);
            localStorage.setItem(STORE, JSON.stringify(data));
        }
        catch (e2) { }
    }
}
function loadState() {
    try { nextPage = sessionStorage.getItem('qs-next') || 'home'; } catch (e) { }
    let d = null;
    try { d = JSON.parse(localStorage.getItem(STORE)); } catch (e) { }
    if (!d) return;
    try {
        loggedIn = !!d.loggedIn;
        if (d.pos) state.pos = d.pos;
        rid = Math.max(rid, d.rid || 1);
        pid = Math.max(pid, d.pid || 1);
        Object.assign(social, d.social || {});
        const u = d.user || {};
        user = new User(u.userName || 'Guest', u.userType || 'Student');
        Object.assign(user, { points: u.points ?? 20, reportsMade: u.reportsMade || 0, spotsAdded: u.spotsAdded || 0, photosAdded: u.photosAdded || 0 });
        user.favoriteSpots = new Set(u.fav || []);
        (d.spots || []).forEach(o => {
            let s = byId(o.id);
            if (!s) {   // a spot the user added earlier
                s = new (TYPES[o.type] || StudySpot)({ ...o, fac: o.fac });
                spots.push(s);
            }
            Object.assign(s, { noise: o.noise, crowd: o.crowd, updatedAt: o.updatedAt, busy: o.busy || s.busy });
            s.reports = (o.reports || []).map(r => new Report(r));
            if (o.photos && o.photos.length) s.photos = o.photos.map(p => new Photo(p));
        });
    }
    catch (e) { console.warn('Could not restore saved data', e); }
}
window.addEventListener('pagehide', save);

 
//=====================================================
//main.js: Start-up: runs when each page loads.
//=====================================================

loadState();
loadSpotsFromJava().then(ok => {
    if (!ok) return;
    loadState();   // restore saved photos, reports and added spots AFTER the spots are loaded from Java
    seedSampleReports();
    document.querySelectorAll('nav.main .pill').forEach(b =>
        b.setAttribute('aria-current', b.dataset.page === CURRENT ? 'page' : 'false')
    );

    if (loggedIn) {
        const b = $('authBtn');
        b.textContent = 'Logout';
        b.dataset.act = 'logout';
    }

    if (!PUBLIC_PAGES.includes(CURRENT) && !loggedIn) {
        go(CURRENT);
    } else {
        refreshAll();
        fillHours();
        if (CURRENT === 'reco') renderReco();

        let flash = null, wantAdd = false;
        try {
            flash = sessionStorage.getItem('qs-flash');
            wantAdd = sessionStorage.getItem('qs-add');
            sessionStorage.removeItem('qs-flash');
            sessionStorage.removeItem('qs-add');
        } catch (e) {}

        if (flash) toast(flash);
        if (wantAdd && $('dlgAdd') && loggedIn) {
            $('addErr').textContent = '';
            resetAddPhoto();
            fillHours();
            $('dlgAdd').showModal();
        }
    }
});