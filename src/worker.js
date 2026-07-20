// ═══════════════════════════════════════════════════════════════
// worker.js — Scorio Cloudflare Worker
// Deploy to Cloudflare Workers. Bind a KV namespace "FOOTBALL_KV".
// ═══════════════════════════════════════════════════════════════

const ESPN_ALL    = 'https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard';
const ESPN_BASE   = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const ESPN_STAND  = 'https://site.web.api.espn.com/apis/v2/sports/soccer';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const TTL_LIVE      = 60;
const TTL_MATCHES   = 300;
const TTL_SUMMARY   = 90;
const TTL_FINISHED  = 3600;
const TTL_STANDINGS = 21600;
const TTL_SCORERS   = 21600;
const TTL_ROUNDS    = 86400;

// ── KV helpers ────────────────────────────────────────────────
async function kvGet(env, key) {
  try { return await env?.FOOTBALL_KV?.get(key, 'json'); } catch { return null; }
}
async function kvPut(env, key, value, ttl) {
  try { await env?.FOOTBALL_KV?.put(key, JSON.stringify(value), { expirationTtl: ttl }); } catch {}
}

// ── Continental zone colors ────────────────────────────────────
const CONTINENTAL_RULES = {
  'eng.1':  { 1:'#81D6AC',2:'#81D6AC',3:'#81D6AC',4:'#81D6AC',5:'#6CABDD',6:'#B2BFD0','-1':'#FF7F84','-2':'#FF7F84','-3':'#FF7F84' },
  'esp.1':  { 1:'#81D6AC',2:'#81D6AC',3:'#81D6AC',4:'#81D6AC',5:'#6CABDD',6:'#B2BFD0','-1':'#FF7F84','-2':'#FF7F84','-3':'#FF7F84' },
  'ita.1':  { 1:'#81D6AC',2:'#81D6AC',3:'#81D6AC',4:'#81D6AC',5:'#6CABDD',6:'#B2BFD0','-1':'#FF7F84','-2':'#FF7F84','-3':'#FF7F84' },
  'ger.1':  { 1:'#81D6AC',2:'#81D6AC',3:'#81D6AC',4:'#81D6AC',5:'#6CABDD',6:'#B2BFD0','-1':'#FF7F84','-2':'#FF7F84','-3':'#FF7F84' },
  'fra.1':  { 1:'#81D6AC',2:'#81D6AC',3:'#81D6AC',4:'#6CABDD',5:'#6CABDD',6:'#B2BFD0','-1':'#FF7F84','-2':'#FF7F84','-3':'#FF7F84' },
  'ned.1':  { 1:'#81D6AC',2:'#81D6AC',3:'#81D6AC',4:'#81D6AC',5:'#6CABDD',6:'#B2BFD0','-1':'#FF7F84','-2':'#FF7F84','-3':'#FF7F84' },
  'por.1':  { 1:'#81D6AC',2:'#81D6AC',3:'#81D6AC',4:'#6CABDD','-1':'#FF7F84','-2':'#FF7F84','-3':'#FF7F84' },
  'bel.1':  { 1:'#81D6AC',2:'#81D6AC',3:'#81D6AC',4:'#6CABDD','-1':'#FF7F84','-2':'#FF7F84' },
  'tur.1':  { 1:'#81D6AC',2:'#81D6AC',3:'#81D6AC',4:'#81D6AC',5:'#6CABDD','-1':'#FF7F84','-2':'#FF7F84','-3':'#FF7F84' },
  'sco.1':  { 1:'#81D6AC',2:'#81D6AC',3:'#81D6AC',4:'#6CABDD','-1':'#FF7F84','-2':'#FF7F84' },
  'gre.1':  { 1:'#81D6AC',2:'#81D6AC',3:'#81D6AC',4:'#6CABDD','-1':'#FF7F84','-2':'#FF7F84','-3':'#FF7F84' },
  'bra.1':  { 1:'#81D6AC',2:'#81D6AC',3:'#81D6AC',4:'#81D6AC',5:'#81D6AC',6:'#81D6AC','-1':'#FF7F84','-2':'#FF7F84','-3':'#FF7F84','-4':'#FF7F84' },
  'arg.1':  { 1:'#81D6AC',2:'#81D6AC',3:'#81D6AC',4:'#6CABDD','-1':'#FF7F84','-2':'#FF7F84','-3':'#FF7F84' },
  'mex.1':  { 1:'#81D6AC',2:'#81D6AC',3:'#81D6AC',4:'#81D6AC',5:'#81D6AC',6:'#81D6AC',7:'#81D6AC',8:'#81D6AC' },
  'sau.1':  { 1:'#81D6AC',2:'#81D6AC',3:'#6CABDD','-1':'#FF7F84','-2':'#FF7F84','-3':'#FF7F84' },
  'ksa.1':  { 1:'#81D6AC',2:'#81D6AC',3:'#6CABDD','-1':'#FF7F84','-2':'#FF7F84','-3':'#FF7F84' },
  'fifa.world':  { 1:'#81D6AC',2:'#81D6AC',3:'#B2BFD0' },
  'uefa.euro':   { 1:'#81D6AC',2:'#81D6AC',3:'#B2BFD0' },
  'caf.nations': { 1:'#81D6AC',2:'#81D6AC',3:'#B2BFD0' },
};

const ZONE_DESC = {
  '#81D6AC': 'تأهل / صعود',
  '#6CABDD': 'دوري أوروبي / ملحق',
  '#B2BFD0': 'ملحق',
  '#FF7F84': 'هبوط',
};

