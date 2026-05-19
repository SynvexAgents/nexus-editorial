import { describe, expect, it } from 'vitest';

/**
 * Regex sentinelle utilisée par l'Edge Function mark-post-published pour
 * valider une URL LinkedIn de post avant insertion dans published_posts.
 *
 * Doit accepter :
 *   - https://www.linkedin.com/posts/{author}-activity-{id}
 *   - https://linkedin.com/posts/...
 *   - https://www.linkedin.com/feed/update/urn:li:activity:...
 *
 * Doit rejeter :
 *   - http (non-HTTPS)
 *   - profil/sociétés/articles
 *   - autres domaines
 *
 * Source : mark-post-published/index.ts (LINKEDIN_URL_REGEX). Tests miroir
 * pour garantir qu'on ne régresse pas l'expression sur les mauvais cas.
 */
const LINKEDIN_URL_REGEX = /^https:\/\/(?:www\.)?linkedin\.com\/(?:posts|feed\/update)\//;

describe('LinkedIn post URL validator (mark-post-published)', () => {
  it('accepts standard /posts URL with www', () => {
    expect(
      LINKEDIN_URL_REGEX.test(
        'https://www.linkedin.com/posts/marouane-borsali_activity-7345678901234567890-abcd',
      ),
    ).toBe(true);
  });

  it('accepts /posts URL without www', () => {
    expect(
      LINKEDIN_URL_REGEX.test('https://linkedin.com/posts/some-author_activity-12345-abcd'),
    ).toBe(true);
  });

  it('accepts /feed/update URN form', () => {
    expect(
      LINKEDIN_URL_REGEX.test('https://www.linkedin.com/feed/update/urn:li:activity:1234'),
    ).toBe(true);
  });

  it('rejects http (non-secure)', () => {
    expect(
      LINKEDIN_URL_REGEX.test('http://www.linkedin.com/posts/marouane_activity-1234'),
    ).toBe(false);
  });

  it('rejects profile URLs', () => {
    expect(LINKEDIN_URL_REGEX.test('https://www.linkedin.com/in/marouane-borsali/')).toBe(false);
  });

  it('rejects company URLs', () => {
    expect(LINKEDIN_URL_REGEX.test('https://www.linkedin.com/company/synvex/')).toBe(false);
  });

  it('rejects articles URLs', () => {
    expect(
      LINKEDIN_URL_REGEX.test('https://www.linkedin.com/pulse/some-article-title-author'),
    ).toBe(false);
  });

  it('rejects URLs from other domains', () => {
    expect(LINKEDIN_URL_REGEX.test('https://twitter.com/posts/12345')).toBe(false);
    expect(LINKEDIN_URL_REGEX.test('https://fakelinkedin.com/posts/anything')).toBe(false);
  });

  it('rejects empty string and garbage input', () => {
    expect(LINKEDIN_URL_REGEX.test('')).toBe(false);
    expect(LINKEDIN_URL_REGEX.test('not a url')).toBe(false);
    expect(LINKEDIN_URL_REGEX.test('https://')).toBe(false);
  });
});
