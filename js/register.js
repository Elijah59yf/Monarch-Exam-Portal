/* Register — Smart grouping, pill filters, search, animated list + Paystack */

const Register = (() => {
  const BASE = 'http://api.monarchdem.me'; // TODO: move to config
  const PAYSTACK_KEY = 'pk_live_08fe8ab4a13094390c94b54e7021381803bbd666';

  let form, firstnameInput, surnameInput, matricInput, submitBtn;
  let formContent, resultEl, courseListEl, cartTotalEl;
  let filterBox, searchInput;

  // State
  let allCourses  = [];   // processed course objects
  let coursesMap  = {};   // keyed by documentId
  let activeFilter = 'All';
  let searchQuery  = '';

  function init() {
    form           = document.getElementById('reg-form');
    firstnameInput = document.getElementById('firstname');
    surnameInput   = document.getElementById('surname');
    matricInput    = document.getElementById('matric');
    submitBtn      = document.getElementById('submit-btn');
    formContent    = document.getElementById('form-content');
    resultEl       = document.getElementById('result');
    courseListEl    = document.getElementById('course-list');
    cartTotalEl    = document.getElementById('cart-total');
    filterBox      = document.getElementById('filter-container');
    searchInput    = document.getElementById('search-input');

    if (!form) return;

    form.addEventListener('submit', onSubmit);

    // Clear errors on input
    firstnameInput.addEventListener('input', () => clearErr('firstname-group'));
    surnameInput.addEventListener('input', () => clearErr('surname-group'));
    matricInput.addEventListener('input', () => clearErr('matric-group'));

    // Live search
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        searchQuery = searchInput.value.trim().toLowerCase();
        renderList();
      });
    }
  }

  /* ── Process raw courses from API ── */
  function renderCourses(courses) {
    if (!courses.length) {
      courseListEl.innerHTML = '<div class="course-loading">No courses available at this time.</div>';
      return;
    }

    allCourses = courses.map((course) => {
      const id = course.documentId;
      let price = 0;
      let closed = false;
      let regTag = '';

      if (course.IsLateRegOpen) {
        price = course.LatePrice;
        regTag = 'Late';
      } else if (course.IsNormalRegOpen) {
        price = course.NormalPrice;
        regTag = 'Normal';
      } else {
        closed = true;
      }

      // ── SMART GROUPING ──
      // Department "General" → use Faculty as category
      // Otherwise → use Department
      const dept = course.Department || 'General';
      const displayCategory = dept === 'General'
        ? (course.Faculty || 'General')
        : dept;

      const obj = { ...course, resolvedPrice: price, closed, regTag, displayCategory };
      coursesMap[id] = obj;
      return obj;
    });

    buildPills();
    renderList();
  }

  /* ══════════════ PILL FILTERS ══════════════ */
  function buildPills() {
    if (!filterBox) return;
    // Only build pills for categories that actually have courses
    const cats = ['All', ...new Set(allCourses.map(c => c.displayCategory).sort())];
    filterBox.innerHTML = '';
    cats.forEach(cat => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = cat;
      btn.className = 'filter-pill' + (cat === activeFilter ? ' active' : '');
      btn.addEventListener('click', () => {
        activeFilter = cat;
        filterBox.querySelectorAll('.filter-pill').forEach(b =>
          b.classList.toggle('active', b.textContent === activeFilter)
        );
        renderList();
      });
      filterBox.appendChild(btn);
    });
  }

  /* ══════════════ LIST RENDERING ══════════════ */
  function renderList() {
    // Preserve checked state across re-renders
    const prevChecked = new Set(
      Array.from(courseListEl.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value)
    );

    // Filter
    let filtered = allCourses;
    if (activeFilter !== 'All') {
      filtered = filtered.filter(c => c.displayCategory === activeFilter);
    }
    if (searchQuery) {
      filtered = filtered.filter(c =>
        c.CourseCode.toLowerCase().includes(searchQuery) ||
        c.Title.toLowerCase().includes(searchQuery) ||
        c.displayCategory.toLowerCase().includes(searchQuery)
      );
    }

    // Fade out → rebuild → stagger in
    courseListEl.style.opacity = '0';
    courseListEl.style.transition = 'opacity 0.15s ease';

    setTimeout(() => {
      if (!filtered.length) {
        courseListEl.innerHTML = '<div class="course-empty">No courses match your filter.</div>';
        courseListEl.style.opacity = '1';
        return;
      }

      courseListEl.innerHTML = '';

      filtered.forEach((c) => {
        const id = c.documentId;
        const wasChecked = prevChecked.has(id);

        const label = document.createElement('label');
        label.className = 'course-card course-card--fixed anim-enter' + (c.closed ? ' course-closed' : '');

        label.innerHTML = `
          <input type="checkbox" name="course" value="${esc(id)}" data-price="${c.resolvedPrice}" ${c.closed ? 'disabled' : ''} ${wasChecked ? 'checked' : ''} />
          <span class="course-check">✓</span>
          <div class="course-info">
            <div class="course-code">${esc(c.CourseCode)}${c.regTag ? ` · ${c.regTag} Reg` : ''}</div>
            <div class="course-title">${esc(c.Title)}</div>
            <div class="course-category">${esc(c.displayCategory)}</div>
          </div>
          ${c.closed
            ? '<span class="course-closed-badge">Closed</span>'
            : `<span class="course-price">₦${c.resolvedPrice.toLocaleString()}</span>`
          }
        `;

        courseListEl.appendChild(label);
      });

      // Re-attach checkbox listeners
      courseListEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
          updateTotal();
          clearErr('courses-group');
        });
      });
      updateTotal();

      // Fade container back in
      courseListEl.style.opacity = '1';

      // Staggered slide-up animation
      requestAnimationFrame(() => {
        const cards = courseListEl.querySelectorAll('.course-card');
        cards.forEach((card, i) => {
          setTimeout(() => {
            card.classList.remove('anim-enter');
            card.classList.add('anim-visible');
          }, i * 45);
        });
      });
    }, 150);
  }

  /* ── Cart total ── */
  function updateTotal() {
    const checked = courseListEl.querySelectorAll('input[type="checkbox"]:checked');
    let total = 0;
    checked.forEach((cb) => { total += parseInt(cb.dataset.price, 10) || 0; });
    cartTotalEl.textContent = total.toLocaleString();
    return total;
  }

  function getSelectedCourseIds() {
    return Array.from(courseListEl.querySelectorAll('input[type="checkbox"]:checked'))
      .map((cb) => cb.value);
  }

  /* ── Validation ── */
  function validate() {
    let valid = true;

    if (!firstnameInput.value.trim()) {
      setErr('firstname-group', 'Enter your first name');
      valid = false;
    } else if (firstnameInput.value.trim().length < 2) {
      setErr('firstname-group', 'Too short');
      valid = false;
    }

    if (!surnameInput.value.trim()) {
      setErr('surname-group', 'Enter your surname');
      valid = false;
    } else if (surnameInput.value.trim().length < 2) {
      setErr('surname-group', 'Too short');
      valid = false;
    }

    if (!matricInput.value.trim()) {
      setErr('matric-group', 'Enter your matric number');
      valid = false;
    }

    if (getSelectedCourseIds().length === 0) {
      setErr('courses-group', 'Select at least one course');
      valid = false;
    }

    return valid;
  }

  function setErr(id, msg) {
    const g = document.getElementById(id);
    if (!g) return;
    g.classList.add('error');
    const errEl = g.querySelector('.error-msg');
    if (errEl) errEl.textContent = msg;
  }

  function clearErr(id) {
    document.getElementById(id)?.classList.remove('error');
  }

  function setLoading(on) {
    submitBtn.classList.toggle('loading', on);
    submitBtn.disabled = on;
  }

  /* ── Submit → Paystack ── */
  function onSubmit(e) {
    e.preventDefault();
    if (!validate()) return;

    const firstname = firstnameInput.value.trim();
    const surname   = surnameInput.value.trim();
    const matricNo  = matricInput.value.trim();
    const autoEmail = `${matricNo}@monarchdem.me`;
    const totalNaira = updateTotal();
    const amount     = totalNaira * 100; // kobo
    const selectedCourseIds = getSelectedCourseIds();

    if (amount <= 0) {
      setErr('courses-group', 'Select at least one course');
      return;
    }

    setLoading(true);

    const handler = PaystackPop.setup({
      key: PAYSTACK_KEY,
      email: autoEmail,
      amount: amount,
      currency: 'NGN',
      metadata: {
        custom_fields: [
          { display_name: 'First Name', variable_name: 'first_name', value: firstname },
          { display_name: 'Matric Number', variable_name: 'matric_no', value: matricNo },
          { display_name: 'Surname', variable_name: 'surname', value: surname },
          { display_name: 'Courses', variable_name: 'courses', value: selectedCourseIds.length + ' course(s)' },
        ],
      },
      onClose: () => {
        setLoading(false);
      },
      callback: (response) => {
        syncWithBackend(response.reference, firstname, matricNo, surname, selectedCourseIds);
      },
    });

    handler.openIframe();
  }

  /* ── Backend sync ── */
  async function syncWithBackend(reference, firstname, matricNo, surname, courseIds) {
    try {
      const res = await fetch(`${BASE}/api/exam-credentials/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference, firstname, matricNo, surname, courseIds }),
      });

      setLoading(false);

      if (res.ok) {
        const data = await res.json();
        showResult(true, reference, data.message, data.assignedBatches);
      } else {
        const data = await res.json().catch(() => ({}));
        const msg = data.error?.message || data.message || 'Registration failed on our end.';
        showResult(false, msg, reference);
      }
    } catch {
      setLoading(false);
      showResult(false, 'Network error. Your payment was received but registration failed.', reference);
    }
  }

  /* ── Result display ── */
  function showResult(success, refOrMsg, serverMsg, assignedBatches) {
    formContent.style.display = 'none';
    resultEl.classList.add('show');

    if (success) {
      resultEl.classList.remove('is-error');

      let batchHtml = '';
      if (assignedBatches && typeof assignedBatches === 'object') {
        const items = Object.entries(assignedBatches)
          .map(([code, batch]) => {
            const course = allCourses.find(c => c.CourseCode === code);
            const waLink = course?.GroupChatLink;
            const waBtn = waLink
              ? `<a href="${esc(waLink)}" target="_blank" rel="noopener noreferrer" class="wa-join-btn">
                   <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                   Join WhatsApp Group
                 </a>`
              : '';
            return `<li><span><strong>${esc(code)}</strong>: Batch ${batch}</span>${waBtn}</li>`;
          })
          .join('');
        batchHtml = `
          <p class="batch-schedule-title">Your batch schedule:</p>
          <ul class="batch-schedule-list">${items}</ul>
        `;
      }

      resultEl.innerHTML = `
        <div class="result-card">
          <div class="result-icon result-icon--success">✓</div>
          <div class="result-title">Success</div>
          <div class="result-msg">
            ${esc(serverMsg)}
            ${batchHtml}
            <p>Use the <a href="password.html"><strong>Get Password</strong></a> page to retrieve your Moodle login details on exam day.</p>
          </div>
          <div class="ref-box">Ref: <span class="ref-value">${esc(refOrMsg)}</span></div>
          <button class="back-btn" id="back-btn" type="button">Register Another</button>
        </div>
      `;
      document.getElementById('back-btn').addEventListener('click', reset);
    } else {
      resultEl.classList.add('is-error');
      resultEl.innerHTML = `
        <div class="result-card">
          <div class="result-icon result-icon--error">✕</div>
          <div class="result-title">Registration Error</div>
          <div class="result-msg">${esc(refOrMsg)}</div>
          ${serverMsg ? `<div class="ref-box">Ref: <span class="ref-value">${esc(serverMsg)}</span><br><small>Contact <a href="mailto:eakinseloyin@gmail.com">support</a> with this reference.</small></div>` : ''}
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
    courseListEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = false; });
    cartTotalEl.textContent = '0';
    activeFilter = 'All';
    searchQuery = '';
    if (searchInput) searchInput.value = '';
    buildPills();
    renderList();
    ['firstname-group', 'surname-group', 'matric-group', 'courses-group'].forEach(clearErr);
    firstnameInput.focus();
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  return { init, renderCourses };
})();

document.addEventListener('DOMContentLoaded', async () => {
  Register.init();

  const courses = await API.fetchCourses();

  if (!courses.length) {
    document.getElementById('form-content').style.display = 'none';
    document.getElementById('reg-closed').style.display = '';
    return;
  }

  const allClosed = courses.every((c) => !c.IsNormalRegOpen && !c.IsLateRegOpen);
  if (allClosed) {
    document.getElementById('form-content').style.display = 'none';
    document.getElementById('reg-closed').style.display = '';
    return;
  }

  Register.renderCourses(courses);
});
