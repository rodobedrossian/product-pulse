# Participant IP geolocation (GeoLite2)

Product Pulse derives **country** and **region** (e.g. US state) from the participant `ip` stored on observational auto-session. No browser geolocation API is used.

## Requirements

1. **MaxMind GeoLite2 City** (free): create an account at [MaxMind](https://www.maxmind.com/en/geolite2/signup), accept the GeoLite2 EULA, and download **GeoLite2-City.mmdb** (update monthly).
2. **Environment variable** on the API host (e.g. Railway):

   `GEOIP_CITY_DB=/absolute/path/to/GeoLite2-City.mmdb`

   Railway options: bake the file into the deploy artifact, attach a volume, or run a build step that downloads the DB using `MAXMIND_ACCOUNT_ID` and `MAXMIND_LICENSE_KEY` (do not commit the `.mmdb` to public git if you want to respect redistribution terms).

3. **Database**: apply migration `019_participant_region.sql` so `participants.region` exists.

## Runtime behavior

- On `POST /api/tests/:id/auto-session`, the API responds with `tid` immediately, then **asynchronously** updates `country` / `region`. Failures are logged only; participants are still created if the DB file is missing.
- **Directed** participants are not enriched (no reliable client IP on that path).

## Backfill existing rows

From the `api/` directory, with `.env` loaded (Supabase service role + `GEOIP_CITY_DB`):

```bash
npm run backfill:geo
```

Dry run:

```bash
node scripts/backfill-participant-geo.mjs --dry-run
```

## Attribution

GeoLite2 requires [attribution](https://dev.maxmind.com/geoip/geolite2-free-geolocation-data) in your product or privacy materials (e.g. “This product includes GeoLite2 data created by MaxMind, available from https://www.maxmind.com.”).
