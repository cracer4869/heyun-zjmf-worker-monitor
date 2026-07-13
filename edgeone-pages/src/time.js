function partValue(parts, type) {
  return parts.find((part) => part.type === type)?.value || '';
}

export function localDateParts(date = new Date(), timeZone = 'UTC') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  return {
    dateKey: `${partValue(parts, 'year')}-${partValue(parts, 'month')}-${partValue(parts, 'day')}`,
    hour: Number(partValue(parts, 'hour')),
    minute: Number(partValue(parts, 'minute')),
  };
}

export function nowSeconds(date = new Date()) {
  return Math.floor(date.getTime() / 1000);
}
