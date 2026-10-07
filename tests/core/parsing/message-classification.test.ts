import { describe, expect, it } from 'vitest';

import {
  classifyMessageBody,
  isSystemNoticeSender,
  removeEditedMessageSuffix,
  splitSenderAndText,
} from '../../../src/core/parsing/message-classification';
import type { MessageBodyContext } from '../../../src/core/parsing/message-classification';
import { INVENTED_PHONE_NUMBER_SENDER } from '../../fixtures/special-characters';

/** A body somebody typed on an iPhone: bracketed line, no left-to-right mark. */
const TYPED_ON_IPHONE: MessageBodyContext = { isMarkedAsNotTyped: false, isBracketedLine: true };

/** A body WhatsApp generated on an iPhone: bracketed line, left-to-right mark in front. */
const NOT_TYPED_ON_IPHONE: MessageBodyContext = { isMarkedAsNotTyped: true, isBracketedLine: true };

/** Any body of an Android export, which never carries the left-to-right mark. */
const ON_ANDROID: MessageBodyContext = { isMarkedAsNotTyped: false, isBracketedLine: false };

/** The longest sender name still accepted as a contact name. */
const LONGEST_ACCEPTED_SENDER_NAME_LENGTH = 50;

/** The longest run of letters and spaces before the word "omitted" in an iPhone placeholder. */
const LONGEST_OMITTED_MEDIA_NAME_LENGTH = 40;

/** The longest text between angle brackets still taken for an Android media placeholder. */
const LONGEST_ANDROID_PLACEHOLDER_INNER_LENGTH = 60;

describe('splitSenderAndText', () => {
  it('splits a message at the colon and space after the sender', () => {
    expect(splitSenderAndText('Ana: hello')).toEqual({ sender: 'Ana', text: 'hello' });
  });

  it('splits at the first separator, so colons in the message stay in the text', () => {
    expect(splitSenderAndText('Ana: note: buy milk')).toEqual({
      sender: 'Ana',
      text: 'note: buy milk',
    });
  });

  it('keeps a phone number with spaces as the sender', () => {
    expect(splitSenderAndText(`${INVENTED_PHONE_NUMBER_SENDER}: hello`)).toEqual({
      sender: INVENTED_PHONE_NUMBER_SENDER,
      text: 'hello',
    });
  });

  it('trims the sender', () => {
    expect(splitSenderAndText('Ana : hello')?.sender).toBe('Ana');
  });

  it('does not trim the text', () => {
    expect(splitSenderAndText('Ana:  hello ')?.text).toBe(' hello ');
  });

  it('returns an empty text for a message with nothing after the separator', () => {
    expect(splitSenderAndText('Ana: ')).toEqual({ sender: 'Ana', text: '' });
  });

  it('returns null for a system notice, which has no separator', () => {
    expect(splitSenderAndText('Bob added Carl')).toBeNull();
  });

  it('returns null when a colon is not followed by a space', () => {
    expect(splitSenderAndText('Ana:hello')).toBeNull();
  });

  it('returns null when nothing precedes the separator', () => {
    expect(splitSenderAndText(': hello')).toBeNull();
  });

  it('returns null for an empty content', () => {
    expect(splitSenderAndText('')).toBeNull();
  });
});

