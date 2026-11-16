// NEXUS — versleuteling van back-ups met een wachtwoord (WebCrypto, gratis en lokaal).
//
// Wachtwoord → PBKDF2-SHA-256 (600.000 rondes, willekeurige salt) → AES-GCM 256-bit sleutel.
// Het bestand bevat alleen de versleutelde gegevens plus de parameters die nodig zijn om te
// ontsleutelen; zonder wachtwoord is de inhoud niet te lezen en niet ongemerkt te wijzigen.

export const BACKUP_FORMAT = 'nexus-backup-versleuteld';
export const PBKDF2_ITERATIONS = 600000;
export const MIN_PASSWORD = 8;

const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64(bytes) {
  let bin = '';
  const b = new Uint8Array(bytes);
  for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(bin);
}
function fromB64(s) {
  const bin = atob(String(s));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(password, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export const isEncryptedBackup = (obj) => !!obj && typeof obj === 'object' && obj.format === BACKUP_FORMAT;

/** Versleutel tekst met een wachtwoord. Geeft een JSON-serialiseerbaar object terug. */
export async function encryptText(plain, password) {
  if (String(password || '').length < MIN_PASSWORD) throw new Error(`Kies een wachtwoord van minstens ${MIN_PASSWORD} tekens`);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain));
  return {
    app: 'NEXUS',
    format: BACKUP_FORMAT,
    version: 1,
    createdAt: new Date().toISOString(),
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS, salt: toB64(salt) },
    cipher: { name: 'AES-GCM', iv: toB64(iv) },
    data: toB64(ct),
  };
}

/** Ontsleutel een object van encryptText(). Gooit een duidelijke fout bij een verkeerd wachtwoord. */
export async function decryptText(obj, password) {
  if (!isEncryptedBackup(obj)) throw new Error('Geen versleutelde NEXUS-back-up');
  const it = Number(obj.kdf?.iterations);
  if (obj.kdf?.name !== 'PBKDF2' || obj.cipher?.name !== 'AES-GCM' || !Number.isInteger(it) || it < 100000 || it > 10000000) {
    throw new Error('Onbekend of onveilig back-upformaat');
  }
  const key = await deriveKey(String(password || ''), fromB64(obj.kdf.salt), it);
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(obj.cipher.iv) }, key, fromB64(obj.data));
    return dec.decode(pt);
  } catch (_) {
    throw new Error('Wachtwoord onjuist of bestand beschadigd');
  }
}