function getZoneColor(leagueCode, rank, total) {
  const rules = CONTINENTAL_RULES[leagueCode];
  if (!rules) return { color: '', desc: '' };
  if (rules[rank]) return { color: rules[rank], desc: ZONE_DESC[rules[rank]] || '' };
  const neg = rank - total - 1;
  if (rules[neg]) return { color: rules[neg], desc: ZONE_DESC[rules[neg]] || '' };
  return { color: '', desc: '' };
}

// ── League ID → code map ───────────────────────────────────────
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
  '105':'por.1','106':'por.2','112':'rus.1','116':'swe.1','117':'nor.1','118':'fin.1',
  '119':'den.1','120':'cze.1','121':'pol.1','122':'sui.1','123':'srb.1','124':'cro.1',
  '125':'bul.1','126':'hun.1','127':'ukr.1','131':'mex.1','135':'bra.1','137':'chi.1',
  '141':'col.1','143':'bol.1','147':'ecu.1','150':'par.1','153':'per.1','156':'uru.1',
  '159':'ven.1','163':'jpn.1','167':'kor.1','171':'chn.1','174':'mex.1','178':'tha.1',
  '180':'idn.1','181':'sau.1','186':'uae.1','190':'qat.1','231':'mar.1','232':'tun.1',
  '233':'alg.1','234':'egy.1','235':'rsa.1','236':'nga.1','606':'fifa.world',
  '1975':'caf.champions','1976':'caf.confed','2000':'conmebol.america',
  '2003':'conmebol.copa','2006':'uefa.euro','2010':'fifa.world','2018':'caf.nations',
  '2199':'afc.champions','2201':'concacaf.champions','2305':'uefa.nations',
  '2310':'uefa.europa.conf','2311':'uefa.super_cup','2329':'concacaf.nations',
  '2350':'afc.champions.elite','3904':'arg.2','4007':'bra.2','8376':'chn.1',
  '18318':'afc.champions','19159':'caf.champions',
  '620':'bol.1','660':'ecu.1','670':'per.1','680':'uru.1','3945':'swe.1','8301':'usa.nwsl',
};