describe('isSystemNoticeSender', () => {
  describe('real contact names', () => {
    it.each([
      'Ana',
      'Diego Mora',
      INVENTED_PHONE_NUMBER_SENDER,
      'Left Shark',
      'Juan Added',
      'Added',
      'Marta Joined',
      'Created By Bob',
      'Cambió',
    ])('keeps "%s" as a sender', (sender) => {
      expect(isSystemNoticeSender(sender)).toBe(false);
    });

    it('keeps a name of exactly fifty characters', () => {
      const sender = 'A'.repeat(LONGEST_ACCEPTED_SENDER_NAME_LENGTH);

      expect(isSystemNoticeSender(sender)).toBe(false);
    });
  });

  describe('beginnings of group notices that contain a colon', () => {
    it.each([
      { verb: 'changed', sender: 'Bob changed the group name to "Party' },
      { verb: 'changed', sender: 'Bob changed the subject from "a" to "b' },
      { verb: 'added', sender: 'Ana added Marta to "Trip' },
      { verb: 'removed', sender: 'Ana removed Diego from "Trip' },
      { verb: 'left', sender: 'Diego left "Trip' },
      { verb: 'joined', sender: 'Marta joined using the link to "Trip' },
      { verb: 'created', sender: 'Ana created group "Trip' },
      { verb: 'deleted', sender: 'Ana deleted the icon of "Trip' },
      { verb: 'cambió', sender: 'Ana cambió el asunto a "Viaje' },
      { verb: 'cambio (without the accent)', sender: 'Ana cambio el asunto a "Viaje' },
      { verb: 'añadió', sender: 'Ana añadió a Marta a "Viaje' },
      { verb: 'anadio (without ñ or accent)', sender: 'Ana anadio a Marta a "Viaje' },
      { verb: 'eliminó', sender: 'Ana eliminó a Diego de "Viaje' },
      { verb: 'salió', sender: 'Diego salió de "Viaje' },
      { verb: 'creó', sender: 'Ana creó el grupo "Viaje' },
      { verb: 'se unió', sender: 'Marta se unió con el enlace de "Viaje' },
    ])('recognises the verb $verb in "$sender"', ({ sender }) => {
      expect(isSystemNoticeSender(sender)).toBe(true);
    });

    it('recognises the verb in any letter case', () => {
      expect(isSystemNoticeSender('BOB CHANGED THE SUBJECT')).toBe(true);
    });

    it.each(['You\'re now an admin of "Trip', 'Ahora es admin. de "Viaje'])(
      'recognises the admin phrase in "%s"',
      (sender) => {
        expect(isSystemNoticeSender(sender)).toBe(true);
      },
    );
  });

  it('treats a "name" of fifty-one characters as a notice', () => {
    const sender = 'A'.repeat(LONGEST_ACCEPTED_SENDER_NAME_LENGTH + 1);

    expect(isSystemNoticeSender(sender)).toBe(true);
  });
});

