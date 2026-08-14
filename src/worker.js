// ═══════════════════════════════════════════════════════════════
// worker.js — Scorio Cloudflare Worker (نسخة كاملة مع مزامنة تاريخية)
// ═══════════════════════════════════════════════════════════════

const ESPN_ALL    = 'https://site.web.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard';
const ESPN_BASE   = 'https://site.web.api.espn.com/apis/site/v2/sports/soccer';
const ESPN_STAND  = 'https://site.web.api.espn.com/apis/v2/sports/soccer';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const TTL_LIVE      = 60;
const TTL_MATCHES   = 300;
const TTL_SUMMARY   = 90;
const TTL_FINISHED  = 3600;  // إعادة التحقق من المباريات القديمة كي لا تبقى لقطة ما قبل النهاية
const TTL_STANDINGS = 21600;
const TTL_SCORERS   = 21600;
const TTL_SCORERS_BACKUP = 7 * 86400; // 7 أيام نسخة احتياطية
const TTL_ROUNDS    = 86400;
const TTL_ARCHIVE   = 31536000; // سنة كاملة

// ── KV helpers ────────────────────────────────────────────────
async function kvGet(env, key) {
  try { return await env?.FOOTBALL_KV?.get(key, 'json'); } catch { return null; }
}
async function kvPut(env, key, value, ttl) {
  try {
    const options = ttl ? { expirationTtl: ttl } : {};
    await env?.FOOTBALL_KV?.put(key, JSON.stringify(value), options);
  } catch {}
}

// ── Standings colors (same logic as the Replit main page) ────────
// ESPN may provide the color directly on a team's note, or provide
// a textual qualification/relegation description. Use that data
// instead of guessing colors from fixed positions for each league.
const COLOR_KEYWORDS = [
  ['#ffd700', ['champion', 'title', 'winner', 'campeon', 'campeón', 'campeao', 'campeão']],
  ['#1d6fa4', ['champions league', 'ucl', 'libertadores', 'afc champions', 'caf champions', 'دوري أبطال']],
  ['#f97316', ['europa league', 'uel', 'sudamericana', 'afc cup', 'caf confed', 'دوري أوروبا']],
  ['#8b5cf6', ['conference league', 'uecl', 'كأس المؤتمر']],
  ['#4ade80', ['promotion', 'promoted', 'qualif', 'ascenso', 'ترقية', 'صعود']],
  ['#a3e635', ['promotion play', 'play-off (promotion)', 'ملحق الصعود']],
  ['#f59e0b', ['relegation play', 'play-off (relegation)', 'ملحق الهبوط']],
  ['#e63946', ['relegation', 'relegated', 'descenso', 'هبوط', 'نزول']],
];

function colorForStandingNote(note) {
  if (!note) return '';
  const low = String(note).toLowerCase();
  for (const [color, keywords] of COLOR_KEYWORDS) {
    if (keywords.some(keyword => low.includes(keyword))) return color;
  }
  return '';
}

function parseStandingNote(noteRaw) {
  if (!noteRaw) return { color: '', desc: '' };
  if (typeof noteRaw === 'string') return { color: '', desc: noteRaw };

  let color = noteRaw.color || noteRaw.hex || '';
  const desc = noteRaw.description || noteRaw.text || noteRaw.name || '';
  if (color && !String(color).startsWith('#')) color = `#${String(color).replace(/^#/, '')}`;
  return { color: color || '', desc: String(desc || '') };
}

function buildRangeColorMap(notes) {
  const result = {};
  for (const note of (Array.isArray(notes) ? notes : [])) {
    let color = note?.color || note?.hex || '';
    if (color && !String(color).startsWith('#')) color = `#${String(color).replace(/^#/, '')}`;
    const desc = note?.description || note?.text || note?.name || '';
    const from = note?.fromPosition || note?.from || 0;
    const to = note?.toPosition || note?.to || 0;

    if (color && from && to) {
      for (let position = Number(from); position <= Number(to); position++) {
        result[position] = { color, desc: String(desc || '') };
      }
    } else if (color && from) {
      result[Number(from)] = { color, desc: String(desc || '') };
    }
  }
  return result;
}

function resolveStandingColor(position, entryNote, rangeMap) {
  let { color, desc } = parseStandingNote(entryNote);

  if (!color && desc) color = colorForStandingNote(desc);

  if (!color && rangeMap[position]) {
    const range = rangeMap[position];
    color = range.color || '';
    if (!desc) desc = range.desc;
    if (!color) color = colorForStandingNote(desc);
  }

  return { color, desc };
}

// ESPN may omit the note for one team inside an otherwise continuous
// qualification/relegation zone. Fill only an isolated gap whose neighbours
// have the same colour; do not colour genuinely unmarked positions.
function fillStandingColorGaps(teams) {
  for (let i = 0; i < teams.length; i++) {
    if (teams[i].note_color) continue;
    let left = i - 1;
    let right = i + 1;
    while (left >= 0 && !teams[left].note_color) left--;
    while (right < teams.length && !teams[right].note_color) right++;
    if (left >= 0 && right < teams.length &&
        teams[left].note_color === teams[right].note_color) {
      teams[i].note_color = teams[left].note_color;
      teams[i].note_description =
        teams[left].note_description || teams[right].note_description || '';
    }
  }
  return teams;
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
  '105':'por.1','106':'por.2','112':'rus.1','113':'irl.1','114':'bel.1','116':'swe.1','117':'nor.1','118':'fin.1',
  '119':'den.1','120':'cze.1','121':'pol.1','122':'sui.1','123':'srb.1','124':'cro.1',
  '125':'bul.1','126':'hun.1','127':'ukr.1','131':'mex.1','135':'bra.1','137':'chi.1',
  '141':'col.1','143':'bol.1','147':'ecu.1','150':'par.1','153':'per.1','156':'uru.1',
  '159':'ven.1','163':'jpn.1','166':'ind.1','167':'kor.1','171':'chn.1','174':'mex.1','178':'tha.1',
  '179':'mas.1','180':'idn.1','181':'ksa.1','182':'vie.1','186':'uae.1','190':'qat.1',
  '206':'jor.1','210':'irq.1','231':'mar.1','232':'tun.1',
  '233':'alg.1','234':'egy.1','235':'rsa.1','236':'nga.1','238':'gha.1','606':'fifa.world',
  '620':'bol.1','660':'ecu.1','670':'per.1','680':'uru.1',
  '1975':'caf.champions','1976':'caf.confed','2000':'conmebol.america',
  '2003':'conmebol.copa','2006':'uefa.euro','2010':'fifa.world','2018':'caf.nations',
  '2199':'afc.champions','2201':'concacaf.champions','2202':'concacaf.league','2305':'uefa.nations',
  '2310':'uefa.europa.conf','2311':'uefa.super_cup','2329':'concacaf.nations',
  '2350':'afc.champions.elite','3904':'arg.2','3930':'irl.1','3945':'swe.1',
  '4003':'arg.3','4007':'bra.2','8376':'chn.1','11088':'bra.3','23286':'can.1',
  '18318':'afc.champions','19159':'caf.champions',
  '19834':'fifa.friendly','19874':'fifa.cwc','20226':'concacaf.champions',
  '20296':'afc.champions.elite','21604':'afc.asian.cup','23286':'can.1',
};

