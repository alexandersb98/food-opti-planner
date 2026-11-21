# Spec: the frontend rewritten in React, in the look of prototype D2

Status: ready-for-agent

## Problem Statement

The meal planner works, but its web app looks basic and generic: stock Material
cards, a blue toolbar and a side drawer that feels wrong on a phone. The owner
uses it on a phone, on the couch, to set up the coming week, make a plan and read
it. Three throwaway prototypes explored a new look; the owner picked D2, the
"refined editorial" one, where the week is set up on an editorial brief, the
plan reads as a restaurant menu and recipes are cookbook spreads.

D2 is only a static prototype with made-up data, and it covers three screens
(Plan, Results, the recipe editor). The real app has many more pages and
features (ingredients, attributes, tags, data sources, recipe import, units,
conversions, the clash card, saved plans, login), and is built on Vue 3 with
the Quasar component library, whose Material look is the thing the owner wants
to leave. Restyling Quasar to look like D2 would fight the library at every
control. The owner also wants the frontend in React from now on.

## Solution

Rewrite the frontend in React 19 with TypeScript and Vite, in place in the web
package, against the same FastAPI backend and the same OpenAPI contract. Every
page and feature of today's app keeps working. The Plan page, the Results page
and the recipe editor take D2's structure and look; every other page takes D2's
visual language (paper and ink palettes, Fraunces and Instrument Sans, kickers,
numbered sections, rules, the red-pencil accent) and is reached from D2's
"Contents" dialog. There is no side panel and no tab bar.

From the owner's side:

