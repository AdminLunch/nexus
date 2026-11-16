// NEXUS — optionele synchronisatie via je eigen Claude-account (alleen als NEXUS als
// Claude-artifact draait). Standaard UIT: P0 gaat uit van "alles alleen op dit toestel".
// Aanzetten kan alleen bewust via Instellingen. De opslag is privé per Claude-gebruiker
// (pad data/users/<jouw id>/nexus), maar staat wél buiten dit toestel.
import { getState, setRemoteSaver, adoptRemote } from './store.js';

const cloud = { ref: null, writing: false, dirty: false, timer: null, status: 'off', onRemote: null, visBound: false };
export const SYNC_LABEL = {
  ok: 'Gesynchroniseerd met je Claude-account',
  busy: 'Bezig met synchroniseren…',
  off: 'Alleen op dit toestel opgeslagen',
  err: 'Synchroniseren mislukt — opgeslagen op dit toestel',
};

/** Draait NEXUS in een Claude-artifact met toegang tot de runtime? */
export const inClaude = () => typeof window !== 'undefined' && !!window.claude && typeof window.claude.use === 'function';
export const syncStatus = () => cloud.status;

function setSync(s) {
  cloud.status = s;
  const el = document.getElementById('sync');
  if (!el) return;
  el.hidden = !inClaude();
  el.dataset.s = s;
  el.setAttribute('aria-label', SYNC_LABEL[s]);
  el.title = SYNC_LABEL[s];
}

function readSnap(snap) {
  if (!snap || snap.exists === false) return null;
  const d = typeof snap.data === 'function' ? snap.data() : (snap.data !== undefined ? snap.data : snap);
  return d && typeof d === 'object' && 'json' in d ? d : null;
}

async function writeCloud() {
  if (!cloud.ref) return;
  if (cloud.writing) { cloud.dirty = true; return; }
  cloud.writing = true;
  cloud.dirty = false;
  setSync('busy');
  try {
    const s = getState();
    // De API-sleutel van een eigen model gaat nooit mee naar de cloud.
    const copy = { ...s, settings: { ...s.settings, aiKey: '' } };
    await cloud.ref.set({ json: JSON.stringify(copy), updatedAt: s.updatedAt });
    setSync('ok');
  } catch (e) {
    console.warn('NEXUS: synchroniseren mislukt', e?.name || '');
    setSync('err');
  } finally {
    cloud.writing = false;
    if (cloud.dirty) writeCloud();
  }
}

function schedule() {
  if (!cloud.ref) return;
  clearTimeout(cloud.timer);
  cloud.timer = setTimeout(writeCloud, 900);
}

async function pull() {
  if (!cloud.ref) return;
  const remote = readSnap(await cloud.ref.get());
  const local = getState();
  if (remote && Number(remote.updatedAt) > (local.updatedAt || 0)) {
    const data = JSON.parse(remote.json);
    data.settings = { ...(data.settings || {}), aiKey: local.settings.aiKey || '' };
    adoptRemote(data); // gaat door migratie en typecontrole
    cloud.onRemote?.();
  } else if ((local.updatedAt || 0) > (remote ? Number(remote.updatedAt) : 0)) {
    await writeCloud();
  }
  setSync('ok');
}

/** Start synchronisatie als de gebruiker die heeft aangezet en de Claude-runtime er is. */
export async function initCloud({ onRemote } = {}) {
  cloud.onRemote = onRemote || null;
  if (!inClaude() || !getState().settings.cloudSync) { stopCloud(); return; }
  try {
    const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    const id = db && user ? await user.id() : null;
    if (!id) { setSync('off'); return; }
    cloud.ref = db.collection('data/users/' + id).doc('nexus');
    setSync('busy');
    await Promise.race([pull(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000))]);
    setRemoteSaver(schedule);
    if (!cloud.visBound) {
      cloud.visBound = true;
      document.addEventListener('visibilitychange', () => {
        if (cloud.ref && !document.hidden && !cloud.writing && !document.activeElement?.matches('input, textarea')) pull().catch(() => setSync('err'));
      });
    }
  } catch (e) {
    console.warn('NEXUS: synchronisatie niet beschikbaar', e?.message || '');
    if (cloud.ref) setRemoteSaver(schedule);
    setSync(cloud.ref ? 'err' : 'off');
  }
}

/** Zet synchronisatie uit op dit toestel (gegevens in de cloud blijven staan tot je ze wist). */
export function stopCloud() {
  clearTimeout(cloud.timer);
  cloud.ref = null;
  setRemoteSaver(null);
  setSync('off');
}

/** Wis de kopie in je Claude-account (alleen als die er is). */
export async function deleteCloudCopy() {
  if (!inClaude()) return false;
  const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
  const id = db && user ? await user.id() : null;
  if (!id) return false;
  const ref = db.collection('data/users/' + id).doc('nexus');
  if (typeof ref.delete === 'function') { await ref.delete(); return true; }
  await ref.set({ json: '{}', updatedAt: 0 });
  return true;
}
