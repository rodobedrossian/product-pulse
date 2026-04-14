import maxmind from 'maxmind'

let readerPromise

async function openReader() {
  const path = process.env.GEOIP_CITY_DB?.trim()
  if (!path) return null
  try {
    return await maxmind.open(path)
  } catch (e) {
    console.error('[geoip] GeoLite2 open failed:', e?.message || e)
    return null
  }
}

/**
 * Shared reader for GeoLite2-City.mmdb (set GEOIP_CITY_DB).
 * @returns {Promise<import('maxmind').Reader<import('maxmind').CityResponse> | null>}
 */
export async function getGeoReader() {
  if (readerPromise === undefined) {
    readerPromise = openReader()
  }
  return readerPromise
}

/**
 * English display names for country and first subdivision (e.g. US state).
 * @param {string | null | undefined} ip
 * @returns {Promise<{ country: string | null, region: string | null } | null>}
 */
export async function lookupCountryRegion(ip) {
  if (ip == null || typeof ip !== 'string') return null
  const trimmed = ip.trim()
  if (!trimmed) return null

  const reader = await getGeoReader()
  if (!reader) return null

  try {
    const rec = reader.get(trimmed)
    if (!rec) return null
    const country = rec.country?.names?.en ?? null
    const region = rec.subdivisions?.[0]?.names?.en ?? null
    if (!country && !region) return null
    return { country, region }
  } catch {
    return null
  }
}

/**
 * After HTTP response is sent: update participant row from IP (non-blocking, never throws to caller).
 * @param {import('@supabase/supabase-js').SupabaseClient} adminDb
 * @param {{ test_id: string, tid: string, ip: string | null }} args
 */
export function scheduleParticipantGeoUpdate(adminDb, { test_id, tid, ip }) {
  if (!ip || !test_id || !tid) return

  setImmediate(() => {
    lookupCountryRegion(ip)
      .then((loc) => {
        if (!loc || (!loc.country && !loc.region)) return
        return adminDb
          .from('participants')
          .update({
            country: loc.country ?? null,
            region: loc.region ?? null
          })
          .eq('test_id', test_id)
          .eq('tid', tid)
      })
      .then((result) => {
        if (result?.error) console.error('[geoip] Participant update failed:', result.error.message)
      })
      .catch((e) => {
        console.error('[geoip] Async geo update error:', e?.message || e)
      })
  })
}