function resolveLeagueFromName(name) {
  if (!name) return '';
  const n = name.toLowerCase();
  if (n.includes('premier league') || n.includes('english premier')) return 'eng.1';
  if (n.includes('la liga') || n.includes('laliga')) return 'esp.1';
  if (n.includes('bundesliga') && !n.includes('2.')) return 'ger.1';
  if (n.includes('serie a') && !n.includes('b')) return 'ita.1';
  if (n.includes('ligue 1') && !n.includes('2')) return 'fra.1';
  if (n.includes('eredivisie')) return 'ned.1';
  if (n.includes('champions league')) return 'uefa.champions';
  if (n.includes('europa league')) return 'uefa.europa';
  if (n.includes('conference league')) return 'uefa.europa.conf';
  if (n.includes('copa libertadores')) return 'conmebol.libertadores';
  if (n.includes('sudamericana')) return 'conmebol.sudamericana';
  if (n.includes('copa america') || n.includes('conmebol copa')) return 'conmebol.america';
  if (n.includes('world cup') && !n.includes('qualifier')) return 'fifa.world';
  if (n.includes('brasileiro') || n.includes('brasileirão')) return 'bra.1';
  if (n.includes('mls') || n.includes('major league soccer')) return 'usa.1';
  if (n.includes('saudi') || n.includes('roshn')) return 'sau.1';
  if (n.includes('j1 league') || n.includes('j-league')) return 'jpn.1';
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

// ── Flag helper ────────────────────────────────────────────────
const LEAGUE_FLAGS = {
  'eng.1':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','eng.2':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','eng.3':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','eng.4':'🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'eng.fa':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','eng.league_cup':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','eng.community_shield':'🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'esp.1':'🇪🇸','esp.2':'🇪🇸','esp.copa_del_rey':'🇪🇸','esp.supercopa':'🇪🇸',
  'ita.1':'🇮🇹','ita.2':'🇮🇹','ita.coppa_italia':'🇮🇹','ita.supercoppa':'🇮🇹',
  'ger.1':'🇩🇪','ger.2':'🇩🇪','ger.dfb_pokal':'🇩🇪','ger.super_cup':'🇩🇪',
  'fra.1':'🇫🇷','fra.2':'🇫🇷','fra.coupe_de_france':'🇫🇷','fra.super_cup':'🇫🇷',
  'ned.1':'🇳🇱','ned.2':'🇳🇱','por.1':'🇵🇹','por.2':'🇵🇹',
  'bel.1':'🇧🇪','tur.1':'🇹🇷','gre.1':'🇬🇷','sco.1':'🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'sui.1':'🇨🇭','aut.1':'🇦🇹','den.1':'🇩🇰','nor.1':'🇳🇴','swe.1':'🇸🇪',
  'rus.1':'🇷🇺','pol.1':'🇵🇱','cze.1':'🇨🇿','ukr.1':'🇺🇦','cro.1':'🇭🇷',
  'srb.1':'🇷🇸','bul.1':'🇧🇬','hun.1':'🇭🇺','rou.1':'🇷🇴','svk.1':'🇸🇰',
  'nir.1':'🇬🇧','wal.1':'🏴󠁧󠁢󠁷󠁬󠁳󠁿','irl.1':'🇮🇪',
  'bra.1':'🇧🇷','bra.2':'🇧🇷','arg.1':'🇦🇷','arg.2':'🇦🇷',
  'chi.1':'🇨🇱','col.1':'🇨🇴','uru.1':'🇺🇾','ecu.1':'🇪🇨',
  'per.1':'🇵🇪','par.1':'🇵🇾','ven.1':'🇻🇪','bol.1':'🇧🇴',
  'mex.1':'🇲🇽','usa.1':'🇺🇸','can.1':'🇨🇦',
  'jpn.1':'🇯🇵','kor.1':'🇰🇷','chn.1':'🇨🇳','aus.1':'🇦🇺',
  'sau.1':'🇸🇦','ksa.1':'🇸🇦','uae.1':'🇦🇪','qat.1':'🇶🇦',
  'egy.1':'🇪🇬','mar.1':'🇲🇦','tun.1':'🇹🇳','alg.1':'🇩🇿',
  'nga.1':'🇳🇬','rsa.1':'🇿🇦','idn.1':'🇮🇩','tha.1':'🇹🇭','ind.1':'🇮🇳',
  'uefa.champions':'🏆','uefa.europa':'🏆','uefa.europa.conf':'🏆',
  'uefa.super_cup':'🏆','uefa.nations':'🇪🇺','uefa.euro':'🇪🇺',
  'conmebol.libertadores':'🏆','conmebol.sudamericana':'🏆','conmebol.america':'🏆',
  'caf.champions':'🏆','caf.nations':'🏆','afc.champions':'🏆',
  'concacaf.champions':'🏆','concacaf.gold':'🏆','concacaf.nations':'🏆',
  'fifa.world':'🌍','fifa.worldq':'🌍','fifa.cwc':'🌍','fifa.friendly':'🤝',
  'afc.asian.cup':'🏆',
};

function getFlag(leagueCode, leagueName = '') {
  if (LEAGUE_FLAGS[leagueCode]) return LEAGUE_FLAGS[leagueCode];
  const n = (leagueName || '').toLowerCase();
  if (n.includes('champions')) return '🏆';
  if (n.includes('world cup') || n.includes('mundial')) return '🌍';
  if (n.includes('euro')) return '🇪🇺';
  if (n.includes('africa') || n.includes('afcon')) return '🌍';
  if (n.includes('asia')) return '🌏';
  return '⚽';
}

// ── League names map ───────────────────────────────────────────
const LEAGUE_NAMES = {
  'eng.1':'الدوري الإنجليزي الممتاز','eng.2':'الدرجة الثانية الإنجليزية',
  'esp.1':'الليغا الإسبانية','ita.1':'الدوري الإيطالي',
  'ger.1':'البوندسليغا الألمانية','fra.1':'الدوري الفرنسي',
  'ned.1':'الدوري الهولندي','por.1':'الدوري البرتغالي',
  'bel.1':'الدوري البلجيكي','tur.1':'الدوري التركي',
  'sco.1':'الدوري الإسكتلندي','gre.1':'الدوري اليوناني',
  'bra.1':'الدوري البرازيلي','arg.1':'الدوري الأرجنتيني',
  'mex.1':'الدوري المكسيكي','usa.1':'الدوري الأمريكي',
  'jpn.1':'الدوري الياباني','kor.1':'الدوري الكوري',
  'chn.1':'الدوري الصيني','aus.1':'الدوري الأسترالي',
  'sau.1':'الدوري السعودي','uae.1':'دوري الخليج العربي',
  'qat.1':'دوري نجوم قطر','egy.1':'الدوري المصري',
  'mar.1':'الدوري المغربي','alg.1':'الدوري الجزائري',
  'tun.1':'الدوري التونسي','nga.1':'الدوري النيجيري',
  'chi.1':'الدوري التشيلي','col.1':'الدوري الكولومبي',
  'uru.1':'الدوري الأوروغواياني','ecu.1':'الدوري الإكوادوري',
  'per.1':'الدوري البيروفي','bol.1':'الدوري البوليفي',
  'par.1':'الدوري الباراغواياني','ven.1':'الدوري الفنزويلي',
  'idn.1':'الدوري الإندونيسي','tha.1':'الدوري التايلاندي',
  'ind.1':'الدوري الهندي',
  'uefa.champions':'دوري أبطال أوروبا','uefa.europa':'الدوري الأوروبي',
  'uefa.europa.conf':'دوري المؤتمر الأوروبي','uefa.nations':'دوري الأمم الأوروبية',
  'uefa.super_cup':'السوبر الأوروبي','uefa.euro':'بطولة أوروبا',
  'conmebol.libertadores':'كوبا ليبرتادوريس','conmebol.sudamericana':'كوبا سودأمريكانا',
  'conmebol.america':'كوبا أمريكا','caf.champions':'دوري أبطال أفريقيا',
  'caf.nations':'كأس الأمم الأفريقية','afc.champions':'دوري أبطال آسيا',
  'afc.asian.cup':'كأس آسيا','concacaf.champions':'دوري أبطال الكونكاكاف',
  'concacaf.gold':'كأس الذهب','fifa.world':'كأس العالم FIFA',
  'fifa.worldq':'تصفيات كأس العالم','fifa.cwc':'كأس العالم للأندية',
  'fifa.friendly':'مباريات دولية ودية',
};

// ── Parse a single ESPN event ──────────────────────────────────
function parseEvent(ev) {
  const comp    = ev.competitions?.[0] || {};
  const home    = comp.competitors?.find(c => c.homeAway === 'home') || {};
  const away    = comp.competitors?.find(c => c.homeAway === 'away') || {};
  const status  = ev.status?.type || {};
  const uid     = ev.uid || '';
  const leagueId = uid.match(/~l:(\d+)~/)?.[1] || '';
  const leagueCode = ID_TO_CODE[leagueId]
    || resolveLeagueFromName(ev.leagues?.[0]?.name || comp.altGameNote?.split(',')?.[0] || '')
    || leagueId || '';
  const altNote  = comp.altGameNote || '';
  const parts    = altNote.split(',').map(s => s.trim());
  const leagueName = LEAGUE_NAMES[leagueCode] || parts[0] || ev.leagues?.[0]?.name || leagueCode || '';
  const leagueFlag = getFlag(leagueCode, leagueName);
  const statusState = status.state || 'pre';
  const statusText  = status.shortDetail || '';
  const isHalfTime  = statusState === 'in' && (statusText.toLowerCase().includes('half') || statusText.toLowerCase().includes('ht'));
  const penHome = home.shootoutScore ?? null;
  const penAway = away.shootoutScore ?? null;
  return {
    id: ev.id, league: leagueCode, leagueName, leagueFlag,
    leagueNameRaw: parts[0] || ev.leagues?.[0]?.name || leagueCode,
    leagueStage: parts.slice(1).join(', ') || '',
    date: ev.date,
    homeTeam: home.team?.displayName || '', homeLogo: home.team?.logo || '', homeScore: home.score ?? '',
    awayTeam: away.team?.displayName || '', awayLogo: away.team?.logo || '', awayScore: away.score ?? '',
    status: statusState, statusText, isHalfTime, minute: ev.status?.displayClock || '',
    penaltyScore: (penHome !== null && penAway !== null) ? `${penHome}-${penAway}` : null,
    venue: comp.venue?.fullName || '',
  };
}

function todayEspn() {
  return new Date().toISOString().slice(0,10).replace(/-/g,'');
}

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

// ── /api/matches ───────────────────────────────────────────────
async function handleMatches(url, env) {
  const date    = url.searchParams.get('date') || todayEspn();
  const kvKey   = `matches_v2_${date}`;
  const isToday = date === todayEspn();
  const cached  = await kvGet(env, kvKey);
  if (cached) return jsonResp({ ...cached, fromCache: true });
  try {
    const res     = await fetch(`${ESPN_ALL}?dates=${date}&limit=500`, { headers: { 'User-Agent': 'Scorio/1.0' } });
    const data    = await res.json();
    const matches = (data.events || []).map(parseEvent);
    const hasLive = matches.some(m => m.status === 'in');
    const result  = { success: true, date, count: matches.length, matches };
    await kvPut(env, kvKey, result, hasLive ? TTL_LIVE : isToday ? TTL_MATCHES : TTL_FINISHED);
    return jsonResp(result);
  } catch (e) {
    return jsonResp({ success: false, error: e.message });
  }
}

// ── /api/summary ───────────────────────────────────────────────
async function handleSummary(url, env) {
  const matchId = url.searchParams.get('matchId');
  let league    = url.searchParams.get('league') || '';
  if (league && !isNaN(league) && ID_TO_CODE[league]) league = ID_TO_CODE[league];
  if (!matchId) return jsonResp({ error: 'matchId required' }, 400);

  const kvKey  = `summary_v2_${matchId}`;
  const cached = await kvGet(env, kvKey);
  if (cached) return jsonResp({ ...cached, fromCache: true });

  const leaguesToTry = league
    ? [league, 'eng.1','esp.1','ger.1','ita.1','fra.1','bra.1','arg.1','ned.1','por.1','sau.1','usa.1','conmebol.libertadores','uefa.champions','fifa.world']
    : ['eng.1','esp.1','ger.1','ita.1','fra.1','bra.1','arg.1','ned.1','por.1','sau.1','usa.1','conmebol.libertadores','uefa.champions','fifa.world'];

  let data = null, usedLeague = league;
  for (const lg of leaguesToTry) {
    try {
      const res = await fetch(`${ESPN_BASE}/${lg}/summary?event=${matchId}`, { headers: { 'User-Agent': 'Scorio/1.0' } });
      if (!res.ok) continue;
      const d = await res.json();
      if (d.header?.competitions?.[0]?.competitors?.length) {
        data = d;
        const uid    = d.header?.competitions?.[0]?.uid || d.header?.uid || '';
        const uidId  = uid.match(/~l:(\d+)~/)?.[1] || '';
        const espnId = uidId || String(d.header?.league?.id || '');
        usedLeague   = (espnId && ID_TO_CODE[espnId]) ? ID_TO_CODE[espnId]
          : resolveLeagueFromName(d.header?.league?.name || '') || league || lg;
        break;
      }
    } catch { continue; }
  }
  if (!data) return jsonResp({ error: 'لم يتم العثور على المباراة' }, 404);

  try {
    const hdr  = data.header || {};
    const comp = hdr.competitions?.[0] || {};
    const homeComp = comp.competitors?.find(c => c.homeAway === 'home') || {};
    const awayComp = comp.competitors?.find(c => c.homeAway === 'away') || {};
    const st       = comp.status?.type || {};
    const statusState  = st.state || 'post';
    const statusText   = st.shortDetail || '';
    const isHalfTime   = statusState === 'in' && (statusText.toLowerCase().includes('half') || statusText.toLowerCase().includes('ht'));
    const homeTeamName = homeComp.team?.displayName || '';
    const awayTeamName = awayComp.team?.displayName || '';
    const gi   = data.gameInfo?.venue || {};
    const addr = gi.address || {};
    const venue = [gi.fullName, addr.city, addr.country].filter(Boolean).join('، ');
    const altNote  = comp.altGameNote || '';
    const altParts = altNote.split(',').map(s => s.trim());
    const leagueNameRaw = altParts[0] || hdr.league?.name || usedLeague;
    const leagueName    = LEAGUE_NAMES[usedLeague] || leagueNameRaw;
    const leagueStage   = altParts.slice(1).join(', ') || '';
    const leagueFlag    = getFlag(usedLeague, leagueNameRaw);

    const penHome = homeComp.shootoutScore ?? null;
    const penAway = awayComp.shootoutScore ?? null;
    const penaltyScore = (penHome !== null && penAway !== null) ? `${penHome}-${penAway}` : null;

    const homeRoster = data.rosters?.find(r => r.homeAway === 'home');
    const awayRoster = data.rosters?.find(r => r.homeAway === 'away');

    const mapLineup = rosterObj => (rosterObj?.roster || []).map(p => ({
      name: p.athlete?.displayName || '',
      shortName: p.athlete?.shortName || '',
      jersey: p.jersey || '',
      position: p.position?.abbreviation || '',
      starter: p.starter ?? false,
      subbedIn: p.subbedIn ?? false,
      subbedOut: p.subbedOut ?? false,
    }));

    const { goals, cards, subs, homeSubs, awaySubs } = extractEvents(data, homeTeamName, awayTeamName);

    const homeStats = (data.boxscore?.teams?.find(t => t.homeAway === 'home')?.statistics || data.boxscore?.teams?.[0]?.statistics || [])
      .map(s => ({ name: s.label || s.name, value: s.displayValue }));
    const awayStats = (data.boxscore?.teams?.find(t => t.homeAway === 'away')?.statistics || data.boxscore?.teams?.[1]?.statistics || [])
      .map(s => ({ name: s.label || s.name, value: s.displayValue }));

    const result = {
      success: true, id: matchId, league: usedLeague, leagueName, leagueFlag, leagueStage,
      leagueGroup: comp.groups?.name || '',
      advancesNote: (comp.notes || []).find(n => n.text?.includes('advances'))?.text || '',
      venue, date: comp.date,
      homeTeam: homeTeamName, homeLogo: homeComp.team?.logos?.[0]?.href || homeComp.team?.logo || '',
      homeScore: homeComp.score || '0', penaltyScore,
      awayTeam: awayTeamName, awayLogo: awayComp.team?.logos?.[0]?.href || awayComp.team?.logo || '',
      awayScore: awayComp.score || '0',
      homeWinner: homeComp.winner ?? false, awayWinner: awayComp.winner ?? false,
      status: statusState, statusText, isHalfTime, minute: comp.status?.displayClock || '',
      homeFormation: homeRoster?.formation || '',
      awayFormation: awayRoster?.formation  || '',
      goals, cards, subs, homeSubs, awaySubs,
      homeLineup: mapLineup(homeRoster),
      awayLineup: mapLineup(awayRoster),
      homeStats, awayStats,
    };
    await kvPut(env, kvKey, result, statusState === 'in' ? TTL_SUMMARY : TTL_FINISHED);
    return jsonResp(result);
  } catch (e) {
    return jsonResp({ error: e.message }, 500);
  }
}

// ── Event extraction ───────────────────────────────────────────
function extractEvents(data, homeTeamName, awayTeamName) {
  const goals = [], cards = [], subs = [];
  const seen  = new Set();
  const keyEvents = data.keyEvents || [];

  const jerseyMap = {};
  for (const ro of (data.rosters || []))
    for (const p of (ro.roster || []))
      if (p.athlete?.displayName && p.jersey) jerseyMap[p.athlete.displayName] = p.jersey;

  for (const ev of keyEvents) {
    const t   = (ev.type?.type || ev.type?.text || '').toLowerCase().replace(/-/g,'');
    const min = ev.clock?.displayValue || '';
    const add = ev.addedClock?.displayValue ? `+${ev.addedClock.displayValue}` : '';
    const fullMin = min ? `${min}${add}` : '';
    const team    = ev.team?.displayName || '';
    const pp      = ev.participants || [];
    const p1      = pp[0]?.athlete?.displayName || '';
    const key     = `${t}_${fullMin}_${p1}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (t === 'goal' || t === 'owngoal' || t === 'penaltyscored' || (t.includes('penalty') && !t.includes('miss') && !t.includes('save')))
      goals.push({ minute: fullMin, player: p1, assist: pp[1]?.athlete?.displayName || '', team, type: t === 'owngoal' ? 'ownGoal' : (t.includes('penalty') ? 'penalty' : 'goal') });
    if (t === 'yellowcard')    cards.push({ minute: fullMin, player: p1, team, type: 'yellowCard' });
    if (t === 'redcard')       cards.push({ minute: fullMin, player: p1, team, type: 'redCard' });
    if (t === 'yellowredcard') cards.push({ minute: fullMin, player: p1, team, type: 'yellowRedCard' });
  }

  if (goals.length === 0) {
    for (const det of (data.header?.competitions?.[0]?.details || [])) {
      if (!det.scoringPlay) continue;
      const min = det.clock?.displayValue || '';
      const add = det.addedClock?.displayValue ? `+${det.addedClock.displayValue}` : '';
      const full = min ? `${min}${add}` : '';
      const player = det.participants?.[0]?.athlete?.displayName || '';
      const key = `goal_${full}_${player}`;
      if (seen.has(key)) continue;
      seen.add(key);
      goals.push({ minute: full, player, assist: det.participants?.[1]?.athlete?.displayName || '', team: det.team?.displayName || '', type: det.ownGoal ? 'ownGoal' : det.penaltyKick ? 'penalty' : 'goal' });
    }
  }

  for (const play of (data.plays || [])) {
    const typeText = (play.type?.text || '').toLowerCase();
    if (!typeText.includes('substitut')) continue;
    const min = play.clock?.displayValue || '';
    const add = play.addedClock?.displayValue ? `+${play.addedClock.displayValue}` : '';
    const full = min ? `${min}${add}` : '';
    const team  = play.team?.displayName || '';
    const pp    = play.participants || [];
    const pOut  = pp.find(p => p.type === 'playerSubstituted') || pp[0] || {};
    const pIn   = pp.find(p => p.type === 'playerSubstituting')  || pp[1] || {};
    const playerOut = pOut.athlete?.displayName || pOut.displayName || '';
    const playerIn  = pIn.athlete?.displayName  || pIn.displayName  || '';
    if (!playerOut && !playerIn) continue;
    const key = `sub_${full}_${playerOut}_${playerIn}`;
    if (seen.has(key)) continue;
    seen.add(key);
    subs.push({ minute: full, playerIn: playerIn || '—', playerOut: playerOut || '—', jerseyIn: jerseyMap[playerIn] || '', jerseyOut: jerseyMap[playerOut] || '', team });
  }

  if (subs.length === 0) {
    for (const ev of keyEvents) {
      const t = (ev.type?.type || '').toLowerCase().replace(/-/g,'');
      if (!t.includes('substitut')) continue;
      const min = ev.clock?.displayValue || '';
      const add = ev.addedClock?.displayValue ? `+${ev.addedClock.displayValue}` : '';
      const full = min ? `${min}${add}` : '';
      const team = ev.team?.displayName || '';
      const pp   = ev.participants || [];
      const p1   = pp[0]?.athlete?.displayName || '';
      const p2   = pp[1]?.athlete?.displayName || '';
      const key  = `sub_${full}_${p1}_${p2}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const isOut = t === 'substitutionout';
      subs.push({ minute: full, playerIn: (isOut ? p2 : p1) || '—', playerOut: (isOut ? p1 : p2) || '—', jerseyIn: '', jerseyOut: '', team });
    }
  }

  const sort = arr => arr.sort((a,b) => (parseInt(a.minute)||0) - (parseInt(b.minute)||0));
  sort(goals); sort(cards); sort(subs);
  const homeSubs = subs.filter(s => s.team === homeTeamName);
  const awaySubs = subs.filter(s => s.team === awayTeamName);
  if (!homeSubs.length && !awaySubs.length && subs.length)
    subs.forEach((s,i) => i%2===0 ? homeSubs.push(s) : awaySubs.push(s));
  return { goals, cards, subs, homeSubs, awaySubs };
}

