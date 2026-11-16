/* ==========================================================================
   Safe HTTP Client for Ingestion Adapters
   --------------------------------------------------------------------------
   Provides:
     - Configurable request timeouts (default 8000ms)
     - Safe retry limits with exponential backoff
     - Safe error isolation (never crashes the ingestion pipeline or server)
     - Respects HTTP status codes & abort signals
   ========================================================================== */

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch a remote URL with built-in timeout, status validation, and retries.
 *
 * @param {string} url
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=8000]
 * @param {number} [opts.maxRetries=2]
 * @param {Record<string, string>} [opts.headers]
 * @returns {Promise<{ ok: boolean, status: number, data?: any, text?: string, error?: string }>}
 */
const safeFetchWithRetry = async (url, opts = {}) => {
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
  const maxRetries = opts.maxRetries !== undefined ? opts.maxRetries : DEFAULT_MAX_RETRIES;
  const headers = {
    'User-Agent': 'LifeLinkCampBot/1.0 (+https://lifelink.example/about/bot; contact=devs@lifelink.example)',
    Accept: 'application/json, text/html, */*',
    ...(opts.headers || {})
  };

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        headers,
        signal: controller.signal
      });
      clearTimeout(timer);

      if (response.status >= 500 && attempt < maxRetries) {
        // Server error: retry with backoff
        await sleep(INITIAL_BACKOFF_MS * Math.pow(2, attempt));
        continue;
      }

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: `HTTP ${response.status}: ${response.statusText || 'Request failed'}`
        };
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await response.json();
        return { ok: true, status: response.status, data };
      }

      const text = await response.text();
      return { ok: true, status: response.status, text };
    } catch (err) {
      clearTimeout(timer);
      const isAbort = err.name === 'AbortError' || err.code === 20;
      lastError = isAbort ? `Request timed out after ${timeoutMs}ms` : err.message;

      if (attempt < maxRetries) {
        await sleep(INITIAL_BACKOFF_MS * Math.pow(2, attempt));
      }
    }
  }

  return {
    ok: false,
    status: 0,
    error: lastError || 'Network request failed'
  };
};

module.exports = {
  safeFetchWithRetry,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_RETRIES
};