// ESPN uses ksa.1 for the Saudi Pro League. Keep sau.1 as a
// backwards-compatible URL alias for older saved links.
const LEAGUE_ALIASES = {
  'sau.1': 'ksa.1',
  'friendly': 'fifa.friendly',
};
function canonicalLeagueCode(code) {
  return LEAGUE_ALIASES[String(code || '')] || String(code || '');
}

function resolveLeagueFromName(name) {
  if (!name) return '';
  const n = name.toLowerCase();
  if (n.includes('premier league') || n.includes('english premier')) return 'eng.1';
  if (n.includes('la liga') || n.includes('laliga')) return 'esp.1';
  if (n.includes('bundesliga') && !n.includes('2.')) return 'ger.1';
  if (n.includes('2. bundesliga')) return 'ger.2';
  if (n.includes('serie a') && !n.includes('b')) return 'ita.1';
  if (n.includes('serie b') && n.includes('ita')) return 'ita.2';
  if (n.includes('ligue 1') && !n.includes('2')) return 'fra.1';
  if (n.includes('ligue 2')) return 'fra.2';
  if (n.includes('eredivisie')) return 'ned.1';
  if (n.includes('champions league')) return 'uefa.champions';
  if (n.includes('conference league')) return 'uefa.europa.conf';
  if (n.includes('europa league')) return 'uefa.europa';
  if (n.includes('copa libertadores')) return 'conmebol.libertadores';
  if (n.includes('sudamericana')) return 'conmebol.sudamericana';
  if (n.includes('copa america') || n.includes('conmebol copa')) return 'conmebol.america';
  if (n.includes('world cup') && !n.includes('qualifier')) return 'fifa.world';
  if (n.includes('world cup qualifier')) return 'fifa.worldq';
  if (n.includes('brasileiro') || n.includes('brasileirão') || n.includes('brasileirao')) return 'bra.1';
  if (n.includes('mls') || n.includes('major league soccer')) return 'usa.1';
  if (n.includes('saudi') || n.includes('roshn')) return 'ksa.1';
  if (n.includes('j1 league') || n.includes('j-league')) return 'jpn.1';
  if (n.includes('k league')) return 'kor.1';
  if (n.includes('chinese super') || n.includes('china super')) return 'chn.1';
  if (n.includes('thai league')) return 'tha.1';
  if (n.includes('indian super') || n.includes('isl')) return 'ind.1';
  if (n.includes('a-league') || n.includes('australia')) return 'aus.1';
  if (n.includes('uae') || n.includes('arabian gulf')) return 'uae.1';
  if (n.includes('qatar') || n.includes('qsl')) return 'qat.1';
  if (n.includes('egyptian premier')) return 'egy.1';
  if (n.includes('botola') || n.includes('morocc')) return 'mar.1';
  if (n.includes('ecuador')) return 'ecu.1';
  if (n.includes('peru') || (n.includes('liga 1') && n.includes('per'))) return 'per.1';
  if (n.includes('uruguay')) return 'uru.1';
  if (n.includes('bolivia')) return 'bol.1';
  if (n.includes('colombia') || n.includes('liga betplay')) return 'col.1';
  if (n.includes('chile') || n.includes('chilean')) return 'chi.1';
  if (n.includes('argentina') || n.includes('liga profesional')) return 'arg.1';
  if (n.includes('paraguay')) return 'par.1';
  if (n.includes('venezuela')) return 'ven.1';
  if (n.includes('nations league') && n.includes('uefa')) return 'uefa.nations';
  if (n.includes('africa cup') || n.includes('afcon')) return 'caf.nations';
  if (n.includes('afc champions') && n.includes('elite')) return 'afc.champions.elite';
  if (n.includes('afc champions')) return 'afc.champions';
  if (n.includes('asian cup')) return 'afc.asian.cup';
  if (n.includes('caf champions')) return 'caf.champions';
  if (n.includes('scottish') || n.includes('spfl')) return 'sco.1';
  if (n.includes('primeira liga') || n.includes('portugal')) return 'por.1';
  if (n.includes('greek super')) return 'gre.1';
  if (n.includes('super lig') || n.includes('turkish')) return 'tur.1';
  if (n.includes('concacaf gold')) return 'concacaf.gold';
  if (n.includes('concacaf champions')) return 'concacaf.champions';
  if (n.includes('concacaf nations')) return 'concacaf.nations';
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
  const now = new Date();
  const seasonStart = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return `?season=${seasonStart}`;
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
  'irq.1':'🇮🇶','jor.1':'🇯🇴',
  'uefa.champions':'🏆','uefa.europa':'🏆','uefa.europa.conf':'🏆',
  'uefa.super_cup':'🏆','uefa.nations':'🇪🇺','uefa.euro':'🇪🇺',
  'conmebol.libertadores':'🏆','conmebol.sudamericana':'🏆','conmebol.america':'🏆',
  'caf.champions':'🏆','caf.nations':'🏆','afc.champions':'🏆','afc.champions.elite':'🏆',
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
  'eng.3':'الدرجة الثالثة الإنجليزية','eng.4':'الدرجة الرابعة الإنجليزية',
  'eng.fa':'كأس FA الإنجليزي','eng.league_cup':'كأس الرابطة الإنجليزية',
  'eng.community_shield':'درع المجتمع',
  'esp.1':'الليغا الإسبانية','esp.2':'الدرجة الثانية الإسبانية',
  'esp.copa_del_rey':'كأس ملك إسبانيا',
  'ita.1':'الدوري الإيطالي','ita.2':'الدرجة الثانية الإيطالية',
  'ita.coppa_italia':'كوبا إيطاليا',
  'ger.1':'البوندسليغا الألمانية','ger.2':'الدرجة الثانية الألمانية',
  'ger.dfb_pokal':'كأس ألمانيا',
  'fra.1':'الدوري الفرنسي','fra.2':'الدرجة الثانية الفرنسية',
  'fra.coupe_de_france':'كأس فرنسا',
  'ned.1':'الدوري الهولندي','por.1':'الدوري البرتغالي','por.2':'الدرجة الثانية البرتغالية',
  'bel.1':'الدوري البلجيكي','tur.1':'الدوري التركي',
  'sco.1':'الدوري الإسكتلندي','gre.1':'الدوري اليوناني',
  'sui.1':'الدوري السويسري','aut.1':'الدوري النمساوي',
  'den.1':'الدوري الدنماركي','nor.1':'الدوري النرويجي','swe.1':'الدوري السويدي',
  'rus.1':'الدوري الروسي','pol.1':'الدوري البولندي','cze.1':'الدوري التشيكي',
  'ukr.1':'الدوري الأوكراني','cro.1':'الدوري الكرواتي','srb.1':'الدوري الصربي',
  'bul.1':'الدوري البلغاري','hun.1':'الدوري المجري','irl.1':'الدوري الأيرلندي',
  'bra.1':'الدوري البرازيلي','bra.2':'الدرجة الثانية البرازيلية',
  'arg.1':'الدوري الأرجنتيني','arg.2':'الدرجة الثانية الأرجنتينية',
  'mex.1':'الدوري المكسيكي','usa.1':'الدوري الأمريكي','can.1':'الدوري الكندي',
  'jpn.1':'الدوري الياباني','kor.1':'الدوري الكوري',
  'chn.1':'الدوري الصيني','aus.1':'الدوري الأسترالي',
  'sau.1':'الدوري السعودي','ksa.1':'الدوري السعودي','uae.1':'دوري الخليج العربي',
  'qat.1':'دوري نجوم قطر','egy.1':'الدوري المصري',
  'mar.1':'الدوري المغربي','alg.1':'الدوري الجزائري',
  'tun.1':'الدوري التونسي','nga.1':'الدوري النيجيري',
  'rsa.1':'الدوري الجنوب أفريقي','irq.1':'الدوري العراقي','jor.1':'الدوري الأردني',
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
  'afc.champions.elite':'دوري أبطال آسيا للنخبة',
  'afc.asian.cup':'كأس آسيا','concacaf.champions':'دوري أبطال الكونكاكاف',
  'concacaf.gold':'كأس الذهب','concacaf.nations':'دوري الأمم الكونكاكاف',
  'fifa.world':'كأس العالم FIFA','fifa.worldq':'تصفيات كأس العالم',
  'fifa.cwc':'كأس العالم للأندية','fifa.friendly':'مباريات دولية ودية',
};

