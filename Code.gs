const SHEET_ID = "1b_40U_bCUs-MXz0K5XuLuEmD-HjYhh9TivMTEkerMdk";
const SHEET_NAME = "גיליון1";
const BLOCKED_SHEET = "חסימות";
const EXPENSES_SHEET = "הוצאות";
const GUESTS_SHEET = "אורחים";
const TEMPLATES_SHEET = "תבניות";
const FROM_EMAIL = "shirathatziporim@gmail.com";
const FROM_NAME = "צימר שירת הציפורים";
const HOST_PHONE = "050-4103353";
// קישור ישיר לטופס הביקורת של הצימר באתר הישוב (metzad.net).
// ⚠ הפרמטר הוא **מזהה הרשומה** בטבלת "צימרים" ולא שם הצימר — יציב גם אם השם משתנה.
//   האתר מקבל גם שם, אבל שם עובר קידוד ומתקלקל כשהקישור עובר בוואטסאפ.
const METZAD_REVIEW_URL = "https://metzad.net/?review=recu7R502ndpO8cas";
const PDF_URL = "https://raw.githubusercontent.com/shirat-hatziporim/shirat-hatziporim/main/%D7%97%D7%95%D7%91%D7%A8%D7%AA%20%D7%9E%D7%99%D7%93%D7%A2%20%D7%A6%D7%99%D7%9E%D7%A8%20%D7%A9%D7%99%D7%A8%D7%AA%20%D7%94%D7%A6%D7%99%D7%A4%D7%95%D7%A8%D7%99%D7%9D.pdf";

// פענוח בטוח של פרמטר URL.
// ⚠ Apps Script כבר מפענח את e.parameter, ולכן decodeURIComponent נוסף הוא no-op
//   לטקסט רגיל — אבל **זורק URIError** על כל מחרוזת שמכילה '%' בודד (למשל הערה
//   "10% הנחה"). השגיאה נבלעה ב-catch של doGet והשמירה נכשלה בשקט.
//   safeDecode שומר על ההתנהגות הקיימת ונופל חזרה לערך הגולמי במקום להתפוצץ.
function safeDecode(v) {
  if (v === undefined || v === null) return "";
  var s = String(v);
  try { return decodeURIComponent(s); } catch (err) { return s; }
}

// ════════ 🔐 אבטחה (6.10.2026) ════════════════════════════════════════════════
// ה-web app פרוס כ-ANYONE_ANONYMOUS וה-SCRIPT_URL גלוי ב-booking.html, ולכן כל action
// שאינו ברשימה הציבורית דורש מפתח ניהול (פרמטר key). המפתח נשמר ב-Script Properties
// בשם ADMIN_KEY — ⚠ לעולם לא בקוד (עותק המראה של הקובץ ציבורי!).
// PropertiesService לא דורש scope חדש ⇒ לא משבית את ה-web app.
// מצב מעבר: כל עוד ADMIN_KEY לא הוגדר — הכל פתוח כמו קודם (health.html מתריע באדום).
const PUBLIC_ACTIONS = {
  getAvailability: 1, addBooking: 1, notifyOwner: 1, getTemplates: 1,
  previewInquiry: 1, previewConfirm: 1, previewReview: 1, previewBroadcast: 1
};
// שם callback של JSONP — מזהה JS בלבד. אחרת callback=alert(1)// מזריק קוד לתשובה.
const CALLBACK_RE = /^[A-Za-z_$][\w$.]{0,63}$/;

function adminKeyConfigured() {
  return !!PropertiesService.getScriptProperties().getProperty("ADMIN_KEY");
}

function isAdmin(key) {
  const real = PropertiesService.getScriptProperties().getProperty("ADMIN_KEY");
  if (!real) return true;                       // מצב מעבר — טרם הוגדר מפתח
  if (typeof key !== "string" || key.length !== real.length) return false;
  let diff = 0;                                 // השוואה בזמן קבוע
  for (let i = 0; i < real.length; i++) diff |= real.charCodeAt(i) ^ key.charCodeAt(i);
  return diff === 0;
}

// מונה גלובלי ב-CacheService (Apps Script לא חושף IP). לא אטומי — מספיק לבלימת הצפה.
function rateLimit(bucket, max, windowSec) {
  const c = CacheService.getScriptCache();
  const k = "rl_" + bucket + "_" + Math.floor(Date.now() / 1000 / windowSec);
  const n = Number(c.get(k) || 0) + 1;
  c.put(k, String(n), windowSec + 5);
  if (n > max) throw new Error("rate limited");
}

// מונע פירוש ערך טקסט כנוסחה בגיליון (=IMAGE(...) היה מדליף את הגיליון החוצה).
function cellSafe(v) {
  return (typeof v === "string" && /^[=+\-@\t\r]/.test(v)) ? "'" + v : v;
}

// הזמנה מהטופס הציבורי — רק שדות מותרים; סטטוס/תשלום/דגלים נקבעים כאן ולא ע"י הלקוח.
const PUBLIC_BOOKING_FIELDS = ["name","phone","email","checkin","checkout","guests",
  "extraGuests","babies","babyCrib","notes","total","nights","guestExtra"];
const NUMERIC_BOOKING_FIELDS = { guests: 1, extraGuests: 1, babies: 1, total: 1, nights: 1 };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function sanitizePublicBooking(b) {
  if (!b || typeof b !== "object") throw new Error("bad booking");
  const out = {};
  PUBLIC_BOOKING_FIELDS.forEach(function(f) {
    if (b[f] === undefined || b[f] === null) return;
    out[f] = NUMERIC_BOOKING_FIELDS[f] ? (Number(b[f]) || 0) : String(b[f]).slice(0, 500);
  });
  if (!DATE_RE.test(out.checkin || "") || !DATE_RE.test(out.checkout || "") || out.checkout <= out.checkin)
    throw new Error("bad dates");
  if (!String(out.name || "").trim()) throw new Error("missing name");
  const id = Number(b.id);
  out.id = (id > 0 && id < 1e14) ? id : Date.now();
  out.status = "pending";
  out.source = "online";
  out.paid = 0;
  out.discount = 0;
  return out;
}

// זמינות לטופס הציבורי — תאריכים בלבד, בלי שום פרט אישי (קודם booking.html טען את כל ההזמנות).
function getAvailability() {
  const booked = getBookings()
    .filter(function(b) { return b.status !== "cancelled" && b.checkin && b.checkout; })
    .map(function(b) { return { checkin: String(b.checkin), checkout: String(b.checkout) }; });
  const blocked = getBlocked().map(function(x) { return x.date; });
  return { booked: booked, blocked: blocked };
}

