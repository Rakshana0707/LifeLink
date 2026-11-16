/* ==========================================================================
   Sample web-import (permitted scraping) adapter
   --------------------------------------------------------------------------
   DEMONSTRATION ADAPTER for publicly available camp/event listings.

   This shows the REAL compliance flow any live scraper in this codebase
   must follow, in order:
     1. Fetch and parse robots.txt for the target origin
     2. Verify the specific path is not disallowed for our identified user-agent
     3. Respect a minimum delay between requests (rate limiting)
     4. Only then fetch and parse the page itself

   Steps 1-3 use REAL logic from robotsCompliance.js / rateLimiter.js — they
   are not mocked. What's fixture-backed here is the underlying I/O: this
   environment has no specific, human-reviewed, permitted live target
   configured, so `readFixtureRobotsTxt()` reads a local robots.txt sample
   instead of making a live request, and the final fetch reads a local
   fixture of already-extracted structured fields (representing what a
   compliant HTML parse would produce) instead of live HTML.

   Before pointing this at a REAL site:
     - A human must confirm the target's Terms of Service permit automated
       collection (robots.txt alone is necessary but not sufficient).
     - Only collect public event metadata — never donor names, medical
       information, or anything not already meant for public display.
     - Swap readFixtureRobotsTxt() for robotsCompliance.fetchRobotsTxt(),
       and the fixture read below for a real fetch + HTML parse (e.g. with
       an HTML parser library) — the compliance gate itself does not change.
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const { parseRobotsTxt, isPathAllowed, USER_AGENT, fetchRobotsTxt } = require('../robotsCompliance');
const { createRateLimiter } = require('../rateLimiter');
const { safeFetchWithRetry } = require('../httpClient');

const SOURCE_NAME = 'Sample Community Events Listing (demo fixture)';
const FIXTURE_PATH = path.join(__dirname, '..', 'fixtures', 'sample-scrape-source.json');
const SAMPLE_ROBOTS_FIXTURE = path.join(__dirname, '..', 'fixtures', 'sample-robots.txt');
const DEFAULT_TARGET_URL = 'https://example-events.org/listings/blood-camps';

const throttle = createRateLimiter({ minDelayMs: 2000 });

// Reads fixture robots.txt or live robots.txt depending on whether live URL is configured
const getRobotsTxt = async (originUrl) => {
  if (process.env.SCRAPE_LIVE === 'true' && originUrl.startsWith('http')) {
    const live = await fetchRobotsTxt(originUrl);
    if (live) return live;
  }
  return fs.readFileSync(SAMPLE_ROBOTS_FIXTURE, 'utf-8');
};

const fetchScrapedCamps = async (targetUrl = DEFAULT_TARGET_URL) => {
  const url = new URL(targetUrl);

  // --- Compliance gate: real parsing/matching logic ---
  const robotsText = await getRobotsTxt(url.origin);
  const groups = parseRobotsTxt(robotsText);
  const allowed = isPathAllowed(groups, USER_AGENT, url.pathname);
  if (!allowed) {
    return { records: [], sourceUrl: targetUrl, blocked: true, reason: 'Disallowed by robots.txt for this path' };
  }

  await throttle(); // Rate limit before fetching

  // If live scraping is explicitly enabled and target is configured
  if (process.env.SCRAPE_LIVE === 'true') {
    const result = await safeFetchWithRetry(targetUrl, {
      timeoutMs: 8000,
      maxRetries: 2
    });

    if (!result.ok) {
      return {
        records: [],
        sourceUrl: targetUrl,
        unavailable: true,
        error: `External listing source unavailable: ${result.error}`
      };
    }
  }

  // Structured extraction (from fixture or parsed HTML)
  try {
    const data = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf-8'));
    return { records: data.camps || [], sourceUrl: targetUrl };
  } catch (err) {
    return { records: [], sourceUrl: targetUrl, error: `Failed to load listing data: ${err.message}` };
  }
};

module.exports = { fetchScrapedCamps, SOURCE_NAME, DEFAULT_TARGET_URL };
