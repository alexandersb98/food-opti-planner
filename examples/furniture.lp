# A furniture maker produces tables (x) and chairs (y).
# Each table earns $3 profit, each chair $5.
maximize: 3x + 5y

# At most 4 tables (machine time on one line).
x <= 4
# At most 6 chairs (machine time on another line).
2y <= 12
# Shared finishing time limits the combination of both.
3x + 2y <= 18
