// ═══════════════════════════════════════════════════════════════════════════════
// Scorio Worker — Cloudflare Workers API
// Deploy: wrangler deploy
// ═══════════════════════════════════════════════════════════════════════════════

const ESPN_ALL    = 'https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard';
const ESPN_LEAGUE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const CONTINENTAL_RULES = {
  'uefa.euro':       { 1:{color:'#81D6AC',desc:'تأهل لدور الـ16'}, 2:{color:'#81D6AC',desc:'تأهل لدور الـ16'}, 3:{color:'#B2BFD0',desc:'أفضل ثوالث'} },
  'fifa.world':      { 1:{color:'#81D6AC',desc:'تأهل لدور الـ16'}, 2:{color:'#81D6AC',desc:'تأهل لدور الـ16'}, 3:{color:'#B2BFD0',desc:'أفضل ثوالث'} },
  'caf.nations':     { 1:{color:'#81D6AC',desc:'تأهل لدور الـ16'}, 2:{color:'#81D6AC',desc:'تأهل لدور الـ16'}, 3:{color:'#B2BFD0',desc:'أفضل ثوالث'} },
  'fifa.worldq.uefa':{ 1:{color:'#81D6AC',desc:'تأهل لكأس العالم'}, 2:{color:'#B2BFD0',desc:'تأهل للملحق'} },
  'uefa.euroq':      { 1:{color:'#81D6AC',desc:'تأهل لليورو'}, 2:{color:'#81D6AC',desc:'تأهل لليورو'}, 3:{color:'#B2BFD0',desc:'تأهل للملحق'} },
  'caf.nations_qual':{ 1:{color:'#81D6AC',desc:'تأهل لأمم أفريقيا'}, 2:{color:'#81D6AC',desc:'تأهل لأمم أفريقيا'} },
  'eng.1': { 1:{color:'#81D6AC',desc:'دوري أبطال أوروبا'}, 2:{color:'#81D6AC',desc:'دوري أبطال أوروبا'}, 3:{color:'#81D6AC',desc:'دوري أبطال أوروبا'}, 4:{color:'#81D6AC',desc:'دوري أبطال أوروبا'}, 5:{color:'#6CABDD',desc:'الدوري الأوروبي'}, 6:{color:'#B2BFD0',desc:'دوري المؤتمر'}, '-3':{color:'#FF7F84',desc:'هبوط'}, '-2':{color:'#FF7F84',desc:'هبوط'}, '-1':{color:'#FF7F84',desc:'هبوط'} },
  'eng.2': { 1:{color:'#81D6AC',desc:'صعود'}, 2:{color:'#81D6AC',desc:'صعود'}, 3:{color:'#6CABDD',desc:'ملحق الصعود'}, 4:{color:'#6CABDD',desc:'ملحق الصعود'}, 5:{color:'#6CABDD',desc:'ملحق الصعود'}, 6:{color:'#6CABDD',desc:'ملحق الصعود'}, '-3':{color:'#FF7F84',desc:'هبوط'}, '-2':{color:'#FF7F84',desc:'هبوط'}, '-1':{color:'#FF7F84',desc:'هبوط'} },
  'eng.3': { 1:{color:'#81D6AC',desc:'صعود'}, 2:{color:'#81D6AC',desc:'صعود'}, 3:{color:'#6CABDD',desc:'ملحق الصعود'}, 4:{color:'#6CABDD',desc:'ملحق الصعود'}, 5:{color:'#6CABDD',desc:'ملحق الصعود'}, 6:{color:'#6CABDD',desc:'ملحق الصعود'}, '-4':{color:'#FF7F84',desc:'هبوط'}, '-3':{color:'#FF7F84',desc:'هبوط'}, '-2':{color:'#FF7F84',desc:'هبوط'}, '-1':{color:'#FF7F84',desc:'هبوط'} },
  'esp.1': { 1:{color:'#81D6AC',desc:'دوري أبطال أوروبا'}, 2:{color:'#81D6AC',desc:'دوري أبطال أوروبا'}, 3:{color:'#81D6AC',desc:'دوري أبطال أوروبا'}, 4:{color:'#81D6AC',desc:'دوري أبطال أوروبا'}, 5:{color:'#6CABDD',desc:'الدوري الأوروبي'}, 6:{color:'#B2BFD0',desc:'دوري المؤتمر'}, '-3':{color:'#FF7F84',desc:'هبوط'}, '-2':{color:'#FF7F84',desc:'هبوط'}, '-1':{color:'#FF7F84',desc:'هبوط'} },
  'fra.1': { 1:{color:'#81D6AC',desc:'دوري أبطال أوروبا'}, 2:{color:'#81D6AC',desc:'دوري أبطال أوروبا'}, 3:{color:'#81D6AC',desc:'دوري أبطال أوروبا'}, 4:{color:'#6CABDD',desc:'دوري أبطال أوروبا (تصفيات)'}, 5:{color:'#6CABDD',desc:'الدوري الأوروبي'}, 6:{color:'#B2BFD0',desc:'دوري المؤتمر'}, '-3':{color:'#FF7F84',desc:'ملحق الهبوط'}, '-2':{color:'#FF7F84',desc:'هبوط'}, '-1':{color:'#FF7F84',desc:'هبوط'} },
  'ger.1': { 1:{color:'#81D6AC',desc:'دوري أبطال أوروبا'}, 2:{color:'#81D6AC',desc:'دوري أبطال أوروبا'}, 3:{color:'#81D6AC',desc:'دوري أبطال أوروبا'}, 4:{color:'#81D6AC',desc:'دوري أبطال أوروبا'}, 5:{color:'#6CABDD',desc:'الدوري الأوروبي'}, 6:{color:'#B2BFD0',desc:'دوري المؤتمر'}, '-3':{color:'#FF7F84',desc:'ملحق الهبوط'}, '-2':{color:'#FF7F84',desc:'هبوط'}, '-1':{color:'#FF7F84',desc:'هبوط'} },
  'ita.1': { 1:{color:'#81D6AC',desc:'دوري أبطال أوروبا'}, 2:{color:'#81D6AC',desc:'دوري أبطال أوروبا'}, 3:{color:'#81D6AC',desc:'دوري أبطال أوروبا'}, 4:{color:'#81D6AC',desc:'دوري أبطال أوروبا'}, 5:{color:'#6CABDD',desc:'الدوري الأوروبي'}, 6:{color:'#B2BFD0',desc:'دوري المؤتمر'}, '-3':{color:'#FF7F84',desc:'هبوط'}, '-2':{color:'#FF7F84',desc:'هبوط'}, '-1':{color:'#FF7F84',desc:'هبوط'} },
  'ksa.1': { 1:{color:'#81D6AC',desc:'دوري أبطال آسيا للنخبة'}, 2:{color:'#81D6AC',desc:'دوري أبطال آسيا للنخبة'}, 3:{color:'#6CABDD',desc:'دوري أبطال آسيا 2'}, '-3':{color:'#FF7F84',desc:'هبوط'}, '-2':{color:'#FF7F84',desc:'هبوط'}, '-1':{color:'#FF7F84',desc:'هبوط'} },
  'sau.1': { 1:{color:'#81D6AC',desc:'دوري أبطال آسيا للنخبة'}, 2:{color:'#81D6AC',desc:'دوري أبطال آسيا للنخبة'}, 3:{color:'#6CABDD',desc:'دوري أبطال آسيا 2'}, '-3':{color:'#FF7F84',desc:'هبوط'}, '-2':{color:'#FF7F84',desc:'هبوط'}, '-1':{color:'#FF7F84',desc:'هبوط'} },
};

