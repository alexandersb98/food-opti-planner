# Cheapest mix of two foods meeting minimum protein and calorie needs.
minimize: 2x + 3y

# Protein: food x has 4g/unit, food y has 6g/unit; need at least 24g.
4x + 6y >= 24
# Calories: food x has 200/unit, food y has 100/unit; need at least 800.
200x + 100y >= 800

x <= 10
y <= 10
