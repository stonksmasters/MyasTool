import { validateAvailabilityQuery, searchSquareAvailability } from '../../../../../server/public-availability.js';

const ALLOWED_ORIGINS = new Set([
  'https://mk-manikure-lounge.vercel.app',
  ...(process.env.MK_LOUNGE_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean),
]);

function respond(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

function settings(env) {
  const required = ['SQUARE_PUBLIC_ACCESS_TOKEN', 'SQUARE_PUBLIC_LOCATION_ID', 'SQUARE_PUBLIC_TEAM_MEMBER_ID', 'SQUARE_PUBLIC_TIMEZONE', 'SQUARE_PUBLIC_SERVICES'];
  if (required.some(key => !env[key])) return null;
  let services;
  try { services = JSON.parse(env.SQUARE_PUBLIC_SERVICES); }
  catch { return null; }
  if (!services || typeof services !== 'object' || Array.isArray(services)) return null;
  return { services, locationId: env.SQUARE_PUBLIC_LOCATION_ID, teamMemberId: env.SQUARE_PUBLIC_TEAM_MEMBER_ID, timezone: env.SQUARE_PUBLIC_TIMEZONE };
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return respond(res, origin && ALLOWED_ORIGINS.has(origin) ? 204 : 403, {});
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return respond(res, 405, { error: { code: 'METHOD_NOT_ALLOWED' } });
  }
  const url = new URL(req.url, 'https://myas-tool.vercel.app');
  const slug = req.query?.publicSlug || url.pathname.match(/\/organizations\/([^/]+)\/availability/)?.[1];
  if (slug !== 'mk-manikure-lounge') return respond(res, 404, { error: { code: 'ORGANIZATION_NOT_FOUND' } });
  const validated = validateAvailabilityQuery(url.searchParams);
  if (validated.error) return respond(res, 400, { error: { code: 'INVALID_AVAILABILITY_QUERY', message: validated.error } });
  const config = settings(process.env);
  if (!config) return respond(res, 503, { error: { code: 'SQUARE_AVAILABILITY_NOT_CONFIGURED' } });
  const variationId = config.services[validated.serviceVariationId];
  if (typeof variationId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(variationId)) {
    return respond(res, 404, { error: { code: 'SERVICE_NOT_PUBLISHED' } });
  }
  try {
    const square = async (path, body) => {
      const base = process.env.SQUARE_ENVIRONMENT === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';
      const response = await fetch(base + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Square-Version': '2026-09-16', Authorization: 'Bearer ' + process.env.SQUARE_PUBLIC_ACCESS_TOKEN },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error('Square availability unavailable');
      return response.json();
    };
    const data = await searchSquareAvailability({ square, locationId: config.locationId, teamMemberId: config.teamMemberId, timezone: config.timezone, serviceVariationId: variationId, from: validated.from, to: validated.to });
    return respond(res, 200, { data: { serviceId: validated.serviceVariationId, ...data } });
  } catch {
    return respond(res, 503, { error: { code: 'SQUARE_AVAILABILITY_UNAVAILABLE' } });
  }
}