// גרסה ציבורית של getTemplates — רק המחירון (הטופס צריך אותו). תבניות ומטא נשארים לניהול.
function getPublicTemplates() {
  const t = getTemplates();
  return t.shirat_prices !== undefined ? { shirat_prices: t.shirat_prices } : {};
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  const action = p.action;
  const callback = CALLBACK_RE.test(p.callback || "") ? p.callback : "";
  const admin = isAdmin(p.key);
  let result;
  try {
    if (!admin && !PUBLIC_ACTIONS[action]) {
      result = { error: "unauthorized" };
    } else if (action === "getAvailability") {
      result = getAvailability();
    } else if (action === "authStatus") {
      result = { ok: true, configured: adminKeyConfigured() };
    } else if (action === "get") result = getBookings();
    else if (action === "save") {
      const bookings = JSON.parse(safeDecode(e.parameter.bookings));
      if (!Array.isArray(bookings)) throw new Error("save: הנתונים אינם מערך");
      saveAll(bookings); result = { ok: true, saved: bookings.length };
    } else if (action === "getBlocked") result = getBlocked();
    else if (action === "saveBlocked") {
      const blocked = JSON.parse(safeDecode(e.parameter.blocked));
      saveBlocked(blocked); result = "ok";
    } else if (action === "getExpenses") result = getExpenses();
    else if (action === "saveExpenses") {
      const expenses = JSON.parse(safeDecode(e.parameter.expenses));
      saveExpenses(expenses); result = "ok";
    } else if (action === "getManualGuests") result = getManualGuests();
    else if (action === "saveManualGuests") {
      const guests = JSON.parse(safeDecode(e.parameter.guests));
      saveManualGuests(guests); result = "ok";
    } else if (action === "getTemplates") result = admin ? getTemplates() : getPublicTemplates();
    else if (action === "addBooking") {
      rateLimit("addBooking", 15, 3600);
      const raw = JSON.parse(safeDecode(e.parameter.booking));
      // גם מהניהול עובר חיטוי, אבל מנהל רשאי לקבוע סטטוס
      const booking = sanitizePublicBooking(raw);
      if (admin && adminKeyConfigured() && raw.status) booking.status = String(raw.status);
      addBooking(booking); result = "ok";
    } else if (action === "saveTemplate") {
      const key = safeDecode(e.parameter.key);
      const value = safeDecode(e.parameter.value);
      saveTemplate(key, value); result = "ok";
    } else if (action === "sendConfirm") {
      const b = JSON.parse(safeDecode(e.parameter.booking));
      sendConfirmEmail(b); result = "ok";
    } else if (action === "sendInquiry") {
      const email = safeDecode(e.parameter.email);
      sendInquiryEmail(email); result = "ok";
    } else if (action === "previewInquiry") {
      result = previewInquiry();
    } else if (action === "previewConfirm") {
      result = previewConfirm();
    } else if (action === "previewReview") {
      result = previewReview();
    } else if (action === "sendReminder") {
      const b = JSON.parse(safeDecode(e.parameter.booking));
      sendReminderEmail(b); result = "ok";
    } else if (action === "sendReview") {
      const b = JSON.parse(safeDecode(e.parameter.booking));
      sendReviewEmail(b); result = "ok";
    } else if (action === "saveLeads") {
      const leads = JSON.parse(safeDecode(e.parameter.leads));
      saveLeads(leads); result = "ok";
    } else if (action === "getLeads") {
      result = getLeads();
    } else if (action === "saveTrash") {
      const trash = JSON.parse(safeDecode(e.parameter.trash));
      saveTrash(trash); result = "ok";
    } else if (action === "getTrash") {
      result = getTrash();
    } else if (action === "notifyOwner") {
      rateLimit("notifyOwner", 15, 3600);
      const data = JSON.parse(safeDecode(e.parameter.data));
      notifyOwner(data); result = "ok";
    } else if (action === "upsertBooking") {
      const b = JSON.parse(safeDecode(e.parameter.booking));
      result = upsertBooking(b);
    } else if (action === "deleteBooking") {
      result = deleteBookingById(safeDecode(e.parameter.id));
    } else if (action === "chunk") {
      const cache = CacheService.getScriptCache();
      const idx = String(e.parameter.index);
      cache.put("chunk_" + idx, safeDecode(e.parameter.data), CHUNK_TTL);
      cache.put("chunk_total", String(e.parameter.total), CHUNK_TTL);
      result = { ok: true, index: Number(idx) };
    } else if (action === "commitChunks") {
      result = commitChunks(Number(e.parameter.total || 0));
    } else if (action === "getOptOuts") {
      result = getOptOuts();
    } else if (action === "saveOptOuts") {
      saveOptOuts(JSON.parse(safeDecode(e.parameter.optouts)));
      result = "ok";
    } else if (action === "getBroadcastHistory") {
      result = getBroadcastHistory();
    } else if (action === "broadcastStatus") {
      result = broadcastStatus(safeDecode(e.parameter.campaign));
    } else if (action === "previewBroadcast") {
      // HTML של מייל התפוצה בלי לשלוח ובלי Drive — לבדיקת רגרסיה ב-health.html
      result = { html: buildBroadcastHtml("שנה טובה מצימר שירת הציפורים!\nשורה שנייה <b>לא מודגשת</b>", "image/jpeg", "בדיקה.jpg") };
    } else result = "ok";
  } catch(err) {
    Logger.log((action || "?") + ": " + err);
    // פרטי שגיאה רק למנהל — לציבור הודעה כללית (לא לחשוף מבנה פנימי)
    result = (admin && adminKeyConfigured()) || !PUBLIC_ACTIONS[action] ? { error: err.toString() } : { error: "server error" };
  }

  const json = JSON.stringify(result);
  if (callback) return ContentService.createTextOutput(callback+"("+json+");").setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

// ════════ מייל עם קובץ לכל המתעניינים (11.9.2026) ════════════════════════════
// ⚠ למה POST ולא JSONP: JSONP היא בקשת GET, וכתובת URL מוגבלת ל-~8KB — קובץ לא נכנס בה.
//   הקובץ וההוראות עוברים ב-doPost. הלקוח שולח fetch עם גוף מחרוזת (text/plain) — "בקשה פשוטה"
//   שלא מפעילה preflight של CORS. ⚠ אסור להוסיף Content-Type: application/json בצד הלקוח.
// ⚠ אין כאן שימוש בשירות הדואר MailApp בכוונה: הוא דורש scope חדש (script.send_mail), וכל scope
//   חדש משבית את ה-web app כולו עד אישור ידני בעורך. GmailApp / DriveApp / CacheService / LockService
//   כבר מאושרים בפרויקט.
// ⭐ אידמפוטנטי לפי קמפיין: רשימת מי שכבר קיבל נשמרת ב-CacheService (6 שעות), ולכן ניסיון חוזר
//   של אותה מנה לא שולח פעמיים — גם אם התשובה הקודמת לא הגיעה ללקוח.
const BROADCAST_FOLDER = "קבצים למתעניינים - שירת הציפורים";
const BROADCAST_TTL = 21600;                 // 6 שעות — המקסימום של CacheService
const BROADCAST_MAX_BYTES = 10 * 1024 * 1024;
const BROADCAST_MAX_BATCH = 20;
const BOOKING_PAGE_URL = "https://shirat-hatziporim.github.io/shirat-hatziporim/booking.html";
// ⭐ יומן שידורים קבוע (12.9.2026) — מי קיבל איזה קובץ. הזיכרון של CacheService חי 6 שעות בלבד,
//   ולכן שליחה מלשונית האורחים יום אחרי שליחה למתעניינים הייתה שולחת שוב למי שחופף.
//   היומן יושב בגיליון ולכן שורד גם בין מכשירים וגם בין ימים. המפתח הוא הקובץ (שם|גודל),
//   ולא הנושא/הטקסט — אותה מודעה שנשלחת משתי לשוניות עם ניסוח שונה נחשבת אותו שידור.
const BROADCAST_LOG_SHEET = "שידורים";
// היסטוריית שליחות — שורה אחת לכל שידור (לא לכל נמען), מתעדכנת תוך כדי המנות.
const BROADCAST_HISTORY_SHEET = "היסטוריית שידורים";
const BROADCAST_HISTORY_COLS = ["מזהה", "תאריך", "קובץ", "נושא", "מקור", "נשלחו", "דולגו", "נכשלו"];
// ⭐ רשימת "ללא דיוור" (12.9.2026) — מיילים שביקשו לא לקבל דיוור קבוצתי.
// מוחזקת לפי כתובת מייל ולכן חלה גם על אורחים וגם על מתעניינים, ונאכפת בשרת ולא רק במסך.
const OPTOUT_SHEET = "ללא דיוור";

function doPost(e) {
  let result;
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (!isAdmin(body.key)) result = { error: "unauthorized" };
    else if (body.action === "broadcastUpload") result = broadcastUpload(body);
    else if (body.action === "broadcastSend") result = broadcastSend(body);
    else result = { error: "פעולה לא מוכרת: " + body.action };
  } catch (err) { result = { error: err.toString() }; }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

// מפת המיילים שכבר קיבלו את הקובץ הזה (מפתח → true)
function getOptOuts() {
  const rows = getOrCreateSheet(OPTOUT_SHEET).getDataRange().getValues();
  if (rows.length <= 1) return [];
  return rows.slice(1).filter(hasValue).map(function(r) {
    return { email: String(r[0] || "").trim().toLowerCase(), date: String(r[1] || ""), note: String(r[2] || "") };
  }).filter(function(x) { return x.email; });
}

function saveOptOuts(list) {
  const seen = {};
  const rows = [];
  (list || []).forEach(function(o) {
    const em = String(o && o.email || "").trim().toLowerCase();
    if (!em || seen[em]) return;
    seen[em] = true;
    rows.push([em, o.date || "", o.note || ""]);
  });
  writeSheet(getOrCreateSheet(OPTOUT_SHEET), ["מייל", "תאריך", "הערה"], rows);
}

function optOutMap() {
  const map = {};
  getOptOuts().forEach(function(o) { map[o.email] = true; });
  return map;
}

function broadcastLogGet(fileKey) {
  if (!fileKey) return {};
  const rows = getOrCreateSheet(BROADCAST_LOG_SHEET).getDataRange().getValues();
  const map = {};
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][1]) === fileKey) map[String(rows[i][0]).trim().toLowerCase()] = true;
  }
  return map;
}

// ⚠ כתיבה בטווח מפורש (setValues) ולא appendRow בלולאה — ראו אירוע 18.8.2026.
function broadcastLogAppend(entries) {
  if (!entries.length) return;
  const sheet = getOrCreateSheet(BROADCAST_LOG_SHEET);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 3).setValues([["מייל", "קובץ", "תאריך"]]);
    SpreadsheetApp.flush();
  }
  sheet.getRange(sheet.getLastRow() + 1, 1, entries.length, 3).setValues(entries);
  SpreadsheetApp.flush();
}

// שורה אחת לכל שידור. הקריאה מגיעה פעם לכל מנה (5 נמענים), ולכן upsert שמצטבר ולא שורה חדשה.
function broadcastHistoryUpsert(campaign, info) {
  const sheet = getOrCreateSheet(BROADCAST_HISTORY_SHEET);
  const rows = sheet.getDataRange().getValues();
  if (rows.length === 0 || String(rows[0][0]) !== BROADCAST_HISTORY_COLS[0]) {
    sheet.getRange(1, 1, 1, BROADCAST_HISTORY_COLS.length).setValues([BROADCAST_HISTORY_COLS]);
    SpreadsheetApp.flush();
  }
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === campaign) {
      sheet.getRange(i + 1, 6, 1, 3).setValues([[
        Number(rows[i][5] || 0) + info.sent,
        Number(rows[i][6] || 0) + info.skipped,
        Number(rows[i][7] || 0) + info.failed
      ]]);
      SpreadsheetApp.flush();
      return;
    }
  }
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, BROADCAST_HISTORY_COLS.length).setValues([[
    campaign, info.date, info.file, info.subject, info.source, info.sent, info.skipped, info.failed
  ]]);
  SpreadsheetApp.flush();
}

// היסטוריית השליחות, החדשות קודם. ⚠ בלי עמודת המזהה — היא פנימית ולא מעניינת בתצוגה.
function getBroadcastHistory() {
  const rows = getOrCreateSheet(BROADCAST_HISTORY_SHEET).getDataRange().getValues();
  if (rows.length <= 1) return [];
  return rows.slice(1).filter(function(r) { return r[0]; }).map(function(r) {
    return {
      date: String(r[1] || ""), file: String(r[2] || ""), subject: String(r[3] || ""),
      source: String(r[4] || ""), sent: Number(r[5] || 0), skipped: Number(r[6] || 0), failed: Number(r[7] || 0)
    };
  }).reverse().slice(0, 60);
}

function broadcastKey(campaign) {
  const c = String(campaign || "");
  if (!/^bc[0-9]{10,16}$/.test(c)) throw new Error("מזהה קמפיין לא תקין");
  return "bc_" + c;
}

// מצב קמפיין — לבדיקה מהלקוח כשתשובת POST לא נקראה. מחזיר מספר בלבד, לא את רשימת המיילים.
function broadcastStatus(campaign) {
  try {
    const raw = CacheService.getScriptCache().get(broadcastKey(campaign));
    const st = raw ? JSON.parse(raw) : null;
    return { ok: true, exists: !!st, sentCount: st ? st.sent.length : 0 };
  } catch (err) {
    return { error: err.toString() };
  }
}

function broadcastUpload(body) {
  const key = broadcastKey(body.campaign);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { error: "busy: השרת עסוק, נסו שוב" };
  try {
    const cache = CacheService.getScriptCache();
    const existing = cache.get(key);
    if (existing) {
      const prev = JSON.parse(existing);
      return { ok: true, campaign: body.campaign, fileId: prev.fileId, size: prev.size, reused: true };
    }
    if (!body.data) return { error: "לא התקבל קובץ" };
    const bytes = Utilities.base64Decode(String(body.data));
    if (bytes.length > BROADCAST_MAX_BYTES) return { error: "הקובץ גדול מדי (מקסימום 10MB)" };
    const name = String(body.name || "קובץ").slice(0, 120);
    const mimeType = String(body.mimeType || "application/octet-stream");
    const folders = DriveApp.getFoldersByName(BROADCAST_FOLDER);
    const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(BROADCAST_FOLDER);
    const file = folder.createFile(Utilities.newBlob(bytes, mimeType, name));
    const st = { fileId: file.getId(), name: name, mimeType: mimeType, size: bytes.length, sent: [] };
    cache.put(key, JSON.stringify(st), BROADCAST_TTL);
    return { ok: true, campaign: body.campaign, fileId: st.fileId, size: st.size };
  } finally {
    lock.releaseLock();
  }
}

