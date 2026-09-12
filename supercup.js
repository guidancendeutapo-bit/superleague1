// ===================================================================
// SUPER CUP — supercup.js
// ===================================================================

const scFirebaseConfig = {
    apiKey: "AIzaSyDS9quu-rckjxBMW-vuhx1NFPHeZmfs-3E",
    authDomain: "super-league-3fc14.firebaseapp.com",
    projectId: "super-league-3fc14",
    storageBucket: "super-league-3fc14.firebasestorage.app",
    messagingSenderId: "108539201153",
    appId: "1:108539201153:web:a35388bd2386fcb9a2ccb0",
    measurementId: "G-00SSJ5W0VH",
    databaseURL: "https://super-league-3fc14-default-rtdb.firebaseio.com"
};

const scEmptyBracket = () => ({ rounds: [], thirdPlace: null, champion: null, generated: false, runId: null });
let scDb = null;
let scTeams = [];
let scPlayers = [];
let scBracket = scEmptyBracket();
let scNews = [];
let scIsAdmin = false;
let scActiveView = 'bracket';
let scEditingLegId = null;
let scGoalEntries = [];
let scPlacementMode = false;
let scCelebrationClicks = {};

function scEscape(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function scInitFirebase() {
    firebase.initializeApp(scFirebaseConfig);
    scDb = firebase.database();
    scDb.ref('superCupData').on('value', snapshot => {
        const data = snapshot.val();
        if (data) {
            scTeams = Array.isArray(data.teams) ? data.teams : Object.values(data.teams || {});
            scPlayers = Array.isArray(data.players) ? data.players : Object.values(data.players || {});
            scBracket = data.bracket || scEmptyBracket();
            scNews = Array.isArray(data.news) ? data.news : Object.values(data.news || {});
            scCelebrationClicks = data.celebrationClicks || {};
            scNormalizeBracket();
        }
        scRenderAll();
    });
}

function scSaveData() {
    if (!scDb) return;
    scDb.ref('superCupData').set({ teams: scTeams, players: scPlayers, bracket: scBracket, news: scNews, celebrationClicks: scCelebrationClicks });
}

function scHandleAuth() {
    if (scIsAdmin) {
        scIsAdmin = false;
        document.getElementById('scAdminToggle').innerText = '🔐 Admin';
        document.getElementById('scAdminToggle').classList.remove('logged-in');
        scRenderAll();
        return;
    }
    document.getElementById('scPasswordInput').value = '';
    document.getElementById('scAuthModal').classList.add('active');
}

function scCloseAuthModal() { document.getElementById('scAuthModal').classList.remove('active'); }

function scValidateAdmin() {
    if (document.getElementById('scPasswordInput').value !== 'Windhoek') {
        alert('Incorrect password.');
        return;
    }
    scIsAdmin = true;
    document.getElementById('scAdminToggle').innerText = '🔓 Logout';
    document.getElementById('scAdminToggle').classList.add('logged-in');
    scCloseAuthModal();
    scRenderAll();
}

function scSwitchView(view) {
    scActiveView = view;
    document.querySelectorAll('.sc-view').forEach(element => element.classList.remove('active'));
    document.querySelectorAll('.sc-nav-btn').forEach(element => element.classList.remove('active'));
    document.getElementById(`scView${view.charAt(0).toUpperCase()}${view.slice(1)}`)?.classList.add('active');
    document.getElementById(`scNav${view.charAt(0).toUpperCase()}${view.slice(1)}`)?.classList.add('active');
    scRenderAll();
}

function scUpdateAdminUI() {
    const generated = scBracket.generated;
    const manage = document.getElementById('scManageSquadsBtn');
    const generate = document.getElementById('scGenBracketBtn');
    const postNews = document.getElementById('scPostNewsBtn');
    const place = document.getElementById('scPlaceTeamsBtn');
    const reset = document.getElementById('scResetBracketBtn');
    if (manage) manage.style.display = scIsAdmin ? 'inline-flex' : 'none';
    if (generate) generate.style.display = scIsAdmin ? 'inline-flex' : 'none';
    if (postNews) postNews.style.display = scIsAdmin ? 'inline-flex' : 'none';
    if (place) place.style.display = scIsAdmin && generated ? 'inline-flex' : 'none';
    if (reset) reset.style.display = scIsAdmin && generated ? 'inline-flex' : 'none';
    if (place) {
        place.innerText = scPlacementMode ? '✓ Done Placing' : '📍 Place Teams';
        place.classList.toggle('placing', scPlacementMode);
    }
}

// --- SQUADS ---
function scOpenSquadModal() {
    scRenderTeamList();
    scRenderPlayerList();
    scRenderTeamSelect();
    document.getElementById('scSquadModal').classList.add('active');
}
function scCloseSquadModal() { document.getElementById('scSquadModal').classList.remove('active'); }

function scAddTeam() {
    const input = document.getElementById('scNewTeamName');
    if (!input.value.trim()) return;
    if (scBracket.generated) return alert('Reset the bracket before adding teams.');
    scTeams.push({ id: `sct${Date.now()}`, name: input.value.trim() });
    input.value = '';
    scSaveData();
    scRenderTeamList();
    scRenderTeamSelect();
}

function scDeleteTeam(id) {
    if (!confirm('Delete this team and its players?')) return;
    if (scBracket.generated) return alert('Reset the bracket before deleting teams.');
    scTeams = scTeams.filter(team => team.id !== id);
    scPlayers = scPlayers.filter(player => player.teamId !== id);
    scSaveData();
    scRenderTeamList();
    scRenderPlayerList();
    scRenderTeamSelect();
}

function scRenderTeamList() {
    const list = document.getElementById('scTeamList');
    if (!list) return;
    list.innerHTML = scTeams.length
        ? scTeams.map(team => `<div class="sc-team-list-item"><span>🛡️ ${scEscape(team.name)}</span><button class="sc-item-delete" onclick="scDeleteTeam('${scEscape(team.id)}')">×</button></div>`).join('')
        : '<div class="sc-empty">No teams added yet.</div>';
}

function scAddPlayer() {
    const nameInput = document.getElementById('scNewPlayerName');
    const teamSelect = document.getElementById('scNewPlayerTeam');
    if (!nameInput.value.trim()) return;
    if (!teamSelect.value) return alert('Add a team first.');
    scPlayers.push({ id: `scp${Date.now()}`, name: nameInput.value.trim(), teamId: teamSelect.value });
    nameInput.value = '';
    scSaveData();
    scRenderPlayerList();
}

function scDeletePlayer(id) {
    if (!confirm('Delete this player?')) return;
    scPlayers = scPlayers.filter(player => player.id !== id);
    scSaveData();
    scRenderPlayerList();
}

function scRenderPlayerList() {
    const list = document.getElementById('scPlayerList');
    if (!list) return;
    list.innerHTML = scPlayers.length
        ? scPlayers.map(player => {
            const team = scTeams.find(item => item.id === player.teamId);
            return `<div class="sc-player-list-item"><span>👤 ${scEscape(player.name)} <span class="sc-inline-muted">(${scEscape(team?.name || 'No team')})</span></span><button class="sc-item-delete" onclick="scDeletePlayer('${scEscape(player.id)}')">×</button></div>`;
        }).join('')
        : '<div class="sc-empty">No players registered yet.</div>';
}

function scRenderTeamSelect() {
    const select = document.getElementById('scNewPlayerTeam');
    if (!select) return;
    select.innerHTML = scTeams.length
        ? `<option value="">Select team</option>${scTeams.map(team => `<option value="${scEscape(team.id)}">${scEscape(team.name)}</option>`).join('')}`
        : '<option value="">Add a team first</option>';
}

// --- BRACKET MODEL ---
function scRoundName(index, totalRounds) {
    const fromEnd = totalRounds - index - 1;
    if (fromEnd === 0) return 'Final';
    if (fromEnd === 1) return 'Semi Finals';
    if (fromEnd === 2) return 'Quarter Finals';
    if (fromEnd === 3) return 'Round of 16';
    return `Round of ${Math.pow(2, totalRounds - index)}`;
}

function scMakeLeg(id, homeId = null, awayId = null, number = 1) {
    return { id, number, homeId, awayId, homeScore: null, awayScore: null, homePen: null, awayPen: null, events: [], completed: false, winnerId: null };
}

function scMakeTie(id, roundIndex, matchIndex, twoLegs) {
    return {
        id,
        roundIndex,
        matchIndex,
        homeId: null,
        awayId: null,
        legs: [scMakeLeg(`${id}-leg-1`, null, null, 1), ...(twoLegs ? [scMakeLeg(`${id}-leg-2`, null, null, 2)] : [])],
        completed: false,
        winnerId: null,
        nextMatchId: null,
        nextSlot: null
    };
}

function scGenerateBracket() {
    if (scTeams.length < 2) return alert('Add at least 2 teams first.');
    if (scBracket.generated && !confirm('Generate a new bracket? Existing placements and scores will be replaced.')) return;

    const totalRounds = Math.ceil(Math.log2(scTeams.length));
    const totalSlots = Math.pow(2, totalRounds);
    const base = Date.now();
    let counter = 0;
    const rounds = [];
    const firstRound = [];

    for (let index = 0; index < totalSlots / 2; index += 1) {
        firstRound.push(scMakeTie(`scm-${base}-${counter++}`, 0, index, false));
    }
    rounds.push({ name: scRoundName(0, totalRounds), matches: firstRound });

    let previous = firstRound;
    for (let roundIndex = 1; roundIndex < totalRounds; roundIndex += 1) {
        const current = [];
        for (let matchIndex = 0; matchIndex < previous.length / 2; matchIndex += 1) {
            const tie = scMakeTie(`scm-${base}-${counter++}`, roundIndex, matchIndex, false);
            previous[matchIndex * 2].nextMatchId = tie.id;
            previous[matchIndex * 2].nextSlot = 'home';
            previous[matchIndex * 2 + 1].nextMatchId = tie.id;
            previous[matchIndex * 2 + 1].nextSlot = 'away';
            current.push(tie);
        }
        rounds.push({ name: scRoundName(roundIndex, totalRounds), matches: current });
        previous = current;
    }

    // For a 16-team tournament this is a single-leg final. Semifinals and quarterfinals are two-leg ties.
    const semiRoundIndex = totalRounds - 2;
    rounds.forEach((round, roundIndex) => {
        const isTwoLegRound = roundIndex === totalRounds - 2 || roundIndex === totalRounds - 3;
        if (isTwoLegRound) round.matches.forEach(tie => tie.legs = [scMakeLeg(`${tie.id}-leg-1`), scMakeLeg(`${tie.id}-leg-2`, null, null, 2)]);
    });

    scBracket = {
        rounds,
        thirdPlace: {
            id: `scm-3rd-${base}`,
            roundIndex: semiRoundIndex,
            matchIndex: 0,
            homeId: null,
            awayId: null,
            legs: [scMakeLeg(`scm-3rd-${base}-leg-1`)],
            completed: false,
            winnerId: null,
            isThirdPlace: true
        },
        champion: null,
        generated: true,
        runId: base
    };
    scPlacementMode = true;
    scSaveData();
    scRenderAll();
    alert('Bracket created. Use Place Teams to assign clubs to the first round.');
}

function scResetBracket() {
    if (!confirm('Reset the bracket? All placements, scores, and match events will be lost.')) return;
    scBracket = scEmptyBracket();
    scPlacementMode = false;
    scSaveData();
    scRenderAll();
}

function scTogglePlacementMode() {
    scPlacementMode = !scPlacementMode;
    scRenderAll();
}

function scPlaceTeamInSlot(matchId, slot, teamId) {
    const firstRound = scBracket.rounds[0];
    const tie = firstRound?.matches.find(match => match.id === matchId);
    if (!tie) return;
    firstRound.matches.forEach(match => {
        if (match.homeId === teamId) match.homeId = null;
        if (match.awayId === teamId) match.awayId = null;
        match.legs[0].homeId = match.homeId;
        match.legs[0].awayId = match.awayId;
    });
    if (slot === 'home') tie.homeId = teamId || null;
    else tie.awayId = teamId || null;
    tie.legs[0].homeId = tie.homeId;
    tie.legs[0].awayId = tie.awayId;
    scSaveData();
    scRenderAll();
}

function scFindMatchById(id) {
    for (const round of scBracket.rounds || []) {
        const match = round.matches.find(item => item.id === id);
        if (match) return match;
    }
    return scBracket.thirdPlace?.id === id ? scBracket.thirdPlace : null;
}

function scFindLegById(id) {
    return scGetAllMatches().flatMap(match => match.legs || []).find(leg => leg.id === id) || null;
}

function scGetAllMatches() {
    const matches = (scBracket.rounds || []).flatMap(round => round.matches || []);
    if (scBracket.thirdPlace) matches.push(scBracket.thirdPlace);
    return matches;
}

function scNormalizeBracket() {
    if (!scBracket.rounds) return;
    const totalRounds = scBracket.rounds.length;
    scBracket.rounds.forEach((round, roundIndex) => round.matches.forEach(match => {
        if (!match.legs) {
            match.legs = [scMakeLeg(`${match.id}-leg-1`, match.homeId || null, match.awayId || null)];
            const source = match;
            const target = match.legs[0];
            ['homeScore', 'awayScore', 'homePen', 'awayPen', 'events', 'completed', 'winnerId'].forEach(key => {
                if (source[key] !== undefined) target[key] = source[key];
            });
        }
        // Ensure QF and SF rounds have two legs
        const isTwoLegRound = roundIndex === totalRounds - 2 || roundIndex === totalRounds - 3;
        if (isTwoLegRound && match.legs.length < 2 && !match.isThirdPlace) {
            match.legs.push(scMakeLeg(`${match.id}-leg-2`, null, null, 2));
        }
        match.homeId = match.homeId || match.legs[0].homeId || null;
        match.awayId = match.awayId || match.legs[0].awayId || null;
        match.legs.forEach((leg, index) => { leg.number = index + 1; });
    }));
}

function scTieIsTwoLeg(match) { return (match.legs || []).length === 2; }

function scTieAggregate(match) {
    // IMPORTANT: the return leg of a two-leg tie swaps home/away (it's played at the
    // other team's ground) — see scPrepareTieTeams. So leg.homeId is NOT always
    // match.homeId. We must attribute each leg's goals to the actual team
    // (match.homeId / match.awayId), not to whichever side of that leg happened to be
    // labelled "home". Previously this just summed leg.homeScore/leg.awayScore blindly,
    // which silently flipped the aggregate (and therefore the winner) whenever the
    // return leg's scoreline swap wasn't symmetrical.
    let homeTotal = 0;
    let awayTotal = 0;
    (match.legs || []).forEach(leg => {
        const homeScore = Number.isFinite(leg.homeScore) ? leg.homeScore : 0;
        const awayScore = Number.isFinite(leg.awayScore) ? leg.awayScore : 0;
        if (leg.homeId && leg.homeId === match.awayId) {
            // Return leg: this leg's "home" team is actually the tie's away team.
            homeTotal += awayScore;
            awayTotal += homeScore;
        } else {
            // First leg (or a leg not yet swapped): leg's home/away matches the tie's.
            homeTotal += homeScore;
            awayTotal += awayScore;
        }
    });
    return { home: homeTotal, away: awayTotal };
}

function scProcessTie(match) {
    const legs = match.legs || [];
    if (!legs.length || legs.some(leg => !leg.completed || !leg.homeId || !leg.awayId)) {
        match.completed = false;
        match.winnerId = null;
        return;
    }

    const aggregate = scTieAggregate(match);
    let winnerId = aggregate.home > aggregate.away ? match.homeId : aggregate.away > aggregate.home ? match.awayId : null;
    if (!winnerId) {
        const decidingLeg = legs[legs.length - 1];
        if (decidingLeg.homePen !== null && decidingLeg.awayPen !== null && decidingLeg.homePen !== decidingLeg.awayPen) {
            // Same swap issue as the aggregate: if the deciding leg is a return leg,
            // decidingLeg.homeId is match.awayId, so its "homePen" actually belongs to
            // the tie's away team. Map penalty totals to the real teams before deciding.
            const decidingLegIsSwapped = decidingLeg.homeId && decidingLeg.homeId === match.awayId;
            const homePenTotal = decidingLegIsSwapped ? decidingLeg.awayPen : decidingLeg.homePen;
            const awayPenTotal = decidingLegIsSwapped ? decidingLeg.homePen : decidingLeg.awayPen;
            winnerId = homePenTotal > awayPenTotal ? match.homeId : match.awayId;
        }
    }
    if (!winnerId) {
        match.completed = false;
        match.winnerId = null;
        return;
    }

    match.winnerId = winnerId;
    match.completed = true;
    const nextMatch = match.nextMatchId ? scFindMatchById(match.nextMatchId) : null;
    if (nextMatch) {
        if (match.nextSlot === 'home') nextMatch.homeId = winnerId;
        else nextMatch.awayId = winnerId;
        scPrepareTieTeams(nextMatch);
    } else if (!match.isThirdPlace) {
        scBracket.champion = winnerId;
    }

    const semiRound = scBracket.rounds[scBracket.rounds.length - 2];
    if (semiRound?.matches.includes(match) && scBracket.thirdPlace) {
        const loserId = winnerId === match.homeId ? match.awayId : match.homeId;
        if (match.matchIndex === 0) scBracket.thirdPlace.homeId = loserId;
        else scBracket.thirdPlace.awayId = loserId;
        scPrepareTieTeams(scBracket.thirdPlace);
    }
}

function scPrepareTieTeams(match) {
    if (!match?.legs?.length) return;
    match.legs[0].homeId = match.homeId || null;
    match.legs[0].awayId = match.awayId || null;
    if (match.legs[1]) {
        match.legs[1].homeId = match.awayId || null;
        match.legs[1].awayId = match.homeId || null;
    }
}

function scRenderBracket() {
    const container = document.getElementById('scBracketContainer');
    if (!container) return;
    if (!scBracket.generated || !scBracket.rounds.length) {
        container.innerHTML = `<div class="sc-bracket-empty"><div class="sc-bracket-empty-icon">🏆</div><div class="sc-bracket-empty-text">Bracket not yet generated</div><div class="sc-bracket-empty-sub">${scIsAdmin ? 'Generate the bracket, then place teams into the first round.' : 'Check back soon for the tournament draw.'}</div></div>`;
        scStopFireworks();
        scUpdateCelebrateButton();
        return;
    }

    const champion = scBracket.champion ? scTeams.find(team => team.id === scBracket.champion) : null;
    const championHtml = champion ? `<div class="sc-champion-card"><canvas id="scFireworksCanvas"></canvas><div class="sc-champion-trophy">🏆</div><div class="sc-champion-label">Super Cup Champion</div><div class="sc-champion-name">${scEscape(champion.name)}</div></div>` : '';

    const totalRounds = scBracket.rounds.length;
    const finalRound = scBracket.rounds[totalRounds - 1];
    const finalHtml = finalRound.matches.map(match => scRenderMatchCard(match)).join('');
    const centerHtml = `<div class="sc-bracket-center"><div class="sc-round-label sc-round-label-final">${scEscape(finalRound.name)}</div>${finalHtml}<div class="sc-bracket-trophy">🏆</div></div>`;

    let bracketHtml;
    if (totalRounds < 2) {
        bracketHtml = `<div class="sc-bracket-symmetric single">${centerHtml}</div>`;
    } else {
        const leftCols = [];
        const rightColsRaw = [];
        for (let roundIndex = 0; roundIndex < totalRounds - 1; roundIndex += 1) {
            const round = scBracket.rounds[roundIndex];
            const half = round.matches.length / 2;
            const left = round.matches.filter(match => match.matchIndex < half);
            const right = round.matches.filter(match => match.matchIndex >= half);
            leftCols.push(scRenderRoundColumn(round, left, roundIndex));
            rightColsRaw.push(scRenderRoundColumn(round, right, roundIndex, true));
        }
        const rightCols = rightColsRaw.slice().reverse();
        bracketHtml = `<div class="sc-bracket-symmetric"><div class="sc-bracket-side sc-bracket-side-left">${leftCols.join('')}</div>${centerHtml}<div class="sc-bracket-side sc-bracket-side-right">${rightCols.join('')}</div></div>`;
    }

    const thirdPlace = scBracket.thirdPlace;
    const thirdHtml = thirdPlace ? `<div class="sc-third-place-section"><div class="sc-third-place-title">🥉 Third Place Playoff</div>${scRenderMatchCard(thirdPlace)}</div>` : '';
    container.innerHTML = championHtml + `<div class="sc-bracket-scroll">${bracketHtml}</div>${thirdHtml}`;
    if (champion) scStartFireworks(); else scStopFireworks();
    scUpdateCelebrateButton();
}

function scGroupIntoPairs(matches) {
    const groups = [];
    for (let index = 0; index < matches.length; index += 2) {
        groups.push(matches[index + 1] !== undefined ? [matches[index], matches[index + 1]] : [matches[index]]);
    }
    return groups;
}

function scRenderRoundColumn(round, matches, roundIndex, mirrored) {
    const groups = scGroupIntoPairs(matches);
    const groupsHtml = groups.map(group => {
        const solo = group.length < 2;
        const inner = group.map(match => `<div class="sc-match-wrap">${scPlacementMode && roundIndex === 0 ? scRenderPlacementSlot(match) : scRenderMatchCard(match)}</div>`).join('');
        return `<div class="sc-bracket-pair${solo ? ' solo' : ''}">${inner}</div>`;
    }).join('');
    return `<div class="sc-round-column${mirrored ? ' mirror' : ''}"><div class="sc-round-label">${scEscape(round.name)}</div><div class="sc-round-matches">${groupsHtml}</div></div>`;
}

function scRenderPlacementSlot(match) {
    const options = (selectedId) => `<option value="">— Select team —</option>${scTeams.map(team => `<option value="${scEscape(team.id)}" ${selectedId === team.id ? 'selected' : ''}>${scEscape(team.name)}</option>`).join('')}`;
    return `<div class="sc-match-card sc-placement-slot"><div class="sc-placement-label">Match ${match.matchIndex + 1}</div><select class="sc-slot-select" onchange="scPlaceTeamInSlot('${scEscape(match.id)}','home',this.value)">${options(match.homeId)}</select><select class="sc-slot-select" onchange="scPlaceTeamInSlot('${scEscape(match.id)}','away',this.value)">${options(match.awayId)}</select></div>`;
}

function scRenderMatchCard(match) {
    const home = scTeams.find(team => team.id === match.homeId)?.name || 'TBD';
    const away = scTeams.find(team => team.id === match.awayId)?.name || 'TBD';
    const aggregate = scTieAggregate(match);
    const legsHtml = (match.legs || []).map(leg => {
        const legHome = scTeams.find(team => team.id === leg.homeId)?.name || 'TBD';
        const legAway = scTeams.find(team => team.id === leg.awayId)?.name || 'TBD';
        const homeScore = leg.homeScore === null ? '-' : leg.homeScore;
        const awayScore = leg.awayScore === null ? '-' : leg.awayScore;
        return `<button class="sc-leg-row" onclick="event.stopPropagation();scOpenMatchModal('${scEscape(match.id)}')"><span>Leg ${leg.number}</span><strong>${scEscape(legHome)} <b>${homeScore}–${awayScore}</b> ${scEscape(legAway)}</strong></button>`;
    }).join('');
    const seriesText = scTieIsTwoLeg(match) ? `<div class="sc-series-total">Aggregate <strong>${aggregate.home}–${aggregate.away}</strong></div>` : '';
    return `<div class="sc-match-card ${match.completed ? 'completed' : ''}" onclick="scOpenMatchModal('${scEscape(match.id)}')"><div class="sc-match-card-head"><span>${scEscape(home)}</span><span class="sc-team-score">${match.completed && match.winnerId === match.homeId ? '✓' : ''}</span></div><div class="sc-match-card-head"><span>${scEscape(away)}</span><span class="sc-team-score">${match.completed && match.winnerId === match.awayId ? '✓' : ''}</span></div>${legsHtml}${seriesText}<div class="sc-match-hint">Click for match details</div></div>`;
}

// --- MATCH DETAILS AND SCORE ENTRY ---
function scOpenMatchModal(matchId) {
    const match = scFindMatchById(matchId);
    if (!match) return;
    const home = scTeams.find(team => team.id === match.homeId)?.name || 'TBD';
    const away = scTeams.find(team => team.id === match.awayId)?.name || 'TBD';
    document.getElementById('scLegModalTitle').innerText = `${home} vs ${away}`;
    document.getElementById('scLegModalBody').innerHTML = `<div class="sc-series-summary"><span>${scEscape(home)}</span><strong>${scTieAggregate(match).home} – ${scTieAggregate(match).away}</strong><span>${scEscape(away)}</span></div>${(match.legs || []).map(leg => scRenderLegDetail(match, leg)).join('')}`;
    document.getElementById('scLegModal').classList.add('active');
}

function scRenderLegDetail(match, leg) {
    const home = scTeams.find(team => team.id === leg.homeId)?.name || 'TBD';
    const away = scTeams.find(team => team.id === leg.awayId)?.name || 'TBD';
    const events = leg.events || [];
    const eventHtml = events.length ? events.map(event => {
        const player = scPlayers.find(item => item.id === event.playerId);
        const name = player?.name || event.playerName || 'Unknown player';
        if (event.type === 'assist') return `<div class="sc-goal-assist">↳ Assist: ${scEscape(name)}</div>`;
        const label = event.type === 'ownGoal' ? 'Own goal' : event.scoringType === 'penalty' ? 'Penalty' : 'Goal';
        return `<div class="sc-goal-entry"><span class="sc-goal-scorer">${label}: ${scEscape(name)}</span></div>`;
    }).join('') : '<div class="sc-no-events">No goal details recorded.</div>';
    const score = leg.completed ? `${leg.homeScore} – ${leg.awayScore}` : 'Not played';
    const admin = scIsAdmin && leg.homeId && leg.awayId ? `<button class="sc-enter-score-link" onclick="scOpenScoreModal('${scEscape(leg.id)}')">${leg.completed ? '⚙️ Edit Score' : '✍️ Enter Score'}</button>` : '';
    return `<section class="sc-leg-detail"><div class="sc-leg-detail-header"><span>Leg ${leg.number}</span><strong class="sc-leg-detail-score">${score}</strong><span>${leg.homeScore !== null ? `${scEscape(home)} vs ${scEscape(away)}` : `${scEscape(home)} vs ${scEscape(away)}`}</span></div><div class="sc-leg-detail-events">${eventHtml}</div>${leg.homeScore === leg.awayScore && leg.homePen !== null ? `<div class="sc-penalties">Penalties: ${leg.homePen} – ${leg.awayPen}</div>` : ''}${admin}</section>`;
}

function scCloseLegModal() { document.getElementById('scLegModal').classList.remove('active'); }

function scOpenScoreModal(legId) {
    const leg = scFindLegById(legId);
    if (!leg) return;
    scEditingLegId = legId;
    const match = scGetAllMatches().find(item => item.legs.includes(leg));
    if (!match) return;
    const home = scTeams.find(team => team.id === leg.homeId)?.name || 'Home';
    const away = scTeams.find(team => team.id === leg.awayId)?.name || 'Away';
    document.getElementById('scScoreModalTitle').innerText = `Leg ${leg.number}: ${home} vs ${away}`;
    scGoalEntries = (leg.events || []).filter(event => event.type === 'goal' || event.type === 'ownGoal').map(event => ({ playerId: event.playerId, teamId: event.teamId, playerName: event.playerName, type: event.type, scoringType: event.scoringType || 'regular', assistId: '' }));
    const goalEvents = (leg.events || []).filter(event => event.type === 'goal' || event.type === 'ownGoal');
    goalEvents.forEach((goal, index) => {
        const position = (leg.events || []).indexOf(goal);
        if (leg.events[position + 1]?.type === 'assist') scGoalEntries[index].assistId = leg.events[position + 1].playerId;
    });
    scRenderScoreModalBody(leg);
    document.getElementById('scScoreModal').classList.add('active');
}

function scRenderScoreModalBody(leg) {
    const home = scTeams.find(team => team.id === leg.homeId)?.name || 'Home';
    const away = scTeams.find(team => team.id === leg.awayId)?.name || 'Away';
    const players = scPlayers.filter(player => player.teamId === leg.homeId || player.teamId === leg.awayId);
    const playerOptions = (selected, excludeId = '') => players.filter(player => player.id !== excludeId).map(player => `<option value="${scEscape(player.id)}" ${selected === player.id ? 'selected' : ''}>${scEscape(player.name)}</option>`).join('');
    const goals = scGoalEntries.map((entry, index) => `<div class="sc-goal-row"><select id="scGoalScorer${index}" onchange="scUpdateGoalEntry(${index})"><option value="">— Scorer —</option>${playerOptions(entry.playerId)}</select><select id="scGoalType${index}" onchange="scUpdateGoalEntry(${index})"><option value="goal" ${entry.type === 'goal' && entry.scoringType !== 'penalty' ? 'selected' : ''}>Goal</option><option value="penalty" ${entry.scoringType === 'penalty' ? 'selected' : ''}>Penalty</option><option value="ownGoal" ${entry.type === 'ownGoal' ? 'selected' : ''}>Own goal</option></select><select id="scGoalAssist${index}" onchange="scUpdateGoalEntry(${index})"><option value="">— Specific assist —</option>${playerOptions(entry.assistId, entry.playerId)}</select><button class="sc-remove-goal-btn" onclick="scRemoveGoalEntry(${index})">×</button></div>`).join('');
    document.getElementById('scScoreModalBody').innerHTML = `<div class="sc-score-input-row"><div class="sc-score-input-item"><label>${scEscape(home)}</label><input type="number" id="scHomeScore" value="${leg.homeScore ?? 0}" min="0"></div><div class="sc-score-input-item"><label>${scEscape(away)}</label><input type="number" id="scAwayScore" value="${leg.awayScore ?? 0}" min="0"></div></div><div class="sc-goal-entry-form"><div class="sc-goal-entry-form-header">Goal scorers and specific assists</div><div>${goals}</div><button class="sc-add-goal-btn" onclick="scAddGoalEntry()">+ Add goal</button></div><div class="sc-score-input-row"><div class="sc-score-input-item"><label>${scEscape(home)} pens</label><input type="number" id="scHomePen" value="${leg.homePen ?? ''}" min="0"></div><div class="sc-score-input-item"><label>${scEscape(away)} pens</label><input type="number" id="scAwayPen" value="${leg.awayPen ?? ''}" min="0"></div></div><button class="sc-primary-btn" onclick="scSaveScore()">💾 Save Leg</button>`;
}

function scAddGoalEntry() {
    scGoalEntries.push({ playerId: '', teamId: '', type: 'goal', scoringType: 'regular', assistId: '' });
    scRenderScoreModalBody(scFindLegById(scEditingLegId));
}
function scRemoveGoalEntry(index) {
    scGoalEntries.splice(index, 1);
    scRenderScoreModalBody(scFindLegById(scEditingLegId));
}
function scUpdateGoalEntry(index) {
    const entry = scGoalEntries[index];
    const scorer = document.getElementById(`scGoalScorer${index}`);
    const type = document.getElementById(`scGoalType${index}`);
    const assist = document.getElementById(`scGoalAssist${index}`);
    entry.playerId = scorer.value;
    entry.assistId = assist.value;
    const player = scPlayers.find(item => item.id === entry.playerId);
    entry.teamId = player?.teamId || '';
    entry.playerName = player?.name || '';
    entry.type = type.value === 'penalty' ? 'goal' : type.value;
    entry.scoringType = type.value === 'penalty' ? 'penalty' : 'regular';
}
function scCloseScoreModal() { document.getElementById('scScoreModal').classList.remove('active'); scEditingLegId = null; }

function scSaveScore() {
    if (!scEditingLegId || !scIsAdmin) return;
    const leg = scFindLegById(scEditingLegId);
    if (!leg) return;
    leg.homeScore = Math.max(0, parseInt(document.getElementById('scHomeScore').value, 10) || 0);
    leg.awayScore = Math.max(0, parseInt(document.getElementById('scAwayScore').value, 10) || 0);
    const homePen = parseInt(document.getElementById('scHomePen').value, 10);
    const awayPen = parseInt(document.getElementById('scAwayPen').value, 10);
    leg.homePen = Number.isFinite(homePen) ? homePen : null;
    leg.awayPen = Number.isFinite(awayPen) ? awayPen : null;
    leg.events = [];
    scGoalEntries.forEach(entry => {
        if (!entry.playerId) return;
        const player = scPlayers.find(item => item.id === entry.playerId);
        leg.events.push({ playerId: entry.playerId, playerName: player?.name || entry.playerName || 'Unknown', teamId: player?.teamId || entry.teamId, type: entry.type, scoringType: entry.scoringType });
        if (entry.assistId) {
            const assister = scPlayers.find(item => item.id === entry.assistId);
            leg.events.push({ playerId: entry.assistId, playerName: assister?.name || 'Unknown', teamId: assister?.teamId || '', type: 'assist', scoringType: 'regular' });
        }
    });
    leg.completed = true;
    const match = scGetAllMatches().find(item => item.legs.includes(leg));
    if (match) {
        scPrepareTieTeams(match);
        scProcessTie(match);
    }
    scSaveData();
    scCloseScoreModal();
    scOpenMatchModal(match.id);
    scRenderAll();
}

// --- STATS ---
function scRenderStats() {
    const goals = {};
    const assists = {};
    const ownGoals = {};
    scGetAllMatches().flatMap(match => match.legs || []).forEach(leg => (leg.events || []).forEach(event => {
        const target = event.type === 'assist' ? assists : event.type === 'goal' ? goals : event.type === 'ownGoal' ? ownGoals : null;
        if (!target) return;
        target[event.playerId] = target[event.playerId] || { count: 0, name: event.playerName, teamId: event.teamId };
        target[event.playerId].count += 1;
    }));
    const render = (source, suffix, fill) => {
        const rows = Object.entries(source).map(([id, data]) => ({ ...data, id, team: scTeams.find(team => team.id === data.teamId)?.name || '' })).sort((a, b) => b.count - a.count);
        const max = rows[0]?.count || 1;
        return rows.length ? rows.slice(0, 10).map((row, index) => `<div class="sc-bar-row"><div class="sc-bar-label"><div class="sc-bar-name"><span class="sc-bar-rank ${index === 0 ? 'top' : ''}">${index + 1}</span>${scEscape(row.name)} <span class="sc-bar-team">${scEscape(row.team)}</span></div><div class="sc-bar-value">${row.count} ${suffix}</div></div><div class="sc-bar-track"><div class="sc-bar-fill ${fill}" style="width:${(row.count / max) * 100}%"></div></div></div>`).join('') : '<div class="sc-empty">No records yet.</div>';
    };
    document.getElementById('scTopScorers').innerHTML = render(goals, 'goals', 'goals');
    document.getElementById('scTopAssists').innerHTML = render(assists, 'assists', 'assists');
    const ownGoalsEl = document.getElementById('scOwnGoals');
    if (ownGoalsEl) ownGoalsEl.innerHTML = render(ownGoals, 'own goals', 'own-goals');
}

// --- NEWS ---
function scOpenNewsPostModal() { document.getElementById('scNewsHeadline').value = ''; document.getElementById('scNewsBody').value = ''; document.getElementById('scNewsPostModal').classList.add('active'); }
function scCloseNewsPostModal() { document.getElementById('scNewsPostModal').classList.remove('active'); }
function scPublishNews() {
    if (!scIsAdmin) return;
    const headline = document.getElementById('scNewsHeadline').value.trim();
    const body = document.getElementById('scNewsBody').value.trim();
    if (!headline || !body) return alert('Please fill in both headline and body.');
    scNews.unshift({ id: `scn${Date.now()}`, headline, body, date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) });
    scSaveData();
    scCloseNewsPostModal();
    scRenderNews();
}
function scDeleteNews(id) { if (scIsAdmin && confirm('Delete this news post?')) { scNews = scNews.filter(item => item.id !== id); scSaveData(); scRenderNews(); } }
function scOpenNewsDetail(id) {
    const item = scNews.find(news => news.id === id);
    if (!item) return;
    document.getElementById('scNewsDetailBody').innerHTML = `<div class="sc-news-detail-headline">${scEscape(item.headline)}</div><div class="sc-news-detail-body">${scEscape(item.body).replace(/\n/g, '<br>')}</div><div class="sc-news-detail-date">🗓️ ${scEscape(item.date)}</div>`;
    document.getElementById('scNewsDetailModal').classList.add('active');
}
function scCloseNewsDetail() { document.getElementById('scNewsDetailModal').classList.remove('active'); }
function scRenderNews() {
    const container = document.getElementById('scNewsContainer');
    if (!container) return;
    container.innerHTML = scNews.length ? scNews.map(item => `<div class="sc-news-card" onclick="scOpenNewsDetail('${scEscape(item.id)}')">${scIsAdmin ? `<button class="sc-news-delete" onclick="event.stopPropagation();scDeleteNews('${scEscape(item.id)}')">×</button>` : ''}<div class="sc-news-headline">${scEscape(item.headline)}</div><div class="sc-news-date">🗓️ ${scEscape(item.date)}</div></div>`).join('') : '<div class="sc-empty">No news posts yet.</div>';
}

