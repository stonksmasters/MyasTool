# MK Lounge public availability API

Endpoint (on the deployed MyasTool backend):

`GET /api/public/v1/organizations/mk-manikure-lounge/availability?serviceIds=manicure&from=2026-11-16&to=2026-11-23`

Dates are salon-local calendar dates, with an **exclusive** `to` date; maximum 7 days. `serviceIds` currently accepts exactly one published frontend service key.

Successful response:

```json
{"data":{"serviceId":"manicure","timezone":"America/Chicago","slots":[{"startAt":"2026-11-16T16:00:00Z","durationMinutes":45}]}}
```

Failure codes: `INVALID_AVAILABILITY_QUERY` (400), `SERVICE_NOT_PUBLISHED` (404), `SQUARE_AVAILABILITY_NOT_CONFIGURED` (503), `SQUARE_AVAILABILITY_UNAVAILABLE` (503). Do not render fabricated slots on errors.

## Vercel backend environment

Configure **server-side only** in the MyasTool deployment (never in the frontend):

- `SQUARE_ENVIRONMENT=production` (or `sandbox` during testing)
- `SQUARE_PUBLIC_ACCESS_TOKEN`: a Square access token with Bookings availability permissions, held in the backend only
- `SQUARE_PUBLIC_LOCATION_ID`: authorized Square location
- `SQUARE_PUBLIC_TEAM_MEMBER_ID`: bookable Square team member
- `SQUARE_PUBLIC_TIMEZONE=America/Chicago` (confirm actual Square location timezone)
- `SQUARE_PUBLIC_SERVICES={"manicure":"SQUARE_VARIATION_ID"}`: allowlisted public service keys mapped to Square service variation IDs
- `MK_LOUNGE_ALLOWED_ORIGINS`: optional comma-separated additional *exact* frontend origins (production MK Lounge is preallowed)

## Frontend integration

```js
const url = new URL('https://YOUR-MYASTOOL-DEPLOYMENT/api/public/v1/organizations/mk-manikure-lounge/availability');
url.search = new URLSearchParams({ serviceIds: 'manicure', from: '2026-11-16', to: '2026-11-23' });
const response = await fetch(url);
if (!response.ok) throw new Error('Live booking availability is temporarily unavailable');
const { data } = await response.json();
// Show data.slots in data.timezone; do not assume these times are reserved.
```

**Important:** This is a transitional **read-only** backend contract. The token environment variable is not a durable OAuth connection: tokens can expire/revoke. Before production launch, replace it with workspace-owned encrypted OAuth persistence and automatic refresh. Do not put an OAuth refresh token into frontend code or a public API. A returned slot is not a hold; Square must revalidate it when confirming the booking. Verify the seller's Bookings permissions, subscription and real availability in production. This API currently supports a single selected service and a single team member, not combined services or multi-staff schedules.
