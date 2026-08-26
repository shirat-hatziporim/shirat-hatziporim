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

function doGet(e) {
  const action = e.parameter.action;
  const callback = e.parameter.callback || "";
  let result;
  try {
    if (action === "get") result = getBookings();
    else if (action === "save") {
      const bookings = JSON.parse(decodeURIComponent(e.parameter.bookings));
      saveAll(bookings); result = "ok";
    } else if (action === "getBlocked") result = getBlocked();
    else if (action === "saveBlocked") {
      const blocked = JSON.parse(decodeURIComponent(e.parameter.blocked));
      saveBlocked(blocked); result = "ok";
    } else if (action === "getExpenses") result = getExpenses();
    else if (action === "saveExpenses") {
      const expenses = JSON.parse(decodeURIComponent(e.parameter.expenses));
      saveExpenses(expenses); result = "ok";
    } else if (action === "getManualGuests") result = getManualGuests();
    else if (action === "saveManualGuests") {
      const guests = JSON.parse(decodeURIComponent(e.parameter.guests));
      saveManualGuests(guests); result = "ok";
    } else if (action === "getTemplates") result = getTemplates();
    else if (action === "addBooking") {
      const booking = JSON.parse(decodeURIComponent(e.parameter.booking));
      addBooking(booking); result = "ok";
    } else if (action === "saveTemplate") {
      const key = decodeURIComponent(e.parameter.key);
      const value = decodeURIComponent(e.parameter.value);
      saveTemplate(key, value); result = "ok";
    } else if (action === "sendConfirm") {
      const b = JSON.parse(decodeURIComponent(e.parameter.booking));
      sendConfirmEmail(b); result = "ok";
    } else if (action === "sendInquiry") {
      const email = decodeURIComponent(e.parameter.email);
      sendInquiryEmail(email); result = "ok";
    } else if (action === "previewInquiry") {
      result = previewInquiry();
    } else if (action === "previewConfirm") {
      result = previewConfirm();
    } else if (action === "previewReview") {
      result = previewReview();
    } else if (action === "sendReminder") {
      const b = JSON.parse(decodeURIComponent(e.parameter.booking));
      sendReminderEmail(b); result = "ok";
    } else if (action === "sendReview") {
      const b = JSON.parse(decodeURIComponent(e.parameter.booking));
      sendReviewEmail(b); result = "ok";
    } else if (action === "saveLeads") {
      const leads = JSON.parse(decodeURIComponent(e.parameter.leads));
      saveLeads(leads); result = "ok";
    } else if (action === "getLeads") {
      result = getLeads();
    } else if (action === "saveTrash") {
      const trash = JSON.parse(decodeURIComponent(e.parameter.trash));
      saveTrash(trash); result = "ok";
    } else if (action === "getTrash") {
      result = getTrash();
    } else if (action === "notifyOwner") {
      const data = JSON.parse(decodeURIComponent(e.parameter.data));
      notifyOwner(data); result = "ok";
    } else if (action === "chunk") {
      const cache = CacheService.getScriptCache();
      cache.put("chunk_"+e.parameter.index, decodeURIComponent(e.parameter.data), 300);
      cache.put("chunk_total", e.parameter.total, 300);
      result = "ok";
    } else if (action === "commitChunks") {
      const cache = CacheService.getScriptCache();
      const total = parseInt(cache.get("chunk_total")||"0");
      let str = "";
      for (let i = 0; i < total; i++) str += (cache.get("chunk_"+i)||"");
      saveAll(JSON.parse(str)); result = "ok";
    } else result = "ok";
  } catch(err) { result = {error: err.toString()}; }

  const json = JSON.stringify(result);
  if (callback) return ContentService.createTextOutput(callback+"("+json+");").setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
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
  return { html: buildConfirmHtml({ name: "בדיקה", checkin: "2026-07-15", checkout: "2026-07-17", nights: 2, guests: 2, extraGuests: 0, babies: 0, total: 1600 }) };
}

