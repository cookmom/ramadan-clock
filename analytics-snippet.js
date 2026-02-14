// ── Analytics (paste inside <script>, replace SUPABASE_URL and SUPABASE_ANON_KEY) ──

const SUPA_URL = 'YOUR_SUPABASE_URL';
const SUPA_KEY = 'YOUR_SUPABASE_ANON_KEY';

async function supaInsert(table, data) {
  try {
    await fetch(`${SUPA_URL}/rest/v1/${table}`, {
      method: 'POST', headers: {
        'Content-Type': 'application/json',
        'apikey': SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`,
        'Prefer': 'return=minimal'
      }, body: JSON.stringify(data)
    });
  } catch(e) { /* silent fail — never break the clock */ }
}

// Fingerprint: hash of screen + timezone + language (no PII)
async function visitorHash() {
  const raw = [screen.width, screen.height, screen.colorDepth,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language, navigator.hardwareConcurrency].join('|');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

function detectOS() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac/.test(ua)) return 'macOS';
  if (/Win/.test(ua)) return 'Windows';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Other';
}

function detectDevice() {
  const w = screen.width;
  if (w < 768) return 'mobile';
  if (w < 1024) return 'tablet';
  return 'desktop';
}

let analyticsSessionId = null;
let analyticsStart = Date.now();

async function startAnalytics() {
  const hash = await visitorHash();
  const isRam = document.getElementById('ramLabel')?.textContent?.includes('RAMADAN');
  const data = {
    visitor_hash: hash,
    city: S.city || null,
    country: S.country || null,
    lat_round: null, // filled if we have coords
    lon_round: null,
    device_type: detectDevice(),
    screen_w: screen.width,
    screen_h: screen.height,
    os: detectOS(),
    browser: /Chrome/.test(navigator.userAgent) ? 'Chrome' :
             /Safari/.test(navigator.userAgent) ? 'Safari' :
             /Firefox/.test(navigator.userAgent) ? 'Firefox' : 'Other',
    dial: S.dial,
    numerals: S.numerals,
    is_ramadan: isRam || false,
    duration_s: 0
  };

  // Get rounded coords if available
  if (navigator.geolocation) {
    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { maximumAge: 300000 }));
      data.lat_round = Math.round(pos.coords.latitude * 10) / 10;
      data.lon_round = Math.round(pos.coords.longitude * 10) / 10;
    } catch(e) {}
  }

  // Insert session
  const resp = await fetch(`${SUPA_URL}/rest/v1/clock_sessions`, {
    method: 'POST', headers: {
      'Content-Type': 'application/json',
      'apikey': SUPA_KEY,
      'Authorization': `Bearer ${SUPA_KEY}`,
      'Prefer': 'return=representation'
    }, body: JSON.stringify(data)
  });
  const rows = await resp.json();
  if (rows?.[0]?.id) analyticsSessionId = rows[0].id;
}

// Update duration every 60s
setInterval(() => {
  if (!analyticsSessionId) return;
  const dur = Math.round((Date.now() - analyticsStart) / 1000);
  supaInsert('session_updates', {
    session_id: analyticsSessionId,
    duration_s: dur,
    dial: S.dial
  });
}, 60000);

// Final duration on page unload
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && analyticsSessionId) {
    const dur = Math.round((Date.now() - analyticsStart) / 1000);
    navigator.sendBeacon?.(`${SUPA_URL}/rest/v1/session_updates`, JSON.stringify({
      session_id: analyticsSessionId, duration_s: dur, dial: S.dial
    }));
  }
});

// Start after clock loads (delay to not block prayer fetch)
setTimeout(startAnalytics, 3000);
