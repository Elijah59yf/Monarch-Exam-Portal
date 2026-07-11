/* Password retrieval: validate, fetch, reveal on screen, copy button,
   and fire a non-blocking backup email once the password is in hand. */

const FormHandler = (() => {
  let form, matricInput, surnameInput, submitBtn;
  let resultEl, formContent;

  function init() {
    form = document.getElementById('pw-form');
    matricInput = document.getElementById('matric');
    surnameInput = document.getElementById('surname');
    submitBtn = document.getElementById('submit-btn');
    resultEl = document.getElementById('result');
    formContent = document.getElementById('form-content');

    if (!form) return;

    form.addEventListener('submit', onSubmit);
    matricInput.addEventListener('input', () => clearErr('matric-group'));
    surnameInput.addEventListener('input', () => clearErr('surname-group'));
  }

  function validate() {
    let valid = true;

    if (!matricInput.value.trim()) {
      setErr('matric-group', 'Enter your matric number'); valid = false;
    }

    const surname = surnameInput.value.trim();
    if (!surname) {
      setErr('surname-group', 'Enter your surname'); valid = false;
    } else if (surname.length < 2) {
      setErr('surname-group', 'Too short'); valid = false;
    } else if (surname !== surname.toLowerCase()) {
      setErr('surname-group', 'Surname must be all lowercase'); valid = false;
    }

    return valid;
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
    matricInput.disabled = on;
    surnameInput.disabled = on;
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);

    try {
      const res = await API.fetchPassword(matricInput.value, surnameInput.value);
      setLoading(false);

      if (res.ok) {
        // On-screen reveal is the primary path. Queue the backup email in the
        // background; it must not block or delay what the student sees.
        API.sendPasswordBackup(matricInput.value, surnameInput.value);
        showResult(true, res.password);
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
      resultEl.classList.remove('is-error');
      resultEl.innerHTML = `
        <div class="doc-card">
          <div class="doc-card-band">
            <span class="seal">&#10003;</span>
            <div>
              <h2>Password issued</h2>
              <p>Copy it below, then log in to Moodle.</p>
            </div>
          </div>
          <div class="doc-card-body">
            <div class="pw-box">
              <span class="pw-value" id="pw-val">${escapeHtml(value)}</span>
              <button class="copy-btn" id="copy-btn" type="button">Copy</button>
            </div>
            <p class="pw-hint">Your Moodle username is your matric number.</p>
            <p class="email-note">A copy is on its way to the email on your registration. If it does not arrive, the password on this screen is the one to use.</p>
            <div class="card-actions">
              <button class="btn btn--ghost" id="back-btn" type="button">Done</button>
            </div>
          </div>
        </div>`;

      document.getElementById('copy-btn').addEventListener('click', copyPw);
      document.getElementById('back-btn').addEventListener('click', reset);
    } else {
      resultEl.classList.add('is-error');
      resultEl.innerHTML = `
        <div class="doc-card">
          <div class="doc-card-band is-err">
            <span class="seal">!</span>
            <div><h2>Could not retrieve</h2></div>
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

  async function copyPw() {
    const val = document.getElementById('pw-val')?.textContent;
    if (!val) return;
    const btn = document.getElementById('copy-btn');
    try {
      await navigator.clipboard.writeText(val);
    } catch {
      const t = document.createElement('textarea');
      t.value = val;
      t.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      document.body.removeChild(t);
    }
    btn.textContent = 'Copied';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = 'Copy';
      btn.classList.remove('copied');
    }, 2000);
  }

  function reset() {
    resultEl.classList.remove('show', 'is-error');
    resultEl.innerHTML = '';
    formContent.style.display = 'block';
    form.reset();
    setLoading(false);
    clearErr('matric-group');
    clearErr('surname-group');
    matricInput.focus();
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : s;
    return d.innerHTML;
  }

  return { init };
})();