describe('classifyMessageBody', () => {
  describe('typed text', () => {
    it('classifies an ordinary message as text', () => {
      expect(classifyMessageBody('happy new year', ON_ANDROID)).toBe('text');
    });

    it('classifies an empty message as text', () => {
      expect(classifyMessageBody('', TYPED_ON_IPHONE)).toBe('text');
    });
  });

  describe('Android media placeholders', () => {
    it.each([
      { language: 'English', text: '<Media omitted>' },
      { language: 'Spanish', text: '<Multimedia omitido>' },
      { language: 'Portuguese', text: '<Mídia oculta>' },
      { language: 'German', text: '<Medien ausgeschlossen>' },
      { language: 'French', text: '<Médias omis>' },
      { language: 'Italian', text: '<Media omessi>' },
      { language: 'a language nobody listed', text: '<Медиа пропущено>' },
    ])('classifies the $language placeholder "$text" as media', ({ text }) => {
      expect(classifyMessageBody(text, ON_ANDROID)).toBe('media');
    });

    it('classifies a placeholder surrounded by white space as media', () => {
      expect(classifyMessageBody('  <Media omitted> ', ON_ANDROID)).toBe('media');
    });

    it('classifies a placeholder with sixty characters between the brackets as media', () => {
      const text = `<${'a'.repeat(LONGEST_ANDROID_PLACEHOLDER_INNER_LENGTH)}>`;

      expect(classifyMessageBody(text, ON_ANDROID)).toBe('media');
    });

    it.each([
      {
        description: 'more than sixty characters between the brackets',
        text: `<${'a'.repeat(LONGEST_ANDROID_PLACEHOLDER_INNER_LENGTH + 1)}>`,
      },
      { description: 'empty brackets', text: '<>' },
      { description: 'two bracketed phrases', text: '<one> <two>' },
      { description: 'words before the brackets', text: 'look <Media omitted>' },
      { description: 'words after the brackets', text: '<Media omitted> lol' },
      { description: 'nested brackets', text: '<<Media omitted>>' },
    ])('classifies $description as text', ({ text }) => {
      expect(classifyMessageBody(text, ON_ANDROID)).toBe('text');
    });

    it('classifies a typed message that is only "<lol>" as media, a known limit of matching the shape', () => {
      expect(classifyMessageBody('<lol>', ON_ANDROID)).toBe('media');
    });
  });

  describe('iPhone "omitted" placeholders', () => {
    it.each([
      { language: 'English', text: 'image omitted' },
      { language: 'English', text: 'sticker omitted' },
      { language: 'English', text: 'GIF omitted' },
      { language: 'English', text: 'Contact card omitted' },
      { language: 'Spanish', text: 'imagen omitida' },
      { language: 'Spanish', text: 'GIF omitido' },
      { language: 'Portuguese', text: 'imagem ocultada' },
      { language: 'Portuguese', text: 'áudio ocultado' },
      { language: 'Portuguese', text: 'figurinha omitida' },
      { language: 'German', text: 'Bild weggelassen' },
      { language: 'French', text: 'image omise' },
      { language: 'French', text: 'GIF omis' },
      { language: 'Italian', text: 'immagine omessa' },
      { language: 'Italian', text: 'audio omesso' },
    ])(
      'classifies the $language placeholder "$text" carrying the left-to-right mark as media',
      ({ text }) => {
        expect(classifyMessageBody(text, NOT_TYPED_ON_IPHONE)).toBe('media');
      },
    );

    it.each(['image omitted', 'that part was omitted', 'la imagen fue omitida'])(
      'classifies "%s" without the left-to-right mark as text, because somebody typed it',
      (text) => {
        expect(classifyMessageBody(text, TYPED_ON_IPHONE)).toBe('text');
      },
    );

    it('does not trust the words on an Android line either', () => {
      expect(classifyMessageBody('image omitted', ON_ANDROID)).toBe('text');
    });

    describe('a marked line that only contains the words, which is some other notice', () => {
      it.each([
        { description: 'words after "omitted"', text: 'image omitted yesterday' },
        { description: 'something other than letters before the name', text: '1 image omitted' },
        { description: 'a name of a single letter', text: 'a omitted' },
        {
          description: 'a name of forty-one letters',
          text: `${'a'.repeat(LONGEST_OMITTED_MEDIA_NAME_LENGTH + 1)} omitted`,
        },
      ])('classifies $description as a system notice', ({ text }) => {
        expect(classifyMessageBody(text, NOT_TYPED_ON_IPHONE)).toBe('system-notice');
      });

      it.each([
        { description: 'a name of two letters', text: 'ab omitted' },
        {
          description: 'a name of forty letters',
          text: `${'a'.repeat(LONGEST_OMITTED_MEDIA_NAME_LENGTH)} omitted`,
        },
      ])('still classifies $description as media', ({ text }) => {
        expect(classifyMessageBody(text, NOT_TYPED_ON_IPHONE)).toBe('media');
      });
    });
  });

  describe('attachments included in the export', () => {
    /*
     * Every marker below follows a typed caption. A marker that is the whole
     * body would already be caught by the rule for any short `<...>` phrase,
     * and the test would pass without the list of languages being right.
     */
    it.each([
      { language: 'English', text: 'look <attached: 00001-PHOTO-2023-12-31-22-00-00.jpg>' },
      { language: 'English in capitals', text: 'look <ATTACHED: 00001-PHOTO.jpg>' },
      { language: 'Spanish', text: 'mira <adjunto: 00001-PHOTO-2023-12-31-22-00-00.jpg>' },
      { language: 'Portuguese', text: 'olha <anexado: 00001-PHOTO-2023-12-31-22-00-00.jpg>' },
      { language: 'German', text: 'schau <Anhang: 00001-PHOTO-2023-12-31-22-00-00.jpg>' },
      {
        language: 'French, with its space before the colon',
        text: 'regarde <pièce jointe : 00001-PHOTO-2023-12-31-22-00-00.jpg>',
      },
      { language: 'French without the accent', text: 'regarde <piece jointe: 00001-PHOTO.jpg>' },
      { language: 'Italian', text: 'guarda <allegato: 00001-PHOTO-2023-12-31-22-00-00.jpg>' },
    ])('classifies the $language iPhone attachment marker after a caption as media', ({ text }) => {
      expect(classifyMessageBody(text, TYPED_ON_IPHONE)).toBe('media');
    });

    it('classifies an attachment marker that is the whole body as media', () => {
      const text = '<attached: 00001-PHOTO-2023-12-31-22-00-00.jpg>';

      expect(classifyMessageBody(text, NOT_TYPED_ON_IPHONE)).toBe('media');
    });

    it('classifies a caption followed by brackets in an unlisted language as text', () => {
      const text = 'look <bijlage: 00001-PHOTO.jpg>';

      expect(classifyMessageBody(text, TYPED_ON_IPHONE)).toBe('text');
    });

    it.each([
      { language: 'English', text: 'IMG-20231231-WA0001.jpg (file attached)' },
      { language: 'Spanish', text: 'IMG-20231231-WA0001.jpg (archivo adjunto)' },
      { language: 'Portuguese', text: 'IMG-20231231-WA0001.jpg (arquivo anexado)' },
      { language: 'German', text: 'IMG-20231231-WA0001.jpg (Datei angehängt)' },
      { language: 'German without the umlaut', text: 'IMG-20231231-WA0001.jpg (Datei angehangt)' },
      { language: 'French', text: 'IMG-20231231-WA0001.jpg (fichier joint)' },
      { language: 'Italian', text: 'IMG-20231231-WA0001.jpg (file allegato)' },
    ])('classifies the $language Android attachment marker as media', ({ text }) => {
      expect(classifyMessageBody(text, ON_ANDROID)).toBe('media');
    });

    it('classifies a message that merely mentions "(file attached)" in the middle as text', () => {
      const text = 'it says (file attached) but nothing came through';

      expect(classifyMessageBody(text, ON_ANDROID)).toBe('text');
    });
  });

  describe('polls', () => {
    it.each(['POLL:', 'ENCUESTA:', 'ENQUETE:', 'UMFRAGE:', 'SONDAGE:', 'SONDAGGIO:', 'Poll:'])(
      'classifies the poll header "%s" as media',
      (text) => {
        expect(classifyMessageBody(text, NOT_TYPED_ON_IPHONE)).toBe('media');
      },
    );

    it('classifies a typed sentence that starts with "poll:" as text', () => {
      expect(classifyMessageBody('poll: who is coming on Friday', ON_ANDROID)).toBe('text');
    });
  });

  describe('shared locations', () => {
    it.each([
      { language: 'English', text: 'Location: https://maps.google.com/?q=9.93,-84.08' },
      { language: 'Spanish', text: 'Ubicación: https://maps.google.com/?q=9.93,-84.08' },
      { language: 'Spanish without the accent', text: 'ubicacion: https://maps.google.com/?q=1,2' },
      { language: 'Portuguese', text: 'Localização: https://maps.google.com/?q=9.93,-84.08' },
      { language: 'German', text: 'Standort: https://maps.google.com/?q=9.93,-84.08' },
      { language: 'French', text: 'Localisation : https://maps.google.com/?q=9.93,-84.08' },
      { language: 'Italian', text: 'Posizione: https://maps.google.com/?q=9.93,-84.08' },
    ])('classifies the $language shared location as media', ({ text }) => {
      expect(classifyMessageBody(text, NOT_TYPED_ON_IPHONE)).toBe('media');
    });

    it('classifies a location on an Android line as media', () => {
      const text = 'location: https://maps.google.com/?q=9.93,-84.08';

      expect(classifyMessageBody(text, ON_ANDROID)).toBe('media');
    });

    it.each([
      { description: 'a place name instead of a link', text: 'Location: the usual bar' },
      {
        description: 'more words after the link',
        text: 'Location: https://maps.google.com/?q=1,2 see you there',
      },
    ])('classifies "location" followed by $description as text', ({ text }) => {
      expect(classifyMessageBody(text, ON_ANDROID)).toBe('text');
    });
  });

  describe('the word "null" Android writes for messages it could not export', () => {
    it('classifies "null" on an Android line as media', () => {
      expect(classifyMessageBody('null', ON_ANDROID)).toBe('media');
    });

    it('classifies "null" on an iPhone line as text, because iPhone never writes it', () => {
      expect(classifyMessageBody('null', TYPED_ON_IPHONE)).toBe('text');
    });

    it('classifies a sentence containing the word as text', () => {
      expect(classifyMessageBody('the value was null again', ON_ANDROID)).toBe('text');
    });
  });

  describe('deleted messages', () => {
    it.each([
      { language: 'English, deleted by someone else', text: 'This message was deleted' },
      { language: 'English, deleted by the exporter', text: 'You deleted this message' },
      { language: 'Spanish', text: 'Se eliminó este mensaje' },
      { language: 'Spanish without the accent', text: 'Se elimino este mensaje' },
      { language: 'Spanish, deleted by the exporter', text: 'Eliminaste este mensaje' },
      { language: 'Spanish, passive', text: 'Este mensaje fue eliminado' },
      { language: 'Portuguese, short form', text: 'Mensagem apagada' },
      { language: 'Portuguese', text: 'Esta mensagem foi apagada' },
      { language: 'Portuguese, deleted by the exporter', text: 'Você apagou esta mensagem' },
      { language: 'German', text: 'Diese Nachricht wurde gelöscht' },
      { language: 'German, deleted by the exporter', text: 'Du hast diese Nachricht gelöscht' },
      { language: 'French', text: 'Ce message a été supprimé' },
      { language: 'French, deleted by the exporter', text: 'Vous avez supprimé ce message' },
      { language: 'Italian', text: 'Questo messaggio è stato eliminato' },
      { language: 'Italian, deleted by the exporter', text: 'Hai eliminato questo messaggio' },
    ])('classifies the tombstone "$text" ($language) as deleted', ({ text }) => {
      expect(classifyMessageBody(text, ON_ANDROID)).toBe('deleted');
    });

    it('accepts the full stop iPhone writes after the tombstone', () => {
      expect(classifyMessageBody('This message was deleted.', NOT_TYPED_ON_IPHONE)).toBe('deleted');
    });

    it('classifies a tombstone carrying the left-to-right mark as deleted, not as a system notice', () => {
      expect(classifyMessageBody('You deleted this message.', NOT_TYPED_ON_IPHONE)).toBe('deleted');
    });

    it('ignores letter case', () => {
      expect(classifyMessageBody('THIS MESSAGE WAS DELETED', ON_ANDROID)).toBe('deleted');
    });

    it('classifies a sentence that only ends like the tombstone as text', () => {
      expect(classifyMessageBody('lol this message was deleted', TYPED_ON_IPHONE)).toBe('text');
    });

    it('classifies a sentence that only begins like the tombstone as text', () => {
      const text = 'This message was deleted before I could read it';

      expect(classifyMessageBody(text, ON_ANDROID)).toBe('text');
    });
  });

  describe('system notices attributed to a sender', () => {
    it.each([
      'Ana is a contact.',
      'Your security code with Bob changed. Tap to learn more.',
      'Disappearing messages were turned on.',
    ])('classifies "%s" carrying the left-to-right mark as a system notice', (text) => {
      expect(classifyMessageBody(text, NOT_TYPED_ON_IPHONE)).toBe('system-notice');
    });

    it.each([
      {
        notice: 'the English encryption banner',
        text: 'Messages and calls are end-to-end encrypted. Tap to learn more.',
      },
      {
        notice: 'the Spanish encryption banner',
        text: 'Los mensajes y las llamadas están cifrados de extremo a extremo.',
      },
      {
        notice: 'the Spanish encryption banner in the feminine singular',
        text: 'Esta conversación está cifrada de extremo a extremo.',
      },
      { notice: 'the English security code notice', text: 'Your security code with Bob changed.' },
      {
        notice: 'the Spanish security code notice',
        text: 'Tu código de seguridad con Bob cambió.',
      },
      {
        notice: 'the Spanish security code notice typed without its accents',
        text: 'Tu codigo de seguridad con Bob cambio.',
      },
      { notice: 'a missed voice call', text: 'Missed voice call' },
      { notice: 'a missed video call', text: 'Missed video call' },
      { notice: 'a Spanish missed call', text: 'Llamada perdida' },
      { notice: 'a Spanish missed voice call', text: 'Llamada de voz perdida' },
      { notice: 'a Spanish missed video call', text: 'Llamada de video perdida' },
    ])('classifies $notice without the mark as a system notice', ({ text }) => {
      expect(classifyMessageBody(text, ON_ANDROID)).toBe('system-notice');
    });
  });

  describe('order of the rules', () => {
    it('prefers media over system notice for a marked placeholder', () => {
      expect(classifyMessageBody('sticker omitted', NOT_TYPED_ON_IPHONE)).toBe('media');
    });

    it('prefers media over deleted for an Android placeholder', () => {
      expect(classifyMessageBody('<This message was deleted>', ON_ANDROID)).toBe('media');
    });
  });

  describe('known limits', () => {
    it('drops a typed message that mentions a "security code" as if it were a system notice', () => {
      const text = 'did the security code arrive by SMS?';

      expect(classifyMessageBody(text, ON_ANDROID)).toBe('system-notice');
    });
  });
});

