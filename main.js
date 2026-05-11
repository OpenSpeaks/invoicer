(function () {
  const EMAILJS_PUBLIC_KEY = 'tGxnWGzlBZ_6C7Dio'; // YOUR_PUBLIC_KEY
  const EMAILJS_SERVICE_ID = 'service_8pfqso6'; // YOUR_SERVICE_ID
  const EMAILJS_ARCHIVE_TEMPLATE_ID = ''; // YOUR_ARCHIVE_TEMPLATE_ID
  const EMAILJS_USER_TEMPLATE_ID = 'template_8q2j6ss'; // YOUR_USER_TEMPLATE_ID

  emailjs.init({
    publicKey: EMAILJS_PUBLIC_KEY
  });

  const form = document.getElementById('reimbursement-form');
  const statusEl = document.getElementById('status');
  const amountInput = document.getElementById('amount');
  const allowanceInput = document.getElementById('allowance');
  const totalInput = document.getElementById('total');

  function setStatus(message) {
    statusEl.textContent = message;
  }

  function toMoney(value) {
    const num = Number(value || 0);
    return num.toFixed(2);
  }

  function updateTotal() {
    const amount = Number(amountInput.value || 0);
    const allowance = Number(allowanceInput.value || 0);
    totalInput.value = (amount + allowance).toFixed(2);
  }

  amountInput.addEventListener('input', updateTotal);
  allowanceInput.addEventListener('input', updateTotal);

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

    doc.text(`Date: ${templateData.date}`, left, y);
    y += 8;

    y = wrapText(
      doc,
      `From: ${templateData.name} (contact: Phone ${templateData.phone || '-'}, Email: ${templateData.email || '-'})`,
      left,
      y,
      170,
      6
    );
    y += 2;

    doc.text(`To: ${templateData.billed_name}`, left, y);
    y += 8;

    doc.setFont('helvetica', 'bold');
    doc.text(`Reimbursement # ${templateData.form_no}`, left, y);
    y += 10;

    doc.setFont('helvetica', 'bold');
    doc.text('Description', left, y);
    doc.text('Amount in Indian Rupees', 130, y, { align: 'left' });
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
    wrapText(
      doc,
      `SHA-256 hash of this PDF: ${pdfHash}`,
      left,
      32,
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

  async function sendArchiveEmail(params) {
    return emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_ARCHIVE_TEMPLATE_ID,
      params
    );
  }

  async function sendUserEmail(params) {
    return emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_USER_TEMPLATE_ID,
      {
        ...params,
        to_email: params.email
      }
    );
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    setStatus('Processing...');

    updateTotal();

    const formData = new FormData(form);

    const templateData = {
      date: formData.get('date') || '',
      name: (formData.get('name') || '').trim(),
      phone: (formData.get('phone') || '').trim(),
      email: (formData.get('email') || '').trim(),
      billed_name: (formData.get('billed_name') || '').trim(),
      form_no: (formData.get('form_no') || '').trim(),
      amount: toMoney(formData.get('amount')),
      allowance: toMoney(formData.get('allowance')),
      total: toMoney(formData.get('total'))
    };

    if (!templateData.phone && !templateData.email) {
      setStatus('Please provide at least a phone number or an email address.');
      return;
    }

    if (
      !templateData.date ||
      !templateData.name ||
      !templateData.billed_name ||
      !templateData.form_no
    ) {
      setStatus('Please fill all required fields.');
      return;
    }

    try {
      const { blob, hash } = await buildPdf(templateData);

      downloadBlob(blob, `reimbursement-${templateData.form_no}.pdf`);

      const emailParams = {
        ...templateData,
        pdf_hash: hash
      };

      await sendArchiveEmail(emailParams);

      if (templateData.email) {
        await sendUserEmail(emailParams);
      }

      setStatus('Done. PDF downloaded and email sent.');
      form.reset();
      totalInput.value = '';
    } catch (error) {
      console.error(error);
      setStatus('Something went wrong while generating or sending the form.');
    }
  });
})();
