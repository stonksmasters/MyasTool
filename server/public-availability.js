// Square's live availability is authoritative; never derive public slots from private bookings.
export const AVAILABILITY_SCOPES = ['APPOINTMENTS_READ', 'ITEMS_READ'];

export function validateAvailabilityQuery(query, now = Date.now()) {
  const serviceIds = (query.get('serviceIds') || '').split(',').filter(Boolean);
  const from = query.get('from'), to = query.get('to');
  if (serviceIds.length !== 1 || !/^[A-Za-z0-9_-]{1,128}$/.test(serviceIds[0])) {
    return { error: 'Select one published Square service variation.' };
  }
  const validDate = value => {
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(value || '')) return false;
    const date = new Date(value + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  if (!validDate(from) || !validDate(to)) return { error: 'Provide valid from and to dates.' };
  const days = (Date.parse(to) - Date.parse(from)) / 86400000;
  if (days < 1 || days > 7) return { error: 'Availability range must be 1–7 days (exclusive end date).' };
  if (Date.parse(to) < now - 86400000) return { error: 'Availability range has passed.' };
  return { serviceVariationId: serviceIds[0], from, to };
}

export async function searchSquareAvailability({ square, locationId, serviceVariationId, from, to, teamMemberId, timezone }) {
  if (!locationId || !teamMemberId || !timezone) throw new Error('Square location, team member and timezone must be configured.');
  // The public service ID must be resolved against a server-maintained published catalog
  // before invoking this function. Never accept arbitrary provider IDs as authorization.
  const response = await square('/v2/bookings/availability/search', {
    query: {
      filter: {
        location_id: locationId,
        start_at_range: { start_at: from, end_at: to },
        segment_filters: [{ service_variation_id: serviceVariationId, team_member_id_filter: { any: [teamMemberId] } }],
      },
    },
  });
  return {
    timezone,
    slots: (response.availabilities || []).filter(slot => slot.start_at && slot.appointment_segments?.length)
      .map(slot => ({
        startAt: slot.start_at,
        durationMinutes: slot.appointment_segments.reduce((sum, segment) => sum + (segment.duration_minutes || 0), 0),
      })),
  };
}
