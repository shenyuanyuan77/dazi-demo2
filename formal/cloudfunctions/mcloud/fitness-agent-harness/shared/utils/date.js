function pad(value) {
  return String(value).padStart(2, "0");
}

function todayKey(now) {
  const date = now instanceof Date ? now : new Date();
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDaysKey(offset, now) {
  const date = now instanceof Date ? new Date(now.getTime()) : new Date();
  date.setDate(date.getDate() + Number(offset || 0));
  return todayKey(date);
}

function isoNow(now) {
  return (now instanceof Date ? now : new Date()).toISOString();
}

function expiresInMinutes(minutes, now) {
  const date = now instanceof Date ? new Date(now.getTime()) : new Date();
  date.setMinutes(date.getMinutes() + Number(minutes || 0));
  return date.toISOString();
}

function isExpired(expiresAt, now) {
  if (!expiresAt) return false;
  const expires = new Date(expiresAt).getTime();
  if (!Number.isFinite(expires)) return true;
  const current = now instanceof Date ? now.getTime() : Date.now();
  return expires <= current;
}

module.exports = {
  addDaysKey,
  expiresInMinutes,
  isExpired,
  isoNow,
  todayKey
};