- A masthead with the wordmark and a running head (the folio number and the
  page's name) sits on every page. "Contents" opens a full-screen table of
  contents listing every page in order, with Log out at the end.
- The start page is "This week's brief": a cover with the week's dates and a
  one-paragraph summary, then four numbered sections (the schedule as a grid of
  place settings, the goals as sentences, the recipe filters as rule tags with
  the usable-recipe count, and the time allowed), and "Compose the week" at the
  end. Changing anything opens a bottom sheet or acts in place.
- Making a plan shows the week being "typeset" with a time ruler and Cancel,
  then opens The Menu: the plan as a menu card with a status stamp ("Best
  plan", "Time ran out", "Stopped early"), each day's meals as courses, totals
  in the margins and at the foot of each day, and a colophon with the missed
  goals and the totals table, plus Save, Use for today and Discard. When no
  plan is possible, an Editor's note lists the clash with the same fixes as
  today.
- Recipes are an A-to-Z index and each recipe a cookbook spread with a drawn
  colour plate. Edit turns the spread into an annotated page where everything
  can be changed, including the review of an imported recipe.
- Saved plans move to their own page, The archive.
- Swiping left or right turns to the next or previous page, as in a book.
- The app has a light "paper" edition and a dark "evening" edition, following
  the device or picked in Settings, honours reduced motion, and is fully usable
  with a keyboard and a screen reader.
- On a desktop the same pages show as a wider centred page on a "desk", with
  the same navigation.

## User Stories

### Signing in and finding the way

1. As the owner, I want to log in with my password on a page in the D2 look, so that the app feels like one product from the first screen.
2. As the owner, I want a wrong password to say "Wrong password." and a failed request to say it could not log in, so that I know whether to retype or retry.
3. As the owner, I want to come back to the page I asked for after logging in, so that a link or bookmark still works when my session had ended.
4. As the owner, I want to be sent to the login page whenever the server says my session ended, from any page, so that I never sit on a page whose calls fail silently.
5. As the owner, I want every page to still show (and fail visibly) when the server cannot be reached during the session check, so that a flaky connection does not log me out.
6. As the owner, I want a masthead with the wordmark on every page, so that I always know which app I am in.
7. As the owner, I want tapping the wordmark to take me to this week's brief, so that home is always one tap away.
8. As the owner, I want a running head in the masthead with the page's folio number and name, so that I know where I am after scrolling.
9. As the owner, I want a "Contents" button that opens a full-screen table of contents, so that I can reach every page without a side drawer.
10. As the owner, I want the Contents to list, in order, the brief, The Menu, the recipe index, The archive, Ingredients, Attributes, Tags and Settings, each with a one-line description and its page number, so that it reads like a magazine's contents.
11. As the owner, I want the Contents to show how many recipes, ingredients, attributes and tags I have, fetched each time it opens, so that I see what other pages changed.
12. As the owner, I want the Contents to mark the page I am on, so that I can orient myself.
13. As the owner, I want Log out at the end of the Contents, so that I can end my session.
14. As the owner, I want the Contents to close with its close button or Escape and to return focus to the Contents button, so that keyboard use is smooth.
15. As the owner, I want to swipe left or right on a page to turn to the next or previous page in Contents order, so that moving around feels like turning pages.
16. As the owner, I want swipes inside inputs, the schedule grid, segmented controls, chip rows, sheets and an editing spread to be ignored, so that I don't leave a page by accident.
17. As the owner, I want "Previous page" and "Next page" links and a folio at the foot of each page, so that I can turn pages without swiping.
18. As the owner, I want a page turn to slide in the direction I moved and to start at the top, so that the change of page is clear.
19. As a keyboard user, I want a "Skip to the page" link, so that I can pass the masthead.
20. As the owner, I want old links (the schedule and recipe filter editors, the unsaved plan, saved plans, recipes, ingredients, data sources) to keep working, so that bookmarks and the home-screen app don't break.
21. As the owner, I want the browser's Back button to move between pages as before, so that the app behaves like a website.

### This week's brief (the Plan page)

22. As the owner, I want the brief to open with the ISO week and the date range as a kicker and a "This week's brief" title, so that I know which week I'm planning.
23. As the owner, I want a standfirst that says, in words, how many days, meals a day, meals to plan, goals (and how many are Must) and usable recipes there are, so that I see the whole setup in one sentence.
24. As the owner, I want a small "In this brief" index of the four sections that scrolls to each section and moves focus to its heading, so that I can jump on a long page.
25. As the owner, I want the brief to show a loading state and, if it fails to load, a message with "Try again", so that a failed load is never a blank page.
26. As the owner, I want today's meals from the plan used for today shown on the brief, so that I can see what to cook now.
27. As the owner, I want tapping one of today's meals to open that plan at today with that meal open (or just at today for a skipped meal), so that I get to the ingredients fast.
28. As the owner, I want a line on the brief when a new plan exists that is not saved, with its dates and status and a link to The Menu, so that I don't lose track of it.

### The schedule

29. As the owner, I want section 1 to state the start day and date, the number of days and the meal names in a sentence, so that it reads naturally.
30. As the owner, I want the schedule as a grid of days by meals where each planned meal is a drawn place setting and each skipped meal is marked "out", so that I see the week at a glance.
31. As the owner, I want tapping a meal cell on the brief to switch it between planned and skipped, and the change to be saved, so that skipping a dinner is one tap.
32. As the owner, I want a failed save of a cell to put the cell back and tell me, so that the grid never shows something the server doesn't have.
33. As the owner, I want quick taps on several cells to all be saved in order, so that fast editing doesn't lose changes.
34. As the owner, I want tapping a day to open a sheet where I set "at least" how many of that day's planned meals must be served, with a preview sentence, so that the planner may leave some meals empty that day.
35. As the owner, I want the "at least" choice limited to the meals planned that day, and an "at least" that becomes too high after skipping a meal to be dropped, so that the setup stays valid.
36. As the owner, I want a day with an "at least" to show it under the day in the grid, so that I see where meals may be left empty.
37. As the owner, I want a legend for planned and skipped, and a short instruction, so that the grid explains itself.
38. As the owner, I want "Change" on the schedule to open a sheet with the start date, the number of days (a stepper within the server's limits), and the meal names, so that I can set up a new week.
39. As the owner, I want to pick the start date with the device's own date picker and see the resulting date range, so that picking a date is native and quick.
40. As the owner, I want to add, rename, reorder (move up and down) and remove meals in the schedule sheet, with one meal always kept and at most the server's maximum, so that I can shape my day.
41. As the owner, I want meal names checked (none empty, none twice, not too long) with the error next to the name, so that I fix mistakes before saving.
42. As the owner, I want the schedule sheet's Cancel to throw away its changes and Done to save them, with server refusals shown on their fields, so that I stay in control.
43. As the owner, I want long meal names shortened in the grid header but available in full to assistive technology, so that four or more meals fit on a phone.

### The goals

44. As the owner, I want each goal written as a sentence ("Between 1 500 and 2 000 kcal energy, as a daily average"), so that goals read like the brief they are part of.
45. As the owner, I want each goal marked Must or Prefer, with Prefer's importance as dots (or its importance below and above the range when they differ), so that I see how strict each goal is.
46. As the owner, I want a goal I gave a name to show that name, so that my labels stay visible.
47. As the owner, I want goals in the last clash marked in the warning colour with "In the clash" for screen readers, so that I can see which goals to loosen.
48. As the owner, I want "Add goal" disabled with "Add an attribute first" when there are no attributes, so that I know why I can't add one.
49. As the owner, I want an empty goals section to say what happens without goals, so that an empty section isn't confusing.
50. As the owner, I want tapping a goal to open the goal editor as a bottom sheet, so that changing a goal takes two taps.
51. As the owner, I want the goal sheet to show a live preview sentence of the goal as edited, so that I see what I'm saying.
52. As the owner, I want to pick what to track from the attributes as chips, set Min and Max with the attribute's unit shown, and choose Each day, Daily average or Plan total, so that I can express any goal the planner supports.
53. As the owner, I want to choose Must or Prefer and, for Prefer, an importance from 1 to 5, so that I can weigh goals.
54. As the owner, I want the "count a miss as a percentage of" field when a bound is zero, with its example sentence, so that zero-bound goals work as today.
55. As the owner, I want an Advanced part of the goal sheet with the goal's name, different importance below and above the range (for Prefer with both bounds), and "also keep each day in range" with its importance (for daily averages), opened by itself when the goal already uses them, so that nothing the current editor offers is lost.
56. As the owner, I want the goal sheet's errors (no bound, not a number, min above max, too many decimals, reference missing, name in use or too long, importance out of range, a refused setting) shown on their fields, with the Advanced part opened when an error is inside it, so that I can fix them.
57. As the owner, I want to delete a goal from its sheet, so that I can remove goals I no longer want.
58. As the owner, I want a saved goal to update the brief at once, so that what I see matches what is stored.
59. As the owner, I want a short explanation that Must goals are kept or there is no plan and Prefer goals are weighed by importance, so that the two kinds are clear.

### The recipe filters

60. As the owner, I want section 3 to show each filter as a rule tag ("Never: pork", "Only: weeknight"), so that I see what's excluded.
61. As the owner, I want the section to say how many of my recipes can be used, as the server counts it, shown in the warning colour when none can, so that I don't make a plan that cannot work.
62. As the owner, I want "See them" to take me to the recipe index, so that I can look at the recipes.
63. As the owner, I want "Change" (or tapping a rule tag) to open a sheet with every tag and Any, Only or Never for each, so that I can set filters.
64. As the owner, I want the sheet to update the usable count as I change modes, ignoring answers that arrive late, so that the count is always for what I see.
65. As the owner, I want the sheet to say when there are no tags yet and to point to the Tags page, so that an empty list isn't a dead end.
66. As the owner, I want Done to save the filters with the rest of the setup unchanged, and a failed save to say so, so that nothing else is touched.

### Time allowed and making a plan

67. As the owner, I want section 4 to say how long the planner may think, with a stepper, so that I can give it more time.
68. As the owner, I want to type an exact number of whole seconds within the server's limits as well as step, so that every value allowed today is still possible.
69. As the owner, I want a changed time to be saved with the rest of the setup, and an invalid time explained, so that it sticks.
70. As the owner, I want "Compose the week" at the end of the brief, with a note of how many meals it will fill, so that the main action is obvious.
71. As the owner, I want "Compose the week" disabled while the setup is loading or a plan is being made, so that I can't start two solves.
72. As the owner, I want a full-screen "Composing the week" view while the plan is made, with seconds counted against the time allowed and a ruler, so that I know it's working and how long it may take.
73. As the owner, I want Cancel (and Escape) on that view, showing "Stopping…" until the server stops, so that I can stop a long solve.
74. As the owner, I want a solve that is still running when I come back to the brief (after Back or a reload of state) to show the composing view again, so that a running solve is never invisible.
75. As the owner, I want a finished plan to open The Menu when I'm still on the brief, and otherwise to show up as the new-plan line on the brief, so that I'm not yanked away from another page.
76. As the owner, I want a failure with no plan (no plan in time, no recipes, no usable recipes, too large, stopped, busy in another tab, error) shown on the brief as a dismissible note with the reason and what to try, so that I know what went wrong.

### No plan possible (the clash)

77. As the owner, I want a solve with no plan possible to show an Editor's note "No plan possible" in place of The Menu, so that the failure reads as part of the publication.
78. As the owner, I want the note to list the rules that clash: each clashing Must goal with where it clashes (on which days, or over the whole plan) and each day whose meal minimum takes part, so that I see exactly what to change.
79. As the owner, I want to loosen a clashing goal's Min or Max (and its zero reference when shown) right in the note, so that I can fix it without hunting for the goal.
80. As the owner, I want "Make Prefer" and "Keep Must" on each clashing goal, with "Will be Prefer" shown when switched, so that I can relax a goal in one tap.
81. As the owner, I want "Change the schedule" on a clashing day, opening the schedule on the brief, so that I can fix meal minimums.
82. As the owner, I want the note to say whether fixing these may show another clash or that the solve stopped early and some may not take part, so that I understand the list.
83. As the owner, I want "Try again" to save my changes (if any) and make a plan again, and "Dismiss" to close the note, so that the loop of fix and retry is quick.
84. As the owner, I want a clash with no listed rules to say only that no plan is possible with these settings, so that an empty list never shows.
85. As the owner, I want field errors and a failed save shown inside the note, so that a bad edit isn't lost.

### The Menu (the Results page)

86. As the owner, I want The Menu to show the unsaved plan as a menu card with an ornament, "The Menu", the date range, the number of days and dishes, and whether it is saved, so that a plan reads like a printed menu.
87. As the owner, I want a status stamp on the card ("Best plan", "Time ran out", "Stopped early"), with the full status in words for screen readers, so that I know how good the plan is.
88. As the owner, I want The Menu to show a blank card with "Compose the week" and a link to the brief when there is no unsaved plan and no clash, so that the page is never empty.
89. As the owner, I want each day as a section with its weekday and date, and each meal as a course with the recipe and its portion multiplier, so that I can read the week.
90. As the owner, I want skipped meals shown as "skipped" (dining out), so that the gaps are explained.
91. As the owner, I want small figures in the margin for each dish (its values for the first attributes), so that I see what each dish brings.
92. As the owner, I want each day's totals at its foot, the attributes with goals first (or the first three), with values that missed a goal that day in the warning colour and marked for screen readers, and all attributes on request, so that I can check a day.
93. As the owner, I want to open a planned meal to see its ingredients scaled to the portion and its totals, so that I know what to cook and how much.
94. As the owner, I want the dish name to lead to its recipe spread when that recipe still exists, so that I can read the method.
95. As the owner, I want the plan opened at today's day when it covers today, and at the day and meal given in the link from the brief, so that I land where I need to be.
96. As the owner, I want a "Today" jump when the plan covers today and I'm looking elsewhere, so that I get back fast.
97. As the owner, I want a colophon at the end saying how the week turned out, a pull figure for the week's first attribute total, the missed goals with what was missed and the worst day, or "All goals met", so that I know what the plan gave up.
98. As the owner, I want a totals table with each attribute's plan total and daily average, collapsed to five rows with "Show all" when there are more, so that the summary stays short.
99. As the owner, I want Save and Discard on an unsaved plan, Discard asking first that it can't be undone, both returning to the brief, so that I can keep or drop it.
100. As the owner, I want a saved plan opened from The archive to show the same menu with Delete (asking first, naming the plan) and "Use for today" when it covers today and isn't already used, so that I can manage saved plans.
101. As the owner, I want "Use for today" to stay on the page and mark the plan as used for today, so that I can carry on reading.
102. As the owner, I want failures of save, discard, delete and use-for-today shown on the page, so that I know to retry.
103. As the owner, I want the days of a just-composed menu to be set one after another and the stamp to land, once, so that finishing a plan feels like a moment, and none of it with reduced motion.
104. As the owner, I want a menu that fails to load to say so with "Try again", so that I can recover.

### The archive (saved plans)

105. As the owner, I want The archive to list saved plans newest first as the server sends them, each with its dates and when it was saved in my time zone, so that I can find old plans.
106. As the owner, I want the plan used for today marked "Today", so that I know which plan feeds today's meals.
107. As the owner, I want tapping a saved plan to open its menu, so that I can read it again.
108. As the owner, I want an empty archive to say how plans get there and link to The Menu, so that it isn't a dead end.

### The recipe index

109. As the owner, I want the recipe index to list recipes A to Z under letter headings, each with a small drawn plate, its tags and its per-portion totals, so that the list reads like a cookbook index.
110. As the owner, I want to search recipes by name, so that I find one fast.
111. As the owner, I want quick tag chips (every tag some recipe has, in tag order) that narrow the list to recipes with all chosen tags, so that I can browse by kind.
112. As the owner, I want "No recipes yet" and "No recipes match" states, the latter with a way to clear the search, so that empty results are clear.
113. As the owner, I want an add menu with "New recipe" and "Import recipe", the import disabled with "Needs an AI key" when the server has no AI key, so that I know what's possible.
114. As the owner, I want the index to load without waiting for the AI-key check, so that the page is never held up by it.

### The recipe spread (viewing a recipe)

115. As the owner, I want a recipe to open as a spread with a drawn colour plate in a colour derived from the recipe, a plate number, the recipe's name as a large title and a kicker, so that recipes look like a cookbook even without photos.
116. As the owner, I want the spread to show the servings and the portion range, so that I know how it is planned.
117. As the owner, I want the ingredients listed per section with the amount, the unit and the name, and the section names shown only when there is more than one section or it has a name, so that a simple recipe looks simple.
118. As the owner, I want a line whose unit doesn't convert, or an ingredient that no longer exists, flagged on the spread, so that I know the totals are off.
119. As the owner, I want the instructions shown as a numbered method, one step per paragraph of the text, so that I can cook from the page.
120. As the owner, I want the tags shown, with the ones that come from the ingredients marked as such, so that I know where each tag comes from.
121. As the owner, I want a per-portion nutrition table, so that I know what one portion gives.
122. As the owner, I want the source link shown as a readable link, opened in a new tab, and only for http and https links, so that I can go back to the original safely.
123. As the owner, I want a "Back to the index" link on the spread, so that I can return to the list.

### Editing a recipe (annotating the spread)

124. As the owner, I want "Edit" to turn the spread into an annotated page where every changeable thing is underlined in red pencil, with Cancel and Save in a bar, so that editing happens in place.
125. As the owner, I want "New recipe" to open a blank spread already in edit mode, so that creating and editing look the same.
126. As the owner, I want to edit the name, the servings (with "amounts are for the whole recipe"), and the portion size From, To, "any amount" or "in steps" with the step, so that I can set how the planner portions it.
127. As the owner, I want the Advanced portion settings (never more than, with its default explained, and the over-size penalty), so that nothing the current editor offers is lost.
128. As the owner, I want to add sections, name them, remove them, and move a line to another section from a line menu, so that long recipes stay organised.
129. As the owner, I want "Add a line" per section to open a searchable ingredient picker sheet, where the same ingredient may be picked for several lines, so that adding a line is quick.
130. As the owner, I want each line's amount and unit editable, the unit picked from the ingredient's own unit, the catalogue units that convert to it, and the ingredient's conversions (AI-suggested ones marked), so that I can write "2 dl" instead of grams.
131. As the owner, I want "New unit…" in a line's unit list to open the conversion sheet for that ingredient and give the line the new unit once saved, so that I can add a unit on the spot.
132. As the owner, I want a line whose unit doesn't convert marked with the reason, so that I fix it before planning.
133. As the owner, I want to remove a line, so that I can correct mistakes.
134. As the owner, I want live per-portion totals while I edit, so that I see the effect of each change.
135. As the owner, I want the tags as chips: the ones from the ingredients on and marked "auto" (by each tag's rule, as the server says), the others to switch on or off, so that I can add tags by hand.
136. As the owner, I want to edit the instructions as text and the source link, so that the method and source are kept with the recipe.
137. As the owner, I want every field error (name missing or in use, servings out of range, no lines, amount invalid, multipliers invalid or below each other, not in whole steps, penalty invalid, bad link, unknown ingredient, a refused conversion) shown on its field, so that I can fix it.
138. As the owner, I want Save to store the recipe and leave edit mode, and Cancel to restore the spread as it was, so that I control what is kept.
139. As the owner, I want to delete a recipe from edit mode after confirming, so that I can remove recipes.
140. As the owner, I want leaving an existing recipe mid-edit to throw the edits away and tell me so, so that a half-edited recipe is never half-saved.

### Importing a recipe

141. As the owner, I want an Import page where I give a link or paste the recipe text, with the text kept when I switch between the two and after an error, so that I don't retype.
142. As the owner, I want "Reading the recipe…" while the AI works, and each refusal (no text, too long, no recipe, no recipe on the page, page unreadable, no link, bad link, AI failed, daily limit, no AI key, other) in words with what to do, so that I can recover.
143. As the owner, I want a finished import to open as a new spread in edit mode under review, so that I check the draft before anything is stored.
144. As the owner, I want a banner saying where it came from (pasted text or the site's name), how many lines need me, and that the end was left out when the text was long, so that I know what to review.
145. As the owner, I want each imported line to show its original text and what it needs: pick an ingredient (search starting from the line's food), give a factor ("1 dl = [100] g", with the AI's suggestion to accept or change), pick another unit, or skip, so that every line ends up right.
146. As the owner, I want "+ New ingredient" in the picker to open the ingredient form in a sheet with the line's food as the name, and the new ingredient matched to the line once saved, so that I don't leave the review.
147. As the owner, I want skipped lines greyed with "Add anyway" (for a line the AI thought was not an ingredient) or "Add back", so that skipping is reversible.
148. As the owner, I want Save blocked with "Match, convert or skip every line to save" until each line is settled, so that a broken recipe isn't stored.
149. As the owner, I want accepted factors saved as conversions with the recipe (marked as AI-suggested until I edit them), so that my units keep working afterwards.
150. As the owner, I want leaving an unsaved imported recipe to ask "Discard this recipe?" with "Keep editing" and "Discard", so that I don't lose an import by accident.

### Ingredients

151. As the owner, I want an Ingredients page in the D2 look listing my ingredients alphabetically with each one's basis and values ("per 100 g · Energy 389 kcal · Protein 16.9 g"), so that I can compare them.
152. As the owner, I want to search ingredients, with "No ingredients yet" and "No ingredients match" states, so that I find one fast.
153. As the owner, I want ingredients with updated values from their data source marked, and a toggle "Only with updated values (n)" shown when any have them, so that I can review updates.
154. As the owner, I want to add a new ingredient or add one from a data source from this page, so that both ways are at hand.
155. As the owner, I want an ingredient page with its name, the unit it is measured in (from the unit catalogue, grouped by kind, the preferred unit first, or typed), its value basis following the unit unless changed, a value per attribute (empty meaning 0) and its tags, so that I can describe it fully.
156. As the owner, I want a new ingredient to start in my preferred mass unit, so that I type less.
157. As the owner, I want errors on the ingredient's fields (name missing or in use, unit missing or not for an ingredient, non-mass unit for a linked ingredient, basis invalid, number invalid or too long) shown on the field, so that I can fix them.
158. As the owner, I want a change of the ingredient's unit to ask first, saying what will be converted or kept and what would be rounded, and a refused change explained under the unit, so that stored numbers are never changed by surprise.
159. As the owner, I want the ingredient's conversions listed ("1 dl = 100 g"), with add, edit and delete, delete disabled while a recipe uses one and an AI-suggested one marked, so that I can manage units.
160. As the owner, I want the conversion sheet to refuse its own unit, a duplicate, a bad number, and to say only the number can change when a recipe uses the unit, so that conversions stay consistent.
161. As the owner, I want "Used in n recipes · Show" to list those recipes when asked, so that I know where an ingredient is used.
162. As the owner, I want delete refused while recipes use the ingredient, and the confirmation to say which conversions go with it, so that I don't break recipes.
163. As the owner, I want a linked ingredient to show where it comes from in the source's colour, "No longer in the source" when withdrawn, and "Unlink from source" with a confirmation, so that I can manage the link.
164. As the owner, I want a banner when the source has new values, listing old and new per attribute, with Accept and Keep mine, so that I decide on updates.
165. As the owner, I want "Add from data source" as a full-screen sheet: pick a source (the last one remembered), search its foods twenty at a time with "Show more", preview the ingredient (unit, basis, values copied, columns not copied, source tags), change its name and tags, be warned about an existing ingredient from the same food, and add it, so that I can import foods quickly.
166. As the owner, I want late search answers in that sheet dropped and a withdrawn food explained, so that I never add the wrong food.

### Attributes

167. As the owner, I want an Attributes page in the D2 look listing each attribute with its unit and decimals, so that I see what I track.
168. As the owner, I want to open an attribute in place to edit its name, unit (from the catalogue, or typed) and decimals, saved when I close it or open another, staying open if the save fails, so that editing a list is quick.
169. As the owner, I want "+ New attribute" to add one in place, so that I can track something new.
170. As the owner, I want errors (name missing or in use, decimals out of range) shown on the field, so that I can fix them.
171. As the owner, I want a unit change to ask first what it converts or keeps, and a refusal (decimals needed, too large, rounds to zero, mapped from a source column of another unit) explained under the unit until I edit it, so that values aren't changed by surprise.
172. As the owner, I want delete to say it also removes the attribute's values from n ingredients and n goals and clears its source mapping, so that I know the consequences.

### Tags

173. As the owner, I want a Tags page in the D2 look listing tags made by hand first and source tags after, each with its rule ("when all/any ingredients have it") and where it comes from, so that I see how recipes get tags.
174. As the owner, I want to open a tag in place to edit its name and rule, saved on close, so that editing is quick.
175. As the owner, I want source tags shown in their source's colour, without a name field or Delete, with a note that they can't be renamed or deleted, so that I don't try.
176. As the owner, I want to make tags equivalent by adding them to a group, with the picker saying which tags a candidate is already equivalent to, so that filtering on one includes the others.
177. As the owner, I want the server's questions about groups (move a tag here, switch its rule, change the rule of the whole group) asked one at a time with their answers, so that group changes are deliberate.
178. As the owner, I want delete to say what else is removed (from ingredients, recipes and plan filters) and that the tag leaves its group, so that I know the consequences.
179. As the owner, I want "+ New tag" and errors on the name (missing or in use), so that I can add tags.

### Settings and data sources

180. As the owner, I want Settings in the D2 look with my preferred units for mass, volume and energy, saved when changed and noting that nothing saved is converted, so that new things start in my units.
181. As the owner, I want Settings to let me pick the edition: follow the device, paper (light) or evening (dark), remembered on this device, with the browser's toolbar colour following, so that I can read in bed.
182. As the owner, I want a language choice to appear in Settings once a second language exists, so that Swedish can be added without a redesign.
183. As the owner, I want the data sources listed in Settings with their version, number of foods and how many columns are mapped, loading on their own so a failure doesn't hide my units, so that I can open each source.
184. As the owner, I want a data source page with its version, when it was imported, its attribution and its colour (saved when the picker closes), so that I know where data comes from.
185. As the owner, I want the source's columns listed in the server's order (withdrawn last, marked), searchable, each with an Attribute choice offering the attributes that convert with the column's unit, those taken by another column disabled with the holder named, "Not mapped", and "Create attribute…", so that I can map columns.
186. As the owner, I want a refused mapping explained (already mapped from another column, units don't convert) after the page refreshes to the truth, so that a stale page can't mislead me.
187. As the owner, I want "Create attribute…" to open a small sheet with a name, a unit of the column's kind starting at my preferred unit, and decimals, and to map the column to the new attribute, saying so if only the creation worked, so that new attributes come straight from the data.

### Look, feel and access

188. As the owner, I want the D2 typography (Fraunces for display and reading text, Instrument Sans for controls), its type scale, 4 px rhythm, old-style figures in text and tabular figures in tables, so that the app looks like D2.
189. As the owner, I want the fonts to come with the app rather than from a third-party font service, so that the app looks right offline and nothing about me leaks to a font host.
190. As the owner, I want the paper and evening palettes exactly as in D2, with the red-pencil accent and its contrast, so that both editions are readable.
191. As the owner, I want sheets to slide up from the bottom with a grip, a title and a close button, trap focus, close with Escape or by tapping outside, lock the page's scroll and return focus to what opened them, so that they work for touch and keyboard.
192. As the owner, I want short confirmations ("Goal changed.", "Saved to the archive.") as a brief toast announced to screen readers, and errors next to what failed, so that I notice both.
193. As the owner, I want every control at least 44 px tall to tap, visible red-pencil focus rings, and labels on every input and icon button, so that the app is easy to use.
194. As the owner, I want all motion (page turns, sheets, the composing view, the menu reveal) turned off with reduced motion, so that the app is calm when I ask for it.
195. As the owner, I want layouts that leave room for longer Swedish labels and never scroll sideways at 320 px, so that the app works on small phones and in other languages.
196. As the owner, I want the app usable on a desktop: a wider centred page on the desk background, sheets centred, hover states and full keyboard use, so that I can plan at the computer too.
197. As the owner, I want the home-screen app's name, colours and icon to match the new look, so that it feels like one product when installed.

### Developer stories

198. As a developer, I want the React app to use the existing typed API client and generated types unchanged, so that the contract with the server stays the single source of truth.
199. As a developer, I want the framework-agnostic modules (formatting, dates, goals, clash, lists, numbers, totals, misses, units' lookup, import review rules, draft rules) and their tests kept and reused, so that tested behaviour isn't rewritten.
200. As a developer, I want every text to go through the i18n layer using the existing English message file, so that Swedish can be added as another file.
201. As a developer, I want lint, typecheck and tests to pass in CI after every completed ticket, and the end-to-end test to keep passing, so that the branch is always shippable.
202. As a developer, I want Vue, Quasar and vue-i18n removed from the dependencies by the end, so that there is one framework.
203. As a developer, I want each finished piece of UI checked against the D2 prototype with screenshots at phone and desktop width, in both editions, so that the look doesn't drift.

## Implementation Decisions

### Stack

- **React 19, TypeScript, Vite**, in the existing web package. Build output goes
  to the same place as today, so the container build and the server's static
  file serving don't change. The backend, the API contract, the generated types
  and the typed `openapi-fetch` client are unchanged.
- **Router: React Router 7 in data mode** (a browser router built from a route
  tree, no framework mode, no server rendering). Chosen because it gives
  route-level redirects for the session check, a blocker for "Discard this
  recipe?", a memory router for tests, and stable URLs with nested layouts,
  with a small learning surface. Pages fetch their own data (see below); route
  loaders are used only for the session check and redirects.
- **i18n: a small in-house translator** that reads the existing English
  message file as it is and implements the subset of vue-i18n's message format
  the app uses: named placeholders (`{name}`), pipe-separated plural forms
  (two forms: one and other; three forms: zero, one and other), the implicit
  `{n}`, and the four call shapes in use (key; key and named values; key and a
  count; key, named values and a count). It keeps the signature of the
  `Translate` type that framework-agnostic modules already take as a
  parameter, so those modules are reused unchanged. It is exposed through a
  React context and a `useT` hook, holds the locale (English now; a second
  message file and plural rule per locale can be added) and is unit-tested
  against every message in the file. No i18next or FormatJS: both would
  require rewriting the messages into another syntax.
- **No component library.** Every control is hand-written in React with
  hand-written CSS built from D2's design tokens. Plain CSS files with custom
  properties, one stylesheet per primitive or page, scoped by class naming;
  no CSS-in-JS, no Tailwind.
- **Fonts** (Fraunces and Instrument Sans, variable) are self-hosted from npm
  font packages through Vite, with `font-display: swap`, not loaded from Google
  Fonts.

### Migration: side by side, swapped at the end

The React app is built **side by side** with the Vue app in the same web
package and **swapped in at the end**, rather than deleting Vue first.

- Why: the end-to-end test in CI drives the real app through every feature. If
  Vue were removed first, the app would be missing most features until the last
  page landed, so either the e2e job fails for most of the work or it must be
  disabled. Side by side, the Vue app stays the built and served app (and its
  tests and e2e keep passing) until the React app reaches parity.
- The React app has its own source folder and its own HTML entry. The Vite dev
  server serves both (the React app under its own entry), so each React page can
  be run and screenshotted against the real backend while Vue is still the
  production build. Vite, ESLint, TypeScript and Vitest are configured for both
  frameworks during the transition (React plugin added beside the Vue plugin;
  `.tsx` included in typecheck; React lint rules for the React folder).
- Shared framework-agnostic modules stay where they are and are imported by
  both apps. Vue-specific wrappers are not edited; React equivalents are added.
- The final swap ticket makes the React entry the root entry, ports the e2e
  test to the React app's accessible names, deletes the Vue app, its tests,
  Quasar, vue-i18n, the Vue Vite and ESLint plugins and `vue-tsc` (typecheck
  becomes `tsc`), and updates the manifest and theme colours. CI's three web
  commands (lint, typecheck, test) keep their names.

### Modules

Reused unchanged (with their tests): the API client and error helpers, the
generated schema and API types, formatting (`valueText`, rounding, ranges),
dates, goals, clash rows, lists (search and by-id), numbers, fractions,
totals, misses, colours, attribute fields, line units, and the pure parts of
the import review.

Split, keeping the pure part:

- **Draft rules.** The goal, recipe and schedule draft modules already export
  their rules as pure functions (draft from stored value, field checks, fields
  to send, server errors to fields, what shows when). Those functions and their
  tests are reused as they are. Only the Vue hook at the end of each module is
  replaced by a React hook that holds the draft with `useState`/`useReducer`
  and calls the same functions.
- **Shared stores** (the running solve, the unit catalogue, the preferences,
  the unit-change question, the imported draft hand-over) are rewritten as
  framework-neutral stores: a plain module with state, `subscribe` and
  `getSnapshot`, read in React through `useSyncExternalStore`. Their behaviour
  (load once and share, retries after failure, ignore answers from before a
  reset, serialised preference saves, the solve id carried by Make plan and
  Cancel, the clash and its minimality kept until dismissed) is kept, and
  their existing tests are ported to the neutral store API.
- **Saving the setup.** The "fields to send back" functions for the whole plan
  setup are reused. A small plan-setup store in React owns the loaded setup and
  serialises saves (each change sends the whole setup, one save at a time, the
  next built from the latest state), because the brief now saves cell taps,
  time changes and sheet results directly.
- **Recipe count**: the "latest question wins" counter becomes a hook over the
  same rule.

New React-side modules (deep modules with small interfaces):

- **App shell**: masthead (wordmark, running head with folio), Contents dialog
  (page list with descriptions, folios, counts, current page, Log out), page
  turn links and folio, swipe-to-turn, page-enter transition, skip link,
  theme (edition) handling, toast region.
- **Page registry**: one ordered list of the Contents pages, each with its
  route, title, description and running-head text. The Contents order, the
  folio numbers, swipe order and turn links all come from it. Detail routes
  (a recipe, an ingredient, a data source, a saved plan, import) name the
  registry page they belong to, for the running head and swipes.
- **Load hook**: a page's data loaded when it opens, with loading, failed and
  retry, and several calls run in parallel through the existing `loadAll`
  rule; answers that arrive after the page left or after a newer load are
  ignored (safe under React's strict-mode double effects).
- **UI primitives**: Sheet (bottom sheet on a native `dialog` element opened
  modally: focus trap, Escape, backdrop tap, scroll lock, focus return,
  animated open and close, a full-screen variant), Confirm (a sheet with a
  warning and two actions), Stepper, Segmented control (a group of pressed
  buttons), Chips, Field (label, hint, error, described-by wiring), Combobox
  (the unit field: typed text kept as typed, grouped options with the
  preferred one first, ARIA 1.2 combobox pattern), Select (native, with
  groups, for line units and column mappings), Disclosure (Advanced parts),
  LoadState (loading, failed with Try again), Toast, Plate (the drawn SVG
  colour plate and swatch, hue derived deterministically from the recipe id),
  Importance dots, Rule tag.
- **Pages**: Login, Brief, Menu (unsaved and saved plan, clash note, blank
  card), Archive, Recipe index, Recipe spread (view and edit modes), Import,
  Ingredients, Ingredient, Attributes, Tags, Settings, Data source.

### Routes

| Route | Page | Contents entry |
|---|---|---|
| `/login` | Login | none |
| `/` | This week's brief | 1 |
| `/plans/new` | The Menu: clash note, unsaved plan or blank card | 2 |
| `/plans` | The archive | 4 |
| `/plans/:id` | The Menu for a saved plan, `?day=` and `?meal=` kept | 4 |
| `/recipes` | The recipe index | 3 |
| `/recipes/new`, `/recipes/:id` | Recipe spread | 3 |
| `/recipes/import` | Import | 3 |
| `/ingredients`, `/ingredients/new`, `/ingredients/:id` | Ingredients, Ingredient | 5 |
| `/attributes` | Attributes | 6 |
| `/tags` | Tags | 7 |
| `/settings`, `/settings/data-sources/:key` | Settings, Data source | 8 |
| `/plan/schedule`, `/plan/recipes` | redirect to `/` with the schedule or filters sheet open | 1 |

Every route but `/login` sits under the app shell. A root loader asks the
server for the session; a 401 redirects to `/login` with `redirect` (left out
for `/`), and an unreachable server lets the page show. The client's
unauthorised handler sends any later 401 (except login and session) to the
login page with the current path. Contents order: brief, The Menu, recipe
index, The archive, Ingredients, Attributes, Tags, Settings (D2's order with
the catalogue pages added after Ingredients).

### Specific interactions

- **The brief saves in place.** Cell taps, the "at least" sheet, the time
  stepper and typed time, and the filters, schedule and goal sheets all save
  the whole setup through the plan-setup store. A cell tap and a stepper step
  update the page at once and revert with an error if the save fails. Sheets
  save on Done and stay open with errors on refusal.
- **"At least" rules** follow today's schedule rules: the choices are 0 up to
  the meals planned that day, "all" means no minimum, and skipping a meal that
  makes a minimum too high drops the minimum (as D2 does) instead of showing an
  error.
- **Max solving time**: steps of 5 s up to 60 s and 30 s above (D2), within the
  server's limits of 1 to 300 s, and the value is also a numeric input for any
  whole number in range.
- **Solving view**: a full-screen modal dialog with the kicker, "Composing the
  week", the seconds against the time allowed, a progress ruler (a
  `progressbar`), the galley of days and Cancel. The galley shows the days and
  a rotating status line, never invented recipes; the real server says nothing
  until it answers. The clock is the browser's against the time allowed, full
  past it, as today. Escape triggers Cancel.
- **Clash**: shown as the Editor's note on `/plans/new` when the last solve was
  infeasible and not dismissed; the solve finishing as infeasible navigates
  there if the owner was on the brief. The goals on the brief are marked from
  the same clash.
- **Today's meals** appear on the brief, between the cover and section 1, when
  a plan is used for today.
- **Menu days** are all on one page, in order, not a carousel. `?day=` scrolls
  to and focuses that day; `?meal=` opens that meal's ingredients. Without
  them the page scrolls to today when the plan covers it. Day totals show the
  attributes with goals (or the first three) and expand to all on request, as
  today; missed values come from the server's per-day misses.
- **Margin figures** on each dish show its first two attributes in attribute
  order (D2 shows energy and protein from made-up data).
- **Dish to recipe link**: a plan result names its recipe but carries no id,
  so the dish links to the recipe with that exact name when the recipe list
  has one; otherwise it is plain text.
- **Recipe spread**: view and edit are one page with an edit mode. New recipes
  and imported drafts open in edit mode. Method steps are the instructions
  split on blank lines (or line breaks when there are none) for display; they
  are edited as one text field, as stored. The plate number is the recipe id.
  D2's "minutes" are not shown: recipes have no time field.
- **Unsaved edits**: an imported draft asks before leaving (blocker); edits of
  an existing recipe are thrown away on leaving with a toast (D2); other forms
  behave as today.
- **Attributes and Tags** keep today's "one open row at a time, saved when it
  closes" model, styled as entries of a D2 list with the open entry annotated.
- **Unit-change question**, tag-group questions, delete confirmations and
  conversions are sheets.
- **Theme**: `data-theme` on the root element (absent for "follow the
  device"), the choice kept in local storage with a versioned key, applied
  before first paint by a tiny inline script in the HTML entry, and the
  `theme-color` meta tags updated to match. The edition is a per-device
  setting; the server's preferences are unchanged.
- **Desktop**: from about 768 px the page is a centred column of up to 720 px
  on the desk background with D2's page shadow; sheets are centred and as wide
  as the page; the masthead spans the page. Swipes are touch only; keyboard
  users turn pages with the turn links and Contents.
- **Copy**: D2's editorial names are the app's display copy: the wordmark
  "The Weekly Table", "This week's brief", "The Menu", "The archive", "The
  recipe index", "Compose the week", "Time allowed", "Editor's note". All new
  copy goes into the English message file. The recipe filters keep the name
  "Recipe filters" in the brief's section title rather than D2's "Pantry
  rules", which the domain doesn't use.

### Design tokens (from the prototype)

The palettes, type scale and spacing are D2's, taken verbatim. Trimmed from
the prototype's stylesheet:

```css
/* paper edition (light) */
--paper: #f4efe4; --paper-2: #ebe4d5; --paper-3: #e1d8c5;
--ink: #1d1a16; --ink-2: #39332b; --muted: #62594c;
--rule: #d2c7b2; --rule-strong: #1d1a16;
--accent: #a4371a; --accent-ink: #fff8ef; --accent-soft: #f2ddd0;
--good: #3b6636; --review: #f8e4a0; --review-ink: #4f3a00;
--desk: #d9d0be; --desk-2: #cbbfa8;
/* evening edition (dark): device dark unless data-theme="light", or data-theme="dark" */
--paper: #16130f; --paper-2: #1f1b16; --paper-3: #2a251e;
--ink: #efe6d4; --ink-2: #d6ccb8; --muted: #a99e8a;
--rule: #3d362c; --rule-strong: #cfc5b1;
--accent: #ef8d66; --accent-ink: #1a110b; --accent-soft: #3b2319;
--good: #9cc38f; --review: #45380f; --review-ink: #f6dc8a;
--desk: #0c0a08; --desk-2: #1b1712;
/* type: ~1.25 scale, line heights on a 4px grid */
--fs-xs: 12.5px/16px; --fs-sm: 14px/20px; --fs-body: 16.5px/24px;
--fs-text: 18px/28px (serif reading); --fs-lead: 20px/28px;
--fs-h3: 24px/28px; --fs-h2: 32px/36px; --fs-h1: 44px/44px; --fs-hero: 58px/56px;
/* space: 4 8 12 16 24 32 48 72; gutter 20px; touch 44px; masthead 52px */
--ease: cubic-bezier(.2,.7,.2,1); --ease-out: cubic-bezier(.16,1,.3,1);
```

The plate colours, the paper tooth, kickers, small capitals, drop caps, the
menu card, stamp, colophon, sheets and Contents styles follow D2's stylesheet;
implementers read the prototype for them.

### Performance and React practice

Following the react-best-practices skill where it applies to a client-only
Vite app:

- No request waterfalls: a page starts all its calls at once (`loadAll`); the
  AI-key check on the recipe index and the counts in Contents never block a
  page.
- Route-level code splitting with lazy routes for the rarely used, heavier
  pages (Import, Data source, Add from data source, Tags), the brief and The
  Menu in the main bundle.
- Shared catalogues load once and are shared through the stores (request
  de-duplication without adding SWR or TanStack Query).
- Derived values are computed during render, not mirrored into state;
  expensive derived lists (filtered indexes, live recipe totals) are memoised
  only where profiling shows a need; state is read where it is used.
- Passive touch listeners for swipes; one global keydown listener in the
  shell.

### UI quality bar

The frontend-design and web-design-guidelines skills apply as review bars:
semantic HTML first (buttons, links, lists, tables, headings in order), every
input labelled, errors tied to inputs with `aria-describedby` and announced,
`aria-live` for counts and previews, focus visible and returned after
overlays, no `outline: none` without a replacement, `prefers-reduced-motion`
respected, `color-scheme` set per edition, tabular figures in tables, text
that wraps for longer translations, touch targets of 44 px, no horizontal
scroll at 320 px.

## Testing Decisions

### What makes a good test

A good test drives the app the way the owner does and checks what the owner
sees: it renders a page through the router at a URL, answers the server calls
with a fake server, clicks and types by accessible names and roles, and
asserts on visible text, accessible state (pressed, disabled, expanded,
invalid) and the calls sent. It does not reach into component state, CSS
classes or hook internals, so a refactor that keeps the behaviour keeps the
tests green.

### Seams

1. **The app at a URL with a fake server** (the main seam). The existing
   harness that stubs `fetch` with a table of "METHOD /path" answers and
   records the calls is reused as it is; the app-mounting helper is rewritten
   to render the React app with a memory router, the i18n provider and a fresh
   set of stores, using React Testing Library and user-event. Every page and
   flow is tested here. Today's ~500 page and component tests are the
   behavioural checklist: each scenario is ported to this seam, with queries
   moved from Quasar classes to roles and labels.
2. **Pure modules** (existing seam): unit tests of the framework-agnostic
   modules stay as they are; the new translator, the neutral stores and the
   page registry get unit tests here too.
3. **End to end** (existing seam): the Playwright flow against the built
   container in a phone-sized browser stays the one e2e test and is ported to
   the React app's accessible names in the swap ticket.

Visual checks are not a test seam: each UI ticket is checked by screenshots
(below), not by pixel assertions in CI.

### Modules tested

- Translator: every message in the English file renders with sample values;
  plural choice for two and three forms; named and count calls.
- Stores: the running solve (start, cancel by id, busy, failures, clash kept
  until dismissed, reset), unit catalogue and preferences (load once, retry,
  generation reset, serialised saves), plan-setup saves (order, latest state,
  revert on failure).
- Every page through the app seam, including the shell (Contents order,
  counts, current page, Log out, session redirects, 401 handling, swipe and
  turn links), sheets (focus trap, Escape, focus return), and the theme
  choice.
- Kept as they are: formatting, dates, goals, clash, lists, numbers, totals,
  misses, colours, line units, import review, and the pure draft rules.

### Prior art

- The fake-server app tests of the Plan, Results, Recipe, Ingredients,
  Attributes, Tags, Data source, Import, Settings and Login pages, and the main
  layout's menu tests.
- The pure tests of the goal, recipe and schedule draft rules, the solve,
  preferences and units stores.
- The catalogue e2e flow and its Playwright configuration.
- The time zone fixed for tests (ahead of UTC) and the `jsdom` polyfills in the
  test setup; a `dialog` polyfill is added there if jsdom lacks modal dialogs.

### Visual verification

Each finished piece of UI is screenshotted with Playwright (Chromium) at
390 × 844 (phone) and 1280 × 800 (desktop), in the paper and evening editions,
against the dev server with the real backend and sample data, and compared by
eye with the same view of the D2 prototype opened from disk. Reduced motion is
checked for the composing view, sheets and page turns. The screenshots go
with the ticket's notes, not into the repository.

## Out of Scope

- Any change to the backend, the database, the API contract or the generated
  types. New fields D2 hints at (recipe cooking time, recipe photos, notes on
  filters like "Mon–Thu dinners", a recipe id on plan results) are not added.
- D2's per-recipe "not this week" marker in the index: the server counts usable
  recipes but does not say which, and tag groups make a client guess wrong.
- D2's "Use for today" on an unsaved plan (which saved it first): today's rule
  stays, Use for today is for saved plans covering today.
- The Swedish message file and a language picker before a second language
  exists; locale-aware date formatting (the date helpers stay English).
- Offline use, a service worker and caching.
- Editing the unit catalogue (D2's Settings hints at it; the catalogue is
  server data and not editable today).
- Food photos; the drawn plates replace them.
- Prototypes A and C, and any change to the prototypes themselves.
- Pixel-diff visual regression tests in CI.

## Further Notes

- The prototype is a design reference, not code to copy: it builds HTML from
  strings and has a "Prototype only" status switch and invented "musings" in
  the solving view, none of which ship.
- D2 shows saved plans labelled "Week n"; plans have no label, so the archive
  shows the ISO week as an ornament with the date range as the title.
- The frontend-design skill lists a cream background with a serif and a
  terracotta accent as a common generated look. D2 was chosen by the owner
  after comparing three directions, so the tokens are kept; the distinctness
  comes from D2's editorial devices (folios, running heads, the stamp, plates,
  the red pencil), which must not be dropped for convenience.
- Earlier design notes refer to wireframe codes (A1 for the Plan page, A5 for
  the clash card, R1 for results, C2 and C4 for the recipe and ingredient
  editors, S1 and S2 for settings and data sources); the React modules keep
  those references in their comments where they help.

### Assumptions to confirm

1. **Test seams** (chosen without the owner): (a) the whole app rendered at a
   URL with the existing fake-server harness as the one main seam, because it
   is the highest seam, already exists and keeps tests independent of
   component structure, which is exactly what a rewrite changes; (b) the
   existing pure-module unit tests, because those modules are kept; (c) the
   existing single e2e flow, ported once at the swap rather than duplicated
   for both apps. Component-level tests of primitives are only added where a
   primitive has behaviour the app seam can't reach cheaply (the combobox,
   the sheet's focus trap).
2. **Side-by-side migration** with a final swap ticket, rather than Vue removed
   up front, so the e2e and the deployable app stay green throughout.
3. **React Router 7 (data mode)** rather than TanStack Router, and **no data
   fetching library** (the app's own load hook and shared stores) rather than
   TanStack Query or SWR.
4. **In-house translator** reading the vue-i18n message format, rather than
   `@intlify/core-base` (vue-i18n's framework-neutral core, an alternative with
   identical semantics) or i18next (which needs the messages rewritten).
5. **Copy**: the wordmark "The Weekly Table" and D2's editorial page names
   replace "Meal planner" and the plain page names; the filters section stays
   "Recipe filters" rather than "Pantry rules".
6. **The brief saves on every tap** (cells, time stepper) instead of a draft
   with Save as on today's Schedule page.
7. **The clash moves** from a card on the Plan page to the Editor's note on The
   Menu, with the brief's goals still marked.
8. **The Results day carousel becomes one scrolling menu** of all days; swipes
   now turn pages instead of days.
9. **Saved plans move** from a card on the Plan page to The archive page.
10. **Theme is per device** (local storage), not a server preference.
11. **The dish links to its recipe by name**, as plan results carry no
    recipe id.
12. **Desktop layout** is a wider centred page (up to about 720 px) rather than
    a multi-column desktop design.
