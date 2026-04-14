#!/usr/bin/env node
/**
 * One-off: fill participants.country / participants.region from participants.ip
 * using GeoLite2-City (GEOIP_CITY_DB). Requires same env as API (Supabase service role).
 *
 * Usage (from api/):  node scripts/backfill-participant-geo.mjs
 * Dry run:            node scripts/backfill-participant-geo.mjs --dry-run
 */
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import adminDb from '../src/db-admin.js'
import { lookupCountryRegion } from '../src/lib/geoIp.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '../.env') })

const dryRun = process.argv.includes('--dry-run')
const PAGE = 300

async function main() {
  if (!process.env.GEOIP_CITY_DB?.trim()) {
    console.error('GEOIP_CITY_DB is not set — download GeoLite2-City.mmdb and set the path.')
    process.exit(1)
  }

  let updated = 0
  let skippedNoGeo = 0
  let scanned = 0
  let offset = 0

  for (;;) {
    const { data, error } = await adminDb
      .from('participants')
      .select('id, test_id, tid, ip, country, region')
      .not('ip', 'is', null)
      .or('country.is.null,region.is.null')
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)

    if (error) {
      console.error(error)
      process.exit(1)
    }
    if (!data?.length) break

    for (const row of data) {
      scanned++
      const loc = await lookupCountryRegion(row.ip)
      if (!loc || (!loc.country && !loc.region)) {
        skippedNoGeo++
        continue
      }
      if (dryRun) {
        updated++
        continue
      }
      const { error: upErr } = await adminDb
        .from('participants')
        .update({
          country: loc.country ?? null,
          region: loc.region ?? null
        })
        .eq('id', row.id)
      if (upErr) console.error('Update failed', row.id, upErr.message)
      else updated++
    }

    if (data.length < PAGE) break
    offset += PAGE
    await new Promise((r) => setTimeout(r, 40))
  }

  if (dryRun) {
    console.log(`[dry-run] rows with resolvable geo: ${updated}; scanned: ${scanned}; no mmdb match: ${skippedNoGeo}`)
  } else {
    console.log(`Updated ${updated}; scanned ${scanned}; no mmdb match: ${skippedNoGeo}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
