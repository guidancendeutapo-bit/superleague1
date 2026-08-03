// --- DATABASE ROUTER CONFIGURATION ---
        const SUPABASE_URL = "https://lmvqlkynafaqtwxwzkfn.supabase.co";
        const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxtdnFsa3luYWZhcXR3eHd6a2ZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1NDU4NTIsImV4cCI6MjEwMTEyMTg1Mn0.Cg_GgTqyMr2mpidcbD53NpyfymH0PhTDTlwQPnJrulo";
        const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        let teams = [];
        let players = [];
        let matches = [];
        let newsItems = [];

        let isAdmin = false;
        let activeAppPageId = 'dash';
        let activeLeaderboardTab = 'goals';
        let activeAdminSubTab = 'teams';
        let matchFilterState = 'all';
        let activeEditingMatchId = null;
        const DEFAULT_LEAGUE_CREST_SVG = `<svg viewBox="0 0 48 54" xmlns="http://www.w3.org/2000/svg" width="46" height="52">
            <defs>
                <linearGradient id="shieldOuter" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#06b6d4"/>
                    <stop offset="100%" stop-color="#0369a1"/>
                </linearGradient>
                <linearGradient id="shieldInner" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#0c1e2e"/>
                    <stop offset="100%" stop-color="#05111d"/>
                </linearGradient>
                <linearGradient id="starGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#fbbf24"/>
                    <stop offset="100%" stop-color="#f59e0b"/>
                </linearGradient>
            </defs>
            <path d="M4 3 H44 V36 Q24 52 4 36 Z" fill="url(#shieldOuter)" rx="3"/>
            <path d="M7.5 6.5 H40.5 V34 Q24 48.5 7.5 34 Z" fill="url(#shieldInner)"/>
            <rect x="7.5" y="6.5" width="33" height="5" fill="url(#shieldOuter)" opacity="0.6" rx="1"/>
            <line x1="7.5" y1="22" x2="40.5" y2="22" stroke="#06b6d4" stroke-width="0.7" opacity="0.4"/>
            <text x="24" y="19.5" text-anchor="middle" fill="#06b6d4" font-size="10" font-weight="900" font-family="Segoe UI, Arial, sans-serif" letter-spacing="1.5">SL</text>
            <circle cx="24" cy="34" r="8.5" fill="none" stroke="#06b6d4" stroke-width="1.3" opacity="0.9"/>
            <circle cx="24" cy="34" r="3" fill="#06b6d4" opacity="0.85"/>
            <line x1="24" y1="25.5" x2="24" y2="42.5" stroke="#06b6d4" stroke-width="0.8" opacity="0.35"/>
            <line x1="15.5" y1="34" x2="32.5" y2="34" stroke="#06b6d4" stroke-width="0.8" opacity="0.35"/>
            <text x="24" y="10" text-anchor="middle" fill="url(#starGrad)" font-size="6" font-family="Segoe UI, Arial, sans-serif">★</text>
        </svg>`;
        let historicalPositionsCache = {};
        document.getElementById("copyrightYear").innerText = new Date().getFullYear();
        let seasonConfig = { gamesPerTeam: null };
        let celebrationClicks = {};
        let allSeasons = {};
        let currentSeason = '';
        let viewingSeason = '';
        let seasonRecords = [];
        let leagueBranding = { icon: null };

        function switchAppPage(pageId) {
            activeAppPageId = pageId;
            document.querySelectorAll(".sidebar-menu .menu-item").forEach(el => el.classList.remove("active"));
            document.querySelectorAll(".app-page").forEach(el => el.classList.remove("active"));
            
            document.getElementById(`nav-${pageId}`).classList.add("active");
            document.getElementById(`page-${pageId}`).classList.add("active");

            let headingText = pageId.charAt(0).toUpperCase() + pageId.slice(1);
            if(pageId === 'dash') headingText = "Dashboard Overview";
            if(pageId === 'table') headingText = "Standings & Statistics";
            if(pageId === 'matches') headingText = "Match Center Fixtures";
            if(pageId === 'squads') headingText = "Club Squad Rosters";
            if(pageId === 'news') headingText = "News & Updates";
            if(pageId === 'records') headingText = "Season Records";
            document.getElementById("pageMainHeading").innerText = headingText;

            if (pageId === 'squads') {
                let searchBox = document.getElementById("playerSquadSearch");
                if (searchBox) { searchBox.value = ""; searchPlayersRosterEngine(); }
            }
            if (pageId === 'news') {
                let panel = document.getElementById("newsAdminPostPanel");
                if (panel) panel.style.display = isAdmin ? 'block' : 'none';
            }
            if (pageId === 'records') {
                let panel = document.getElementById("recordsAdminPostPanel");
                if (panel) panel.style.display = (isAdmin && viewingSeason === currentSeason) ? 'block' : 'none';
            }
            if (pageId !== 'dash') stopFireworks();

            renderDashboardAll();
        }

        function computeDefaultSeasonLabel(d) {
            d = d || new Date();
            let y = d.getFullYear();
            // Football-calendar convention: seasons start mid-year (~July) and
            // run into the following year, e.g. a season starting July 2026 is "2026-27".
            let startYear = d.getMonth() >= 6 ? y : y - 1;
            let endYy = (startYear + 1) % 100;
            return startYear + '-' + (endYy < 10 ? '0' + endYy : endYy);
        }

        function pointWorkingVarsToSeason(label) {
            let bucket = allSeasons[label];
            if (!bucket) return;
            teams = Array.isArray(bucket.teams) ? bucket.teams : Object.values(bucket.teams || {});
            players = Array.isArray(bucket.players) ? bucket.players : Object.values(bucket.players || {});
            matches = Array.isArray(bucket.matches) ? bucket.matches : Object.values(bucket.matches || {});
            newsItems = Array.isArray(bucket.newsItems) ? bucket.newsItems : Object.values(bucket.newsItems || {});
            seasonConfig = bucket.seasonConfig && typeof bucket.seasonConfig === 'object' ? bucket.seasonConfig : { gamesPerTeam: null };
            seasonRecords = Array.isArray(bucket.records) ? bucket.records : Object.values(bucket.records || {});
        }

        function seasonLabelSortDesc(a, b) {
            let na = parseInt((a.match(/\d+/) || [0])[0]);
            let nb = parseInt((b.match(/\d+/) || [0])[0]);
            return nb - na;
        }
        function renderSeasonSelectorOptions() {
            let valueEl = document.getElementById('seasonSelectorValue');
            if (!valueEl) return;
            valueEl.innerText = viewingSeason || '—';
            let labels = Object.keys(allSeasons).sort(seasonLabelSortDesc);
            document.getElementById('seasonSelectorMenu').innerHTML = labels.map(l => `
                <div class="season-option ${l === viewingSeason ? 'selected' : ''}" onclick="selectSeason('${l}')">
                    <span class="season-option-check">${l === viewingSeason ? '✓' : ''}</span>
                    <span>${l}${l === currentSeason ? '<span class="season-live-tag">LIVE</span>' : ''}</span>
                </div>`).join('');
        }
        function toggleSeasonDropdown(evt) {
            if (evt) evt.stopPropagation();
            document.getElementById('seasonSelectorMenu').classList.toggle('open');
            document.getElementById('seasonSelectorBtn').classList.toggle('menu-open');
        }
        function closeSeasonDropdown() {
            document.getElementById('seasonSelectorMenu')?.classList.remove('open');
            document.getElementById('seasonSelectorBtn')?.classList.remove('menu-open');
        }
        window.addEventListener('click', (e) => {
            let wrap = document.getElementById('seasonSelector');
            if (wrap && !wrap.contains(e.target)) closeSeasonDropdown();
        });
        function selectSeason(label) {
            closeSeasonDropdown();
            if (label === viewingSeason || !allSeasons[label]) return;
            if (isAdmin && label !== currentSeason) {
                // Historical seasons are read-only — log out of admin mode when browsing them.
                isAdmin = false;
                document.getElementById("adminToggle").innerText = "🔐 Admin Login";
                document.getElementById("adminToggle").classList.remove("logged-in");
                document.getElementById("adminControlPanel").classList.remove("visible");
                document.getElementById("matchCenterAdminActions").style.display = "none";
            }
            viewingSeason = label;
            pointWorkingVarsToSeason(label);
            renderSeasonSelectorOptions();
            updateWeekendDropdownOptions();
            updateHistoricalBanner();
            renderDashboardAll();
        }
        function updateHistoricalBanner() {
            let banner = document.getElementById('historicalSeasonBanner');
            if (!banner) return;
            if (viewingSeason && viewingSeason !== currentSeason) {
                document.getElementById('historicalSeasonBannerLabel').innerText = viewingSeason;
                banner.style.display = 'flex';
            } else {
                banner.style.display = 'none';
            }
        }
        function jumpToCurrentSeason() { selectSeason(currentSeason); }

        async function loadAppDataFromSupabase() {
            const { data: seasonRows, error: seasonsErr } = await db.from('seasons').select('label, data');
            const { data: stateRow, error: stateErr } = await db.from('app_state').select('*').eq('id', 1).maybeSingle();

            if (seasonsErr) { console.error('Failed to load seasons:', seasonsErr); return; }
            if (stateErr) { console.error('Failed to load app_state:', stateErr); return; }

            allSeasons = {};
            (seasonRows || []).forEach(row => { allSeasons[row.label] = row.data; });

            if (Object.keys(allSeasons).length === 0) return; // nothing seeded yet

            currentSeason = (stateRow && stateRow.current_season && allSeasons[stateRow.current_season])
                ? stateRow.current_season
                : Object.keys(allSeasons)[0];

            leagueBranding = (stateRow && stateRow.league_branding) ? stateRow.league_branding : { icon: null };
            renderLeagueBranding();

            if (!viewingSeason || !allSeasons[viewingSeason]) viewingSeason = currentSeason;

            // Safety net: if currentSeason itself doesn't match any real key in the
            // database (typo, stale label, manual edit, etc.), don't silently show an
            // empty dashboard — fall back to whatever season actually exists.
            if (!allSeasons[viewingSeason]) {
                const availableLabels = Object.keys(allSeasons);
                if (availableLabels.length) {
                    availableLabels.sort(seasonLabelSortDesc);
                    viewingSeason = availableLabels[0];
                    currentSeason = viewingSeason;
                }
            }

            pointWorkingVarsToSeason(viewingSeason);
            updateWeekendDropdownOptions();
            renderSeasonSelectorOptions();
            updateHistoricalBanner();
            renderDashboardAll();
        }

        loadAppDataFromSupabase();

        // Realtime: whenever seasons or app_state change (from this tab or any other
        // fan/admin's tab), just reload everything — simplest and safest given how
        // small this dataset is, and matches Firebase's original "send the whole
        // node on every change" behavior.
        db.channel('league-data-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'seasons' }, loadAppDataFromSupabase)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'app_state' }, loadAppDataFromSupabase)
            .subscribe();

        async function persistDatabaseState() {
            if (viewingSeason !== currentSeason) {
                alert("You're viewing a past season in read-only archive mode. Switch to the current season from the Season menu to make changes.");
                return;
            }
            allSeasons[viewingSeason] = { teams, players, matches, newsItems, seasonConfig, records: seasonRecords };
            const { error } = await db.from('seasons').upsert({ label: viewingSeason, data: allSeasons[viewingSeason] });
            if (error) { console.error('Failed to save season data:', error); alert('Something went wrong saving — check your connection and try again.'); return; }
            await db.from('app_state').upsert({ id: 1, current_season: currentSeason });
        }

        // Celebration click counts, kept in the same {seasonLabel: {teamId: count}}
        // shape the rest of the app already expects, just sourced from Supabase now.
        async function loadCelebrationClicks() {
            const { data: rows, error } = await db.from('celebration_clicks').select('*');
            if (error) { console.error('Failed to load celebration clicks:', error); return; }
            const rebuilt = {};
            (rows || []).forEach(row => {
                if (!rebuilt[row.season_label]) rebuilt[row.season_label] = {};
                rebuilt[row.season_label][row.team_id] = row.count;
            });
            celebrationClicks = rebuilt;
            updateCelebrateButton();
        }
        loadCelebrationClicks();
        db.channel('celebration-clicks-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'celebration_clicks' }, loadCelebrationClicks)
            .subscribe();

        async function persistLeagueBranding() {
            const { error } = await db.from('app_state').upsert({ id: 1, league_branding: leagueBranding, current_season: currentSeason });
            if (error) { console.error('Failed to save league branding:', error); alert('Something went wrong saving the icon — check your connection and try again.'); }
        }
        function renderLeagueBranding() {
            let crest = document.getElementById("leagueLogoCrest");
            if (!crest) return;
            if (leagueBranding && leagueBranding.icon) {
                crest.innerHTML = `<img src="${leagueBranding.icon}" alt="League icon" style="width:46px; height:46px; object-fit:cover; border-radius:8px; display:block;">`;
            } else {
                crest.innerHTML = DEFAULT_LEAGUE_CREST_SVG;
            }
            let preview = document.getElementById("leagueIconPreview");
            if (preview) {
                preview.innerHTML = (leagueBranding && leagueBranding.icon)
                    ? `<img src="${leagueBranding.icon}" style="width:100%; height:100%; object-fit:cover; border-radius:8px;">`
                    : `<span style="font-size:11px; color:var(--text-muted);">No icon set</span>`;
            }
            let removeBtn = document.getElementById("leagueIconRemoveBtn");
            if (removeBtn) removeBtn.style.display = (leagueBranding && leagueBranding.icon) ? 'inline-block' : 'none';
        }
        function handleLeagueIconUpload(evt) {
            let file = evt.target.files[0];
            if (!file) return;
            if (file.size > 3 * 1024 * 1024) { alert("Image too large — please use one under 3MB."); return; }
            let reader = new FileReader();
            reader.onload = e => {
                leagueBranding = { icon: e.target.result };
                persistLeagueBranding();
                renderLeagueBranding();
            };
            reader.readAsDataURL(file);
        }
        function removeLeagueIcon() {
            if (!confirm("Remove the league icon and go back to the default crest?")) return;
            leagueBranding = { icon: null };
            persistLeagueBranding();
            renderLeagueBranding();
        }

        function handleAuthAction() {
            if (isAdmin) {
                isAdmin = false;
                document.getElementById("adminToggle").innerText = "🔐 Admin Login";
                document.getElementById("adminToggle").classList.remove("logged-in");
                document.getElementById("adminControlPanel").classList.remove("visible");
                document.getElementById("matchCenterAdminActions").style.display = "none";
                renderDashboardAll();
            } else {
                document.getElementById("portalPassword").value = "";
                document.getElementById("portalOverlay").classList.add("active");
            }
        }

        function closeAdminModal() { document.getElementById("portalOverlay").classList.remove("active"); }

        function validateAdminCredentials() {
            if (document.getElementById("portalPassword").value === "Windhoek") {
                isAdmin = true;
                let btn = document.getElementById("adminToggle");
                btn.innerText = "🔓 Logout Admin";
                btn.classList.add("logged-in");
                closeAdminModal();
                document.getElementById("adminControlPanel").classList.add("visible");
                document.getElementById("matchCenterAdminActions").style.display = "flex";
                switchAdminSubTab(activeAdminSubTab);
                if (activeAppPageId === 'news') {
                    let panel = document.getElementById("newsAdminPostPanel");
                    if (panel) panel.style.display = 'block';
                }
                renderDashboardAll();
            } else {
                alert("Incorrect administrative authorization passphrase.");
            }
        }

        function getTeamRecentForm(teamId) {
            let teamMatches = matches.filter(m => m.completed && (m.homeId === teamId || m.awayId === teamId));
            let recentGames = teamMatches.slice(-3);
            return recentGames.map(m => {
                let isHome = m.homeId === teamId;
                let opponentId = isHome ? m.awayId : m.homeId;
                let opponent = teams.find(t => t.id === opponentId);
                let opponentName = opponent ? opponent.name : 'Unknown';
                let hs = m.homeScore, as = m.awayScore;
                let result = hs === as ? 'D' : (isHome ? (hs > as ? 'W' : 'L') : (as > hs ? 'W' : 'L'));
                let scoreDisplay = isHome ? `${hs} - ${as}` : `${as} - ${hs}`;
                let venue = isHome ? 'vs' : 'vs';
                return { result, opponentName, scoreDisplay, venue };
            });
        }

        function calculateStandings() {
            teams.forEach(t => { t.played = 0; t.won = 0; t.drawn = 0; t.lost = 0; t.gf = 0; t.ga = 0; t.gd = 0; t.pts = 0; });
            players.forEach(p => { p.goals = 0; p.assists = 0; p.ownGoals = 0; });

            matches.forEach(m => {
                let eventsArr = Array.isArray(m.events) ? m.events : Object.values(m.events || {});
                if (eventsArr.length > 0) {
                    eventsArr.forEach(evt => {
                        let targetP = players.find(p => p.id === evt.playerId);
                        if (targetP) {
                            if (evt.type === 'goals') targetP.goals += (evt.count || 0);
                            if (evt.type === 'assists') targetP.assists += (evt.count || 0);
                            if (evt.type === 'ownGoals') targetP.ownGoals += (evt.count || 0);
                        }
                    });
                }

                if (m.completed) {
                    let home = teams.find(t => t.id === m.homeId);
                    let away = teams.find(t => t.id === m.awayId);
                    if (!home || !away) return;
                    home.played++; away.played++;
                    home.gf += m.homeScore; home.ga += m.awayScore;
                    away.gf += m.awayScore; away.ga += m.homeScore;
                    if (m.homeScore > m.awayScore) { home.won++; home.pts += 3; away.lost++; }
                    else if (m.homeScore < m.awayScore) { away.won++; away.pts += 3; home.lost++; }
                    else { home.drawn++; home.pts += 1; away.drawn++; away.pts += 1; }
                    home.gd = home.gf - home.ga; away.gd = away.gf - away.ga;
                }
            });
            teams.sort((a, b) => b.pts - a.pts || b.gd - a.gd);
            renderMiniLeaderboardWidgets();
        }

        function getTiedLeaders(list, statKey) {
            if (!list.length) return { value: 0, leaders: [] };
            let maxVal = Math.max(...list.map(p => p[statKey] || 0));
            let leaders = list.filter(p => (p[statKey] || 0) === maxVal);
            return { value: maxVal, leaders };
        }

        function renderMiniLeaderboardWidgets() {
            let scorerTie = getTiedLeaders(players, 'goals');
            let assistTie = getTiedLeaders(players, 'assists');

            if (scorerTie.value > 0 && scorerTie.leaders.length) {
                let names = scorerTie.leaders.map(p => p.name).join(', ');
                document.getElementById("dashTopScorerName").innerText = names;
                let statText = scorerTie.leaders.length === 1
                    ? `${scorerTie.value} Goals (${teams.find(t => t.id === scorerTie.leaders[0].teamId)?.name || 'Club'})`
                    : `${scorerTie.value} Goals each · ${scorerTie.leaders.length} players tied`;
                document.getElementById("dashTopScorerStat").innerText = statText;
            } else {
                document.getElementById("dashTopScorerName").innerText = "No Records Yet";
                document.getElementById("dashTopScorerStat").innerText = "0 Goals";
            }

            if (assistTie.value > 0 && assistTie.leaders.length) {
                let names = assistTie.leaders.map(p => p.name).join(', ');
                document.getElementById("dashTopAssistorName").innerText = names;
                let statText = assistTie.leaders.length === 1
                    ? `${assistTie.value} Assists (${teams.find(t => t.id === assistTie.leaders[0].teamId)?.name || 'Club'})`
                    : `${assistTie.value} Assists each · ${assistTie.leaders.length} players tied`;
                document.getElementById("dashTopAssistorStat").innerText = statText;
            } else {
                document.getElementById("dashTopAssistorName").innerText = "No Records Yet";
                document.getElementById("dashTopAssistorStat").innerText = "0 Assists";
            }
        }

        function toggleGameSection(sectionId) {
            let body  = document.getElementById(sectionId);
            let arrow = document.getElementById(sectionId + '-arrow');
            if (!body) return;
            let collapsed = body.classList.toggle('collapsed');
            if (arrow) arrow.textContent = collapsed ? '▼' : '▲';
        }

        function toggleInlinePlPanelById(safeId, cardEl) {
            // Primary: find by ID
            let panel = document.getElementById('pl-panel-' + safeId);
            if (panel) { panel.classList.toggle("active"); return; }
            // Fallback: walk up from clicked element to find the fixture-card, then find panel inside
            let card = cardEl;
            while (card && !card.classList.contains('fixture-card')) card = card.parentElement;
            if (card) {
                let fallback = card.querySelector('.pl-style-events-panel');
                if (fallback) fallback.classList.toggle("active");
            }
        }

        function toggleInlinePlPanel(matchId, evt) {
            toggleInlinePlPanelById(matchId, evt && (evt.currentTarget || evt.target));
        }

        function openMatchDetailModal(matchId) {
            let m = matches.find(x => x.id === matchId);
            if (!m) return;

            let hTeam = teams.find(t => t.id === m.homeId);
            let aTeam = teams.find(t => t.id === m.awayId);
            let hName = hTeam?.name || 'Home';
            let aName = aTeam?.name || 'Away';

            // Tag label — derive matchday number from position in sorted matches
            let validMatches = matches.filter(x => x.tag !== "GLOBAL STAT OVERRIDE ADJUSTMENT DATA");
            validMatches.sort((a, b) => {
                let na = parseInt((a.tag.match(/\d+/) || [0])[0]);
                let nb = parseInt((b.tag.match(/\d+/) || [0])[0]);
                return na - nb || matches.indexOf(a) - matches.indexOf(b);
            });
            let mIdx = validMatches.findIndex(x => x.id === matchId);
            let mdNum = mIdx >= 0 ? Math.floor(mIdx / 3) + 1 : '?';

            document.getElementById('mdm-tag').textContent = `MATCHDAY ${mdNum}`;
            document.getElementById('mdm-home-name').textContent = hName;
            document.getElementById('mdm-away-name').textContent = aName;
            document.getElementById('mdm-home-mgr').textContent = '👔 ' + (hTeam?.manager || 'Unknown');
            document.getElementById('mdm-away-mgr').textContent = '👔 ' + (aTeam?.manager || 'Unknown');

            if (m.completed) {
                document.getElementById('mdm-scorebox').textContent = `${m.homeScore} - ${m.awayScore}`;
                document.getElementById('mdm-scorebox').style.color = '#fff';
            } else {
                document.getElementById('mdm-scorebox').textContent = 'VS';
                document.getElementById('mdm-scorebox').style.color = 'var(--text-muted)';
                document.getElementById('mdm-scorebox').style.fontSize = '18px';
            }

            // Build stats body
            let body = document.getElementById('mdm-body');

            if (!m.completed) {
                body.innerHTML = `<div class="empty-state-notice" style="padding:30px 0;">⏳ This match has not been played yet.</div>`;
            } else {
                let eventsArr = Array.isArray(m.events) ? m.events : Object.values(m.events || {});

                // Build per-team goal entries with assist links
                let buildTeamGoals = (teamId) => {
                    let lines = [];
                    eventsArr.forEach(e => {
                        let p = players.find(x => x.id === e.playerId);
                        let displayName = p ? p.name : (e.playerName || null);
                        if (!displayName) return; // no way to identify who this event belongs to
                        // Use the teamId snapshotted at time of match; fall back to current teamId for old data
                        let eventTeamId = e.teamId || (p && p.teamId) || m.homeId;
                        if (eventTeamId !== teamId) return;
                        let departedTag = !p ? ' <span style="font-size:9px;color:var(--text-muted);font-weight:600;">(departed)</span>' : '';
                        if (e.type === 'goals') {
                            let goalsList = e.goalsList || Array.from({length: e.count||1}, (_,i) => ({
                                scoringType: e.scoringType || 'regular',
                                assistedBy: e.assistsList ? e.assistsList[i] : ''
                            }));
                            goalsList.forEach((gl, gi) => {
                                let penMark = gl.scoringType === 'penalty' ? ' <span style="color:var(--accent-yellow);font-size:10px;">(P)</span>' : '';
                                let assister = gl.assistedBy ? players.find(x => x.id === gl.assistedBy) : null;
                                let assisterEvt = gl.assistedBy ? eventsArr.find(ev => ev.playerId === gl.assistedBy && ev.type === 'assists') : null;
                                let assisterName = assister ? assister.name : (assisterEvt ? assisterEvt.playerName : null);
                                let assistLine = assisterName ? `<div style="font-size:10px;color:var(--text-muted);margin-top:1px;">👟 ${assisterName}</div>` : '';
                                lines.push(`<div style="margin-bottom:6px;">⚽ <strong>${displayName}</strong>${penMark}${departedTag}${assistLine}</div>`);
                            });
                        }
                        if (e.type === 'ownGoals') {
                            for (let i = 0; i < (e.count||1); i++) {
                                lines.push(`<div style="margin-bottom:6px;color:var(--danger-red);">🔴 <strong>${displayName}</strong> <span style="font-size:10px;">(OG)</span>${departedTag}</div>`);
                            }
                        }
                    });
                    return lines;
                };

                let homeLines = buildTeamGoals(m.homeId);
                let awayLines = buildTeamGoals(m.awayId);
                let hasStats  = eventsArr.length > 0;

                body.innerHTML = `
                    <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:10px;padding:0 0 10px;margin-bottom:4px;">
                        <div style="text-align:right;font-size:11px;font-weight:700;color:var(--accent-cyan);text-transform:uppercase;letter-spacing:1px;">${hName}</div>
                        <div></div>
                        <div style="text-align:left;font-size:11px;font-weight:700;color:var(--accent-cyan);text-transform:uppercase;letter-spacing:1px;">${aName}</div>
                    </div>
                    ${hasStats ? `
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;font-size:13px;">
                        <div style="text-align:right;">${homeLines.join('') || '<span style="color:var(--text-muted);font-style:italic;">No goals</span>'}</div>
                        <div style="text-align:left;border-left:1px dashed var(--border-color);padding-left:16px;">${awayLines.join('') || '<span style="color:var(--text-muted);font-style:italic;">No goals</span>'}</div>
                    </div>` : '<div class="empty-state-notice">No player stats recorded for this match.</div>'}
                `;
            }

            document.getElementById('matchDetailModal').classList.add('active');
        }

        function closeMatchDetailModal() {
            document.getElementById('matchDetailModal').classList.remove('active');
        }

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') closeMatchDetailModal();
        });

        function openSquadPopupModal(teamId) {
            let t = teams.find(x => x.id === teamId);
            if (!t) return;
            document.getElementById("squadPopupTitle").innerText = `${t.name} Squad Log`;
            document.getElementById("squadPopupManager").innerHTML = `Club Manager: <strong>${t.manager || 'Unassigned Profile'}</strong>`;
            
            let tPlayers = players.filter(p => p.teamId === teamId);
            
            let clubScorerTie = getTiedLeaders(tPlayers, 'goals');
            let clubAssistTie = getTiedLeaders(tPlayers, 'assists');

            document.getElementById("clubPopupTopScorer").innerText = clubScorerTie.value > 0
                ? `${clubScorerTie.leaders.map(p => p.name).join(', ')} (${clubScorerTie.value} G)`
                : "None Registered";
            document.getElementById("clubPopupTopAssistor").innerText = clubAssistTie.value > 0
                ? `${clubAssistTie.leaders.map(p => p.name).join(', ')} (${clubAssistTie.value} A)`
                : "None Registered";

            let rosterHtml = tPlayers.map(p => {
                return `<li><span>👤 <strong>${p.name}</strong></span><small style="color:var(--accent-cyan); font-weight:600;">${p.goals} G / ${p.assists} A</small></li>`;
            }).join('');

            document.getElementById("squadPopupRosterList").innerHTML = rosterHtml || `<div class="empty-state-notice">No active player metrics assigned.</div>`;
            document.getElementById("squadPopupModal").classList.add("active");
        }
        function closeSquadPopupModal() { document.getElementById("squadPopupModal").classList.remove("active"); }

        function searchPlayersRosterEngine() {
            let val = document.getElementById("playerSquadSearch").value.toLowerCase().trim();
            let wrapper = document.getElementById("playerSearchEngineContainer");
            
            if(!val) {
                wrapper.innerHTML = "";
                wrapper.style.display = "none";
                return;
            }

            let filtered = players.filter(p => p.name.toLowerCase().includes(val));
            if(filtered.length === 0) {
                wrapper.innerHTML = `<div class="player-search-result-item" style="color: var(--text-muted); justify-content: center;">No registered player accounts matching "${val}".</div>`;
            } else {
                wrapper.innerHTML = filtered.map(p => {
                    let teamName = teams.find(t => t.id === p.teamId)?.name || "Unassigned Agent";
                    return `
                    <div class="player-search-result-item">
                        <div>
                            <strong style="color:#fff; font-size:14px;">👤 ${p.name}</strong>
                            <span style="display:block; font-size:11px; color: var(--text-muted);">Club Asset: ${teamName}</span>
                        </div>
                        <div style="background-color: var(--bg-color); border:1px solid var(--border-color); padding: 4px 10px; border-radius:4px; font-size:12px;">
                            <span style="color:var(--accent-yellow); font-weight:bold; margin-right:8px;">⚽ ${p.goals} Goals</span>
                            <span style="color:var(--accent-cyan); font-weight:bold;">👟 ${p.assists} Assists</span>
                        </div>
                    </div>`;
                }).join('');
            }
            wrapper.style.display = "flex";
        }

        function openScoreModal(matchId) {
            event.stopPropagation();
            activeEditingMatchId = matchId;
            let m = matches.find(x => x.id === matchId);
            let hTeam = teams.find(t => t.id === m.homeId);
            let aTeam = teams.find(t => t.id === m.awayId);
            let hName = hTeam?.name || 'Home';
            let aName = aTeam?.name || 'Away';

            document.getElementById("scoreModalTitle").innerText = `${hName} vs ${aName}`;
            document.getElementById("modalScoreInputsRow").innerHTML = `
                <div style="flex:1;"><label class="form-label">${hName} Goals</label>
                <input type="number" id="modalHomeScore" class="text-field-widget" value="${m.homeScore ?? 0}" min="0" oninput="rebuildGoalEntrySection()"></div>
                <div style="flex:1;"><label class="form-label">${aName} Goals</label>
                <input type="number" id="modalAwayScore" class="text-field-widget" value="${m.awayScore ?? 0}" min="0" oninput="rebuildGoalEntrySection()"></div>
            `;

            // Parse existing events to pre-fill
            let evArr = m.events ? (Array.isArray(m.events) ? m.events : Object.values(m.events)) : [];
            // Store existing goal-assist links on window for rebuildGoalEntrySection to use
            window._scoreModalMatchId = matchId;
            window._scoreModalExistingEvents = evArr;
            window._scoreModalHomePlayers = players.filter(p => p.teamId === m.homeId);
            window._scoreModalAwayPlayers = players.filter(p => p.teamId === m.awayId);
            window._scoreModalAllPlayers  = [...window._scoreModalHomePlayers, ...window._scoreModalAwayPlayers];

            rebuildGoalEntrySection();
            let searchBox = document.getElementById("goalEntryPlayerSearch");
            if (searchBox) searchBox.value = "";
            document.getElementById("scoreLoggerModal").classList.add("active");
        }

        function rebuildGoalEntrySection() {
            let homeScore = parseInt(document.getElementById("modalHomeScore")?.value) || 0;
            let awayScore = parseInt(document.getElementById("modalAwayScore")?.value) || 0;
            let m = matches.find(x => x.id === window._scoreModalMatchId);
            if (!m) return;

            let evArr = window._scoreModalExistingEvents || [];
            let homePlayers = window._scoreModalHomePlayers || [];
            let awayPlayers = window._scoreModalAwayPlayers || [];
            let allPlayers  = window._scoreModalAllPlayers  || [];

            // Rebuild existing goal events into a lookup: { playerId -> [{scoringType, assistedBy}] }
            // New data model: each goal event has a goalsList array of {scoringType, assistedBy}
            // For backward compat, we read old flat events and reconstruct
            let existingGoals = {}; // playerId -> array of {scoringType, assistedBy}
            let existingOG    = {}; // playerId -> count
            evArr.forEach(e => {
                if (e.type === 'goals') {
                    existingGoals[e.playerId] = e.goalsList || Array.from({length: e.count || 1}, (_, i) => ({
                        scoringType: e.scoringType || 'regular',
                        assistedBy: (e.assistsList && e.assistsList[i]) ? e.assistsList[i] : ''
                    }));
                }
                if (e.type === 'ownGoals') existingOG[e.playerId] = e.count || 0;
            });

            let makePlayerSection = (teamPlayers, teamName, teamSide, totalGoals) => {
                if (teamPlayers.length === 0 && totalGoals === 0) return '';

                // All players from BOTH sides available as assisters (excluding scorer for that row)
                let assistOptions = (excludeId) => allPlayers.map(p =>
                    `<option value="${p.id}" ${''}>👤 ${p.name} (${teams.find(t=>t.id===p.teamId)?.name||''})</option>`
                ).join('');

                let rows = teamPlayers.map(p => {
                    let goals = existingGoals[p.id] || [];
                    let og = existingOG[p.id] || 0;

                    let goalRows = goals.map((gl, gi) => `
                        <div class="goal-entry-row" data-player-id="${p.id}" data-goal-index="${gi}" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;align-items:center;background:#05070a;border:1px solid var(--border-color);border-radius:6px;padding:8px 10px;margin-bottom:6px;">
                            <div style="font-size:12px;color:#fff;">⚽ <strong>${p.name}</strong> — Goal ${gi+1}</div>
                            <select class="stat-input-small goal-type-sel" style="font-size:11px;padding:4px;">
                                <option value="regular" ${gl.scoringType==='regular'?'selected':''}>Open Play</option>
                                <option value="penalty" ${gl.scoringType==='penalty'?'selected':''}>Penalty</option>
                            </select>
                            <select class="stat-input-small assist-sel" style="font-size:11px;padding:4px;">
                                <option value="">— No Assist —</option>
                                ${allPlayers.filter(x=>x.id!==p.id).map(x=>`<option value="${x.id}" ${gl.assistedBy===x.id?'selected':''}>${x.name} (${teams.find(t=>t.id===x.teamId)?.name||''})</option>`).join('')}
                            </select>
                        </div>`).join('');

                    // Own goals row
                    let ogRow = `
                        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;font-size:12px;color:var(--text-muted);">
                            <span style="flex:1;">🔴 ${p.name} — Own Goals</span>
                            <input type="number" class="stat-input-small og-input" data-player-id="${p.id}" value="${og}" min="0" style="width:60px;text-align:center;">
                        </div>`;

                    // Goal count input per player
                    let goalCountRow = `
                        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;background:#0b1520;border:1px solid var(--border-color);border-radius:6px;padding:8px 10px;">
                            <span style="flex:1;font-size:13px;font-weight:700;color:#fff;">👤 ${p.name}</span>
                            <span style="font-size:11px;color:var(--text-muted);">Goals:</span>
                            <input type="number" class="stat-input-small player-goal-count" data-player-id="${p.id}" data-side="${teamSide}" value="${goals.length}" min="0" style="width:55px;text-align:center;" oninput="onPlayerGoalCountChange(this)">
                            <span style="font-size:11px;color:var(--text-muted);">OG:</span>
                            <input type="number" class="stat-input-small og-input" data-player-id="${p.id}" value="${og}" min="0" style="width:55px;text-align:center;">
                        </div>
                        ${goalRows}`;

                    return `<div class="goal-entry-player-block" data-player-name="${p.name.toLowerCase()}" data-has-goals="${(goals.length > 0 || og > 0) ? '1' : '0'}">${goalCountRow}</div>`;
                }).join('');

                return `
                    <div style="margin-bottom:18px;">
                        <div style="font-size:11px;font-weight:800;color:var(--accent-cyan);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--border-color);">
                            ${teamName} — ${totalGoals} Goal${totalGoals!==1?'s':''}
                        </div>
                        ${rows || '<div style="color:var(--text-muted);font-size:12px;padding:6px 0;">No players registered for this team.</div>'}
                    </div>`;
            };

            let homeGoals = parseInt(document.getElementById("modalHomeScore")?.value) || 0;
            let awayGoals = parseInt(document.getElementById("modalAwayScore")?.value) || 0;
            let hName = teams.find(t => t.id === m.homeId)?.name || 'Home';
            let aName = teams.find(t => t.id === m.awayId)?.name || 'Away';

            document.getElementById("modalGoalEntrySection").innerHTML =
                makePlayerSection(homePlayers, hName, 'home', homeGoals) +
                makePlayerSection(awayPlayers, aName, 'away', awayGoals);

            filterGoalEntryPlayers();
        }

        function filterGoalEntryPlayers() {
            let term = (document.getElementById("goalEntryPlayerSearch")?.value || "").toLowerCase().trim();
            let section = document.getElementById("modalGoalEntrySection");
            if (!section) return;

            let anyVisibleTotal = 0;
            section.querySelectorAll(".goal-entry-player-block").forEach(block => {
                let name = block.getAttribute("data-player-name") || "";
                let hasGoals = block.getAttribute("data-has-goals") === "1";
                let show = term ? name.includes(term) : hasGoals;
                block.style.display = show ? "" : "none";
                if (show) anyVisibleTotal++;
            });

            // Hide a team's section heading + empty-state message entirely if every player in it is filtered out
            section.querySelectorAll(":scope > div").forEach(teamSection => {
                let blocks = teamSection.querySelectorAll(".goal-entry-player-block");
                if (blocks.length === 0) return;
                let anyVisible = Array.from(blocks).some(b => b.style.display !== "none");
                teamSection.style.display = anyVisible ? "" : "none";
            });

            let hint = document.getElementById("goalEntrySearchHint");
            if (hint) hint.style.display = (anyVisibleTotal === 0) ? "block" : "none";
        }

        function onPlayerGoalCountChange(input) {
            let pId = input.getAttribute('data-player-id');
            let count = parseInt(input.value) || 0;

            // Update existingGoals for this player
            let existing = (window._scoreModalExistingEvents || []);
            let evIdx = existing.findIndex(e => e.playerId === pId && e.type === 'goals');
            let currentGoals = evIdx >= 0 && existing[evIdx].goalsList ? existing[evIdx].goalsList : [];

            // Resize array
            while (currentGoals.length < count) currentGoals.push({ scoringType: 'regular', assistedBy: '' });
            currentGoals = currentGoals.slice(0, count);

            if (evIdx >= 0) {
                existing[evIdx].goalsList = currentGoals;
                existing[evIdx].count = count;
            } else if (count > 0) {
                existing.push({ playerId: pId, type: 'goals', count, scoringType: 'regular', goalsList: currentGoals });
            }
            window._scoreModalExistingEvents = existing;
            rebuildGoalEntrySection();
        }

        function closeScoreModal() { document.getElementById("scoreLoggerModal").classList.remove("active"); activeEditingMatchId = null; }

        function saveMatchEventsData() {
            if (!activeEditingMatchId || !isAdmin) return;
            let m = matches.find(x => x.id === activeEditingMatchId);
            m.homeScore = parseInt(document.getElementById("modalHomeScore").value) || 0;
            m.awayScore = parseInt(document.getElementById("modalAwayScore").value) || 0;
            m.completed = true;
            m.events = [];

            let section = document.getElementById("modalGoalEntrySection");

            // Collect per-player goal rows
            let playerGoalMap = {}; // playerId -> [ {scoringType, assistedBy} ]
            section.querySelectorAll('.goal-entry-row').forEach(row => {
                let pId = row.getAttribute('data-player-id');
                if (!playerGoalMap[pId]) playerGoalMap[pId] = [];
                playerGoalMap[pId].push({
                    scoringType: row.querySelector('.goal-type-sel').value,
                    assistedBy:  row.querySelector('.assist-sel').value
                });
            });

            // Build events from goal map
            Object.entries(playerGoalMap).forEach(([pId, goals]) => {
                if (goals.length === 0) return;
                // Snapshot the player's current teamId at time of recording
                let scorerPlayer = players.find(x => x.id === pId);
                let snapshotTeamId = scorerPlayer ? scorerPlayer.teamId : null;
                // Push goal event with full goalsList
                m.events.push({
                    playerId: pId,
                    playerName: scorerPlayer ? scorerPlayer.name : null, // ← locked-in name, survives player deletion
                    teamId: snapshotTeamId, // ← locked to the team at time of match
                    type: 'goals',
                    count: goals.length,
                    scoringType: goals[0].scoringType, // backward compat
                    goalsList: goals,
                    assistsList: goals.map(g => g.assistedBy)
                });
                // Push individual assist events per goal
                goals.forEach(g => {
                    if (g.assistedBy) {
                        let assisterPlayer = players.find(x => x.id === g.assistedBy);
                        let assisterTeamId = assisterPlayer ? assisterPlayer.teamId : null;
                        let existing = m.events.find(e => e.playerId === g.assistedBy && e.type === 'assists');
                        if (existing) existing.count++;
                        else m.events.push({ playerId: g.assistedBy, playerName: assisterPlayer ? assisterPlayer.name : null, teamId: assisterTeamId, type: 'assists', count: 1 });
                    }
                });
            });

            // Collect own goals
            section.querySelectorAll('.og-input').forEach(inp => {
                let pId = inp.getAttribute('data-player-id');
                let og = parseInt(inp.value) || 0;
                if (og > 0) {
                    let ogPlayer = players.find(x => x.id === pId);
                    let ogTeamId = ogPlayer ? ogPlayer.teamId : null;
                    m.events.push({ playerId: pId, playerName: ogPlayer ? ogPlayer.name : null, teamId: ogTeamId, type: 'ownGoals', count: og });
                }
            });

            persistDatabaseState();
            closeScoreModal();
        }

        function addNewTeamAction() {
            let inputName = document.getElementById("newTeamInput");
            let inputManager = document.getElementById("newTeamManagerInput");
            if (!inputName.value.trim()) return;
            teams.push({ id: "t" + Date.now(), name: inputName.value.trim(), manager: inputManager.value.trim(), played:0, won:0, drawn:0, lost:0, gf:0, ga:0, gd:0, pts:0 });
            inputName.value = ""; inputManager.value = "";
            persistDatabaseState();
        }
        function deleteTeam(id) {
            if (!confirm("Delete club completely? Players who already have recorded match stats will be kept on record as free agents so past results stay accurate — only players with no match history will be removed.")) return;
            teams = teams.filter(t => t.id !== id);
            // Preserve anyone with real match history by cutting their club tie rather than deleting them.
            players.forEach(p => { if (p.teamId === id && playerHasMatchHistory(p.id)) p.teamId = null; });
            players = players.filter(p => p.teamId !== id);
            persistDatabaseState();
            renderDashboardAll();
        }
        function renameTeam(id) {
            let team = teams.find(t => t.id === id);
            let n = prompt("Enter new name:", team.name);
            let m = prompt("Enter manager name:", team.manager || "");
            if(n && n.trim()) { team.name = n.trim(); team.manager = m ? m.trim() : ""; persistDatabaseState(); }
        }
        function playerHasMatchHistory(playerId) {
            return matches.some(m => {
                let eventsArr = Array.isArray(m.events) ? m.events : Object.values(m.events || {});
                return eventsArr.some(e => e.playerId === playerId);
            });
        }

        function registerNewPlayer() {
            let nameInput = document.getElementById("playerNameInput");
            let teamSelect = document.getElementById("playerTeamSelect");
            if (!nameInput.value.trim()) return;
            players.push({ id: "p" + Date.now(), name: nameInput.value.trim(), teamId: teamSelect.value, goals: 0, assists: 0, ownGoals: 0 });
            nameInput.value = "";
            persistDatabaseState();
        }

        function openPlayerEditModal(playerId) {
            let p = players.find(x => x.id === playerId);
            if (!p) return;
            document.getElementById("editPlayerId").value = p.id;
            document.getElementById("editPlayerName").value = p.name;
            let teamSel = document.getElementById("editPlayerTeam");
            teamSel.innerHTML = '<option value="">— Free Agent (no club) —</option>' + teams.map(t => '<option value="' + t.id + '"' + (t.id === p.teamId ? ' selected' : '') + '>' + t.name + '</option>').join('');
            document.getElementById("editPlayerModal").classList.add("active");
        }

        function closePlayerEditModal() {
            document.getElementById("editPlayerModal").classList.remove("active");
        }

        function savePlayerEdit() {
            let id     = document.getElementById("editPlayerId").value;
            let name   = document.getElementById("editPlayerName").value.trim();
            let teamId = document.getElementById("editPlayerTeam").value;
            if (!name) return alert("Player name cannot be empty.");
            let p = players.find(x => x.id === id);
            if (!p) return;
            p.name   = name;
            p.teamId = teamId || null;
            closePlayerEditModal();
            persistDatabaseState();
        }
        function unregisterPlayer(id) {
            let p = players.find(x => x.id === id);
            if (!p) return;
            if (playerHasMatchHistory(id)) {
                if (!confirm(`${p.name} already has recorded match stats. Removing them from the club will keep their goals, assists and cards on record (shown as a free agent) rather than deleting them completely. Continue?`)) return;
                p.teamId = null;
                persistDatabaseState();
                renderDashboardAll();
                return;
            }
            if (!confirm(`Unregister ${p.name}? They have no recorded match stats, so this will remove their profile completely.`)) return;
            players = players.filter(x => x.id !== id);
            persistDatabaseState();
            renderDashboardAll();
        }
        
        function changePlayerStat(pId, type, amt) {
            let adjustMatch = matches.find(m => m.tag === "GLOBAL STAT OVERRIDE ADJUSTMENT DATA");
            if (!adjustMatch) {
                adjustMatch = { id: "m-adj-" + Date.now(), tag: "GLOBAL STAT OVERRIDE ADJUSTMENT DATA", homeId: "t1", awayId: "t2", homeScore: null, awayScore: null, completed: false, events: [] };
                matches.push(adjustMatch);
            }
            let evAdj = Array.isArray(adjustMatch.events) ? adjustMatch.events : Object.values(adjustMatch.events || {});
            adjustMatch.events = evAdj;
            let ev = adjustMatch.events.find(e => e.playerId === pId && e.type === type);
            if (ev) { 
                ev.count += amt; 
                if(ev.count <= 0) adjustMatch.events = adjustMatch.events.filter(e => e !== ev); 
            } else if (amt > 0) { 
                let statPlayer = players.find(x => x.id === pId);
                adjustMatch.events.push({ playerId: pId, playerName: statPlayer ? statPlayer.name : null, teamId: statPlayer ? statPlayer.teamId : null, type: type, count: amt, scoringType: 'regular' }); 
            }
            persistDatabaseState();
        }

        function defaultDoubleRoundRobinLength() {
            let n = teams.filter(t => t.id !== 'dummy-bye').length;
            if (n < 2) return 0;
            return (n - 1) * 2;
        }
        function gamesPlayedByTeam(teamId) {
            return matches.filter(m => m.completed && m.tag !== "GLOBAL STAT OVERRIDE ADJUSTMENT DATA" && (m.homeId === teamId || m.awayId === teamId)).length;
        }
        function currentSeasonTarget() {
            return (seasonConfig && seasonConfig.gamesPerTeam) ? seasonConfig.gamesPerTeam : defaultDoubleRoundRobinLength();
        }
        function isSeasonComplete() {
            let realTeams = teams.filter(t => t.id !== 'dummy-bye');
            if (realTeams.length < 2) return false;
            let target = currentSeasonTarget();
            if (target <= 0) return false;
            return realTeams.every(t => gamesPlayedByTeam(t.id) >= target);
        }
        function updateSeasonLength() {
            let raw = document.getElementById("seasonGamesPerTeamInput").value.trim();
            if (raw === '') {
                seasonConfig = { gamesPerTeam: null };
            } else {
                let val = parseInt(raw);
                if (!val || val < 1) return alert("Enter a valid number of games per team (1 or more), or leave it blank to use the automatic default.");
                seasonConfig = { gamesPerTeam: val };
            }
            persistDatabaseState();
            switchAdminSubTabDesignRender();
            alert("✅ Season length updated. The system will track progress toward this target and stop auto-generating fixtures once every club reaches it.");
        }

        async function updateCurrentSeasonLabel() {
            let raw = document.getElementById("currentSeasonLabelInput").value.trim();
            if (!raw) return alert("Enter a season label, e.g. 2026-27");
            if (raw === currentSeason) return;
            if (allSeasons[raw]) return alert('A season labeled "' + raw + '" already exists. Choose a different label, or browse that season from the Season menu.');
            let oldLabel = currentSeason;
            allSeasons[raw] = allSeasons[currentSeason];
            delete allSeasons[currentSeason];
            currentSeason = raw;
            viewingSeason = raw;
            await db.from('seasons').insert({ label: raw, data: allSeasons[raw] });
            await db.from('seasons').delete().eq('label', oldLabel);
            await db.from('app_state').upsert({ id: 1, current_season: currentSeason });
            renderSeasonSelectorOptions();
            updateHistoricalBanner();
            switchAdminSubTabDesignRender();
            renderDashboardAll();
            alert("✅ Season label updated to " + raw);
        }

        function startNewLeagueSeason() {
            let raw = document.getElementById("newSeasonLabelInput").value.trim();
            if (!raw) return alert("Enter a label for the new season, e.g. 2027-28");
            if (allSeasons[raw]) return alert('A season labeled "' + raw + '" already exists.');
            if (!confirm(`Start the ${raw} season? This will archive all current fixtures, news and results under "${currentSeason}" (still browsable from the Season menu) and begin a fresh fixture list for ${raw}. Clubs and players carry over with their stats reset to zero.`)) return;

            // Freeze the season that's ending, exactly as it stands right now.
            allSeasons[currentSeason] = { teams, players, matches, newsItems, seasonConfig };

            // The new season starts with the same roster but a clean slate of fixtures/news.
            let carriedTeams = teams.filter(t => t.id !== 'dummy-bye').map(t => Object.assign({}, t, {
                played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0
            }));
            let carriedPlayers = players.map(p => Object.assign({}, p, { goals: 0, assists: 0, ownGoals: 0 }));

            allSeasons[raw] = {
                teams: carriedTeams,
                players: carriedPlayers,
                matches: [],
                newsItems: [],
                seasonConfig: { gamesPerTeam: null }
            };

            currentSeason = raw;
            viewingSeason = raw;
            pointWorkingVarsToSeason(raw);
            saveLeagueData();
            renderSeasonSelectorOptions();
            updateHistoricalBanner();
            updateWeekendDropdownOptions();
            switchAdminSubTabDesignRender();
            renderDashboardAll();
            alert(`🏁 Welcome to the ${raw} season!`);
        }

        function autoGenerateFixtures() {
            if (teams.length < 2) return alert("Add at least 2 clubs first.");
            if (!confirm("Generate upcoming fixtures? Completed matches are kept. Only unplayed fixtures will be replaced.")) return;

            // Keep completed matches + the stat override record
            matches = matches.filter(m => m.completed || m.tag === "GLOBAL STAT OVERRIDE ADJUSTMENT DATA");

            let allTeams = teams.filter(t => t.id !== 'dummy-bye');
            let n = allTeams.length;

            // ── Berger circle round-robin ──
            // Generates every team playing every other team exactly once per leg
            let pool = [...allTeams];
            if (pool.length % 2 !== 0) pool.push({ id: 'dummy-bye', name: 'BYE' });
            let sz = pool.length;
            let totalRounds = sz - 1;
            let fixed = pool[0];
            let rotating = pool.slice(1);

            // Generate all rounds for first leg
            let leg1 = [];
            for (let r = 0; r < totalRounds; r++) {
                let round = [];
                let opp = rotating[(totalRounds - 1 - r) % rotating.length];
                // fixed vs opp
                if (fixed.id !== 'dummy-bye' && opp.id !== 'dummy-bye') {
                    round.push({ h: fixed, a: opp });
                }
                // pair remaining
                for (let i = 1; i <= Math.floor((sz - 2) / 2); i++) {
                    let t1 = rotating[(totalRounds - r + i - 1) % rotating.length];
                    let t2 = rotating[(totalRounds - r - i) % rotating.length];
                    if (t1 && t2 && t1.id !== 'dummy-bye' && t2.id !== 'dummy-bye') {
                        round.push({ h: t1, a: t2 });
                    }
                }
                leg1.push(round);
            }

            // Second leg = swap home/away
            let leg2 = leg1.map(round => round.map(p => ({ h: p.a, a: p.h })));

            // Full schedule = leg1 + leg2
            let allRounds = [...leg1, ...leg2];

            // ── Determine which rounds are already fully played ──
            // Build set of played pairs (sorted) → set of round-robin round indices played
            let playedPairs = new Set();
            matches.filter(m => m.completed).forEach(m => {
                playedPairs.add([m.homeId, m.awayId].sort().join('|'));
            });

            // Find first leg round index for each played pair
            let leg1PlayedSet = new Set();
            leg1.forEach((round, rIdx) => {
                let allInRoundPlayed = round.every(p => playedPairs.has([p.h.id, p.a.id].sort().join('|')));
                if (allInRoundPlayed) leg1PlayedSet.add(rIdx);
            });
            let leg2PlayedSet = new Set();
            leg2.forEach((round, rIdx) => {
                let allInRoundPlayed = round.every(p => playedPairs.has([p.h.id, p.a.id].sort().join('|')));
                if (allInRoundPlayed) leg2PlayedSet.add(rIdx);
            });

            // Build remaining rounds in order
            let remainingRounds = [];
            leg1.forEach((round, rIdx) => { if (!leg1PlayedSet.has(rIdx)) remainingRounds.push(round); });
            leg2.forEach((round, rIdx) => { if (!leg2PlayedSet.has(rIdx)) remainingRounds.push(round); });

            if (remainingRounds.length === 0) {
                return alert("All fixtures for both legs have been completed! The full season is done.");
            }

            // ── Respect admin-configured season length (games per team) ──
            let seasonTarget = currentSeasonTarget();
            if (seasonTarget > 0) {
                let alreadyPlayedRounds = leg1PlayedSet.size + leg2PlayedSet.size;
                let roundsAllowed = seasonTarget - alreadyPlayedRounds;
                if (roundsAllowed <= 0) {
                    return alert(`🏁 Season length reached — every club has already played ${alreadyPlayedRounds} of the ${seasonTarget} scheduled games this season. Adjust the season length in Admin ▸ Season Settings if you want to schedule more matchdays.`);
                }
                if (remainingRounds.length > roundsAllowed) {
                    remainingRounds = remainingRounds.slice(0, roundsAllowed);
                }
            }

            // ── Enforce rest: a team that played first (home) last matchday cannot play home first next matchday ──
            // Track which team played home position in each completed matchday
            let validCompleted = matches.filter(m => m.completed && m.tag !== "GLOBAL STAT OVERRIDE ADJUSTMENT DATA");
            validCompleted.sort((a, b) => {
                let na = parseInt((a.tag.match(/\d+/) || [0])[0]);
                let nb = parseInt((b.tag.match(/\d+/) || [0])[0]);
                return na - nb;
            });
            // Group into matchdays of 3 to find last matchday's first-home team
            let lastMatchdayHomeIds = new Set();
            if (validCompleted.length > 0) {
                let lastGroup = [];
                let lastTagNum = parseInt((validCompleted[validCompleted.length-1].tag.match(/\d+/)||[0])[0]);
                validCompleted.forEach(m => {
                    let n = parseInt((m.tag.match(/\d+/)||[0])[0]);
                    if (n === lastTagNum) lastGroup.push(m);
                });
                // First match in group = the one that played first slot
                if (lastGroup.length > 0) lastMatchdayHomeIds.add(lastGroup[0].homeId);
            }

            // For each remaining round, rotate fixture order so the team that rested goes first
            remainingRounds = remainingRounds.map(round => {
                // Sort: push any match where homeId was in last matchday's first slot to end
                return [...round].sort((a, b) => {
                    let aRested = lastMatchdayHomeIds.has(a.h.id) ? 1 : 0;
                    let bRested = lastMatchdayHomeIds.has(b.h.id) ? 1 : 0;
                    return aRested - bRested;
                });
            });

            // ── Determine next matchday number ──
            let usedNums = validCompleted.map(m => {
                let gm = m.tag.match(/\d+/);
                return gm ? parseInt(gm[0]) : 0;
            }).filter(n => n > 0);
            // We now regroup into matchdays of 3 to get how many sequential matchdays exist
            let totalPlayedMatchdays = Math.ceil(validCompleted.length / 3);
            let nextMdNum = totalPlayedMatchdays + 1;

            // ── Push new fixtures ──
            remainingRounds.forEach((round, i) => {
                let mdNum = nextMdNum + i;
                let tag = `MATCHDAY ${mdNum}`;
                round.forEach((p, j) => {
                    matches.push({
                        id: `m-auto-${mdNum}-${j}-${Date.now() + j}`,
                        tag,
                        homeId: p.h.id,
                        awayId: p.a.id,
                        homeScore: null,
                        awayScore: null,
                        completed: false,
                        events: []
                    });
                });
            });

            persistDatabaseState();
            renderDashboardAll();
            alert(`✅ Generated ${remainingRounds.length} matchday(s) — Matchday ${nextMdNum} to Matchday ${nextMdNum + remainingRounds.length - 1}. Each team plays every other team once per leg with rest enforced.`);
        }

        function toggleManualMatchModal(open) {
            if(open) {
                let hDropdown = document.getElementById("selHomeTeam"), aDropdown = document.getElementById("selAwayTeam");
                hDropdown.innerHTML = ""; aDropdown.innerHTML = "";
                teams.forEach(t => { hDropdown.add(new Option(t.name, t.id)); aDropdown.add(new Option(t.name, t.id)); });
                document.getElementById("manualMatchModal").classList.add("active");
            } else { document.getElementById("manualMatchModal").classList.remove("active"); }
        }
        function processManualMatch(e) {
            e.preventDefault();
            let homeId = document.getElementById("selHomeTeam").value;
            let awayId = document.getElementById("selAwayTeam").value;
            let tag = document.getElementById("txtRoundTag").value.toUpperCase().trim();
            if(homeId === awayId) return alert("Clubs cannot align against themselves.");
            matches.push({ id: "m-man-" + Date.now(), tag, homeId, awayId, homeScore: null, awayScore: null, completed: false, events: [] });
            toggleManualMatchModal(false);
            persistDatabaseState();
        }
        function deleteFixtureRecord(id) { if(confirm("Wipe scheduled fixture profile?")) { matches = matches.filter(m => m.id !== id); persistDatabaseState(); } }
        function setMatchFilter(t) { matchFilterState = t; document.querySelectorAll(".filter-btn-group button").forEach(b => b.classList.remove("active")); event.currentTarget.classList.add("active"); renderDashboardAll(); }
        function switchLeaderboardTab(t) { activeLeaderboardTab = t; document.querySelectorAll("#leadTabs .tab-btn").forEach(b => b.classList.remove("active")); event.currentTarget.classList.add("active"); renderLeaderboardOnly(); }
        function switchAdminSubTab(t) { activeAdminSubTab = t; switchAdminSubTabDesignRender(); }

        function switchAdminSubTabDesignRender() {
            let inputCol = document.getElementById("adminPanelInputColumn");
            document.querySelectorAll(".panel-tab-pill-box .pill-btn").forEach(b => b.classList.remove("active"));
            if (activeAdminSubTab === 'teams') {
                document.getElementById("subTabTeams").classList.add("active");
                document.getElementById("managementListTitleLabel").innerText = "Registered Clubs Directory";
                // Hide search on teams tab
                let sw = document.getElementById('adminPlayerSearchWrap');
                if (sw) { sw.style.display = 'none'; }
                inputCol.innerHTML = `
                    <div class="card-wrapper" style="background-color:#05070a; display:flex; flex-direction:column; gap:10px;">
                        <div><label class="form-label">Football Club Name</label><input type="text" id="newTeamInput" class="text-field-widget"></div>
                        <div><label class="form-label">Manager Profile</label><input type="text" id="newTeamManagerInput" class="text-field-widget"></div>
                        <button class="register-action-btn" onclick="addNewTeamAction()">Add Club Profile</button>
                    </div>`;
            } else if (activeAdminSubTab === 'season') {
                document.getElementById("subTabSeason").classList.add("active");
                document.getElementById("managementListTitleLabel").innerText = "Per-Club Season Progress";
                let sw = document.getElementById('adminPlayerSearchWrap');
                if (sw) { sw.style.display = 'none'; }
                let realTeams = teams.filter(t => t.id !== 'dummy-bye');
                let suggested = defaultDoubleRoundRobinLength();
                let current = (seasonConfig && seasonConfig.gamesPerTeam) ? seasonConfig.gamesPerTeam : '';
                inputCol.innerHTML = `
                    <div class="card-wrapper" style="background-color:#05070a; display:flex; flex-direction:column; gap:10px;">
                        <div>
                            <label class="form-label">Current Season Label</label>
                            <input type="text" id="currentSeasonLabelInput" class="text-field-widget" value="${currentSeason}" placeholder="e.g. 2026-27">
                            <p style="font-size:11px; color:var(--text-muted); margin-top:6px; line-height:1.5;">This is the label fans see for the season currently being played (e.g. "2026-27"). Update it here if it's ever wrong.</p>
                        </div>
                        <button class="register-action-btn" onclick="updateCurrentSeasonLabel()">💾 Save Season Label</button>
                        <div style="border-top:1px solid var(--border-color); margin-top:6px; padding-top:14px;">
                            <label class="form-label">Games Per Team This Season</label>
                            <input type="number" id="seasonGamesPerTeamInput" class="text-field-widget" min="1" value="${current}" placeholder="${suggested || 'e.g. 10'}">
                            <p style="font-size:11px; color:var(--text-muted); margin-top:6px; line-height:1.5;">A full home-and-away round robin for ${realTeams.length} club${realTeams.length===1?'':'s'} works out to ${suggested} games per club. Leave this blank to use that automatic default, or set your own number to end the season earlier.</p>
                            <button class="register-action-btn" onclick="updateSeasonLength()">💾 Save Season Length</button>
                        </div>
                        <div style="border-top:1px solid var(--border-color); margin-top:6px; padding-top:14px;">
                            <label class="form-label">🏁 Start a New Season</label>
                            <p style="font-size:11px; color:var(--text-muted); margin:4px 0 8px; line-height:1.5;">Archives all of this season's fixtures, news and results under "${currentSeason}" so fans can still browse them from the Season menu, and starts a fresh season with the same clubs & players but a clean fixture list.</p>
                            <input type="text" id="newSeasonLabelInput" class="text-field-widget" placeholder="e.g. ${(function(){ let n = parseInt((currentSeason.match(/\d+/)||[0])[0]); return n ? (n+1)+'-'+String((n+2)%100).padStart(2,'0') : '2027-28'; })()}">
                            <button class="register-action-btn" style="margin-top:8px;" onclick="startNewLeagueSeason()">Start New Season</button>
                        </div>
                    </div>`;
            } else if (activeAdminSubTab === 'branding') {
                document.getElementById("subTabBranding").classList.add("active");
                document.getElementById("managementListTitleLabel").innerText = "League Icon Preview";
                let sw = document.getElementById('adminPlayerSearchWrap');
                if (sw) { sw.style.display = 'none'; }
                inputCol.innerHTML = `
                    <div class="card-wrapper" style="background-color:#05070a; display:flex; flex-direction:column; gap:10px;">
                        <div>
                            <label class="form-label">League Icon</label>
                            <p style="font-size:11px; color:var(--text-muted); margin:4px 0 10px; line-height:1.5;">Shown in the sidebar in place of the default crest. JPG or PNG works best, square images look cleanest.</p>
                            <label class="register-action-btn" style="display:inline-block; cursor:pointer;" for="leagueIconFileInput">📤 Upload League Icon</label>
                            <input type="file" id="leagueIconFileInput" accept="image/*" style="display:none;" onchange="handleLeagueIconUpload(event)">
                            <button class="register-action-btn" id="leagueIconRemoveBtn" style="display:none; background:transparent; border:1px solid var(--border-color); color:var(--danger-red); margin-left:8px;" onclick="removeLeagueIcon()">Remove Icon</button>
                        </div>
                    </div>`;
                document.getElementById("adminPanelListingItems").innerHTML = `
                    <li class="management-item" style="justify-content:center; padding:24px;">
                        <div id="leagueIconPreview" style="width:96px; height:96px; border-radius:12px; background:var(--bg-color); border:1px solid var(--border-color); display:flex; align-items:center; justify-content:center; overflow:hidden;"></div>
                    </li>`;
                renderLeagueBranding();
            } else {
                document.getElementById("subTabPlayers").classList.add("active");
                document.getElementById("managementListTitleLabel").innerText = "Registered Players Log Directory";
                // Show search on players tab
                let sw = document.getElementById('adminPlayerSearchWrap');
                if (sw) { sw.style.display = 'block'; }
                let options = teams.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
                inputCol.innerHTML = `
                    <div class="card-wrapper" style="background-color:#05070a; display:flex; flex-direction:column; gap:10px;">
                        <div><label class="form-label">Player Name</label><input type="text" id="playerNameInput" class="text-field-widget"></div>
                        <div><label class="form-label">Assigned Club</label><select id="playerTeamSelect" class="select-dropdown-widget">${options}</select></div>
                        <button class="register-action-btn" onclick="registerNewPlayer()">Register To Roster</button>
                    </div>`;
            }
            renderDashboardAll();
        }

        function updateWeekendDropdownOptions() {
            let selector = document.getElementById("weekendFilterSelect");
            if(!selector) return;
            let val = selector.value; selector.innerHTML = `<option value="ALL_ROUNDS">All Matchdays</option>`;
            [...new Set(matches.map(m => m.tag))].forEach(t => { if(t !== "GLOBAL STAT OVERRIDE ADJUSTMENT DATA") selector.add(new Option(t, t)); });
            if([...selector.options].some(o => o.value === val)) selector.value = val;
        }

        function renderLeaderboardOnly() {
            let sorted = [...players].filter(p => p[activeLeaderboardTab] > 0).sort((a,b) => b[activeLeaderboardTab] - a[activeLeaderboardTab]);
            document.getElementById("leaderboardContent").innerHTML = sorted.length === 0 ? `<div class="empty-state-notice">No milestone stats records matching logged criteria.</div>` : 
                `<ul style="list-style:none;">` + sorted.map((p, idx) => {
                    return `<li class="leaderboard-row ${idx===0?'top-tier-highlight':''}"><span><strong>${p.name}</strong> (${teams.find(t=>t.id===p.teamId)?.name || 'FA'})</span><span class="col-green">${p[activeLeaderboardTab]}</span></li>`;
                }).join('') + `</ul>`;
        }

        // ---- NEWS FUNCTIONS ----
        const newsCategoryMeta = {
            announcement: { label: '📢 Announcement', cls: 'news-cat-announcement' },
            matchday:     { label: '⚽ Match Day',    cls: 'news-cat-matchday' },
            transfer:     { label: '🔄 Transfer',     cls: 'news-cat-transfer' },
            general:      { label: '📌 General',      cls: 'news-cat-general' },
        };

        async function generateAINewsOptions() {
            let prompt = document.getElementById("aiNewsPrompt").value.trim();
            if (!prompt) return alert("Please describe what the news is about first.");

            let btn = document.getElementById("aiGenerateBtn");
            let container = document.getElementById("aiOptionsContainer");
            let list = document.getElementById("aiOptionsList");

            btn.innerText = "⏳ Generating...";
            btn.disabled = true;
            container.style.display = "none";
            list.innerHTML = "";

            // Build context from current league data
            let teamNames = teams.map(t => t.name).join(", ");
            let systemPrompt = `You are a sports news writer for a school soccer league called Super League. The teams in the league are: ${teamNames || "various teams"}. Write in a clear, energetic, school-appropriate tone. Always respond with ONLY a JSON array of exactly 3 objects, each with "headline" and "body" fields. No extra text, no markdown.`;
            let userPrompt = `Write 3 different versions of a news post about this: "${prompt}". Each version should have a different tone — one formal/official, one exciting/energetic, one short and punchy. Return only a JSON array like: [{"headline":"...","body":"..."},{"headline":"...","body":"..."},{"headline":"...","body":"..."}]`;

            try {
                // Try direct API first (works when hosted online), fallback to proxy for local use
                let response, data;
                const requestBody = JSON.stringify({
                    model: "claude-sonnet-4-6",
                    max_tokens: 1000,
                    system: systemPrompt,
                    messages: [{ role: "user", content: userPrompt }]
                });

                try {
                    response = await fetch("https://api.anthropic.com/v1/messages", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: requestBody
                    });
                    if (!response.ok) throw new Error("Direct API failed");
                    data = await response.json();
                } catch(_) {
                    // CORS proxy fallback for local file usage
                    response = await fetch("https://corsproxy.io/?" + encodeURIComponent("https://api.anthropic.com/v1/messages"), {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: requestBody
                    });
                    data = await response.json();
                }

                let raw = data.content.map(i => i.text || "").join("").trim();
                raw = raw.replace(/```json|```/g, "").trim();
                let options = JSON.parse(raw);

                list.innerHTML = options.map((opt, i) => `
                    <div onclick="selectAIOption(${i})" id="ai-opt-${i}" style="background:#0b1520; border:1px solid var(--border-color); border-radius:8px; padding:12px; cursor:pointer; transition:border-color 0.2s;">
                        <div style="font-size:11px; font-weight:700; color:var(--accent-cyan); margin-bottom:4px; text-transform:uppercase; letter-spacing:0.5px;">Option ${i+1}</div>
                        <div style="font-size:13px; font-weight:700; color:#fff; margin-bottom:6px;">${opt.headline}</div>
                        <div style="font-size:12px; color:#94a3b8; line-height:1.5;">${opt.body}</div>
                    </div>`).join("");

                // Store options for selection
                window._aiNewsOptions = options;
                container.style.display = "block";
            } catch(err) {
                alert("AI generation failed. Please check your connection and try again.");
                console.error(err);
            }

            btn.innerText = "✨ Generate Options";
            btn.disabled = false;
        }

        function selectAIOption(index) {
            let opt = window._aiNewsOptions[index];
            if (!opt) return;
            document.getElementById("newsTitle").value = opt.headline;
            document.getElementById("newsBody").value = opt.body;
            // Highlight selected
            document.querySelectorAll("#aiOptionsList > div").forEach((el, i) => {
                el.style.borderColor = i === index ? "var(--accent-cyan)" : "var(--border-color)";
                el.style.background  = i === index ? "rgba(6,182,212,0.08)" : "#0b1520";
            });
        }

        function publishNewsPost() {
            if (!isAdmin) return;
            let title = document.getElementById("newsTitle").value.trim();
            let body  = document.getElementById("newsBody").value.trim();
            let cat   = document.getElementById("newsCategory").value;
            if (!title || !body) return alert("Please fill in both the headline and message.");
            newsItems.unshift({ id: "n" + Date.now(), title, body, category: cat, date: new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) });
            document.getElementById("newsTitle").value = "";
            document.getElementById("newsBody").value = "";
            persistDatabaseState();
            renderNewsPage();
            renderNewsTicker();
        }

        function deleteNewsPost(id) {
            if (!isAdmin || !confirm("Delete this news post?")) return;
            newsItems = newsItems.filter(n => n.id !== id);
            persistDatabaseState();
            renderNewsPage();
            renderNewsTicker();
        }

        let _lastSeenNewsCount = 0; try { _lastSeenNewsCount = parseInt(localStorage.getItem('slNewsCount') || '0'); } catch(e) {}

        function renderNewsPage() {
            let container = document.getElementById("newsFeedContainer");
            if (!container) return;
            let panel = document.getElementById("newsAdminPostPanel");
            if (panel) panel.style.display = isAdmin ? 'block' : 'none';
            if (newsItems.length === 0) {
                container.innerHTML = '<div class="empty-state-notice">No news posts yet.</div>';
                return;
            }
            let cardsHtml = newsItems.map(n => {
                let meta = newsCategoryMeta[n.category] || newsCategoryMeta.general;
                return '<div class="news-card">' +
                    '<span class="news-category-badge ' + meta.cls + '">' + meta.label + '</span>' +
                    '<div class="news-card-title">' + n.title + '</div>' +
                    '<div class="news-card-body">' + n.body.replace(/\n/g, '<br>') + '</div>' +
                    '<div class="news-card-meta">' +
                        '<span>🗓️ ' + n.date + '</span>' +
                        (isAdmin ? '<button class="news-delete-btn" onclick="deleteNewsPost(\'' + n.id + '\')">🗑 Delete</button>' : '') +
                    '</div>' +
                '</div>';
            }).join('');
            // 2-col grid for cards
            container.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">' + cardsHtml + '</div>';
        }

        function saveRecordAction() {
            if (!isAdmin) return;
            if (viewingSeason !== currentSeason) return alert("You're viewing a past season in read-only archive mode. Switch to the current season to log records.");
            let title = document.getElementById("recordTitle").value.trim();
            let value = document.getElementById("recordValue").value.trim();
            let holder = document.getElementById("recordHolder").value.trim();
            let context = document.getElementById("recordContext").value.trim();
            let notes = document.getElementById("recordNotes").value.trim();
            if (!title || !value || !holder) return alert("Please fill in the title, value and who holds the record.");
            let editingId = document.getElementById("recordEditingId").value;
            if (editingId) {
                let rec = seasonRecords.find(r => r.id === editingId);
                if (rec) Object.assign(rec, { title, value, holder, context, notes });
            } else {
                seasonRecords.unshift({ id: "rec" + Date.now(), title, value, holder, context, notes, date: new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) });
            }
            cancelRecordEdit();
            persistDatabaseState();
            renderRecordsPage();
        }

        function editRecordAction(id) {
            if (!isAdmin) return;
            let rec = seasonRecords.find(r => r.id === id);
            if (!rec) return;
            document.getElementById("recordEditingId").value = rec.id;
            document.getElementById("recordTitle").value = rec.title;
            document.getElementById("recordValue").value = rec.value;
            document.getElementById("recordHolder").value = rec.holder;
            document.getElementById("recordContext").value = rec.context || '';
            document.getElementById("recordNotes").value = rec.notes || '';
            document.getElementById("recordSaveBtn").innerText = "💾 Update Record";
            document.getElementById("recordCancelEditBtn").style.display = "inline-block";
            document.getElementById("recordsAdminPostPanel").scrollIntoView({ behavior: "smooth", block: "start" });
        }

        function cancelRecordEdit() {
            document.getElementById("recordEditingId").value = "";
            document.getElementById("recordTitle").value = "";
            document.getElementById("recordValue").value = "";
            document.getElementById("recordHolder").value = "";
            document.getElementById("recordContext").value = "";
            document.getElementById("recordNotes").value = "";
            document.getElementById("recordSaveBtn").innerText = "📤 Save Record";
            document.getElementById("recordCancelEditBtn").style.display = "none";
        }

        function deleteRecordAction(id) {
            if (!isAdmin || !confirm("Delete this record?")) return;
            seasonRecords = seasonRecords.filter(r => r.id !== id);
            persistDatabaseState();
            renderRecordsPage();
        }

        function renderRecordsPage() {
            let container = document.getElementById("recordsFeedContainer");
            if (!container) return;
            let panel = document.getElementById("recordsAdminPostPanel");
            if (panel) panel.style.display = (isAdmin && viewingSeason === currentSeason) ? 'block' : 'none';
            if (!seasonRecords || seasonRecords.length === 0) {
                container.innerHTML = '<div class="empty-state-notice">No records logged yet.</div>';
                return;
            }
            let cardsHtml = seasonRecords.map(r => {
                return '<div class="news-card">' +
                    '<span class="news-category-badge" style="background:rgba(234,179,8,0.15); color:var(--accent-yellow);">🏅 RECORD</span>' +
                    '<div class="news-card-title">' + r.title + '</div>' +
                    '<div style="font-size:20px; font-weight:800; color:var(--accent-yellow); margin:6px 0;">' + r.value + '</div>' +
                    '<div class="news-card-body">Held by <strong>' + r.holder + '</strong>' + (r.context ? ' — ' + r.context : '') + (r.notes ? '<br>' + r.notes.replace(/\n/g, '<br>') : '') + '</div>' +
                    '<div class="news-card-meta">' +
                        '<span>🗓️ ' + r.date + '</span>' +
                        (isAdmin && viewingSeason === currentSeason ? '<span><button class="news-delete-btn" style="background:transparent;border:none;color:var(--accent-cyan);cursor:pointer;font-size:12px;margin-right:8px;" onclick="editRecordAction(\'' + r.id + '\')">✏️ Edit</button><button class="news-delete-btn" onclick="deleteRecordAction(\'' + r.id + '\')">🗑 Delete</button></span>' : '') +
                    '</div>' +
                '</div>';
            }).join('');
            container.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">' + cardsHtml + '</div>';
        }

        function updateNewsBell() {
            let badge = document.getElementById("newsBellBadge");
            if (!badge) return;
            let unread = Math.max(0, newsItems.length - _lastSeenNewsCount);
            if (unread > 0) {
                badge.style.display = 'inline-block';
                badge.innerText = unread > 9 ? '9+' : unread;
            } else {
                badge.style.display = 'none';
            }
        }

        function clearNewsBadge() {
            _lastSeenNewsCount = newsItems.length;
            try { localStorage.setItem('slNewsCount', newsItems.length); } catch(e){}
            updateNewsBell();
        }

        function renderNewsTicker() {
            let ticker = document.getElementById("dashNewsTicker");
            let tickerText = document.getElementById("dashNewsTickerText");
            if (!ticker || !tickerText) return;
            if (newsItems.length === 0) { ticker.style.display = 'none'; return; }
            let latest = newsItems[0];
            tickerText.innerText = latest.title + ' — ' + latest.body.substring(0, 80) + (latest.body.length > 80 ? '...' : '');
            ticker.style.display = 'flex';
            updateNewsBell();
        }
        // ---- END NEWS FUNCTIONS ----

        function filterAdminPlayerList() {
            let query = (document.getElementById('adminPlayerSearchInput')?.value || '').toLowerCase().trim();
            let listEl = document.getElementById('adminPanelListingItems');
            if (!listEl) return;
            let filtered = query
                ? players.filter(p => {
                    let teamName = (teams.find(t => t.id === p.teamId)?.name || '').toLowerCase();
                    return p.name.toLowerCase().includes(query) || teamName.includes(query);
                })
                : players;
            listEl.innerHTML = filtered.length === 0
                ? `<li style="padding:12px; color:var(--text-muted); font-size:13px;">No players match "${query}"</li>`
                : filtered.map(p => `
                    <li class="management-item" style="flex-direction:column; align-items:stretch; gap:4px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <strong>👤 ${p.name} <small style="color:var(--text-muted);">(${teams.find(t=>t.id===p.teamId)?.name || 'FA'})</small></strong>
                            <div style="display:flex; gap:6px;">
                                <span class="action-link rename" onclick="openPlayerEditModal('${p.id}')" style="color:var(--accent-cyan);">✏️ Edit</span>
                                <span class="action-link delete" onclick="unregisterPlayer('${p.id}')">Remove</span>
                            </div>
                        </div>
                        <div style="display:flex; gap:8px;">
                            <div class="modifier-controls"><span class="stat-badge-info">G: ${p.goals}</span><button class="modifier-btn" onclick="changePlayerStat('${p.id}','goals',1)">+</button><button class="modifier-btn" onclick="changePlayerStat('${p.id}','goals',-1)">-</button></div>
                            <div class="modifier-controls"><span class="stat-badge-info">A: ${p.assists}</span><button class="modifier-btn" onclick="changePlayerStat('${p.id}','assists',1)">+</button><button class="modifier-btn" onclick="changePlayerStat('${p.id}','assists',-1)">-</button></div>
                            <div class="modifier-controls"><span class="stat-badge-info">OG: ${p.ownGoals}</span><button class="modifier-btn" onclick="changePlayerStat('${p.id}','ownGoals',1)">+</button><button class="modifier-btn" onclick="changePlayerStat('${p.id}','ownGoals',-1)">-</button></div>
                        </div>
                    </li>`).join('');
        }

        // ---- CHAMPIONSHIP FIREWORKS ANIMATION ----
        let fireworksAnimationId = null;
        let fireworksParticles = [];
        let fireworksLastBurst = 0;
        function resizeFireworksCanvas() {
            let canvas = document.getElementById('fireworksCanvas');
            let card = document.getElementById('seasonChampionCard');
            if (!canvas || !card) return;
            canvas.width = card.clientWidth;
            canvas.height = card.clientHeight;
        }
        function spawnFireworkBurst(cx, cy) {
            let colors = ['#eab308', '#06b6d4', '#10b981', '#f97316', '#ffffff', '#ef4444'];
            let count = 40 + Math.floor(Math.random() * 20);
            for (let i = 0; i < count; i++) {
                let angle = (Math.PI * 2 * i) / count;
                let speed = 2 + Math.random() * 3;
                fireworksParticles.push({
                    x: cx, y: cy,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    alpha: 1,
                    color: colors[Math.floor(Math.random() * colors.length)],
                    size: 1.5 + Math.random() * 1.5
                });
            }
        }
        function fireworksLoop(ts) {
            let card = document.getElementById('seasonChampionCard');
            let canvas = document.getElementById('fireworksCanvas');
            if (!canvas || !card || card.style.display === 'none') {
                fireworksAnimationId = null;
                return;
            }
            let ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            if (!fireworksLastBurst || ts - fireworksLastBurst > 900) {
                fireworksLastBurst = ts;
                let cx = canvas.width * (0.15 + Math.random() * 0.7);
                let cy = canvas.height * (0.15 + Math.random() * 0.4);
                spawnFireworkBurst(cx, cy);
            }

            fireworksParticles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.03;
                p.alpha -= 0.012;
            });
            fireworksParticles = fireworksParticles.filter(p => p.alpha > 0);

            fireworksParticles.forEach(p => {
                ctx.globalAlpha = Math.max(0, p.alpha);
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.globalAlpha = 1;

            fireworksAnimationId = requestAnimationFrame(fireworksLoop);
        }
        function startFireworks() {
            resizeFireworksCanvas();
            if (fireworksAnimationId) return;
            fireworksLastBurst = 0;
            fireworksAnimationId = requestAnimationFrame(fireworksLoop);
        }
        function stopFireworks() {
            if (fireworksAnimationId) { cancelAnimationFrame(fireworksAnimationId); fireworksAnimationId = null; }
            fireworksParticles = [];
            let canvas = document.getElementById('fireworksCanvas');
            if (canvas) { let ctx = canvas.getContext('2d'); if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height); }
        }
        window.addEventListener('resize', () => { if (fireworksAnimationId) resizeFireworksCanvas(); });

        // ---- FLOATING CELEBRATE BUTTON + FULLSCREEN CLICK FIREWORKS ----
        function getChampionTeam() {
            let realTeams = teams.filter(t => t.id !== 'dummy-bye');
            return realTeams.length ? realTeams[0] : null;
        }
        function hasCelebratedSeason(seasonLabel, teamId) {
            try { return localStorage.getItem('slCelebrated:' + seasonLabel + ':' + teamId) === '1'; }
            catch (e) { return false; }
        }
        function markCelebratedSeason(seasonLabel, teamId) {
            try { localStorage.setItem('slCelebrated:' + seasonLabel + ':' + teamId, '1'); } catch (e) {}
        }
        function updateCelebrateButton() {
            let btn = document.getElementById('celebrateFloatingBtn');
            if (!btn) return;
            if (isSeasonComplete()) {
                let champion = getChampionTeam();
                document.getElementById('celebrateChampionLabel').innerText = champion ? (champion.name + ' — ' + viewingSeason) : ('the ' + viewingSeason + ' Champions');
                let count = (champion && celebrationClicks[viewingSeason]) ? (celebrationClicks[viewingSeason][champion.id] || 0) : 0;
                document.getElementById('celebrateCountLabel').innerText = count.toLocaleString();
                let already = champion && hasCelebratedSeason(viewingSeason, champion.id);
                btn.classList.toggle('already-celebrated', !!already);
                btn.style.display = 'flex';
            } else {
                btn.style.display = 'none';
            }
        }

        let celebrationBurstAnimId = null;
        let celebrationBurstParticles = [];
        let celebrationBurstEndsAt = 0;
        function resizeCelebrationCanvas() {
            let canvas = document.getElementById('celebrationBurstCanvas');
            if (!canvas) return;
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
        window.addEventListener('resize', resizeCelebrationCanvas);
        function spawnCelebrationBurst(cx, cy) {
            let colors = ['#eab308', '#06b6d4', '#10b981', '#f97316', '#ffffff', '#ef4444'];
            let count = 55 + Math.floor(Math.random() * 25);
            for (let i = 0; i < count; i++) {
                let angle = (Math.PI * 2 * i) / count;
                let speed = 3 + Math.random() * 4;
                celebrationBurstParticles.push({
                    x: cx, y: cy,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    alpha: 1,
                    color: colors[Math.floor(Math.random() * colors.length)],
                    size: 2 + Math.random() * 2
                });
            }
        }
        function celebrationBurstLoop(ts) {
            let canvas = document.getElementById('celebrationBurstCanvas');
            if (!canvas) { celebrationBurstAnimId = null; return; }
            let ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            celebrationBurstParticles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.05;
                p.alpha -= 0.011;
            });
            celebrationBurstParticles = celebrationBurstParticles.filter(p => p.alpha > 0);

            celebrationBurstParticles.forEach(p => {
                ctx.globalAlpha = Math.max(0, p.alpha);
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.globalAlpha = 1;

            if (celebrationBurstParticles.length > 0 || ts < celebrationBurstEndsAt) {
                celebrationBurstAnimId = requestAnimationFrame(celebrationBurstLoop);
            } else {
                celebrationBurstAnimId = null;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        }
        function triggerCelebrationFireworks() {
            resizeCelebrationCanvas();
            let canvas = document.getElementById('celebrationBurstCanvas');
            celebrationBurstEndsAt = performance.now() + 1500;
            let bursts = 4;
            for (let i = 0; i < bursts; i++) {
                setTimeout(() => {
                    let cx = canvas.width * (0.2 + Math.random() * 0.6);
                    let cy = canvas.height * (0.15 + Math.random() * 0.4);
                    spawnCelebrationBurst(cx, cy);
                }, i * 220);
            }
            if (!celebrationBurstAnimId) celebrationBurstAnimId = requestAnimationFrame(celebrationBurstLoop);
        }
        function handleCelebrateClick() {
            let champion = getChampionTeam();
            if (!champion) return;

            // The animation always plays — fans can click as many times as they
            // like — but only the very first click per season/team is recorded.
            triggerCelebrationFireworks();

            let btn = document.getElementById('celebrateFloatingBtn');
            btn.classList.add('celebrate-pulse');
            setTimeout(() => btn.classList.remove('celebrate-pulse'), 400);

            if (hasCelebratedSeason(viewingSeason, champion.id)) return;
            markCelebratedSeason(viewingSeason, champion.id);

            // Optimistic local bump so the click feels instant, then sync via
            // an atomic RPC call so simultaneous clicks from other fans
            // never clobber each other.
            if (!celebrationClicks[viewingSeason]) celebrationClicks[viewingSeason] = {};
            celebrationClicks[viewingSeason][champion.id] = (celebrationClicks[viewingSeason][champion.id] || 0) + 1;
            updateCelebrateButton();
            db.rpc('increment_celebration', { p_season: viewingSeason, p_team: champion.id })
                .then(({ error }) => { if (error) console.error('Failed to save celebration click:', error); });
        }


        function renderDashboardAll() {
            calculateStandings();
            updateCelebrateButton();

            let seasonDone = isSeasonComplete();
            let makeTableRows = () => teams.map((t, idx) => {
                let pos = idx + 1;
                let cls = pos === 1 ? 'first-place-row' : (pos === teams.length && teams.length > 1 ? 'last-place-row' : '');
                
                let trend = '●';
                if(historicalPositionsCache[t.id] !== undefined) {
                    if(historicalPositionsCache[t.id] > pos) trend = '<span class="trend-icon trend-up">▲</span>';
                    else if(historicalPositionsCache[t.id] < pos) trend = '<span class="trend-icon trend-down">▼</span>';
                }
                historicalPositionsCache[t.id] = pos;

                let formBadges = getTeamRecentForm(t.id).map(({ result, opponentName, scoreDisplay }) => {
                    let cls = result === 'W' ? 'win' : (result === 'D' ? 'draw' : 'loss');
                    let resCls = result === 'W' ? 'tt-result-w' : (result === 'D' ? 'tt-result-d' : 'tt-result-l');
                    let resLabel = result === 'W' ? 'WIN' : (result === 'D' ? 'DRAW' : 'LOSS');
                    return `<span class="form-pill-badge ${cls}">${result}<div class="form-tooltip">
                        <span class="tt-score">${scoreDisplay}</span>
                        <span class="tt-vs">vs ${opponentName}</span>
                        <span class="${resCls}">${resLabel}</span>
                    </div></span>`;
                }).join('');
                if(!formBadges) formBadges = '<span style="color:var(--text-muted); font-size:11px;">-</span>';

                return `<tr class="${cls}">
                    <td><span class="pos-num">${pos}${trend}</span></td>
                    <td><strong>${t.name}${(seasonDone && pos===1) ? ' <span title="Champions">🏆</span>' : ''}${(seasonDone && pos===teams.length && teams.length>1) ? ' <span class="relegation-badge" title="Relegated">R</span>' : ''}</strong></td>
                    <td class="col-center">${t.played}</td>
                    <td class="col-center">${t.won}</td>
                    <td class="col-center">${t.drawn}</td>
                    <td class="col-center">${t.lost}</td>
                    <td class="col-center">${t.gf}</td>
                    <td class="col-center">${t.ga}</td>
                    <td class="col-center">${t.gd}</td>
                    <td class="col-center col-green">${t.pts}</td>
                    <td class="col-center"><div class="form-trend-flex-container">${formBadges}</div></td>
                </tr>`;
            }).join('');

            if(activeAppPageId === 'dash') document.getElementById("dashStandingsBody").innerHTML = makeTableRows() || `<tr><td colspan="11" class="empty-state-notice">No club profiles logged.</td></tr>`;
            if(activeAppPageId === 'table') document.getElementById("fullStandingsBody").innerHTML = makeTableRows() || `<tr><td colspan="11" class="empty-state-notice">No club profiles logged.</td></tr>`;

            let generateFixtureRowCard = (m) => {
                let hTeam = teams.find(t => t.id === m.homeId);
                let aTeam = teams.find(t => t.id === m.awayId);
                let hName = hTeam?.name || 'Club';
                let aName = aTeam?.name || 'Club';
                let hManager = hTeam?.manager || 'Unknown';
                let aManager = aTeam?.manager || 'Unknown';
                let center = m.completed ? `<div class="score-row-display">${m.homeScore} - ${m.awayScore}</div>` : `<div class="vs-badge-widget">VS</div>`;
                let badge = m.completed ? `<span class="status-badge">COMPLETED</span>` : `<span class="status-badge unplayed">UNPLAYED</span>`;

                let homeScorers = [];
                let homeAssists = [];
                let awayScorers = [];
                let awayAssists = [];

                if (m.completed && m.events) {
                    let eventsArr = Array.isArray(m.events) ? m.events : Object.values(m.events);
                    eventsArr.forEach(e => {
                        let p = players.find(x => x.id === e.playerId);
                        let displayName = p ? p.name : (e.playerName || null);
                        if (!displayName) return; // no way to identify who this event belongs to

                        // Use the teamId snapshotted at time of match; fall back to current teamId for old data
                        let eventTeamId = e.teamId || (p && p.teamId) || m.homeId;
                        let departedTag = !p ? ' <span style="font-size:9px;color:var(--text-muted);">(departed)</span>' : '';

                        let penaltyMarker = e.scoringType === 'penalty' ? " (P)" : "";

                        if (e.type === 'goals') {
                            if (eventTeamId === m.homeId) homeScorers.push(`${displayName}${penaltyMarker} (${e.count})${departedTag}`);
                            else awayScorers.push(`${displayName}${penaltyMarker} (${e.count})${departedTag}`);
                        } else if (e.type === 'assists') {
                            if (eventTeamId === m.homeId) homeAssists.push(`${displayName} (${e.count})${departedTag}`);
                            else awayAssists.push(`${displayName} (${e.count})${departedTag}`);
                        } else if (e.type === 'ownGoals') {
                            if (eventTeamId === m.homeId) awayScorers.push(`${displayName} (${e.count} OG)${departedTag}`);
                            else homeScorers.push(`${displayName} (${e.count} OG)${departedTag}`);
                        }
                    });
                }

                let homeLayoutHtml = '';
                if(homeScorers.length > 0) homeLayoutHtml += `<div class="pl-event-line">⚽ ${homeScorers.join(', ')}</div>`;
                if(homeAssists.length > 0) homeLayoutHtml += `<div class="pl-event-line pl-event-subtext">👟 Assists: ${homeAssists.join(', ')}</div>`;

                let awayLayoutHtml = '';
                if(awayScorers.length > 0) awayLayoutHtml += `<div class="pl-event-line">⚽ ${awayScorers.join(', ')}</div>`;
                if(awayAssists.length > 0) awayLayoutHtml += `<div class="pl-event-line pl-event-subtext">👟 Assists: ${awayAssists.join(', ')}</div>`;

                let adminActionButton = isAdmin ? `<button class="enter-score-btn ${m.completed?'edit-mode':''}" onclick="event.stopPropagation();openScoreModal('${m.id}')">${m.completed?'⚙️ Admin Edit Scores':'✍️ Input Scoreline Stats'}</button>` : '';

                return `
                <div class="fixture-wrapper-row">
                    <div class="fixture-inner-container">
                        <div class="fixture-card" onclick="openMatchDetailModal('${m.id}')">
                            <div style="display:flex;justify-content:flex-end;align-items:center;margin-bottom:10px;">
                                ${badge}
                            </div>
                            <div class="match-main-flex">
                                <span class="match-team-section home-align">${hName}</span>
                                ${center}
                                <span class="match-team-section away-align">${aName}</span>
                            </div>
                            <div style="display:flex;justify-content:space-between;padding:0 4px;margin-top:4px;margin-bottom:2px;">
                                <span style="font-size:10px;color:var(--text-muted);">👔 ${hManager}</span>
                                <span style="font-size:10px;color:var(--text-muted);">👔 ${aManager}</span>
                            </div>
                        </div>
                        ${isAdmin ? `<div class="delete-fixture-btn" onclick="deleteFixtureRecord('${m.id}')">🗑️</div>` : ''}
                    </div>
                    ${adminActionButton}
                </div>`;
            };

            if (activeAppPageId === 'dash') {
                let validFixtures = matches.filter(m => m.tag !== "GLOBAL STAT OVERRIDE ADJUSTMENT DATA");
                
                let completedMatches = validFixtures.filter(m => m.completed);
                let last3PlayedHtml = completedMatches.slice(-3).map(generateFixtureRowCard).join('');
                document.getElementById("dashPlayedTodayContainer").innerHTML = last3PlayedHtml || `<div class="empty-state-notice">No games completed yet.</div>`;

                let upcomingMatches = validFixtures.filter(m => !m.completed);
                let next3UpcomingHtml = upcomingMatches.slice(0, 3).map(generateFixtureRowCard).join('');
                document.getElementById("dashUpcomingRemainingContainer").innerHTML = next3UpcomingHtml || `<div class="empty-state-notice">No upcoming scheduled fixtures found.</div>`;

                let seasonCard = document.getElementById("seasonChampionCard");
                let seasonTarget = currentSeasonTarget();
                let realTeamsForSeason = teams.filter(t => t.id !== 'dummy-bye');
                if (isSeasonComplete()) {
                    seasonCard.style.display = 'block';
                    let champion = realTeamsForSeason[0];
                    document.getElementById("championTeamName").innerText = champion ? champion.name : '';
                    startFireworks();
                } else {
                    seasonCard.style.display = 'none';
                    stopFireworks();
                }
            }

            if (activeAppPageId === 'matches') {
                let q = document.getElementById("matchSearch").value.toLowerCase().trim();
                let rSelect = document.getElementById("weekendFilterSelect")?.value || "ALL_ROUNDS";

                // ── Build all valid matches sorted chronologically by their original tag number ──
                let allValidMatches = matches.filter(m => m.tag !== "GLOBAL STAT OVERRIDE ADJUSTMENT DATA");
                allValidMatches.sort((a, b) => {
                    let na = parseInt((a.tag.match(/\d+/) || [0])[0]);
                    let nb = parseInt((b.tag.match(/\d+/) || [0])[0]);
                    return na - nb || matches.indexOf(a) - matches.indexOf(b);
                });

                // ── Group into sequential matchdays of 3 ──
                let matchdayGroups = [];
                for (let i = 0; i < allValidMatches.length; i += 3) {
                    matchdayGroups.push(allValidMatches.slice(i, i + 3));
                }

                // ── Apply search/filter to decide which matchdays to show ──
                let filteredGroups = matchdayGroups.map((group, idx) => {
                    let mdLabel = 'MATCHDAY ' + (idx + 1);
                    // Filter matches within this group by search query, round select, and played state
                    let filteredGroup = group.filter(m => {
                        if (rSelect !== "ALL_ROUNDS" && m.tag !== rSelect) return false;
                        let h = teams.find(t => t.id === m.homeId)?.name.toLowerCase() || '';
                        let a = teams.find(t => t.id === m.awayId)?.name.toLowerCase() || '';
                        if (!(h.includes(q) || a.includes(q))) return false;
                        if (matchFilterState === 'played' && !m.completed) return false;
                        if (matchFilterState === 'upcoming' && m.completed) return false;
                        return true;
                    });
                    return { mdLabel, group: filteredGroup, mdIndex: idx };
                }).filter(x => x.group.length > 0);

                if (filteredGroups.length === 0) {
                    document.getElementById("fixturesContainer").innerHTML = '<div class="empty-state-notice">No matching fixtures found.</div>';
                } else {
                    let sectionsHtml = filteredGroups.map(({ mdLabel, group }) => {
                        let played = group.filter(m => m.completed).length;
                        let total  = group.length;
                        let allDone = played === total;
                        let statusLabel = allDone ? '✅ Completed' : played > 0 ? played + '/' + total + ' Played' : '🕐 Upcoming';
                        let statusColor = allDone ? 'var(--accent-green)' : played > 0 ? 'var(--accent-yellow)' : 'var(--text-muted)';
                        let sectionId = 'gs-' + mdLabel.replace(/\s+/g, '-');
                        let matchCards = group.map(generateFixtureRowCard).join('');
                        return '<div class="game-section">' +
                            '<div class="game-section-header" onclick="toggleGameSection(\'' + sectionId + '\')">' +
                                '<span class="game-section-title">📅 ' + mdLabel + '</span>' +
                                '<div class="game-section-meta">' +
                                    '<span style="color:' + statusColor + ';">' + statusLabel + '</span>' +
                                    '<span>' + total + ' Match' + (total !== 1 ? 'es' : '') + '</span>' +
                                    '<span class="game-section-toggle" id="' + sectionId + '-arrow">▲</span>' +
                                '</div>' +
                            '</div>' +
                            '<div class="game-section-body" id="' + sectionId + '">' +
                                matchCards +
                            '</div>' +
                        '</div>';
                    }).join('');
                    document.getElementById("fixturesContainer").innerHTML = sectionsHtml;
                }
            }

            if (activeAppPageId === 'squads') {
                document.getElementById("squadsGrid").innerHTML = teams.map(t => `
                    <div class="squad-card">
                        <div class="squad-title-row" onclick="openSquadPopupModal('${t.id}')">
                            <span><span class="squad-marker"></span><strong>${t.name}</strong></span>
                            <span class="player-count-badge">${players.filter(p => p.teamId === t.id).length} Active Roster ↗</span>
                        </div>
                    </div>`).join('') || `<div class="empty-state-notice">No registered club profiles found.</div>`;
            }

            if (isAdmin) {
                let listEl = document.getElementById("adminPanelListingItems");
                if(listEl) {
                    if (activeAdminSubTab === 'teams') {
                        listEl.innerHTML = teams.map(t => `
                            <li class="management-item">
                                <div><strong>🛡️ ${t.name}</strong><div style="font-size:10px; color:var(--text-muted);">Manager: ${t.manager || 'None'}</div></div>
                                <div class="item-action-links"><span class="action-link rename" onclick="renameTeam('${t.id}')">Modify</span><span class="action-link delete" onclick="deleteTeam('${t.id}')">Delete</span></div>
                            </li>`).join('') || `<div class="empty-state-notice">No registered club profiles found.</div>`;
                    } else if (activeAdminSubTab === 'season') {
                        let target = currentSeasonTarget();
                        let realTeams = teams.filter(t => t.id !== 'dummy-bye');
                        listEl.innerHTML = realTeams.map(t => {
                            let played = gamesPlayedByTeam(t.id);
                            let pct = target > 0 ? Math.min(100, Math.round((played / target) * 100)) : 0;
                            let done = target > 0 && played >= target;
                            return `<li class="management-item" style="display:block;">
                                <div style="display:flex;justify-content:space-between;align-items:center;">
                                    <strong>${done ? '🏁 ' : ''}${t.name}</strong>
                                    <span style="font-size:11px;color:var(--text-muted);">${played} / ${target || '—'}</span>
                                </div>
                                <div style="height:5px;background:#1e293b;border-radius:3px;margin-top:6px;overflow:hidden;">
                                    <div style="height:100%;width:${pct}%;background:${done?'var(--accent-green)':'var(--accent-cyan)'};"></div>
                                </div>
                            </li>`;
                        }).join('') || `<div class="empty-state-notice">No registered club profiles found.</div>`;
                    } else if (activeAdminSubTab === 'branding') {
                        listEl.innerHTML = `
                            <li class="management-item" style="justify-content:center; padding:24px;">
                                <div id="leagueIconPreview" style="width:96px; height:96px; border-radius:12px; background:var(--bg-color); border:1px solid var(--border-color); display:flex; align-items:center; justify-content:center; overflow:hidden;"></div>
                            </li>`;
                        renderLeagueBranding();
                    } else {
                        // Use the search filter so results stay filtered after a data refresh
                        filterAdminPlayerList();
                    }
                }
            }

            renderLeaderboardOnly();
            if (activeAppPageId === 'news') renderNewsPage();
            if (activeAppPageId === 'records') renderRecordsPage();
            renderNewsTicker();
        }