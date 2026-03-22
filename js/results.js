/* Result Checker — form handling + state management */

const ResultChecker = (() => {
  let form, pinInput, submitBtn;
  let resultEl, formContent;

  // Will be populated dynamically from Global.getAcademicTerm()
  let sessionLabel = '';

  async function init() {
    form = document.getElementById('result-form');
    pinInput = document.getElementById('pin');
    submitBtn = document.getElementById('submit-btn');
    resultEl = document.getElementById('result');
    formContent = document.getElementById('form-content');

    if (!form) return;

    // Fetch academic term from Global cache/API
    if (typeof Global !== 'undefined') {
      const term = await Global.getAcademicTerm();
      if (term) sessionLabel = `${term.session} \u2014 ${term.semester}`;
    }

    form.addEventListener('submit', onSubmit);
    pinInput.addEventListener('input', () => clearErr('pin-group'));
  }

  function validate() {
    const pin = pinInput.value.trim();
    if (!pin) {
      setErr('pin-group', 'Enter your Master PIN');
      return false;
    }
    if (pin.length < 10) {
      setErr('pin-group', 'Master PIN must be 10 characters');
      return false;
    }
    return true;
  }

  function setErr(id, msg) {
    const g = document.getElementById(id);
    g.classList.add('error');
    g.querySelector('.error-msg').textContent = msg;
  }

  function clearErr(id) {
    document.getElementById(id)?.classList.remove('error');
  }

  function setLoading(on) {
    submitBtn.classList.toggle('loading', on);
    submitBtn.disabled = on;
    pinInput.disabled = on;
  }

  /**
   * Returns a CSS class based on the score value.
   * >= 70 → success (green), >= 50 → warning (gold), < 50 → danger (red)
   */
  function scoreClass(score) {
    const n = Number(score);
    if (n >= 70) return 'rt-score--success';
    if (n >= 50) return 'rt-score--warning';
    return 'rt-score--danger';
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);

    try {
      const res = await API.fetchResult(pinInput.value);
      setLoading(false);

      if (res.ok) {
        showResult(true, res);
      } else {
        showResult(false, res.message);
      }
    } catch (err) {
      setLoading(false);
      showResult(false, 'Network error. Check your connection and try again.');
    }
  }

  function showResult(success, value) {
    formContent.style.display = 'none';
    resultEl.classList.add('show');

    if (success) {
      const { results, matricNumber } = value;

      // Build table rows with conditional score coloring
      const rows = results.map((r, i) => `
        <tr class="${i % 2 === 0 ? 'rt-row--even' : 'rt-row--odd'}">
          <td class="rt-cell rt-cell--code">${escapeHtml(r.courseCode)}</td>
          <td class="rt-cell rt-cell--score ${scoreClass(r.score)}">${escapeHtml(String(r.score))}</td>
        </tr>
      `).join('');

      // Calculate average
      const total = results.reduce((sum, r) => sum + Number(r.score), 0);
      const avg = (total / results.length).toFixed(1);

      resultEl.classList.remove('is-error');
      resultEl.innerHTML = `
        <div class="result-card" id="result-card">
          <div class="result-icon result-icon--success">✓</div>
          <div class="result-title">Results Found</div>
          <div class="result-msg">
            Matric: <strong>${escapeHtml(matricNumber)}</strong>
            · ${results.length} course${results.length > 1 ? 's' : ''}
          </div>
          <div class="result-session">${sessionLabel ? 'Session: ' + escapeHtml(sessionLabel) : ''}</div>

          <div class="rt-wrap">
            <table class="rt-table">
              <thead>
                <tr>
                  <th class="rt-head">Course</th>
                  <th class="rt-head rt-head--score">Score</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>

          <div class="rt-summary">
            <span class="rt-summary-label">Average</span>
            <span class="rt-summary-value ${scoreClass(avg)}">${avg}</span>
          </div>

          <div class="result-actions">
            <button class="back-btn" id="back-btn" type="button">Check Another</button>
            <button class="print-btn" type="button" onclick="window.print()">🖨️ Print / Save PDF</button>
          </div>
        </div>
      `;

      document.getElementById('back-btn').addEventListener('click', reset);
    } else {
      resultEl.classList.add('is-error');
      resultEl.innerHTML = `
        <div class="result-card">
          <div class="result-icon result-icon--error">✕</div>
          <div class="result-title">Not Found</div>
          <div class="result-msg">${escapeHtml(value)}</div>
          <button class="back-btn" id="back-btn" type="button">Try Again</button>
        </div>
      `;

      document.getElementById('back-btn').addEventListener('click', reset);
    }
  }

  function reset() {
    resultEl.classList.remove('show', 'is-error');
    resultEl.innerHTML = '';
    formContent.style.display = 'block';
    form.reset();
    clearErr('pin-group');
    pinInput.focus();
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // Auto-init on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    ResultChecker.init();
  });

  return { init };
})();