const ID_TO_CODE = {
  '1':'sco.1','2':'uefa.champions','3':'uefa.europa','4':'tur.1','5':'bel.1','6':'gre.1','7':'ned.1',
  '9':'fra.1','10':'ger.1','11':'ger.2','12':'ger.dfb_pokal','13':'ita.1','14':'ita.2',
  '15':'esp.1','16':'esp.2','17':'esp.copa_del_rey','18':'ita.coppa_italia','19':'ned.1',
  '21':'usa.1','22':'arg.1','23':'eng.1','24':'eng.2','25':'eng.3','26':'eng.4','27':'eng.5',
  '28':'eng.league_cup','29':'eng.fa','30':'eng.community_shield','33':'aus.1','34':'aut.1',
  '40':'conmebol.libertadores','44':'sco.1','45':'nir.1','46':'wal.1','48':'caf.nations',
  '49':'caf.nations_qual','67':'gre.1','71':'tur.1','73':'uefa.euro','74':'uefa.euroq',
  '80':'arg.1','81':'conmebol.sudamericana','82':'conmebol.libertadores','83':'conmebol.copa',
  '84':'afc.asian.cup','85':'fifa.worldq','86':'concacaf.gold','93':'ksa.1','98':'usa.1','102':'fra.2',
  '105':'por.1','106':'por.2','112':'rus.1','113':'irl.1','114':'bel.1','116':'swe.1',
  '117':'nor.1','118':'fin.1','119':'den.1','120':'cze.1','121':'pol.1',
  '122':'sui.1','123':'srb.1','124':'cro.1','125':'bul.1','126':'hun.1','127':'ukr.1',
  '131':'mex.1','135':'bra.1','137':'chi.1','141':'col.1',
  '143':'bol.1','147':'ecu.1','150':'par.1','153':'per.1','156':'uru.1','159':'ven.1',
  '163':'jpn.1','165':'fra.2','166':'ind.1','167':'kor.1','171':'chn.1','174':'mex.1','178':'tha.1',
  '180':'idn.1','181':'sau.1','186':'uae.1','190':'qat.1',
  '231':'mar.1','232':'tun.1','233':'alg.1','234':'egy.1','235':'rsa.1',
  '236':'nga.1','238':'gha.1',
  '341':'irn.1','343':'irq.1','606':'fifa.world','1975':'caf.champions',
  '2006':'uefa.euro','2010':'fifa.world','2018':'caf.nations',
  '2199':'afc.champions','2201':'concacaf.champions',
  '2305':'uefa.nations','2310':'uefa.conference','2311':'uefa.super_cup',
  '2329':'concacaf.nations','2350':'afc.champions.elite','2000':'conmebol.america',
};

