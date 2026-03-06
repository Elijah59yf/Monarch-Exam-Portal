/* API — POST to Strapi custom endpoint */

const API = (() => {
  const BASE = 'http://localhost:1337';

  /**
   * Check if the portal is open (CurrentActiveBatch != 0).
   * Returns { open: true, batch: N } or { open: false }.
   */
  async function checkPortalStatus() {
    try {
      const res = await fetch(`${BASE}/api/exam-setting`, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) return { open: true }; // fail-open so the form still shows
      const data = await res.json();
      const batch = data.data?.attributes?.CurrentActiveBatch
                 ?? data.data?.CurrentActiveBatch
                 ?? data.CurrentActiveBatch
                 ?? 1;
      return { open: batch !== 0, batch };
    } catch {
      return { open: true }; // network error → let them try
    }
  }

  async function fetchPassword(matricNo, surname) {
    const res = await fetch(`${BASE}/api/exam-credentials/fetch-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        matricNo: matricNo.trim(),
        surname: surname.trim(),
      }),
    });

    const data = await res.json();

    if (res.ok) {
      return { ok: true, password: data.MoodlePassword || data.password || data.data?.MoodlePassword };
    }

    // Error responses from Strapi
    const msg =
      data.error?.message ||
      data.message ||
      (res.status === 403
        ? 'Your batch is not currently active. Please wait for your scheduled time.'
        : res.status === 404
        ? 'Student not found. Check your Matric Number.'
        : res.status === 401
        ? 'Surname does not match our records.'
        : 'Something went wrong. Please try again.');

    return { ok: false, status: res.status, message: msg };
  }

  /**
   * Fetch all courses from Strapi.
   * Returns the array of course objects.
   */
  async function fetchCourses() {
    try {
      const res = await fetch(`${BASE}/api/courses`);
      if (!res.ok) return [];
      const json = await res.json();
      // Strapi v5 returns { data: [...] }
      return json.data || [];
    } catch {
      return [];
    }
  }

  return { checkPortalStatus, fetchPassword, fetchCourses };
})();
