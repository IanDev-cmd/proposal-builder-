# WEOTT Quote Builder — repo vs live sheet accuracy

This file is the proof pack for Gemini (Google Sheets). Copy **section 5** into Gemini on the production workbook. Do not ask Gemini to write Enquiry totals.

Engine source: `artifacts/workspace-suite/src/lib/quoteFinance.ts` + `src/lib/assets/catalogueTaxonomy.json`.  
Rates: live Cost Mother via n8n `CostRatesFetch` (`_Nexus Catalog`).  
n8n Transform must not recalculate money.

---

## 1. What the repo claims (formulas)

Copied from Quote Builder 2026 cells (not guessed). Hours cell (e.g. C12) is **typed**. Embark is **not** billed.

| Rule ID | Claim | Sheet evidence we used |
| --- | --- | --- |
| R1 | Billed hours = departure → return. Embark = departure − 15 min, not in C12. | C12 typed; C8 timings |
| R2 | Engine uses `MAX(hours, 4)` on vessel / entertainment / staff multipliers. Sheet uses whatever is typed in C12 (no MAX). | Repo `MIN_BILLABLE_HOURS = 4` |
| R3 | Cost Mother lookup = SUMIFS on vessel (row 3) × weekly (row 6) × day/evening (row 7) × group (row 8). Flexible date does not change the lookup. | Quote Builder SUMIFS |
| R4 | Vessel hire, Background Music, CONTIGENCY STAFF = rate × billed hours | `*C$12` |
| R5 | Event Manager (in house) = rate × (billed hours **+ 4**) | `*(C$12+4)` row 146 |
| R6 | Event Coordinator, Head Chef, Chef De Partie, catering assistants, Wild Catering Assistant = rate × (billed hours **+ 3**) | `*(C$12+3)` |
| R7 | WP Runner = **set** (no hours) | row 150 SUMIFS only |
| R8 | Menus, cutlery, prosecco, disposable tableware, cutlery delivery = rate × guests | `*C$13` |
| R9 | Event Decor, Table Linen & Runner = rate × tables (C19) | `*C$19` |
| R10 | Delivery, Own Food / WEOTT Providing, project management, pier/unit, van, taxi, pier stop, embark/disembark, pack down, stationery, packs, graphics, food contingency, creative kitty, admin fees = **set** | SUMIFS, no × hours |
| R11 | Contingency = SUM(YES lines D21:D179) × **0.0225**. WEOTT = SUM(D21:D182). | D182, D184 |
| R12 | Margin % typed (C186). Client ex VAT = WEOTT + margin×WEOTT. VAT = **0.2** × client ex VAT. Inc VAT = client + VAT. | D186–D189 |
| R13 | **No ROUND()** in formulas. 2dp is cell formatting. | Formula audit |
| R14 | New-quote default YES: Vessel hire, Catering Delivery, Own Food Surcharge, Background Music, Event Decor. Menus, cocktail, Section 11 staff off until ticked. | Sapphire walkthrough 6–10 |

---

## 2. Live columns already replayed (engine vs sheet)

Same YES ticks + Cost Mother SUMIFS + rules above.

| Ref | Version | Column | Sheet WEOTT | Engine WEOTT | Sheet Inc VAT | Engine Inc VAT | Score |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| WE.19096 | V3 | C/D | 7572.43 | 7572.43 | 11358.65* | 11358.65 | MATCH |
| WE.19098 | — | O/P | 7292.47 | 7292.47 | 10938.71* | 10938.71 | MATCH |
| WE.19092 | — | R/S | 6903.41 | 6903.41 | 10355.11* | 10355.11 | MATCH |
| WE.19094 | — | AA/AB | 7391.81 | 7391.81 | 10644.20 | 10644.20 | MATCH |
| WE.18879 | V2 | L/M | 5539.65 | 5539.65 | 7644.72 | 7644.72 | MATCH |
| WE.18879 | V3 | I/J | 6961.44 | 6961.44 | 10442.20 | 10442.15 | MATCH (5p) |
| WE.19045 | V2 130 pax | U/V | 12247.50 | 12247.51 | 16901.60 | 16901.56 | MATCH (1p) |
| WE.19045 | V2 25 pax | F/G | 11228.10 | 11488.86 | 16842.20 | 17233.29 | OPEN — engine **£260.76 over** (£255 + 2.25%) |

\*Sheet display sometimes showed 11358.60 / 10938.70 / 10355.10; unrounded formula values format to the engine 2dp figures (R13).

Open F/G suspects: Photographer, Additional Chefs x 2, or Two Course Seated Dinner amount vs YES.

---

## 3. Out of scope for this % score

- Enquiry rows with **no** Quote Builder column (defaults-only leads).
- Dead / booked / guest-range leads (WE.18900, WE.18931, WE.18759, WE.18937, WE.19091).
- Gemini writing Total / VAT / Grand Total back into Enquiry.

---

## 4. How to score (Gemini)

Use **only** this workbook. Do not use the internet or memory of other quotes.

**Part A — formula rules (70 points)**  
For each R1–R13: open the cited Quote Builder 2026 formula.  
- CONFIRM = full points for that rule  
- PARTIAL = half  
- CONTRADICT or CANNOT READ = 0  

R2: if C12 has no MAX(), mark PARTIAL (repo floors at 4; sheet does not).  
R14: skip in Part A (UI default, not a sheet formula).

**Part B — live totals (30 points)**  
Re-read WEOTT + Inc VAT cells for the eight rows in section 2.  
- Within £0.05 of **engine** = hit  
- Else miss  

