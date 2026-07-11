/* Register: collapsible department groups, live admit-card summary,
   sticky mobile bar, Paystack checkout, and a what-happens-next success state. */

const Register = (() => {
  const BASE = 'https://api.monarchdem.me'; // TODO: move to config
  const PAYSTACK_KEY = 'pk_live_08fe8ab4a13094390c94b54e7021381803bbd666';

  let form, firstnameInput, surnameInput, matricInput, contactEmailInput, submitBtn;
  let formContent, resultEl, groupsEl, searchInput;
  let ticketLinesEl, cartTotalEl, cartCountEl;
  let mbTotalEl, mbCountEl, payMobileBtn;

  // State
  let allCourses = [];          // processed course objects
  let coursesMap = {};          // keyed by documentId
  const selected = new Set();   // selected documentIds
  const openGroups = new Set(); // expanded group names
  let searchQuery = '';
  let categoriesExpandedByDefault = false; // ExamSetting-driven; applied uniformly to every category

  function init() {
    form           = document.getElementById('reg-form');
    firstnameInput = document.getElementById('firstname');
    surnameInput   = document.getElementById('surname');
    matricInput    = document.getElementById('matric');
    contactEmailInput = document.getElementById('contactEmail');
    submitBtn      = document.getElementById('submit-btn');
    formContent    = document.getElementById('form-content');
    resultEl       = document.getElementById('result');
    groupsEl       = document.getElementById('course-groups');
    searchInput    = document.getElementById('search-input');
    ticketLinesEl  = document.getElementById('ticket-lines');
    cartTotalEl    = document.getElementById('cart-total');
    cartCountEl    = document.getElementById('cart-count');
    mbTotalEl      = document.getElementById('mb-total');
    mbCountEl      = document.getElementById('mb-count');
    payMobileBtn   = document.getElementById('pay-mobile');

    if (!form) return;

    form.addEventListener('submit', onSubmit);
    if (payMobileBtn) payMobileBtn.addEventListener('click', (e) => { e.preventDefault(); onSubmit(e); });

    firstnameInput.addEventListener('input', () => clearErr('firstname-group'));
    surnameInput.addEventListener('input', () => clearErr('surname-group'));
    matricInput.addEventListener('input', () => clearErr('matric-group'));
    contactEmailInput.addEventListener('input', () => clearErr('contactemail-group'));

    if (searchInput) {
      searchInput.addEventListener('input', () => {
        searchQuery = searchInput.value.trim().toLowerCase();
        renderGroups();
      });
    }

    fillSession();
  }

  /* Put the real session (from AcademicTerm) in the admit-card header. */
  async function fillSession() {
    const el = document.getElementById('ticket-session');
    if (!el || typeof Global === 'undefined') return;
    try {
      const term = await Global.getAcademicTerm();
      if (term && term.session) el.textContent = `Session ${term.session}`;
    } catch { /* leave the default label */ }
  }

  /* ── Process raw courses from API ── */
  function renderCourses(courses, opts = {}) {
    categoriesExpandedByDefault = !!opts.categoriesExpandedByDefault;
    allCourses = courses.map((course) => {
      let basePrice = 0, closed = false, regTag = '';

      if (course.IsLateRegOpen) {
        basePrice = course.LatePrice;
        regTag = 'Late reg';
      } else if (course.IsNormalRegOpen) {
        basePrice = course.NormalPrice;
        regTag = '';
      } else {
        closed = true;
      }

      // Promo state (computed server-side, accounts for live reservations).
      const promo = course.Promo || {};
      const promoActive = !closed && promo.active === true && typeof promo.price === 'number';
      const promoPrice = promoActive ? promo.price : null;
      const slotsRemaining = promoActive ? (promo.slotsRemaining || 0) : 0;

      // The effective price shown/summed is the promo price when a promo is
      // live; the reserve step at checkout confirms this is still available.
      const resolvedPrice = promoActive ? promoPrice : basePrice;

      // Group by department; fall back to faculty when the department is General.
      const dept = course.Department || 'General';
      const displayCategory = dept === 'General'
        ? (course.Faculty || 'General')
        : dept;

      const obj = {
        ...course, basePrice, resolvedPrice, closed, regTag, displayCategory,
        promoActive, promoPrice, slotsRemaining,
      };
      coursesMap[course.documentId] = obj;
      return obj;
    });

    // Initial expand/collapse is an admin setting (ExamSetting.CategoriesExpandedByDefault),
    // applied uniformly: either every category opens or every category stays collapsed.
    // No category is special-cased.
    openGroups.clear();
    if (categoriesExpandedByDefault) {
      allCourses.forEach(c => openGroups.add(c.displayCategory));
    }

    document.body.classList.add('courses-ready');
    renderGroups();
    renderTicket();
  }

  /* ── Grouped, collapsible course list ── */
  function renderGroups() {
    // Build category -> courses, honoring the search filter.
    const cats = new Map();
    allCourses.forEach((c) => {
      if (searchQuery) {
        const hay = `${c.CourseCode} ${c.Title} ${c.displayCategory}`.toLowerCase();
        if (!hay.includes(searchQuery)) return;
      }
      if (!cats.has(c.displayCategory)) cats.set(c.displayCategory, []);
      cats.get(c.displayCategory).push(c);
    });

    if (cats.size === 0) {
      groupsEl.innerHTML = '<div class="course-empty">No courses match your search.</div>';
      return;
    }

    // When searching, expand every matching group so results are visible.
    const forceOpen = !!searchQuery;

    const sortedCats = [...cats.keys()].sort();
    groupsEl.innerHTML = sortedCats.map((cat) => {
      const list = cats.get(cat).sort((a, b) => a.CourseCode.localeCompare(b.CourseCode));
      const selCount = list.filter(c => selected.has(c.documentId)).length;
      const isOpen = forceOpen || openGroups.has(cat);

      const rows = list.map((c) => {
        const id = c.documentId;
        const checked = selected.has(id);

        let priceHtml;
        if (c.closed) {
          priceHtml = '<span class="closed-tag">Closed</span>';
        } else if (c.promoActive) {
          const low = c.slotsRemaining <= 5 ? ' low' : '';
          priceHtml = `
            <span class="price is-promo">
              <span class="price-was">&#8358;${c.basePrice.toLocaleString()}</span>
              <span class="price-now">&#8358;${c.promoPrice.toLocaleString()}</span>
            </span>`;
          // slots-left hint is appended under the price via the info column below
          c._slotsHtml = `<span class="slots-left${low}">${c.slotsRemaining} promo slot${c.slotsRemaining === 1 ? '' : 's'} left</span>`;
        } else {
          priceHtml = `<span class="price">&#8358;${c.resolvedPrice.toLocaleString()}</span>`;
        }

        const promoTag = c.promoActive ? '<span class="tag promo">Promo</span>' : '';
        const regTagHtml = c.regTag ? `<span class="tag">${esc(c.regTag)}</span>` : '';
        return `
          <label class="course${c.closed ? ' closed' : ''}">
            <input type="checkbox" value="${esc(id)}" ${c.closed ? 'disabled' : ''} ${checked ? 'checked' : ''} />
            <span class="box">&#10003;</span>
            <span class="info">
              <span class="code">${esc(c.CourseCode)}${promoTag}${regTagHtml}</span>
              <span class="title">${esc(c.Title)}</span>
              ${c.promoActive ? c._slotsHtml : ''}
            </span>
            ${priceHtml}
          </label>`;
      }).join('');

      const selHtml = selCount ? `<span class="sel">${selCount} selected</span> / ` : '';
      return `
        <div class="group${isOpen ? ' open' : ''}" data-cat="${esc(cat)}">
          <button type="button" class="group-head" aria-expanded="${isOpen}">
            <svg class="group-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 6 6 6-6 6"/></svg>
            <span class="group-name">${esc(cat)}</span>
            <span class="group-count">${selHtml}${list.length} course${list.length > 1 ? 's' : ''}</span>
          </button>
          <div class="group-body">${rows}</div>
        </div>`;
    }).join('');

    // Wire group toggles.
    groupsEl.querySelectorAll('.group-head').forEach((head) => {
      head.addEventListener('click', () => {
        const cat = head.parentElement.dataset.cat;
        if (openGroups.has(cat)) openGroups.delete(cat); else openGroups.add(cat);
        if (searchQuery) return; // search forces open, ignore toggles
        renderGroups();
      });
    });

    // Wire checkboxes.
    groupsEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener('change', () => {
        if (cb.checked) selected.add(cb.value); else selected.delete(cb.value);
        clearErr('courses-group');
        // Update the group count in place without a full re-render.
        const groupEl = cb.closest('.group');
        if (groupEl) {
          const cat = groupEl.dataset.cat;
          const inCat = allCourses.filter(c => c.displayCategory === cat);
          const sel = inCat.filter(c => selected.has(c.documentId)).length;
          const countEl = groupEl.querySelector('.group-count');
          const total = inCat.length;
          countEl.innerHTML = (sel ? `<span class="sel">${sel} selected</span> / ` : '') +
            `${total} course${total > 1 ? 's' : ''}`;
        }
        renderTicket();
      });
    });
  }

  /* ── Live admit-card ticket + mobile bar ── */
  function renderTicket() {
    const chosen = [...selected].map(id => coursesMap[id]).filter(Boolean);
    let total = 0;
    chosen.forEach(c => { total += c.resolvedPrice || 0; });

    if (chosen.length === 0) {
      ticketLinesEl.innerHTML = '<div class="ticket-empty">No courses selected yet.</div>';
    } else {
      ticketLinesEl.innerHTML = chosen
        .sort((a, b) => a.CourseCode.localeCompare(b.CourseCode))
        .map(c => {
          const priceCell = c.promoActive
            ? `<span class="l-price"><span class="l-was">&#8358;${c.basePrice.toLocaleString()}</span>&#8358;${c.promoPrice.toLocaleString()}</span>`
            : `<span class="l-price">&#8358;${c.resolvedPrice.toLocaleString()}</span>`;
          return `
          <div class="ticket-line">
            <span><span class="l-code">${esc(c.CourseCode)}</span> <span class="l-title">${esc(c.Title)}</span></span>
            ${priceCell}
          </div>`;
        }).join('');
    }

    const countLabel = `${chosen.length} course${chosen.length === 1 ? '' : 's'}`;
    cartTotalEl.textContent = total.toLocaleString();
    cartCountEl.textContent = countLabel;
    if (mbTotalEl) mbTotalEl.textContent = total.toLocaleString();
    if (mbCountEl) mbCountEl.textContent = countLabel;

    const disabled = chosen.length === 0;
    submitBtn.disabled = disabled;
    if (payMobileBtn) payMobileBtn.disabled = disabled;
  }

  /* ── Validation ── */
  function validate() {
    let valid = true;

    if (!firstnameInput.value.trim()) {
      setErr('firstname-group', 'Enter your first name'); valid = false;
    } else if (firstnameInput.value.trim().length < 2) {
      setErr('firstname-group', 'Too short'); valid = false;
    }

    if (!surnameInput.value.trim()) {
      setErr('surname-group', 'Enter your surname'); valid = false;
    } else if (surnameInput.value.trim().length < 2) {
      setErr('surname-group', 'Too short'); valid = false;
    }

    if (!matricInput.value.trim()) {
      setErr('matric-group', 'Enter your matric number'); valid = false;
    }

    if (selected.size === 0) {
      setErr('courses-group', 'Select at least one course'); valid = false;
    }

    const email = contactEmailInput.value.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErr('contactemail-group', 'Enter a valid email address'); valid = false;
    }

    return valid;
  }

  function setErr(id, msg) {
    const g = document.getElementById(id);
    if (!g) return;
    g.classList.add('error');
    // courses-group carries its error message in a sibling with data-for.
    const errEl = g.querySelector('.err-msg') || document.querySelector(`.err-msg[data-for="${id}"]`);
    if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
  }

  function clearErr(id) {
    const g = document.getElementById(id);
    if (!g) return;
    g.classList.remove('error');
    const errEl = g.querySelector('.err-msg') || document.querySelector(`.err-msg[data-for="${id}"]`);
    if (errEl) errEl.style.display = 'none';
  }

  function setLoading(on) {
    submitBtn.classList.toggle('loading', on);
    submitBtn.disabled = on;
    if (payMobileBtn) {
      payMobileBtn.classList.toggle('loading', on);
      payMobileBtn.disabled = on;
    }
  }

  /* ── Submit -> (reserve promo) -> Paystack ── */
  async function onSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!validate()) {
      document.getElementById('courses-group')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const firstname = firstnameInput.value.trim();
    const surname   = surnameInput.value.trim();
    const matricNo  = matricInput.value.trim();
    const contactEmail = contactEmailInput.value.trim();
    const autoEmail = `${matricNo}@monarchdem.me`;
    const selectedCourseIds = [...selected];

    if (selectedCourseIds.length === 0) {
      setErr('courses-group', 'Select at least one course');
      return;
    }

    setLoading(true);

    // The total the student is currently looking at (optimistic promo prices).
    const shownTotal = selectedCourseIds.reduce((s, id) => s + (coursesMap[id]?.resolvedPrice || 0), 0);

    // If any selected course is on promo, lock the promo price server-side
    // before charging so the last slot can't be pulled out mid-payment.
    let reservationTokens = [];
    let chargeTotal = shownTotal;
    const hasPromo = selectedCourseIds.some(id => coursesMap[id]?.promoActive);

    if (hasPromo) {
      const reservation = await API.reservePromo(selectedCourseIds, matricNo);
      if (!reservation.ok) {
        setLoading(false);
        setErr('courses-group', reservation.message || 'Could not lock in your promo price. Please try again.');
        return;
      }

      // Fold the authoritative pricing back into the cart.
      applyReservedPricing(reservation.lines || []);
      reservationTokens = (reservation.lines || [])
        .filter(l => l.promo && l.reservationToken)
        .map(l => l.reservationToken);
      chargeTotal = reservation.totalNaira;

      // If a slot got taken between page load and checkout, the price changed.
      // Don't silently charge a different amount — update the UI and let the
      // student review, then submit again.
      if (chargeTotal !== shownTotal) {
        setLoading(false);
        renderGroups();
        renderTicket();
        setErr('courses-group', 'A promo slot was just taken, so pricing updated. Review your total and tap pay again.');
        document.getElementById('courses-group')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }

    const amount = chargeTotal * 100; // kobo

    // A valid selection with a ₦0 total (e.g. every chosen course is on a free
    // promo) is a legitimate free registration, not an empty cart — that was
    // already ruled out above by selectedCourseIds.length. Paystack cannot
    // charge ₦0, so skip the payment iframe and register directly. The backend
    // computes the same ₦0 expected total and waives payment verification.
    if (amount <= 0) {
      const freeRef = `FREE-${matricNo}-${Date.now()}`;
      syncWithBackend(freeRef, firstname, matricNo, surname, contactEmail, selectedCourseIds, reservationTokens);
      return;
    }

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
      onClose: () => setLoading(false),
      callback: (response) => {
        syncWithBackend(response.reference, firstname, matricNo, surname, contactEmail, selectedCourseIds, reservationTokens);
      },
    });

    handler.openIframe();
  }

  /* Fold the reserve endpoint's authoritative per-course pricing back into the
     local course map so the cart reflects exactly what will be charged. A
     course whose promo slot was lost reverts to its base price. */
  function applyReservedPricing(lines) {
    lines.forEach((line) => {
      const c = coursesMap[line.courseId];
      if (!c) return;
      if (line.promo) {
        c.promoActive = true;
        c.promoPrice = line.price;
        c.resolvedPrice = line.price;
      } else {
        c.promoActive = false;
        c.promoPrice = null;
        c.slotsRemaining = 0;
        c.resolvedPrice = (line.price != null ? line.price : c.basePrice);
      }
    });
  }

  /* ── Backend sync ── */
  async function syncWithBackend(reference, firstname, matricNo, surname, contactEmail, courseIds, reservationTokens) {
    try {
      const res = await fetch(`${BASE}/api/exam-credentials/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference, firstname, matricNo, surname, contactEmail, courseIds, reservationTokens: reservationTokens || [] }),
      });

      setLoading(false);

      if (res.ok) {
        const data = await res.json();
        showSuccess(reference, data.message, data.assignedBatches);
      } else {
        const data = await res.json().catch(() => ({}));
        const msg = data.error?.message || data.message || 'Registration did not go through on our end.';
        showError(msg, reference);
      }
    } catch {
      setLoading(false);
      showError('Network error. Your payment was received but registration did not complete. Contact support with your reference.', reference);
    }
  }

  /* ── Success: a short "what happens next" sequence ── */
  function showSuccess(reference, serverMsg, assignedBatches) {
    formContent.style.display = 'none';
    document.body.classList.remove('courses-ready'); // hide sticky bar
    resultEl.classList.add('show');

    // Group-join block, given real prominence.
    let waBlock = '';
    let batchBlock = '';
    if (assignedBatches && typeof assignedBatches === 'object') {
      const entries = Object.entries(assignedBatches);

      // Batch assignment — the single most important thing on this page, pulled
      // out of the step text into its own scannable course → batch list.
      const batchRows = entries.map(([code, batch]) => `
        <li class="batch-row">
          <span class="batch-course">${esc(code)}</span>
          <span class="batch-tag">Batch ${esc(String(batch))}</span>
        </li>`).join('');
      batchBlock = `
        <div class="batch-block">
          <div class="batch-label">Your batch${entries.length === 1 ? '' : 'es'}</div>
          <ul class="batch-list">${batchRows}</ul>
        </div>`;

      const rows = entries.map(([code, batch]) => {
        const course = allCourses.find(c => c.CourseCode === code);
        const link = course?.GroupChatLink;
        const btn = link
          ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer" class="wa-btn">
               <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
               Join group
             </a>`
          : '<span class="wa-course" style="color:var(--ink-faint)">Group link coming soon</span>';
        return `<li class="wa-row"><span class="wa-course"><span class="b">${esc(code)}</span> group chat</span>${btn}</li>`;
      }).join('');

      waBlock = `
        <div class="wa-block">
          <ul class="wa-list">${rows}</ul>
        </div>`;
    }

    resultEl.classList.remove('is-error');
    resultEl.innerHTML = `
      <div class="doc-card">
        <div class="doc-card-band">
          <span class="seal">&#10003;</span>
          <div>
            <h2>You are registered</h2>
            <p>Payment received. Reference on file below.</p>
          </div>
        </div>
        <div class="doc-card-body">
          ${batchBlock}
          <div class="next-steps">
            <h3>What happens next</h3>

            <div class="step">
              <span class="step-num">1</span>
              <div class="step-body">
                <div class="st-title">Join your course group</div>
                <div class="st-desc">Timetable, batch calls, and support all happen in the group chat. Join now so you do not miss your slot.</div>
                ${waBlock}
              </div>
            </div>

            <div class="step">
              <span class="step-num">2</span>
              <div class="step-body">
                <div class="st-title">Wait for your batch to be called</div>
                <div class="st-desc">Password release runs in batches. Do not request your Moodle password before your batch is announced in the group.</div>
              </div>
            </div>

            <div class="step">
              <span class="step-num">3</span>
              <div class="step-body">
                <div class="st-title">Get your password on exam day</div>
                <div class="st-desc">When your batch is called, use the <a href="password.html"><strong>Get Password</strong></a> page to pull your Moodle login. A copy is also emailed to you.</div>
              </div>
            </div>
          </div>

          <div class="ref-box">Reference: <span class="ref-value">${esc(reference)}</span></div>
          <div class="card-actions">
            <button class="btn btn--ghost" id="back-btn" type="button">Register another student</button>
          </div>
        </div>
      </div>`;

    document.getElementById('back-btn').addEventListener('click', reset);
    if (window.lucide) lucide.createIcons();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showError(msg, reference) {
    formContent.style.display = 'none';
    resultEl.classList.add('show', 'is-error');
    resultEl.innerHTML = `
      <div class="doc-card">
        <div class="doc-card-band is-err">
          <span class="seal">!</span>
          <div>
            <h2>Registration error</h2>
            <p>Your payment may have gone through.</p>
          </div>
        </div>
        <div class="doc-card-body">
          <p style="font-size:14.5px;color:var(--ink-soft)">${esc(msg)}</p>
          ${reference ? `<div class="ref-box">Reference: <span class="ref-value">${esc(reference)}</span><br>Send this reference to <a href="mailto:eakinseloyin@gmail.com">support</a> and we will sort it out.</div>` : ''}
          <div class="card-actions">
            <button class="btn" id="back-btn" type="button">Try again</button>
          </div>
        </div>
      </div>`;
    document.getElementById('back-btn').addEventListener('click', reset);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function reset() {
    resultEl.classList.remove('show', 'is-error');
    resultEl.innerHTML = '';
    formContent.style.display = 'block';
    document.body.classList.add('courses-ready');
    form.reset();
    selected.clear();
    searchQuery = '';
    if (searchInput) searchInput.value = '';
    renderGroups();
    renderTicket();
    ['firstname-group', 'surname-group', 'matric-group', 'contactemail-group', 'courses-group'].forEach(clearErr);
    firstnameInput.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : s;
    return d.innerHTML;
  }

  return { init, renderCourses };
})();

document.addEventListener('DOMContentLoaded', async () => {
  Register.init();

  const [courses, portal] = await Promise.all([
    API.fetchCourses(),
    API.checkPortalStatus(), // hits the same /api/exam-setting used for the portal lock
  ]);

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

  Register.renderCourses(courses, { categoriesExpandedByDefault: portal.categoriesExpandedByDefault });
});
