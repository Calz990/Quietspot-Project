/* QuietSpot: script.js
   Sections: helpers, model, data, ui, spot-list, dashboard, spot-detail, events,
   palette, feed, feed-extras, reco, auth, main */

/*
=====================================================
helpers.js: Small helper functions used everywhere (DOM lookup, escaping text, time formatting).
=====================================================
*/

const $ = id => document.getElementById(id);
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

/* 
=====================================================
model.js: OOP model: Spot classes (Cafe, Library, StudyRoom...) and User.
=====================================================
*/

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
    #seats = 0;
    constructor(o) {
        Object.assign(this, {
            id: o.id, name: o.name, address: o.address, x: o.x, y: o.y, hours: o.hours, price: o.price, capacity: o.capacity, rules: o.rules || '', description: o.description || ''
        });
        this.facility = new Facility(o.fac);
        this.seats = o.seats;
        this.noise = o.noise;
        this.crowd = o.crowd;
        this.busy = o.busy || busyCurve(14, 4, 15);
        this.updatedAt = o.updatedAt || Date.now();
        this.reports = [];
        this.photos = [];
        this.isNew = !!o.isNew;
    }
    get seats() { return this.#seats; }
    set seats(v) {
        if (!Number.isInteger(v))
            throw new TypeError('Seats must be a whole number.');
        if (v < 0 || v > this.capacity)
            throw new RangeError(`Seats must be between 0 and ${this.capacity}.`);
        this.#seats = v;
    }
    get kind() { return 'Study spot'; }
    get isOpen() { const h = new Date().getHours(); return h >= this.hours[0] && h < this.hours[1]; }
    priceLabel() { return this.price === 0 ? 'Free' : `₱${this.price}`; }
    extraInfo() { return ''; }
    checkAvailability() { return this.#seats > 0; }
    addPhoto(p) {
        if (this.photos.length >= 12)
            throw new RangeError('A spot can have up to 12 photos. Remove one to add another.');
        this.photos.unshift(p);
    }
    removePhoto(id) { this.photos = this.photos.filter(p => p.id !== id); }
    distance(p) { return Math.round(Math.hypot(this.x - p.x, this.y - p.y) * 18); }
    updateStatus({ noise, crowd, seats }) { this.seats = seats; this.noise = noise; this.crowd = crowd; this.updatedAt = Date.now(); }
    syncFrom(r) { this.seats = r.seats; this.noise = r.noise; this.crowd = r.crowd; this.updatedAt = r.ts; }
    displayInfo() { return `${this.name} (${this.kind}): ${this.#seats}/${this.capacity} seats, ${NOISE[this.noise]} noise, ${CROWD[this.crowd]} crowd. ${this.extraInfo()}`.trim(); }
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
    extraInfo() { return 'Room-based seating.'; }
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
    constructor(name, type) { this.userName = name; this.userType = type; this.points = 20; this.favoriteSpots = new Set(); this.reportsMade = 0; this.spotsAdded = 0; this.photosAdded = 0; }
    toggleFavorite(id) { if (this.favoriteSpots.has(id)) {
        this.favoriteSpots.delete(id);
        return false;
    } this.favoriteSpots.add(id); return true; }
    badges() {
        return [
            { name: 'First report', desc: 'Send your first update', earned: this.reportsMade >= 1 },
            {
                name: 'Spot scout', desc: 'Add a new study spot', earned: this.spotsAdded >= 1
            },
            {
                name: 'Photographer', desc: 'Share a photo of a spot', earned: this.photosAdded >= 1
            },
            {
                name: 'Trusted reporter', desc: 'Reach 50 points', earned: this.points >= 50
            },
            {
                name: 'Favorites fan', desc: 'Save 3 favorite spots', earned: this.favoriteSpots.size >= 3
            }
        ];
    }
}

/* =====================================================
   data.js: Sample spots and the shared app state.
   ===================================================== */

const mins = m => Date.now() - m * 60000;
const spots = [
    new Library({
        id: 1, name: 'Hall of Books Library', address: 'Near the campus main gate', x: 36, y: 28, hours: [8, 19], price: 0, capacity: 60, seats: 24, noise: 1, crowd: 2,
        fac: { wifi: true, mbps: 15, outlets: true, aircon: true }, description: 'A large air-conditioned reading hall with long shared tables and individual carrels. Staff enforce a strict silence policy, so it suits deep focus and exam review.', rules: 'Silence. No calls. Food and drinks are not allowed.', busy: busyCurve(13, 3), updatedAt: mins(8)
    }),
    new Cafe({
        id: 2, name: 'Kape Tahimik Café', address: 'Corner of the main road', x: 62, y: 36, hours: [9, 22], price: 120, capacity: 28, seats: 6, noise: 2, crowd: 3,
        fac: { wifi: true, mbps: 30, outlets: true, aircon: true, food: true }, description: 'A cozy café with window-side tables and plenty of outlets. It gets lively in the late afternoon, so go earlier if you need it quiet.', rules: 'Order at least one item. Keep calls short.', busy: busyCurve(16, 4), updatedAt: mins(12)
    }),
    new StudyRoom({
        id: 3, name: 'Sulok Study Room', address: 'Second floor, near the dorms', x: 24, y: 50, hours: [8, 21], price: 40, capacity: 12, seats: 5, noise: 1, crowd: 1,
        fac: { wifi: true, mbps: 20, outlets: true, aircon: true }, description: 'Small rooms rented by the hour on the second floor of a building near the dorms. Solo study only, with desk lamps and an almost silent atmosphere.', rules: 'Quiet room. Group discussions are not allowed.', busy: busyCurve(18, 3), updatedAt: mins(25)
    }),
    new CoworkingSpace({
        id: 4, name: 'Hub 8 Co-working', address: 'Beside the pharmacy', x: 70, y: 58, hours: [8, 22], price: 80, capacity: 40, seats: 18, noise: 2, crowd: 2,
        fac: { wifi: true, mbps: 80, outlets: true, aircon: true, food: true }, description: 'A modern co-working space with hot desks, phone booths for calls, and the fastest Wi-Fi on this list. Good for group work and long sessions.', rules: 'Phone booths available for calls.', busy: busyCurve(11, 3), updatedAt: mins(5)
    }),
    new Cafe({
        id: 5, name: 'Tambayan Café', address: 'Across the engineering building', x: 48, y: 18, hours: [10, 21], price: 90, capacity: 20, seats: 0, noise: 3, crowd: 3,
        fac: { wifi: true, mbps: 10, food: true }, description: 'A student hangout across from the engineering building with cheap snacks and a busy crowd. Better for casual review than deep focus.', rules: 'Order at least one item.', busy: busyCurve(15, 4), updatedAt: mins(3)
    }),
    new Cafe({
        id: 6, name: 'Pahinga Corner Café', address: 'Side street, five minutes from the gate', x: 82, y: 24, hours: [8, 20], price: 60, capacity: 16, seats: 9, noise: 2, crowd: 1,
        fac: { outlets: true, aircon: true, food: true }, description: 'A calm side-street café with no Wi-Fi, which keeps it quiet. Good for reading, handwritten notes, and paperwork.', rules: 'No Wi-Fi. Good for reading and paperwork.', busy: busyCurve(14, 3), updatedAt: mins(40)
    })
];
const byId = id => spots.find(s => s.id === id);
let rid = 1, pid = 1;
[
    [1, 'Mika', 1, 2, 24, 'Reading Hall is calm, back tables are free.', 8, 4, 0], [1, 'Paolo', 1, 1, 30, '', 95, 2, 0],
    [2, 'Jen', 2, 3, 6, 'Almost full. Outlets near the window are taken.', 12, 3, 1], [2, 'Anon', 1, 1, 20, 'Quiet now', 70, 1, 2],
    [3, 'Ria', 1, 1, 5, 'Good for solo review.', 25, 5, 0], [4, 'Paolo', 2, 2, 18, 'Phone booths are open.', 5, 2, 0],
    [5, 'Mika', 3, 3, 0, 'Full and loud, skip it.', 3, 6, 0], [6, 'Jen', 2, 1, 9, 'Empty, no Wi-Fi though.', 40, 1, 0]
].forEach(([spotId, user, noise, crowd, seats, note, m, up, down]) => byId(spotId).reports.push(new Report({ id: rid++, spotId, user, noise, crowd, seats, note, ts: mins(m), up, down })));
let user = new User('Guest', 'Student');
let loggedIn = false, nextPage = 'home';
const PUBLIC_PAGES = ['home', 'about', 'login', 'signup'];   // everything else needs a login
const state = {
    sel: null, dashSpot: 1, ver: { spot: 'all', show: 'all' }, pos: { x: 50, y: 52 }, f: {
        q: '', noise: 'any', crowd: 'any', price: 'any', sort: 'near', wifi: false, outlets: false, seats: false, open: false, saved: false
    }
};

/* =====================================================
   ui.js: Theme (Light/Dark), toasts, dialogs, and page navigation.
   ===================================================== */

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
    const before = user.badges().filter(b => b.earned).length;
    user.points += n;
    const after = user.badges().filter(b => b.earned).length;
    toast(`+${n} points: ${why}` + (after > before ? '. New badge unlocked!' : ''));
    renderChip();
    renderDash();
}
function meter(lv, label, big) {
    let b = '';
    for (let i = 1; i <= 3; i++)
        b += `<i class="${i <= lv ? 'on' : ''}" style="height:${(big ? 10 : 6) + i * (big ? 6 : 4)}px"></i>`;
    return `<span class="meter lv${lv} ${big ? 'big' : ''}" role="img" aria-label="${label}">${b}</span>`;
}
function seatPill(s) {
    if (s.seats === 0)
        return '<span class="seat full">Full</span>';
    if (s.seats / s.capacity <= 0.2)
        return `<span class="seat low">${s.seats} left</span>`;
    return `<span class="seat">${s.seats} open</span>`;
}
function renderChip() { $('whoChip').textContent = `${user.userName}, ${user.points} pts`; }
function go(page) {
    if (!PUBLIC_PAGES.includes(page) && !loggedIn) {
        nextPage = page;
        page = 'login';
        toast('Please log in to continue.');
    }
    ['home', 'feed', 'reco', 'login', 'signup', 'spots', 'dash', 'about'].forEach(p => $('p-' + p).hidden = p !== page);
    document.querySelectorAll('nav.main .pill').forEach(b => b.setAttribute('aria-current', b.dataset.page === page ? 'page' : 'false'));
    if (page === 'feed')
        renderFeed();
    if (page === 'reco')
        renderReco();
    if (page === 'dash')
        renderDash();
    window.scrollTo(0, 0);
}