describe('removeEditedMessageSuffix', () => {
  it.each([
    { language: 'English', text: 'fixed it <This message was edited>' },
    { language: 'Spanish', text: 'fixed it <Se editó este mensaje.>' },
    { language: 'Spanish without the full stop', text: 'fixed it <Se editó este mensaje>' },
    { language: 'Spanish without the accent', text: 'fixed it <Se edito este mensaje.>' },
    { language: 'lower-case English', text: 'fixed it <this message was edited>' },
  ])('removes the $language note and the space before it', ({ text }) => {
    expect(removeEditedMessageSuffix(text)).toBe('fixed it');
  });

  it('removes white space after the note', () => {
    expect(removeEditedMessageSuffix('fixed it <This message was edited>  ')).toBe('fixed it');
  });

  it('removes the note from the last line of a multi-line message', () => {
    const text = 'first line\nsecond line <This message was edited>';

    expect(removeEditedMessageSuffix(text)).toBe('first line\nsecond line');
  });

  it('leaves a message without the note unchanged', () => {
    expect(removeEditedMessageSuffix('nothing to see here')).toBe('nothing to see here');
  });

  it('leaves the note alone when it is not at the end', () => {
    const text = '<This message was edited> is what it said';

    expect(removeEditedMessageSuffix(text)).toBe(text);
  });

  it('returns an empty string for a message that is only the note', () => {
    expect(removeEditedMessageSuffix('<This message was edited>')).toBe('');
  });
});
