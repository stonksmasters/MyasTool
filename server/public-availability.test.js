import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAvailabilityQuery, searchSquareAvailability } from './public-availability.js';

test('rejects invalid, excessive and past date ranges', () => {
  const now = Date.parse('2026-11-11T12:00:00Z');
  const validate = q => validateAvailabilityQuery(new URLSearchParams(q), now);
  assert.ok(validate('serviceIds=abc&from=2026-02-30&to=2026-03-02').error);
  assert.ok(validate('serviceIds=abc&from=2026-11-12&to=2026-11-25').error);
  assert.ok(validate('serviceIds=abc,def&from=2026-11-12&to=2026-11-13').error);
  assert.ok(validate('serviceIds=abc&from=2026-10-01&to=2026-10-02').error);
  assert.deepEqual(validate('serviceIds=abc&from=2026-11-12&to=2026-11-14'), {
    serviceVariationId: 'abc', from: '2026-11-12', to: '2026-11-14',
  });
});

test('calls Square live availability without returning private team or customer details', async () => {
  let request;
  const square = async (path, body) => {
    request = { path, body };
    return { availabilities: [{
      start_at: '2026-11-12T16:00:00Z', team_member_id: 'private-staff',
      appointment_segments: [{ duration_minutes: 45, team_member_id: 'private-staff' }],
    }] };
  };
  const result = await searchSquareAvailability({
    square, locationId: 'salon', teamMemberId: 'staff', serviceVariationId: 'variation',
    from: '2026-11-12', to: '2026-11-13', timezone: 'America/Chicago',
  });
  assert.equal(request.path, '/v2/bookings/availability/search');
  assert.equal(request.body.query.filter.location_id, 'salon');
  assert.deepEqual(request.body.query.filter.start_at_range, { start_at: '2026-11-12T06:00:00.000Z', end_at: '2026-11-13T06:00:00.000Z' });
  assert.equal(request.body.query.filter.segment_filters[0].service_variation_id, 'variation');
  assert.deepEqual(result, { timezone: 'America/Chicago', slots: [{
    startAt: '2026-11-12T16:00:00Z', durationMinutes: 45,
  }] });
  assert.equal(JSON.stringify(result).includes('private'), false);
});


test('Square search handles daylight saving boundaries in the salon timezone', async () => {
  let range;
  await searchSquareAvailability({
    square: async (_path, body) => { range = body.query.filter.start_at_range; return { availabilities: [] }; },
    locationId: 'salon', teamMemberId: 'staff', serviceVariationId: 'variation',
    from: '2026-11-01', to: '2026-11-02', timezone: 'America/Chicago',
  });
  assert.deepEqual(range, { start_at: '2026-11-01T05:00:00.000Z', end_at: '2026-11-02T06:00:00.000Z' });
});