function broadcastSend(body) {
  const key = broadcastKey(body.campaign);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { error: "busy: השרת עסוק, נסו שוב" };
  try {
    const cache = CacheService.getScriptCache();
    const raw = cache.get(key);
    if (!raw) return { error: "expired: הקובץ כבר לא שמור בשרת — יש לשלוח מחדש" };
    const st = JSON.parse(raw);
    // מייל בדיקה: נמען אחד, לא נרשם ברשימת "כבר קיבל" — כדי שאפשר יהיה לבדוק שוב ושוב,
    // ושהבדיקה לא תגרום לדילוג על הכתובת הזו בשליחה האמיתית.
    const isTest = body.test === true;
    const subject = String(body.subject || "").trim().slice(0, 150) || FROM_NAME;
    const message = String(body.message || "").slice(0, 5000);
    const emails = (Array.isArray(body.emails) ? body.emails : []).slice(0, isTest ? 1 : BROADCAST_MAX_BATCH)
      .map(function(x) { return String(x || "").trim().toLowerCase(); })
      // 🔐 מייל בדיקה — רק לכתובת העסק, לעולם לא לכתובת שרירותית
      .map(function(x) { return isTest ? FROM_EMAIL : x; });
    // שמות מקבילים ל-emails (אופציונלי) — להחלפת {שם} בכל מייל בנפרד. רשימת המתעניינים
    // לא שולחת שמות, ואז {שם} פשוט לא מוחלף — התנהגות זהה לקודם.
    const names = Array.isArray(body.names) ? body.names : [];
    // מזהה הקובץ ליומן השידורים (שם|גודל). בלי מזהה — אין דילוג ואין רישום (תאימות לאחור).
    const fileKey = String(body.fileKey || "").slice(0, 200);
    const already = (!isTest && fileKey) ? broadcastLogGet(fileKey) : {};
    // מייל בדיקה נשלח תמיד — הוא הולך אל יעקב עצמו, לא אל הנמענים
    const optedOut = isTest ? {} : optOutMap();
    const logEntries = [];
    const stamp = Utilities.formatDate(new Date(), "Asia/Jerusalem", "dd.MM.yyyy HH:mm");
    const blob = DriveApp.getFileById(st.fileId).getBlob().setName(st.name);
    const isImage = /^image\//.test(st.mimeType);
    const res = { ok: true, sent: [], skipped: [], optedOut: [], failed: [], quotaExceeded: false };
    for (let i = 0; i < emails.length; i++) {
      const to = emails[i];
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) { res.failed.push({ email: to, error: "כתובת לא תקינה" }); continue; }
      if (optedOut[to]) { res.skipped.push(to); res.optedOut.push(to); continue; }
      if (!isTest && (st.sent.indexOf(to) !== -1 || already[to])) { res.skipped.push(to); continue; }
      try {
        const name = String(names[i] || "").trim();
        const msg = personalize(message, name);
        const html = buildBroadcastHtml(msg, st.mimeType, st.name);
        const plain = (msg.trim() ? msg.trim() + "\n\n" : "") + FROM_NAME + " | " + HOST_PHONE + "\n" + BOOKING_PAGE_URL;
        const opts = { htmlBody: html, name: FROM_NAME, replyTo: FROM_EMAIL };
        if (isImage) opts.inlineImages = { broadcastimg: blob };
        else opts.attachments = [blob];
        GmailApp.sendEmail(to, personalize(subject, name), plain, opts);
        res.sent.push(to);
        if (!isTest) {
          st.sent.push(to);
          cache.put(key, JSON.stringify(st), BROADCAST_TTL);   // שמירה אחרי כל מייל — התקדמות חלקית לא הולכת לאיבוד
          already[to] = true;
          if (fileKey) logEntries.push([to, fileKey, stamp]);
        }
      } catch (err) {
        const m = err.toString();
        if (/too many times|Service invoked|quota|limit exceeded/i.test(m)) {
          res.quotaExceeded = true;
          res.failed.push({ email: to, error: "מגבלת שליחה יומית" });
          break;
        }
        res.failed.push({ email: to, error: m });
      }
    }
    // הרישום ליומן ובהיסטוריה בסוף — כתיבה אחת לגיליון במקום אחת לכל מייל
    try {
      if (!isTest && fileKey) broadcastLogAppend(logEntries);
      if (!isTest && (res.sent.length || res.skipped.length || res.failed.length)) {
        broadcastHistoryUpsert(String(body.campaign), {
          date: stamp,
          file: st.name,
          subject: subject,
          source: String(body.source || "").slice(0, 30),
          sent: res.sent.length,
          skipped: res.skipped.length,
          failed: res.failed.length
        });
      }
    } catch (err) { res.logError = err.toString(); }
    res.total = st.sent.length;
    return res;
  } finally {
    lock.releaseLock();
  }
}

// {שם} → שם הנמען. בלי שם — מסירים את הפלייסהולדר ומנקים רווח/פסיק מיותר שנשאר
// ("שלום {שם}," ⇒ "שלום,"), כדי שלא יישלח מייל עם סוגריים מסולסלים.
function personalize(text, name) {
  const t = String(text || "");
  if (!/\{שם\}/.test(t)) return t;
  const n = String(name || "").trim();
  if (n) return t.replace(/\{שם\}/g, n);
  return t.replace(/ *\{שם\}/g, "").replace(/^([^\S\n]*)([,،] *)/gm, "$1");
}

function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// גוף מייל התפוצה. תמונה מוטמעת בראש המייל (cid:broadcastimg) — המודעה עצמה היא הכותרת.
// קובץ שאינו תמונה (PDF) מצורף, ובראש המייל מופיע הלוגו הטקסטואלי הרגיל.
function buildBroadcastHtml(message, mimeType, name) {
  const isImage = /^image\//.test(String(mimeType || ""));
  const text = String(message || "").trim();
  const paras = text ? escHtml(text).split(/\n{2,}/).map(function(p) {
    return "<p style='font-size:15px;color:#333;margin:0 0 14px;line-height:1.8;font-family:Arial,sans-serif;'>" + p.replace(/\n/g, "<br>") + "</p>";
  }).join("") : "";
  const top = isImage
    ? "<tr><td style='padding:0;line-height:0;'><img src='cid:broadcastimg' alt='צימר שירת הציפורים' width='600' style='display:block;width:100%;max-width:600px;height:auto;border:0;'></td></tr>"
    : hdr("&#x1F426; עדכון מצימר שירת הציפורים");
  const attach = isImage ? "" : bx("<p style='margin:0;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F4CE; מצורף קובץ: <strong>" + escHtml(name || "") + "</strong></p>", "#c8860a");
  const body = "<tr><td style='padding:24px 24px 28px;font-family:Arial,sans-serif;'>"
    + paras + attach
    + "<p style='margin:8px 0 18px;text-align:center;'><a href='" + BOOKING_PAGE_URL + "' style='display:inline-block;background:#2d5a27;color:#fff;text-decoration:none;padding:12px 26px;border-radius:6px;font-size:15px;font-weight:700;font-family:Arial,sans-serif;'>לשליחת בקשת הזמנה</a></p>"
    + "<p style='margin:0;font-size:14px;color:#666;text-align:center;font-family:Arial,sans-serif;'>לפרטים והזמנות: <strong>" + HOST_PHONE + "</strong></p>"
    + "</td></tr>";
  // שורת ההסרה — בתחתית המייל, מתחת לפוטר ובאותו רקע (בקשת יעקב 11.9.2026).
  // ⚠ ה-media query של wrap() כופה p{font-size:13px!important} במובייל, ולכן הגודל כאן חייב
  //   !important inline. text-size-adjust מצמצם את ההגדלה האוטומטית של Gmail באנדרואיד.
  const optout = "<table width='100%' cellpadding='0' cellspacing='0' style='background:#f5f2ec;'><tr><td style='padding:0 32px 18px;text-align:center;'>"
    + "<p class='optout' style='margin:0;font-size:11px!important;line-height:1.5!important;color:#aaa;text-align:center;font-family:Arial,sans-serif;-webkit-text-size-adjust:100%;text-size-adjust:100%;'>לא מעוניינים לקבל מאיתנו עדכונים?<br>השיבו למייל זה ונסיר אתכם מהרשימה.</p>"
    + "</td></tr></table>";
  return wrap(top + body + ftr() + optout);
}

// ── שמירה בחלקים (CacheService) ───────────────────────────────────────────────
// TTL של החלקים. הועלה מ-300 ל-600 שניות: רצף של 6 קריאות JSONP איטיות
// (ראו "תקיעות ב-/exec") יכול לחרוג בקלות מחמש דקות ולהפקיע חלק באמצע.
const CHUNK_TTL = 600;

// סדר העמודות בלשונית ההזמנות. היה משוכפל inline ב-saveAll וב-addBooking —
// רוכז לקבוע אחד כדי ש-upsertBooking לא יוכל לסטות מהם.
const BOOKING_HEADERS = ["id","name","phone","email","checkin","checkout","guests","extraGuests","babies","babyCrib","status","notes","paid","total","nights","guestExtra","discount","deposit","depositMethod","rating","receiptIssued","source","balanceMethod","sentConfirm","sentReminder","sentReview","sentAutoReminder","sentAutoReview"];

// מחבר את החלקים שנשמרו ב-CacheService וכותב לגיליון.
// 🔴 באג שתוקן 26.8.2026 — "הזמנה נשמרה ונעלמה":
//   הגרסה הקודמת עשתה str += (cache.get("chunk_"+i) || "") ואז JSON.parse.
//   אם חלק אחד לא הגיע (timeout של 10 שניות בצד הלקוח, או פקיעת TTL) —
//   ה-JSON יצא קטוע, JSON.parse זרק, השגיאה נבלעה ב-catch של doGet,
//   והלקוח לא בדק את התשובה בכלל ⇒ "מסונכרן ✅" בזמן ששום דבר לא נכתב.
// עכשיו: אימות מפורש שכל החלקים קיימים, ושגיאה מפורשת ללקוח. לעולם לא נכתבת
// לגיליון רשימה חלקית — עדיף להיכשל ברעש מאשר להצליח בשקט.
function commitChunks(expectedTotal) {
  const cache = CacheService.getScriptCache();
  const stored = parseInt(cache.get("chunk_total") || "0", 10);
  const total = expectedTotal || stored;

  if (!total) return { error: "commitChunks: אין חלקים בזיכרון — לא נכתב דבר" };
  if (expectedTotal && stored !== expectedTotal) {
    return { error: "commitChunks: אי-התאמה במספר החלקים (לקוח " + expectedTotal + " / זיכרון " + stored + ") — לא נכתב דבר" };
  }

  const keys = [];
  for (let i = 0; i < total; i++) keys.push("chunk_" + i);
  const map = cache.getAll(keys) || {};

  const missing = [];
  let str = "";
  for (let i = 0; i < total; i++) {
    const part = map["chunk_" + i];
    if (part === undefined || part === null) { missing.push(i); continue; }
    str += part;
  }
  if (missing.length) {
    return { error: "commitChunks: חסרים חלקים " + missing.join(",") + " מתוך " + total + " — לא נכתב דבר" };
  }

  let parsed;
  try { parsed = JSON.parse(str); }
  catch (err) { return { error: "commitChunks: JSON לא תקין (" + str.length + " תווים) — לא נכתב דבר" }; }
  if (!Array.isArray(parsed)) return { error: "commitChunks: הנתונים אינם מערך — לא נכתב דבר" };

  saveAll(parsed);

  // ניקוי החלקים כדי שלא יישארו שאריות מנסיון קודם.
  for (let i = 0; i < total; i++) cache.remove("chunk_" + i);
  cache.remove("chunk_total");

  return { ok: true, saved: parsed.length };
}

