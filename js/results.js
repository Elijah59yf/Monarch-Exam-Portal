/* Result checker: Result PIN lookup, client-side grading, summary-first layout.
   Grades follow the standard university scale. No color-coding: the letter
   grade carries the meaning, and every row gets equal visual weight. */

const ResultChecker = (() => {
  let form, pinInput, submitBtn;
  let resultEl, formContent;

  let sessionLabel = '';

  // Standard university grading scale. Order matters: first match wins.
  const SCALE = [
    { min: 70, grade: 'A', remark: 'Excellent' },
    { min: 60, grade: 'B', remark: 'Very Good' },
    { min: 50, grade: 'C', remark: 'Good' },
    { min: 45, grade: 'D', remark: 'Fair' },
    { min: 40, grade: 'E', remark: 'Pass' },
    { min: 0,  grade: 'F', remark: 'Fail' },
  ];

  function gradeFor(score) {
    const n = Number(score);
    const band = SCALE.find(b => n >= b.min) || SCALE[SCALE.length - 1];
    return band;
  }

  async function init() {
    form = document.getElementById('result-form');
    pinInput = document.getElementById('pin');
    submitBtn = document.getElementById('submit-btn');
    resultEl = document.getElementById('result');
    formContent = document.getElementById('form-content');

    if (!form) return;

    if (typeof Global !== 'undefined') {
      const term = await Global.getAcademicTerm();
      if (term) sessionLabel = `${term.session} · ${term.semester}`;
    }

    form.addEventListener('submit', onSubmit);
    pinInput.addEventListener('input', () => clearErr('pin-group'));
  }

  function validate() {
    const pin = pinInput.value.trim();
    if (!pin) { setErr('pin-group', 'Enter your Result PIN'); return false; }
    if (pin.length < 10) { setErr('pin-group', 'The Result PIN is 10 characters'); return false; }
    return true;
  }

  function setErr(id, msg) {
    const g = document.getElementById(id);
    g.classList.add('error');
    const errEl = g.querySelector('.err-msg');
    if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
  }

  function clearErr(id) {
    const g = document.getElementById(id);
    if (!g) return;
    g.classList.remove('error');
    const errEl = g.querySelector('.err-msg');
    if (errEl) errEl.style.display = 'none';
  }

  function setLoading(on) {
    submitBtn.classList.toggle('loading', on);
    submitBtn.disabled = on;
    pinInput.disabled = on;
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);

    try {
      const res = await API.fetchResult(pinInput.value);
      setLoading(false);
      if (res.ok) showResult(true, res);
      else showResult(false, res.message);
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

      const graded = results.map(r => ({ ...r, band: gradeFor(r.score) }));
      const total = graded.reduce((sum, r) => sum + Number(r.score), 0);
      const avg = graded.length ? (total / graded.length) : 0;
      const passed = graded.filter(r => Number(r.score) >= 40).length;
      const failed = graded.length - passed;
      const avgBand = gradeFor(avg);

      // Detail rows: every row identical in weight, letter grade does the talking.
      const rows = graded
        .sort((a, b) => String(a.courseCode).localeCompare(String(b.courseCode)))
        .map(r => `
          <tr>
            <td class="t-code">${escapeHtml(r.courseCode)}</td>
            <td class="num t-score">${escapeHtml(String(r.score))}</td>
            <td class="mid t-grade">${r.band.grade}</td>
            <td class="t-remark">${r.band.remark}</td>
          </tr>`).join('');

      resultEl.classList.remove('is-error');
      resultEl.innerHTML = `
        <div class="doc-card">
          <div class="doc-card-band">
            <span class="seal">M</span>
            <div>
              <h2>Statement of Results</h2>
              <p>Matric ${escapeHtml(matricNumber)}${sessionLabel ? ' · ' + escapeHtml(sessionLabel) : ''}</p>
            </div>
          </div>
          <div class="doc-card-body">

            <div class="res-summary">
              <div class="res-stat">
                <div class="s-lbl">Overall average</div>
                <div class="s-val">${avg.toFixed(1)}</div>
                <div class="s-sub">Grade ${avgBand.grade} &middot; ${avgBand.remark}</div>
              </div>
              <div class="res-stat">
                <div class="s-lbl">Courses passed</div>
                <div class="s-val">${passed} / ${graded.length}</div>
                <div class="s-sub">40 and above is a pass</div>
              </div>
              <div class="res-stat">
                <div class="s-lbl">Below pass mark</div>
                <div class="s-val">${failed}</div>
                <div class="s-sub">${failed === 0 ? 'None' : failed === 1 ? '1 course' : failed + ' courses'}</div>
              </div>
            </div>

            <table class="grade-table">
              <thead>
                <tr>
                  <th>Course</th>
                  <th class="num">Score</th>
                  <th class="mid">Grade</th>
                  <th>Remark</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>

            <div class="grade-key">
              <span class="k"><b>A</b> 70&ndash;100 Excellent</span>
              <span class="k"><b>B</b> 60&ndash;69 Very Good</span>
              <span class="k"><b>C</b> 50&ndash;59 Good</span>
              <span class="k"><b>D</b> 45&ndash;49 Fair</span>
              <span class="k"><b>E</b> 40&ndash;44 Pass</span>
              <span class="k"><b>F</b> 0&ndash;39 Fail</span>
            </div>

            <div class="card-actions">
              <button class="btn btn--ghost" id="back-btn" type="button">Check another</button>
              <button class="btn" id="print-btn" type="button">Print or save PDF</button>
            </div>
          </div>
        </div>`;

      document.getElementById('back-btn').addEventListener('click', reset);
      document.getElementById('print-btn').addEventListener('click', () => window.print());
    } else {
      resultEl.classList.add('is-error');
      resultEl.innerHTML = `
        <div class="doc-card">
          <div class="doc-card-band is-err">
            <span class="seal">!</span>
            <div><h2>No results found</h2></div>
          </div>
          <div class="doc-card-body">
            <p style="font-size:14.5px;color:var(--ink-soft)">${escapeHtml(value)}</p>
            <div class="card-actions">
              <button class="btn" id="back-btn" type="button">Try again</button>
            </div>
          </div>
        </div>`;
      document.getElementById('back-btn').addEventListener('click', reset);
    }
  }

  function reset() {
    resultEl.classList.remove('show', 'is-error');
    resultEl.innerHTML = '';
    formContent.style.display = 'block';
    form.reset();
    setLoading(false);
    clearErr('pin-group');
    pinInput.focus();
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : s;
    return d.innerHTML;
  }

  document.addEventListener('DOMContentLoaded', () => {
    ResultChecker.init();
  });

  return { init };
})();
