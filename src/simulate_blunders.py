"""Reproducible data generators and shared utilities for Experimental Design Gone Wrong.

Every generator uses a fixed default random seed and embeds a known ground-truth
effect (typically zero for the focal treatment) alongside a classic experimental
design blunder so naive tests reliably report p < 0.01 while proper models
recover the truth.
"""

from __future__ import annotations

from typing import Iterable

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns

# Colorblind-friendly palette shared across all notebooks
PALETTE = {
    "control": "#4C72B0",
    "treated": "#DD8452",
    "danger": "#C44E52",
    "safe": "#2E8B57",
    "accent": "#8172B3",
    "neutral": "#595959",
}


def set_publication_style() -> None:
    """Configure clean, publication-ready matplotlib and seaborn defaults."""
    sns.set_theme(style="whitegrid", context="notebook", font_scale=1.05)
    plt.rcParams.update(
        {
            "figure.dpi": 130,
            "savefig.dpi": 150,
            "axes.spines.top": False,
            "axes.spines.right": False,
            "axes.titleweight": "bold",
            "axes.titlesize": 12.5,
            "axes.labelsize": 11,
            "legend.frameon": True,
            "legend.framealpha": 0.9,
        }
    )


def format_p_value(p_value: float) -> str:
    """Format a p-value consistently for summary tables and plot annotations."""
    if pd.isna(p_value):
        return "NaN"
    if p_value < 1e-4:
        return f"{p_value:.2e}"
    return f"{p_value:.4f}"


def build_comparison_table(rows: Iterable[dict[str, object]]) -> pd.DataFrame:
    """Assemble a tidy Naive vs. Proper Model comparison table."""
    columns = [
        "Model",
        "Assumed Unit",
        "df_resid",
        "Estimate",
        "95% CI",
        "p_value",
        "Verdict",
    ]
    return pd.DataFrame(list(rows), columns=columns)


def simulate_lazy_randomization(
    seed: int = 42,
    n_per_group: int = 20,
    true_effect: float = 0.0,
) -> pd.DataFrame:
    """Simulate systematic bench allocation disguised as a treatment effect.

    A researcher tests BioBoost-X against a water Control on greenhouse basil pots
    lined up along a bench (positions 1..2*n_per_group). Rather than randomizing,
    they spray the first half near the sunny glass door with BioBoost-X and leave
    the back half next to the chilly HVAC vent as Control.

    Ground truth: ``true_effect`` is 0.0 g by default; the apparent difference is
    driven entirely by the bench sunlight/temperature gradient (-0.55 g per slot).
    """
    rng = np.random.default_rng(seed)
    n_total = 2 * n_per_group
    bench_pos = np.arange(1, n_total + 1)
    treatment = np.where(bench_pos <= n_per_group, "BioBoost-X", "Control")

    # Correlated environmental readout along the greenhouse bench
    sunlight_pct = np.clip(
        96.0 - 1.45 * (bench_pos - 1) + rng.normal(0.0, 1.8, size=n_total),
        20.0,
        100.0,
    )
    treat_indicator = (treatment == "BioBoost-X").astype(float)
    biomass_g = (
        54.0
        - 0.55 * bench_pos
        + true_effect * treat_indicator
        + rng.normal(0.0, 2.8, size=n_total)
    )

    return pd.DataFrame(
        {
            "pot_id": bench_pos,
            "bench_pos": bench_pos,
            "sunlight_pct": np.round(sunlight_pct, 1),
            "treatment": pd.Categorical(
                treatment, categories=["Control", "BioBoost-X"], ordered=True
            ),
            "biomass_g": np.round(biomass_g, 2),
        }
    )


def simulate_blocking_the_wrong_way(
    seed: int = 11,
    n_rows: int = 8,
    true_effect: float = 0.0,
) -> pd.DataFrame:
    """Simulate blocking parallel (instead of perpendicular) to a spatial gradient.

    A field has a strong West-to-East moisture decline across columns 1..4 (near
    the irrigation canal on the West to dry gravel on the East). The researcher
    attempts an RCBD with 4 treatments, but lays out each block as a horizontal
    row spanning columns 1..4—parallel to the gradient. Even with genuine random
    permutations inside each row-block, the blocks absorb none of the East-West
    gradient, leaving treatments vulnerable to spatial confounding.

    Ground truth: all 4 treatments have identical true yield (``true_effect=0.0``).
    """
    rng = np.random.default_rng(seed)
    treatments = ["Control", "Biochar", "Compost", "NanoKelp"]
    n_cols = len(treatments)

    records: list[dict[str, object]] = []
    for r in range(n_rows):
        perm = rng.permutation(treatments)
        row_noise = rng.normal(0.0, 0.08)
        for c in range(n_cols):
            trt = str(perm[c])
            col_num = c + 1
            # Strong West -> East drop (-0.65 t/ha per column step)
            moisture_pct = 36.0 - 5.5 * (col_num - 1) + rng.normal(0.0, 0.9)
            trt_bump = true_effect if trt == "NanoKelp" else 0.0
            yield_t_ha = (
                6.2
                - 0.65 * (col_num - 1)
                + row_noise
                + trt_bump
                + rng.normal(0.0, 0.30)
            )
            records.append(
                {
                    "plot_id": r * n_cols + col_num,
                    "row_num": r + 1,
                    "row_block": f"Row_{r + 1}",
                    "col_pos": col_num,
                    "soil_moisture_pct": round(float(moisture_pct), 1),
                    "treatment": trt,
                    "yield_t_ha": round(float(yield_t_ha), 3),
                }
            )

    df = pd.DataFrame(records)
    df["treatment"] = pd.Categorical(
        df["treatment"], categories=treatments, ordered=True
    )
    return df


