import React from 'react';
import type { Lang } from '../i18n';

const L = (lang: Lang, uk: string, en: string) => (lang === 'uk' ? uk : en);

export const CONTACT = {
  email: 'anton@octopus-capital.ventures',
  phone: '+380 73 233 1234',
  phoneHref: 'tel:+380732331234',
  nameUk: 'Антон Кернасовський',
  nameEn: 'Anton Kernasovskyi',
};

/** mailto: link with the subject and a short brief filled in, so the request arrives with the basics. */
export function offerMailto(lang: Lang): string {
  const subject = L(lang, 'Пропозиція для ВЕС на обладнанні SANY', 'Offer for a wind farm on SANY equipment');
  const body = L(lang,
    'Добрий день!\n\nПрошу підготувати пропозицію для нашої ВЕС на обладнанні SANY.\n\nПотужність, МВт: \nОбласть: \nКількість турбін: \n',
    'Hello,\n\nPlease prepare an offer for our wind farm on SANY equipment.\n\nCapacity, MW: \nRegion: \nNumber of turbines: \n');
  return `mailto:${CONTACT.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function Contacts({ lang }: { lang: Lang }) {
  return (
    <div className="contacts">
      <section className="contacts-hero">
        <p className="oc-overline">{L(lang, 'Контакти', 'Contacts')}</p>
        <h1 className="display">{L(lang, 'Пропозиція для вашої ВЕС на обладнанні SANY', 'An offer for your wind farm on SANY equipment')}</h1>
        <p className="hero-lead">
          {L(lang,
            'Підготуємо пропозицію на постачання турбін SANY для вашого проєкту і розрахунок його економіки в цій моделі. Напишіть потужність, область і кількість турбін — решту уточнимо в листуванні.',
            'We will prepare an offer for SANY turbines for your project and a run of its economics in this model. Tell us the capacity, region and number of turbines; we will clarify the rest by email.')}
        </p>
        <div className="hero-cta">
          <a className="btn-action" href={offerMailto(lang)}>{L(lang, 'Написати нам', 'Write to us')}</a>
        </div>
      </section>
      <section className="contact-card" aria-label={L(lang, 'Контактна особа', 'Contact person')}>
        <p className="contact-name">{L(lang, CONTACT.nameUk, CONTACT.nameEn)}</p>
        <p className="muted small">Octopus Capital</p>
        <dl>
          <dt>Email</dt>
          <dd><a className="link" href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a></dd>
          <dt>{L(lang, 'Телефон', 'Phone')}</dt>
          <dd><a className="link" href={CONTACT.phoneHref}>{CONTACT.phone}</a></dd>
        </dl>
      </section>
    </div>
  );
}
