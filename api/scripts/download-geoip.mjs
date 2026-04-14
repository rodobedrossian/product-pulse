#!/usr/bin/env node
/**
 * Downloads GeoLite2-City.mmdb from MaxMind at container startup.
 * Only downloads if the file doesn't already exist at GEOIP_CITY_DB.
 *
 * Env vars required:
 *   GEOIP_CITY_DB         - absolute path where the .mmdb should be stored
 *   MAXMIND_LICENSE_KEY   - MaxMind license key
 *
 * Skips silently if GEOIP_CITY_DB or MAXMIND_LICENSE_KEY is not set.
 */

import { existsSync, mkdirSync, createWriteStream, unlinkSync } from 'fs'
import { dirname } from 'path'
import https from 'https'
import { execSync } from 'child_process'

const dest = process.env.GEOIP_CITY_DB?.trim()
const licenseKey = process.env.MAXMIND_LICENSE_KEY?.trim()

if (!dest || !licenseKey) {
  console.log('[geoip-dl] GEOIP_CITY_DB or MAXMIND_LICENSE_KEY not set — skipping download.')
  process.exit(0)
}

if (existsSync(dest)) {
  console.log(`[geoip-dl] Found existing database at ${dest} — skipping download.`)
  process.exit(0)
}

const dir = dirname(dest)
mkdirSync(dir, { recursive: true })

const url = `https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key=${licenseKey}&suffix=tar.gz`
const tmpTar = dest + '.tar.gz.tmp'

console.log('[geoip-dl] Downloading GeoLite2-City database...')

function download(urlStr, destPath) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(destPath)
    function fetch(u) {
      https.get(u, (res) => {
        // Follow redirects (3xx)
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          file.destroy()
          // Re-create the write stream for the redirect
          const file2 = createWriteStream(destPath)
          https.get(res.headers.location, (res2) => {
            if (res2.statusCode !== 200) {
              res2.resume()
              file2.close()
              reject(new Error(`HTTP ${res2.statusCode} from redirect`))
              return
            }
            res2.pipe(file2)
            file2.on('finish', () => file2.close(resolve))
            file2.on('error', reject)
          }).on('error', reject)
          return
        }
        if (res.statusCode !== 200) {
          res.resume()
          file.close()
          reject(new Error(`HTTP ${res.statusCode}`))
          return
        }
        res.pipe(file)
        file.on('finish', () => file.close(resolve))
        file.on('error', reject)
      }).on('error', reject)
    }
    fetch(urlStr)
  })
}

await download(url, tmpTar)

// Extract everything with strip-components=1 (removes dated top-level dir)
execSync(`tar -xzf "${tmpTar}" -C "${dir}" --strip-components=1`)

try { unlinkSync(tmpTar) } catch { /* ignore */ }

// Find the extracted .mmdb file
const { readdirSync, renameSync } = await import('fs')
const mmdbFile = readdirSync(dir).find((f) => f.endsWith('.mmdb'))
if (!mmdbFile) {
  console.error('[geoip-dl] No .mmdb file found after extraction')
  process.exit(1)
}

const extracted = dir + '/' + mmdbFile
if (extracted !== dest) {
  renameSync(extracted, dest)
}

console.log(`[geoip-dl] Database saved to ${dest}`)
