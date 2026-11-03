import React, { useMemo } from 'react';
import { defaultAssumptions } from '../../engine/defaults';
import { marketData } from '../../engine/data';
import { run } from '../../engine/model';
import { TurbineScene } from '../Turbines';
import { useAuth } from '../auth';
import { num, pct } from '../format';
import type { Lang } from '../i18n';

const L = (lang: Lang, uk: string, en: string) => (lang === 'uk' ? uk : en);

const FEATURES: [string, string, string, string][] = [
  ['Погодинна ціна', 'Ціни РДН ОРЕЕ за останні 12 місяців у сітці 12 × 24 і профіль вітру: модель рахує capture price саме вашої станції.',
    'Hourly price', 'OREE day-ahead prices for the last 12 months on a 12 × 24 grid against the wind profile: the model prices your plant\'s own capture.'],
  ['Будівництво помісячно', 'Графік платежів OEM, роботи 70/30, ПДВ, капіталізовані відсотки і кредит 65/35 з пільговим періодом до введення.',
    'Monthly construction', 'OEM payment schedule, 70/30 works, VAT, capitalised interest and 65/35 debt with grace to COD.'],
  ['Звіти за МСФЗ', 'P&L, баланс і рух коштів за календарними роками. Баланс сходиться в кожному місяці.',
    'IFRS statements', 'P&L, balance sheet and cash flow by calendar year. The balance sheet balances every month.'],
  ['Показники для інвестора і банку', 'IRR проєкту і капіталу, NPV, LCOE, DSCR, LLCR, окупність — з поясненням методу біля кожного.',
    'Investor and lender metrics', 'Project and equity IRR, NPV, LCOE, DSCR, LLCR, payback — each with its method one click away.'],
  ['Стрес-тести і ризики', 'Обмеження Укренерго, CAPEX +10%, РДН −20%, теплова карта IRR і реєстр ризиків з очікуваними втратами EBITDA.',
    'Stress tests and risks', 'Ukrenergo curtailment, CAPEX +10%, DAM −20%, an IRR grid and a risk register with expected EBITDA losses.'],
  ['Будь-яка ВЕС', 'Пресети SANY, Nordex, Vestas. Змініть кількість турбін — дороги, кабелі, підстанція, генерація і персонал перерахуються.',
    'Any wind farm', 'SANY, Nordex and Vestas presets. Change the turbine count and roads, cables, substation, output and staff follow.'],
];

export function Landing({ lang, theme }: { lang: Lang; theme: 'dark' | 'light' }) {
  const { enabled, session } = useAuth();
  const k = useMemo(() => run(defaultAssumptions(), marketData).kpis, []);
  return (
    <div className="landing">
      <section className="hero">
        <div className="hero-copy">
          <img className="seal" width={112} height={112} alt="Octopus Capital"
            src={`${import.meta.env.BASE_URL}brand/OctopusCapital_print_${theme === 'dark' ? 'white' : 'black'}.svg`} />
          <p className="oc-overline">{L(lang, 'Вітрова генерація · Україна', 'Wind generation · Ukraine')}</p>
          <h1 className="display">{L(lang, 'Економіка вітрової електростанції — за хвилини', 'Wind farm economics, in minutes')}</h1>
          <p className="hero-lead">
            {L(lang,
              'Модель проєктного фінансування ВЕС в Україні: від CAPEX і погодинного профілю генерації до IRR, DSCR і звітності за МСФЗ. Змінюйте припущення — результат перераховується миттєво.',
              'A project finance model for wind farms in Ukraine: from CAPEX and an hourly generation profile to IRR, DSCR and IFRS statements. Change an assumption and the result updates instantly.')}
          </p>
          <div className="hero-cta">
            <a className="btn-action" href="#/tool">{L(lang, 'Відкрити модель', 'Open the model')}</a>
            {enabled && (session
              ? <a className="btn-ghost" href="#/projects">{L(lang, 'Мої проєкти', 'My projects')}</a>
              : <a className="btn-ghost" href="#/login/signup">{L(lang, 'Створити акаунт', 'Create an account')}</a>)}
          </div>
        </div>
        <TurbineScene title={L(lang, 'Вітрова електростанція на пагорбах', 'A wind farm on rolling hills')} />
      </section>

      <section className="proof">
        <p className="oc-overline">{L(lang, 'Еталонний проєкт: 12 × 6.25 МВт SANY, база', 'Reference project: 12 × 6.25 MW SANY, base case')}</p>
        <div className="proof-row">
          <div><p className="proof-v">{pct(k.equityIrr, 1)}</p><p className="muted small">{L(lang, 'IRR капіталу', 'Equity IRR')}</p></div>
          <div><p className="proof-v">{pct(k.projectIrr, 1)}</p><p className="muted small">{L(lang, 'IRR проєкту', 'Project IRR')}</p></div>
          <div><p className="proof-v">{num(k.lcoe, 1)}</p><p className="muted small">{L(lang, 'LCOE, €/МВт·год', 'LCOE, EUR/MWh')}</p></div>
          <div><p className="proof-v">{num(k.dscrMin, 2)}×</p><p className="muted small">{L(lang, 'DSCR мінімальний', 'Minimum DSCR')}</p></div>
        </div>
      </section>

      <section className="features">
        <h2>{L(lang, 'Що рахує модель', 'What the model covers')}</h2>
        <div className="feature-grid">
          {FEATURES.map(([tu, du, te, de]) => (
            <article key={te} className="feature">
              <h3>{L(lang, tu, te)}</h3>
              <p>{L(lang, du, de)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="steps">
        <h2>{L(lang, 'Як це працює', 'How it works')}</h2>
        <ol>
          <li><b>{L(lang, 'Задайте проєкт.', 'Set up the project.')}</b> {L(lang, 'Почніть з еталонного проєкту і змініть турбіни, ціну, CAPEX чи фінансування. Біля кожного поля — джерело значення.', 'Start from the reference project and change turbines, price, CAPEX or financing. Every field shows its source.')}</li>
          <li><b>{L(lang, 'Перевірте сценарії.', 'Test the scenarios.')}</b> {L(lang, 'Порівняйте базу зі стрес-тестами, подивіться водоспад IRR і реєстр ризиків.', 'Compare the base with the stress tests, the IRR waterfall and the risk register.')}</li>
          <li><b>{L(lang, 'Збережіть і поділіться.', 'Save and share.')}</b> {L(lang, 'Проєкти зберігаються в кабінеті автоматично; посилання для перегляду можна відкликати будь-коли.', 'Projects save to your account automatically; view-only links can be revoked at any time.')}</li>
        </ol>
      </section>

      <footer className="landing-foot muted small">
        {L(lang,
          'Усі суми в EUR без ПДВ. Рушій моделі звірено з незалежною реалізацією в Excel. Графіки — в нотації ISO 24896.',
          'All amounts in EUR, ex VAT. The engine is cross-checked against an independent Excel implementation. Charts follow ISO 24896 notation.')}
      </footer>
    </div>
  );
}
