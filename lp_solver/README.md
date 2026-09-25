# lp_solver

A small, standalone sample app: give it a text file describing a linear
programming problem, and it prints the optimal solution. Pure Python,
no dependencies (it ships its own tiny Big-M simplex solver).

## Usage

```
python3 -m lp_solver examples/furniture.lp
```

```
status: optimal
objective (maximize): 36
  x = 2
  y = 6
```

## File format

The first non-comment, non-blank line declares the objective:

```
maximize: 3x + 5y
```

or `minimize:` (`max`/`min` also work, and the `:` is optional). Every
following line is a constraint: a linear expression, a comparison
operator (`<=`, `>=`, or `=`), and a plain number:

```
3x + 2y <= 18
```

Notes on the format:

- `#` starts a comment that runs to the end of the line; blank lines are
  ignored.
- A term is `<coefficient><variable>`, e.g. `3x`, `-2.5y`, or just `z`
  for an implicit coefficient of 1. An optional `*` between the number
  and the variable is allowed (`3*x`). Terms are combined with `+`/`-`.
- The right-hand side of a constraint must be a plain number -- no
  variables on the right.
- A constraint that mentions exactly **one** variable is treated as a
  **bound** on that variable (e.g. `x <= 10`, `x >= -2`) instead of a
  general constraint row. Every variable defaults to a lower bound of 0
  and no upper bound unless a bound line says otherwise.

See `examples/*.lp` in the repo root for complete problems, including
one that's infeasible and one that's unbounded.

## Limitations

This is a sample app, not a production solver:

- Every variable needs a finite lower bound (default 0) -- fully free
  (unbounded-below) variables aren't supported.
- The bundled simplex implementation is a plain Big-M method: fine for
  the small, well-scaled problems this app targets, but not built for
  speed or numerical robustness on large or ill-conditioned ones.
