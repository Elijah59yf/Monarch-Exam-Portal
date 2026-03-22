/* Global — Academic Term injection + shared utilities
 *
 * This file is loaded on EVERY page of the portal.
 * It fetches the AcademicTerm from Strapi once, caches in sessionStorage,
 * and injects the label into every `.display-academic-term` element.
 */

const Global = (() => {
  const BASE = 'http://localhost:1337';
  const CACHE_KEY = 'monarch_academic_term';
  const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

  /**
   * Get the academic-term from cache or API.
   * Returns { session, semester } or null.
   */
  async function getAcademicTerm() {
    // Try cache first
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY));
      if (cached && Date.now() - cached._ts < CACHE_TTL) {
        return cached;
      }
    } catch { /* ignore parse errors */ }

    // Fetch from Strapi
    try {
      const res = await fetch(`${BASE}/api/academic-term`, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) return null;

      const json = await res.json();
      const attrs = json.data?.attributes ?? json.data ?? {};
      const term = {
        session: attrs.Session || '',
        semester: attrs.Semester || '',
        _ts: Date.now(),
      };

      // Persist to sessionStorage
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(term));
      return term;
    } catch {
      return null;
    }
  }

  /**
   * Inject "Session - Semester" into every element with class `.display-academic-term`.
   */
  function injectTerm(term) {
    if (!term || (!term.session && !term.semester)) return;

    const label = `${term.session} — ${term.semester}`;
    document.querySelectorAll('.display-academic-term').forEach(el => {
      el.textContent = label;
    });
  }

  /**
   * Boot — called on DOMContentLoaded.
   */
  async function init() {
    const term = await getAcademicTerm();
    if (term) injectTerm(term);
  }

  // Auto-init
  document.addEventListener('DOMContentLoaded', init);

  // Expose for use by other modules (e.g. ResultChecker)
  return { getAcademicTerm, injectTerm };
})();
