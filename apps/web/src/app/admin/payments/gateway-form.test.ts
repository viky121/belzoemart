import { buildCredentialsPayload, changesKeyMode, EMPTY_FORM, generateWebhookSecret } from './gateway-form';

const form = (over: Partial<typeof EMPTY_FORM>) => ({ ...EMPTY_FORM, ...over });

describe('buildCredentialsPayload', () => {
  it('sends only what was typed, trimmed', () => {
    expect(buildCredentialsPayload(form({ webhookSecret: '  abcdef123456  ' }))).toEqual({
      payload: { webhookSecret: 'abcdef123456' },
    });
    expect(
      buildCredentialsPayload(form({ keyId: ' rzp_live_Abc12345 ', keySecret: 'a-long-enough-secret' })),
    ).toEqual({ payload: { keyId: 'rzp_live_Abc12345', keySecret: 'a-long-enough-secret' } });
  });

  it('refuses an empty form', () => {
    expect(buildCredentialsPayload(EMPTY_FORM)).toMatchObject({ error: expect.stringMatching(/at least one/) });
  });

  it('needs the key id and secret together', () => {
    expect(buildCredentialsPayload(form({ keyId: 'rzp_live_Abc12345' }))).toMatchObject({
      error: expect.stringMatching(/together/),
    });
    expect(buildCredentialsPayload(form({ keySecret: 'a-long-enough-secret' }))).toMatchObject({
      error: expect.stringMatching(/together/),
    });
  });

  it('catches the usual mix-ups before sending anything', () => {
    // secret pasted into the Key ID box
    expect(buildCredentialsPayload(form({ keyId: 'G9dwc5ooPJxsd0Ez', keySecret: 'a-long-enough-secret' }))).toMatchObject({
      error: expect.stringMatching(/rzp_live_/),
    });
    expect(buildCredentialsPayload(form({ keyId: 'rzp_live_Abc12345', keySecret: 'short' }))).toMatchObject({
      error: expect.stringMatching(/too short/),
    });
    expect(buildCredentialsPayload(form({ webhookSecret: 'abc' }))).toMatchObject({
      error: expect.stringMatching(/8 characters/),
    });
  });
});

describe('generateWebhookSecret', () => {
  it('makes a long random hex string, different each time', () => {
    const a = generateWebhookSecret();
    const b = generateWebhookSecret();
    expect(a).toMatch(/^[0-9a-f]{48}$/);
    expect(a).not.toBe(b);
    expect(generateWebhookSecret(8)).toHaveLength(16);
  });
});

describe('changesKeyMode', () => {
  it('flags a switch between live and test keys only', () => {
    expect(changesKeyMode('live', 'rzp_test_abc12345')).toBe(true);
    expect(changesKeyMode('test', 'rzp_live_abc12345')).toBe(true);
    expect(changesKeyMode('live', 'rzp_live_other1234')).toBe(false);
    expect(changesKeyMode('live', '')).toBe(false);
  });
});
