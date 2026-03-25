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
      const courses = json.data || [];
      // Filter out hidden courses
      return courses.filter(course => !(course.Hidden === true || course.attributes?.Hidden === true));
    } catch {
      return [];
    }
  }

  /**
   * Two-step result lookup via Master PIN.
   *
   * Step 1 — Validate MasterPIN against StudentProfile.
   * Step 2 — Fetch published ExamResults by the resolved MatricNumber.
   *
   * Returns:
   *   { ok: true,  results: [...], matricNumber }
   *   { ok: false, message: '...' }
   */
  async function fetchResult(pin) {
    // ── Step 1: Resolve MasterPIN → MatricNumber ──
    const profileUrl =
      `${BASE}/api/student-profiles?filters[MasterPIN][$eq]=${encodeURIComponent(pin.trim())}`;

    const profileRes = await fetch(profileUrl, {
      headers: { 'Content-Type': 'application/json' },
    });
    const profileData = await profileRes.json();

    if (!profileRes.ok || !profileData.data || profileData.data.length === 0) {
      return { ok: false, message: 'Invalid Master PIN.' };
    }

    const profile = profileData.data[0].attributes ?? profileData.data[0];
    const matricNumber = profile.MatricNumber;

    // ── Step 2: Fetch published results for this student ──
    const resultsUrl =
      `${BASE}/api/exam-results?filters[MatricNumber][$eq]=${encodeURIComponent(matricNumber)}&filters[IsPublished][$eq]=true`;

    const resultsRes = await fetch(resultsUrl, {
      headers: { 'Content-Type': 'application/json' },
    });
    const resultsData = await resultsRes.json();

    if (!resultsRes.ok) {
      return { ok: false, message: 'Could not retrieve results. Please try again.' };
    }

    if (!resultsData.data || resultsData.data.length === 0) {
      return { ok: false, message: 'No published results found for your profile yet.' };
    }

    // Map the array — one entry per course
    const results = resultsData.data.map(entry => {
      const attrs = entry.attributes ?? entry;
      return {
        courseCode: attrs.CourseCode,
        score: attrs.FinalScore,
      };
    });

    return { ok: true, results, matricNumber };
  }

  return { checkPortalStatus, fetchPassword, fetchCourses, fetchResult };
})();
