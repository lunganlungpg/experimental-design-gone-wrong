# Experimental Design Gone Wrong

**Playful simulations of lab and field blunders—and how to stop fooling yourself with naive *t*-tests.**

[![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Jupyter Notebooks](https://img.shields.io/badge/Jupyter-4%20Interactive%20Lessons-F37626?logo=jupyter&logoColor=white)](#notebook-modules--open-in-colab)
[![License: MIT](https://img.shields.io/badge/License-MIT-2E8B57.svg)](LICENSE)

Your advisor is excited. Your bar chart has three stars (`***`). Your *p*-value has ten zeros after the decimal point. **And yet your treatment does literally nothing.**

Welcome to **Experimental Design Gone Wrong**—a collection of short, 5-minute interactive Jupyter notebooks that recreate classic greenhouse, lab-bench, and field-trial blunders with fixed-seed synthetic data. In every lesson, the **true treatment effect is zero**, the **naive test claims `p < 0.01`**, a **publication-style visual punchline** exposes what actually happened, and a **proper `statsmodels` model** recovers the honest truth.

---

## Naive vs. Proper Model Summary

| # | Blunder | Naive Analysis (Assumed `df`) | Fake *p*-value | Proper Model (True `df` / Units) | True *p*-value |
|---|---|---|---|---|---|
| 01 | **The Lazy Randomization** — First 20 pots parked by sunny door; back 20 under HVAC vent | 2-sample *t*-test / OLS (`df = 38`) | **`1.52e-11`** | Spatial ANCOVA `+ bench_pos` (`df = 37`) | **`0.7161`** |
| 02 | **Blocking the Wrong Way** — 8 row-blocks laid *parallel* (not perpendicular) to West→East moisture cliff | CRD ANOVA (`df = 28`) / Wrong RCBD (`df = 21`) | **`1.78e-05`** / **`0.0002`** | Row + Column Blocked ANOVA (`df = 18`) | **`0.7258`** |
| 03 | **Pseudoreplication Delusion** — 25 leaves from 2 plants per group (`100` rows vs. `4` plants) | Leaf-level *t*-test (`df = 98`) | **`3.73e-07`** | `MixedLM` (`4` clusters) / Plant-Mean *t*-test (`df = 2`) | **`0.3348`** / **`0.4367`** |
| 04 | **Split-Plot Amnesia** — 50 subplots across 10 irrigation strips analyzed as a flat CRD | CRD Two-Way ANOVA (`df = 40`) | **`0.0017`** | Split-Plot `MixedLM` (`10` strips) / Whole-Plot Error(a) (`df = 4`) | **`0.2432`** / **`0.3080`** |

---

## Notebook Modules & Open in Colab

Every notebook follows the same 4-part arc (**The Setup → The Crime → The Reality Check → The Fix**) and takes ~5 minutes to run.

| Module | Topic & Takeaway | Open in Browser |
|---|---|---|
| [`01_the_lazy_randomization/`](01_the_lazy_randomization/01_the_lazy_randomization.ipynb) | Systematic bench allocation disguised as a `+11.6 g` biostimulant miracle | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/lunganlungpg/experimental-design-gone-wrong/blob/main/01_the_lazy_randomization/01_the_lazy_randomization.ipynb) |
| [`02_blocking_the_wrong_way/`](02_blocking_the_wrong_way/02_blocking_the_wrong_way.ipynb) | Why blocking parallel to a soil gradient leaves randomization helpless | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/lunganlungpg/experimental-design-gone-wrong/blob/main/02_blocking_the_wrong_way/02_blocking_the_wrong_way.ipynb) |
| [`03_pseudoreplication_delusion/`](03_pseudoreplication_delusion/03_pseudoreplication_delusion.ipynb) | Turning 4 plants into 100 fake replicates (`ICC = 0.78`)—and fixing it | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/lunganlungpg/experimental-design-gone-wrong/blob/main/03_pseudoreplication_delusion/03_pseudoreplication_delusion.ipynb) |
| [`04_split_plot_amnesia/`](04_split_plot_amnesia/04_split_plot_amnesia.ipynb) | Stealing subplot error `Error (b)` to test whole-plot irrigation strips | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/lunganlungpg/experimental-design-gone-wrong/blob/main/04_split_plot_amnesia/04_split_plot_amnesia.ipynb) |

---

## Quick Start

Run all lessons locally in three commands:

```bash
git clone https://github.com/lunganlungpg/experimental-design-gone-wrong.git && cd experimental-design-gone-wrong
pip install -r requirements.txt
jupyter lab
```

To verify the synthetic data generators and statistical invariants via `pytest`:

```bash
pytest -v
```

---

## Repository Structure

```text
experimental-design-gone-wrong/
├── README.md
├── LICENSE
├── requirements.txt
├── src/
│   ├── __init__.py
│   └── simulate_blunders.py               # Fixed-seed data generators & comparison helpers
├── tests/
│   └── test_simulate_blunders.py          # Reproducibility & statistical verification tests
├── 01_the_lazy_randomization/
│   └── 01_the_lazy_randomization.ipynb
├── 02_blocking_the_wrong_way/
│   └── 02_blocking_the_wrong_way.ipynb
├── 03_pseudoreplication_delusion/
│   └── 03_pseudoreplication_delusion.ipynb
└── 04_split_plot_amnesia/
    └── 04_split_plot_amnesia.ipynb
```

---

## License

This project is released under the **MIT License**—free to teach, remix, and share in stats workshops and lab meetings. See [`LICENSE`](LICENSE) for the full license text.
