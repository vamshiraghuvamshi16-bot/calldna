"""Small, dependency-free statistics helpers.

Everything here is deliberately conservative: we report sample sizes, intervals
and p-values so the dashboard never presents a hunch as a finding.
"""
import math


def wilson_interval(successes: int, n: int, z: float = 1.96) -> tuple[float, float]:
    """95% Wilson score interval for a proportion. Behaves well for small n."""
    if n == 0:
        return (0.0, 0.0)
    p = successes / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return (max(0.0, centre - half), min(1.0, centre + half))


def _normal_cdf(x: float) -> float:
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def two_proportion_test(s1: int, n1: int, s2: int, n2: int) -> dict:
    """Two-sided z-test comparing treatment (1) against control (2)."""
    if n1 == 0 or n2 == 0:
        return {"lift_pts": None, "p_value": None, "ci_low_pts": None, "ci_high_pts": None}
    p1, p2 = s1 / n1, s2 / n2
    pooled = (s1 + s2) / (n1 + n2)
    se_pooled = math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2))
    z = (p1 - p2) / se_pooled if se_pooled > 0 else 0.0
    p_value = 2 * (1 - _normal_cdf(abs(z)))
    se_diff = math.sqrt(p1 * (1 - p1) / n1 + p2 * (1 - p2) / n2)
    diff = p1 - p2
    return {
        "lift_pts": round(diff * 100, 2),
        "p_value": round(p_value, 4),
        "ci_low_pts": round((diff - 1.96 * se_diff) * 100, 2),
        "ci_high_pts": round((diff + 1.96 * se_diff) * 100, 2),
    }


def min_sample_per_arm(baseline: float, mde: float, alpha_z: float = 1.96, power_z: float = 0.84) -> int:
    """Rough per-arm sample size to detect an absolute lift of `mde` (80% power, 5% alpha)."""
    p1, p2 = baseline, min(0.999, baseline + mde)
    pbar = (p1 + p2) / 2
    num = (alpha_z * math.sqrt(2 * pbar * (1 - pbar)) + power_z * math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2
    return math.ceil(num / (mde ** 2)) if mde > 0 else 0
