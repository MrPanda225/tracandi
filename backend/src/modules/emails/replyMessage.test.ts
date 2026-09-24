import { describe, expect, it } from 'vitest';
import { buildReplyMessage, replySubjectOf } from './replyMessage.js';

const decodeBody = (message: string): string =>
  Buffer.from(message.split('\r\n\r\n')[1]?.replace(/\r\n/g, '') ?? '', 'base64').toString('utf8');

const REPLY = {
  to: 'camille.durand@atelier-nova.example',
  subject: 'Re: Votre candidature — Data Analyst',
  inReplyTo: '<CAF1234@mail.atelier-nova.example>',
  references: ['<CAF1000@mail.gmail.com>', '<CAF1234@mail.atelier-nova.example>'],
  body: 'Bonjour Madame Durand,\n\nJe me permets de revenir vers vous au sujet de ma candidature.',
};

describe('replySubjectOf', () => {
  it('[EF-CAN-17] answers « Re: » the subject of the thread, never « Re: Re: »', () => {
    expect(replySubjectOf('Votre candidature')).toBe('Re: Votre candidature');
    expect(replySubjectOf('RE: Votre candidature')).toBe('RE: Votre candidature');
    expect(replySubjectOf('re : Votre candidature')).toBe('re : Votre candidature');
  });

  it('[EF-CAN-17] names the application when the thread has no subject', () => {
    expect(replySubjectOf(null, 'Data Analyst')).toBe('Relance — candidature Data Analyst');
  });
});

describe('buildReplyMessage', () => {
  it('[EF-CAN-17] writes a reply in the thread: recipient, subject, In-Reply-To and References', () => {
    const message = buildReplyMessage(REPLY);

    expect(message).toContain('To: camille.durand@atelier-nova.example\r\n');
    expect(message).toContain('In-Reply-To: <CAF1234@mail.atelier-nova.example>\r\n');
    expect(message).toContain('References: <CAF1000@mail.gmail.com> <CAF1234@mail.atelier-nova.example>\r\n');
    expect(message).toContain('Content-Type: text/plain; charset=UTF-8\r\n');
    expect(decodeBody(message)).toBe(REPLY.body.replace(/\n/g, '\r\n'));
  });

  it('[EF-CAN-17] encodes an accented subject (RFC 2047), readable once decoded', () => {
    const subject = /^Subject: =\?UTF-8\?B\?([^?]+)\?=\r$/m.exec(buildReplyMessage(REPLY))?.[1] ?? '';

    expect(Buffer.from(subject, 'base64').toString('utf8')).toBe('Re: Votre candidature — Data Analyst');
  });

  it('[ENF-SEC-04] never lets a line break in a header add another header', () => {
    const message = buildReplyMessage({
      ...REPLY,
      to: 'rh@atelier-nova.example\r\nBcc: espion@example.com',
      inReplyTo: '<id@x>\nBcc: espion@example.com',
      subject: 'Candidature\r\nBcc: espion@example.com',
    });
    const headers = message.split('\r\n\r\n')[0] ?? '';

    expect(headers.split('\r\n').filter((line) => /^bcc:/i.test(line))).toEqual([]);
  });

  it('[EF-CAN-17] leaves out In-Reply-To and References when the thread gives no message id', () => {
    const message = buildReplyMessage({ ...REPLY, inReplyTo: null, references: [] });

    expect(message).not.toContain('In-Reply-To');
    expect(message).not.toContain('References');
  });
});