// ── כתיבה נקודתית של הזמנה בודדת ─────────────────────────────────────────────
// ⭐ נוסף 26.8.2026. עד אז **כל** עריכה שלחה מחדש את כל הגיליון: ~10KB של JSON
//   שהתפצל ל-6+ קריאות JSONP. אחרי encodeURIComponent (כל " : , { } הופך ל-3
//   תווים, עברית ל-6) ה-URL של חלק בודד הגיע ל-6,000–10,000 תווים — מעל התקרה
//   של Google, שמחזירה 414 והדפדפן מדווח "jsonp error". זו הייתה הסיבה
//   לכישלון השמירה של 26.8.2026.
// upsertBooking שולח **הזמנה אחת** — URL קצר, קריאה אחת, ובלי מסלול chunk בכלל.
function upsertBooking(b) {
  if (!b || b.id === undefined || b.id === null || b.id === "") {
    return { error: "upsertBooking: חסר id — לא נכתב דבר" };
  }
  const lock = LockService.getScriptLock();
  try { lock.waitLock(20000); }
  catch (err) { return { error: "upsertBooking: הגיליון תפוס — נסה שוב" }; }
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    const headers = BOOKING_HEADERS;
    const last = sheet.getLastRow();
    if (last === 0) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

    // איתור השורה לפי id (עמודה A בלבד — קריאה זולה).
    let rowIdx = -1;
    if (last > 1) {
      const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
      for (let i = 0; i < ids.length; i++) {
        if (String(ids[i][0]) === String(b.id)) { rowIdx = i + 2; break; }
      }
    }
    const row = headers.map(function(h) {
      if (h === "phone" && b[h]) return cellSafe(String(b[h]));
      return b[h] !== undefined && b[h] !== null ? cellSafe(b[h]) : "";
    });
    const target = rowIdx > 0 ? rowIdx : Math.max(sheet.getLastRow(), 1) + 1;
    sheet.getRange(target, 1, 1, headers.length).setValues([row]);
    SpreadsheetApp.flush();
    return { ok: true, id: b.id, row: target, created: rowIdx < 0 };
  } catch (err) {
    return { error: "upsertBooking: " + err.toString() };
  } finally {
    lock.releaseLock();
  }
}

// מחיקת הזמנה בודדת לפי id (מוחקת את השורה עצמה, לא מרוקנת אותה).
function deleteBookingById(id) {
  if (id === undefined || id === null || id === "") {
    return { error: "deleteBooking: חסר id" };
  }
  const lock = LockService.getScriptLock();
  try { lock.waitLock(20000); }
  catch (err) { return { error: "deleteBooking: הגיליון תפוס — נסה שוב" }; }
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    const last = sheet.getLastRow();
    if (last <= 1) return { ok: true, deleted: 0 };
    const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(id)) {
        sheet.deleteRow(i + 2);
        SpreadsheetApp.flush();
        return { ok: true, deleted: 1, id: id };
      }
    }
    return { ok: true, deleted: 0, id: id };
  } catch (err) {
    return { error: "deleteBooking: " + err.toString() };
  } finally {
    lock.releaseLock();
  }
}

function hdr(subtitle) {
  return "<table width='100%' cellpadding='0' cellspacing='0' style='background:#f0ece3;'><tr><td style='padding:28px 32px;text-align:center;'>"
    + "<h1 style='color:#3a3a3a;margin:0;font-size:22px;font-weight:700;font-family:Arial,sans-serif;'>צימר שירת הציפורים</h1>"
    + "<p style='color:#7a7a7a;margin:6px 0 0;font-size:13px;font-family:Arial,sans-serif;'>" + subtitle + "</p>"
    + "</td></tr></table>";
}

function ftr() {
  return "<table width='100%' cellpadding='0' cellspacing='0' style='background:#f5f2ec;border-top:1px solid #e0dbd0;'><tr><td style='padding:18px 32px;text-align:center;'>"
    + "<p style='font-size:13px;color:#888;margin:0;font-family:Arial,sans-serif;'>צימר שירת הציפורים</p>"
    + "<p style='font-size:12px;color:#aaa;margin:4px 0 0;font-family:Arial,sans-serif;'>" + FROM_EMAIL + " | " + HOST_PHONE + "</p>"
    + "</td></tr></table>";
}

function wrap(content) {
  return "<!DOCTYPE html><html dir='rtl' lang='he'><head><meta charset='UTF-8'>"
    + "<meta name='viewport' content='width=device-width,initial-scale=1'>"
    + "<style>@media only screen and (max-width:620px){"
    + "table[class=outer]{width:100%!important;}"
    + "td{padding-left:12px!important;padding-right:12px!important;}"
    + "h1{font-size:18px!important;}"
    + "p{font-size:13px!important;}"
    + "}"
    + "</style>"
    + "</head>"
    + "<body style='margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;direction:rtl;'>"
    + "<table width='100%' cellpadding='0' cellspacing='0' style='background:#f5f5f5;padding:20px 0;'><tr><td align='center' style='padding:0 8px;'>"
    + "<table class='outer' width='600' cellpadding='0' cellspacing='0' style='max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e0dbd0;'>"
    + content
    + "</table></td></tr></table></body></html>";
}

function reviewBtn(url, label, star) {
  return "<p style='margin:0 0 10px;text-align:center;font-family:Arial,sans-serif;'>"
    + "<a href='" + url + "' style='display:inline-block;width:240px;background:#5a9e4f;color:#fff;text-decoration:none;padding:12px 10px;border-radius:6px;font-size:15px;font-weight:700;font-family:Arial,sans-serif;text-align:center;'>"
    + (star ? "&#x2B50; " : "") + label + "</a></p>";
}

function bx(content, color) {
  return "<table width='100%' cellpadding='0' cellspacing='0' style='background:#f9f7f3;border-radius:8px;border-right:4px solid " + color + ";margin-bottom:24px;'><tr><td style='padding:16px 20px;'>" + content + "</td></tr></table>";
}

function rw(label, value) {
  return "<p style='margin:0 0 8px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&bull; " + label + ": <strong>" + value + "</strong></p>";
}

function fd(ds) {
  if (!ds) return "";
  const d = new Date(ds);
  return d.getDate() + "." + (d.getMonth()+1) + "." + d.getFullYear();
}

// שורת תאריך במייל: לועזי + מתחתיו התאריך העברי ("יום ו׳, ה׳ חשוון תשפ״ז")
function dateRow(label, ds) {
  const h = hebDateStr(ds);
  return rw(label, fd(ds) + (h ? "<br><span style='font-weight:400;color:#8a6a3a;font-size:13px;'>" + h + "</span>" : ""));
}
// "🕯 שבת: פרשת נח" — רק אם השהייה כוללת שבת
function shabbatRow(b) {
  const s = stayShabbatLine(b.checkin, b.checkout);
  return s ? rw("&#x1F56F; שבת", s) : "";
}

// ════════ לוח עברי + פרשות שבוע (מנהג ארץ ישראל) — חישוב מקומי, ללא רשת ════════
// אין כאן קריאת רשת בכוונה: הוספת הרשאת רשת הייתה מחייבת אישור מחדש של הסקריפט.
// האלגוריתם אומת מול @hebcal/core על פני עשרות שנים (ראו health.html / יומן הסקיל).
var HEB_EPOCH = -1373427; // R.D. של א׳ תשרי שנה 1
var HEB_MONTHS = ["", "ניסן", "אייר", "סיוון", "תמוז", "אב", "אלול", "תשרי", "חשוון", "כסלו", "טבת", "שבט", "אדר", "אדר ב׳"];
var PARASHOT = ["בראשית","נח","לך לך","וירא","חיי שרה","תולדות","ויצא","וישלח","וישב","מקץ","ויגש","ויחי",
  "שמות","וארא","בא","בשלח","יתרו","משפטים","תרומה","תצוה","כי תשא","ויקהל","פקודי",
  "ויקרא","צו","שמיני","תזריע","מצורע","אחרי מות","קדושים","אמור","בהר","בחוקותי",
  "במדבר","נשא","בהעלותך","שלח","קרח","חוקת","בלק","פינחס","מטות","מסעי",
  "דברים","ואתחנן","עקב","ראה","שופטים","כי תצא","כי תבוא","נצבים","וילך","האזינו","וזאת הברכה"];