// ── /api/standings ─────────────────────────────────────────────
async function handleStandings(url, env) {
  let league = url.searchParams.get('league') || 'eng.1';
  if (!isNaN(league) && ID_TO_CODE[league]) league = ID_TO_CODE[league];
  const kvKey  = `standings_v4_${league}`;
  const cached = await kvGet(env, kvKey);
  if (cached) return jsonResp({ ...cached, fromCache: true });

  const seasonParam = getSeasonParam(league);
  const seasonYear = seasonParam.replace('?season=','').replace('&season=','') || '2025';
  const urls = [
    `https://site.web.api.espn.com/apis/v2/sports/soccer/${league}/standings?xhr=1&season=${seasonYear}`,
    `${ESPN_STAND}/${league}/standings${seasonParam}`,
    `https://site.api.espn.com/apis/v2/sports/soccer/${league}/standings${seasonParam}`,
    `https://site.web.api.espn.com/apis/v2/sports/soccer/${league}/standings?xhr=1`,
    `${ESPN_STAND}/${league}/standings`,
  ];
  let data = null;
  for (const u of urls) {
    try {
      const res = await fetch(u, { headers: { 'User-Agent': 'Scorio/1.0' } });
      if (!res.ok) continue;
      const d = await res.json();
      if ((d.children || []).length) { data = d; break; }
    } catch { continue; }
  }
  if (!data) return jsonResp({ success: false, noStandings: true, groups: [] });

  const groups = [];
  for (const child of (data.children || [])) {
    const groupName = data.children.length > 1 ? (child.name || '') : '';
    const entries   = child.standings?.entries || [];
    const teams = entries.map((e, i) => {
      const team  = e.team || {};
      const stats = {};
      for (const s of (e.stats || [])) stats[s.name] = s.displayValue ?? s.value ?? 0;
      const rank = parseInt(stats.rank) || i + 1;
      const zone = getZoneColor(league, rank, entries.length);
      return {
        rank, name: team.displayName || team.name || '---',
        short: team.abbreviation || '',
        logo: team.logos?.[0]?.href || team.logo || '',
        played: parseInt(stats.gamesPlayed) || 0,
        wins: parseInt(stats.wins) || 0,
        draws: parseInt(stats.ties ?? stats.draws) || 0,
        losses: parseInt(stats.losses) || 0,
        gd: stats.pointDifferential ?? '',
        points: parseInt(stats.points) || 0,
        note_color: zone.color,
        note_description: zone.desc,
      };
    });
    teams.sort((a,b) => a.rank - b.rank);
    groups.push({ name: groupName, teams });
  }

  // Build legend
  const legendMap = {};
  groups.forEach(g => g.teams.forEach(t => {
    if (t.note_color && !legendMap[t.note_color]) legendMap[t.note_color] = t.note_description;
  }));
  const legend = Object.entries(legendMap).map(([color, desc]) => ({ color, desc }));

  const result = { success: true, league, leagueName: LEAGUE_NAMES[league] || league, groups, legend };
  await kvPut(env, kvKey, result, TTL_STANDINGS);
  return jsonResp(result);
}

