# UI prototypes

Three throwaway phone prototypes of the Plan page, Results page and recipe editor,
each trying a different structure. Why these three, and what else was weighed:
[UI prototype directions](../docs/superpowers/specs/2026-11-19-ui-prototype-directions.md).

| Folder | Idea |
| :-- | :-- |
| [`a-week-board/`](a-week-board/index.html) | The week is the app: a scrollable week, goal rings, results fill the week in place. |
| [`c-conversation/`](c-conversation/index.html) | Planning as a guided thread of cards, with a swipe deck for choosing recipes. |
| [`d-editorial/`](d-editorial/index.html) | A cookbook/magazine look: the week reads as a menu. |
| [`d2-editorial-refined/`](d2-editorial-refined/index.html) | D refined with the frontend-design skill: same theme, finer type, drawn plates, a status stamp, motion and accessibility fixes. D is kept unchanged for comparison. |

Open any `index.html` in a browser (no server or build step) and use the phone
view of the browser's developer tools, or open it on a phone. All data is made up,
from [`shared/data.js`](shared/data.js). Nothing is saved.