function hebLeap(y) { return ((7 * y + 1) % 19) < 7; }
function hebElapsed(y) {
  var m = Math.floor((235 * y - 234) / 19);
  var parts = 12084 + 13753 * m;
  var d = m * 29 + Math.floor(parts / 25920);
  if ((3 * (d + 1)) % 7 < 3) d++;
  return d;
}
var _hebNY = {};
function hebNewYear(y) {
  if (_hebNY[y] !== undefined) return _hebNY[y];
  var a = hebElapsed(y - 1), b = hebElapsed(y), c = hebElapsed(y + 1);
  var delay = (c - b === 356) ? 2 : (b - a === 382) ? 1 : 0;
  return _hebNY[y] = HEB_EPOCH + b + delay;
}
function hebYearDays(y) { return hebNewYear(y + 1) - hebNewYear(y); }
function hebMonthDays(y, m) {
  if (m === 2 || m === 4 || m === 6 || m === 10 || m === 13) return 29;
  if (m === 12) return hebLeap(y) ? 30 : 29;
  if (m === 8) return hebYearDays(y) % 10 === 5 ? 30 : 29;
  if (m === 9) return hebYearDays(y) % 10 === 3 ? 29 : 30;
  return 30;
}
function hebToRd(y, m, d) {
  var rd = hebNewYear(y) + d - 1, i;
  var last = hebLeap(y) ? 13 : 12;
  if (m < 7) {
    for (i = 7; i <= last; i++) rd += hebMonthDays(y, i);
    for (i = 1; i < m; i++) rd += hebMonthDays(y, i);
  } else {
    for (i = 7; i < m; i++) rd += hebMonthDays(y, i);
  }
  return rd;
}
function gregToRd(y, m, d) {
  var py = y - 1;
  return 365 * py + Math.floor(py / 4) - Math.floor(py / 100) + Math.floor(py / 400)
    + Math.floor((367 * m - 362) / 12) + (m <= 2 ? 0 : (((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? -1 : -2)) + d;
}
function rdToGregStr(rd) {
  var d = new Date(Date.UTC(1970, 0, 1) + (rd - 719163) * 86400000);
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
}
function dsToRd(ds) {
  var p = String(ds).slice(0, 10).split("-");
  return gregToRd(+p[0], +p[1], +p[2]);
}
function rdToHeb(rd) {
  var y = Math.floor((rd - HEB_EPOCH) / 365.2468) + 1;
  while (hebNewYear(y) > rd) y--;
  while (hebNewYear(y + 1) <= rd) y++;
  var left = rd - hebNewYear(y), last = hebLeap(y) ? 13 : 12;
  var order = [];
  for (var i = 7; i <= last; i++) order.push(i);
  for (i = 1; i <= 6; i++) order.push(i);
  for (var k = 0; k < order.length; k++) {
    var md = hebMonthDays(y, order[k]);
    if (left < md) return { y: y, m: order[k], d: left + 1 };
    left -= md;
  }
  return null;
}
function hebGematria(n) {
  var ones = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"], tens = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"], hund = ["", "ק", "ר", "ש", "ת"];
  n = n % 1000; var s = "";
  while (n >= 400) { s += "ת"; n -= 400; }
  if (n >= 100) { s += hund[Math.floor(n / 100)]; n %= 100; }
  if (n === 15) s += "טו"; else if (n === 16) s += "טז"; else s += tens[Math.floor(n / 10)] + ones[n % 10];
  return s.length === 1 ? s + "׳" : s.slice(0, -1) + "״" + s.slice(-1);
}
function hebMonthName(y, m) { return (m === 12 && hebLeap(y)) ? "אדר א׳" : HEB_MONTHS[m]; }
// "יום ו׳, ה׳ חשוון תשפ״ז"
function hebDateStr(ds) {
  if (!ds) return "";
  try {
    var rd = dsToRd(ds), h = rdToHeb(rd);
    if (!h) return "";
    var dow = ((rd % 7) + 7) % 7; // 0=ראשון
    return "יום " + ["א","ב","ג","ד","ה","ו","ש"][dow] + "׳, " + hebGematria(h.d) + " " + hebMonthName(h.y, h.m) + " " + hebGematria(h.y);
  } catch (e) { return ""; }
}
// חג שבו לא קוראים פרשת שבוע (ארץ ישראל)
function hebNoParashaDay(h) {
  if (h.m === 7) return h.d === 1 || h.d === 2 || h.d === 10 || (h.d >= 15 && h.d <= 22);
  if (h.m === 1) return h.d >= 15 && h.d <= 21;
  if (h.m === 3) return h.d === 6;
  return false;
}
function hebShabbatsIn(fromRd, toRd) { // fromRd < shabbat <= toRd, ללא חגים
  var out = [], rd = fromRd + 1;
  while (((rd % 7) + 7) % 7 !== 6) rd++;
  for (; rd <= toRd; rd += 7) if (!hebNoParashaDay(rdToHeb(rd))) out.push(rd);
  return out;
}
function hebFill(map, shabbats, from, to, combos) {
  var k = (to - from + 1) - shabbats.length;
  if (k < 0 || k > combos.length) return false;
  var join = {};
  for (var i = 0; i < k; i++) join[combos[i]] = true;
  var p = from;
  for (var s = 0; s < shabbats.length; s++) {
    if (join[p]) { map[shabbats[s]] = PARASHOT[p] + "-" + PARASHOT[p + 1]; p += 2; }
    else { map[shabbats[s]] = PARASHOT[p]; p += 1; }
  }
  return p === to + 1;
}
var _hebCycle = {};
// לוח הקריאה ממחרת שמיני עצרת של שנה Y ועד שמיני עצרת של Y+1
function hebCycle(Y) {
  if (_hebCycle[Y]) return _hebCycle[Y];
  // השנה העברית מתחילה בתשרי — ולכן ניסן/סיוון/אב שאחרי שמיני עצרת שייכים לאותה שנה Y
  var map = {}, leap = hebLeap(Y);
  var start = hebToRd(Y, 7, 22), pesach = hebToRd(Y, 1, 15), shavuot = hebToRd(Y, 3, 6);
  var av9 = hebToRd(Y, 5, 9), end = hebToRd(Y + 1, 7, 22);
  // לפני פסח: בדרך כלל צו בשנה פשוטה ומצורע במעוברת — אך לא תמיד (למשל אחרי מות), ולכן גמיש
  var aShab = hebShabbatsIn(start, pesach - 1), aCombos = leap ? [21, 26] : [21];
  var base = leap ? 27 : 24, tries = [base, base + 1, base + 2, base - 1], aEnd = base;
  for (var t = 0; t < tries.length; t++) {
    var k = (tries[t] + 1) - aShab.length;
    if (k >= 0 && k <= aCombos.length) { aEnd = tries[t]; break; }
  }
  hebFill(map, aShab, 0, aEnd, aCombos);
  // מפסח עד שבת חזון (דברים בשבת שלפני ט׳ באב או בו) — קטע אחד, כי במדבר לא תמיד צמודה לשבועות
  hebFill(map, hebShabbatsIn(pesach - 1, av9), aEnd + 1, 43, [41, 26, 28, 31, 38]);
  hebFill(map, hebShabbatsIn(av9, end), 44, 52, [50]);
  return _hebCycle[Y] = map;
}
// פרשת השבת שבתאריך ds (חייב להיות שבת), או "" בחג
function parashaOnShabbat(ds) {
  var rd = dsToRd(ds), h = rdToHeb(rd);
  if (!h) return "";
  var Y = (h.m === 7 && h.d <= 22) ? h.y - 1 : h.y;
  return hebCycle(Y)[rd] || "";
}
// השבתות שבתוך השהייה (כולל יום היציאה) — לשורת "שבת פרשת …" במיילים
function stayShabbatLine(checkin, checkout) {
  if (!checkin || !checkout) return "";
  var a = dsToRd(checkin), b = dsToRd(checkout), out = [];
  for (var rd = a; rd <= b && out.length < 4; rd++) {
    if (((rd % 7) + 7) % 7 !== 6) continue;
    var p = parashaOnShabbat(rdToGregStr(rd));
    out.push(p ? "פרשת " + p : "חג");
  }
  return out.join(" · ");
}


function sendMail(to, subject, htmlBody) {
  GmailApp.sendEmail(to, subject, "", {
    htmlBody: htmlBody,
    name: FROM_NAME,
    replyTo: FROM_EMAIL
  });
}

function sendConfirmEmail(b) {
  if (!b.email) return;
  const templates = getTemplates();
  if (templates.confirm && templates.confirm.trim()) {
    const text = templates.confirm
      .replace(/{שם}/g, b.name||"")
      .replace(/{כניסה}/g, fd(b.checkin))
      .replace(/{יציאה}/g, fd(b.checkout))
      .replace(/{כניסה_עברי}/g, hebDateStr(b.checkin))
      .replace(/{יציאה_עברי}/g, hebDateStr(b.checkout))
      .replace(/{פרשה}/g, stayShabbatLine(b.checkin, b.checkout))
      .replace(/{לילות}/g, b.nights||"")
      .replace(/{סכום}/g, Number(b.total||0).toLocaleString())
      .replace(/{סוג}/g, b.roomLabel||"");
    GmailApp.sendEmail(b.email, "אישור הזמנה - שירת הציפורים", text, {
      name: FROM_NAME, replyTo: FROM_EMAIL
    });
    return;
  }
  sendMail(b.email, "אישור הזמנה - שירת הציפורים", buildConfirmHtml(b));
}

// בונה את ה-HTML המלא של מייל האישור (מסלול מעוצב, ללא תבנית מותאמת)
function buildConfirmHtml(b) {
  return wrap(hdr("&#x2705; אישור הזמנה") + buildConfirmBody(b) + ftr());
}

// מחזיר את ה-HTML של מייל האישור בלי לשלוח — לבדיקת רגרסיה ב-health.html (שעות 15:00/11:00)
function previewReview() {
  return { html: buildReviewHtml({ name: "בדיקה", email: "", checkin: "2026-07-15", checkout: "2026-07-17" }) };
}

function previewConfirm() {
  // שישי→שבת 16–17.10.2026: ה׳–ו׳ חשוון תשפ״ז, שבת פרשת נח — לבדיקת התאריך העברי והפרשה
  return { html: buildConfirmHtml({ name: "בדיקה", checkin: "2026-10-16", checkout: "2026-10-17", nights: 1, guests: 2, extraGuests: 0, babies: 0, total: 1200 }) };
}

// גוף מייל האישור (מסלול ה-HTML המעוצב)
function buildConfirmBody(b) {
  const body = "<tr><td style='padding:28px 24px;font-family:Arial,sans-serif;'>"
    + "<p style='font-size:16px;color:#222;margin:0 0 8px;line-height:1.8;'>שלום וברכה <strong>" + escHtml(b.name || "") + "</strong>,</p>"
    + "<p style='font-size:15px;color:#444;margin:0 0 24px;line-height:1.8;'>שמחים לאשר את הזמנתכם בצימר שירת הציפורים!</p>"
    + "<p style='font-size:15px;color:#222;font-weight:700;margin:0 0 12px;'>&#x1F4C5; פרטי ההזמנה:</p>"
    + bx(
        dateRow("&#x1F4C5; תאריך הגעה", b.checkin)
        + dateRow("&#x1F4C5; תאריך יציאה", b.checkout)
        + shabbatRow(b)
        + rw("&#x1F319; מספר לילות", b.nights||"")
        + rw("&#x1F46A; מספר אורחים", ((b.guests||2)+(b.extraGuests||0)) + " נפשות")
        + (b.babies>0 ? rw("&#x1F476; תינוקות", b.babies) : "")
        + "<p style='margin:0;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&bull; עלות: <strong style='color:#5a9e4f;'>&#8362;" + Number(b.total||0).toLocaleString() + "</strong></p>",
        "#5a9e4f"
      )
    + "<p style='font-size:15px;color:#222;font-weight:700;margin:0 0 10px;'>&#x1F4B3; נא להעביר מקדמה בסך 500 ש\"ח:</p>"
    + bx(
        "<p style='margin:0 0 8px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F4B8; בנק לאומי, סניף 904, חשבון 10765165 על שם יעקב גרזון</p>"
        + "<p style='margin:0 0 10px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F4F1; ביט / פייבוקס: <strong>" + HOST_PHONE + "</strong></p>"
        + "<p style='margin:0;font-size:14px;color:#8b6000;font-weight:700;font-family:Arial,sans-serif;'>&#x1F449; נא לשלוח אסמכתא לאחר התשלום</p>",
        "#c8860a"
      )
    + bx(
        "<p style='margin:0 0 10px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F4C4; מצורפת חוברת מידע על הצימר</p>"
        + "<a href='" + PDF_URL + "' style='display:inline-block;background:#5a9e4f;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:700;font-family:Arial,sans-serif;'>לחץ לפתיחת חוברת המידע</a>",
        "#5a9e4f"
      )
    + bx(
        "<p style='margin:0 0 6px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F4CD; כתובת: <strong>נחל קדם 93, מיצד</strong></p>"
        + "<p style='margin:0 0 6px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F552; כניסה מהשעה <strong>15:00</strong> | יציאה עד השעה <strong>11:00</strong></p>"
        + "<p style='margin:0 0 6px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F319; במוצאי שבת &ndash; יציאה עד <strong>שעה וחצי לאחר צאת השבת</strong></p>"
        + "<p style='margin:0 0 6px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F68C; תחבורה: קו 364 מירושלים | קו 411 מביתר</p>"
        + "<p style='margin:0;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x2139; מידע תחבורה: <strong>*8787</strong></p>",
        "#aaa"
      )
    + "<p style='font-size:14px;color:#666;margin:0 0 4px;font-family:Arial,sans-serif;'>לכל שאלה: <strong>" + HOST_PHONE + "</strong></p>"
    + "<p style='font-size:16px;color:#5a9e4f;font-weight:700;margin:24px 0 0;text-align:center;font-family:Arial,sans-serif;'>&#x1F426; מחכים לבואכם!</p>"
    + "</td></tr>";
  return body;
}

function sendReminderEmail(b) {
  if (!b.email) return;
  const templates = getTemplates();
  if (templates.reminder && templates.reminder.trim()) {
    const balance = Math.max(0, (b.total||0) - (b.paid||0));
    const text = templates.reminder
      .replace(/{שם}/g, b.name||"")
      .replace(/{כניסה}/g, fd(b.checkin))
      .replace(/{יציאה}/g, fd(b.checkout))
      .replace(/{כניסה_עברי}/g, hebDateStr(b.checkin))
      .replace(/{יציאה_עברי}/g, hebDateStr(b.checkout))
      .replace(/{פרשה}/g, stayShabbatLine(b.checkin, b.checkout))
      .replace(/{לילות}/g, b.nights||"")
      .replace(/{יתרה}/g, balance > 0 ? Number(balance).toLocaleString() + ' ש"ח' : 'שולם במלואו');
    GmailApp.sendEmail(b.email, "מחר אתם מגיעים! תזכורת - שירת הציפורים", text, {
      name: FROM_NAME, replyTo: FROM_EMAIL
    });
    return;
  }
  const body = "<tr><td style='padding:28px 24px;font-family:Arial,sans-serif;'>"
    + "<p style='font-size:16px;color:#222;margin:0 0 8px;line-height:1.8;'>שלום וברכה <strong>" + escHtml(b.name || "") + "</strong>,</p>"
    + "<p style='font-size:15px;color:#444;margin:0 0 24px;line-height:1.8;'>מזכירים לכם שמחר אתם מגיעים אלינו! מחכים לכם ומתרגשים לארח אתכם.</p>"
    + "<p style='font-size:15px;color:#222;font-weight:700;margin:0 0 12px;'>&#x1F4C5; פרטי ההזמנה:</p>"
    + bx(
        dateRow("&#x1F4C5; תאריך הגעה", b.checkin)
        + dateRow("&#x1F4C5; תאריך יציאה", b.checkout)
        + shabbatRow(b)
        + "<p style='margin:0;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&bull; מספר לילות: <strong>" + (b.nights||"") + "</strong></p>",
        "#5a9e4f"
      )
    + bx(
        "<p style='margin:0 0 6px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F4CD; כתובת: <strong>נחל קדם 93, מיצד</strong></p>"
        + "<p style='margin:0 0 6px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F552; כניסה החל מ: <strong>15:00</strong></p>"
        + "<p style='margin:0 0 6px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F68C; תחבורה: קו 364 מירושלים | קו 411 מביתר</p>"
        + "<p style='margin:0;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x2139; מידע תחבורה: <strong>*8787</strong></p>",
        "#aaa"
      )
    + bx(
        "<p style='margin:0 0 8px;font-size:14px;color:#2d5a27;font-family:Arial,sans-serif;'>&#x1F4C4; חוברת המידע עם כל הפרטים לשהייה:</p>"
        + "<a href='" + PDF_URL + "' style='display:inline-block;background:#5a9e4f;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:700;font-family:Arial,sans-serif;'>חוברת מידע</a>",
        "#5a9e4f"
      )
    + "<p style='font-size:14px;color:#666;margin:0 0 4px;font-family:Arial,sans-serif;'>לכל שאלה: <strong>" + HOST_PHONE + "</strong></p>"
    + "<p style='font-size:16px;color:#5a9e4f;font-weight:700;margin:24px 0 0;text-align:center;font-family:Arial,sans-serif;'>&#x1F426; מחכים לכם!</p>"
    + "</td></tr>";
  sendMail(b.email, "מחר אתם מגיעים! תזכורת - שירת הציפורים", wrap(hdr("&#x23F0; תזכורת להגעה מחר") + body + ftr()));
}

function sendReviewEmail(b) {
  if (!b.email) return;
  const templates = getTemplates();
  if (templates.review && templates.review.trim()) {
    const text = templates.review
      .replace(/{שם}/g, b.name||"")
      .replace(/{כניסה}/g, fd(b.checkin))
      .replace(/{יציאה}/g, fd(b.checkout))
      .replace(/{המלצה}/g, METZAD_REVIEW_URL);
    GmailApp.sendEmail(b.email, "תודה שהתארחתם - שירת הציפורים", text, {
      name: FROM_NAME, replyTo: FROM_EMAIL
    });
    return;
  }
  sendMail(b.email, "תודה שהתארחתם - שירת הציפורים", buildReviewHtml(b));
}

// גוף מייל הביקורת (מסלול ה-HTML המעוצב). מופרד מ-sendReviewEmail כדי ש-previewReview
// יוכל להחזיר בדיוק את אותו HTML בלי לשלוח — אותו זוג כמו buildConfirmHtml/previewConfirm.
function buildReviewHtml(b) {
  const body = "<tr><td style='padding:28px 24px;font-family:Arial,sans-serif;'>"
    + "<p style='font-size:16px;color:#222;margin:0 0 8px;line-height:1.8;'>שלום וברכה <strong>" + escHtml(b.name || "") + "</strong>,</p>"
    + "<p style='font-size:15px;color:#444;margin:0 0 16px;line-height:1.8;'>רצינו להודות לכם מקרב לב על שבחרתם להתארח אצלנו בצימר &quot;שירת הציפורים&quot;.</p>"
    + "<p style='font-size:15px;color:#444;margin:0 0 24px;line-height:1.8;'>שמחנו מאוד לארח אתכם, ומקווים שנהנתם מהשהות, מהאווירה הנעימה ומהשקט הייחודי של המקום.</p>"
    + bx(
        "<p style='margin:0 0 14px;font-size:14px;color:#444;font-family:Arial,sans-serif;line-height:1.8;'>נשמח מאוד אם תמליצו עלינו לחברים ומכרים, וכן אם תוכלו להקדיש רגע קצר לשתף את חוויתכם ולהשאיר המלצה &ndash; הדבר מסייע לנו רבות בהמשך הדרך.</p>"
        + "<p style='margin:0 0 14px;font-size:14px;color:#444;font-family:Arial,sans-serif;line-height:1.8;'>ככל שההמלצה מופיעה ביותר מקומות כך היא מסייעת לנו יותר, ונשמח על כל אחד מהם:</p>"
        + reviewBtn("https://mamimush.co.il/rooms/%D7%A6%D7%99%D7%9E%D7%A8%D7%99%D7%9D-308/", "המלצה באתר מאמימוש")
        + reviewBtn("https://dira4shabat.co.il/listing/%D7%A6%D7%99%D7%9E%D7%A8-%D7%A9%D7%99%D7%A8%D7%AA-%D7%94%D7%A6%D7%99%D7%A4%D7%95%D7%A8%D7%99%D7%9D-%D7%9E%D7%99%D7%A6%D7%93/", "המלצה באתר דירה לשבת")
        + reviewBtn("https://charedi.net/tzimar/25569/", "המלצה באתר הלוח החרדי")
        + reviewBtn(METZAD_REVIEW_URL, "המלצה באתר הישוב מיצד", true)
        + "<p style='margin:14px 0 0;font-size:13px;color:#777;font-family:Arial,sans-serif;line-height:1.7;'>בשלושת אתרי הפרסום ההמלצה נכתבת בתחתית המודעה. באתר מיצד נפתח טופס קצר עם דירוג בכוכבים.</p>",
        "#5a9e4f"
      )
    + "<p style='font-size:14px;color:#666;margin:0 0 4px;font-family:Arial,sans-serif;'>לכל צורך או ביקור נוסף בעתיד &ndash; נשמח לעמוד לשירותכם: <strong>" + HOST_PHONE + "</strong></p>"
    + "<p style='font-size:15px;color:#5a9e4f;font-weight:700;margin:24px 0 0;text-align:center;font-family:Arial,sans-serif;'>&#x1F426; בברכה ובהערכה, יעקב | צימר שירת הציפורים</p>"
    + "</td></tr>";
  return wrap(hdr("&#x2B50; שמחנו לארח אתכם!") + body + ftr());
}

function buildInquiryHtml() {
  const features = "<p style='margin:0 0 7px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F6C1; חדר שינה מרווח &#8212; מיטה זוגית נוחה במיוחד, ארון גדול וג&#39;קוזי זוגי מפנק (1.20 &times; 1.80 מ&#39;)</p>"
    + "<p style='margin:0 0 7px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F6BF; חדר רחצה נוסף עם מקלחון מסאז&#39; יוקרתי</p>"
    + "<p style='margin:0 0 7px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F6CB; סלון מרווח &#8212; ספה נפתחת למיטה זוגית, שולחן וכיסאות</p>"
    + "<p style='margin:0 0 7px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x2615; מטבח מאובזר &#8212; מקרר גדול, כיריים אינדוקציה, תנור, מכונת קפה ומקציף חלב, כלים וסירים בשריים וחלביים, מערכת שמע</p>"
    + "<p style='margin:0 0 7px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F9FA; מאובזר עד הפרט האחרון &#8212; לול לתינוק, מייבש שיער ומגהץ</p>"
    + "<p style='margin:0 0 7px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F333; חצר פרטית גדולה &#8212; דשא סינטטי, פינת ישיבה, ערסל, מנגל גז ותאורת אווירה</p>"
    + "<p style='margin:0 0 7px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F304; מול הצימר &#8212; מצפה לים המלח עם ספסלים וגינת משחקים לילדים</p>"
    + "<p style='margin:0 0 7px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F54D; בית כנסת הרמח&quot;ל בקרבת מקום (קבלת שבת בסגנון קרליבך)</p>"
    + "<p style='margin:0;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F46A; מתאים לזוגות ולמשפחות עד 4 נופשים</p>";

  const shabat = "<p style='margin:0 0 7px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F6B0; כיור כפול</p>"
    + "<p style='margin:0 0 7px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F372; פלטת שבת, מיחם מים ושעון שבת</p>"
    + "<p style='margin:0 0 7px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F6CF; מיטה יהודית</p>"
    + "<p style='margin:0;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F56F; אביזרי שבת &#8212; סכין וקרש לחלות, נרות שבת</p>";

  const payments = "<p style='margin:0 0 7px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F4B3; מקבלים <strong>כרטיס אשראי מילואים</strong></p>"
    + "<p style='margin:0;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F3E5; ניתן לקבל <strong>החזר מקופות החולים</strong> להבראה אחרי לידה</p>";

  const prices = "<p style='margin:0 0 6px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F319; אמצע שבוע: <strong>800 ש&#34;ח ללילה</strong></p>"
    + "<p style='margin:0 0 6px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F4C5; סוף שבוע (שישי-שבת): <strong>1,200 ש&#34;ח</strong></p>"
    + "<p style='margin:0 0 6px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F381; חבילת חמישי+שישי+שבת: <strong>1,700 ש&#34;ח</strong></p>"
    + "<p style='margin:0 0 6px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x279C; תוספת יציאה ראשון: <strong>350 ש&#34;ח</strong></p>"
    + "<p style='margin:0;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x279C; תוספת מיטות (עד 2): <strong>200 ש&#34;ח לאדם</strong></p>";

  const body = "<tr><td style='padding:28px 24px;font-family:Arial,sans-serif;'>"
    + "<p style='font-size:16px;color:#222;margin:0 0 8px;line-height:1.8;'>שלום וברכה,</p>"
    + "<p style='font-size:15px;color:#444;margin:0 0 24px;line-height:1.8;'>תודה רבה על פנייתכם. מצרף לכם פרטים על הצימר שלנו:</p>"
    + "<p style='font-size:15px;color:#222;font-weight:700;margin:0 0 12px;font-family:Arial,sans-serif;'>&#x1F3D8; מידע על הישוב:</p>"
    + bx(
        "<p style='margin:0 0 8px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F4CD; <a href='https://waze.com/ul?q=%D7%9E%D7%99%D7%A6%D7%93' style='color:#2d5a27;font-weight:700;'>מיצד, הרי יהודה</a> &#8212; כ-35 דקות מירושלים</p>"
        + "<p style='margin:0 0 8px;font-size:14px;font-weight:700;color:#2d5a27;font-family:Arial,sans-serif;'>&#x1F3D8; ישוב מיצד &#8212; ישוב חרדי עם אווירה שקטה ופסטורלית</p>"
        + "<p style='margin:0 0 6px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x26EA; בתי כנסיות ומקווה</p>"
        + "<p style='margin:0 0 6px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F6D2; סופרמרקט מורחב וחנות מאכלי שבת ופיצוחים</p>"
        + "<p style='margin:0 0 6px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F355; חנות פיצה</p>"
        + "<p style='margin:0;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F9C6; חנות פלאפל ובשרים</p>",
        "#aaa"
      )
    + "<p style='font-size:15px;color:#222;font-weight:700;margin:0 0 12px;font-family:Arial,sans-serif;'>&#x2728; מה מחכה לכם בצימר:</p>"
    + bx(features, "#5a9e4f")
    + "<p style='font-size:15px;color:#222;font-weight:700;margin:0 0 12px;font-family:Arial,sans-serif;'>&#x1F56F; מיועד לשומרי שבת:</p>"
    + bx(shabat, "#1565c0")
    + "<p style='font-size:15px;color:#222;font-weight:700;margin:0 0 12px;font-family:Arial,sans-serif;'>&#x1F4B0; מחירון לזוג:</p>"
    + bx(prices, "#c8860a")
    + "<p style='font-size:15px;color:#222;font-weight:700;margin:0 0 12px;font-family:Arial,sans-serif;'>&#x1F4B3; החזרים ותשלומים:</p>"
    + bx(payments, "#5a9e4f")
    + bx(
        "<p style='margin:0 0 12px;font-size:14px;color:#2d5a27;font-weight:700;font-family:Arial,sans-serif;line-height:1.8;'>&#x1F4AC; נשאר רק לדעת כמה אנשים אתם ולמתי תרצו להגיע - ונשריין לכם את התאריך המתאים!</p>"
        + "<a href='https://shirat-hatziporim.github.io/shirat-hatziporim/booking.html' style='display:inline-block;background:#2d5a27;color:#fff;text-decoration:none;padding:10px 22px;border-radius:6px;font-size:14px;font-weight:700;font-family:Arial,sans-serif;'>לחץ כאן לשליחת בקשת הזמנה</a>",
        "#5a9e4f"
      )
    + bx(
        "<p style='margin:0 0 7px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F4CD; כתובת: <strong>נחל קדם 93, מיצד</strong></p>"
        + "<p style='margin:0 0 7px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F552; שעת כניסה: <strong>15:00</strong> | שעת יציאה: <strong>11:00</strong></p>"
        + "<p style='margin:0 0 7px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F319; במוצאי שבת &ndash; יציאה עד <strong>שעה וחצי לאחר צאת השבת</strong></p>"
        + "<p style='margin:0 0 7px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F3DE; <a href='https://raw.githubusercontent.com/shirat-hatziporim/shirat-hatziporim/main/%D7%90%D7%98%D7%A8%D7%A7%D7%A6%D7%99%D7%95%D7%AA%20%D7%92%D7%95%D7%A9%20%D7%A2%D7%A6%D7%99%D7%95%D7%9F.pdf' style='color:#2d5a27;font-weight:700;'>קובץ אטרקציות במיצד ובסביבה - לחץ להורדה</a></p>"
        + "<p style='margin:0 0 7px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x2139; אתר: <a href='https://639885bfa3564.site123.me/' style='color:#1565c0;'>לחץ לצפייה באתר</a></p>"
        + "<p style='margin:0;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F4DE; טלפון: <strong>" + HOST_PHONE + "</strong></p>",
        "#aaa"
      )
    + "<p style='font-size:15px;color:#5a9e4f;font-weight:700;margin:0;text-align:center;font-family:Arial,sans-serif;'>&#x1F426; נשמח לארח אתכם לחוויה מיוחדת ובלתי נשכחת!</p>"
    + "</td></tr>";
  return wrap(hdr("&#x1F426; חוויית נופש רגועה, פרטית ומפנקת") + body + ftr());
}

function sendInquiryEmail(toEmail) {
  sendMail(toEmail, "מידע על צימר שירת הציפורים", buildInquiryHtml());
}

// מחזיר את ה-HTML של מייל המתעניינים בלי לשלוח — לשימוש health.html (בדיקת רגרסיה לתוספת החופש)
function previewInquiry() {
  return { html: buildInquiryHtml() };
}

function getIsraelDate() {
  const now = new Date();
  const israelStr = now.toLocaleDateString("en-US", {timeZone:"Asia/Jerusalem", weekday:"short"});
  return israelStr;
}

function isShabat() {
  return getIsraelDate() === "Sat";
}

function dailyEmailTrigger() {
  if (isShabat()) {
    Logger.log("שבת - לא שולחים הודעות");
    return;
  }

  const bookings = getBookings();
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate()+1);
  const tomorrowStr = Utilities.formatDate(tomorrow, "Asia/Jerusalem", "yyyy-MM-dd");
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate()-1);
  const yesterdayStr = Utilities.formatDate(yesterday, "Asia/Jerusalem", "yyyy-MM-dd");
  let updated = false;
  bookings.forEach(function(b) {
    if (b.status === "cancelled") return;
    if (!b.email) return;
    if (b.checkin === tomorrowStr && !b.sentAutoReminder) {
      try { sendReminderEmail(b); b.sentAutoReminder = true; updated = true; Logger.log("תזכורת: " + b.name); }
      catch(err) { Logger.log("שגיאה תזכורת: " + err); }
    }
    if (b.checkout === yesterdayStr && !b.sentAutoReview) {
      try { sendReviewEmail(b); b.sentAutoReview = true; updated = true; Logger.log("ביקורת: " + b.name); }
      catch(err) { Logger.log("שגיאה ביקורת: " + err); }
    }
  });
  if (updated) saveAll(bookings);
}

