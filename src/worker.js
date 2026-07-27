// ═══════════════════════════════════════════════════════════════
// worker.js — Scorio Cloudflare Worker
// Deploy to Cloudflare Workers. Bind a KV namespace "FOOTBALL_KV".
// Updated: merged with espn_api.py (LEAGUE_NAMES, LEAGUE_FLAGS,
//          ID_TO_CODE, CONTINENTAL_RULES, SEASON_OVERRIDE expanded)
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
// Positive keys = rank from top; negative keys = rank from bottom of table
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
  'uae.1':  { 1:'#81D6AC',2:'#81D6AC',3:'#6CABDD','-1':'#FF7F84','-2':'#FF7F84','-3':'#FF7F84' },
  'qat.1':  { 1:'#81D6AC',2:'#81D6AC',3:'#6CABDD','-1':'#FF7F84','-2':'#FF7F84' },
  'egy.1':  { 1:'#81D6AC',2:'#81D6AC',3:'#6CABDD','-1':'#FF7F84','-2':'#FF7F84','-3':'#FF7F84' },
  'mar.1':  { 1:'#81D6AC',2:'#81D6AC','-1':'#FF7F84','-2':'#FF7F84' },
  'jpn.1':  { 1:'#81D6AC',2:'#81D6AC',3:'#6CABDD','-1':'#FF7F84','-2':'#FF7F84','-3':'#FF7F84' },
  'kor.1':  { 1:'#81D6AC',2:'#81D6AC',3:'#6CABDD','-1':'#FF7F84','-2':'#FF7F84','-3':'#FF7F84' },
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

// ── League ID → ESPN slug (merged: worker.js + espn_api.py) ────
const ID_TO_CODE = {
  '1':'sco.1','2':'uefa.champions','3':'uefa.europa','4':'tur.1','5':'bel.1',
  '6':'gre.1','7':'ned.1','9':'fra.1','10':'ger.1','11':'ger.2',
  '12':'ger.dfb_pokal','13':'ita.1','14':'ita.2','15':'esp.1','16':'esp.2',
  '17':'esp.copa_del_rey','18':'ita.coppa_italia','19':'ned.1',
  '21':'usa.1','22':'arg.1','23':'eng.1','24':'eng.2','25':'eng.3',
  '26':'eng.4','27':'eng.5','28':'eng.league_cup','29':'eng.fa',
  '30':'eng.community_shield','33':'aus.1','34':'aut.1',
  '40':'conmebol.libertadores','44':'sco.1','45':'nir.1','46':'wal.1',
  '48':'caf.nations','49':'caf.nations_qual','67':'gre.1','71':'tur.1',
  '73':'uefa.euro','74':'uefa.euroq','80':'arg.1','81':'conmebol.sudamericana',
  '82':'conmebol.libertadores','83':'conmebol.copa','84':'afc.asian.cup',
  '85':'fifa.worldq','86':'concacaf.gold','93':'ksa.1','98':'usa.1',
  '102':'fra.2','105':'por.1','106':'por.2','108':'rou.1','112':'rus.1',
  '113':'irl.1','116':'swe.1','117':'nor.1','118':'fin.1','119':'den.1',
  '120':'cze.1','121':'pol.1','122':'sui.1','123':'srb.1','124':'cro.1',
  '125':'bul.1','126':'hun.1','127':'ukr.1','128':'svn.1','129':'svk.1',
  '131':'mex.1','135':'bra.1','137':'chi.1','141':'col.1','143':'bol.1',
  '147':'ecu.1','150':'par.1','153':'per.1','156':'uru.1','159':'ven.1',
  '163':'jpn.1','166':'ind.1','167':'kor.1','171':'chn.1','174':'mex.1',
  '178':'tha.1','179':'mas.1','180':'idn.1','181':'sau.1','182':'vie.1',
  '186':'uae.1','190':'qat.1','194':'bhr.1','198':'omn.1','202':'syr.1',
  '206':'jor.1','210':'irq.1','214':'lbn.1','218':'kwt.1','221':'can.1',
  '231':'mar.1','232':'tun.1','233':'alg.1','234':'egy.1','235':'rsa.1',
  '236':'nga.1','238':'gha.1','332':'bhr.1','333':'jor.1','334':'kwt.1',
  '335':'omn.1','336':'lbn.1','338':'syr.1','341':'irn.1','343':'irq.1',
  '606':'fifa.world','620':'bol.1','630':'bra.1','640':'chi.1','650':'col.1',
  '660':'ecu.1','670':'per.1','680':'uru.1','745':'arg.1','760':'mex.1',
  '1118':'alg.1','1121':'mar.1','1123':'egy.1','1125':'qat.1','1133':'tun.1',
  '1975':'caf.champions','1976':'caf.confed','2000':'conmebol.america',
  '2003':'conmebol.copa','2006':'uefa.euro','2010':'fifa.world',
  '2018':'caf.nations','2199':'afc.champions','2201':'concacaf.champions',
  '2305':'uefa.nations','2310':'uefa.europa.conf','2311':'uefa.super_cup',
  '2329':'concacaf.nations','2350':'afc.champions.elite',
  '3904':'arg.2','3913':'den.1','3930':'irl.1','3932':'mex.2',
  '3934':'par.1','3939':'rus.1','3945':'swe.1','4002':'usa.2',
  '4003':'arg.3','4007':'bra.2','5672':'afc.asean','8301':'usa.nwsl',
  '8376':'chn.1','11088':'bra.3','18318':'afc.champions',
  '19159':'caf.champions','19834':'friendly','23286':'can.1',
  '5330':'sco.cis',
};

// ── ضمان بنيوي: لا يُسمح أبدًا بإرجاع كود دوري رقمي خام ──────────
// إن فشلت كل محاولات الترجمة (الجدول + بحث ESPN المباشر + اسم الدوري)
// نلجأ لكود نصي مُولَّد من اسم الدوري (حروف فقط)، وإلا نرجع الدوري الافتراضي.
function isBareNumber(v) {
  return /^\d+$/.test(String(v || '').trim());
}

