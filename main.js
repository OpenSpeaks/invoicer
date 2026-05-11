/* =============================================================
   OpenSpeaks Reimbursement Form — main.js
   Static GitHub Pages deployment (no backend).
   Dependencies: jsPDF (UMD), EmailJS browser SDK.
   ============================================================= */
(function () {
  'use strict';

  /* ── EmailJS config ── */
  const EMAILJS_PUBLIC_KEY  = 'tGxnWGzlBZ_6C7Dio';
  const EMAILJS_SERVICE_ID  = 'service_8pfqso6';
  const EMAILJS_TEMPLATE_ID = 'template_8q2j6ss';

  /* ── Anti-abuse constants ── */
  const MIN_FILL_SECONDS = 6;
  const BLOCK_HOURS      = 24;
  const STORAGE_KEY_LAST = 'openspeaks_reimbursement_last_submission';
  const STORAGE_KEY_TOKENS = 'openspeaks_reimbursement_used_tokens';

  /* ── Static recipient (never entered publicly) ── */
  const RECIPIENT_NAME = 'Subhashish Panigrahi';

  /* ── Initialise EmailJS ── */
  emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });

  /* ── DOM refs ── */
  const form        = document.getElementById('reimbursement-form');
  const statusEl    = document.getElementById('status');
  const dateInput   = document.getElementById('date');
  const phoneInput  = document.getElementById('phone');
  const emailInput  = document.getElementById('email');
  const nameInput   = document.getElementById('name');
  const amountInput = document.getElementById('amount');
  const allowInput  = document.getElementById('allowance');
  const totalInput  = document.getElementById('total');

  /* =============================================================
     UTILITY HELPERS
     ============================================================= */

  function setStatus(msg) {
    statusEl.textContent = msg;
  }

  function getNow() {
    return Date.now();
  }

  /* ── Page load time (for fast-submit guard) ── */
  window.__pageLoadTime = getNow();

  function wasSubmittedTooFast() {
    return (getNow() - window.__pageLoadTime) < MIN_FILL_SECONDS * 1000;
  }

  /* ── 24-hour same-browser block ── */
  function getLastSubmissionTime() {
    const raw = localStorage.getItem(STORAGE_KEY_LAST);
    return raw ? Number(raw) : 0;
  }

  function setLastSubmissionTime() {
    localStorage.setItem(STORAGE_KEY_LAST, String(getNow()));
  }

  function isBlockedFor24Hours() {
    const last = getLastSubmissionTime();
    if (!last) return false;
    return (getNow() - last) < BLOCK_HOURS * 3600 * 1000;
  }

  function getHoursRemaining() {
    const last = getLastSubmissionTime();
    if (!last) return 0;
    const remaining = BLOCK_HOURS * 3600 * 1000 - (getNow() - last);
    return remaining > 0 ? Math.ceil(remaining / 3600000) : 0;
  }

  /* ── Token tracking (soft, browser-local only) ── */
  function getUsedTokens() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY_TOKENS) || '[]');
    } catch (_) {
      return [];
    }
  }

  function markTokenUsed(token) {
    if (!token) return;
    const tokens = getUsedTokens();
    if (!tokens.includes(token)) {
      tokens.push(token);
      localStorage.setItem(STORAGE_KEY_TOKENS, JSON.stringify(tokens));
    }
  }

  function isTokenAlreadyUsed(token) {
    if (!token) return false;
    return getUsedTokens().includes(token);
  }

  function getUrlToken() {
    return new URLSearchParams(window.location.search).get('token') || '';
  }

  /* ── Pre-fill name from URL ── */
  function prefillFromUrl() {
    const urlName = new URLSearchParams(window.location.search).get('name');
    if (urlName && nameInput && !nameInput.value) {
      nameInput.value = urlName;
    }
  }

  /* ── Formatting helpers ── */
  function toMoney(value) {
    return Number(value || 0).toFixed(2);
  }

  function formatDateLong(isoDate) {
    if (!isoDate) return '';
    const [year, month, day] = isoDate.split('-').map(Number);
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    }).format(new Date(year, month - 1, day));
  }

  /* ── Set max date to today ── */
  function setMaxDateToday() {
    const d   = new Date();
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    const dd   = String(d.getDate()).padStart(2, '0');
    dateInput.max = `${yyyy}-${mm}-${dd}`;
  }

  /* ── Strip non-digits from phone input ── */
  function sanitizePhone() {
    if (!phoneInput) return;
    phoneInput.value = phoneInput.value.replace(/\D/g, '').slice(0, 10);
  }

  /* ── Auto-calculate total ── */
  function updateTotal() {
    const a = Number(amountInput.value || 0);
    const b = Number(allowInput.value  || 0);
    totalInput.value = (a + b).toFixed(2);
  }

  /* ── Generate initials from name ── */
  function getInitials(name) {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return 'XX';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }

  /* ── Pad sequence number to 3 digits ── */
  function padSequence(seq) {
    const n = Number(seq);
    if (!Number.isInteger(n) || n < 1 || n > 999) {
      throw new Error('Reimbursement number must be between 1 and 999.');
    }
    return String(n).padStart(3, '0');
  }

  /* ── Build form_no from name + sequence ── */
  function buildFormNo(name, seq) {
    return `${getInitials(name)}-${padSequence(seq)}`;
  }

  /* =============================================================
     PDF GENERATION
     ============================================================= */

  function wrapText(doc, text, x, y, maxWidth, lineHeight) {
    const lines = doc.splitTextToSize(text, maxWidth);
    lines.forEach((line) => {
      if (y > 280) {
        doc.addPage();
        y = 20;
      }
      doc.text(line, x, y);
      y += lineHeight;
    });
    return y;
  }

  async function sha256Hex(blob) {
    const buf    = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async function buildPdf(d) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const L = 20;
    let y   = 20;

    /* Title */
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Reimbursement Form', L, y);
    y += 10;

    /* Date / From / To */
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(`Date: ${d.date_long}`, L, y);
    y += 8;

    y = wrapText(
      doc,
      `From: ${d.name} (Phone: ${d.phone}, Email: ${d.email})`,
      L, y, 170, 6
    );
    y += 2;

    doc.text(`To: ${RECIPIENT_NAME}`, L, y);
    y += 8;

    /* Reimbursement number */
    doc.setFont('helvetica', 'bold');
    doc.text(`Reimbursement # ${d.form_no}`, L, y);
    y += 10;

    /* Table header */
    doc.setFont('helvetica', 'bold');
    doc.text('Description', L, y);
    doc.text('Amount in Indian Rupees', 190, y, { align: 'right' });
    y += 4;
    doc.line(L, y, 190, y);
    y += 8;

    /* Line items */
    doc.setFont('helvetica', 'normal');
    doc.text('OpenSpeaks language documentation', L, y);
    doc.text(d.amount, 190, y, { align: 'right' });
    y += 10;

    doc.text('Travel/accommodation allowance', L, y);
    doc.text(d.allowance, 190, y, { align: 'right' });
    y += 14;

    /* Total */
    doc.line(130, y, 190, y);
    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.text(`Total: ${d.total}`, 190, y, { align: 'right' });
    y += 14;

    /* Footer note */
    doc.setFont('helvetica', 'normal');
    y = wrapText(
      doc,
      'This is a digital invoice and does not need a signature.',
      L, y, 170, 6
    );

    /* ── Compute hash of the first-page PDF blob ── */
    const firstBlob = doc.output('blob');
    const pdfHash   = await sha256Hex(firstBlob);

    /* ── Page 2: Document Integrity ── */
    doc.addPage();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Document Integrity', L, 20);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(`Date: ${d.date_long}`, L, 32);

    wrapText(
      doc,
      `SHA-256 hash of this PDF: ${pdfHash}`,
      L, 44, 170, 6
    );

    const finalBlob = doc.output('blob');
    return { blob: finalBlob, hash: pdfHash };
  }

  /* ── Trigger browser download ── */
  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a   = Object.assign(document.createElement('a'), { href: url, download: fileName });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /* =============================================================
     EMAIL
     ============================================================= */

  function sendEmail(params) {
    return emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, params);
  }

  /* =============================================================
     ADMIN — LINK GENERATOR
     ============================================================= */

  function generateToken() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  function buildLink(name, token) {
    const base   = window.location.origin + window.location.pathname;
    const params = new URLSearchParams({ token, name });
    return `${base}?${params.toString()}`;
  }

  function renderLinks(names) {
    const output = document.getElementById('link-output');
    output.innerHTML = '';

    names.forEach((rawName) => {
      const name  = rawName.trim();
      if (!name) return;

      const token = generateToken();
      const url   = buildLink(name, token);

      const row = document.createElement('div');
      row.className = 'link-row';

      const nameEl = document.createElement('span');
      nameEl.className = 'link-name';
      nameEl.textContent = name;

      const urlEl = document.createElement('span');
      urlEl.className = 'link-url';
      urlEl.textContent = url;

      const copiedEl = document.createElement('span');
      copiedEl.className = 'copied-msg';

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'secondary';
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(url).then(() => {
          copiedEl.textContent = 'Copied!';
          setTimeout(() => { copiedEl.textContent = ''; }, 2000);
        }).catch(() => {
          /* Fallback for browsers without clipboard API */
          const ta = document.createElement('textarea');
          ta.value = url;
          ta.style.position = 'fixed';
          ta.style.opacity  = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
          copiedEl.textContent = 'Copied!';
          setTimeout(() => { copiedEl.textContent = ''; }, 2000);
        });
      });

      row.append(nameEl, urlEl, copyBtn, copiedEl);
      output.appendChild(row);
    });
  }

  /* =============================================================
     INIT
     ============================================================= */

  setMaxDateToday();
  prefillFromUrl();

  /* Live listeners */
  amountInput.addEventListener('input', updateTotal);
  allowInput.addEventListener('input', updateTotal);
  phoneInput.addEventListener('input', sanitizePhone);

  /* Admin toggle */
  document.getElementById('toggle-admin').addEventListener('click', () => {
    const section = document.getElementById('admin-section');
    section.classList.toggle('visible');
  });

  /* Generate links button */
  document.getElementById('generate-links-btn').addEventListener('click', () => {
    const raw   = document.getElementById('admin-names').value || '';
    const names = raw.split('\n').filter((l) => l.trim());
    if (!names.length) {
      document.getElementById('link-output').innerHTML = '<p class="small">Please enter at least one name.</p>';
      return;
    }
    renderLinks(names);
  });

  /* =============================================================
     FORM SUBMIT
     ============================================================= */

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    setStatus('Processing…');

    updateTotal();
    sanitizePhone();

    /* 1. Honeypot check */
    const honeypot = (form.querySelector('[name="website"]')?.value || '').trim();
    if (honeypot) {
      setStatus('Submission blocked.');
      return;
    }

    /* 2. Too-fast submission */
    if (wasSubmittedTooFast()) {
      setStatus(`Please wait at least ${MIN_FILL_SECONDS} seconds before submitting.`);
      return;
    }

    /* 3. 24-hour browser block */
    if (isBlockedFor24Hours()) {
      const h = getHoursRemaining();
      setStatus(`This browser has already submitted a reimbursement recently. Please try again in about ${h} hour(s).`);
      return;
    }

    /* 4. Token already used (soft check) */
    const urlToken = getUrlToken();
    if (urlToken && isTokenAlreadyUsed(urlToken)) {
      setStatus('This link has already been used in this browser.');
      return;
    }

    /* 5. Gather and validate values */
    const rawName     = (form.elements['name'].value     || '').trim();
    const rawEmail    = (form.elements['email'].value    || '').trim();
    const rawPhone    = (form.elements['phone'].value    || '').trim();
    const rawDate     =  form.elements['date'].value     || '';
    const rawSeq      =  form.elements['sequence_no'].value;
    const rawAmount   =  form.elements['amount'].value;
    const rawAllowance=  form.elements['allowance'].value;
    const rawTotal    =  form.elements['total'].value;

    if (!rawDate) {
      setStatus('Please select a date.');
      return;
    }

    if (!rawName) {
      setStatus('Please enter your name.');
      return;
    }

    if (!rawPhone && !rawEmail) {
      setStatus('Please provide at least a phone number or an email address.');
      return;
    }

    if (rawPhone && !/^\d{10}$/.test(rawPhone)) {
      setStatus('Phone number must be exactly 10 digits.');
      return;
    }

    /* 6. Build form number */
    let formNo = '';
    try {
      formNo = buildFormNo(rawName, rawSeq);
    } catch (err) {
      setStatus(err.message);
      return;
    }

    /* 7. Assemble template data */
    const tpl = {
      date:          rawDate,
      date_long:     formatDateLong(rawDate),
      name:          rawName,
      phone:         rawPhone  || '-',
      email:         rawEmail  || '-',
      email_or_phone: rawEmail || rawPhone || '-',
      form_no:       formNo,
      amount:        toMoney(rawAmount),
      allowance:     toMoney(rawAllowance),
      total:         toMoney(rawTotal),
    };

    /* 8. Generate PDF, download, then email */
    try {
      const { blob, hash } = await buildPdf(tpl);

      downloadBlob(blob, `reimbursement-${tpl.form_no}.pdf`);

      const emailParams = {
        ...tpl,
        pdf_hash: hash,
        reply_to: rawEmail || '',
      };

      const response = await sendEmail(emailParams);
      console.log('EmailJS success:', response);

      /* 9. Record submission */
      setLastSubmissionTime();
      if (urlToken) markTokenUsed(urlToken);

      setStatus(`Done. PDF downloaded and email sent. Reimbursement #: ${tpl.form_no}`);

      /* Reset form */
      form.reset();
      totalInput.value = '';
      setMaxDateToday();
      window.__pageLoadTime = getNow();

    } catch (err) {
      console.error('Error generating/sending form:', err);
      setStatus('Something went wrong while generating or sending the form. Please try again.');
    }
  });

})();
