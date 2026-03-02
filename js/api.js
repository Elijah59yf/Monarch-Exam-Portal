/* API — POST to Strapi custom endpoint */

const API = (() => {
  const BASE = 'https://api.monarchdem.me';

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
      // 200 — password returned
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

  return { fetchPassword };
})();
