function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toInt(value, fallback = null) {
  const number = parseInt(value, 10);
  return Number.isInteger(number) ? number : fallback;
}

function toRequiredInt(value, label) {
  const number = toInt(value);
  if (number == null) throw new Error(`${label} is required.`);
  return number;
}

function toDate(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function toRequiredDate(value, label) {
  const date = toDate(value);
  if (!date) throw new Error(`${label} is required.`);
  return date;
}

function text(value, fallback = '') {
  if (value == null) return fallback;
  return String(value).trim();
}

module.exports = {
  toNumber,
  toInt,
  toRequiredInt,
  toDate,
  toRequiredDate,
  text
};
