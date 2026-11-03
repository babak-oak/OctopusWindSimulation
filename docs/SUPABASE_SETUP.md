# Підключення кабінету (Supabase + пошта GoDaddy)

Без цих кроків сайт працює в «локальному режимі»: модель відкрита всім, проєкт зберігається лише в браузері,
пунктів «Увійти» і «Мої проєкти» немає. Після кроку 5 вони з'являються автоматично.

## 1. Проєкт Supabase
1. https://supabase.com → New project. Регіон — **Central EU (Frankfurt)**. Збережіть пароль бази.
2. Безкоштовний тариф призупиняє проєкт після 7 днів без запитів. Для публічного сервісу — тариф Pro.

## 2. База даних
SQL Editor → New query → вставте вміст `supabase/migrations/0001_projects.sql` → Run.
Створюються таблиці `projects` і `share_links`, правила доступу (кожен бачить лише свої проєкти) і функція
`get_shared_project` для посилань тільки для перегляду.

## 3. Автентифікація
Authentication → Sign In / Providers → Email:
- Enable Email provider — увімкнено; **Confirm email** — увімкнено.
- **Minimum password length** — 10.
- **Email OTP Expiration** — 600 секунд (10 хвилин); **Email OTP Length** — 6.

Authentication → URL Configuration:
- Site URL: `https://babak-oak.github.io/OctopusWindSimulation/`
- Redirect URLs: той самий адрес.

Authentication → Emails → Templates. Застосунок просить ввести **код**, тому в шаблонах замість посилання
має бути `{{ .Token }}`:
- *Confirm signup* — тема «Код підтвердження Octopus Wind», текст: `Ваш код: {{ .Token }}. Він дійсний 10 хвилин.`
- *Reset password* — тема «Код для зміни пароля», текст: `Код для зміни пароля: {{ .Token }}. Він дійсний 10 хвилин.`

## 4. Пошта anton@octopus-capital.ventures (GoDaddy)
Authentication → Emails → SMTP Settings → Enable custom SMTP:

| Поле | Professional Email (GoDaddy / Titan) | Microsoft 365 від GoDaddy |
| --- | --- | --- |
| Host | `smtpout.secureserver.net` | `smtp.office365.com` |
| Port | 465 | 587 |
| Username | `anton@octopus-capital.ventures` | `anton@octopus-capital.ventures` |
| Password | пароль скриньки | пароль скриньки (SMTP AUTH має бути дозволено) |
| Sender email / name | `anton@octopus-capital.ventures` / `Octopus Wind` | те саме |

DNS домену `octopus-capital.ventures` у GoDaddy: перевірте SPF (`v=spf1 include:secureserver.net -all` або
`include:spf.protection.outlook.com` для Microsoft 365) і DKIM, інакше листи потраплятимуть у спам.
Денний ліміт відправки залежить від тарифу скриньки — перевірте його в GoDaddy.

## 5. Ключі для сайту
Project Settings → API: скопіюйте **Project URL** і **anon public** key (цей ключ публічний за задумом;
доступ до даних обмежують правила з кроку 2).

GitHub → репозиторій → Settings → Secrets and variables → Actions → вкладка **Variables** → New repository variable:
- `VITE_SUPABASE_URL` = Project URL
- `VITE_SUPABASE_ANON_KEY` = anon public key

Потім Actions → Deploy to GitHub Pages → Run workflow. Через 1–2 хвилини на сайті з'являться «Увійти» і «Мої проєкти».

## Як перевірити
1. «Увійти» → «Реєстрація» → email і пароль від 10 символів → лист із 6-значним кодом → «Підтвердити».
2. «Мої проєкти» → «Новий проєкт» → змініть припущення → статус «Збережено» через 2 секунди.
3. «Поділитися» → «Створити посилання» → відкрийте в іншому браузері: проєкт без входу, поля недоступні.
4. «Відкликати» → посилання показує «Доступ закрито».
