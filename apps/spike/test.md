---
type: project
area: Personal
status: active
created: 2026-05-23
---

# Meal Planning

## Outcome
Plan, shop, and prep meals with dependency order preserved.

## Context
- This week only needs one meal plan.

```javascript
let a = console.log('123')
```

## Tasks
- [x] Meal prep sriracha chicken bowls #task [scheduled:: 2026-05-23] [completed:: 2026-05-24] [area:: [[Personal]]] [project:: [[Meal Planning]]]
- [x] Meal planning #task [scheduled:: 2026-05-23] [completed:: 2026-05-24] [area:: [[Personal]]] [project:: [[Meal Planning]]] ^meal-planning-20260523
  - Only 1 meal this week.
- [x] Grocery shopping #task [scheduled:: 2026-05-23] [depends:: [[Meal Planning#^meal-planning-20260523]]] [completed:: 2026-05-24] [area:: [[Personal]]] [project:: [[Meal Planning]]] ^grocery-shopping-20260523
  - Depends on meal planning.
- [x] Visit Wegmans after work sometime Tue-Thu for ground beef #task [scheduled:: 2026-05-26] [due:: 2026-05-28] [completed:: 2026-05-24] [area:: [[Personal]]] [project:: [[Meal Planning]]]
- [ ] Meal prep #2 #task [depends:: [[Meal Planning#^grocery-shopping-20260523]]] [area:: [[Personal]]] [project:: [[Meal Planning]]]
  - Depends on grocery shopping.

## Log
- 2026-05-23: Created project from `weekly-planning.md` migration.
