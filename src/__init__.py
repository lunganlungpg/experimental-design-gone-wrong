"""Synthetic dataset generators and helpers for Experimental Design Gone Wrong."""

from src.simulate_blunders import (
    PALETTE,
    build_comparison_table,
    format_p_value,
    set_publication_style,
    simulate_blocking_the_wrong_way,
    simulate_lazy_randomization,
    simulate_pseudoreplication,
    simulate_split_plot,
)

__all__ = [
    "PALETTE",
    "build_comparison_table",
    "format_p_value",
    "set_publication_style",
    "simulate_blocking_the_wrong_way",
    "simulate_lazy_randomization",
    "simulate_pseudoreplication",
    "simulate_split_plot",
]
