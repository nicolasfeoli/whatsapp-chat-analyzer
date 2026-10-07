import { describe, expect, it } from 'vitest';

import { findSiteOfLink } from '../../../src/core/analysis/link-hosts';

describe('findSiteOfLink', () => {
  describe('what is kept', () => {
    it.each([
      { description: 'an https link', link: 'https://example.com', expected: 'example.com' },
      { description: 'an http link', link: 'http://example.org', expected: 'example.org' },
      {
        description: 'a link without a scheme',
        link: 'www.example.com/page',
        expected: 'example.com',
      },
      {
        description: 'a host of two labels under a country code',
        link: 'https://example.es/hola',
        expected: 'example.es',
      },
      {
        description: 'a host with digits and a hyphen',
        link: 'https://my-site24.example/x',
        expected: 'my-site24.example',
      },
      {
        description: 'a host in another script',
        link: 'https://españa.example/x',
        expected: 'españa.example',
      },
      {
        description: 'a host with an encoded top-level domain',
        link: 'https://example.xn--p1ai/x',
        expected: 'example.xn--p1ai',
      },
    ])('reads the site of $description', ({ link, expected }) => {
      expect(findSiteOfLink(link)).toBe(expected);
    });

    it('writes the site in lower case', () => {
      expect(findSiteOfLink('HTTPS://WWW.Example.COM/Page')).toBe('example.com');
    });
  });

  describe('what is never kept', () => {
    it.each([
      { description: 'the path', link: 'https://example.com/album/ana-birthday' },
      { description: 'the query', link: 'https://example.com?invite=secret-code' },
      { description: 'a query after a path', link: 'https://example.com/join?invite=secret' },
      { description: 'the fragment', link: 'https://example.com#section-about-bob' },
      { description: 'the port', link: 'https://example.com:8443/admin' },
      { description: 'a user name and password', link: 'https://ana:secret@example.com/files' },
      {
        description: 'a user name with an @ in the path too',
        link: 'https://ana@example.com/@bob',
      },
      { description: 'a full stop that ends the sentence', link: 'https://example.com.' },
      { description: 'a comma after the link', link: 'https://example.com,' },
      { description: 'a closing bracket and a full stop', link: 'https://example.com).' },
      { description: 'a trailing slash', link: 'https://example.com/' },
    ])('drops $description', ({ link }) => {
      expect(findSiteOfLink(link)).toBe('example.com');
    });
  });

  describe('the front of the host', () => {
    it.each([
      { link: 'https://www.example.com', expected: 'example.com' },
      { link: 'https://m.example.com', expected: 'example.com' },
      { link: 'https://www.m.example.com', expected: 'example.com' },
      { link: 'www.example.com', expected: 'example.com' },
    ])('takes the edition off $link', ({ link, expected }) => {
      expect(findSiteOfLink(link)).toBe(expected);
    });

    it('keeps "m." when nothing but a top-level domain would be left', () => {
      expect(findSiteOfLink('https://m.example/abc')).toBe('m.example');
    });

    it('keeps "www." when nothing but a top-level domain would be left', () => {
      expect(findSiteOfLink('www.example')).toBe('www.example');
    });

    it('drops any other subdomain, which may name a person or a company', () => {
      expect(findSiteOfLink('https://ana-and-bob.shop.example.com/cart')).toBe('example.com');
    });
  });

  describe('under a country code', () => {
    it.each([
      { link: 'https://www.example.co.uk/news', expected: 'example.co.uk' },
      { link: 'https://tienda.example.com.ar', expected: 'example.com.ar' },
      { link: 'https://m.example.go.cr/tramites', expected: 'example.go.cr' },
      { link: 'https://www.example.org.mx', expected: 'example.org.mx' },
    ])('keeps three labels of $link', ({ link, expected }) => {
      expect(findSiteOfLink(link)).toBe(expected);
    });

    it('keeps two labels when the second-level label is the whole name', () => {
      /* `www` is taken off first, so `gov.uk` is not mistaken for a suffix with nothing in front. */
      expect(findSiteOfLink('https://www.gov.uk/register')).toBe('gov.uk');
    });

    it('keeps two labels when the label before the country code is not a known second level', () => {
      expect(findSiteOfLink('https://blog.example.es')).toBe('example.es');
    });

    it('keeps two labels when the top-level domain is not a country code', () => {
      expect(findSiteOfLink('https://shop.co.example')).toBe('co.example');
    });

    it('cuts a host under a second level it does not know one label too short', () => {
      /* `ltd.uk` is a real suffix that is not in the list: a known limit. */
      expect(findSiteOfLink('https://example.ltd.uk')).toBe('ltd.uk');
    });
  });

  describe('what is not a site', () => {
    it.each([
      { description: 'a bare address', link: 'http://192.168.0.1/admin' },
      { description: 'a bare address with a port', link: 'http://10.0.0.7:8080' },
      { description: 'a single word', link: 'http://localhost:3000' },
      { description: 'a scheme with nothing after it', link: 'https://' },
      { description: 'only "www."', link: 'www.' },
      { description: 'dots and nothing else', link: 'www...' },
      { description: 'an empty label', link: 'https://example..com' },
      { description: 'a label that starts with a hyphen', link: 'https://shop.-example.com' },
      { description: 'a top-level domain of one letter', link: 'https://example.c' },
      { description: 'a top-level domain with a digit', link: 'https://example.c0m' },
      { description: 'a host that starts with punctuation', link: 'https://(example.com)' },
      { description: 'an empty text', link: '' },
    ])('answers null for $description', ({ link }) => {
      expect(findSiteOfLink(link)).toBeNull();
    });

    it('answers null for a host longer than a host name can be', () => {
      const longLabel = 'a'.repeat(60);
      const hostOf260Characters = `${[longLabel, longLabel, longLabel, longLabel].join('.')}.example.com`;

      expect(hostOf260Characters.length).toBeGreaterThan(253);
      expect(findSiteOfLink(`https://${hostOf260Characters}`)).toBeNull();
    });
  });
});
