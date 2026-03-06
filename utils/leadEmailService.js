import nodemailer from 'nodemailer';

let cachedTransporter = null;

const getTransporter = () => {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const smtpSecure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const gmailUser = process.env.GMAIL_USER;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;

  if (smtpHost && smtpUser && smtpPass) {
    cachedTransporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });
    return cachedTransporter;
  }

  if (gmailUser && gmailAppPassword) {
    cachedTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailAppPassword,
      },
    });
    return cachedTransporter;
  }

  return null;
};

const formatMessage = (value) => {
  if (!value) return '-';
  const trimmed = String(value).trim();
  return trimmed || '-';
};

export const sendInstructorLeadEmail = async ({
  instructorEmail,
  instructorName,
  courseTitle,
  courseSlug,
  leadSource,
  leadName,
  leadEmail,
  leadPhone,
  leadCompany,
  leadMessage,
}) => {
  try {
    const safeEmail = String(instructorEmail || '').trim();
    if (!safeEmail) {
      return { sent: false, skipped: true, reason: 'missing_instructor_email' };
    }

    const transporter = getTransporter();
    if (!transporter) {
      return { sent: false, skipped: true, reason: 'smtp_not_configured' };
    }

    const senderName = process.env.SENDER_NAME || 'Satellite Streets Learning';
    const senderEmail =
      process.env.SENDER_EMAIL ||
      process.env.SMTP_USER ||
      process.env.GMAIL_USER ||
      'no-reply@satellitestreets.space';

    const safeInstructorName = formatMessage(instructorName);
    const safeCourseTitle = formatMessage(courseTitle);
    const safeCourseSlug = formatMessage(courseSlug);
    const safeLeadSource = formatMessage(leadSource);
    const safeLeadName = formatMessage(leadName);
    const safeLeadEmail = formatMessage(leadEmail);
    const safeLeadPhone = formatMessage(leadPhone);
    const safeLeadCompany = formatMessage(leadCompany);
    const safeLeadMessage = formatMessage(leadMessage);

    const subject = `New course request: ${safeCourseTitle}`;
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
        <h2 style="margin-bottom: 8px;">New learner request received</h2>
        <p style="margin-top: 0;">Hello ${safeInstructorName}, a learner has requested access to your course.</p>
        <h3 style="margin-bottom: 4px;">Course</h3>
        <p style="margin-top: 0; margin-bottom: 16px;">
          <strong>Title:</strong> ${safeCourseTitle}<br/>
          <strong>Slug:</strong> ${safeCourseSlug}
        </p>
        <h3 style="margin-bottom: 4px;">Learner details</h3>
        <p style="margin-top: 0; margin-bottom: 0;">
          <strong>Name:</strong> ${safeLeadName}<br/>
          <strong>Email:</strong> ${safeLeadEmail}<br/>
          <strong>Phone:</strong> ${safeLeadPhone}<br/>
          <strong>Organization:</strong> ${safeLeadCompany}<br/>
          <strong>Source:</strong> ${safeLeadSource}<br/>
          <strong>Message:</strong> ${safeLeadMessage}
        </p>
      </div>
    `;

    const result = await transporter.sendMail({
      from: `"${senderName}" <${senderEmail}>`,
      to: safeEmail,
      subject,
      html,
    });

    return { sent: true, messageId: result.messageId || null };
  } catch (error) {
    console.error('sendInstructorLeadEmail failed:', error);
    return { sent: false, skipped: false, reason: error?.message || 'unknown_error' };
  }
};