// רץ במוצאי שבת (שבת 22:00) ומשלים את מה ש-dailyEmailTrigger דילג עליו בשבת:
// • תזכורת לנכנסים מחר (יום ראשון) — ריצת שבת 09:00 נחסמת ע"י isShabat()
// • ביקורת ליוצאי שישי ושבת
// ⚠ באג שתוקן 8.2026: הטריגר היה מוגדר ליום ראשון 21:00, ולכן "מחר" היה יום שני
//   (כפילות מיותרת עם הריצה היומית) ואילו נכנסי יום ראשון לא קיבלו תזכורת כלל.
function motzeiShabatTrigger() {
  const bookings = getBookings();

  const dayStr = function(offset) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return Utilities.formatDate(d, "Asia/Jerusalem", "yyyy-MM-dd");
  };

  const sundayStr   = dayStr(1);   // מחר — יום ראשון
  const saturdayStr = dayStr(0);   // היום — שבת
  const fridayStr   = dayStr(-1);  // אתמול — יום שישי

  let updated = false;
  bookings.forEach(function(b) {
    if (b.status === "cancelled") return;
    if (!b.email) return;

    if (b.checkin === sundayStr && !b.sentAutoReminder) {
      try { sendReminderEmail(b); b.sentAutoReminder = true; updated = true; Logger.log("מוצש תזכורת ליום ראשון: " + b.name); }
      catch(err) { Logger.log("שגיאה: " + err); }
    }

    if (b.checkout === fridayStr && !b.sentAutoReview) {
      try { sendReviewEmail(b); b.sentAutoReview = true; updated = true; Logger.log("מוצש ביקורת יום שישי: " + b.name); }
      catch(err) { Logger.log("שגיאה: " + err); }
    }

    if (b.checkout === saturdayStr && !b.sentAutoReview) {
      try { sendReviewEmail(b); b.sentAutoReview = true; updated = true; Logger.log("מוצש ביקורת שבת: " + b.name); }
      catch(err) { Logger.log("שגיאה: " + err); }
    }
  });
  if (updated) saveAll(bookings);
}

