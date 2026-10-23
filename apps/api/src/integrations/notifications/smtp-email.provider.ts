import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { EmailMessage, EmailProvider } from './channels';

/**
 * SMTP email adapter (used when EMAIL_PROVIDER=live). Works with any SMTP
 * server — configured for Gmail by default. For Gmail: enable 2-Step
 * Verification and create an App Password; use the Gmail address as SMTP_USER
 * and the 16-char App Password as SMTP_PASS.
 */
@Injectable()
export class SmtpEmailProvider implements EmailProvider {
  private readonly logger = new Logger('SmtpEmailProvider');
  private readonly from = SmtpEmailProvider.buildFrom(
    process.env.EMAIL_FROM || process.env.SMTP_USER || '',
    process.env.EMAIL_FROM_NAME ?? 'Belzo eMart',
  );
  private transport?: nodemailer.Transporter;

  /**
   * Sender shown to customers: `Belzo eMart <address>`. An EMAIL_FROM that already carries a
   * display name (`Name <addr>`) is used as is; an empty EMAIL_FROM_NAME sends the bare address.
   */
  static buildFrom(address: string, displayName: string): string {
    const addr = address.trim();
    if (!addr || addr.includes('<')) return addr;
    const name = displayName.trim().replace(/["\r\n<>]/g, '');
    return name ? `"${name}" <${addr}>` : addr;
  }

  private get tx(): nodemailer.Transporter {
    if (!this.transport) {
      const port = Number(process.env.SMTP_PORT || 465);
      const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465;
      this.transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port,
        secure,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
    }
    return this.transport;
  }

  async send(msg: EmailMessage): Promise<{ messageId: string }> {
    const info = await this.tx.sendMail({
      from: this.from,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      ...(msg.attachments?.length
        ? {
            attachments: msg.attachments.map((a) => ({
              filename: a.filename,
              content: a.content,
              contentType: a.contentType,
            })),
          }
        : {}),
    });
    this.logger.log(`Email sent to ${msg.to} id=${info.messageId}`);
    return { messageId: info.messageId };
  }
}