function resolveLeagueFromName(name) {
  if (!name) return '';
  const n = name.toLowerCase();
  if (n.includes('chinese super') || n.includes('china super')) return 'chn.1';
  if (n.includes('brasileiro série b') || n.includes('série b')) return 'bra.2';
  if (n.includes('brasileiro') || n.includes('brasileirão')) return 'bra.1';
  if (n.includes('argentine primera b') || n.includes('primera b nacional')) return 'arg.2';
  if (n.includes('segunda') && n.includes('laliga')) return 'esp.2';
  if (n.includes('serie b') && n.includes('ital')) return 'ita.2';
  if (n.includes('2. bundesliga')) return 'ger.2';
  if (n.includes('ligue 2')) return 'fra.2';
  if (n.includes('liga mx') || n.includes('mexican liga')) return 'mex.1';
  if (n.includes('copa libertadores')) return 'conmebol.libertadores';
  if (n.includes('copa sudamericana')) return 'conmebol.sudamericana';
  if (n.includes('copa america')) return 'conmebol.copa';
  if (n.includes('afc champions') && n.includes('elite')) return 'afc.champions.elite';
  if (n.includes('afc champions')) return 'afc.champions';
  if (n.includes('asian cup')) return 'afc.asian.cup';
  if (n.includes('caf champions')) return 'caf.champions';
  if (n.includes('africa cup') || n.includes('afcon')) return 'caf.nations';
  if (n.includes('nations league') && n.includes('uefa')) return 'uefa.nations';
  if (n.includes('conference league')) return 'uefa.conference';
  if (n.includes('europa league')) return 'uefa.europa';
  if (n.includes('champions league')) return 'uefa.champions';
  if (n.includes('euro ') && (n.includes('qualifier') || n.includes('qualif'))) return 'uefa.euroq';
  if (n.includes('euro ') || n.includes('euro2')) return 'uefa.euro';
  if (n.includes('world cup qualifier')) return 'fifa.worldq';
  if (n.includes('world cup') || n.includes('fifa world')) return 'fifa.world';
  if (n.includes('saudi') || n.includes('roshn')) return 'sau.1';
  if (n.includes('uae') || n.includes('arabian gulf')) return 'uae.1';
  if (n.includes('egyptian premier')) return 'egy.1';
  if (n.includes('botola')) return 'mar.1';
  if (n.includes('j1 league') || n.includes('j-league')) return 'jpn.1';
  if (n.includes('premier league') || n.includes('english premier')) return 'eng.1';
  if (n.includes('la liga') || n.includes('laliga')) return 'esp.1';
  if (n.includes('bundesliga') && !n.includes('2.')) return 'ger.1';
  if (n.includes('serie a') && n.includes('ita')) return 'ita.1';
  if (n.includes('ligue 1') && n.includes('fr')) return 'fra.1';
  if (n.includes('mls') || n.includes('major league soccer')) return 'usa.1';
  return '';
}

const SEASON_OVERRIDE = {
  'fifa.world':'2026','fifa.worldq':'2026','fifa.worldq.uefa':'2026',
  'fifa.worldq.conmebol':'2026','fifa.worldq.concacaf':'2026',
  'fifa.worldq.afc':'2026','fifa.worldq.caf':'2026','fifa.worldq.ofc':'2026',
  'uefa.euro':'2024','conmebol.copa':'2024','uefa.nations':'2024',
};
function getSeasonParam(league) {
  if (SEASON_OVERRIDE[league]) return `?season=${SEASON_OVERRIDE[league]}`;
  if (league.includes('worldq')) return '?season=2026';
  return '?season=2025';
}

function applyFallbackColors(leagueCode, position, totalTeams) {
  const rules = CONTINENTAL_RULES[leagueCode];
  if (rules) {
    if (rules[position]) return rules[position];
    const offset = position - totalTeams - 1;
    if (rules[offset]) return rules[offset];
  }
  return { color:'', desc:'' };
}

async function kvGet(env, key) {
  try { return await env?.FOOTBALL_KV?.get(key, 'json'); } catch(_) { return null; }
}
async function kvPut(env, key, value, ttl) {
  try { await env?.FOOTBALL_KV?.put(key, JSON.stringify(value), { expirationTtl: ttl }); } catch(_) {}
}

const TTL_LIVE      = 60;
const TTL_MATCHES   = 300;
const TTL_SUMMARY   = 90;
const TTL_FINISHED  = 3600;
const TTL_STANDINGS = 21600;
const TTL_SCORERS   = 21600;
const TTL_ROUNDS    = 21600;

function getFlag(name = '') {
  const n = name.toLowerCase();
  if (n.includes('fifa world cup')) return '🌍';
  if (n.includes('champions league')) return '🏆';
  if (n.includes('premier league')) return '🏴󠁧󠁢󠁥󠁮󠁧󠁿';
  if (n.includes('laliga') || n.includes('la liga')) return '🇪🇸';
  if (n.includes('bundesliga')) return '🇩🇪';
  if (n.includes('serie a')) return '🇮🇹';
  if (n.includes('ligue 1')) return '🇫🇷';
  if (n.includes('saudi') || n.includes('roshn')) return '🇸🇦';
  if (n.includes('egyptian')) return '🇪🇬';
  if (n.includes('morocc') || n.includes('botola')) return '🇲🇦';
  if (n.includes('brasileiro')) return '🇧🇷';
  if (n.includes('argentin')) return '🇦🇷';
  if (n.includes('libertadores') || n.includes('sudamericana')) return '🏆';
  return '⚽';
}