// --- SQUAD POPUP ---
function scOpenSquadPopup(teamId) {
    const team = scTeams.find(item => item.id === teamId);
    if (!team) return;
    const list = document.getElementById('scSquadPopupList');
    document.getElementById('scSquadPopupTitle').innerText = `${team.name} Squad`;
    const players = scPlayers.filter(player => player.teamId === teamId);
    list.innerHTML = players.length ? players.map(player => {
        let goals = 0;
        let assists = 0;
        let ownGoals = 0;
        scGetAllMatches().flatMap(match => match.legs || []).forEach(leg => (leg.events || []).forEach(event => {
            if (event.playerId !== player.id) return;
            if (event.type === 'goal') goals += 1;
            else if (event.type === 'assist') assists += 1;
            else if (event.type === 'ownGoal') ownGoals += 1;
        }));
        const statsText = `${goals}G / ${assists}A${ownGoals ? ` / ${ownGoals}OG` : ''}`;
        return `<li><span>👤 ${scEscape(player.name)}</span><span class="sc-player-stats">${statsText}</span></li>`;
    }).join('') : '<div class="sc-empty">No players registered.</div>';
    document.getElementById('scSquadPopupModal').classList.add('active');
}
function scCloseSquadPopup() { document.getElementById('scSquadPopupModal').classList.remove('active'); }