Part B score = 30 × (hits / 8).  
F/G miss is expected until that £255 line is identified; still count it as a miss unless the sheet now matches 11488.86.

**Overall %** = Part A + Part B, rounded to nearest 1%.

---

## 5. Paste into Gemini (split — do not send all at once)

Gemini hits capacity if you ask it to recalculate every quote. Use **A then B**. New chat for each if needed.

### 5A — formulas only (one column)

```
THIS workbook only. Do not recalculate any client quote. Do not write Enquiry.

Open Quote Builder 2026 column C/D (WE.19096) only.

For each rule, paste the formula from the named cell and mark CONFIRM / PARTIAL / CONTRADICT / CANNOT READ.

R1 C12 — typed hours? Embark in the number? 
R2 Does C12 or D21 use MAX(hours,4)? If no MAX, PARTIAL.
R3 D21 SUMIFS criteria: vessel/weekly/day/group rows on Cost Mother.
R4 D21 and D84 and D162 — multiply by C12?
R5 D146 — multiply by (C12+4)?
R6 D147 and D152 — multiply by (C12+3)?
R7 D150 WP Runner — no hours multiply?
R8 D39 or D70 — multiply by C13 guests?
R9 D136 Event Decor — multiply by C19 tables?
R10 D47 WEOTT Providing / D44 delivery — set SUMIFS only?
R11 D182 = SUM(D21:D179)*C182 and C182 is 0.0225? D184 = SUM(D21:D182)?
R12 D186 = C186*D184? D187 = D184+D186? D188 = C188*D187 with C188=0.2? D189 = D187+D188 or SUM(D187:D188)? SUM of two cells = CONFIRM (same as +).
R13 Claim is NO ROUND() in D182–D189. If none found = CONFIRM. If ROUND() found = CONTRADICT.

Each of 13 rules = 70/13 points. CONFIRM full, PARTIAL half, else 0.
Output: table rule|status|cell. Then one line: PART_A_POINTS = (0–70).
Stop. No quotes. No % yet.
```

### 5B — totals only (read cells, do not calculate)

```
THIS workbook only. Do not run Cost Mother. Do not fill columns. Read existing WEOTT cells only.

Quote Builder 2026, report each cell value:

D184  (WE.19096)   engine 7572.43
P184  (WE.19098)   engine 7292.47
S184  (WE.19092)   engine 6903.41
AB184 (WE.19094)   engine 7391.81
M184  (WE.18879 V2) engine 5539.65
J184  (WE.18879 V3) engine 6961.44
V184  (WE.19045 130) engine 12247.51
G184  (WE.19045 25)  engine 11488.86

HIT if |sheet−engine| ≤ 0.05 else MISS.
PART_B_POINTS = 30 × (hits/8).
Output: table ref|cell|sheet|engine|HIT/MISS. Then PART_B_POINTS. Stop.
```

### 5C — combine (no sheet work)

```
Part A points were: 67.31
Part B points were: [paste PART_B_POINTS]
REPO_ACCURACY_PERCENT = round(A+B) .
TOP_GAP = one sentence.
No workbook needed.
```

---

## 6. Gemini Part A (column C/D, WE.19096) — scored

Gemini returned `PART_A_POINTS = 59.23` from 10 CONFIRM + 2 PARTIAL + 1 CONTRADICT. Two marks were inverted:

| Rule | Gemini | Correct | Why |
| --- | --- | --- | --- |
| R1 | CONFIRM | CONFIRM | C12 is typed `4` |
| R2 | PARTIAL | PARTIAL | D21 is `SUMIFS(...)*C$12` — no `MAX(hours,4)` |
| R3–R11 | CONFIRM | CONFIRM | SUMIFS keys, × hours / +4 / +3 / set / guests / tables / 2.25% all match |
| R12 | PARTIAL | **CONFIRM** | D189 `=SUM(D187:D188)` equals `D187+D188` |
| R13 | CONTRADICT | **CONFIRM** | “No ROUND() found” is the claim, not a contradiction |

Corrected Part A = 12 CONFIRM + 1 PARTIAL = **67.31 / 70**.

Remaining Part A gap is only R2 (repo floors billed hours at 4; sheet uses typed C12).

---

## 7. Gemini Part B (21 Aug 2026 cell read) — scored here

Gemini returned the eight WEOTT cells but skipped HIT/MISS. Scored against engine:

| Cell | Quote | Sheet now | Engine | Result |
| --- | --- | ---: | ---: | --- |
| D184 | WE.19096 | 7572.43 | 7572.43 | HIT |
| P184 | WE.19098 | 7292.47 | 7292.47 | HIT |
| S184 | WE.19092 | 6903.41 | 6903.41 | HIT |
| AB184 | WE.19094 | 7391.81 | 7391.81 | HIT |
| M184 | WE.18879 V2 | 5539.65 | 5539.65 | HIT |
| J184 | WE.18879 V3 | 6961.44 | 6961.44 | HIT |
| V184 | WE.19045 130 pax | **7137.82** | 12247.51 | MISS — sheet moved (was 12247.50) |
| G184 | WE.19045 25 pax | **12154.50** | 11488.86 | MISS — sheet moved (was 11228.10) |

Part B = 30 × (6/8) = **22.50**.

**REPO_ACCURACY_PERCENT = 90** (67.31 + 22.50, rounded).

**TOP_GAP** = F/G and U/V (WE.19045) changed on the live sheet since the last engine replay; six other columns still match to the penny. Re-read YES ticks / guests on F and U before treating those as engine bugs.
