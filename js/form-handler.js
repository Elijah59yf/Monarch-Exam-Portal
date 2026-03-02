/* Form handling — validation + submission */

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
      setErr('matric-group', 'Enter your Matric Number');
      valid = false;
    }

    if (!surnameInput.value.trim()) {
      setErr('surname-group', 'Enter your Surname');
      valid = false;
    } else if (surnameInput.value.trim().length < 2) {
      setErr('surname-group', 'Too short');
      valid = false;
    }

    return valid;
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
        <div class="result-icon">✓</div>
        <div class="result-title">Password Retrieved</div>
        <div class="result-msg">Copy your Moodle password below.</div>
        <div class="pw-box">
          <span class="pw-value" id="pw-val">${escapeHtml(value)}</span>
          <button class="copy-btn" id="copy-btn" type="button">Copy</button>
        </div>
        <button class="back-btn" id="back-btn" type="button">Done</button>
      `;

      document.getElementById('copy-btn').addEventListener('click', copyPw);
      document.getElementById('back-btn').addEventListener('click', reset);
    } else {
      resultEl.classList.add('is-error');
      resultEl.innerHTML = `
        <div class="result-icon">✕</div>
        <div class="result-title">Error</div>
        <div class="result-msg">${escapeHtml(value)}</div>
        <button class="back-btn" id="back-btn" type="button">Try Again</button>
      `;

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
    clearErr('matric-group');
    clearErr('surname-group');
    matricInput.focus();
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  return { init };
})();