// רושם בלשונית "תבניות" את התזמון שנוצר בפועל, כדי ש-health.html יוכל לאמת אותו
// דרך ה-action הקיים getTemplates (ה-API של Apps Script לא חושף שעה/יום של טריגר).
// מפתחות "_trigger_*" אינם מתנגשים עם תבניות המייל confirm/reminder/review/inquiry.
function noteTrigger(key, schedule) {
  try {
    saveTemplate(key, schedule + " · עודכן " + Utilities.formatDate(new Date(), "Asia/Jerusalem", "dd.MM.yyyy HH:mm"));
  } catch(err) { Logger.log("noteTrigger: " + err); }
}

function createMotzeiShabatTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === "motzeiShabatTrigger") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("motzeiShabatTrigger")
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SATURDAY)
    .atHour(22)
    .create();
  noteTrigger("_trigger_motzeiShabat", "SATURDAY 22:00");
  Logger.log("טריגר מוצאי שבת נוצר (שבת 22:00) ✅");
}

function createDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === "dailyEmailTrigger") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("dailyEmailTrigger").timeBased().everyDays(1).atHour(9).create();
  noteTrigger("_trigger_daily", "DAILY 09:00");
  Logger.log("טריגר יומי נוצר בהצלחה");
}

function getOrCreateSheet(name) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function getBookings() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  const headers = rows[0];
  return rows.slice(1).map(function(r) {
    const obj = {};
    headers.forEach(function(h, i) {
      let val = r[i];
      if ((h === "checkin" || h === "checkout") && val instanceof Date) {
        val = val.getFullYear()+"-"+String(val.getMonth()+1).padStart(2,"0")+"-"+String(val.getDate()).padStart(2,"0");
      }
      obj[h] = val;
    });
    return obj;
  });
}

// מסנן כפילויות לפי id — שומר את המופע הראשון. מזהי הזמנה אמורים להיות ייחודיים (max+1),
// ולכן שני רשומות עם אותו id הן תמיד שכפול. רשומות ללא id נשמרות כמות שהן.
function dedupeById(bookings) {
  const seen = {};
  const unique = [];
  let dropped = 0;
  (bookings || []).forEach(function(b) {
    const id = (b && b.id !== undefined && b.id !== null && b.id !== "") ? String(b.id) : "";
    if (id) {
      if (seen[id]) { dropped++; return; }
      seen[id] = true;
    }
    unique.push(b);
  });
  if (dropped > 0) Logger.log("⚠ נמנעה כתיבת " + dropped + " הזמנות כפולות (id זהה)");
  return unique;
}

