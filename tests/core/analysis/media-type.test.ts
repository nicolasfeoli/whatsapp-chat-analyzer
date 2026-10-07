import { describe, expect, it } from 'vitest';

import { identifyMediaType } from '../../../src/core/analysis/media-type';

describe('identifyMediaType', () => {
  describe('iPhone placeholders for media left out of the export', () => {
    it.each([
      { text: 'image omitted', mediaType: 'photo' },
      { text: 'video omitted', mediaType: 'video' },
      { text: 'video note omitted', mediaType: 'video' },
      { text: 'audio omitted', mediaType: 'audio' },
      { text: 'sticker omitted', mediaType: 'sticker' },
      { text: 'sticker omitted.', mediaType: 'sticker' },
      { text: 'GIF omitted', mediaType: 'gif' },
      { text: 'document omitted', mediaType: 'document' },
      { text: 'Contact card omitted', mediaType: 'contact' },
      { text: 'imagen omitida', mediaType: 'photo' },
      { text: 'Video omitido', mediaType: 'video' },
      { text: 'vídeo omitido', mediaType: 'video' },
      { text: 'audio omitido', mediaType: 'audio' },
      { text: 'sticker omitido', mediaType: 'sticker' },
      { text: 'GIF omitido', mediaType: 'gif' },
      { text: 'documento omitido', mediaType: 'document' },
      { text: 'Tarjeta de contacto omitida', mediaType: 'contact' },
      { text: 'imagem ocultada', mediaType: 'photo' },
      { text: 'áudio ocultado', mediaType: 'audio' },
      { text: 'figurinha omitida', mediaType: 'sticker' },
      { text: 'Bild weggelassen', mediaType: 'photo' },
      { text: 'image omise', mediaType: 'photo' },
      { text: 'immagine omessa', mediaType: 'photo' },
    ])('reads "$text" as $mediaType', ({ text, mediaType }) => {
      expect(identifyMediaType(text)).toBe(mediaType);
    });
  });

  describe('iPhone attachments', () => {
    it.each([
      { text: '<attached: 00000042-PHOTO-2024-01-13-16-02-21.jpg>', mediaType: 'photo' },
      { text: '<attached: 00000043-VIDEO-2024-01-13-16-02-21.mp4>', mediaType: 'video' },
      { text: '<attached: 00000044-AUDIO-2024-01-13-16-02-21.opus>', mediaType: 'audio' },
      { text: '<attached: 00000045-STICKER-2024-01-13-16-02-21.webp>', mediaType: 'sticker' },
      { text: '<attached: 00000046-GIF-2024-01-13-16-02-21.mp4>', mediaType: 'gif' },
      { text: '<attached: 00000047-Invented budget.pdf>', mediaType: 'document' },
      { text: '<attached: 00000048-Invented person.vcf>', mediaType: 'contact' },
      { text: '<adjunto: 00000049-PHOTO-2024-01-13-16-02-21.jpg>', mediaType: 'photo' },
    ])('reads "$text" as $mediaType', ({ text, mediaType }) => {
      expect(identifyMediaType(text)).toBe(mediaType);
    });

    it('goes by the file name, not by a caption written before it', () => {
      const text = 'watch this video <attached: 00000050-PHOTO-2024-01-13-16-02-21.jpg>';

      expect(identifyMediaType(text)).toBe('photo');
    });

    it('goes by the first line, not by a caption on the lines after it', () => {
      const text = '<attached: 00000051-PHOTO-2024-01-13-16-02-21.jpg>\nmy new sticker album';

      expect(identifyMediaType(text)).toBe('photo');
    });
  });

  describe('Android attachments', () => {
    it.each([
      { text: 'IMG-20240113-WA0001.jpg (file attached)', mediaType: 'photo' },
      { text: 'VID-20240113-WA0002.mp4 (file attached)', mediaType: 'video' },
      { text: 'PTT-20240113-WA0003.opus (file attached)', mediaType: 'audio' },
      { text: 'AUD-20240113-WA0004.m4a (archivo adjunto)', mediaType: 'audio' },
      { text: 'STK-20240113-WA0005.webp (file attached)', mediaType: 'sticker' },
      { text: 'DOC-20240113-WA0006.pdf (file attached)', mediaType: 'document' },
      { text: 'Invented person.vcf (file attached)', mediaType: 'contact' },
    ])('reads "$text" as $mediaType', ({ text, mediaType }) => {
      expect(identifyMediaType(text)).toBe(mediaType);
    });
  });

  describe('polls and locations', () => {
    it.each(['POLL:', 'ENCUESTA:', 'UMFRAGE:'])('reads the poll header "%s" as a poll', (text) => {
      expect(identifyMediaType(text)).toBe('poll');
    });

    it('reads a poll by its header, whatever the question and the options say', () => {
      expect(identifyMediaType('POLL:\nWhich video tonight?\nOPTION: the GIF one (2 votes)')).toBe(
        'poll',
      );
    });

    it.each([
      'Location: https://maps.google.com/?q=9.93,-84.08',
      'Ubicación: https://maps.google.com/?q=9.93,-84.08',
    ])('reads "%s" as a location', (text) => {
      expect(identifyMediaType(text)).toBe('location');
    });
  });

  describe('placeholders that do not say what they stand for', () => {
    it.each(['<Media omitted>', '<Multimedia omitido>', '<Medien ausgeschlossen>', 'null', ''])(
      'reads "%s" as unknown',
      (text) => {
        expect(identifyMediaType(text)).toBe('unknown');
      },
    );
  });

  describe('the order of the rules', () => {
    it('reads a GIF, which is stored as a video file, as a GIF', () => {
      expect(identifyMediaType('GIF-20240113-WA0007.mp4 (file attached)')).toBe('gif');
    });

    it('reads a sticker, which is stored as an image file, as a sticker', () => {
      expect(identifyMediaType('<attached: 00000052-STICKER-2024-01-13.webp>')).toBe('sticker');
    });

    it('only takes whole words, so "audio" inside a longer word does not count', () => {
      expect(identifyMediaType('<attached: 00000053-audiobooks.pdf>')).toBe('document');
    });

    it('ignores the white space around the placeholder', () => {
      expect(identifyMediaType('  sticker omitted ')).toBe('sticker');
    });
  });
});
