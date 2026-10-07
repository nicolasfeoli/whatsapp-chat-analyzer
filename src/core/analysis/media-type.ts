/**
 * Works out what a media placeholder stands for: a photo, a video, a voice
 * note or audio file, a sticker, a GIF, a document, a contact card, a poll or
 * a location.
 *
 * Only some exports say. An iPhone export names the type in words ("sticker
 * omitted") or in the name of the attached file; an Android export made with
 * media names it in the file name; an Android export made without media
 * writes `<Media omitted>` for everything, which tells nothing.
 */

import type { MediaType } from '../types';

/** A pattern together with the type of media a placeholder matching it stands for. */
interface MediaTypeRule {
  readonly pattern: RegExp;
  readonly mediaType: MediaType;
}

/**
 * The rules, tried in order; the first one that matches decides.
 *
 * The order matters in three places. A GIF is exported as a video file whose
 * name says GIF (`GIF-20240113-WA0001.mp4`), and a video note is called "video
 * note", so the GIF rule comes before the video rule. A sticker is a `.webp`
 * image, so the sticker rule comes before the photo rule. And the rules for
 * the words come before the rules for file extensions, because the word is
 * what WhatsApp itself called the message.
 *
 * The words are the ones WhatsApp writes in English, Spanish, Portuguese,
 * German, French and Italian, as whole words so that "audio" inside a longer
 * word does not count.
 */
const MEDIA_TYPE_RULES: readonly MediaTypeRule[] = [
  {
    pattern: /^(?:poll|encuesta|enquete|umfrage|sondage|sondaggio):$/i,
    mediaType: 'poll',
  },
  {
    pattern:
      /^(?:location|ubicaci[oó]n|localiza[cç][aã]o|standort|localisation|posizione)\s?: https?:/i,
    mediaType: 'location',
  },
  { pattern: /(?<![\p{L}\p{N}])gif(?![\p{L}\p{N}])/iu, mediaType: 'gif' },
  {
    pattern: /(?<![\p{L}\p{N}])(?:stickers?|figurinha|autocollant|stk)(?![\p{L}\p{N}])|\.webp\b/iu,
    mediaType: 'sticker',
  },
  {
    pattern:
      /(?<![\p{L}\p{N}])(?:contact card|tarjeta de contacto|cart[aã]o de contato|kontaktkarte|fiche contact|scheda contatto)(?![\p{L}\p{N}])|\.vcf\b/iu,
    mediaType: 'contact',
  },
  {
    pattern:
      /(?<![\p{L}\p{N}])(?:v[ií]deos?|vid[eé]o|vid)(?![\p{L}\p{N}])|\.(?:mp4|mov|m4v|3gp|mkv|webm)\b/iu,
    mediaType: 'video',
  },
  {
    pattern:
      /(?<![\p{L}\p{N}])(?:audio|[aá]udio|ptt|aud)(?![\p{L}\p{N}])|\.(?:opus|ogg|m4a|mp3|aac|wav|amr)\b/iu,
    mediaType: 'audio',
  },
  {
    pattern:
      /(?<![\p{L}\p{N}])(?:image|imagen|imagem|bild|immagine|photo|img)(?![\p{L}\p{N}])|\.(?:jpe?g|png|heic|heif)\b/iu,
    mediaType: 'photo',
  },
  {
    pattern:
      /(?<![\p{L}\p{N}])(?:document|documento|dokument|doc)(?![\p{L}\p{N}])|\.(?:pdf|docx?|xlsx?|pptx?|txt|csv|zip)\b/iu,
    mediaType: 'document',
  },
];

/**
 * The iPhone marker for an attached file, `<attached: 00012-PHOTO-2024-01-13.jpg>`
 * in any language: angle brackets around a word, a colon and the file name,
 * which is captured. A caption may stand before it on the same line.
 */
const IPHONE_ATTACHMENT_FILE_NAME_PATTERN = /<[^<>:]+:\s*(?<fileName>[^<>]+)>/;

/**
 * Picks the part of a placeholder that names the media. For an iPhone
 * attachment that is the file name alone, so a caption such as "watch this
 * video" in front of a photo does not decide the type.
 */
function selectTypeBearingText(placeholderText: string): string {
  /* A caption or the options of a poll follow on later lines and say nothing about the type. */
  const firstLine = placeholderText.split('\n', 1)[0] ?? '';
  const attachedFileName =
    IPHONE_ATTACHMENT_FILE_NAME_PATTERN.exec(firstLine)?.groups?.['fileName'];
  return (attachedFileName ?? firstLine).trim();
}

/**
 * Works out what kind of media a placeholder stands for.
 *
 * @param placeholderText - The body of a media message as the export wrote it,
 *   for example `sticker omitted`, `<attached: 00012-PHOTO-2024-01-13.jpg>`,
 *   `VID-20240113-WA0001.mp4 (file attached)` or `<Media omitted>`.
 * @returns The type, or `'unknown'` when the placeholder does not say.
 */
export function identifyMediaType(placeholderText: string): MediaType {
  const typeBearingText = selectTypeBearingText(placeholderText);

  for (const rule of MEDIA_TYPE_RULES) {
    if (rule.pattern.test(typeBearingText)) {
      return rule.mediaType;
    }
  }
  return 'unknown';
}