function saveAll(bookingsRaw) {
  const bookings = dedupeById(bookingsRaw);
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const headers = BOOKING_HEADERS;
  const before = sheet.getLastRow();

  // כתיבה אחת (setValues) במקום appendRow בלולאה. appendRow תלוי ב"שורה האחרונה"
  // שהגיליון מדווח עליה, ולכן ריקון שלא נכנס לתוקף מייצר שורות שרד — כך נוצרה
  // הכפילות של 18.8.2026. setValues כותב לטווח מפורש ולא תלוי במצב הקודם.
  const values = [headers].concat(bookings.map(function(b) {
    return headers.map(function(h) {
      if (h === "phone" && b[h]) return cellSafe(String(b[h]));
      return b[h] !== undefined && b[h] !== null ? cellSafe(b[h]) : "";
    });
  }));
  sheet.getRange(1, 1, values.length, headers.length).setValues(values);

  // ניקוי מפורש של כל שורה שנשארה מתחת לנתונים החדשים (אם הרשימה התקצרה).
  if (before > values.length) {
    sheet.getRange(values.length + 1, 1, before - values.length, headers.length).clearContent();
  }
  SpreadsheetApp.flush();
}

function addBooking(b) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const headers = BOOKING_HEADERS;
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  sheet.appendRow(headers.map(function(h) {
    if (h === "phone" && b[h]) return cellSafe(String(b[h]));
    return b[h] !== undefined ? cellSafe(b[h]) : "";
  }));
}

function getBlocked() {
  const sheet = getOrCreateSheet(BLOCKED_SHEET);
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  return rows.slice(1).filter(hasValue).map(function(r) {
    let date = r[0];
    if (date instanceof Date) {
      date = date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0");
    }
    return {date: String(date), note: r[1]||""};
  });
}

// ⭐ כתיבה בטוחה ללשונית (12.9.2026). מחליף את הדפוס clearContents + appendRow בלולאה,
// שהוא בדיוק מה שגרם לאירוע 18.8.2026: clearContents לא נכנס לתוקף מיד, ולכן appendRow
// ממשיך לכתוב אחרי השורה האחרונה הישנה — נוצרות שורות ריקות בראש והנתונים נדחפים למטה
// (או שנשארות שורות שרד בסוף). כאן: setValues לטווח מפורש + ניקוי מפורש של הזנב + flush.
function writeSheet(sheet, headers, rows) {
  const before = sheet.getLastRow();
  const values = [headers].concat(rows.map(function(r) { return r.map(cellSafe); }));
  sheet.getRange(1, 1, values.length, headers.length).setValues(values);
  if (before > values.length) {
    sheet.getRange(values.length + 1, 1, before - values.length, sheet.getLastColumn() || headers.length).clearContent();
  }
  SpreadsheetApp.flush();
}

// שורה ריקה = אין בה שום ערך. מסננים בקריאה כדי ששורות שרד מתקלות ישנות לא יוצגו כרשומות ריקות.
function hasValue(r) {
  for (let i = 0; i < r.length; i++) if (String(r[i] === null || r[i] === undefined ? "" : r[i]).trim() !== "") return true;
  return false;
}

function saveBlocked(blocked) {
  writeSheet(getOrCreateSheet(BLOCKED_SHEET), ["date","note"],
    blocked.map(function(b) { return [b.date, b.note||""]; }));
}

function getExpenses() {
  const sheet = getOrCreateSheet(EXPENSES_SHEET);
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  return rows.slice(1).filter(hasValue).map(function(r) {
    let date = r[0];
    if (date instanceof Date) {
      date = date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0");
    }
    return {date: String(date), desc: r[1]||"", amount: Number(r[2]||0)};
  });
}

function saveExpenses(expenses) {
  writeSheet(getOrCreateSheet(EXPENSES_SHEET), ["date","desc","amount"],
    expenses.map(function(e) { return [e.date, e.desc, e.amount]; }));
}

function getManualGuests() {
  const sheet = getOrCreateSheet(GUESTS_SHEET);
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  const headers = rows[0];
  return rows.slice(1).filter(hasValue).map(function(r) {
    const obj = {};
    headers.forEach(function(h, i) { obj[h] = r[i] !== undefined ? r[i] : ""; });
    return obj;
  });
}

function saveManualGuests(guests) {
  const headers = ["name","phone","email","rating","notes"];
  writeSheet(getOrCreateSheet(GUESTS_SHEET), headers, guests.map(function(g) {
    return headers.map(function(h) {
      if (h === "phone" && g[h]) return String(g[h]);
      return g[h] !== undefined ? g[h] : "";
    });
  }));
}

function getTemplates() {
  const sheet = getOrCreateSheet(TEMPLATES_SHEET);
  const rows = sheet.getDataRange().getValues();
  const result = {};
  rows.forEach(function(r) { if (r[0] && r[1] !== undefined) result[r[0]] = r[1]; });
  return result;
}

function saveTemplate(key, value) {
  const sheet = getOrCreateSheet(TEMPLATES_SHEET);
  const rows = sheet.getDataRange().getValues();
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === key) { sheet.getRange(i+1, 2).setValue(cellSafe(value)); return; }
  }
  sheet.appendRow([cellSafe(key), cellSafe(value)]);
}

const LEADS_SHEET = "מתעניינים";

function saveLeads(leads) {
  writeSheet(getOrCreateSheet(LEADS_SHEET), ["email","phone","date"], leads.map(function(l) {
    return [l.email||"", l.phone ? String(l.phone) : "", l.date||""];
  }));
}

function getLeads() {
  const sheet = getOrCreateSheet(LEADS_SHEET);
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  return rows.slice(1).filter(hasValue).map(function(r) {
    return {email: r[0]||"", phone: r[1]||"", date: r[2]||""};
  });
}

const TRASH_SHEET = "סל מחזור";

function saveTrash(items) {
  writeSheet(getOrCreateSheet(TRASH_SHEET),
    ["סוג","שם","מייל","טלפון","תאריך כניסה","תאריך יציאה","סטטוס","תאריך מחיקה","נתונים מלאים"],
    items.map(function(item) {
      return [
        item._type==="booking"?"הזמנה":"מתעניין",
        item.name||"",
        item.email||"",
        item.phone ? String(item.phone) : "",
        item.checkin||"",
        item.checkout||"",
        item.status||"",
        item._deletedAt||"",
        JSON.stringify(item)
      ];
    }));
}

function getTrash() {
  const sheet = getOrCreateSheet(TRASH_SHEET);
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  return rows.slice(1).filter(hasValue).map(function(r) {
    try {
      return JSON.parse(r[8]||"{}");
    } catch(e) {
      return {name:r[1]||"",email:r[2]||"",phone:r[3]||"",_type:r[0]==="הזמנה"?"booking":r[0]==="אורח"?"guest":"lead",_deletedAt:r[7]||""};
    }
  }).filter(function(x){ return x && Object.keys(x).length > 0; });
}

function notifyOwner(d) {
  var fd = function(ds) {
    if (!ds) return "";
    var dt = new Date(ds);
    return dt.getDate() + "." + (dt.getMonth()+1) + "." + dt.getFullYear();
  };
  var html = wrap(
    hdr("&#x1F514; בקשת הזמנה חדשה!")
    + "<tr><td style='padding:28px 24px;font-family:Arial,sans-serif;'>"
    + "<p style='font-size:16px;color:#222;margin:0 0 16px;line-height:1.8;'>התקבלה בקשת הזמנה חדשה דרך אתר הבוקינג:</p>"
    + bx(
        "<p style='margin:0 0 8px;font-size:15px;font-weight:700;color:#1a1a2e;font-family:Arial,sans-serif;'>" + escHtml(d.name||"") + "</p>"
        + "<p style='margin:0 0 6px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F4DE; " + escHtml(d.phone||"") + "</p>"
        + "<p style='margin:0;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x2709; " + escHtml(d.email||"לא הוזן") + "</p>",
        "#1565c0"
      )
    + bx(
        "<p style='margin:0 0 8px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F4C5; כניסה: <strong>" + fd(d.checkin) + "</strong> | יציאה: <strong>" + fd(d.checkout) + "</strong></p>"
        + "<p style='margin:0 0 8px;font-size:13px;color:#8a6a3a;font-family:Arial,sans-serif;'>" + hebDateStr(d.checkin) + " &ndash; " + hebDateStr(d.checkout) + (stayShabbatLine(d.checkin, d.checkout) ? " | &#x1F56F; " + stayShabbatLine(d.checkin, d.checkout) : "") + "</p>"
        + "<p style='margin:0 0 8px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F319; לילות: <strong>" + (d.nights||"") + "</strong> | אורחים: <strong>" + (d.guests||"") + "</strong></p>"
        + "<p style='margin:0;font-size:15px;color:#2d5a27;font-weight:700;font-family:Arial,sans-serif;'>&#x20AA;" + Number(d.total||0).toLocaleString() + " סהכ</p>",
        "#5a9e4f"
      )
    + (d.notes ? bx("<p style='margin:0;font-size:14px;color:#444;font-family:Arial,sans-serif;'><strong>הערות:</strong> " + escHtml(d.notes) + "</p>", "#c8860a") : "")
    + "<p style='margin:0 0 10px;font-size:14px;color:#666;font-family:Arial,sans-serif;'>לאישור ההזמנה:</p>"
    + "<a href='https://shirat-hatziporim.github.io/shirat-hatziporim/shirat-hatziporim.html' style='display:inline-block;background:#1a1a2e;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:700;font-family:Arial,sans-serif;'>&#x1F4CB; פתח מערכת ההזמנות</a>"
    + "</td></tr>"
    + ftr()
  );
  GmailApp.sendEmail(FROM_EMAIL, "בקשת הזמנה חדשה — " + (d.name||"") + " | " + fd(d.checkin), "", {
    htmlBody: html,
    name: "אתר הבוקינג"
  });
}

function dailyBackup() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const backupName = "גיבוי שירת הציפורים - " + Utilities.formatDate(new Date(), "Asia/Jerusalem", "dd.MM.yyyy HH:mm");

  const backup = SpreadsheetApp.create(backupName);
  const sheets = ss.getSheets();
  const defaultSheet = backup.getSheets()[0];

  sheets.forEach(function(sheet) {
    const newSheet = sheet.copyTo(backup);
    newSheet.setName("_" + sheet.getName());
  });

  backup.deleteSheet(defaultSheet);

  backup.getSheets().forEach(function(sheet) {
    if (sheet.getName().indexOf("_") === 0) {
      sheet.setName(sheet.getName().substring(1));
    }
  });

  const backupFile = DriveApp.getFileById(backup.getId());

  const folders = DriveApp.getFoldersByName("גיבויים - שירת הציפורים");
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder("גיבויים - שירת הציפורים");

  folder.addFile(backupFile);
  DriveApp.getRootFolder().removeFile(backupFile);

  const files = folder.getFiles();
  const allFiles = [];
  while (files.hasNext()) {
    allFiles.push(files.next());
  }
  allFiles.sort(function(a, b) { return b.getDateCreated() - a.getDateCreated(); });
  if (allFiles.length > 30) {
    allFiles.slice(30).forEach(function(f) { f.setTrashed(true); });
  }

  Logger.log("גיבוי נוצר בהצלחה: " + backupName);
}

function createBackupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === "dailyBackup") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("dailyBackup")
    .timeBased()
    .everyDays(1)
    .atHour(2)
    .create();
  noteTrigger("_trigger_backup", "DAILY 02:00");
  Logger.log("טריגר גיבוי יומי נוצר בהצלחה ✅");
}