function slugifyLeagueName(name) {
  const n = String(name || '').toLowerCase().trim();
  if (!n) return '';
  const clean = n.replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
  return clean ? `unmapped.${clean}` : '';
}

// نقطة التفتيش الوحيدة: أي قيمة تمر من هنا مضمون أنها ليست رقمًا خامًا
function ensureLetterCode(candidate, nameHint, fallback) {
  const c = String(candidate || '').trim();
  if (c && !isBareNumber(c)) return c;
  const byName = resolveLeagueFromName(nameHint || '');
  if (byName) return byName;
  const slug = slugifyLeagueName(nameHint);
  return slug || fallback || 'eng.1';
}


// ── جلب slug الدوري من ESPN وتخزينه في KV للأبد ──────────────────
async function resolveLeagueSlug(leagueId, env, nameHint = '') {
  if (!leagueId) return 'eng.1';
  const s = String(leagueId);
  if (s.includes('.')) return s;

  const kvKey = `slug2_${s}`;
  try {
    const cached = await env?.FOOTBALL_KV?.get(kvKey);
    if (cached) return cached;
  } catch {}

  if (ID_TO_CODE[s]) {
    try { await env?.FOOTBALL_KV?.put(kvKey, ID_TO_CODE[s]); } catch {}
    return ID_TO_CODE[s];
  }

  try {
    const today = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard?dates=${today}&limit=500`,
      { headers: { 'User-Agent': 'Scorio/1.0' } }
    );
    if (res.ok) {
      const data = await res.json();
      for (const ev of (data.events || [])) {
        const espnSlug = ev.leagues?.[0]?.slug || '';
        const uid = ev.uid || '';
        const m = uid.match(/~l:(\d+)~/);
        if (m && m[1] === s) {
          if (espnSlug && espnSlug.includes('.')) {
            try { await env?.FOOTBALL_KV?.put(kvKey, espnSlug); } catch {}
            return espnSlug;
          }
          break;
        }
      }
    }
  } catch {}

  // لم نجد كودًا حرفيًا حقيقيًا من ESPN — لا نُرجع الرقم أبدًا مهما حدث
  const safe = ensureLetterCode(s, nameHint, 'eng.1');
  try { await env?.FOOTBALL_KV?.put(kvKey, safe); } catch {}
  return safe;
}


function normalizeLeague(league, leagueName = '') {
  if (!league) return 'eng.1';
  const s = String(league).trim();
  if (s.includes('.')) return s;
  if (!isNaN(s) && ID_TO_CODE[s]) return ID_TO_CODE[s];
  if (leagueName) return resolveLeagueFromName(leagueName) || s;
  return s;
}

function resolveLeagueFromName(name) {
  if (!name) return '';
  const n = name.toLowerCase();
  if (n.includes('premier league') || n.includes('english premier')) return 'eng.1';
  if (n.includes('la liga') || n.includes('laliga'))                  return 'esp.1';
  if (n.includes('bundesliga') && !n.includes('2.'))                  return 'ger.1';
  if (n.includes('serie a') && !n.includes('b'))                      return 'ita.1';
  if (n.includes('ligue 1') && !n.includes('2'))                      return 'fra.1';
  if (n.includes('eredivisie'))                                        return 'ned.1';
  if (n.includes('champions league'))                                  return 'uefa.champions';
  if (n.includes('europa league'))                                     return 'uefa.europa';
  if (n.includes('conference league'))                                 return 'uefa.europa.conf';
  if (n.includes('copa libertadores'))                                 return 'conmebol.libertadores';
  if (n.includes('sudamericana'))                                      return 'conmebol.sudamericana';
  if (n.includes('copa america') || n.includes('conmebol copa'))       return 'conmebol.america';
  if (n.includes('world cup') && !n.includes('qualifier'))             return 'fifa.world';
  if (n.includes('brasileiro') || n.includes('brasileirão'))           return 'bra.1';
  if (n.includes('danish superliga'))                                  return 'den.1';
  if (n.includes('chilean primera'))                                   return 'chi.1';
  if (n.includes('colombian primera'))                                 return 'col.1';
  if (n.includes('paraguayan primera'))                                return 'par.1';
  if (n.includes('liga auf uruguaya') || n.includes('liga auf'))       return 'uru.1';
  if (n.includes('argentine lpf') || n.includes('liga profesional'))   return 'arg.1';
  if (n.includes('liga de expansion'))                                 return 'mex.2';
  if (n.includes('usl championship'))                                  return 'usa.2';
  if (n.includes('russian premier'))                                   return 'rus.1';
  if (n.includes('ukrainian premier'))                                 return 'ukr.1';
  if (n.includes('allsvenskan'))                                       return 'swe.1';
  if (n.includes('eliteserien') || n.includes('norwegian'))            return 'nor.1';
  if (n.includes('saudi') || n.includes('roshn'))                      return 'sau.1';
  if (n.includes('egyptian premier') || n.includes('egypt premier'))   return 'egy.1';
  if (n.includes('moroccan') || n.includes('botola'))                  return 'mar.1';
  if (n.includes('algerian') || n.includes('algérie'))                 return 'alg.1';
  if (n.includes('tunisian') || n.includes('tunisie'))                 return 'tun.1';
  if (n.includes('iraqi') || n.includes('iraq stars'))                 return 'irq.1';
  if (n.includes('uae') || n.includes('arabian gulf') || n.includes('adnoc')) return 'uae.1';
  if (n.includes('qatar stars') || n.includes('qsl'))                  return 'qat.1';
  if (n.includes('bahrain') || n.includes('البحرين'))                  return 'bhr.1';
  if (n.includes('oman') || n.includes('عُمان') || n.includes('عمان')) return 'omn.1';
  if (n.includes('jordan') || n.includes('الأردن'))                   return 'jor.1';
  if (n.includes('kuwait') || n.includes('الكويت'))                   return 'kwt.1';
  if (n.includes('lebanese') || n.includes('لبنان'))                  return 'lbn.1';
  if (n.includes('syrian') || n.includes('سوريا'))                    return 'syr.1';
  if (n.includes('persian gulf') || n.includes('iranian'))             return 'irn.1';
  if (n.includes('j1 league') || n.includes('j league'))               return 'jpn.1';
  if (n.includes('k league'))                                          return 'kor.1';
  if (n.includes('chinese super') || n.includes('china super'))        return 'chn.1';
  if (n.includes('thai league'))                                       return 'tha.1';
  if (n.includes('indonesian') || n.includes('liga 1') && n.includes('indo')) return 'idn.1';
  if (n.includes('indian super'))                                      return 'ind.1';
  if (n.includes('a-league') || n.includes('a league australia'))       return 'aus.1';
  if (n.includes('mls') || n.includes('major league soccer'))           return 'usa.1';
  if (n.includes('nwsl'))                                              return 'usa.nwsl';
  if (n.includes('canadian premier') || n.includes('northern super'))   return 'can.1';
  if (n.includes('greek super'))                                        return 'gre.1';
  if (n.includes('turkish super') || n.includes('süper lig'))           return 'tur.1';
  if (n.includes('scottish premiership') || n.includes('spfl'))         return 'sco.1';
  if (n.includes('scottish league cup'))                                return 'sco.cis';
  if (n.includes('scottish challenge cup'))                             return 'sco.challenge';
  if (n.includes('scottish cup'))                                       return 'sco.tennents';
  if (n.includes('primeira liga') || n.includes('liga nos'))            return 'por.1';
  if (n.includes('pro league') && n.includes('belg'))                   return 'bel.1';
  if (n.includes('swiss super'))                                        return 'sui.1';
  if (n.includes('austrian bundesliga'))                                return 'aut.1';
  if (n.includes('ekstraklasa') || n.includes('polish'))                return 'pol.1';
  if (n.includes('czech') || n.includes('fortuna liga'))                return 'cze.1';
  if (n.includes('romanian'))                                           return 'rou.1';
  if (n.includes('nigerian') || n.includes('npfl'))                     return 'nga.1';
  if (n.includes('south african') || n.includes('psl'))                 return 'rsa.1';
  if (n.includes('ghanaian') || n.includes('ghana premier'))            return 'gha.1';
  if (n.includes('asean'))                                              return 'afc.asean';
  if (n.includes('club friendly') || n.includes('international friendly')) return 'friendly';
  return '';
}

// ── Season overrides (merged: worker.js + espn_api.py) ────────
const SEASON_OVERRIDE = {
  'fifa.world':             '2026',
  'fifa.worldq':            '2026',
  'fifa.worldq.uefa':       '2026',
  'fifa.worldq.conmebol':   '2026',
  'fifa.worldq.concacaf':   '2026',
  'fifa.worldq.afc':        '2026',
  'fifa.worldq.caf':        '2026',
  'fifa.worldq.ofc':        '2026',
  'uefa.euro':              '2024',
  'conmebol.copa':          '2024',
  'conmebol.america':       '2024',
  'uefa.nations':           '2025',
  'afc.champions.elite':    '2025',
};

function getSeasonParam(league) {
  if (SEASON_OVERRIDE[league]) return `?season=${SEASON_OVERRIDE[league]}`;
  if (league.includes('worldq')) return '?season=2026';
  return '?season=2026';
}

// ── League flags (merged: worker.js + espn_api.py) ────────────
const LEAGUE_FLAGS = {
  // أوروبا — دوريات
  'eng.1':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','eng.2':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','eng.3':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','eng.4':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','eng.5':'🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'esp.1':'🇪🇸','esp.2':'🇪🇸',
  'ita.1':'🇮🇹','ita.2':'🇮🇹',
  'ger.1':'🇩🇪','ger.2':'🇩🇪',
  'fra.1':'🇫🇷','fra.2':'🇫🇷',
  'ned.1':'🇳🇱','ned.2':'🇳🇱',
  'por.1':'🇵🇹','por.2':'🇵🇹',
  'bel.1':'🇧🇪','tur.1':'🇹🇷','gre.1':'🇬🇷',
  'sco.1':'🏴󠁧󠁢󠁳󠁣󠁴󠁿','nir.1':'🇬🇧','wal.1':'🏴󠁧󠁢󠁷󠁬󠁳󠁿','irl.1':'🇮🇪',
  'sui.1':'🇨🇭','aut.1':'🇦🇹','den.1':'🇩🇰','nor.1':'🇳🇴','swe.1':'🇸🇪','fin.1':'🇫🇮',
  'rus.1':'🇷🇺','pol.1':'🇵🇱','cze.1':'🇨🇿','ukr.1':'🇺🇦','cro.1':'🇭🇷',
  'srb.1':'🇷🇸','bul.1':'🇧🇬','hun.1':'🇭🇺','rou.1':'🇷🇴','svk.1':'🇸🇰','svn.1':'🇸🇮',
  // أوروبا — كؤوس
  'eng.fa':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','eng.league_cup':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','eng.community_shield':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','eng.charity_shield':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','eng.trophy':'🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'esp.copa_del_rey':'🇪🇸','esp.supercopa':'🇪🇸','esp.super_cup':'🇪🇸',
  'ita.coppa_italia':'🇮🇹','ita.supercoppa':'🇮🇹','ita.super_cup':'🇮🇹',
  'ger.dfb_pokal':'🇩🇪','ger.super_cup':'🇩🇪',
  'fra.coupe_de_france':'🇫🇷','fra.coupe_de_la_ligue':'🇫🇷','fra.trophee_des_champions':'🇫🇷','fra.super_cup':'🇫🇷',
  'ned.knvb':'🇳🇱','ned.cup':'🇳🇱','ned.super_cup':'🇳🇱',
  'por.taca_portugal':'🇵🇹','por.super_cup':'🇵🇹',
  'bel.cup':'🇧🇪','bel.super_cup':'🇧🇪',
  'tur.cup':'🇹🇷','tur.super_cup':'🇹🇷',
  'gre.cup':'🇬🇷',
  'sco.cup':'🏴󠁧󠁢󠁳󠁣󠁴󠁿','sco.league_cup':'🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'sco.tennents':'🏴󠁧󠁢󠁳󠁣󠁴󠁿','sco.cis':'🏴󠁧󠁢󠁳󠁣󠁴󠁿','sco.challenge':'🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'sui.cup':'🇨🇭','aut.cup':'🇦🇹','den.cup':'🇩🇰','nor.cup':'🇳🇴','swe.cup':'🇸🇪','rus.cup':'🇷🇺',
  // أمريكا الجنوبية
  'bra.1':'🇧🇷','bra.2':'🇧🇷','bra.3':'🇧🇷',
  'bra.copa_do_brasil':'🇧🇷','bra.super_cup':'🇧🇷','bra.supercopa_do_brazil':'🇧🇷',
  'bra.camp.carioca':'🇧🇷','bra.camp.gaucho':'🇧🇷','bra.camp.paulista':'🇧🇷',
  'arg.1':'🇦🇷','arg.2':'🇦🇷','arg.3':'🇦🇷','arg.copa_argentina':'🇦🇷','arg.super_cup':'🇦🇷',
  'chi.1':'🇨🇱','chi.2':'🇨🇱','chi.copa_chile':'🇨🇱',
  'col.1':'🇨🇴','col.copa':'🇨🇴',
  'uru.1':'🇺🇾','uru.2':'🇺🇾',
  'ecu.1':'🇪🇨','per.1':'🇵🇪','par.1':'🇵🇾','ven.1':'🇻🇪','bol.1':'🇧🇴',
  // أمريكا الشمالية
  'mex.1':'🇲🇽','mex.2':'🇲🇽','mex.copa_mx':'🇲🇽','mex.super_cup':'🇲🇽',
  'usa.1':'🇺🇸','usa.2':'🇺🇸','usa.open':'🇺🇸',
  'can.1':'🇨🇦','crc.1':'🇨🇷','slv.1':'🇸🇻','hon.1':'🇭🇳','jam.1':'🇯🇲','gua.1':'🇬🇹',
  // آسيا
  'jpn.1':'🇯🇵','jpn.emperor_cup':'🇯🇵','jpn.league_cup':'🇯🇵','jpn.super_cup':'🇯🇵',
  'kor.1':'🇰🇷',
  'chn.1':'🇨🇳','chn.fa_cup':'🇨🇳',
  'aus.1':'🇦🇺','aus.ffa_cup':'🇦🇺',
  'sau.1':'🇸🇦','ksa.1':'🇸🇦','sau.kings_cup':'🇸🇦','ksa.kings.cup':'🇸🇦',
  'uae.1':'🇦🇪','qat.1':'🇶🇦',
  'bhr.1':'🇧🇭','omn.1':'🇴🇲','jor.1':'🇯🇴','irq.1':'🇮🇶','lbn.1':'🇱🇧',
  'kwt.1':'🇰🇼','syr.1':'🇸🇾','irn.1':'🇮🇷',
  'idn.1':'🇮🇩','tha.1':'🇹🇭','ind.1':'🇮🇳','ind.2':'🇮🇳','mas.1':'🇲🇾','vie.1':'🇻🇳',
  // أفريقيا
  'egy.1':'🇪🇬','mar.1':'🇲🇦','alg.1':'🇩🇿','tun.1':'🇹🇳','nga.1':'🇳🇬','rsa.1':'🇿🇦','gha.1':'🇬🇭',
  // بطولات قارية
  'uefa.champions':'🏆','uefa.europa':'🏆','uefa.europa.conf':'🏆',
  'uefa.super_cup':'🏆','uefa.nations':'🇪🇺','uefa.euro':'🇪🇺','uefa.euroq':'🇪🇺',
  'conmebol.libertadores':'🏆','conmebol.sudamericana':'🏆','conmebol.america':'🏆','conmebol.recopa':'🏆',
  'caf.champions':'🏆','caf.nations':'🏆','caf.confed':'🏆','caf.championship':'🏆','caf.nations.qual':'🏆',
  'afc.champions':'🏆','afc.champions.elite':'🏆','afc.cup':'🏆','afc.asian.cup':'🏆','afc.asean':'🏆',
  'concacaf.champions':'🏆','concacaf.gold':'🏆','concacaf.nations':'🏆','concacaf.leagues.cup':'🏆',
  'campeones.cup':'🏆',
  // دولية / عالمية
  'fifa.world':'🌍','fifa.worldq':'🌍','fifa.cwc':'🌍','fifa.friendly':'🤝',
  'fifa.wwc':'🌍','fifa.olympics':'🥇','fifa.olympics.women':'🥇','fifa.confederations':'🌍',
  'fifa.world.u17':'🌍','fifa.world.u20':'🌍',
  'global.gulf_cup':'🏆','global.finalissima':'🌍','global.toulon':'🏆',
  // كرة قدم نسائية
  'usa.nwsl':'🇺🇸','eng.w.1':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','esp.w.1':'🇪🇸','fra.w.1':'🇫🇷','ned.w.1':'🇳🇱','aus.w.1':'🇦🇺',
  'uefa.weuro':'🇪🇺','uefa.wchampions':'🏆','conmebol.wamerica':'🏆',
  'caf.wnations':'🏆','afc.wasian':'🏆','concacaf.wgold':'🏆',
  // ودية
  'friendly':'🤝','club.friendly':'🤝','nonfifa':'🤝',
  // إضافات من espn_api.py
  'fifa.club.world.cup':'🌍',
  'eng.league':'🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'eng.charity':'🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'afc.asian':'🏆',
  'concacaf.nations.league':'🏆',
  'fifa.wworld.u17':'🌍',
  'global.u20.intercontinental_cup':'🌍',
  'aff.championship':'🏆',
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

// ── League names in Arabic (merged: worker.js + espn_api.py) ──
const LEAGUE_NAMES = {
  // أوروبا — دوريات كبرى
  'eng.1':'الدوري الإنجليزي الممتاز','eng.2':'الدرجة الثانية الإنجليزية',
  'eng.3':'الدرجة الثالثة الإنجليزية','eng.4':'الدرجة الرابعة الإنجليزية','eng.5':'الدرجة الخامسة الإنجليزية',
  'esp.1':'الليغا الإسبانية','esp.2':'الدرجة الثانية الإسبانية',
  'ita.1':'الدوري الإيطالي','ita.2':'الدرجة الثانية الإيطالية',
  'ger.1':'البوندسليغا الألمانية','ger.2':'الدرجة الثانية الألمانية',
  'fra.1':'الدوري الفرنسي','fra.2':'الدرجة الثانية الفرنسية',
  'ned.1':'الدوري الهولندي','ned.2':'الدرجة الثانية الهولندية',
  'por.1':'الدوري البرتغالي','por.2':'الدرجة الثانية البرتغالية',
  'bel.1':'الدوري البلجيكي',
  'tur.1':'الدوري التركي',
  'gre.1':'الدوري اليوناني',
  'sco.1':'الدوري الإسكتلندي',
  'nir.1':'الدوري الأيرلندي الشمالي','wal.1':'الدوري الويلزي','irl.1':'الدوري الإيرلندي',
  'sui.1':'الدوري السويسري','aut.1':'الدوري النمساوي',
  'den.1':'الدوري الدنماركي','nor.1':'الدوري النرويجي','swe.1':'الدوري السويدي','fin.1':'الدوري الفنلندي',
  'rus.1':'الدوري الروسي','pol.1':'الدوري البولندي','cze.1':'الدوري التشيكي',
  'ukr.1':'الدوري الأوكراني','cro.1':'الدوري الكرواتي','srb.1':'الدوري الصربي',
  'bul.1':'الدوري البلغاري','hun.1':'الدوري الهنغاري','rou.1':'الدوري الروماني',
  'svk.1':'الدوري السلوفاكي','svn.1':'الدوري السلوفيني',
  // أوروبا — كؤوس
  'eng.fa':'كأس الاتحاد الإنجليزي','eng.league_cup':'كأس الرابطة الإنجليزية',
  'eng.community_shield':'الدرع الخيري الإنجليزي','eng.charity_shield':'الدرع الخيري الإنجليزي','eng.trophy':'كأس EFL',
  'esp.copa_del_rey':'كأس ملك إسبانيا','esp.supercopa':'السوبر الإسباني','esp.super_cup':'السوبر الإسباني',
  'ita.coppa_italia':'كأس إيطاليا','ita.supercoppa':'السوبر الإيطالي','ita.super_cup':'السوبر الإيطالي',
  'ger.dfb_pokal':'كأس ألمانيا','ger.super_cup':'السوبر الألماني',
  'fra.coupe_de_france':'كأس فرنسا','fra.coupe_de_la_ligue':'كأس الرابطة الفرنسية',
  'fra.trophee_des_champions':'كأس الأبطال الفرنسي','fra.super_cup':'السوبر الفرنسي',
  'ned.knvb':'كأس هولندا','ned.cup':'كأس هولندا','ned.super_cup':'السوبر الهولندي',
  'por.taca_portugal':'كأس البرتغال','por.super_cup':'السوبر البرتغالي',
  'bel.cup':'كأس بلجيكا','bel.super_cup':'السوبر البلجيكي',
  'tur.cup':'كأس تركيا','tur.super_cup':'السوبر التركي',
  'gre.cup':'كأس اليونان',
  'sco.cup':'كأس إسكتلندا','sco.league_cup':'كأس الرابطة الإسكتلندية',
  'sco.tennents':'كأس إسكتلندا','sco.cis':'كأس الرابطة الإسكتلندية','sco.challenge':'كأس التحدي الإسكتلندي',
  'sui.cup':'كأس سويسرا','aut.cup':'كأس النمسا','den.cup':'كأس الدنمارك',
  'nor.cup':'كأس النرويج','swe.cup':'كأس السويد','rus.cup':'كأس روسيا',
  // بطولات قارية أوروبية
  'uefa.champions':'دوري أبطال أوروبا','uefa.europa':'الدوري الأوروبي',
  'uefa.europa.conf':'دوري المؤتمر الأوروبي','uefa.nations':'دوري الأمم الأوروبية',
  'uefa.super_cup':'السوبر الأوروبي','uefa.euro':'بطولة أوروبا','uefa.euroq':'تصفيات بطولة أوروبا',
  'uefa.euro_u21':'بطولة أوروبا تحت 21','uefa.euro_u21_qual':'تصفيات بطولة أوروبا تحت 21',
  'uefa.euro.u19':'بطولة أوروبا تحت 19',
  'uefa.wchampions':'دوري أبطال أوروبا للسيدات','uefa.weuro':'بطولة أوروبا للسيدات',
  'uefa.champions_qual':'تصفيات دوري أبطال أوروبا','uefa.europa_qual':'تصفيات الدوري الأوروبي',
  // أمريكا الجنوبية — دوريات
  'bra.1':'الدوري البرازيلي (سيري أ)','bra.2':'الدرجة الثانية البرازيلية','bra.3':'الدرجة الثالثة البرازيلية',
  'bra.camp.carioca':'دوري كاريوكا','bra.camp.gaucho':'دوري غاوتشو','bra.camp.paulista':'دوري باوليستا',
  'arg.1':'الدوري الأرجنتيني','arg.2':'الدرجة الثانية الأرجنتينية','arg.3':'الدرجة الثالثة الأرجنتينية',
  'chi.1':'الدوري التشيلي','chi.2':'الدرجة الثانية التشيلية',
  'col.1':'الدوري الكولومبي',
  'uru.1':'الدوري الأوروغواياني','uru.2':'الدرجة الثانية الأوروغوانية',
  'ecu.1':'الدوري الإكوادوري','per.1':'الدوري البيروفي','par.1':'الدوري الباراغواياني',
  'ven.1':'الدوري الفنزويلي','bol.1':'الدوري البوليفي',
  // أمريكا الجنوبية — كؤوس وبطولات
  'bra.copa_do_brasil':'كأس البرازيل','bra.super_cup':'السوبر البرازيلي','bra.supercopa_do_brazil':'السوبركوبا البرازيلية',
  'arg.copa_argentina':'كأس الأرجنتين','arg.super_cup':'السوبر الأرجنتيني',
  'chi.copa_chile':'كأس تشيلي','col.copa':'كأس كولومبيا',
  'conmebol.libertadores':'كوبا ليبرتادوريس','conmebol.sudamericana':'كوبا سودأمريكانا',
  'conmebol.america':'كوبا أمريكا','conmebol.recopa':'ريكوبا سودأمريكانا','conmebol.copa':'كوبا أمريكا',
  'conmebol.wamerica':'كوبا أمريكا للسيدات',
  // أمريكا الشمالية
  'mex.1':'الدوري المكسيكي','mex.2':'دوري التوسع المكسيكي',
  'mex.copa_mx':'كأس المكسيك','mex.super_cup':'السوبر المكسيكي',
  'usa.1':'الدوري الأمريكي (MLS)','usa.2':'الدوري الأمريكي الثاني','usa.open':'الكأس الأمريكية المفتوحة',
  'can.1':'الدوري الكندي',
  'crc.1':'الدوري الكوستاريكي','slv.1':'الدوري السلفادوري','hon.1':'الدوري الهندوراسي',
  'jam.1':'الدوري الجامايكي','gua.1':'الدوري الغواتيمالي',
  'concacaf.champions':'دوري أبطال الكونكاكاف','concacaf.gold':'كأس الذهب CONCACAF',
  'concacaf.nations':'دوري الأمم الكونكاكاف','concacaf.leagues.cup':'كأس الدوريات','campeones.cup':'كأس الأبطال',
  'concacaf.wgold':'الكأس الذهبية للسيدات',
  // آسيا — دوريات
  'jpn.1':'الدوري الياباني (J1)','jpn.emperor_cup':'كأس الإمبراطور','jpn.league_cup':'كأس الرابطة اليابانية','jpn.super_cup':'السوبر الياباني',
  'kor.1':'الدوري الكوري (K League)',
  'chn.1':'الدوري الصيني الممتاز','chn.fa_cup':'كأس الصين',
  'aus.1':'الدوري الأسترالي (A-League)','aus.ffa_cup':'كأس أستراليا',
  'sau.1':'الدوري السعودي للمحترفين','ksa.1':'الدوري السعودي للمحترفين',
  'sau.kings_cup':'كأس الملك السعودي','ksa.kings.cup':'كأس الملك السعودي',
  'uae.1':'دوري الخليج العربي الإماراتي',
  'qat.1':'دوري نجوم قطر',
  'bhr.1':'الدوري البحريني المميز',
  'omn.1':'دوري عُمانيتل',
  'jor.1':'الدوري الأردني للمحترفين',
  'irq.1':'دوري نجوم العراق',
  'lbn.1':'الدوري اللبناني للمحترفين',
  'kwt.1':'دوري إنفاس الكويتي',
  'syr.1':'الدوري السوري الممتاز',
  'irn.1':'الدوري الإيراني (خليج فارس)',
  'idn.1':'الدوري الإندونيسي الممتاز','tha.1':'الدوري التايلاندي',
  'ind.1':'الدوري الهندي الممتاز (ISL)','ind.2':'دوري آي الهندي',
  'mas.1':'الدوري الماليزي السوبر','vie.1':'الدوري الفيتنامي V.League',
  'afc.champions':'دوري أبطال آسيا','afc.champions.elite':'دوري أبطال آسيا للنخبة',
  'afc.cup':'كأس الاتحاد الآسيوي','afc.asian.cup':'كأس آسيا','afc.asean':'بطولة الآسيان',
  'afc.wasian':'كأس آسيا للسيدات',
  // أفريقيا
  'egy.1':'الدوري المصري الممتاز',
  'mar.1':'الدوري المغربي بوطولا',
  'alg.1':'الدوري الجزائري المحترف 1',
  'tun.1':'الرابطة التونسية لكرة القدم المحترفة',
  'nga.1':'الدوري النيجيري للمحترفين (NPFL)',
  'rsa.1':'دوري PSA جنوب أفريقيا',
  'gha.1':'الدوري الغاني للمحترفين',
  'caf.champions':'دوري أبطال أفريقيا','caf.nations':'كأس الأمم الأفريقية',
  'caf.confed':'كأس الكونفدرالية الأفريقية','caf.championship':'بطولة أفريقيا للمحليين',
  'caf.nations.qual':'تصفيات كأس الأمم الأفريقية','caf.wnations':'كأس الأمم الأفريقية للسيدات',
  // منتخبات — تصفيات كأس العالم
  'fifa.world':'كأس العالم FIFA 2026',
  'fifa.worldq':'تصفيات كأس العالم',
  'fifa.worldq.uefa':'تصفيات كأس العالم أوروبا',
  'fifa.worldq.conmebol':'تصفيات كأس العالم أمريكا الجنوبية',
  'fifa.worldq.concacaf':'تصفيات كأس العالم الكونكاكاف',
  'fifa.worldq.afc':'تصفيات كأس العالم آسيا',
  'fifa.worldq.caf':'تصفيات كأس العالم أفريقيا',
  'fifa.worldq.ofc':'تصفيات كأس العالم أوقيانوسيا',
  'fifa.wc.qualification.conmebol':'تصفيات كأس العالم أمريكا الجنوبية',
  'fifa.wc.qualification.uefa':'تصفيات كأس العالم أوروبا',
  'fifa.wc.qualification.afc':'تصفيات كأس العالم آسيا',
  'fifa.wc.qualification.caf':'تصفيات كأس العالم أفريقيا',
  'fifa.wc.qualification.concacaf':'تصفيات كأس العالم أمريكا الشمالية',
  // بطولات دولية أخرى
  'fifa.cwc':'كأس العالم للأندية FIFA',
  'fifa.friendly':'مباريات دولية ودية',
  'fifa.wwc':'كأس العالم للسيدات',
  'fifa.olympics':'كرة القدم الأولمبية','fifa.olympics.women':'كرة القدم الأولمبية للسيدات',
  'fifa.confederations':'كأس القارات',
  'fifa.world.u17':'كأس العالم تحت 17','fifa.world.u20':'كأس العالم تحت 20',
  'global.gulf_cup':'كأس الخليج العربي','global.finalissima':'فينالسيما','global.toulon':'بطولة تولون',
  'concacaf.u23':'بطولة الكونكاكاف تحت 23',
  // كرة قدم نسائية
  'usa.nwsl':'دوري السيدات الأمريكي (NWSL)',
  'eng.w.1':'الدوري الإنجليزي الممتاز للسيدات',
  'esp.w.1':'الدوري الإسباني للسيدات',
  'fra.w.1':'الدوري الفرنسي للسيدات',
  'ned.w.1':'الدوري الهولندي للسيدات',
  'aus.w.1':'الدوري الأسترالي للسيدات',
  // ودية
  'friendly':'مباريات ودية','club.friendly':'مباريات ودية للأندية','nonfifa':'مباريات ودية غير رسمية',
  'fifa.friendly_u21':'مباريات ودية تحت 21',
  // إضافات من espn_api.py
  'fifa.club.world.cup':'كأس العالم للأندية FIFA',
  'eng.league':'كأس الرابطة الإنجليزية',
  'eng.charity':'درع الخيرية الإنجليزي',
  'afc.asian':'كأس آسيا',
  'concacaf.nations.league':'دوري أمم الكونكاكاف',
  'fifa.wworld.u17':'كأس العالم للسيدات تحت 17',
  'global.u20.intercontinental_cup':'كأس القارات تحت 20',
  'aff.championship':'بطولة آسيان',
};

// ── parseEvent — resolve league code from UID + ID_TO_CODE ─────
function parseEvent(ev) {
  const comp    = ev.competitions?.[0] || {};
  const home    = comp.competitors?.find(c => c.homeAway === 'home') || {};
  const away    = comp.competitors?.find(c => c.homeAway === 'away') || {};
  const status  = ev.status?.type || {};

  const espnSlug       = ev.leagues?.[0]?.slug || '';
  const uid            = ev.uid || '';
  const leagueId       = uid.match(/~l:(\d+)~/)?.[1] || '';
  const leagueName_raw = ev.leagues?.[0]?.name || (comp.altGameNote || '').split(',')?.[0]?.trim() || '';

  let leagueCode = '';
  if (espnSlug && espnSlug.includes('.')) {
    leagueCode = espnSlug;
  } else if (leagueId && ID_TO_CODE[leagueId]) {
    leagueCode = ID_TO_CODE[leagueId];
  } else if (leagueName_raw) {
    leagueCode = resolveLeagueFromName(leagueName_raw) || espnSlug || '';
  } else {
    leagueCode = espnSlug || '';
  }
  // ضمان أخير: لا نُرجع أبدًا رقمًا خامًا (مثل leagueId) كـ"كود دوري"
  leagueCode = ensureLetterCode(leagueCode, leagueName_raw, '');

  const altNote    = comp.altGameNote || '';
  const parts      = altNote.split(',').map(s => s.trim());
  const leagueName = LEAGUE_NAMES[leagueCode] || parts[0] || leagueName_raw || leagueCode || '';
  const leagueFlag = getFlag(leagueCode, leagueName);
  const statusState = status.state || 'pre';
  const statusText  = status.shortDetail || '';
  const isHalfTime  = statusState === 'in' &&
    (statusText.toLowerCase().includes('half') || statusText.toLowerCase().includes('ht'));
  const penHome = home.shootoutScore ?? null;
  const penAway = away.shootoutScore ?? null;

  return {
    id: ev.id, league: leagueCode, leagueName, leagueFlag,
    leagueNameRaw: parts[0] || leagueName_raw || leagueCode,
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
  const kvKey   = `matches_v4_${date}`;
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
  const leagueName_s = url.searchParams.get('leagueName') || '';

  if (league) {
    league = await resolveLeagueSlug(normalizeLeague(league, leagueName_s), env, leagueName_s);
  }

  if (!matchId) return jsonResp({ error: 'matchId required' }, 400);

  const kvKey  = `summary_v4_${matchId}`;
  const cached = await kvGet(env, kvKey);
  if (cached) return jsonResp({ ...cached, fromCache: true });

  const primary = (league && league.includes('.')) ? [league] : [];
  const fallbacks = [
    'eng.1','esp.1','ger.1','ita.1','fra.1','bra.1','arg.1',
    'ned.1','por.1','sau.1','usa.1','conmebol.libertadores',
    'uefa.champions','fifa.world','afc.champions.elite','caf.nations',
    'tur.1','sco.1','sco.cis','sco.challenge','sco.tennents','gre.1','bel.1','mex.1','jpn.1','kor.1',
    'uae.1','qat.1','egy.1','mar.1','alg.1','tun.1',
    'bhr.1','omn.1','jor.1','irq.1','kwt.1','lbn.1',
  ];
  const leaguesToTry = [...primary, ...fallbacks.filter(l => l !== league)];

  let data = null, usedLeague = league;
  for (const lg of leaguesToTry) {
    try {
      const res = await fetch(`${ESPN_BASE}/${lg}/summary?event=${matchId}`,
        { headers: { 'User-Agent': 'Scorio/1.0' } });
      if (!res.ok) continue;
      const d = await res.json();
      if (d.header?.competitions?.[0]?.competitors?.length) {
        data = d;
        const espnSlug = d.header?.league?.slug || d.leagues?.[0]?.slug || '';
        const uid      = d.header?.competitions?.[0]?.uid || d.header?.uid || '';
        const uidId    = uid.match(/~l:(\d+)~/)?.[1] || '';
        if (espnSlug && espnSlug.includes('.')) {
          usedLeague = espnSlug;
        } else if (uidId && ID_TO_CODE[uidId]) {
          usedLeague = ID_TO_CODE[uidId];
        } else {
          usedLeague = resolveLeagueFromName(d.header?.league?.name || '') || league || lg;
        }
        // ضمان أخير: league/lg آمنان أصلاً بفضل resolveLeagueSlug، لكن نتحقق دفاعيًا
        usedLeague = ensureLetterCode(usedLeague, d.header?.league?.name || leagueName_s, 'eng.1');
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
    const isHalfTime   = statusState === 'in' &&
      (statusText.toLowerCase().includes('half') || statusText.toLowerCase().includes('ht'));
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
  const leagueName_h = url.searchParams.get('leagueName') || '';
  league = await resolveLeagueSlug(normalizeLeague(league, leagueName_h), env, leagueName_h);
  const kvKey  = `standings_v5_${league}`;
  const cached = await kvGet(env, kvKey);
  if (cached) return jsonResp({ ...cached, fromCache: true });

  const seasonParam = getSeasonParam(league);
  const urls = [
    `${ESPN_STAND}/${league}/standings${seasonParam}`,
    `https://site.api.espn.com/apis/v2/sports/soccer/${league}/standings${seasonParam}`,
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
  const season = url.searchParams.get('season') || getSeasonParam(league).replace('?season=','') || '2026';

  league = await resolveLeagueSlug(normalizeLeague(league, leagueName), env, leagueName);

  const kvKey = `scorers_v7_${league}_${season}`;
  const cached = await kvGet(env, kvKey);
  if (cached) return jsonResp({ ...cached, fromCache: true });
  try {
    let res = null;
    const prevSeason = String(parseInt(season) - 1);
    const tryUrls = [
      `https://site.web.api.espn.com/apis/v2/sports/soccer/${league}/statistics?season=${season}`,
      `https://site.web.api.espn.com/apis/v2/sports/soccer/${league}/statistics?season=${prevSeason}`,
      `https://site.web.api.espn.com/apis/v2/sports/soccer/${league}/statistics`,
      `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/statistics?season=${season}`,
    ];
    for (const tryUrl of tryUrls) {
      const r = await fetch(tryUrl, { headers: { 'User-Agent': 'Scorio/1.0' } });
      if (r.ok) { res = r; break; }
    }
    if (!res) throw new Error('ESPN 404');
    const data = await res.json();
    const goalCat = (data.stats || []).find(s =>
      (s.name||'').toLowerCase().includes('goal') ||
      (s.abbreviation||'').toLowerCase() === 'g'
    ) || (data.stats || [])[0];
    const scorers = (goalCat?.leaders || []).map((l, i) => ({
      rank: i + 1,
      name: l.athlete?.displayName || '',
      photo: l.athlete?.headshot?.href || '',
      team: l.team?.displayName || l.athlete?.team?.displayName || '',
      teamLogo: l.team?.logos?.[0]?.href || l.athlete?.team?.logos?.[0]?.href || '',
      goals: parseInt(l.value) || 0,
    }));
    if (!scorers.length) {
      return jsonResp({ success: false, noData: true, scorers: [], league });
    }
    const result = { success: true, league, scorers };
    await kvPut(env, kvKey, result, TTL_SCORERS);
    return jsonResp(result);
  } catch (e) {
    return jsonResp({ success: false, error: e.message }, 500);
  }
}

// ── /api/league-matches ────────────────────────────────────────
async function handleLeagueMatches(url, env) {
  let league  = url.searchParams.get('league') || 'eng.1';
  const leagueName_m = url.searchParams.get('leagueName') || '';
  const date    = url.searchParams.get('date')   || todayEspn();
  const dateTo  = url.searchParams.get('dateTo') || date;
  league = await resolveLeagueSlug(normalizeLeague(league, leagueName_m), env, leagueName_m);

  const cacheKey  = dateTo !== date ? `lgm_v3_${league}_${date}_${dateTo}` : `lgm_v3_${league}_${date}`;
  const isToday = date === todayEspn();
  const cached  = await kvGet(env, cacheKey);
  if (cached) return jsonResp({ ...cached, fromCache: true });

  try {
    let allMatches = [];

    if (dateTo === date) {
      const res = await fetch(`${ESPN_BASE}/${league}/scoreboard?dates=${date}&limit=100`,
        { headers: { 'User-Agent': 'Scorio/1.0' } });
      if (!res.ok) throw new Error(`ESPN ${res.status}`);
      const data = await res.json();
      allMatches = (data.events || []).map(ev => parseEvent(ev));
    } else {
      const res = await fetch(`${ESPN_BASE}/${league}/scoreboard?dates=${date}-${dateTo}&limit=200`,
        { headers: { 'User-Agent': 'Scorio/1.0' } });
      if (res.ok) {
        const data = await res.json();
        allMatches = (data.events || []).map(ev => parseEvent(ev));
      }
      if (!allMatches.length) {
        const start = new Date(date.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
        const end   = new Date(dateTo.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
        const seen  = new Set();
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const ds = d.toISOString().slice(0,10).replace(/-/g,'');
          try {
            const r = await fetch(`${ESPN_BASE}/${league}/scoreboard?dates=${ds}&limit=50`,
              { headers: { 'User-Agent': 'Scorio/1.0' } });
            if (!r.ok) continue;
            const data = await r.json();
            for (const ev of (data.events || [])) {
              if (!seen.has(ev.id)) { seen.add(ev.id); allMatches.push(parseEvent(ev)); }
            }
          } catch {}
        }
      }
    }

    const hasLive = allMatches.some(m => m.status === 'in');
    const result  = {
      success: true, league, date, dateTo,
      leagueName: LEAGUE_NAMES[league] || league,
      count: allMatches.length,
      matches: allMatches,
    };
    await kvPut(env, cacheKey, result, hasLive ? TTL_LIVE : isToday ? TTL_MATCHES : TTL_FINISHED);
    return jsonResp(result);
  } catch (e) {
    return jsonResp({ success: false, error: e.message }, 500);
  }
}

// ── /api/league-rounds ─────────────────────────────────────────
async function handleLeagueRounds(url, env) {
  let league = url.searchParams.get('league') || 'eng.1';
  const leagueName_h = url.searchParams.get('leagueName') || '';
  league = await resolveLeagueSlug(normalizeLeague(league, leagueName_h), env, leagueName_h);
  const kvKey  = `rounds_v3_${league}`;
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
