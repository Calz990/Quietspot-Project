// QuietSpot: profile.js
// Sections: helpers, shared form fields, photo picking, header, setup wizard,
// profile part of the Account page, edit profile dialog, start-up
//
// Loaded AFTER script.js on setup-profile.html and account.html, so it can use
// the helpers from script.js ($, esc, user, loggedIn, go, toast, icon, levelOf, byId...).
// The Java server keeps the profile (see model/UserProfile.java).

// =====================================================
// helpers: constants, server calls, small formatters
// =====================================================

const PF_PREFS = [
    ['quiet', 'Quiet places'], ['outlets', 'Power outlets'], ['wifi', 'Wi-Fi'],
    ['aircon', 'Air-conditioning'], ['cheap', 'Free or cheap'], ['late', 'Open late']
];
const PF_YEARS = ['1st year', '2nd year', '3rd year', '4th year', '5th year', 'Graduate student', 'Faculty / staff'];
const PF_COURSES = [
    'BS Information Technology', 'BS Computer Science', 'BS Computer Engineering', 'BS Information Systems',
    'BS Electronics Engineering', 'BS Electrical Engineering', 'BS Civil Engineering', 'BS Mechanical Engineering',
    'BS Industrial Engineering', 'BS Architecture', 'BS Accountancy', 'BS Business Administration', 'BS Nursing'
];
const PF_ICONS = {
    school: '<path d="M3 9l9-5 9 5-9 5z"/><path d="M7 12v4c0 1.5 2.2 3 5 3s5-1.5 5-3v-4"/>',
    book: '<path d="M4 4h6a3 3 0 0 1 2 1 3 3 0 0 1 2-1h6v14h-6a3 3 0 0 0-2 1 3 3 0 0 0-2-1H4z"/><path d="M12 5v14"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    cake: '<path d="M4 20h16v-7H4z"/><path d="M4 16c2 1.5 4 1.5 8 0s6-1.5 8 0"/><path d="M12 13V8"/><path d="M12 5c-1 1 0 2 0 2s1-1 0-2z"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    pin: ICONS.pin
};
const pfIcon = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PF_ICONS[n]}</svg>`;

let PF = null;   // the profile loaded from the Java server

async function pfApi(path, obj) {
    const res = await fetch(path, { method: 'POST', body: new URLSearchParams(obj) });
    return res.json();
}
const pfErrMsg = ex => (ex instanceof TypeError ? NO_SERVER : (ex && ex.message) || 'Something went wrong.');
const pfInitials = name => {
    const w = String(name || '').trim().split(/\s+/).filter(Boolean);
    return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
};
const pfName = p => p.fullName || p.userName;
const pfPrefLabel = k => (PF_PREFS.find(x => x[0] === k) || [k, k])[1];
const pfDate = s => {
    const d = new Date(s + 'T00:00:00');
    return isNaN(d) ? s : d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
};

async function pfLoad() {
    try {
        const data = await pfApi('/api/profile/get', { username: user.userName });
        if (!data.ok) return data.error || 'Could not load your profile.';
        PF = data;
        return null;
    } catch (ex) { return NO_SERVER; }
}
function pfFail(msg, hostId) {
    $(hostId).innerHTML = `<div class="dlg stack"><h3>We could not load your profile</h3><p class="meta">${esc(msg)}</p>
      <div class="acts"><button class="btn solid" data-act="logout">Log in again</button></div></div>`;
}
// keep the small copy of the user that script.js saves in this browser in step with the server
function pfSyncUser(p) {
    user.userType = String(p.userType).charAt(0) + String(p.userType).slice(1).toLowerCase();
    save();
}

// =====================================================
// shared form fields: used by the setup wizard (prefix "su")
// and by the Edit profile dialog (prefix "ep")
// =====================================================

function pfAboutFields(p, pre) {
    const years = PF_YEARS.includes(p.yearLevel) || !p.yearLevel ? PF_YEARS : [...PF_YEARS, p.yearLevel];
    const today = new Date().toISOString().slice(0, 10);
    return `
    <label class="f">Full name<input type="text" id="${pre}-name" maxlength="60" autocomplete="name" value="${esc(p.fullName)}"></label>
    <label class="f">Bio<textarea id="${pre}-bio" maxlength="150" data-count="${pre}-bioN" placeholder="Tell other students a little about yourself">${esc(p.bio)}</textarea></label>
    <span class="count" id="${pre}-bioN">${p.bio.length}/150</span>
    <label class="f">I am a<select id="${pre}-type">${['STUDENT', 'FACULTY', 'STAFF'].map(t =>
        `<option value="${t}" ${p.userType === t ? 'selected' : ''}>${t.charAt(0) + t.slice(1).toLowerCase()}</option>`).join('')}</select></label>
    <label class="f">School<input type="text" id="${pre}-school" maxlength="60" placeholder="e.g. Batangas State University" value="${esc(p.school)}"></label>
    <div class="two">
      <label class="f">Course<input type="text" id="${pre}-course" maxlength="60" list="pfCourses" placeholder="e.g. BS Information Technology" value="${esc(p.course)}"></label>
      <label class="f">Year level<select id="${pre}-year"><option value="">Select</option>${years.map(y =>
        `<option ${p.yearLevel === y ? 'selected' : ''}>${esc(y)}</option>`).join('')}</select></label>
    </div>
    <div class="two">
      <label class="f">Location<input type="text" id="${pre}-loc" maxlength="60" placeholder="e.g. Batangas City" value="${esc(p.location)}"></label>
      <label class="f">Birthday<input type="date" id="${pre}-bday" min="1900-01-01" max="${today}" value="${esc(p.birthday)}"></label>
    </div>
    <datalist id="pfCourses">${PF_COURSES.map(c => `<option value="${esc(c)}"></option>`).join('')}</datalist>`;
}
function pfReadAbout(pre) {
    const v = id => ($(`${pre}-${id}`) || { value: '' }).value.trim();
    if (!v('name')) throw new Error('Full name cannot be empty.');
    return {
        fullName: v('name'), bio: v('bio'), userType: v('type'), school: v('school'),
        course: v('course'), yearLevel: v('year'), location: v('loc'), birthday: v('bday')
    };
}
function pfPrefsFields(p, pre) {
    return `
    <div><div class="meta" style="margin-bottom:8px;font-weight:700">What do you look for in a study spot?</div>
      <div class="pfchips" id="${pre}-prefs" role="group" aria-label="Study preferences">${PF_PREFS.map(([k, label]) =>
        `<label><input type="checkbox" value="${k}" ${p.studyPrefs.includes(k) ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div></div>
    <label class="f">Interests (separate with commas, up to 8)<input type="text" id="${pre}-interests" placeholder="e.g. Coding, Badminton, Coffee" value="${esc(p.interests.join(', '))}"></label>`;
}
function pfReadPrefs(pre) {
    const prefs = [...document.querySelectorAll(`#${pre}-prefs input:checked`)].map(x => x.value);
    return { studyPrefs: prefs.join(','), interests: ($(`${pre}-interests`) || { value: '' }).value.trim() };
}
// live "12/150" counter under the bio box
document.addEventListener('input', e => {
    const t = e.target;
    if (t.matches && t.matches('textarea[data-count]')) $(t.dataset.count).textContent = `${t.value.length}/${t.maxLength}`;
});

// =====================================================
// photo picking: choose a picture, crop it square, shrink it
// =====================================================

function pfCrop(file) {
    return new Promise((resolve, reject) => {
        if (!file.type.startsWith('image/')) return reject(new Error('Please choose an image file.'));
        if (file.size > 10 * 1024 * 1024) return reject(new Error('That image is over 10 MB. Choose a smaller one.'));
        const [W, H, Q] = [320, 320, 0.85];
        const url = URL.createObjectURL(file), img = new Image();
        img.onload = () => {
            const k = Math.max(W / img.width, H / img.height), sw = W / k, sh = H / k;   // center crop
            const c = document.createElement('canvas');
            c.width = W;
            c.height = H;
            c.getContext('2d').drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, W, H);
            URL.revokeObjectURL(url);
            resolve(c.toDataURL('image/jpeg', Q));
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image. Try a JPG or PNG.')); };
        img.src = url;
    });
}
// opens the file chooser, then calls onFile(file)
function pfChoose(onFile) {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.hidden = true;
    document.body.appendChild(inp);
    inp.addEventListener('change', () => { const f = inp.files[0]; inp.remove(); if (f) onFile(f); });
    inp.click();
}

// =====================================================
// header: picture + name (used by the setup preview and the Account page)
// =====================================================

const pfAvatarInner = p => p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : esc(pfInitials(pfName(p)));
function pfHeader(p, o = {}) {
    const cam = `<button type="button" class="pf-cam" data-pf="cam" data-kind="avatar" aria-label="Change profile picture">${icon('camera')}</button>`;
    return `
    <div class="pf-body">
      <div class="pf-avatar" role="img" aria-label="Profile picture of ${esc(pfName(p))}">${pfAvatarInner(p)}${o.owner ? cam : ''}</div>
      <div class="pf-id">
        <h1>${esc(pfName(p))}</h1>
        <p class="handle">@${esc(p.userName)}</p>
        ${p.bio ? `<p class="bio">${esc(p.bio)}</p>` : ''}
        ${(o.chips || []).length ? `<div class="pf-chips">${o.chips.map(c => `<span class="chip">${esc(c)}</span>`).join('')}</div>` : ''}
      </div>
      ${o.actions || ''}
    </div>`;
}

// =====================================================
// setup wizard (setup-profile.html): shown right after sign up
// Step 1 profile picture, 2 about you, 3 study preferences, 4 review.
// Every step is saved to the server when you press Next.
// =====================================================

const SU = { step: 0, photos: {}, busy: false };   // photos = the picture chosen but not saved yet
const SU_STEPS = ['Add a profile picture', 'Tell us about you', 'Your study preferences', 'All set'];

function suView() {   // the profile as it looks right now, including unsaved typing and photos
    const v = Object.assign({}, PF, SU.photos);
    if ($('su-name')) v.fullName = $('su-name').value.trim() || PF.userName;
    if ($('su-bio')) v.bio = $('su-bio').value.trim();
    if ($('su-school')) { v.school = $('su-school').value.trim(); v.course = $('su-course').value.trim(); }
    return v;
}
function suPreview() {
    const v = suView();
    $('suPreview').innerHTML = `<p class="lbl" style="padding:14px 18px 0">Preview: this is how your profile will look</p>` +
        pfHeader(v, { chips: [capWord(PF.userType), v.school, v.course].filter(Boolean) });
}
function suPick(kind) {
    pfChoose(async file => {
        try {
            SU.photos[kind] = await pfCrop(file);
            suRender();
        } catch (ex) { $('suErr').textContent = pfErrMsg(ex); }
    });
}
function suRender() {
    const s = SU.step, v = suView();
    $('suStep').textContent = `Step ${s + 1} of ${SU_STEPS.length}`;
    $('suBar').style.width = ((s + 1) / SU_STEPS.length * 100) + '%';
    $('suErr').textContent = '';
    let body = '';
    if (s === 0) {
        body = `<h2>${SU_STEPS[0]}</h2><p class="sub">A picture helps other students recognize you. We crop it to a circle for you.</p>
        <div class="pfform">
          <div class="pfpick"><b>Profile picture</b><div class="row">
            <div class="pf-avatar" style="width:64px;height:64px;margin:0;font-size:1.3rem;border-width:3px">${pfAvatarInner(v)}</div>
            <button type="button" class="btn sm solid" data-pf="su-pick" data-kind="avatar">${v.avatar ? 'Change picture' : 'Choose picture'}</button>
            ${v.avatar ? '<button type="button" class="btn sm" data-pf="su-rm" data-kind="avatar">Remove</button>' : ''}</div></div>
        </div>`;
    } else if (s === 1) {
        body = `<h2>${SU_STEPS[1]}</h2><p class="sub">Everything here is optional except your name.</p><div class="pfform">${pfAboutFields(v, 'su')}</div>`;
    } else if (s === 2) {
        body = `<h2>${SU_STEPS[2]}</h2><p class="sub">We use these to recommend spots that fit you.</p><div class="pfform">${pfPrefsFields(PF, 'su')}</div>`;
    } else {
        body = `<h2>You're all set, ${esc(pfName(PF).split(' ')[0])}!</h2>
        <p class="sub">Your profile is ${PF.completion}% complete.</p>
        <div class="pfmeter" role="progressbar" aria-valuenow="${PF.completion}" aria-valuemin="0" aria-valuemax="100" aria-label="Profile strength"><i style="width:${PF.completion}%"></i></div>
        ${PF.missing.length ? `<p class="meta">You can still add later from your Account page:</p><ul class="pftodo">${PF.missing.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` : '<p class="meta">Nothing left to add. Nice!</p>'}`;
    }
    $('suBody').innerHTML = body;
    $('suFoot').innerHTML = s === 3
        ? `<button type="button" class="btn" data-pf="su-back">Back</button><button type="submit" class="btn solid">Go to my account</button>`
        : `<div>${s > 0 ? '<button type="button" class="btn" data-pf="su-back">Back</button>' : '<button type="button" class="linkbtn" data-pf="su-skipall">Skip setup</button>'}</div>
           <div class="r"><button type="button" class="btn" data-pf="su-skip">Skip</button><button type="submit" class="btn solid">Next</button></div>`;
    suPreview();
}
function suCollect() {   // what this step wants to save (throws an Error if something is wrong)
    const s = SU.step;
    if (s === 0) return Object.assign({}, SU.photos);
    if (s === 1) return pfReadAbout('su');
    if (s === 2) return pfReadPrefs('su');
    return {};
}
async function suSave(data) {
    const res = await pfApi('/api/profile/save', Object.assign({ username: user.userName }, data));
    if (!res.ok) throw new Error(res.error || 'Could not save.');
    PF = res;
    SU.photos = {};
    pfSyncUser(PF);
}
async function suNext(skip) {
    if (SU.busy) return;
    SU.busy = true;
    $('suErr').textContent = '';
    try {
        const data = skip ? {} : suCollect();
        if (SU.step === 3) data.setupDone = 'true';
        if (Object.keys(data).length) await suSave(data);
        if (SU.step === 3) { go('account', 'Your profile is ready!'); return; }
        SU.step++;
        suRender();
    } catch (ex) { $('suErr').textContent = pfErrMsg(ex); }
    finally { SU.busy = false; }
}
async function suSkipAll() {
    try { await suSave({ setupDone: 'true' }); go('account', 'You can finish your profile anytime.'); }
    catch (ex) { $('suErr').textContent = pfErrMsg(ex); }
}
function suInit() {
    suRender();
    on('suForm', 'submit', e => { e.preventDefault(); suNext(false); });
    on('suForm', 'input', () => suPreview());
}

// =====================================================
// profile part of the Account page (account.html)
// =====================================================

function pfDetails(p) {
    const rows = [
        p.school && ['school', 'Studies at', p.school], p.course && ['book', 'Course', p.course],
        p.yearLevel && ['cal', 'Year level', p.yearLevel], p.location && ['pin', 'Lives in', p.location],
        p.birthday && ['cake', 'Birthday', pfDate(p.birthday)], p.email && ['mail', 'Email', p.email],
        ['user', 'Account type', capWord(p.userType)]
    ].filter(Boolean);
    return rows.map(([ic, k, v]) => `<li>${pfIcon(ic)}<div><small>${k}</small>${esc(v)}</div></li>`).join('');
}
function pfRender() {
    const p = PF, L = levelOf(user.points);
    const missing = p.completion < 100;
    $('pfBanner').hidden = !missing;
    if (missing) {
        $('pfBanner').innerHTML = `<p><b>Your profile is ${p.completion}% complete.</b> A complete profile helps other students trust your reports.</p>
          <button class="btn sm solid" data-pf="${p.setupDone ? 'edit' : 'setup'}">${p.setupDone ? 'Complete my profile' : 'Continue setup'}</button>`;
    }
    $('pfHead').innerHTML = pfHeader(p, {
        owner: true,
        chips: [`Level ${L.idx + 1}, ${L.cur.n}`, `${user.points} pts`, `Member since ${pfDate(p.memberSince)}`],
        actions: `<div class="pf-actions"><button class="btn solid" data-pf="edit">Edit profile</button></div>`
    });
    const tags = (list, cls) => list.length ? `<div class="pftags">${list.map(t => `<span class="pftag ${cls}">${esc(t)}</span>`).join('')}</div>` : '';
    const details = pfDetails(p);
    $('pfSide').innerHTML = `
      <section class="card pfcard"><h3Personal details</h3>${p.bio ? `<p style="margin:0 0 12px;overflow-wrap:anywhere">${esc(p.bio)}</p>` : ''}
        <ul class="pfdet">${details}</ul>
        ${p.bio || p.school || p.course || p.yearLevel || p.location || p.birthday ? '' : '<p class="meta" style="margin:10px 0 0">No details yet. Use Edit profile to add some.</p>'}</section>
      <section class="card pfcard"><h3>Study preferences</h3>${p.studyPrefs.length ? tags(p.studyPrefs.map(pfPrefLabel), 'pref') : '<p class="meta" style="margin:0">None picked yet.</p>'}</section>
      <section class="card pfcard"><h3>Interests</h3>${p.interests.length ? tags(p.interests, '') : '<p class="meta" style="margin:0">None added yet.</p>'}</section>`;

    const favs = [...user.favoriteSpots].map(id => byId(id)).filter(Boolean);
    const badges = user.badges();
    const shelf = badges.map(b => `<div class="slot ${b.earned ? 'got' : 'locked'}">
        <span class="medal">${icon(b.icon)}</span><b>${esc(b.name)}</b><small>${esc(b.desc)}</small>
        ${b.earned ? '<span class="vh">Earned</span>' : `<span class="prog" role="progressbar" aria-label="Progress to ${esc(b.name)}" aria-valuenow="${b.have}" aria-valuemin="0" aria-valuemax="${b.need}"><i style="width:${Math.round(b.have / b.need * 100)}%"></i></span><small>${b.have} of ${b.need}</small>`}</div>`).join('');
    $('pfMain').innerHTML = `
      <section class="card pfcard"><h3>Profile strength</h3>
        <b>${p.completion}%</b>
        <div class="pfmeter" role="progressbar" aria-valuenow="${p.completion}" aria-valuemin="0" aria-valuemax="100" aria-label="Profile strength"><i style="width:${p.completion}%"></i></div>
        ${p.missing.length ? `<ul class="pftodo">${p.missing.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` : '<p class="meta" style="margin:0">Your profile is complete.</p>'}</section>
      <section class="card pfcard"><h3>Activity</h3><div class="pfstats">
        <div><b>${user.points}</b><span>Points</span></div><div><b>${user.reportsMade}</b><span>Reports</span></div>
        <div><b>${user.spotsAdded}</b><span>Spots added</span></div><div><b>${user.photosAdded}</b><span>Photos</span></div>
        <div><b>${user.favoriteSpots.size}</b><span>Favorites</span></div></div></section>
      <section class="card pfcard"><h3>Favorite spots</h3>${favs.length ? tags(favs.map(s => s.name), 'pref') : '<p class="meta" style="margin:0">No favorites yet. Tap the star on a spot to save it.</p>'}</section>
      <section class="card pfcard"><h3>Badges (${badges.filter(b => b.earned).length} of ${badges.length})</h3><div class="shelf">${shelf}</div></section>`;
}
// change the picture straight from the header (saved right away)
function pfQuickPhoto() {
    pfChoose(async file => {
        try {
            const src = await pfCrop(file);
            const res = await pfApi('/api/profile/save', { username: user.userName, avatar: src });
            if (!res.ok) { toast(res.error || 'Could not save the photo.'); return; }
            PF = res;
            pfRender();
            toast('Profile picture updated.');
        } catch (ex) { toast(pfErrMsg(ex)); }
    });
}

// =====================================================
// Edit profile dialog (account.html)
// =====================================================

let EP = {};   // picture change made inside the dialog: avatar -> new picture, or '' to remove
function epPhotos() {
    const v = Object.assign({}, PF, EP);
    $('ep-avPrev').innerHTML = pfAvatarInner(v);
}
function pfOpenEdit() {
    EP = {};
    const p = PF;
    $('pfEditForm').innerHTML = `
      <h2>Edit profile</h2>
      <h4>Profile picture</h4>
      <div class="pfform">
        <div class="pfpick"><div class="row">
          <div class="pf-avatar" id="ep-avPrev" style="width:72px;height:72px;margin:0;font-size:1.4rem;border-width:3px"></div>
          <button type="button" class="btn sm" data-pf="ep-pick" data-kind="avatar">Change picture</button>
          <button type="button" class="btn sm" data-pf="ep-rm" data-kind="avatar">Remove</button></div></div>
      </div>
      <h4>About you</h4><div class="pfform">${pfAboutFields(p, 'ep')}</div>
      <h4>Study preferences and interests</h4><div class="pfform">${pfPrefsFields(p, 'ep')}</div>
      <p class="err" id="epErr" role="alert"></p>
      <div class="foot"><button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn solid">Save changes</button></div>`;
    epPhotos();
    $('dlgProfile').showModal();
}
on('pfEditForm', 'submit', async e => {
    e.preventDefault();
    $('epErr').textContent = '';
    try {
        const data = Object.assign({ username: user.userName }, pfReadAbout('ep'), pfReadPrefs('ep'), EP);
        const res = await pfApi('/api/profile/save', data);
        if (!res.ok) throw new Error(res.error || 'Could not save.');
        PF = res;
        pfSyncUser(PF);
        $('dlgProfile').close();
        pfRender();
        toast('Profile updated.');
    } catch (ex) { $('epErr').textContent = pfErrMsg(ex); }
});

// =====================================================
// clicks on the buttons of these pages
// =====================================================

document.addEventListener('click', e => {
    const el = e.target.closest('[data-pf]');
    if (!el) return;
    const a = el.dataset.pf, kind = el.dataset.kind;
    if (a === 'edit') pfOpenEdit();
    if (a === 'setup') go('setup');
    if (a === 'cam') pfQuickPhoto();
    if (a === 'su-pick') suPick(kind);
    if (a === 'su-rm') { SU.photos[kind] = ''; suRender(); }
    if (a === 'su-back') { SU.step = Math.max(0, SU.step - 1); suRender(); }
    if (a === 'su-skip') suNext(true);
    if (a === 'su-skipall') suSkipAll();
    if (a === 'ep-pick') pfChoose(async file => {
        try { EP[kind] = await pfCrop(file); epPhotos(); }
        catch (ex) { $('epErr').textContent = pfErrMsg(ex); }
    });
    if (a === 'ep-rm') { EP[kind] = ''; epPhotos(); }
});

// =====================================================
// start-up: script.js calls this once the spots are loaded
// =====================================================

async function initProfilePage() {
    if (!loggedIn) return;
    const host = CURRENT === 'setup' ? 'suBody' : 'pfHead';
    const err = await pfLoad();
    if (err === 'Account not found.') {   // the server does not know this account (for example it was restarted and lost it)
        accountGone();
        return;
    }
    if (err) {
        if (CURRENT === 'setup') { $('suFoot').innerHTML = ''; $('suPreview').hidden = true; }
        pfFail(err, host);
        return;
    }
    if (CURRENT === 'setup') suInit();
    else pfRender();
}