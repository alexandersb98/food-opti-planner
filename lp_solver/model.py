"""Data types for a small linear-programming problem."""

from dataclasses import dataclass
from typing import Dict, List, Optional


@dataclass
class Constraint:
    coeffs: Dict[str, float]
    sense: str  # '<=' | '>=' | '='
    rhs: float


@dataclass
class LPProblem:
    sense: str  # 'maximize' | 'minimize'
    objective: Dict[str, float]
    constraints: List[Constraint]
    bounds: Dict[str, List[Optional[float]]]  # var -> [lower, upper]
    variables: List[str]


@dataclass
class Solution:
    status: str  # 'optimal' | 'infeasible' | 'unbounded'
    objective_value: Optional[float]
    values: Dict[str, float]