/* =====================================================
   spot-list.js: Search/filter for the Spots page and the table, map, and home renderers.
   ===================================================== */

function filtered() {
    const f = state.f;
    const list = spots.filter(s => (!f.q || (s.name + ' ' + s.kind).toLowerCase().includes(f.q.toLowerCase())) &&
        (f.noise === 'any' || s.noise <= +f.noise) && (f.crowd === 'any' || s.crowd <= +f.crowd) &&
        (f.price === 'any' || s.price <= +f.price) && (!f.wifi || s.facility.wifi) && (!f.outlets || s.facility.outlets) &&
        (!f.seats || s.checkAvailability()) && (!f.open || s.isOpen) && (!f.saved || user.favoriteSpots.has(s.id)));
    const p = state.pos;
    if (f.sort === 'near')
        list.sort((a, b) => a.distance(p) - b.distance(p));
    if (f.sort === 'quiet')
        list.sort((a, b) => (a.noise - b.noise) || (a.crowd - b.crowd));
    if (f.sort === 'seats')
        list.sort((a, b) => b.seats - a.seats);
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
    f.seats = $('cSeats').checked;
    f.open = $('cOpen').checked;
    f.saved = $('cSaved').checked;
    renderRows();
    renderMap();
}
function clearFilters() {
    $('q').value = '';
    ['fNoise', 'fCrowd', 'fPrice'].forEach(i => $(i).value = 'any');
    $('fSort').value = 'near';
    ['cWifi', 'cOutlets', 'cSeats', 'cOpen', 'cSaved'].forEach(i => $(i).checked = false);
    readFilters();
}
function renderHome() {
    const n = spots.filter(s => s.checkAvailability()).length;
    $('waiting').innerHTML = `<b>${n}</b> ${n === 1 ? 'spot has' : 'spots have'} open seats right now`;
}
function renderRows() {
    const list = filtered();
    $('rows').innerHTML = list.length ? list.map(s => {
        const d = s.distance(state.pos), fav = user.favoriteSpots.has(s.id);
        return `<tr>
      <td><div class="rt">${s.photos.length ? `<img class="rthumb" src="${s.photos[0].src}" alt="Photo of ${esc(s.name)}">` : ''}<div><strong>${esc(s.name)}</strong>${s.isNew ? '<span class="tag solid">New</span>' : ''}<small>${esc(s.kind)}${s.isOpen ? '' : ', closed now'}${s.photos.length ? ', ' + s.photos.length + (s.photos.length === 1 ? ' photo' : ' photos') : ''}</small><span class="jv">${s.constructor.name} extends StudySpot</span></div></div></td>
      <td>${walk(d)}<small>${d} m</small></td>
      <td><span class="lv">${meter(s.noise, NOISE[s.noise] + ' noise')} ${NOISE[s.noise]}</span></td>
      <td><span class="lv">${meter(s.crowd, CROWD[s.crowd] + ' crowd')} ${CROWD[s.crowd]}</span></td>
      <td>${seatPill(s)}</td><td>${esc(s.priceLabel())}</td><td>${ago(s.updatedAt)}</td>
      <td><div class="acts">
        <button class="btn sm" data-act="view" data-id="${s.id}" aria-label="View ${esc(s.name)}">View</button>
        <button class="btn sm" data-act="report" data-id="${s.id}" aria-label="Report status of ${esc(s.name)}">Report</button>
        <button class="btn sm star" data-act="fav" data-id="${s.id}" aria-pressed="${fav}" aria-label="${fav ? 'Remove from favorites' : 'Save to favorites'}">${fav ? '★' : '☆'}</button>
      </div></td></tr>`;
    }).join('') : `<tr><td colspan="8" class="empty">No spots match these filters. <button class="btn sm" data-act="clear">Clear filters</button></td></tr>`;
}
function renderMap() {
    const match = new Set(filtered().map(s => s.id));
    let g = `<rect x="6" y="8" width="38" height="26" rx="3" fill="none" stroke="var(--ink)" stroke-width=".5" stroke-dasharray="2 1.5"/><text x="9" y="14" font-size="2.8" fill="var(--muted)">Campus (sample)</text>`;
    g += `<path d="M0 44 L100 40 M30 0 L34 70 M68 0 L72 70" stroke="var(--line)" stroke-width="2.4" fill="none"/>`;
    spots.forEach(s => {
        const sel = s.id === state.sel;
        g += `<g class="pin" data-act="view" data-id="${s.id}" tabindex="0" role="button" opacity="${match.has(s.id) ? 1 : .25}" aria-label="${esc(s.name)}, ${s.seats} seats open">
      <circle cx="${s.x}" cy="${s.y}" r="4.6" fill="var(--ink)" stroke="var(--surface)" stroke-width="1"/>
      ${sel ? `<circle cx="${s.x}" cy="${s.y}" r="7" fill="none" stroke="var(--ink)" stroke-width=".7"/>` : ''}
      <text x="${s.x}" y="${s.y + 1.2}" text-anchor="middle" font-size="3.4" font-weight="700" fill="var(--on-ink)">${s.seats}</text></g>`;
    });
    const p = state.pos;
    g += `<g aria-label="Your location"><rect x="${p.x - 2.4}" y="${p.y - 2.4}" width="4.8" height="4.8" transform="rotate(45 ${p.x} ${p.y})" fill="var(--surface)" stroke="var(--ink)" stroke-width="1"/><text x="${p.x}" y="${p.y + 7}" text-anchor="middle" font-size="2.8" font-weight="700" fill="var(--ink)" stroke="var(--surface2)" stroke-width="1" paint-order="stroke">You</text></g>`;
    $('map').innerHTML = g;
}