function parseEvent(ev) {
  const comp = ev.competitions?.[0] || {};
  const home = comp.competitors?.find(c => c.homeAway === 'home') || {};
  const away = comp.competitors?.find(c => c.homeAway === 'away') || {};
  const status = ev.status?.type || {};
  const leagueId = (ev.uid || '').match(/~l:(\d+)~/)?.[1] || '';
  const leagueCode = ID_TO_CODE[leagueId] || resolveLeagueFromName(ev.leagues?.[0]?.name || '') || leagueId || '';
  const altNote = comp.altGameNote || '';
  const parts = altNote.split(',').map(s => s.trim());
  const leagueNameOnly = parts[0] || ev.leagues?.[0]?.name || '';
  const leagueStage = parts.slice(1).join(', ') || '';
  const leagueFlag = getFlag(leagueNameOnly);
  const leagueName = leagueNameOnly ? `${leagueFlag} ${leagueNameOnly}${leagueStage ? ' — ' + leagueStage : ''}` : '';
  const statusState = status.state || 'pre';
  const statusText  = status.shortDetail || '';
  const isHalfTime  = statusState === 'in' && (statusText.toLowerCase().includes('half') || statusText.toLowerCase().includes('ht'));
  return {
    id: ev.id, leagueId, league: leagueCode, leagueName, leagueNameOnly, leagueFlag, leagueStage,
    leagueYear: ev.season?.year ? String(ev.season.year) : '',
    date: ev.date,
    homeTeam: home.team?.displayName || '', homeLogo: home.team?.logo || home.team?.logos?.[0]?.href || '', homeScore: home.score ?? '',
    awayTeam: away.team?.displayName || '', awayLogo: away.team?.logo || away.team?.logos?.[0]?.href || '', awayScore: away.score ?? '',
    status: statusState, statusText, isHalfTime, minute: ev.status?.displayClock || '',
    venue: comp.venue?.fullName || '',
  };
}

function todayStr() {
  return new Date().toISOString().slice(0,10).replace(/-/g,'');
}

// ─── /api/matches ─────────────────────────────────────────────────────────────
async function handleMatches(url, env) {
  const date    = url.searchParams.get('date') || todayStr();
  const kvKey   = `matches_${date}`;
  const isToday = date === todayStr();
  const cached  = await kvGet(env, kvKey);
  if (cached) return json({ ...cached, fromCache: true });
  try {
    const res  = await fetch(`${ESPN_ALL}?dates=${date}&limit=500`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await res.json();
    const matches = (data.events || []).map(parseEvent);
    const hasLive = matches.some(m => m.status === 'in');
    const result  = { success: true, date, count: matches.length, matches };
    await kvPut(env, kvKey, result, hasLive ? TTL_LIVE : isToday ? TTL_MATCHES : TTL_FINISHED);
    return json(result);
  } catch (e) {
    return json({ success: false, error: e.message }, 500);
  }
}

// ─── /api/summary ─────────────────────────────────────────────────────────────
function extractEvents(data, homeTeamName, awayTeamName) {
  const goals = [], cards = [], subs = [];
  const seen  = new Set();
  for (const ev of (data.keyEvents || [])) {
    const evType  = ev.type?.type || ev.type?.text || '';
    const min     = ev.clock?.displayValue || '';
    const addMin  = ev.addedClock?.displayValue ? `+${ev.addedClock.displayValue}` : '';
    const fullMin = min ? `${min}${addMin}` : '';
    const team    = ev.team?.displayName || '';
    const parts   = ev.participants || [];
    const p1      = parts[0]?.athlete?.displayName || '';
    const key     = `${evType}_${fullMin}_${p1}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const t = evType.toLowerCase().replace(/-/g,'');
    if (t === 'goal' || t === 'owngoal')   goals.push({ minute:fullMin, player:p1, assist:parts[1]?.athlete?.displayName||'', team, type: t === 'owngoal' ? 'ownGoal' : 'goal' });
    if (t === 'yellowcard')                cards.push({ minute:fullMin, player:p1, team, type:'yellowCard' });
    if (t === 'redcard')                   cards.push({ minute:fullMin, player:p1, team, type:'redCard' });
    if (t === 'yellowredcard')             cards.push({ minute:fullMin, player:p1, team, type:'yellowRedCard' });
  }
  const jerseyMap = {};
  for (const ro of (data.rosters || []))
    for (const p of (ro.roster || []))
      if (p.athlete?.displayName && (p.jersey || p.athlete?.jersey))
        jerseyMap[p.athlete.displayName] = p.jersey || p.athlete.jersey;
  const getJersey = (name, fb) => jerseyMap[name] || fb || '';
  for (const play of (data.plays || [])) {
    const typeText = (play.type?.text || play.type?.id || '').toLowerCase();
    if (!typeText.includes('substitut') && typeText !== '78') continue;
    const min     = play.clock?.displayValue || '';
    const addMin  = play.addedClock?.displayValue ? `+${play.addedClock.displayValue}` : '';
    const fullMin = min ? `${min}${addMin}` : '';
    const team    = play.team?.displayName || '';
    const parts   = play.participants || [];
    const pOut    = parts.find(p => p.type === 'playerSubstituted') || parts[0] || {};
    const pIn     = parts.find(p => p.type === 'playerSubstituting') || parts[1] || {};
    const out     = pOut.athlete?.displayName || pOut.displayName || '';
    const inn     = pIn.athlete?.displayName  || pIn.displayName  || '';
    if (!out && !inn) continue;
    const key = `sub_${fullMin}_${out}_${inn}`;
    if (seen.has(key)) continue;
    seen.add(key);
    subs.push({ minute:fullMin, playerIn:inn||'—', playerOut:out||'—', jerseyIn:getJersey(inn, pIn.jersey||''), jerseyOut:getJersey(out, pOut.jersey||''), team });
  }
  if (subs.length === 0) {
    for (const ev of (data.keyEvents || [])) {
      const evType = (ev.type?.type || '').toLowerCase().replace(/-/g,'');
      if (!evType.includes('substitut')) continue;
      const min     = ev.clock?.displayValue || '';
      const addMin  = ev.addedClock?.displayValue ? `+${ev.addedClock.displayValue}` : '';
      const fullMin = min ? `${min}${addMin}` : '';
      const team    = ev.team?.displayName || '';
      const parts   = ev.participants || [];
      const p1      = parts[0]?.athlete?.displayName || '';
      const p2      = parts[1]?.athlete?.displayName || '';
      const key     = `sub_${fullMin}_${p1}_${p2}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const isOut   = evType === 'substitutionout';
      subs.push({ minute:fullMin, playerIn:(isOut?p2:p1)||'—', playerOut:(isOut?p1:p2)||'—', jerseyIn:'', jerseyOut:'', team });
    }
  }
  if (goals.length === 0) {
    for (const det of (data.header?.competitions?.[0]?.details || [])) {
      if (!det.scoringPlay) continue;
      const min     = det.clock?.displayValue || '';
      const addMin  = det.addedClock?.displayValue ? `+${det.addedClock.displayValue}` : '';
      const fullMin = min ? `${min}${addMin}` : '';
      const player  = det.participants?.[0]?.athlete?.displayName || '';
      const key     = `goal_${fullMin}_${player}`;
      if (seen.has(key)) continue;
      seen.add(key);
      goals.push({ minute:fullMin, player, assist:det.participants?.[1]?.athlete?.displayName||'', team:det.team?.displayName||'', type: det.ownGoal?'ownGoal':det.penaltyKick?'penalty':'goal' });
    }
  }
  const sortMin = arr => arr.sort((a,b) => (parseInt(a.minute)||0) - (parseInt(b.minute)||0));
  sortMin(goals); sortMin(cards); sortMin(subs);
  const homeSubs = subs.filter(s => s.team === homeTeamName);
  const awaySubs = subs.filter(s => s.team === awayTeamName);
  if (homeSubs.length === 0 && awaySubs.length === 0 && subs.length > 0)
    subs.forEach((s,i) => { if (i%2===0) homeSubs.push(s); else awaySubs.push(s); });
  return { goals, cards, subs, homeSubs, awaySubs };
}

