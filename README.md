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
