// Scorio — Cloudflare Worker بسيط لاختبار مباريات اليوم فقط
//
// المسارات المدعومة:
// /api/matches
// /api/v2/matches/all
// /api/v2/matches/all/
// /api/v2/matches/all//
//
// بدون KV وبدون أي endpoints أخرى.

const ESPN_URL =
  'https://site.web.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function normalizeDate(value) {
  const date = String(value || '').replace(/-/g, '');
  return /^\d{8}$/.test(date) ? date : todayUtc();
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/ping') {
      return new Response('pong', {
        headers: CORS_HEADERS,
      });
    }

    const isMatchesPath =
      path === '/api/matches' ||
      path.startsWith('/api/v2/matches/all');

    if (!isMatchesPath) {
      return json({
        success: false,
        error: 'Not Found',
        path,
        supportedPaths: [
          '/api/matches',
          '/api/v2/matches/all',
          '/api/v2/matches/all/',
          '/api/v2/matches/all//',
        ],
      }, 404);
    }

    const date = normalizeDate(url.searchParams.get('date'));
    const sourceUrl = `${ESPN_URL}?dates=${date}&limit=500`;

    try {
      const response = await fetch(sourceUrl, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 Scorio/1.0',
        },
      });

      const body = await response.text();

      if (!response.ok) {
        return json({
          success: false,
          error: 'ESPN request failed',
          sourceStatus: response.status,
          sourceContentType: response.headers.get('content-type') || '',
          sourcePreview: body.slice(0, 300),
          sourceUrl,
        }, 502);
      }

      let data;
      try {
        data = JSON.parse(body);
      } catch {
        return json({
          success: false,
          error: 'ESPN returned non-JSON data',
          sourceStatus: response.status,
          sourceContentType: response.headers.get('content-type') || '',
          sourcePreview: body.slice(0, 300),
          sourceUrl,
        }, 502);
      }

      const matches = Array.isArray(data.events) ? data.events : [];

      return json({
        success: true,
        date,
        count: matches.length,
        matches,
        sourceUrl,
      });
    } catch (error) {
      return json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sourceUrl,
      }, 502);
    }
  },
};