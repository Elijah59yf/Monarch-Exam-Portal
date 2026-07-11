/* API: calls to the Strapi backend */

const API = (() => {
  const BASE = 'http://localhost:1337';

  /**
   * Check if the portal is open (CurrentActiveBatch != 0) and read display
   * settings off the same ExamSetting single type.
   * Returns { open: true, batch: N, categoriesExpandedByDefault: bool }.
   */
  async function checkPortalStatus() {
    try {
      const res = await fetch(`${BASE}/api/exam-setting`, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) return { open: true, categoriesExpandedByDefault: false }; // fail-open so the form still shows
      const data = await res.json();
      const batch = data.data?.attributes?.CurrentActiveBatch
                 ?? data.data?.CurrentActiveBatch
                 ?? data.CurrentActiveBatch
                 ?? 1;
      const categoriesExpandedByDefault = data.data?.attributes?.CategoriesExpandedByDefault
                 ?? data.data?.CategoriesExpandedByDefault
                 ?? data.CategoriesExpandedByDefault
                 ?? false;
      return { open: batch !== 0, batch, categoriesExpandedByDefault: !!categoriesExpandedByDefault };
    } catch {
      return { open: true, categoriesExpandedByDefault: false }; // network error → let them try
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
   * Fire-and-forget: ask the backend to email a backup copy of the password
   * to the address on the student's registration. This is a convenience only.
   * It must never block or affect the on-screen reveal, so it swallows every
   * error. The backend endpoint queues the send through the email provider.
   */
  function sendPasswordBackup(matricNo, surname) {
    try {
      fetch(`${BASE}/api/exam-credentials/email-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matricNo: matricNo.trim(),
          surname: surname.trim(),
        }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* never surface backup-email failures to the student */
    }
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
   * Start a promo checkout: ask the backend to reserve promo pricing for the
   * cart. Returns the authoritative pricing (per-course lines + total) plus any
   * reservation tokens to hand to /register. Courses whose promo slot is gone
   * come back as promo:false at their normal price.
   *
   * Returns { ok, lines, totalNaira, expiresAt } or { ok:false, message }.
   */
  async function reservePromo(courseIds, matricNo) {
    try {
      const res = await fetch(`${BASE}/api/promo-reservations/reserve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseIds, matricNo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, message: data.error?.message || 'Could not lock in your pricing. Please try again.' };
      }
      return { ok: true, ...data };
    } catch {
      return { ok: false, message: 'Network error while reserving your promo price. Please try again.' };
    }
  }

  /**
   * Two-step result lookup via Result PIN.
   *
   * Step 1: Validate ResultPIN against StudentProfile.
   * Step 2: Fetch published ExamResults by the resolved MatricNumber.
   *
   * Returns:
   *   { ok: true,  results: [...], matricNumber }
   *   { ok: false, message: '...' }
   */
  async function fetchResult(pin) {
    // ── Step 1: Resolve ResultPIN → MatricNumber ──
    const profileUrl =
      `${BASE}/api/student-profiles?filters[ResultPIN][$eq]=${encodeURIComponent(pin.trim())}`;

    const profileRes = await fetch(profileUrl, {
      headers: { 'Content-Type': 'application/json' },
    });
    const profileData = await profileRes.json();

    if (!profileRes.ok || !profileData.data || profileData.data.length === 0) {
      return { ok: false, message: 'Invalid Result PIN.' };
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

    // Map the array: one entry per course
    const results = resultsData.data.map(entry => {
      const attrs = entry.attributes ?? entry;
      return {
        courseCode: attrs.CourseCode,
        score: attrs.FinalScore,
      };
    });

    return { ok: true, results, matricNumber };
  }

  return { checkPortalStatus, fetchPassword, sendPasswordBackup, fetchCourses, reservePromo, fetchResult };
})();