// גוף מייל האישור (מסלול ה-HTML המעוצב)
function buildConfirmBody(b) {
  const body = "<tr><td style='padding:28px 24px;font-family:Arial,sans-serif;'>"
    + "<p style='font-size:16px;color:#222;margin:0 0 8px;line-height:1.8;'>שלום וברכה <strong>" + b.name + "</strong>,</p>"
    + "<p style='font-size:15px;color:#444;margin:0 0 24px;line-height:1.8;'>שמחים לאשר את הזמנתכם בצימר שירת הציפורים!</p>"
    + "<p style='font-size:15px;color:#222;font-weight:700;margin:0 0 12px;'>&#x1F4C5; פרטי ההזמנה:</p>"
    + bx(
        rw("&#x1F4C5; תאריך הגעה", fd(b.checkin))
        + rw("&#x1F4C5; תאריך יציאה", fd(b.checkout))
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
      .replace(/{לילות}/g, b.nights||"")
      .replace(/{יתרה}/g, balance > 0 ? Number(balance).toLocaleString() + ' ש"ח' : 'שולם במלואו');
    GmailApp.sendEmail(b.email, "מחר אתם מגיעים! תזכורת - שירת הציפורים", text, {
      name: FROM_NAME, replyTo: FROM_EMAIL
    });
    return;
  }
  const body = "<tr><td style='padding:28px 24px;font-family:Arial,sans-serif;'>"
    + "<p style='font-size:16px;color:#222;margin:0 0 8px;line-height:1.8;'>שלום וברכה <strong>" + b.name + "</strong>,</p>"
    + "<p style='font-size:15px;color:#444;margin:0 0 24px;line-height:1.8;'>מזכירים לכם שמחר אתם מגיעים אלינו! מחכים לכם ומתרגשים לארח אתכם.</p>"
    + "<p style='font-size:15px;color:#222;font-weight:700;margin:0 0 12px;'>&#x1F4C5; פרטי ההזמנה:</p>"
    + bx(
        rw("&#x1F4C5; תאריך הגעה", fd(b.checkin))
        + rw("&#x1F4C5; תאריך יציאה", fd(b.checkout))
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
    + "<p style='font-size:16px;color:#222;margin:0 0 8px;line-height:1.8;'>שלום וברכה <strong>" + b.name + "</strong>,</p>"
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
  const features = "<p style='margin:0 0 7px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F6C1; חדר שינה מרווח עם ג&#39;קוזי זוגי מפנק</p>"
    + "<p style='margin:0 0 7px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F6BF; חדר רחצה נוסף עם מקלחון מסאז&#39; יוקרתי</p>"
    + "<p style='margin:0 0 7px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F6CB; סלון גדול, נעים ומעוצב לישיבה רגועה, עם ספה נפתחת למיטה זוגית</p>"
    + "<p style='margin:0 0 7px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x2615; מטבח מאובזר במלואו &#8212; כיריים אינדוקציה, תנור, מכונת קפה ומקציף חלב</p>"
    + "<p style='margin:0 0 7px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F333; חצר פרטית גדולה עם פינת ישיבה, ערסל ומנגל גז</p>"
    + "<p style='margin:0 0 7px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F304; מצפה סמוך לצימר, עם נוף פתוח ועוצר נשימה לכיוון ים המלח</p>"
    + "<p style='margin:0 0 7px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F46A; מתאים לזוגות ולמשפחות עד 5 נופשים</p>"
    + "<p style='margin:0;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F54D; בית כנסת סמוך (קבלת שבת בסגנון קרליבך)</p>";

  const prices = "<p style='margin:0 0 6px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F319; אמצע שבוע: <strong>800 ש&#34;ח ללילה</strong></p>"
    + "<p style='margin:0 0 6px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F4C5; סוף שבוע (שישי-שבת): <strong>1,200 ש&#34;ח</strong></p>"
    + "<p style='margin:0 0 6px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F381; חבילת חמישי+שישי+שבת: <strong>1,700 ש&#34;ח</strong></p>"
    + "<p style='margin:0 0 6px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x279C; תוספת יציאה ראשון: <strong>350 ש&#34;ח</strong></p>"
    + "<p style='margin:0;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x279C; תוספת מיטות (עד 3): <strong>300 ש&#34;ח לאדם</strong></p>";

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
    + "<p style='font-size:15px;color:#222;font-weight:700;margin:0 0 12px;font-family:Arial,sans-serif;'>&#x1F4B0; מחירון לזוג:</p>"
    + bx(prices, "#c8860a")
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
  const headers = ["id","name","phone","email","checkin","checkout","guests","extraGuests","babies","babyCrib","status","notes","paid","total","nights","guestExtra","discount","deposit","depositMethod","rating","receiptIssued","source","balanceMethod","sentConfirm","sentReminder","sentReview","sentAutoReminder","sentAutoReview"];
  const before = sheet.getLastRow();

  // כתיבה אחת (setValues) במקום appendRow בלולאה. appendRow תלוי ב"שורה האחרונה"
  // שהגיליון מדווח עליה, ולכן ריקון שלא נכנס לתוקף מייצר שורות שרד — כך נוצרה
  // הכפילות של 18.8.2026. setValues כותב לטווח מפורש ולא תלוי במצב הקודם.
  const values = [headers].concat(bookings.map(function(b) {
    return headers.map(function(h) {
      if (h === "phone" && b[h]) return String(b[h]);
      return b[h] !== undefined && b[h] !== null ? b[h] : "";
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
  const headers = ["id","name","phone","email","checkin","checkout","guests","extraGuests","babies","babyCrib","status","notes","paid","total","nights","guestExtra","discount","deposit","depositMethod","rating","receiptIssued","source","balanceMethod","sentConfirm","sentReminder","sentReview","sentAutoReminder","sentAutoReview"];
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  sheet.appendRow(headers.map(function(h) {
    if (h === "phone" && b[h]) return String(b[h]);
    return b[h] !== undefined ? b[h] : "";
  }));
}

function getBlocked() {
  const sheet = getOrCreateSheet(BLOCKED_SHEET);
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  return rows.slice(1).map(function(r) {
    let date = r[0];
    if (date instanceof Date) {
      date = date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0");
    }
    return {date: String(date), note: r[1]||""};
  });
}

function saveBlocked(blocked) {
  const sheet = getOrCreateSheet(BLOCKED_SHEET);
  sheet.clearContents();
  sheet.appendRow(["date","note"]);
  blocked.forEach(function(b) { sheet.appendRow([b.date, b.note||""]); });
}

function getExpenses() {
  const sheet = getOrCreateSheet(EXPENSES_SHEET);
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  return rows.slice(1).map(function(r) {
    let date = r[0];
    if (date instanceof Date) {
      date = date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0");
    }
    return {date: String(date), desc: r[1]||"", amount: Number(r[2]||0)};
  });
}

function saveExpenses(expenses) {
  const sheet = getOrCreateSheet(EXPENSES_SHEET);
  sheet.clearContents();
  sheet.appendRow(["date","desc","amount"]);
  expenses.forEach(function(e) { sheet.appendRow([e.date, e.desc, e.amount]); });
}

function getManualGuests() {
  const sheet = getOrCreateSheet(GUESTS_SHEET);
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  const headers = rows[0];
  return rows.slice(1).map(function(r) {
    const obj = {};
    headers.forEach(function(h, i) { obj[h] = r[i] !== undefined ? r[i] : ""; });
    return obj;
  });
}

function saveManualGuests(guests) {
  const sheet = getOrCreateSheet(GUESTS_SHEET);
  sheet.clearContents();
  if (!guests.length) { sheet.appendRow(["name","phone","email","rating","notes"]); return; }
  const headers = ["name","phone","email","rating","notes"];
  sheet.appendRow(headers);
  guests.forEach(function(g) { sheet.appendRow(headers.map(function(h) { return g[h] !== undefined ? g[h] : ""; })); });
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
    if (rows[i][0] === key) { sheet.getRange(i+1, 2).setValue(value); return; }
  }
  sheet.appendRow([key, value]);
}

const LEADS_SHEET = "מתעניינים";

function saveLeads(leads) {
  const sheet = getOrCreateSheet(LEADS_SHEET);
  sheet.clearContents();
  sheet.appendRow(["email","phone","date"]);
  leads.forEach(function(l) {
    sheet.appendRow([l.email||"", l.phone||"", l.date||""]);
  });
}

function getLeads() {
  const sheet = getOrCreateSheet(LEADS_SHEET);
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  return rows.slice(1).map(function(r) {
    return {email: r[0]||"", phone: r[1]||"", date: r[2]||""};
  });
}

const TRASH_SHEET = "סל מחזור";

function saveTrash(items) {
  const sheet = getOrCreateSheet(TRASH_SHEET);
  sheet.clearContents();
  sheet.appendRow(["סוג","שם","מייל","טלפון","תאריך כניסה","תאריך יציאה","סטטוס","תאריך מחיקה","נתונים מלאים"]);
  items.forEach(function(item) {
    sheet.appendRow([
      item._type==="booking"?"הזמנה":"מתעניין",
      item.name||"",
      item.email||"",
      item.phone||"",
      item.checkin||"",
      item.checkout||"",
      item.status||"",
      item._deletedAt||"",
      JSON.stringify(item)
    ]);
  });
}

function getTrash() {
  const sheet = getOrCreateSheet(TRASH_SHEET);
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  return rows.slice(1).map(function(r) {
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
        "<p style='margin:0 0 8px;font-size:15px;font-weight:700;color:#1a1a2e;font-family:Arial,sans-serif;'>" + (d.name||"") + "</p>"
        + "<p style='margin:0 0 6px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F4DE; " + (d.phone||"") + "</p>"
        + "<p style='margin:0;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x2709; " + (d.email||"לא הוזן") + "</p>",
        "#1565c0"
      )
    + bx(
        "<p style='margin:0 0 8px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F4C5; כניסה: <strong>" + fd(d.checkin) + "</strong> | יציאה: <strong>" + fd(d.checkout) + "</strong></p>"
        + "<p style='margin:0 0 8px;font-size:14px;color:#444;font-family:Arial,sans-serif;'>&#x1F319; לילות: <strong>" + (d.nights||"") + "</strong> | אורחים: <strong>" + (d.guests||"") + "</strong></p>"
        + "<p style='margin:0;font-size:15px;color:#2d5a27;font-weight:700;font-family:Arial,sans-serif;'>&#x20AA;" + Number(d.total||0).toLocaleString() + " סהכ</p>",
        "#5a9e4f"
      )
    + (d.notes ? bx("<p style='margin:0;font-size:14px;color:#444;font-family:Arial,sans-serif;'><strong>הערות:</strong> " + d.notes + "</p>", "#c8860a") : "")
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
