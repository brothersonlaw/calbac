# CalBAC — California DUI BAC Timeline & Retrograde Toolkit

A **free, open-source** web app for California DUI defense practitioners. CalBAC
models blood-alcohol concentration (BAC) over time, tests the assumptions behind
retrograde-extrapolation opinions, analyzes breath-test bias, and generates a
ready-to-use cross-examination outline — all in the browser, with **no data ever
leaving the device**.

It is a free, transparent alternative to closed commercial tools like "DUI Pro,"
built on the same forensic backbone (Widmark + Watson) but with every formula
open to inspection.

> ⚖️ **Not legal advice.** CalBAC is an educational and case-preparation aid. It
> does not determine guilt, impairment, or the legal sufficiency of evidence, and
> it is not a substitute for a qualified forensic toxicologist. Every output is
> only as good as the assumptions you feed it.

---

## Features

| Tab | What it does |
|-----|--------------|
| **Timeline & BAC** | Build a drink-by-drink timeline, mark the driving and test times, and see a BAC curve with a best/worst-case envelope, California threshold lines (0.08 / 0.05 / 0.04 / 0.01), and live readouts at each key moment. Flags **rising-BAC** situations and straddle-the-limit ranges automatically. |
| **Retrograde** | Back-extrapolate a later test to the time of driving across a range of elimination rates, with plain-English caveats about when it's valid. |
| **Breath Test** | Show how a subject's true blood:breath ratio (real range ~1100:1–4200:1) and breathing/temperature factors bias a breath reading away from the machine's fixed 2100:1 assumption. |
| **Cross-Exam** | Generate a personalized leading-question outline that walks the State's expert through every untested assumption behind a retrograde opinion and closes on reasonable doubt. One-click copy. |
| **Science & Sources** | The math, the citations, and the California thresholds, laid out plainly. |

## The science

CalBAC combines the **Widmark equation** with the **Watson total-body-water
model**, a first-order absorption phase, and constant zero-order elimination.

```
BAC = A / (r · W) × 100 − β · t
```

- **A** — grams of ethanol = `volume(oz) × 29.5735 × ABV × 0.789`
- **r** — distribution ratio, auto-derived from Watson TBW (or fixed by hand).
  Male mean ≈ 0.68 (0.50–0.90); female mean ≈ 0.55 (0.45–0.63).
- **W** — body weight
- **β** — elimination rate. Dubowski: mean ≈ 0.015–0.018, population range
  ≈ 0.006–0.040 g/dL/hr. The defense envelope defaults to 0.010 / 0.015 / 0.020.
- **t** — hours since drinking began

Watson total body water:

```
Male   TBW = 2.447 − 0.09516·age + 0.1074·height + 0.3362·weight
Female TBW = −2.097 + 0.1069·height + 0.2466·weight
r = (TBW / weight) / 0.806
```

The **best/worst envelope** is produced by pairing a low `r` with slow `β` (worst
case for the defendant) against a high `r` with fast `β` (best case), so you can
immediately see how fragile a single-number opinion is.

### Sources

- Dubowski, *Absorption, Distribution and Elimination of Alcohol*.
- Hlastala et al., *The Alcohol Breath Test — A Review*; *The Alcohol Breath Test
  is Biased Against Individuals with Smaller Lung Volume*.
- Bruce Kapsack, *Ethically Getting a Rise Out of Your Jurors* (rising-BAC trial
  method).
- Watson, Watson & Batt total-body-water equations.

## Running it

No build step, no dependencies, no server-side code. Any static host works.

```bash
# Clone, then serve the folder with anything:
python3 -m http.server 8000
# open http://localhost:8000
```

Or just open `index.html` directly in a browser.

## Deploying to Netlify

```bash
# The whole repo is the site root — no build command needed.
netlify deploy --prod
```

`netlify.toml` is already configured (`publish = "."`). You can also drag-and-drop
the folder into the Netlify dashboard.

## Project structure

```
index.html          Markup + tab shell
css/styles.css       Theme (light/dark), layout, print styles
js/science.js        BAC math engine (Widmark, Watson, absorption, retrograde, partition)
js/chart.js          Dependency-free SVG BAC chart
js/app.js            UI wiring, state, time handling, all five tabs
data/drinks.js       Curated open drink database (extensible)
```

Everything is vanilla HTML/CSS/JS so it stays auditable and portable — important
for a tool whose numbers may end up in front of a jury.

## Contributing

Pull requests welcome — especially: a larger drink database, additional
elimination/absorption models, PDF/exhibit export, and expert-reviewed defaults.
Keep it dependency-free and keep every formula documented.

## License

MIT — see [LICENSE](LICENSE).