// ── Parse a single ESPN event ──────────────────────────────────
function parseEvent(ev) {
  const comp    = ev.competitions?.[0] || {};
  const home    = comp.competitors?.find(c => c.homeAway === 'home') || {};
  const away    = comp.competitors?.find(c => c.homeAway === 'away') || {};
  const status  = ev.status?.type || {};
  const uid     = ev.uid || '';
  const leagueId = uid.match(/~l:(\d+)~/)?.[1] || '';
  const leagueCode = canonicalLeagueCode(ID_TO_CODE[leagueId]
    || resolveLeagueFromName(ev.leagues?.[0]?.name || comp.altGameNote?.split(',')?.[0] || '')
    || leagueId || '');
  const scoreValue = competitor => {
    const raw = competitor?.score ?? competitor?.scoreValue ?? competitor?.displayValue ?? '';
    return raw && typeof raw === 'object' ? (raw.displayValue ?? raw.value ?? '') : raw;
  };
  const altNote  = comp.altGameNote || '';
  const parts    = altNote.split(',').map(s => s.trim());
  const leagueName = LEAGUE_NAMES[leagueCode] || parts[0] || ev.leagues?.[0]?.name || leagueCode || '';
  const leagueFlag = getFlag(leagueCode, leagueName);
  const statusState = status.completed ? 'post' : (status.state || 'pre');
  const statusText  = status.shortDetail || '';
  const isHalfTime  = statusState === 'in' && (statusText.toLowerCase().includes('half') || statusText.toLowerCase().includes('ht'));
  const penHome = home.shootoutScore ?? null;
  const penAway = away.shootoutScore ?? null;
  return {
    id: ev.id, league: leagueCode, leagueName, leagueFlag,
    leagueNameRaw: parts[0] || ev.leagues?.[0]?.name || leagueCode,
    leagueStage: parts.slice(1).join(', ') || '',
    date: ev.date,
    homeTeam: home.team?.displayName || '', homeLogo: home.team?.logo || '', homeScore: scoreValue(home),
    awayTeam: away.team?.displayName || '', awayLogo: away.team?.logo || '', awayScore: scoreValue(away),
    status: statusState, statusText, isHalfTime, minute: ev.status?.displayClock || '',
    penaltyScore: (penHome !== null && penAway !== null) ? `${penHome}-${penAway}` : null,
    venue: comp.venue?.fullName || '',
  };
}

function todayEspn() {
  return new Date().toISOString().slice(0,10).replace(/-/g,'');
}

// يقبل التاريخ بصيغة ESPN (20260808) أو الصيغة العادية (2026-08-08)
function normalizeEspnDate(value) {
  const normalized = String(value || '').replace(/-/g, '');
  return /^\d{8}$/.test(normalized) ? normalized : todayEspn();
}

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