async function handleSummary(url, env) {
  const matchId = url.searchParams.get('matchId');
  let league    = url.searchParams.get('league');
  if (league && !isNaN(league) && ID_TO_CODE[league]) league = ID_TO_CODE[league];
  if (!matchId) return json({ error: 'matchId required' }, 400);
  const kvKey  = `summary_${matchId}`;
  const cached = await kvGet(env, kvKey);
  if (cached) return json({ ...cached, fromCache: true });
  const leaguesToTry = league
    ? [league, 'fifa.world','eng.1','esp.1','ger.1','ita.1','fra.1','bra.1','arg.1','ned.1','por.1']
    : ['fifa.world','eng.1','esp.1','ger.1','ita.1','fra.1','bra.1','arg.1','ned.1','por.1'];
  let data = null, usedLeague = '';
  for (const lg of leaguesToTry) {
    try {
      const res = await fetch(`${ESPN_LEAGUE}/${lg}/summary?event=${matchId}`, { headers: { 'User-Agent':'Mozilla/5.0' } });
      if (!res.ok) continue;
      const d = await res.json();
      if (d.header?.competitions?.[0]?.competitors?.length) {
        data = d;
        const uid     = d.header?.competitions?.[0]?.uid || d.header?.uid || '';
        const uidId   = uid.match(/~l:(\d+)~/)?.[1] || '';
        const espnId  = uidId || String(d.header?.league?.id || '');
        const espnName= d.header?.league?.name || '';
        usedLeague = (espnId && ID_TO_CODE[espnId]) ? ID_TO_CODE[espnId]
          : espnName ? (resolveLeagueFromName(espnName) || league || lg)
          : (league || lg);
        break;
      }
    } catch(_) { continue; }
  }
  if (!data) return json({ error: 'لم يتم العثور على المباراة' }, 404);
  try {
    const hdr    = data.header || {}, comp = hdr.competitions?.[0] || {};
    const homeC  = comp.competitors?.find(c => c.homeAway === 'home') || {};
    const awayC  = comp.competitors?.find(c => c.homeAway === 'away') || {};
    const st     = comp.status?.type || {};
    const homeTeamName = homeC.team?.displayName || '';
    const awayTeamName = awayC.team?.displayName || '';
    const statusState  = st.state || 'post';
    const statusText   = st.shortDetail || '';
    const isHalfTime   = statusState === 'in' && (statusText.toLowerCase().includes('half') || statusText.toLowerCase().includes('ht'));
    const gi      = data.gameInfo?.venue || {}, addr = gi.address || {};
    const venue   = [gi.fullName, addr.city, addr.country].filter(Boolean).join('، ');
    const altNote = comp.altGameNote || '';
    const altParts= altNote.split(',').map(s => s.trim());
    const leagueNameOnly = altParts[0] || hdr.league?.name || usedLeague || '';
    const leagueStage    = altParts.slice(1).join(', ') || '';
    const leagueName     = leagueNameOnly ? `${getFlag(leagueNameOnly)} ${leagueNameOnly}${leagueStage ? ' — '+leagueStage : ''}` : hdr.league?.name || usedLeague || '';
    const { goals, cards, subs, homeSubs, awaySubs } = extractEvents(data, homeTeamName, awayTeamName);
    const homeRoster = data.rosters?.find(r => r.homeAway === 'home');
    const awayRoster = data.rosters?.find(r => r.homeAway === 'away');
    const mapLineup  = ro => (ro?.roster || []).map(p => ({
      name: p.athlete?.displayName||'', shortName: p.athlete?.shortName||'',
      jersey: p.jersey||'', position: p.position?.abbreviation||'',
      starter: p.starter??false, subbedIn: p.subbedIn??false, subbedOut: p.subbedOut??false,
    }));
    const result = {
      success:true, id:matchId, league:usedLeague, leagueName, leagueStage, leagueGroup: comp.groups?.name||'',
      advancesNote:(comp.notes||[]).find(n=>n.text?.includes('advances'))?.text||'',
      venue, date: comp.date,
      homeTeam:homeTeamName, homeLogo:homeC.team?.logos?.[0]?.href||homeC.team?.logo||'', homeScore:homeC.score||'0', homeShootout:homeC.shootoutScore??null,
      awayTeam:awayTeamName, awayLogo:awayC.team?.logos?.[0]?.href||awayC.team?.logo||'', awayScore:awayC.score||'0', awayShootout:awayC.shootoutScore??null,
      homeWinner:homeC.winner??false, awayWinner:awayC.winner??false,
      status:statusState, statusText, isHalfTime, minute:comp.status?.displayClock||'',
      homeFormation:homeRoster?.formation||'', awayFormation:awayRoster?.formation||'',
      goals, cards, subs, homeSubs, awaySubs,
      homeLineup:mapLineup(homeRoster), awayLineup:mapLineup(awayRoster),
      homeStats:(data.boxscore?.teams?.[0]?.statistics||[]).map(s=>({name:s.label,value:s.displayValue})),
      awayStats:(data.boxscore?.teams?.[1]?.statistics||[]).map(s=>({name:s.label,value:s.displayValue})),
    };
    await kvPut(env, kvKey, result, statusState==='in' ? TTL_SUMMARY : TTL_FINISHED);
    return json(result);
  } catch(e) {
    return json({ error:e.message }, 500);
  }
}