def simulate_pseudoreplication(
    seed: int = 2,
    n_plants_per_group: int = 2,
    leaves_per_plant: int = 25,
    true_effect: float = 0.0,
) -> pd.DataFrame:
    """Simulate nested subsampling mistaken for independent experimental units.

    Two experimental plants per treatment (4 plants total) are grown under Control
    vs. Fertilized regimes, and 25 leaves are plucked from each plant (100 total
    leaves; 50 leaves per treatment). Because leaves on the same plant share plant
    genetics, root health, and microclimate (high intraclass correlation), treating
    100 leaves as independent replicates grossly inflates degrees of freedom.

    Ground truth: ``true_effect`` is 0.0 cm^2; plant-to-plant SD = 3.0 cm^2 while
    within-plant leaf-to-leaf SD = 1.5 cm^2 (ICC = 0.80).
    """
    rng = np.random.default_rng(seed)
    records: list[dict[str, object]] = []
    obs_id = 1
    for trt in ["Control", "Fertilized"]:
        trt_bump = true_effect if trt == "Fertilized" else 0.0
        for p in range(1, n_plants_per_group + 1):
            plant_id = f"{trt}_Plant_{p}"
            plant_effect = rng.normal(0.0, 3.0)
            leaf_areas = (
                25.0
                + trt_bump
                + plant_effect
                + rng.normal(0.0, 1.5, size=leaves_per_plant)
            )
            for leaf_idx, area in enumerate(leaf_areas, start=1):
                records.append(
                    {
                        "obs_id": obs_id,
                        "plant_id": plant_id,
                        "treatment": trt,
                        "leaf_num": leaf_idx,
                        "leaf_area_cm2": round(float(area), 2),
                    }
                )
                obs_id += 1

    df = pd.DataFrame(records)
    df["treatment"] = pd.Categorical(
        df["treatment"], categories=["Control", "Fertilized"], ordered=True
    )
    return df


def simulate_split_plot(
    seed: int = 21,
    n_blocks: int = 5,
    n_cultivars: int = 5,
    true_irrigation_effect: float = 0.0,
) -> pd.DataFrame:
    """Simulate a split-plot field trial misanalyzed as a Completely Randomized Design.

    Irrigation (Rainfed vs. Irrigated) is applied to large whole-plot strips
    across 5 field blocks (10 whole plots total), and each whole-plot strip is
    subdivided into 5 cultivar subplots (50 total subplots). Whole-plot strips vary
    substantially from patch to patch (sigma_a = 0.90 t/ha), whereas adjacent
    cultivar subplots within a strip are uniform (sigma_b = 0.22 t/ha).

    Randomization is explicit at both experimental-unit levels: within each block
    the two irrigation levels are randomly assigned to the two strip positions,
    and within each strip the cultivars are randomly assigned to subplot
    positions. ``strip_pos`` and ``subplot_pos`` record where each unit landed.

    Ground truth: Irrigation has zero true effect (``true_irrigation_effect=0.0``),
    whereas Cultivar has a modest real genetic progression (+0.12 t/ha per step,
    from ``Var_1`` upward).

    The default ``seed=21`` was chosen so the lesson shows the blunder (naive
    p < 0.01 for irrigation, honest split-plot p > 0.05). Like every default seed in
    this module it is a teaching example, not a typical draw: with a flat ANOVA the
    irrigation false-positive rate is roughly 40%, not 100%.
    """
    rng = np.random.default_rng(seed)
    irrigations = ["Rainfed", "Irrigated"]
    cultivars = [f"Var_{i}" for i in range(1, n_cultivars + 1)]
    cultivar_effect = {cv: 0.12 * idx for idx, cv in enumerate(cultivars)}

    records: list[dict[str, object]] = []
    subplot_id = 1
    for b in range(1, n_blocks + 1):
        block_eff = rng.normal(0.0, 0.25)
        # Randomize irrigation to the two whole-plot strips in this block.
        for strip_pos, irr in enumerate(rng.permutation(irrigations), start=1):
            irr = str(irr)
            wp_id = f"B{b}_{irr}"
            wp_eff = rng.normal(0.0, 0.90)
            irr_bump = true_irrigation_effect if irr == "Irrigated" else 0.0
            # Randomize cultivars to subplot positions within this strip.
            for subplot_pos, cv in enumerate(rng.permutation(cultivars), start=1):
                cv = str(cv)
                yield_t_ha = (
                    4.8
                    + block_eff
                    + irr_bump
                    + wp_eff
                    + cultivar_effect[cv]
                    + rng.normal(0.0, 0.22)
                )
                records.append(
                    {
                        "subplot_id": subplot_id,
                        "block": f"Block_{b}",
                        "irrigation": irr,
                        "whole_plot_id": wp_id,
                        "strip_pos": strip_pos,
                        "cultivar": cv,
                        "subplot_pos": subplot_pos,
                        "yield_t_ha": round(float(yield_t_ha), 3),
                    }
                )
                subplot_id += 1

    df = pd.DataFrame(records)
    df["irrigation"] = pd.Categorical(
        df["irrigation"], categories=irrigations, ordered=True
    )
    df["cultivar"] = pd.Categorical(df["cultivar"], categories=cultivars, ordered=True)
    return df