// --- CELEBRATION: CHAMPION FIREWORKS + FLOATING BUTTON ---
function scGetChampionTeam() {
    return scBracket.champion ? scTeams.find(team => team.id === scBracket.champion) : null;
}
function scCelebrationKey(teamId) {
    // Scoped to this specific bracket run so a team that wins a later, separate
    // cup run starts its celebration count fresh rather than inheriting an old one.
    return `${scBracket.runId || 'default'}:${teamId}`;
}
function scHasCelebrated(teamId) {
    try { return localStorage.getItem('scCelebrated:' + scCelebrationKey(teamId)) === '1'; }
    catch (e) { return false; }
}
function scMarkCelebrated(teamId) {
    try { localStorage.setItem('scCelebrated:' + scCelebrationKey(teamId), '1'); } catch (e) {}
}
function scUpdateCelebrateButton() {
    const btn = document.getElementById('scCelebrateFloatingBtn');
    if (!btn) return;
    const champion = scGetChampionTeam();
    if (champion) {
        document.getElementById('scCelebrateChampionLabel').innerText = champion.name;
        const count = scCelebrationClicks[scCelebrationKey(champion.id)] || 0;
        document.getElementById('scCelebrateCountLabel').innerText = count.toLocaleString();
        btn.classList.toggle('already-celebrated', scHasCelebrated(champion.id));
        btn.style.display = 'flex';
    } else {
        btn.style.display = 'none';
    }
}

