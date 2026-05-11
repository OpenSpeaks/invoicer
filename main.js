(function () {
  const EMAILJS_PUBLIC_KEY = 'tGxnWGzlBZ_6C7Dio';
  const EMAILJS_SERVICE_ID = 'service_8pfqso6';
  const EMAILJS_TEMPLATE_ID = 'template_8q2j6ss';

  const MIN_FILL_SECONDS = 6;
  const BLOCK_HOURS = 24;
  const STORAGE_KEY_LAST_SUBMISSION = 'openspeaks_reimbursement_last_submission';
  const STORAGE_KEY_USED_TOKENS = 'openspeaks_reimbursement_used_tokens';

  emailjs.init({
    publicKey: EMAILJS_PUBLIC_KEY
  });

  const form = document.getElementById('reimbursement-form');
  const statusEl = document.getElementById('status');
  const dateInput = document.getElementById('date');
  const phoneInput = document.getElementById('phone');
  const amountInput = document.getElementById('amount');
  const allowanceInput = document.getElementById('allowance');
  const totalInput = document.getElementById('total');
  const nameInput = document.getElementById('name');

  function setStatus(message) {
    statusEl.textContent = message;
  }

  function getNow() {
    return Date.now();
  }

  function setPageLoadTime() {
    window.__pageLoadTime = getNow();
  }

  function getPageLoadTime() {
    return window.__pageLoadTime || getNow();
  }

  function wasSubmittedTooFast() {
    const elapsedMs = getNow() - getPageLoadTime();
    return elapsedMs < MIN_FILL_SECONDS * 1000;
  }

  function getLastSubmissionTime() {
    const raw = localStorage.getItem(STORAGE_KEY_LAST_SUBMISSION);
    return raw ? Number(raw) : 0;
  }

  function setLastSubmissionTime() {
    localStorage.setItem(STORAGE_KEY_LAST_SUBMISSION, String(getNow()));
  }

  function isBlockedFor24Hours() {
    const last = getLastSubmissionTime();
    if (!last) return false;
    const diff = getNow() - last;
    return diff < BLOCK_HOURS * 60 * 60 * 1000;
  }

  function getHoursRemaining() {
    const last = getLastSubmissionTime();
    if (!last) return 0;
    const diff = getNow() - last;
    const remaining = BLOCK_HOURS * 60 * 60 * 1000 - diff;
    return remaining > 0 ? Math.ceil(remaining / (60 * 60 * 1000)) : 0;
  }

  function getUsedTokens() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY_USED_TOKENS) || '[]');
    } catch (e) {
      return [];
    }
  }

  function setUsedTokens(tokens) {
    localStorage.setItem(STORAGE_KEY_USED_TOKENS, JSON.stringify(tokens));
  }

  function markTokenUsed(token) {
    if (!token) return;
    const tokens = getUsedTokens();
    if (!tokens.includes(token)) {
      tokens.push(token);
      setUsedTokens(tokens);
    }
  }

  function isTokenAlreadyUsed(token) {
    if (!token) return false;
    return getUsedTokens().includes(token);
  }

  function getUrlToken() {
    const params = new URLSearchParams(window.location.search);
    return params.get('token') || '';
  }

  function prefillFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const name = params.get('name');

    if (name && nameInput && !nameInput.value) {
      nameInput.value = name;
    }
  }

  function toMoney(value) {
    const num = Number(value || 0);
    return num.toFixed(2);
  }

  function formatDateLong(isoDate) {
    if (!isoDate) return '';
    const [year, month, day] = isoDate.split('-').map(Number);
    const dt = new Date(year, month - 1, day);
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    }).format(dt);
  }

  function setMaxDateToday() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dateInput.max = `${yyyy}-${mm}-${dd}`;
  }

  function sanitizePhoneInput() {
    if (!phoneInput) return;
    phoneInput.value = phoneInput.value.replace(/\D/g, '').slice(0, 10);
  }

  function updateTotal() {
    const amount = Number(amountInput.value || 0);
    const allowance = Number(allowanceInput.value || 0);
    totalInput.value = (amount + allowance).toFixed(2);
  }

  function getInitials(name) {
    const words = name.trim().split(/\s+/).filter(Boolean);

    if (words.length === 0) return 'XX';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();

    const firstInitial = words[0][0] || '';
    const lastInitial = words[words.length - 1][0] || '';
    return `${firstInitial}${lastInitial}`.toUpperCase();
  }

  function padSequence(sequenceValue) {
    const num = Number(sequenceValue);
    if (!Number.isInteger(num) || num < 1 || num > 999) {
      throw new Error('Sequence number must be between 1 and 999.');
    }
    return String(num).padStart(3, '0');
  }

  function buildFormNumber(name, sequenceValue) {
    const initials = getInitials(name);
    const padded = padSequence(sequenceValue);
    return `${initials}-${padded}`;
  }

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

  async function sha256HexFromBlob(blob) {
    const buffer = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    const bytes = Array.from(new Uint8Array(digest));
    return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function buildPdf(templateData) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });

    const left = 20;
    let y = 20;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Reimbursement Form', left, y);
    y += 10;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);

    doc.text(`Date: ${templateData.date_long}`, left, y);
    y += 8;

    y = wrapText(
      doc,
      `From: ${templateData.name} (contact: Phone ${templateData.phone}, Email: ${templateData.email})`,
      left,
      y,
      170,
      6
    );
    y += 2;

    doc.text('To: Subhashish Panigrahi', left, y);
    y += 8;

    doc.setFont('helvetica', 'bold');
    doc.text(`Reimbursement # ${templateData.form_no}`, left, y);
    y += 10;

    doc.setFont('helvetica', 'bold');
    doc.text('Description', left, y);
    doc.text('Amount in Indian Rupees', 190, y, { align: 'right' });
    y += 4;

    doc.line(left, y, 190, y);
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.text('OpenSpeaks language documentation', left, y);
    doc.text(templateData.amount, 190, y, { align: 'right' });
    y += 10;

    doc.text('Travel/accommodation allowance', left, y);
    doc.text(templateData.allowance, 190, y, { align: 'right' });
    y += 14;

    doc.line(130, y, 190, y);
    y += 8;

    doc.setFont('helvetica', 'bold');
    doc.text(`Total: ${templateData.total}`, 190, y, { align: 'right' });
    y += 14;

    doc.setFont('helvetica', 'normal');
    y = wrapText(
      doc,
      'This is a digital invoice and does not need a signature.',
      left,
      y,
      170,
      6
    );

    const firstBlob = doc.output('blob');
    const pdfHash = await sha256HexFromBlob(firstBlob);

    doc.addPage();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Document Integrity', left, 20);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(`Date: ${templateData.date_long}`, left, 32);

    wrapText(
      doc,
      `SHA-256 hash of this PDF: ${pdfHash}`,
      left,
      44,
      170,
      6
    );

    const finalBlob = doc.output('blob');
    return { blob: finalBlob, hash: pdfHash };
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function sendEmail(params) {
    return emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID,
      params
    );
  }

  setPageLoadTime();
  setMaxDateToday();
  prefillFromUrl();

  amountInput.addEventListener('input', updateTotal);
  allowanceInput.addEventListener('input', updateTotal);
  phoneInput.addEventListener('input', sanitizePhoneInput);

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    setStatus('Processing...');

    updateTotal();
    sanitizePhoneInput();

    const honeypotValue = (form.querySelector('[name="website"]')?.value || '').trim();
    if (honeypotValue) {
      setStatus('Submission blocked.');
      return;
    }

    if (wasSubmittedTooFast()) {
      setStatus(`Please wait at least ${MIN_FILL_SECONDS} seconds before submitting.`);
      return;
    }

    if (isBlockedFor24Hours()) {
      const hours = getHoursRemaining();
      setStatus(`This browser has already submitted a reimbursement recently. Please try again in about ${hours} hour(s).`);
      return;
    }

    const urlToken = getUrlToken();
    if (urlToken && isTokenAlreadyUsed(urlToken)) {
      setStatus('This link has already been used in this browser.');
      return;
    }

    const formData = new FormData(form);

    const rawName = (formData.get('name') || '').trim();
    const rawEmail = (formData.get('email') || '').trim();
    const rawPhone = (formData.get('phone') || '').trim();
    const rawDate = formData.get('date') || '';
    const rawSequence = formData.get('sequence_no');

    if (!rawPhone && !rawEmail) {
      setStatus('Please provide at least a phone number or an email address.');
      return;
    }

    if (rawPhone && !/^\d{10}$/.test(rawPhone)) {
      setStatus('Phone number must be exactly 10 digits.');
      return;
    }

    let formNumber = '';
    try {
      formNumber = buildFormNumber(rawName, rawSequence);
    } catch (err) {
      setStatus(err.message);
      return;
    }

    const templateData = {
      date: rawDate,
      date_long: formatDateLong(rawDate),
      name: rawName,
      phone: rawPhone || '-',
      email: rawEmail || '-',
      email_or_phone: rawEmail || rawPhone || '-',
      form_no: formNumber,
      amount: toMoney(formData.get('amount')),
      allowance: toMoney(formData.get('allowance')),
      total: toMoney(formData.get('total'))
    };

    if (!templateData.date || !templateData.name || !rawSequence) {
      setStatus('Please fill all required fields.');
      return;
    }

    try {
      const { blob, hash } = await buildPdf(templateData);

      downloadBlob(blob, `reimbursement-${templateData.form_no}.pdf`);

      const emailParams = {
        ...templateData,
        pdf_hash: hash,
        reply_to: rawEmail || ''
      };

      const response = await sendEmail(emailParams);
      console.log('EmailJS success:', response);

      setLastSubmissionTime();
      if (urlToken) {
        markTokenUsed(urlToken);
      }

      setStatus(`Done. PDF downloaded and email sent. Reimbursement number: ${templateData.form_no}`);
      form.reset();
      totalInput.value = '';
      setMaxDateToday();
      setPageLoadTime();
    } catch (error) {
      console.error('EmailJS / form error:', error);
      setStatus('Something went wrong while generating or sending the form.');
    }
  });
})();
