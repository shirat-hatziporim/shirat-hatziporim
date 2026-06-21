# Backend — Apps Script (גיבוי)

קבצי הבקאנד של מערכת ההזמנות. **אינם** משמשים את GitHub Pages —
זהו גיבוי גרסאות בלבד. הקוד החי רץ בפרויקט Apps Script ב-Drive.

- `Code.gs` — הסקריפט המלא (router של doGet, 22 actions, טריגרים מודעי-שבת, גיבוי יומי).
- `appsscript.json` — המניפסט (אזור זמן ירושלים, V8, webapp אנונימי).

## פריסה
עריכה/שחזור: הדבקת `Code.gs` בפרויקט ה-Apps Script ב-Drive → Deploy →
**עדכון פריסה קיימת** (גרסה חדשה) כדי לשמר את ה-SCRIPT_URL. אם ה-URL השתנה —
לעדכן את `SCRIPT_URL` בשני קבצי ה-HTML (`shirat-hatziporim.html`, `booking.html`).
