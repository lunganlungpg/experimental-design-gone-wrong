"""Verification tests ensuring reproducible blunders and proper statistical fixes."""

from __future__ import annotations

import numpy as np
import pandas as pd
import statsmodels.formula.api as smf
from scipy import stats
from statsmodels.stats.anova import anova_lm

from src.simulate_blunders import (
    simulate_blocking_the_wrong_way,
    simulate_lazy_randomization,
    simulate_pseudoreplication,
    simulate_split_plot,
)


def test_reproducibility() -> None:
    """Fixed seeds must yield byte-identical DataFrames across calls."""
    pd.testing.assert_frame_equal(
        simulate_lazy_randomization(), simulate_lazy_randomization()
    )
    pd.testing.assert_frame_equal(
        simulate_blocking_the_wrong_way(), simulate_blocking_the_wrong_way()
    )
    pd.testing.assert_frame_equal(
        simulate_pseudoreplication(), simulate_pseudoreplication()
    )
    pd.testing.assert_frame_equal(simulate_split_plot(), simulate_split_plot())


def test_module_01_lazy_randomization() -> None:
    df = simulate_lazy_randomization()
    assert len(df) == 40
    naive = smf.ols("biomass_g ~ C(treatment)", data=df).fit()
    proper = smf.ols("biomass_g ~ C(treatment) + bench_pos", data=df).fit()
    assert naive.pvalues["C(treatment)[T.BioBoost-X]"] < 0.01
    assert proper.pvalues["C(treatment)[T.BioBoost-X]"] > 0.05


def test_module_02_blocking_the_wrong_way() -> None:
    df = simulate_blocking_the_wrong_way()
    assert len(df) == 32
    naive_crd = smf.ols("yield_t_ha ~ C(treatment)", data=df).fit()
    wrong_rcbd = smf.ols("yield_t_ha ~ C(treatment) + C(row_block)", data=df).fit()
    proper_rcbd = smf.ols(
        "yield_t_ha ~ C(treatment) + C(row_block) + C(col_pos)", data=df
    ).fit()

    assert anova_lm(naive_crd).loc["C(treatment)", "PR(>F)"] < 0.01
    assert anova_lm(wrong_rcbd).loc["C(treatment)", "PR(>F)"] < 0.01
    assert anova_lm(proper_rcbd, typ=2).loc["C(treatment)", "PR(>F)"] > 0.05


def test_module_03_pseudoreplication() -> None:
    df = simulate_pseudoreplication()
    assert len(df) == 100
    assert df["plant_id"].nunique() == 4

    naive = smf.ols("leaf_area_cm2 ~ C(treatment)", data=df).fit()
    assert naive.df_resid == 98
    assert naive.pvalues["C(treatment)[T.Fertilized]"] < 0.01

    mlm = smf.mixedlm(
        "leaf_area_cm2 ~ C(treatment)", data=df, groups=df["plant_id"]
    ).fit(reml=True)
    assert mlm.pvalues["C(treatment)[T.Fertilized]"] > 0.05

    plant_means = df.groupby(["plant_id", "treatment"], as_index=False, observed=True)[
        "leaf_area_cm2"
    ].mean()
    _, p_unit = stats.ttest_ind(
        plant_means.loc[plant_means["treatment"] == "Fertilized", "leaf_area_cm2"],
        plant_means.loc[plant_means["treatment"] == "Control", "leaf_area_cm2"],
    )
    assert p_unit > 0.05


def test_module_04_split_plot_amnesia() -> None:
    df = simulate_split_plot()
    assert len(df) == 50
    assert df["whole_plot_id"].nunique() == 10

    naive_crd = smf.ols("yield_t_ha ~ C(irrigation) * C(cultivar)", data=df).fit()
    assert naive_crd.df_resid == 40
    assert anova_lm(naive_crd).loc["C(irrigation)", "PR(>F)"] < 0.01

    wp_means = df.groupby(["block", "irrigation"], as_index=False, observed=True)[
        "yield_t_ha"
    ].mean()
    wp_anova = anova_lm(smf.ols("yield_t_ha ~ C(block) + C(irrigation)", data=wp_means).fit())
    assert wp_anova.loc["C(irrigation)", "df"] == 1
    assert wp_anova.loc["Residual", "df"] == 4
    assert wp_anova.loc["C(irrigation)", "PR(>F)"] > 0.05

    mlm = smf.mixedlm(
        "yield_t_ha ~ C(block) + C(irrigation, Sum) * C(cultivar, Sum)",
        data=df,
        groups=df["whole_plot_id"],
    ).fit(reml=True)
    assert mlm.pvalues["C(irrigation, Sum)[S.Rainfed]"] > 0.05
