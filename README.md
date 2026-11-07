# Octopus Wind Simulation

Economic model of an onshore wind farm, built from the Volodymyrets financial model and the approved spec
(ТЗ: веб-модель економіки ВЕС, 03.11.2026). Stage 1: calculation engine, corrected reference workbook, cross-check.

## What is here

| Path | What it is |
| --- | --- |
| `src/engine/` | TypeScript engine: generation, DAM revenue, OPEX, monthly construction and VAT, quarterly debt, IFRS statements, KPIs, stress tests, risk register |
| `data/wind_profile.json` | 12 × 24 generation shares from `'Wind Profile'!C5:Z16` of the source model |
| `data/dam_price_shape.json` | 12 × 24 DAM price shape, OREE hourly prices Nov 2025 – Oct 2026, converted at NBU daily EUR rates |
| `reference/OctopusWind_reference_75MW.xlsx` | Corrected reference model: an independent Excel implementation, formulas only |
| `scripts/` | Data builders, reference generator, engine ↔ Excel cross-check |
| `test/` | Engine tests (`npm test`) |

## Commands

```
npm install
npm test            # 24 engine tests
npm run base        # base-case KPIs
npm run reference   # rebuild the reference workbook from the engine defaults
python3 -I scripts/compare_reference.py <cases_dir> data <recalc.py>   # engine vs Excel, 6 cases
```

## Conventions

- EUR, ex VAT, 2026 prices; OPEX indexed 2% a year, the DAM price is not indexed.
- Hour h of a profile is (h−1):00–h:00 Kyiv time.
- Construction month 1 = March 2027; COD 31.08.2028; operation to 31.08.2053; reports by calendar year.
- Debt: 65% of funding (CAPEX incl. VAT on works, capitalised interest, fee); grace to COD; 40 equal quarterly instalments.
- DSCR is reported per loan year (four quarters from COD): quarterly values swing with wind seasonality.

## Web app (stage 2)

`npm run dev` for local work, `npm run build` for `dist/`. Every push to `main` runs the tests, builds the app and
deploys it to GitHub Pages (`.github/workflows/pages.yml`): https://babak-oak.github.io/OctopusWindSimulation/

Screens: assumptions with sources and reset, OEM presets, 15% compensation popup; results tabs Overview, Generation
and price, CAPEX and construction, P&L, Balance sheet, Cash flow, Debt, Sensitivity (A table, B waterfall, C grid),
Risks. UA / EN, Deep Sea / Ivory themes, Octopus design system with the ISO 24896 notation. Until stage 3 (Supabase
accounts) the project is kept in the browser's local storage.

## Accounts (stage 3)

Landing page with the turbine illustration (`#/`), the open model (`#/tool`), sign-in with password and a 6-digit
email code (`#/login`), projects with autosave (`#/projects`, `#/p/<id>`), view-only links (`#/s/<token>`).
Without an account the open model shows the reference project read-only: tabs and scenarios work, any change
opens a sign-up prompt. Contacts page (`#/contacts`) with a pre-filled email for a SANY equipment offer.
Supabase setup and the GoDaddy mail settings: `docs/SUPABASE_SETUP.md`. Without `VITE_SUPABASE_URL` /
`VITE_SUPABASE_ANON_KEY` the site runs in local mode.

## Generation by coordinates (stage 3b)

The assumptions panel has a «Generation source» switch: the manufacturer proposal (default, Net AEP and the 12 × 24
profile from the offer) or the site. For the site the browser downloads hourly ERA5 at 100 m (Open-Meteo archive) for
20 full years, carries it to hub height with the shear law, corrects for air density, applies a power curve
(`data/power_curves.json`: Vestas V162-6.0, Nordex N163/6.X 7.0 MW, a generic NREL IEC III curve, or a pasted curve),
deducts a fixed wake loss and returns Net AEP P50, P90 (one year, inter-annual variability) and the 12 × 24 profile.
Wind input: ERA5 only, ERA5 scaled to a long-term mean speed, or ERA5 scaled to an uploaded mast/LiDAR file
(CSV/TXT, any timestamp column plus numeric channels).

Calibration on Volodymyrets (`data/wind_calibration.json`, `scripts/calibrate-wind.ts`): ERA5 vs the GEO-NET mast
(Dovhovolya, 60–123 m, 2020–2022), shear α 0.288, multiplier 1.004 that reproduces the GEO-NET yield assessment
(12 × V162-6.0 at 149 m, 239,939 MWh/yr with wake) at 5.5% wake, and a 12 × 24 diurnal correction. The
`ERA5 fetch` workflow downloads a series for the calibration script.