// ── /api/scorers ───────────────────────────────────────────────
async function handleScorers(url, env) {
  let league = url.searchParams.get('league') || 'eng.1';
  const leagueName = url.searchParams.get('leagueName') || '';
  const season = url.searchParams.get('season') || '';
  if (!isNaN(league) && ID_TO_CODE[league]) {
    league = ID_TO_CODE[league];
  } else if (!isNaN(league) && leagueName) {
    league = resolveLeagueFromName(leagueName) || league;
  }
  const kvKey = `scorers_v4_${league}_${season || 'def'}`;
  const cached = await kvGet(env, kvKey);
  if (cached) return jsonResp({ ...cached, fromCache: true });
  try {
    const seasonYear = season || getSeasonParam(league).replace('?season=','') || '2026';
    const urls = [
      `${ESPN_BASE}/${league}/statistics?season=${seasonYear}`,
      `${ESPN_BASE}/${league}/statistics`,
      `${ESPN_BASE}/${league}/leaders?season=${seasonYear}`,
      `${ESPN_BASE}/${league}/leaders`,
    ];
    let scorers = [];
    for (const u of urls) {
      try {
        const res = await fetch(u, { headers: { 'User-Agent': 'Scorio/1.0' } });
        if (!res.ok) continue;
        const data = await res.json();
        if (data.stats?.length) {
          const goalCat = data.stats.find(s =>
            (s.name||'').toLowerCase().includes('goal') ||
            (s.displayName||'').toLowerCase().includes('goal') ||
            (s.abbreviation||'').toLowerCase() === 'g'
          ) || data.stats[0];
          const leaders = goalCat?.leaders || [];
          if (leaders.length) {
            scorers = leaders.map((l, i) => ({
              rank: i+1,
              name: l.athlete?.displayName || l.displayName || '',
              photo: l.athlete?.headshot?.href || '',
              team: l.team?.displayName || l.team?.name || '',
              teamLogo: l.team?.logos?.[0]?.href || l.team?.logo || '',
              goals: parseInt(l.value) || 0,
            }));
            break;
          }
        }
        if (data.categories?.length) {
          const goalsCat = data.categories.find(c =>
            (c.name||'').toLowerCase().includes('goal')
          ) || data.categories[0];
          const leaders = goalsCat?.leaders || [];
          if (leaders.length) {
            scorers = leaders.map((l, i) => ({
              rank: i+1,
              name: l.athlete?.displayName || l.displayName || '',
              photo: l.athlete?.headshot?.href || '',
              team: l.team?.displayName || l.team?.name || '',
              teamLogo: l.team?.logos?.[0]?.href || l.team?.logo || '',
              goals: parseInt(l.value) || 0,
            }));
            break;
          }
        }
      } catch { continue; }
    }
    if (!scorers.length) {
      return jsonResp({ success: false, noData: true, scorers: [], league, leagueName: LEAGUE_NAMES[league] || league });
    }
    const result = { success: true, league, leagueName: LEAGUE_NAMES[league] || league, scorers };
    await kvPut(env, kvKey, result, TTL_SCORERS);
    return jsonResp(result);
  } catch (e) {
    return jsonResp({ success: false, error: e.message }, 500);
  }
}
async function handleLeagueMatches(url, env) {
  let league = url.searchParams.get('league') || 'eng.1';
  const dateFrom = url.searchParams.get('date') || todayEspn();
  const dateTo   = url.searchParams.get('dateTo') || dateFrom;
  const leagueName = url.searchParams.get('leagueName') || '';
  if (!isNaN(league) && ID_TO_CODE[league]) {
    league = ID_TO_CODE[league];
  } else if (!isNaN(league) && leagueName) {
    league = resolveLeagueFromName(leagueName) || league;
  }
  function yyyymmddToDate(s) {
    return new Date(`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T12:00:00Z`);
  }
  const dates = [];
  let cur = yyyymmddToDate(dateFrom);
  const end = yyyymmddToDate(dateTo);
  while (cur <= end && dates.length < 7) {
    dates.push(cur.toISOString().slice(0,10).replace(/-/g,''));
    cur = new Date(cur.getTime() + 86400000);
  }
  if (!dates.length) dates.push(dateFrom);
  const isToday = dates.includes(todayEspn());
  const kvKey = `lgm_v3_${league}_${dateFrom}_${dateTo}`;
  const cached = await kvGet(env, kvKey);
  if (cached) return jsonResp({ ...cached, fromCache: true });
  try {
    const allMatches = [];
    const seen = new Set();
    await Promise.all(dates.map(async (d) => {
      try {
        const res = await fetch(
          `${ESPN_BASE}/${league}/scoreboard?dates=${d}&limit=100`,
          { headers: { 'User-Agent': 'Scorio/1.0' } }
        );
        if (!res.ok) return;
        const data = await res.json();
        for (const ev of (data.events || [])) {
          if (!seen.has(ev.id)) { seen.add(ev.id); allMatches.push(parseEvent(ev)); }
        }
      } catch {}
    }));
    allMatches.sort((a, b) => new Date(a.date) - new Date(b.date));
    const hasLive = allMatches.some(m => m.status === 'in');
    const result = {
      success: true, league, dateFrom, dateTo,
      leagueName: LEAGUE_NAMES[league] || league,
      count: allMatches.length, matches: allMatches,
    };
    await kvPut(env, kvKey, result, hasLive ? TTL_LIVE : isToday ? TTL_MATCHES : TTL_FINISHED);
    return jsonResp(result);
  } catch (e) {
    return jsonResp({ success: false, error: e.message }, 500);
  }
}
async function handleLeagueRounds(url, env) {
  let league = url.searchParams.get('league') || 'eng.1';
  if (!isNaN(league) && ID_TO_CODE[league]) league = ID_TO_CODE[league];
  const kvKey  = `rounds_v2_${league}`;
  const cached = await kvGet(env, kvKey);
  if (cached) return jsonResp({ ...cached, fromCache: true });
  try {
    const res  = await fetch(`${ESPN_BASE}/${league}/scoreboard`, { headers: { 'User-Agent': 'Scorio/1.0' } });
    if (!res.ok) throw new Error(`ESPN ${res.status}`);
    const data     = await res.json();
    const calendar = data.leagues?.[0]?.calendar || [];
    if (!calendar.length) return jsonResp({ success: true, league, type: 'matchdays', rounds: [] });

    const ROUND_LABELS = {
      'League Phase':'مرحلة الدوري','Group Stage':'دور المجموعات','Group':'دور المجموعات',
      'Round of 16':'دور الـ16','Round of 32':'دور الـ32','Round of 64':'دور الـ64',
      'Round of 128':'دور الـ128','Knockout Round Playoffs':'دور الـ16 تمهيدي',
      'Quarterfinals':'ربع النهائي','Quarter-finals':'ربع النهائي',
      'Semifinals':'نصف النهائي','Semi-finals':'نصف النهائي',
      'Final':'النهائي','Third Place':'المركز الثالث','Playoff':'ملحق','Playoffs':'الملحق',
      'First Round':'الدور الأول','Second Round':'الدور الثاني','Third Round':'الدور الثالث',
      'Fourth Round':'الدور الرابع','Fifth Round':'الدور الخامس',
    };
    const translateLabel = lbl => {
      for (const [en, ar] of Object.entries(ROUND_LABELS))
        if ((lbl||'').toLowerCase().includes(en.toLowerCase())) return ar;
      return lbl;
    };

    // Entries-based calendar (cups/UCL)
    if (typeof calendar[0] === 'object' && calendar[0] !== null && 'entries' in calendar[0]) {
      const entries = calendar[0].entries || [];
      const rounds  = entries.map((e, idx) => ({
        number: idx+1,
        label: translateLabel(e.label || `دور ${idx+1}`),
        detail: e.detail || '',
        dateFrom: (e.startDate || '').slice(0,10),
        dateTo:   (e.endDate   || '').slice(0,10),
      }));
      const result = { success: true, league, type: 'entries', rounds };
      await kvPut(env, kvKey, result, TTL_ROUNDS);
      return jsonResp(result);
    }

    // Date-based calendar (leagues)
    const rawDates = [];
    for (const x of calendar) {
      if (typeof x === 'string') {
        try { rawDates.push(new Date(x)); } catch {}
      }
    }
    rawDates.sort((a,b) => a-b);
    if (!rawDates.length) return jsonResp({ success: true, league, type: 'matchdays', rounds: [] });

    const groups = [];
    let cur = [rawDates[0]];
    for (let i = 1; i < rawDates.length; i++) {
      const gap = (rawDates[i] - rawDates[i-1]) / 86400000;
      if (gap >= 3) { groups.push(cur); cur = [rawDates[i]]; }
      else           cur.push(rawDates[i]);
    }
    groups.push(cur);

    const rounds = groups.map((g, i) => {
      const d0 = g[0].toISOString().slice(0,10);
      const d1 = g[g.length-1].toISOString().slice(0,10);
      const detail = d0 === d1
        ? `${g[0].getDate()}/${g[0].getMonth()+1}`
        : `${g[0].getDate()}/${g[0].getMonth()+1} - ${g[g.length-1].getDate()}/${g[g.length-1].getMonth()+1}`;
      return { number: i+1, label: `الجولة ${i+1}`, detail, dateFrom: d0, dateTo: d1 };
    });

    const result = { success: true, league, type: 'matchdays', rounds };
    await kvPut(env, kvKey, result, TTL_ROUNDS);
    return jsonResp(result);
  } catch (e) {
    return jsonResp({ success: false, error: e.message }, 500);
  }
}

// ── Main router ────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: CORS });
    const url  = new URL(request.url);
    const path = url.pathname;
    if (path === '/ping')                return new Response('pong', { headers: CORS });
    if (path === '/api/matches')         return handleMatches(url, env);
    if (path === '/api/summary')         return handleSummary(url, env);
    if (path === '/api/standings')       return handleStandings(url, env);
    if (path === '/api/scorers')         return handleScorers(url, env);
    if (path === '/api/league-matches')  return handleLeagueMatches(url, env);
    if (path === '/api/league-rounds')   return handleLeagueRounds(url, env);
    return new Response('Not Found', { status: 404, headers: CORS });
  }
};
