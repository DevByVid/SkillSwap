// Calendar integration (REQ-12, Experiment 8 "Calendar Integration Interface").
// Without Google API credentials we build a Google Calendar "add event" link and an
// event id, which is what the backend stores as the scheduling confirmation.
const crypto = require('crypto');

function fmt(d) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function createEvent({ title, details, start, durationHours, location }) {
  const startDate = new Date(start);
  const endDate = new Date(startDate.getTime() + Number(durationHours) * 3600 * 1000);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    details,
    location: location || '',
    dates: `${fmt(startDate)}/${fmt(endDate)}`,
  });
  return {
    eventId: 'evt_' + crypto.randomBytes(6).toString('hex'),
    url: `https://calendar.google.com/calendar/render?${params.toString()}`,
  };
}

module.exports = { createEvent };