/* =====================================================
   dashboard.js: Dashboard page: points, badges, leaderboard, verification.
   ===================================================== */

const BOARD = [['Mika', 85], ['Paolo', 62], ['Jen', 48], ['Ria', 35]];
const LEVELS = [
    { n: 'Newcomer', min: 0 }, { n: 'Contributor', min: 30 }, { n: 'Trusted reporter', min: 50 }, { n: 'Campus guide', min: 100 }
];
const verdict = r => r.net() >= 3 ? 'Verified' : r.net() <= -1 ? 'Disputed' : 'Needs votes';
function busyBars(s) {
    const nowH = new Date().getHours();
    return s.busy.map((v, i) => { const h = 8 + i; return `<div class="${h === nowH ? 'now' : ''}" title="${fmtHour(h)}: ${v}% busy"><b style="height:${Math.max(6, v * .72)}px"></b><span>${i % 2 === 0 ? shortHour(h) : '&nbsp;'}</span></div>`; }).join('');
}
function renderStats() {
    const quiet = spots.filter(s => s.noise === 1).length, open = spots.filter(s => s.checkAvailability()).length;
    let verified = 0;
    spots.forEach(s => s.reports.forEach(r => { if (r.net() >= 3)
        verified++; }));
    $('stats').innerHTML = [
        ['Total spots', spots.length], ['Quiet right now', quiet], ['With open seats', open], ['Verified reports', verified]
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
      <div><div class="lbl">Open seats</div><div class="val">${s.seats} <small>of ${s.capacity}</small></div></div>
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
function renderVerify() {
    const v = state.ver, all = [];
    spots.forEach(s => s.reports.forEach(r => all.push({ s, r })));
    all.sort((a, b) => b.r.ts - a.r.ts);
    const verified = all.filter(x => x.r.net() >= 3).length, pct = all.length ? Math.round(verified / all.length * 100) : 0;
    const list = all.filter(({ s, r }) => (v.spot === 'all' || s.id === +v.spot) && (v.show === 'all' || verdict(r) === v.show));
    $('dVerify').innerHTML = `
    <h3 class="ph3">Community verification</h3>
    <p class="meta" style="margin-bottom:12px">Upvote reports that match what you see and downvote the ones that don't. A report is Verified at +3 net votes and removed at −3.</p>
    <div class="meta"><b style="color:var(--ink)">${verified} of ${all.length}</b> reports verified</div>
    <div class="bar2" style="margin-top:6px" role="progressbar" aria-label="Share of verified reports" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
    <div class="fgrid" style="margin:14px 0 4px">
      <label class="f">Spot<select id="vSpot"><option value="all">All spots</option>${spots.map(s => `<option value="${s.id}" ${String(s.id) === String(v.spot) ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
      <label class="f">Show<select id="vShow">${[
        ['all', 'All reports'], ['Needs votes', 'Needs votes'], ['Disputed', 'Disputed'], ['Verified', 'Verified']
    ].map(([val, l]) => `<option value="${val}" ${val === v.show ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>
    <div class="vlist">${list.length ? list.map(({ s, r }) => `<div class="report"><div>
      <p><strong>${esc(s.name)}</strong> <span class="tag ${r.net() >= 3 ? 'solid' : ''}" style="margin-left:4px">${verdict(r)}</span></p>
      <p class="meta">${esc(r.mine ? user.userName + ' (you)' : r.user)}: ${NOISE[r.noise]} noise, ${CROWD[r.crowd]} crowd, ${r.seats} open seats, ${ago(r.ts)}</p>
      ${r.note ? `<p>${esc(r.note)}</p>` : ''}</div>
      <div class="votes" aria-label="Is this report accurate?">
        <button data-act="vote" data-id="${r.id}" data-dir="1" aria-pressed="${r.myVote === 1}" aria-label="Upvote, report is accurate" ${r.mine ? 'disabled' : ''}>▲</button>
        <span>${r.net()}</span>
        <button data-act="vote" data-id="${r.id}" data-dir="-1" aria-pressed="${r.myVote === -1}" aria-label="Downvote, report is not accurate" ${r.mine ? 'disabled' : ''}>▼</button>
      </div></div>`).join('') : '<div class="empty">No reports match these filters.</div>'}</div>`;
}
function renderRewards() {
    const pts = user.points;
    let idx = 0;
    LEVELS.forEach((l, i) => { if (pts >= l.min)
        idx = i; });
    const cur = LEVELS[idx], next = LEVELS[idx + 1];
    const pct = next ? Math.round((pts - cur.min) / (next.min - cur.min) * 100) : 100;
    const board = [...BOARD.map(([n, p]) => ({ n, p, me: false })), { n: user.userName, p: pts, me: true }].sort((a, b) => b.p - a.p).slice(0, 6);
    $('dRewards').innerHTML = `
    <h3 class="ph3">Gamification and rewards</h3>
    <p class="meta" style="margin-bottom:18px">Students who share accurate, helpful updates earn points and badges. Rewards are points and badges only.</p>
    <div class="rgrid">
      <div>
        <div class="meta">${esc(user.userName)}, ${esc(user.userType)}</div>
        <div class="big">${pts} <span style="font-size:1rem;font-weight:500;color:var(--muted)">points</span></div>
        <p style="margin:8px 0 6px;font-weight:700">${cur.n}</p>
        <div class="bar2" role="progressbar" aria-label="Progress to next level" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
        <p class="meta">${next ? `${next.min - pts} points to ${next.n}` : 'Top level reached.'}</p>
        <p class="meta">${user.reportsMade} reports, ${user.spotsAdded} spots added, ${user.photosAdded} photos</p>
        <h3 class="sec">How to earn points</h3>
        <ul class="earn">
          <li><b>+10</b> Send a status report</li>
          <li><b>+25</b> Add a new study spot</li>
          <li><b>+5</b> Share a photo of a spot</li>
          <li><b>+2</b> Another student upvotes your report</li>
          <li><b>+15</b> Your report is verified by the community</li>
        </ul>
      </div>
      <div>
        <h3 class="sec" style="margin-top:0">Badges (${user.badges().filter(b => b.earned).length} of ${user.badges().length})</h3>
        <div class="badges" style="grid-template-columns:1fr">${user.badges().map(b => `<div class="badge ${b.earned ? '' : 'locked'}"><b>${esc(b.name)}</b><small>${esc(b.desc)}${b.earned ? '. Earned' : '. Locked'}</small></div>`).join('')}</div>
      </div>
      <div>
        <h3 class="sec" style="margin-top:0">Top contributors (sample)</h3>
        <ol class="board">${board.map(x => `<li class="${x.me ? 'me' : ''}">${esc(x.n)}${x.me ? ' <span class="tag solid" style="margin:0">You</span>' : ''}<span>${x.p}</span></li>`).join('')}</ol>
      </div>
    </div>`;
}
function renderDash() { renderStats(); renderProfilePanel(); renderVerify(); renderRewards(); }

/* =====================================================
   spot-detail.js: Spot detail popup, status reports, votes, and the Add spot form.
   ===================================================== */

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
      <div><div class="lbl">Open seats</div><div class="val">${s.seats} <small>of ${s.capacity}</small></div></div>
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
      <p><strong>${esc(r.user)}${r.mine ? ' (you)' : ''}</strong> <span class="meta">${ago(r.ts)}</span></p>
      <p class="meta">${NOISE[r.noise]} noise, ${CROWD[r.crowd]} crowd, ${r.seats} open seats</p>${r.note ? `<p>${esc(r.note)}</p>` : ''}</div>
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
function refreshAll() { if (!$('p-feed').hidden)
    renderFeed(); renderHome(); renderRows(); renderMap(); renderDash(); renderChip(); if ($('dlgSpot').open) {
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
      <label class="f">Open seats (0 to ${s.capacity})<input type="number" id="r-seats" value="${s.seats}"></label>
      <label class="f">Note (optional)<input type="text" id="r-note" maxlength="100" placeholder="e.g. Outlets near the window are free"></label>
    </div>
    <p class="err" id="repErr" role="alert"></p>
    <div class="foot"><button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn solid">Send update (+10 points)</button></div>`;
    $('dlgReport').showModal();
}
$('reportForm').addEventListener('submit', e => {
    e.preventDefault();
    const s = byId(state.sel), err = $('repErr');
    try {
        const raw = $('r-seats').value.trim();
        if (raw === '')
            throw new Error('Enter how many seats are open.');
        const r = new Report({
            id: rid++, spotId: s.id, user: user.userName, mine: true, ts: Date.now(),
            noise: +document.querySelector('input[name=r-noise]:checked').value, crowd: +document.querySelector('input[name=r-crowd]:checked').value,
            seats: Number(raw), note: $('r-note').value.trim()
        });
        s.updateStatus(r);
        s.reports.unshift(r);
        user.reportsMade++;
        $('dlgReport').close();
        refreshAll();
        award(10, 'status update sent');
        [5000, 9000, 13000].forEach(ms => setTimeout(() => {
            r.up++;
            refreshAll();
            award(2, 'Demo: another student upvoted your report');
            if (r.net() >= 3 && !r.paid) {
                r.paid = true;
                setTimeout(() => award(15, 'Demo: the community verified your report'), 3300);
            }
        }, ms));
    }
    catch (ex) {
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
    let o = '', c = '';
    for (let h = 5; h <= 23; h++)
        o += `<option value="${h}" ${h === 8 ? 'selected' : ''}>${fmtHour(h)}</option>`;
    for (let h = 6; h <= 24; h++)
        c += `<option value="${h}" ${h === 20 ? 'selected' : ''}>${fmtHour(h)}</option>`;
    $('a-open').innerHTML = o;
    $('a-close').innerHTML = c;
}
$('addForm').addEventListener('submit', e => {
    e.preventDefault();
    const err = $('addErr');
    try {
        const name = $('a-name').value.trim();
        if (name.length < 3)
            throw new Error('Enter a name with at least 3 characters.');
        if (spots.some(s => s.name.toLowerCase() === name.toLowerCase()))
            throw new Error('This spot is already listed.');
        const open = +$('a-open').value, close = +$('a-close').value;
        if (close <= open)
            throw new Error('Closing time must be later than opening time.');
        const cap = Number($('a-cap').value);
        if (!Number.isInteger(cap) || cap < 1)
            throw new Error('Total seats must be a whole number of at least 1.');
        const price = Number($('a-price').value), mbps = Number($('a-mbps').value);
        if (!(price >= 0))
            throw new Error('Price cannot be negative.');
        if (!(mbps >= 0))
            throw new Error('Wi-Fi speed cannot be negative.');
        const jit = () => (Math.random() - .5) * 8;
        const spot = new TYPES[$('a-type').value]({
            id: Math.max(...spots.map(s => s.id)) + 1, name, address: $('a-addr').value.trim() || 'Location pinned on the map',
            x: Math.min(94, Math.max(6, state.pos.x + jit())), y: Math.min(64, Math.max(6, state.pos.y + jit())), hours: [open, close], price, capacity: cap,
            seats: Number($('a-seats').value), noise: +$('a-noise').value, crowd: +$('a-crowd').value, rules: $('a-rules').value.trim(), description: $('a-desc').value.trim(), isNew: true,
            fac: {
                wifi: mbps > 0, mbps, outlets: $('a-outlets').checked, aircon: $('a-aircon').checked, food: $('a-food').checked
            }
        });
        spots.push(spot);
        user.spotsAdded++;
        err.textContent = '';
        $('addForm').reset();
        fillHours();
        $('dlgAdd').close();
        go('spots');
        clearFilters();
        state.sel = spot.id;
        refreshAll();
        award(25, 'new study spot added');
    }
    catch (ex) {
        err.textContent = ex.message;
    }
});

/* =====================================================
   events.js: Click, keyboard, and form event listeners.
   ===================================================== */

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
            go('spots');
            toast('Choose a spot, then tap Report.');
        }
    }
    if (act === 'go-add') {
        $('addErr').textContent = '';
        $('dlgAdd').showModal();
    }
    if (act === 'view')
        openSpot(id);
    if (act === 'report')
        openReport(id);
    if (act === 'fav') {
        const on = user.toggleFavorite(id);
        toast(on ? 'Saved to favorites' : 'Removed from favorites');
        if (on && user.favoriteSpots.size === 3)
            toast('Badge unlocked: Favorites fan');
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
$('map').addEventListener('click', e => {
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
    'q', 'fNoise', 'fCrowd', 'fPrice', 'fSort', 'cWifi', 'cOutlets', 'cSeats', 'cOpen', 'cSaved'
].forEach(i => $(i).addEventListener(i === 'q' ? 'input' : 'change', readFilters));
document.addEventListener('change', e => {
    const id = e.target.id;
    if (id === 'ph-file' && e.target.files[0])
        uploadPhoto(e.target.files[0]);
    if (id === 'dSpotSel') {
        state.dashSpot = +e.target.value;
        renderProfilePanel();
    }
    if (id === 'vSpot') {
        state.ver.spot = e.target.value;
        renderVerify();
    }
    if (id === 'vShow') {
        state.ver.show = e.target.value;
        renderVerify();
    }
});

/* =====================================================
   palette.js: Color palette picker (saved in the browser).
   ===================================================== */

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

/* =====================================================
   feed.js: Feed page: spot posts with photo, rating, and comments.
   ===================================================== */

const social = {};
const hsh = s => [...s.name].reduce((a, c) => a + c.charCodeAt(0), 0);
function soc(s) {
    if (!social[s.id]) {
        const h = hsh(s), count = 18 + h % 60, avg = 3.8 + (h % 11) / 10;
        const names = ['Mika', 'Jen', 'Paolo', 'Ana', 'Rico', 'Lea'];
        const lines = [
            'Tahimik dito, sakto pang review.', 'Maraming outlet, pero minsan puno na pag hapon.', 'Okay ang Wi-Fi at malamig ang aircon.', 'Sulit, at mabilis ang update ng seats.', 'Medyo maingay pag lunch break.', 'Maganda pumunta bago mag 10 am.'
        ];
        social[s.id] = {
            sum: Math.round(avg * count), count, mine: 0, open: false, draft: '',
            comments: [0, 1].map(i => ({
                user: names[(h + i * 2) % 6], text: lines[(h + i * 3) % 6], ts: Date.now() - (h % 50 + 5 + i * 37) * 60000
            }))
        };
    }
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
function renderFeed() {
    const q = $('fq').value.trim().toLowerCase(), so = $('fsort').value, quiet = $('fquiet').checked, rt = x => soc(x).sum / soc(x).count;
    const list = spots.filter(s => (!q || (s.name + ' ' + s.kind).toLowerCase().includes(q)) && (!quiet || s.noise === 1));
    list.sort(so === 'rated' ? (a, b) => rt(b) - rt(a) : so === 'seats' ? (a, b) => b.seats - a.seats : (a, b) => a.distance(state.pos) - b.distance(state.pos));
    if (!list.length) {
        $('feed').innerHTML = '<div class="empty">No spots match your search.</div>';
        return;
    }
    $('feed').innerHTML = list.map(s => {
        const sc = soc(s), avg = sc.sum / sc.count, fill = Math.round(sc.mine || avg), fav = user.favoriteSpots.has(s.id), d = s.distance(state.pos);
        const real = s.photos.length > 0, img = real ? s.photos[0].src : spotArt(s);
        const stars = [1, 2, 3, 4, 5].map(i => `<button class="star ${i <= fill ? 'on' : ''}" data-act="rate" data-id="${s.id}" data-n="${i}" aria-label="Rate ${i} of 5 stars">&#9733;</button>`).join('');
        const cms = sc.open ? `<div class="cms">${sc.comments.map((m, i) => `<div class="cm"><span class="av">${esc(m.user[0].toUpperCase())}</span><div class="bub"><b>${esc(m.user)}${m.mine ? ' (you)' : ''}</b> <small>${ago(m.ts)}</small><p>${esc(m.text)}</p><button class="lk" data-act="cm-like" data-id="${s.id}" data-i="${i}">&#9650; ${m.up || 0}</button>${m.mine ? `<button class="lk" data-act="cm-del" data-id="${s.id}" data-i="${i}">Delete</button>` : ''}</div></div>`).join('')}
      <div class="cmrow"><input type="text" class="cm-in" data-id="${s.id}" placeholder="Write feedback about this spot" value="${esc(sc.draft)}" aria-label="Comment on ${esc(s.name)}"><button class="btn solid sm" data-act="cm-post" data-id="${s.id}">Post</button></div></div>` : '';
        return `<article class="card post">
      <header><span class="av">${esc(s.name[0])}</span><div><h3>${esc(s.name)}</h3><small>${esc(s.kind)}${s.isOpen ? '' : ', closed now'} &middot; ${Math.max(1, Math.round(d / 60))} min walk (${d} m)</small></div>${s.isNew ? '<span class="tag solid">New</span>' : ''}</header>
      <button class="pic" data-act="view" data-id="${s.id}" aria-label="Open details of ${esc(s.name)}"><img src="${img}" alt="${real ? 'Photo' : 'Illustration'} of ${esc(s.name)}">${real ? '' : '<span class="cap">Illustration &middot; open the spot to add a real photo</span>'}</button>
      <div class="stat"><span class="lv">${meter(s.noise, NOISE[s.noise] + ' noise')} ${NOISE[s.noise]}</span><span class="lv">${meter(s.crowd, CROWD[s.crowd] + ' crowd')} ${CROWD[s.crowd]} crowd</span>${seatPill(s)}${extra(s)}<small>Updated ${ago(s.updatedAt)}</small></div>
      <div class="rate"><span class="stars" role="group" aria-label="Rating">${stars}</span><b>${avg.toFixed(1)}</b><small>(${sc.count} ratings)${sc.mine ? ', you rated ' + sc.mine : ''}</small></div>
      <div class="acts"><button class="btn sm" data-act="cm-toggle" data-id="${s.id}">Comments (${sc.comments.length})</button><button class="btn sm" data-act="report" data-id="${s.id}">Report status</button><button class="btn sm" data-act="feed-photo" data-id="${s.id}">Add photo</button><button class="btn sm" data-act="share" data-id="${s.id}">Share</button><button class="btn sm" data-act="fav" data-id="${s.id}" aria-pressed="${fav}">${fav ? '&#9733; Saved' : '&#9734; Save'}</button><button class="btn sm solid" data-act="view" data-id="${s.id}">Details</button></div>
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

/* =====================================================
   feed-extras.js: Feed extras: Add photo, Share, comment upvotes/delete, badges.
   ===================================================== */

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
        const t = `${s.name}: ${s.seats} seats open, ${NOISE[s.noise]} noise right now (QuietSpot)`;
        try {
            navigator.clipboard.writeText(t).then(() => toast('Copied: ' + t), () => toast(t));
        }
        catch (x) {
            toast(t);
        }
    }
    if (a === 'cm-like') {
        const m = soc(s).comments[i];
        m.liked = !m.liked;
        m.up = (m.up || 0) + (m.liked ? 1 : -1);
        renderFeed();
    }
    if (a === 'cm-del') {
        soc(s).comments.splice(i, 1);
        renderFeed();
        toast('Comment deleted');
    }
});
['fq', 'fsort', 'fquiet'].forEach(i => $(i).addEventListener(i === 'fq' ? 'input' : 'change', renderFeed));

/* =====================================================
   reco.js: Reco page: ranks spots by what the student needs.
   ===================================================== */

const RC = [
    ['quiet', 'Quiet', 1], ['outlets', 'Power outlets', 1], ['wifi', 'Wi-Fi'], ['aircon', 'Air-conditioning'], ['cheap', 'Free or cheap'], ['open', 'Open now'], ['seats', 'Has open seats']
];
$('recoChecks').innerHTML = RC.map(r => `<label><input type="checkbox" value="${r[0]}" ${r[2] ? 'checked' : ''}> ${r[1]}</label>`).join('');
$('recoChecks').addEventListener('change', renderReco);
function renderReco() {
    const pick = [...document.querySelectorAll('#recoChecks input:checked')].map(x => x.value);
    const T = {
        quiet: s => s.noise === 1, outlets: s => s.facility.outlets, wifi: s => s.facility.wifi, aircon: s => s.facility.aircon, cheap: s => s.price <= 50, open: s => s.isOpen, seats: s => s.checkAvailability()
    };
    if (!pick.length) {
        $('recoOut').innerHTML = '<div class="empty">Tick at least one need above.</div>';
        return;
    }
    const r = spots.map(s => ({ s, hit: pick.filter(p => T[p](s)) })).sort((a, b) => b.hit.length - a.hit.length || a.s.distance(state.pos) - b.s.distance(state.pos));
    $('recoOut').innerHTML = r.slice(0, 5).map(({ s, hit }, n) => { const pc = Math.round(hit.length / pick.length * 100); return `<article class="card post rcard"><div class="stat"><b>#${n + 1} ${esc(s.name)}</b><span class="chip">${pc}% match</span>${seatPill(s)}<small>${s.distance(state.pos)} m away</small></div><div class="match"><i style="width:${pc}%"></i></div><p class="sub" style="margin:8px 0 10px">Matches: ${hit.map(h => RC.find(x => x[0] === h)[1]).join(', ') || 'none'}</p><button class="btn sm solid" data-act="view" data-id="${s.id}">Details</button></article>`; }).join('');
}

/* =====================================================
   auth.js: Login and Sign Up (simulated, no real accounts).
   ===================================================== */

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
    go('login');
    toast(message);
    return false;
}
function authDone(name) {
    user = new User(name, 'Student');
    loggedIn = true;
    const b = $('authBtn');
    b.textContent = 'Logout';
    b.dataset.act = 'logout';
    refreshAll();
    go(nextPage);
    nextPage = 'home';
    toast(`Welcome, ${name}!`);
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
    go('home');
    toast('Logged out.');
});
$('loginForm').addEventListener('submit', e => {
    e.preventDefault();
    const u = $('l-user').value.trim();
    if (!u || $('l-pass').value.length < 6) {
        $('lErr').textContent = 'Enter your username and a password of 6+ characters.';
        return;
    }
    $('lErr').textContent = '';
    authDone(u);
});
$('signupForm').addEventListener('submit', e => {
    e.preventDefault();
    const n = $('s-name').value.trim(), u = $('s-user').value.trim();
    if (!n || !u) {
        $('sErr').textContent = 'Full name and username are required.';
        return;
    }
    if (!/^\S+@\S+\.\S+$/.test($('s-mail').value.trim())) {
        $('sErr').textContent = 'Enter a valid email.';
        return;
    }
    if ($('s-pass').value.length < 6) {
        $('sErr').textContent = 'Password needs 6+ characters.';
        return;
    }
    $('sErr').textContent = '';
    authDone(u);
});

/* =====================================================
   main.js: Start-up: runs when the page loads.
   ===================================================== */

fillHours();
refreshAll();