// ─── /api/standings ───────────────────────────────────────────────────────────
async function handleStandings(url, env) {
  let league = url.searchParams.get('league') || 'eng.1';
  if (!isNaN(league) && ID_TO_CODE[league]) league = ID_TO_CODE[league];
  const season = url.searchParams.get('season');
  const kvKey  = `standings_v3_${league}${season?'_'+season:''}`;
  const cached = await kvGet(env, kvKey);
  if (cached) return json({ ...cached, fromCache:true });
  const seasonParam = season ? `?season=${season}` : getSeasonParam(league);
  const urlsToTry = [
    `https://site.api.espn.com/apis/v2/sports/soccer/${league}/standings${seasonParam}`,
    `https://site.web.api.espn.com/apis/v2/sports/soccer/${league}/standings${seasonParam}`,
    `https://site.api.espn.com/apis/v2/sports/soccer/${league}/standings`,
  ];
  let data = null;
  for (const fetchUrl of urlsToTry) {
    try {
      const res = await fetch(fetchUrl, { headers:{'User-Agent':'Mozilla/5.0'} });
      if (!res.ok) continue;
      const d = await res.json();
      if ((d.children||[]).length > 0) { data = d; break; }
    } catch(_) { continue; }
  }
  if (!data) return json({ success:false, noStandings:true, error:'لا يوجد ترتيب متاح' });
  const groups = [];
  for (const child of (data.children||[])) {
    const groupName = data.children.length > 1 ? (child.name||child.abbreviation||'') : '';
    const entries   = child.standings?.entries || [];
    const teams = entries.map(e => {
      const team  = e.team || {};
      const stats = {};
      for (const s of (e.stats||[])) stats[s.name] = s.displayValue ?? s.value ?? 0;
      const rank     = parseInt(stats.rank) || (entries.indexOf(e)+1);
      const fallback = applyFallbackColors(league, rank, entries.length);
      return {
        rank, name:team.displayName||team.name||'', logo:team.logos?.[0]?.href||team.logo||'',
        played:stats.gamesPlayed??'', wins:stats.wins??'', draws:stats.ties??stats.draws??'',
        losses:stats.losses??'', gd:stats.pointDifferential??'', points:stats.points??'',
        note_color:fallback.color||'', note_description:fallback.desc||'',
      };
    });
    teams.sort((a,b) => (parseInt(a.rank)||99) - (parseInt(b.rank)||99));
    groups.push({ name:groupName, teams });
  }
  const result = { success:true, league, groups };
  await kvPut(env, kvKey, result, TTL_STANDINGS);
  return json(result);
}

