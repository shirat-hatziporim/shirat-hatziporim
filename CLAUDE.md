# CLAUDE.md — שירת הציפורים: מערכת ההזמנות (פרונט)

> נטען אוטומטית בכל סשן על הריפו. ⚠ **הריפו ציבורי** — אין להכניס לכאן (ולשום קובץ) סודות, מפתחות,
> טוקנים או מידע על אורחים. התיעוד המלא נמצא בריפו הפרטי `shirat-hatziporim-backend`
> (תיקייה שכנה `../shirat-hatziporim-backend/.claude/skills/shirat-hatziporim-booking/SKILL.md`).

## מה יש כאן (GitHub Pages — push ל-main עולה לאוויר תוך 1–2 דקות)
- `shirat-hatziporim.html` — לוח הניהול (React 18 UMD, **JSX מקומפל מראש + shim**, בלי Babel).
- `booking.html` — טופס ההזמנה הציבורי.
- `health.html` — ~90 בדיקות תקינות. להריץ **בגלישה בסתר**.
- `Code.gs` — **עותק מראה בלבד, לא נפרס.** עורכים בריפו הפרטי ומעתיקים לכאן.

## עבודה מקומית (Windows)
- `git pull` לפני כל עבודה (וגם ב-`../shirat-hatziporim-backend` אם נוגעים בבקאנד).
- תצוגה מקדימה: `npx serve .` ולפתוח את הקובץ. הקריאות לשרת הן JSONP ל-Apps Script החי.
- לפני push: לחלץ את תוכן ה-`<script>` ולהריץ `node --check` — שגיאת תחביר = מסך לבן ללקוחות.

## אסור לשבור
- **אין Babel, אין `type="text/babel"`, אין `import ... from "react/jsx-runtime"`** בתוך `<script>` — מסך לבן.
- React נעול ל-`18.3.1` עם `integrity` (SRI). שדרוג = לחשב hash מחדש, אחרת מסך לבן.
- `booking.html` קורא **רק** `getAvailability` — לעולם לא `action=get`.
- מפתח הניהול נשמר רק ב-localStorage של הדפדפן (`shirat_admin_key`). לא בקוד.
- `sendConfirmationEmail` חייב `window.SCRIPT_URL` (script נפרד).
- `SCRIPT_URL` מופיע ב-3 קבצי HTML + ב-workflow של הבקאנד — שינוי בכולם.
- `summerRange`/`summerMult` מוגדרים פעמיים (ניהול + booking) — חייבים להישאר זהים.
- "יתרה לגביה" = `totalDue` עם `Math.max(0, …)` לכל הזמנה, **לא** `totalRev - totalPaid`.
- קיבולת 4 נופשים (2 + עד 2 תוספת) — אחיד בכל המקומות.
- כל תיקון/פיצ'ר ⇐ בדיקה תואמת ב-health.html באותו commit. ערך שהשתנה — לחפש את הישן בכל health.html.
- לא לשנות שם ל-PDF-ים בשורש — המיילים מפנים אליהם ב-raw.githubusercontent.

## סגנון עבודה
- עברית, קצר. שינויים נקודתיים; שיפור נלווה — להציע, לא לבצע.