def split_plot_anova(
    df: pd.DataFrame,
    response: str = "yield_t_ha",
    block: str = "block",
    whole_plot: str = "irrigation",
    subplot: str = "cultivar",
) -> pd.DataFrame:
    """Classic split-plot ANOVA with each factor tested against its own error stratum.

    For a balanced split-plot in randomized complete blocks:

    ======================  ===============================  ==========================
    Source                  df                               Tested against
    ======================  ===============================  ==========================
    Block                   r - 1                            (not tested)
    Whole-plot factor A     a - 1                            Error(a) = Block x A
    Error(a)                (r - 1)(a - 1)
    Subplot factor B        b - 1                            Error(b)
    A x B                   (a - 1)(b - 1)                   Error(b)
    Error(b)                a(r - 1)(b - 1)
    ======================  ===============================  ==========================

    With 5 blocks, 2 irrigation levels and 5 cultivars this gives Irrigation
    F(1, 4), Cultivar F(4, 32) and Irrigation x Cultivar F(4, 32).
    """
    import statsmodels.formula.api as smf
    from scipy import stats
    from statsmodels.stats.anova import anova_lm

    blk, a_term, b_term = f"C({block})", f"C({whole_plot})", f"C({subplot})"
    formula = (
        f"{response} ~ {blk} + {a_term} + {blk}:{a_term} + {b_term} + {a_term}:{b_term}"
    )
    table = anova_lm(smf.ols(formula, data=df).fit())

    def row(term: str) -> tuple[float, float]:
        return float(table.loc[term, "df"]), float(table.loc[term, "sum_sq"])

    df_blk, ss_blk = row(blk)
    df_a, ss_a = row(a_term)
    df_ea, ss_ea = row(f"{blk}:{a_term}")
    df_b, ss_b = row(b_term)
    df_ab, ss_ab = row(f"{a_term}:{b_term}")
    df_eb, ss_eb = row("Residual")
    ms_ea, ms_eb = ss_ea / df_ea, ss_eb / df_eb

    def tested(name: str, d: float, ss: float, err_ms: float, err_df: float, err: str):
        ms = ss / d
        f = ms / err_ms
        return {
            "Source": name, "df": d, "SS": ss, "MS": ms, "F": f,
            "p_value": float(stats.f.sf(f, d, err_df)), "Error term": err,
        }

    def plain(name: str, d: float, ss: float):
        return {
            "Source": name, "df": d, "SS": ss, "MS": ss / d, "F": np.nan,
            "p_value": np.nan, "Error term": "",
        }

    rows = [
        plain("Block", df_blk, ss_blk),
        tested(whole_plot.capitalize(), df_a, ss_a, ms_ea, df_ea, f"Error(a), df = {int(df_ea)}"),
        plain("Error(a): Block x " + whole_plot.capitalize(), df_ea, ss_ea),
        tested(subplot.capitalize(), df_b, ss_b, ms_eb, df_eb, f"Error(b), df = {int(df_eb)}"),
        tested(
            f"{whole_plot.capitalize()} x {subplot.capitalize()}",
            df_ab, ss_ab, ms_eb, df_eb, f"Error(b), df = {int(df_eb)}",
        ),
        plain("Error(b): subplot residual", df_eb, ss_eb),
    ]
    out = pd.DataFrame(rows).set_index("Source")
    out["df"] = out["df"].astype(int)
    return out