// ─── /api/scorers ─────────────────────────────────────────────────────────────
async function handleScorers(url, env) {
  let league = url.searchParams.get('league') || 'eng.1';
  if (!isNaN(league) && ID_TO_CODE[league]) league = ID_TO_CODE[league];
  const season = url.searchParams.get('season');
  const kvKey  = `scorers_${league}${season?'_'+season:''}`;
  const cached = await kvGet(env, kvKey);
  if (cached) return json({ ...cached, fromCache:true });
  try {
    const seasonParam = season ? `?season=${season}` : getSeasonParam(league);
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/leaders${seasonParam}`, { headers:{'User-Agent':'Mozilla/5.0'} });
    if (!res.ok) throw new Error(`ESPN ${res.status}`);
    const data       = await res.json();
    const categories = data.categories || [];
    const goalsCat   = categories.find(c => (c.name||'').toLowerCase().includes('goal') || (c.displayName||'').toLowerCase().includes('goal')) || categories[0];
    const scorers    = (goalsCat?.leaders||[]).map((l,i) => ({
      rank:i+1, name:l.athlete?.displayName||l.displayName||'', photo:l.athlete?.headshot?.href||'',
      team:l.team?.displayName||l.team?.name||'', teamLogo:l.team?.logos?.[0]?.href||l.team?.logo||'',
      goals:parseInt(l.value)||0,
    }));
    const result = { success:true, league, scorers };
    await kvPut(env, kvKey, result, TTL_SCORERS);
    return json(result);
  } catch(e) {
    return json({ success:false, error:e.message }, 500);
  }
}

// ─── /api/league-matches ──────────────────────────────────────────────────────
async function handleLeagueMatches(url, env) {
  let league     = url.searchParams.get('league') || 'eng.1';
  if (!isNaN(league) && ID_TO_CODE[league]) league = ID_TO_CODE[league];
  const date     = url.searchParams.get('date') || todayStr();
  const dateFrom = url.searchParams.get('dateFrom');
  const dateTo   = url.searchParams.get('dateTo');

  if (dateFrom && dateTo) {
    const allMatches = [];
    const seen       = new Set();
    const startDate  = new Date(dateFrom + 'T12:00:00Z');
    const endDate    = new Date(dateTo   + 'T12:00:00Z');
    const days       = Math.min(Math.ceil((endDate - startDate) / 86400000) + 1, 21);
    const fetchDay   = async (d) => {
      const ds  = d.toISOString().slice(0,10).replace(/-/g,'');
      const kvK = `lgmatches_${league}_${ds}`;
      const c   = await kvGet(env, kvK);
      if (c) return c.matches || [];
      try {
        const res  = await fetch(`${ESPN_LEAGUE}/${league}/scoreboard?dates=${ds}&limit=100`, { headers:{'User-Agent':'Mozilla/5.0'} });
        if (!res.ok) return [];
        const data = await res.json();
        return (data.events||[]).map(parseEvent);
      } catch(_) { return []; }
    };
    const promises = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate); d.setUTCDate(d.getUTCDate() + i);
      promises.push(fetchDay(d));
    }
    const results = await Promise.all(promises);
    for (const ms of results)
      for (const m of ms)
        if (!seen.has(m.id)) { seen.add(m.id); allMatches.push(m); }
    allMatches.sort((a,b) => (a.date||'') < (b.date||'') ? -1 : 1);
    return json({ success:true, league, dateFrom, dateTo, count:allMatches.length, matches:allMatches });
  }

  const kvKey   = `lgmatches_${league}_${date}`;
  const isToday = date === todayStr();
  const cached  = await kvGet(env, kvKey);
  if (cached) return json({ ...cached, fromCache:true });
  try {
    const res  = await fetch(`${ESPN_LEAGUE}/${league}/scoreboard?dates=${date}&limit=100`, { headers:{'User-Agent':'Mozilla/5.0'} });
    if (!res.ok) throw new Error(`ESPN ${res.status}`);
    const data     = await res.json();
    const matches  = (data.events||[]).map(parseEvent);
    const hasLive  = matches.some(m => m.status === 'in');
    const lgInfo   = data.leagues?.[0] || {};
    const result   = { success:true, league, date, leagueName:lgInfo.name||league, leagueLogo:lgInfo.logos?.[0]?.href||'', count:matches.length, matches };
    await kvPut(env, kvKey, result, hasLive ? TTL_LIVE : isToday ? TTL_MATCHES : TTL_FINISHED);
    return json(result);
  } catch(e) {
    return json({ success:false, error:e.message }, 500);
  }
}

// ─── /api/rounds ──────────────────────────────────────────────────────────────
const ROUND_TRANSLATE = {
  'League Phase':'مرحلة الدوري','Group Stage':'دور المجموعات','Group':'دور المجموعات',
  'Round of 128':'دور الـ128','Round of 64':'دور الـ64','Round of 32':'دور الـ32',
  'Round of 16':'دور الـ16','Rd of 16':'دور الـ16','Knockout Round Playoffs':'دور الـ16 تمهيدي',
  'Quarterfinals':'ربع النهائي','Quarter-finals':'ربع النهائي',
  'Semifinals':'نصف النهائي','Semi-finals':'نصف النهائي',
  'Final':'النهائي','Third Place':'المركز الثالث','Third-place match':'المركز الثالث',
  'Playoff':'ملحق','Playoffs':'الملحق','First Round':'الدور الأول','Second Round':'الدور الثاني',
  'Third Round':'الدور الثالث','Fourth Round':'الدور الرابع','Fifth Round':'الدور الخامس',
  'Preliminary':'الدور التمهيدي',
};
function translateRound(label) {
  for (const [en, ar] of Object.entries(ROUND_TRANSLATE))
    if (label.toLowerCase().includes(en.toLowerCase())) return ar;
  return label;
}

const LEAGUE_MAX_ROUNDS = {
  'eng.1':38,'esp.1':38,'ita.1':38,'ger.1':34,'fra.1':34,'ned.1':34,'por.1':34,
  'bel.1':34,'tur.1':38,'sco.1':38,'gre.1':34,'sui.1':36,'aut.1':36,'den.1':33,
  'nor.1':30,'swe.1':30,'rus.1':30,'eng.2':46,'eng.3':46,'esp.2':42,'ita.2':38,
  'ger.2':34,'fra.2':38,'ned.2':38,'bra.1':38,'bra.2':38,'arg.1':28,'chi.1':30,
  'col.1':36,'uru.1':30,'ecu.1':30,'per.1':28,'par.1':22,'ven.1':30,'bol.1':22,
  'mex.1':17,'usa.1':34,'jpn.1':38,'chn.1':30,'aus.1':27,'sau.1':30,'ksa.1':30,
};

function groupDatesIntoRounds(rawDates) {
  if (!rawDates.length) return { type:'matchdays', rounds:[] };
  const dates = [...new Set(rawDates)].sort();
  const groups = [];
  let current = [dates[0]];
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i-1]+'T12:00:00Z');
    const cur  = new Date(dates[i]  +'T12:00:00Z');
    const gap  = (cur - prev) / 86400000;
    if (gap >= 3) { groups.push(current); current = [dates[i]]; }
    else current.push(dates[i]);
  }
  groups.push(current);
  const rounds = groups.map((g,i) => ({
    number: i+1, label:`الجولة ${i+1}`,
    detail: g[0] === g[g.length-1] ? `\u200e${g[0].slice(5).replace('-','/')}` : `\u200e${g[0].slice(5).replace('-','/')} - \u200e${g[g.length-1].slice(5).replace('-','/')}`,
    dateFrom: g[0], dateTo: g[g.length-1],
  }));
  return { type:'matchdays', rounds };
}

async function handleRounds(url, env) {
  let league = url.searchParams.get('league') || 'eng.1';
  if (!isNaN(league) && ID_TO_CODE[league]) league = ID_TO_CODE[league];
  const kvKey  = `rounds_v2_${league}`;
  const cached = await kvGet(env, kvKey);
  if (cached) return json(cached);
  try {
    const res = await fetch(`${ESPN_LEAGUE}/${league}/scoreboard`, { headers:{'User-Agent':'Mozilla/5.0'} });
    if (!res.ok) throw new Error(`ESPN ${res.status}`);
    const data = await res.json();
    const lg   = data.leagues?.[0] || {};
    const cal  = lg.calendar || [];
    if (!cal.length) return json({ type:'matchdays', rounds:[] });

    if (typeof cal[0] === 'object' && cal[0].entries) {
      const entries = cal[0].entries || [];
      const rounds  = entries.map((e, idx) => ({
        number:   idx+1,
        label:    translateRound(e.label || `دور ${idx+1}`),
        detail:   e.detail || '',
        dateFrom: (e.startDate||'').slice(0,10),
        dateTo:   (e.endDate  ||'').slice(0,10),
      }));
      const result = { type:'entries', rounds };
      await kvPut(env, kvKey, result, TTL_ROUNDS);
      return json(result);
    }

    const rawDates = [];
    for (const x of cal)
      if (typeof x === 'string')
        rawDates.push(x.slice(0,10));
    let result = groupDatesIntoRounds(rawDates);
    const maxR = LEAGUE_MAX_ROUNDS[league];
    if (maxR && result.rounds.length > maxR) {
      const step   = result.rounds.length / maxR;
      const merged = [];
      for (let i = 0; i < maxR; i++) {
        const lo = Math.floor(i * step), hi = Math.floor((i+1) * step);
        const batch = result.rounds.slice(lo, hi);
        merged.push({ number:i+1, label:`الجولة ${i+1}`, detail:batch[0]?.detail||'', dateFrom:batch[0]?.dateFrom||'', dateTo:batch[batch.length-1]?.dateTo||'' });
      }
      result = { type:'matchdays', rounds:merged };
    }
    await kvPut(env, kvKey, result, TTL_ROUNDS);
    return json(result);
  } catch(e) {
    return json({ type:'matchdays', rounds:[], error:e.message });
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers:{ ...CORS, 'Content-Type':'application/json' } });
}

// ─── router ───────────────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:CORS });
    const url  = new URL(request.url);
    const path = url.pathname;
    if (path === '/ping')                return new Response('pong', { headers:CORS });
    if (path === '/api/matches')         return await handleMatches(url, env);
    if (path === '/api/summary')         return await handleSummary(url, env);
    if (path === '/api/standings')       return await handleStandings(url, env);
    if (path === '/api/scorers')         return await handleScorers(url, env);
    if (path === '/api/league-matches')  return await handleLeagueMatches(url, env);
    if (path === '/api/rounds')          return await handleRounds(url, env);
    return new Response('Not Found', { status:404, headers:CORS });
  }
};