// Ambient fireworks that loop gently inside the champion card
let scFireworksAnimationId = null;
let scFireworksParticles = [];
let scFireworksLastBurst = 0;
function scResizeFireworksCanvas() {
    const canvas = document.getElementById('scFireworksCanvas');
    const card = document.querySelector('.sc-champion-card');
    if (!canvas || !card) return;
    canvas.width = card.clientWidth;
    canvas.height = card.clientHeight;
}
function scSpawnFireworkBurst(cx, cy) {
    const colors = ['#eab308', '#22d3ee', '#34d399', '#fb923c', '#ffffff', '#ef4444'];
    const count = 40 + Math.floor(Math.random() * 20);
    for (let i = 0; i < count; i += 1) {
        const angle = (Math.PI * 2 * i) / count;
        const speed = 2 + Math.random() * 3;
        scFireworksParticles.push({ x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, alpha: 1, color: colors[Math.floor(Math.random() * colors.length)], size: 1.5 + Math.random() * 1.5 });
    }
}
function scFireworksLoop(ts) {
    const card = document.querySelector('.sc-champion-card');
    const canvas = document.getElementById('scFireworksCanvas');
    if (!canvas || !card) { scFireworksAnimationId = null; return; }
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!scFireworksLastBurst || ts - scFireworksLastBurst > 900) {
        scFireworksLastBurst = ts;
        const cx = canvas.width * (0.15 + Math.random() * 0.7);
        const cy = canvas.height * (0.15 + Math.random() * 0.4);
        scSpawnFireworkBurst(cx, cy);
    }
    scFireworksParticles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.03; p.alpha -= 0.012; });
    scFireworksParticles = scFireworksParticles.filter(p => p.alpha > 0);
    scFireworksParticles.forEach(p => {
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;
    scFireworksAnimationId = requestAnimationFrame(scFireworksLoop);
}
function scStartFireworks() {
    scResizeFireworksCanvas();
    if (scFireworksAnimationId) return;
    scFireworksLastBurst = 0;
    scFireworksAnimationId = requestAnimationFrame(scFireworksLoop);
}
function scStopFireworks() {
    if (scFireworksAnimationId) { cancelAnimationFrame(scFireworksAnimationId); scFireworksAnimationId = null; }
    scFireworksParticles = [];
}
window.addEventListener('resize', () => { if (scFireworksAnimationId) scResizeFireworksCanvas(); });

// Fullscreen burst fireworks triggered by clicking the celebrate button
let scCelebrationBurstAnimId = null;
let scCelebrationBurstParticles = [];
let scCelebrationBurstEndsAt = 0;
function scResizeCelebrationCanvas() {
    const canvas = document.getElementById('scCelebrationBurstCanvas');
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', scResizeCelebrationCanvas);
function scSpawnCelebrationBurst(cx, cy) {
    const colors = ['#eab308', '#22d3ee', '#34d399', '#fb923c', '#ffffff', '#ef4444'];
    const count = 55 + Math.floor(Math.random() * 25);
    for (let i = 0; i < count; i += 1) {
        const angle = (Math.PI * 2 * i) / count;
        const speed = 3 + Math.random() * 4;
        scCelebrationBurstParticles.push({ x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, alpha: 1, color: colors[Math.floor(Math.random() * colors.length)], size: 2 + Math.random() * 2 });
    }
}
function scCelebrationBurstLoop(ts) {
    const canvas = document.getElementById('scCelebrationBurstCanvas');
    if (!canvas) { scCelebrationBurstAnimId = null; return; }
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    scCelebrationBurstParticles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.alpha -= 0.011; });
    scCelebrationBurstParticles = scCelebrationBurstParticles.filter(p => p.alpha > 0);
    scCelebrationBurstParticles.forEach(p => {
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;
    if (scCelebrationBurstParticles.length > 0 || ts < scCelebrationBurstEndsAt) {
        scCelebrationBurstAnimId = requestAnimationFrame(scCelebrationBurstLoop);
    } else {
        scCelebrationBurstAnimId = null;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}
function scTriggerCelebrationFireworks() {
    scResizeCelebrationCanvas();
    const canvas = document.getElementById('scCelebrationBurstCanvas');
    scCelebrationBurstEndsAt = performance.now() + 1500;
    const bursts = 4;
    for (let i = 0; i < bursts; i += 1) {
        setTimeout(() => {
            const cx = canvas.width * (0.2 + Math.random() * 0.6);
            const cy = canvas.height * (0.15 + Math.random() * 0.4);
            scSpawnCelebrationBurst(cx, cy);
        }, i * 220);
    }
    if (!scCelebrationBurstAnimId) scCelebrationBurstAnimId = requestAnimationFrame(scCelebrationBurstLoop);
}
function scHandleCelebrateClick() {
    const champion = scGetChampionTeam();
    if (!champion) return;
    // The animation always plays — fans can click as many times as they like —
    // but only the very first click per person per cup run is recorded.
    scTriggerCelebrationFireworks();
    const btn = document.getElementById('scCelebrateFloatingBtn');
    btn.classList.add('celebrate-pulse');
    setTimeout(() => btn.classList.remove('celebrate-pulse'), 400);
    if (scHasCelebrated(champion.id)) return;
    scMarkCelebrated(champion.id);
    const key = scCelebrationKey(champion.id);
    // Optimistic local bump so the click feels instant, then sync via an atomic
    // Firebase transaction on just this one field so simultaneous clicks from
    // other fans never clobber each other or get wiped by an admin's next save.
    scCelebrationClicks[key] = (scCelebrationClicks[key] || 0) + 1;
    scUpdateCelebrateButton();
    if (scDb) {
        scDb.ref('superCupData/celebrationClicks/' + key).transaction(current => (current || 0) + 1);
    }
}

function scRenderAll() {
    scUpdateAdminUI();
    scRenderBracket();
    scRenderStats();
    scRenderNews();
}

function scWaitForFirebase() {
    if (typeof firebase !== 'undefined' && firebase.initializeApp) scInitFirebase();
    else setTimeout(scWaitForFirebase, 50);
}
scWaitForFirebase();