// ── /api/matches ───────────────────────────────────────────────
async function handleMatches(url, env) {
  const date    = normalizeEspnDate(url.searchParams.get('date') || todayEspn());
  const kvKey   = `matches_v3_${date}`;
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
  league = canonicalLeagueCode(league);
  if (!matchId) return jsonResp({ error: 'matchId required' }, 400);

  // إصدار جديد حتى لا تُعاد نتائج قديمة ناقصة الأحداث من الكاش.
  const kvKey  = `summary_v5_${matchId}`;
  const cached = await kvGet(env, kvKey);
  if (cached) return jsonResp({ ...cached, fromCache: true });

  // A match can belong to a cup, friendly, or a league whose numeric ESPN
  // id was not present in an older client bundle. Try the supplied league
  // first, then all known competitions in small concurrent batches.
  const leaguesToTry = [...new Set([
    ...(league ? [league] : []),
    'eng.1','esp.1','ger.1','ita.1','fra.1','bra.1','arg.1','ned.1','por.1',
    'ksa.1','usa.1','fifa.friendly','fifa.cwc','club.friendly',
    'conmebol.libertadores','conmebol.sudamericana','uefa.champions',
    'uefa.europa','uefa.europa.conf','afc.champions','afc.champions.elite',
    'caf.nations','caf.champions','concacaf.champions','fifa.world',
    ...Object.keys(LEAGUE_NAMES),
  ])];

  let data = null, usedLeague = league;
  for (let offset = 0; offset < leaguesToTry.length && !data; offset += 8) {
    const batch = leaguesToTry.slice(offset, offset + 8);
    const results = await Promise.all(batch.map(async lg => {
      try {
        const res = await fetch(`${ESPN_BASE}/${lg}/summary?event=${matchId}`, { headers: { 'User-Agent': 'Scorio/1.0' } });
        if (!res.ok) return null;
        const d = await res.json();
        return d.header?.competitions?.[0]?.competitors?.length ? { lg, data: d } : null;
      } catch { return null; }
    }));
    const found = results.find(Boolean);
    if (found) {
      data = found.data;
      const uid    = data.header?.competitions?.[0]?.uid || data.header?.uid || '';
      const uidId  = uid.match(/~l:(\d+)~/)?.[1] || '';
      const espnId = uidId || String(data.header?.league?.id || '');
      usedLeague   = (espnId && ID_TO_CODE[espnId]) ? ID_TO_CODE[espnId]
        : resolveLeagueFromName(data.header?.league?.name || '') || league || found.lg;
    }
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
  const seenGoals = new Map();
  const seenCards = new Set();
  const seenSubs = new Set();
  const keyEvents = data.keyEvents || [];
  const details = data.header?.competitions?.[0]?.details || [];

  const normalizeEventType = value =>
    String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const eventType = ev =>
    normalizeEventType(ev.type?.type || ev.type?.text || ev.type);
  const normaliseText = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const normaliseMinute = value => {
    const raw = String(value || '').replace(/[′'’]/g, '').replace(/\s+/g, '');
    const match = raw.match(/^0*(\d+)(?:\+0*(\d+))?/);
    return match ? `${Number(match[1])}${match[2] ? `+${Number(match[2])}` : ''}` : raw;
  };
  const goalType = (event, type) =>
    event.ownGoal || type === 'owngoal' ? 'ownGoal' :
    event.penaltyKick || type.includes('penalty') ? 'penalty' : 'goal';
  const addGoal = goal => {
    // keyEvents, details, and plays may all describe the same goal. ESPN
    // sometimes omits the team or formats 90+3 differently in one source,
    // so the stable identity is minute + player (team only as a fallback).
    const playerKey = normaliseText(goal.player);
    const teamKey = normaliseText(goal.team);
    const key = playerKey
      ? `goal_${normaliseMinute(goal.minute)}_${playerKey}`
      : `goal_${normaliseMinute(goal.minute)}_${teamKey}_${goal.type}`;
    const existing = seenGoals.get(key);
    if (existing) {
      if (!existing.team && goal.team) existing.team = goal.team;
      if (!existing.assist && goal.assist) existing.assist = goal.assist;
      if (existing.type === 'goal' && goal.type !== 'goal') existing.type = goal.type;
      return;
    }
    seenGoals.set(key, goal);
    goals.push(goal);
  };
  const addCard = card => {
    const key = `card_${normaliseMinute(card.minute)}_${normaliseText(card.player)}_${normaliseText(card.team)}_${card.type}`;
    if (seenCards.has(key)) return;
    seenCards.add(key);
    cards.push(card);
  };
  const addSub = sub => {
    const key = `sub_${normaliseMinute(sub.minute)}_${normaliseText(sub.playerOut)}_${normaliseText(sub.playerIn)}_${normaliseText(sub.team)}`;
    if (seenSubs.has(key)) return;
    seenSubs.add(key);
    subs.push(sub);
  };

  const jerseyMap = {};
  for (const ro of (data.rosters || []))
    for (const p of (ro.roster || []))
      if (p.athlete?.displayName && p.jersey) jerseyMap[p.athlete.displayName] = p.jersey;

  for (const ev of keyEvents) {
    const t   = eventType(ev);
    const min = ev.clock?.displayValue || '';
    const add = ev.addedClock?.displayValue ? `+${ev.addedClock.displayValue}` : '';
    const fullMin = min ? `${min}${add}` : '';
    const team    = ev.team?.displayName || '';
    const pp      = ev.participants || [];
    const p1      = pp[0]?.athlete?.displayName || '';
    if (t === 'goal' || t === 'owngoal' || t === 'penaltyscored' || (t.includes('goal') && !t.includes('miss')) || (t.includes('penalty') && !t.includes('miss') && !t.includes('save'))) {
      addGoal({ minute: fullMin, player: p1, assist: pp[1]?.athlete?.displayName || '', team, type: goalType(ev, t) });
    }
    if (t === 'yellowcard')    addCard({ minute: fullMin, player: p1, team, type: 'yellowCard' });
    if (t === 'redcard')       addCard({ minute: fullMin, player: p1, team, type: 'redCard' });
    if (t === 'yellowredcard') addCard({ minute: fullMin, player: p1, team, type: 'yellowRedCard' });
  }

  // بعض أهداف ESPN تكون في details حتى عند وجود أهداف أخرى في keyEvents.
  for (const det of details) {
      const t = eventType(det);
      if (!det.scoringPlay && !(t.includes('goal') && !t.includes('miss')) && !(t.includes('penalty') && !t.includes('miss') && !t.includes('save'))) continue;
      const min = det.clock?.displayValue || '';
      const add = det.addedClock?.displayValue ? `+${det.addedClock.displayValue}` : '';
      const full = min ? `${min}${add}` : '';
      const player = det.participants?.[0]?.athlete?.displayName || '';
      const type = goalType(det, t || 'goal');
       addGoal({ minute: full, player, assist: det.participants?.[1]?.athlete?.displayName || '', team: det.team?.displayName || '', type });
  }

  // بعض مباريات ESPN تعرض أهدافها داخل plays.
  for (const play of (data.plays || [])) {
    const t = eventType(play);
    if (!play.scoringPlay && !(t.includes('goal') && !t.includes('miss')) && !(t.includes('penalty') && !t.includes('miss') && !t.includes('save'))) continue;
    const min = play.clock?.displayValue || '';
    const add = play.addedClock?.displayValue ? `+${play.addedClock.displayValue}` : '';
    const full = min ? `${min}${add}` : '';
    const pp = play.participants || [];
    const player = pp[0]?.athlete?.displayName || pp[0]?.displayName || '';
    const type = goalType(play, t || 'goal');
     addGoal({ minute: full, player, assist: pp[1]?.athlete?.displayName || pp[1]?.displayName || '', team: play.team?.displayName || '', type });
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
     addSub({ minute: full, playerIn: playerIn || '—', playerOut: playerOut || '—', jerseyIn: jerseyMap[playerIn] || '', jerseyOut: jerseyMap[playerOut] || '', team });
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
      const isOut = t === 'substitutionout';
       addSub({ minute: full, playerIn: (isOut ? p2 : p1) || '—', playerOut: (isOut ? p1 : p2) || '—', jerseyIn: '', jerseyOut: '', team });
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
  const seasonParam = url.searchParams.get('season') || '';
  
  if (!isNaN(league) && ID_TO_CODE[league]) league = ID_TO_CODE[league];
  league = canonicalLeagueCode(league);
  
  // A requested season must never fall back to the current-season cache.
  // Otherwise a missing historical entry silently returns the wrong table.
  const requestedSeason = /^\d{4}$/.test(seasonParam) ? seasonParam : '';
  const kvKey = requestedSeason
    ? `standings_v7_${league}_${requestedSeason}`
    : `standings_v5_${league}`;
  const cached = await kvGet(env, kvKey);
  if (cached) return jsonResp({ ...cached, fromCache: true });

  const seasonHint = SEASON_OVERRIDE[league];
  // For an explicit season, try only that season. The previous behavior
  // tried several years and could return a different season's standings.
  const seasonsToTry = requestedSeason
    ? [requestedSeason]
    : (seasonHint ? [seasonHint, '2025', '2024'] : ['2026', '2025', '2024', '2023']);
  const urls = requestedSeason
    ? [
        `${ESPN_STAND}/${league}/standings?xhr=1&season=${requestedSeason}`,
      ]
    : [
        ...seasonsToTry.map(s => `${ESPN_STAND}/${league}/standings?xhr=1&season=${s}`),
        `${ESPN_STAND}/${league}/standings`,
      ];
  let data = null;
  for (const u of urls) {
    try {
      const res = await fetch(u, { headers: { 'User-Agent': 'Scorio/1.0' } });
      if (!res.ok) continue;
      const d = await res.json();
      if ((d.children || []).some(c => (c.standings?.entries || []).length > 0)) { data = d; break; }
    } catch { continue; }
  }
  if (!data) return jsonResp({ success: false, noStandings: true, groups: [] });

  const groups = [];
  for (const child of (data.children || [])) {
    const groupName = data.children.length > 1 ? (child.name || '') : '';
    const entries   = child.standings?.entries || [];
    const rangeMap  = buildRangeColorMap(
      child.notes ||
      child.standings?.notes ||
      child.standing?.notes ||
      data.notes ||
      []
    );
    const teams = entries.map((e, i) => {
      const team  = e.team || {};
      const stats = {};
      for (const s of (e.stats || [])) stats[s.name] = s.displayValue ?? s.value ?? 0;
      const rank = parseInt(stats.rank) || i + 1;
      const zone = resolveStandingColor(rank, e.note, rangeMap);
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
    fillStandingColorGaps(teams);
    groups.push({ name: groupName, teams });
  }

  const legendMap = {};
  groups.forEach(g => g.teams.forEach(t => {
    if (t.note_color && !legendMap[t.note_color]) legendMap[t.note_color] = t.note_description;
  }));
  const legend = Object.entries(legendMap).map(([color, desc]) => ({ color, desc }));

  const result = {
    success: true,
    league,
    ...(requestedSeason ? { season: requestedSeason } : {}),
    leagueName: LEAGUE_NAMES[league] || league,
    groups,
    legend,
  };
  await kvPut(env, kvKey, result, TTL_STANDINGS);
  return jsonResp(result);
}

// ── /api/scorers ───────────────────────────────────────────────
async function handleScorers(url, env) {
  let league = url.searchParams.get('league') || 'eng.1';
  const leagueName = url.searchParams.get('leagueName') || '';
  const season = /^\d{4}$/.test(url.searchParams.get('season') || '')
    ? url.searchParams.get('season')
    : '';
  
  if (!isNaN(league) && ID_TO_CODE[league]) {
    league = ID_TO_CODE[league];
  } else if (!isNaN(league) && leagueName) {
    league = resolveLeagueFromName(leagueName) || league;
  }
  league = canonicalLeagueCode(league);

  // 🔴 أولاً: ابحث في المزامنة التاريخية إذا طُلب موسم محدد
  const now = new Date();
  const currentSeason = String(now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1);
  if (season && season !== currentSeason && SYNC_SEASONS.includes(season)) {
    const histKey = `scorers_v8_${league}_${season}`;
    const histCached = await kvGet(env, histKey);
    if (histCached) return jsonResp({ ...histCached, fromCache: true });
  }

  const kvKey = `scorers_v5_${league}_${season || 'current'}`;
  const cached = await kvGet(env, kvKey);
  if (cached) return jsonResp({ ...cached, fromCache: true });

  // 🔴 نسخة احتياطية من الكاش القديم (7 أيام)
  const backupKey = `scorers_backup_v2_${league}_${season || 'current'}`;
  const backup = await kvGet(env, backupKey);
  if (backup) return jsonResp({ ...backup, fromCache: true, stale: true });

  try {
    const sp = season ? `?season=${season}` : getSeasonParam(league);
    // When a season is selected, never query an unscoped endpoint: ESPN's
    // unscoped response may be the previous completed season.
    const urlsToTry = [
      `${ESPN_BASE}/${league}/statistics${sp}`,
      `${ESPN_BASE}/${league}/leaders${sp}`,
    ];

    let scorers = [];

    for (const u of urlsToTry) {
      try {
        const res = await fetch(u, { headers: { 'User-Agent': 'Scorio/1.0' } });
        if (!res.ok) continue;
        const data = await res.json();

        if (data.stats?.length) {
          const goalCat = data.stats.find(s =>
            (s.name || '').toLowerCase().includes('goal') ||
            (s.displayName || '').toLowerCase().includes('goal') ||
            (s.abbreviation || '').toLowerCase() === 'g'
          ) || data.stats[0];
          const leaders = goalCat?.leaders || [];
          if (leaders.length) {
            scorers = leaders.map((l, i) => ({
              rank: i + 1,
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
            (c.name || '').toLowerCase().includes('goal')
          ) || data.categories[0];
          const leaders = goalsCat?.leaders || [];
          if (leaders.length) {
            scorers = leaders.map((l, i) => ({
              rank: i + 1,
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
      return jsonResp({
        success: false,
        // The browser has a second source for the same requested season.
        // Keep noData for callers that want to show an explicit empty state.
        noCache: true,
        noData: true,
        scorers: [],
        league,
        leagueName: LEAGUE_NAMES[league] || league,
      });
    }

    const result = { success: true, league, season: season || currentSeason, leagueName: LEAGUE_NAMES[league] || league, scorers };
    
    // حفظ في الكاش العادي
    await kvPut(env, kvKey, result, TTL_SCORERS);
    
    // حفظ نسخة احتياطية طويلة الأمد
    await kvPut(env, backupKey, result, TTL_SCORERS_BACKUP);
    
    return jsonResp(result);
  } catch (e) {
    return jsonResp({ success: false, error: e.message }, 500);
  }
}

// ── /api/league-matches ────────────────────────────────────────
async function handleLeagueMatches(url, env) {
  let league = url.searchParams.get('league') || 'eng.1';
  // The league page sends dateFrom/dateTo in ISO format. Also accept the
  // older single-date parameter used by the fallback-day view.
  const dateFrom = normalizeEspnDate(
    url.searchParams.get('dateFrom') || url.searchParams.get('date') || todayEspn()
  );
  const dateTo = normalizeEspnDate(
    url.searchParams.get('dateTo') || dateFrom
  );
  const season = /^\d{4}$/.test(url.searchParams.get('season') || '')
    ? url.searchParams.get('season')
    : '';
  const leagueName = url.searchParams.get('leagueName') || '';
  if (!isNaN(league) && ID_TO_CODE[league]) {
    league = ID_TO_CODE[league];
  } else if (!isNaN(league) && leagueName) {
    league = resolveLeagueFromName(leagueName) || league;
  }
  league = canonicalLeagueCode(league);

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
  const kvKey = `lgm_v4_${league}_${season || 'current'}_${dateFrom}_${dateTo}`;
  const cached = await kvGet(env, kvKey);
  if (cached) return jsonResp({ ...cached, fromCache: true });

  try {
    const allMatches = [];
    const seen = new Set();

    await Promise.all(dates.map(async (d) => {
      try {
        const res = await fetch(
          `${ESPN_BASE}/${league}/scoreboard?dates=${d}&limit=100${season ? `&season=${season}` : ''}`,
          { headers: { 'User-Agent': 'Scorio/1.0' } }
        );
        if (!res.ok) return;
        const data = await res.json();
        for (const ev of (data.events || [])) {
          if (!seen.has(ev.id)) {
            seen.add(ev.id);
            allMatches.push(parseEvent(ev));
          }
        }
      } catch { /* تجاهل أخطاء يوم واحد */ }
    }));

    allMatches.sort((a, b) => new Date(a.date) - new Date(b.date));

    const hasLive = allMatches.some(m => m.status === 'in');
    const result = {
      success: true,
      league,
      dateFrom,
      dateTo,
      leagueName: LEAGUE_NAMES[league] || league,
      count: allMatches.length,
      matches: allMatches,
    };
    await kvPut(env, kvKey, result, hasLive ? TTL_LIVE : isToday ? TTL_MATCHES : TTL_FINISHED);
    return jsonResp(result);
  } catch (e) {
    return jsonResp({ success: false, error: e.message }, 500);
  }
}

// ── /api/league-rounds ─────────────────────────────────────────
async function handleLeagueRounds(url, env) {
  let league = url.searchParams.get('league') || 'eng.1';
  const season = /^\d{4}$/.test(url.searchParams.get('season') || '')
    ? url.searchParams.get('season')
    : '';
  const leagueName = url.searchParams.get('leagueName') || '';
  if (!isNaN(league) && ID_TO_CODE[league]) {
    league = ID_TO_CODE[league];
  } else if (!isNaN(league) && leagueName) {
    league = resolveLeagueFromName(leagueName) || league;
  }
  league = canonicalLeagueCode(league);
  const kvKey  = `rounds_v3_${league}_${season || 'current'}`;
  const cached = await kvGet(env, kvKey);
  if (cached) return jsonResp({ ...cached, fromCache: true });
  try {
    const seasonQuery = season ? `?season=${season}` : '';
    const res  = await fetch(`${ESPN_BASE}/${league}/scoreboard${seasonQuery}`, { headers: { 'User-Agent': 'Scorio/1.0' } });
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

// ── Client fallback cache endpoints ───────────────────────────────
// Kept for compatibility with older/newer browser bundles. The GET
// endpoints above can fetch data themselves, but these POST routes allow
// the browser to populate KV when it has the freshest ESPN response.
async function handleScorersSet(url, env, request) {
  const league = url.searchParams.get('league') || '';
  const season = url.searchParams.get('season') || '2026';
  if (!league) return jsonResp({ error: 'league required' }, 400);
  try {
    const body = await request.json();
   const key = `scorers_v5_${league}_${season}`;
    await kvPut(env, key, body, TTL_SCORERS);
   await kvPut(env, `scorers_backup_v2_${league}_${season}`, body, TTL_SCORERS_BACKUP);
    return jsonResp({ ok: true, kvKey: key, ttl: TTL_SCORERS });
  } catch (e) {
    return jsonResp({ error: e.message }, 500);
  }
}

async function handleRoundsSet(url, env, request) {
  const league = url.searchParams.get('league') || '';
  const season = url.searchParams.get('season') || '2026';
  if (!league) return jsonResp({ error: 'league required' }, 400);
  try {
    const body = await request.json();
    const key = `rounds_v2_${league}`;
    await kvPut(env, key, body, TTL_ROUNDS);
    // Also write the season-aware key used by newer deployments.
    await kvPut(env, `rounds_v4_${league}_${season}`, body, TTL_ROUNDS);
    return jsonResp({ ok: true, kvKey: key, ttl: TTL_ROUNDS });
  } catch (e) {
    return jsonResp({ error: e.message }, 500);
  }
}

async function handleMatchesSet(url, env, request) {
  const cacheKey = url.searchParams.get('cacheKey') || '';
  if (!cacheKey) return jsonResp({ error: 'cacheKey required' }, 400);
  try {
    const body = await request.json();
    await kvPut(env, cacheKey, body, TTL_MATCHES);
    return jsonResp({ ok: true, cacheKey, ttl: TTL_MATCHES });
  } catch (e) {
    return jsonResp({ error: e.message }, 500);
  }
}

// ── ════════════════════════════════════════════════════════════════
// ── المزامنة التاريخية (من الملف القديم) ──────────────────────
// ── ════════════════════════════════════════════════════════════════

const SYNC_LEAGUES = Object.keys(LEAGUE_NAMES);
const SYNC_SEASONS = ['2020','2021','2022','2023','2024','2025','2026'];
const HIST_STATE_KEY = 'historical_sync_state_v1';

async function fetchStandingsForSeason(league, season) {
  const urls = [
    `${ESPN_STAND}/${league}/standings?season=${season}`,
    `https://site.api.espn.com/apis/v2/sports/soccer/${league}/standings?season=${season}`,
  ];
  for (const u of urls) {
    try {
      const res = await fetch(u, { headers: { 'User-Agent': 'Scorio/1.0' } });
      if (!res.ok) continue;
      const d = await res.json();
      if (!(d.children || []).some(c => (c.standings?.entries || []).length > 0)) continue;
      const groups = [];
      for (const child of (d.children || [])) {
        const groupName = d.children.length > 1 ? (child.name || '') : '';
        const entries   = child.standings?.entries || [];
        const rangeMap  = buildRangeColorMap(child.notes || child.standing?.notes || []);
        const teams = entries.map((e, i) => {
          const team  = e.team || {};
          const stats = {};
          for (const s of (e.stats || [])) stats[s.name] = s.displayValue ?? s.value ?? 0;
          const rank = parseInt(stats.rank) || i + 1;
          const zone = resolveStandingColor(rank, e.note, rangeMap);
          return {
            rank, name: team.displayName || team.name || '---',
            short: team.abbreviation || '',
            logo: team.logos?.[0]?.href || team.logo || '',
            played: parseInt(stats.gamesPlayed) || 0,
            wins:   parseInt(stats.wins) || 0,
            draws:  parseInt(stats.ties ?? stats.draws) || 0,
            losses: parseInt(stats.losses) || 0,
            gd:     stats.pointDifferential ?? '',
            points: parseInt(stats.points) || 0,
            note_color: zone.color, note_description: zone.desc,
          };
        });
        teams.sort((a,b) => a.rank - b.rank);
        fillStandingColorGaps(teams);
        groups.push({ name: groupName, teams });
      }
      const legendMap = {};
      groups.forEach(g => g.teams.forEach(t => {
        if (t.note_color && !legendMap[t.note_color]) legendMap[t.note_color] = t.note_description;
      }));
      const legend = Object.entries(legendMap).map(([color, desc]) => ({ color, desc }));
      return { success: true, league, season, leagueName: LEAGUE_NAMES[league] || league, groups, legend };
    } catch { continue; }
  }
  return null;
}

async function runHistoricalSync(env, maxOps = 6) {
  let state = await kvGet(env, HIST_STATE_KEY)
    || { phase: 'matches', cursor: '20200101' };

  if (state.phase === 'done') return { done: true, msg: 'المزامنة التاريخية مكتملة ✅' };

  const todayStr  = todayEspn();
  let opsLeft = maxOps;

  if (state.phase === 'matches') {
    let cursor = new Date(
      parseInt(state.cursor.slice(0,4)),
      parseInt(state.cursor.slice(4,6)) - 1,
      parseInt(state.cursor.slice(6,8))
    );

    while (opsLeft > 0 && dateToEspn(cursor) <= todayStr) {
      const dayStr   = dateToEspn(cursor);
      const checkKey = `matches_v4_${dayStr}`;

      const already = await kvGet(env, checkKey);
      if (!already) {
        try {
          const res = await fetch(
            `${ESPN_ALL}?dates=${dayStr}&limit=500`,
            { headers: { 'User-Agent': 'Scorio/1.0' } }
          );
          if (res.ok) {
            const matches = ((await res.json()).events || []).map(parseEvent);
            await kvPut(env, checkKey,
              { success:true, date:dayStr, count:matches.length, matches },
              TTL_FINISHED
            );
          }
        } catch {}
        opsLeft--;
        if (opsLeft > 0) await new Promise(r => setTimeout(r, 400));
      }

      cursor.setDate(cursor.getDate() + 1);
    }

    const newCursor = dateToEspn(cursor);
    if (newCursor > todayStr) {
      state = { phase: 'standings', seasonIdx: 0, leagueIdx: 0 };
    } else {
      state = { phase: 'matches', cursor: newCursor };
    }
    await kvPut(env, HIST_STATE_KEY, state, null);
    return { done: false, phase: 'matches', nextCursor: newCursor, opsRemaining: opsLeft };
  }

  if (state.phase === 'standings') {
    let { seasonIdx, leagueIdx } = state;

    while (opsLeft > 0) {
      if (seasonIdx >= SYNC_SEASONS.length) {
        state = { phase: 'done' };
        await kvPut(env, HIST_STATE_KEY, state, null);
        return { done: true, msg: 'المزامنة التاريخية مكتملة ✅' };
      }
      if (leagueIdx >= SYNC_LEAGUES.length) {
        seasonIdx++;
        leagueIdx = 0;
        continue;
      }

      const season = SYNC_SEASONS[seasonIdx];
      const league = SYNC_LEAGUES[leagueIdx];
      const kvKey  = `standings_v7_${league}_${season}`;

      const already = await kvGet(env, kvKey);
      if (!already) {
        try {
          const data = await fetchStandingsForSeason(league, season);
          if (data) await kvPut(env, kvKey, data, null);
        } catch {}
        opsLeft--;
        if (opsLeft > 0) await new Promise(r => setTimeout(r, 250));
      }

      leagueIdx++;
    }

    state = { phase: 'standings', seasonIdx, leagueIdx };
    await kvPut(env, HIST_STATE_KEY, state, null);
    const totalLeagues = SYNC_LEAGUES.length;
    const totalSeasons = SYNC_SEASONS.length;
    const done = seasonIdx * totalLeagues + leagueIdx;
    const total = totalSeasons * totalLeagues;
    return {
      done: false, phase: 'standings',
      progress: `${done}/${total}`,
      currentSeason: SYNC_SEASONS[Math.min(seasonIdx, SYNC_SEASONS.length-1)],
      currentLeague: SYNC_LEAGUES[Math.min(leagueIdx, SYNC_LEAGUES.length-1)],
    };
  }

  return { done: true };
}

function dateToEspn(d) {
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
}

// ── /api/historical-sync-status ──────────────────────────────────
async function handleHistoricalSyncStatus(url, env) {
  const secret   = url.searchParams.get('secret') || '';
  const expected = env.SYNC_SECRET || '';
  if (!expected || secret !== expected) {
    return new Response('Unauthorized', { status: 401, headers: CORS });
  }
  const state = await kvGet(env, HIST_STATE_KEY);
  if (!state) return jsonResp({ started: false });
  const totalLeagues = SYNC_LEAGUES.length;
  const totalSeasons = SYNC_SEASONS.length;
  if (state.phase === 'matches') {
    return jsonResp({ phase: 'matches', cursor: state.cursor, started: true });
  }
  if (state.phase === 'standings') {
    const done  = state.seasonIdx * totalLeagues + state.leagueIdx;
    const total = totalSeasons * totalLeagues;
    return jsonResp({
      phase: 'standings', progress: `${done}/${total}`,
      pct: Math.round(done/total*100),
      season: SYNC_SEASONS[Math.min(state.seasonIdx, SYNC_SEASONS.length-1)],
      league: SYNC_LEAGUES[Math.min(state.leagueIdx, SYNC_LEAGUES.length-1)],
      started: true,
    });
  }
  return jsonResp({ phase: state.phase, done: true, started: true });
}

// ── /api/historical-sync (تشغيل المزامنة) ──────────────────────
async function handleHistoricalSync(url, env, ctx) {
  const secret   = url.searchParams.get('secret') || '';
  const expected = env.SYNC_SECRET || '';
  if (!expected || secret !== expected) {
    return new Response('Unauthorized', { status: 401, headers: CORS });
  }

  const maxOps = Math.min(parseInt(url.searchParams.get('maxOps') || '6', 10), 20);
  const syncPromise = runHistoricalSync(env, maxOps);
  ctx.waitUntil(syncPromise);
  const result = await syncPromise;
  return jsonResp({ ...result, ts: new Date().toISOString() });
}

// ── Main router ────────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: CORS });
    const url  = new URL(request.url);
    const path = url.pathname;
    
    // Client-side cache writes are intentionally handled before the
    // historical-sync trigger so a POST cannot start a sync job.
    if (request.method === 'POST') {
      if (path === '/api/scorers-set') return handleScorersSet(url, env, request);
      if (path === '/api/rounds-set') return handleRoundsSet(url, env, request);
      if (path === '/api/matches-set') return handleMatchesSet(url, env, request);
      return new Response('Not Found', { status: 404, headers: CORS });
    }

    // 🔴 تشغيل المزامنة التاريخية تلقائياً (مرة واحدة) عند أول طلب
    const histState = await kvGet(env, HIST_STATE_KEY);
    if (!histState || histState.phase !== 'done') {
      // تشغيل في الخلفية بدون انتظار
      ctx.waitUntil(runHistoricalSync(env, 6));
    }
    
    if (path === '/ping') return new Response('pong', { headers: CORS });
    if (path === '/api/matches') return handleMatches(url, env);
    if (path === '/api/v2/matches/all' || path === '/api/v2/matches/all/' || path === '/api/v2/matches/all//') 
      return handleMatches(url, env);
    if (path === '/api/summary') return handleSummary(url, env);
    if (path === '/api/standings') return handleStandings(url, env);
    if (path === '/api/scorers') return handleScorers(url, env);
    if (path === '/api/league-matches') return handleLeagueMatches(url, env);
    if (path === '/api/league-rounds') return handleLeagueRounds(url, env);
    if (path === '/api/historical-sync') return handleHistoricalSync(url, env, ctx);
    if (path === '/api/historical-sync-status') return handleHistoricalSyncStatus(url, env);
    return new Response('Not Found', { status: 404, headers: CORS });
  },
  
  // ── Cron Trigger للمزامنة التلقائية ────────────────────────
  async scheduled(event, env, ctx) {
    const cron = event.cron;
    if (cron === '*/2 * * * *') {
      const histState = await kvGet(env, HIST_STATE_KEY);
      if (!histState || histState.phase !== 'done') {
        ctx.waitUntil(runHistoricalSync(env, 8));
      }
    }
  }
};