/**
 * AI-powered event taxonomy service.
 * Takes raw interaction data from a test and generates named semantic event definitions
 * using GPT-4o-mini — similar to Amplitude/Mixpanel named events but auto-generated.
 *
 * Design principles (mirrors insights.js):
 * - temperature: 0 — deterministic, reproducible output
 * - json_schema response_format — typed output, no regex parsing
 * - Pure function — no DB access; caller handles persistence
 */
import OpenAI from 'openai'

const SYSTEM_PROMPT = `You are a UX analytics assistant. Your job is to identify semantically distinct user actions from raw click and input interaction data collected during prototype usability tests.

Given a ranked list of top interactions (each with event type, visible element text, CSS selector, page URL, and occurrence count), generate a set of named event definitions that describe meaningful user actions in plain language.

RULES FOR NAMES:
1. Names must be 3–8 words, action-oriented, written from the user's perspective.
2. For clicks: start with a verb — "Clicked …", "Opened …", "Selected …", "Switched to …", "Expanded …".
3. For input changes: use a noun phrase — "Typed in Search field", "Changed Date filter".
4. Names must be human-readable and meaningful to someone who hasn't seen the prototype.
5. Do NOT use technical terms like "onClick", "div", "span", "element", "button ID".

RULES FOR PATTERNS:
6. text_pattern: set to the most distinctive 2–6 word substring from the element's visible text. Set to null if the text is generic ("Submit", "OK", "Click here") or if there is no text.
7. selector_pattern: set ONLY when the CSS selector contains a meaningful semantic identifier (e.g. data attribute like [data-tab="1Y"], a descriptive class like .timeframe-btn). Set to null for auto-generated or noisy selectors (long chains, random IDs, utility classes).
8. url_pattern: set to a distinctive URL path segment when the URL meaningfully identifies a page or section (e.g. "/checkout", "/settings"). Set to null if all interactions happen on the same URL or if the URL is too generic.
9. At least one of text_pattern, selector_pattern, url_pattern must be non-null per definition.

RULES FOR TAXONOMY:
10. Return between 3 and 15 definitions. Prioritise high-count interactions.
11. Do not create duplicate or near-duplicate definitions for the same element.
12. Each definition must correspond to one distinct user intention — not a raw technical element.
13. If two interactions clearly represent the same action (e.g. clicking the same button that appears on multiple pages), merge them into one definition using the shared text_pattern or selector_pattern.
14. Return an empty definitions array if the interactions are too generic to name meaningfully.`

const RESPONSE_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'event_taxonomy',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        definitions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name:             { type: 'string' },
              description:      { type: 'string' },
              type:             { type: 'string', enum: ['click', 'input_change'] },
              selector_pattern: { type: ['string', 'null'] },
              text_pattern:     { type: ['string', 'null'] },
              url_pattern:      { type: ['string', 'null'] },
            },
            required: ['name', 'description', 'type', 'selector_pattern', 'text_pattern', 'url_pattern'],
            additionalProperties: false,
          },
        },
      },
      required: ['definitions'],
      additionalProperties: false,
    },
  },
}

let _openai = null
function getOpenAI() {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set — cannot generate event taxonomy')
    }
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return _openai
}

/**
 * Generate named event definitions from raw interaction data.
 *
 * @param {{ interactions: Array<{rank:number, type:string, text:string, selector:string, url:string, count:number}> }} opts
 * @returns {Promise<Array<{name:string, description:string, type:string, selector_pattern:string|null, text_pattern:string|null, url_pattern:string|null}>>}
 */
export async function generateEventTaxonomy({ interactions }) {
  if (!interactions?.length) return []

  const userContent = `Top interactions for this test (sorted by frequency):\n${JSON.stringify(interactions, null, 2)}`

  const response = await getOpenAI().chat.completions.create({
    model:           'gpt-4o-mini',
    temperature:     0,
    max_tokens:      2048,
    response_format: RESPONSE_SCHEMA,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: userContent },
    ],
  })

  let parsed
  try {
    parsed = JSON.parse(response.choices[0].message.content)
  } catch {
    throw new Error('[eventTaxonomy] GPT response was not valid JSON')
  }

  const raw = parsed?.definitions
  if (!Array.isArray(raw)) return []

  // Post-parse validation: filter and sanitise
  return raw
    .filter((d) => {
      if (!d.name?.trim()) return false
      // At least one non-empty pattern required
      const hasPattern = (d.text_pattern?.trim()) || (d.selector_pattern?.trim()) || (d.url_pattern?.trim())
      return !!hasPattern
    })
    .map((d) => ({
      name:             String(d.name).slice(0, 100).trim(),
      description:      d.description ? String(d.description).slice(0, 300).trim() : null,
      type:             d.type === 'input_change' ? 'input_change' : 'click',
      text_pattern:     d.text_pattern?.trim()     || null,
      selector_pattern: d.selector_pattern?.trim() || null,
      url_pattern:      d.url_pattern?.trim()      || null,
    }))
}
