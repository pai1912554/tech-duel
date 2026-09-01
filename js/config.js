/* ตั้งค่าเซิร์ฟเวอร์
   ใส่ databaseURL ของ Firebase Realtime Database ตรงนี้ได้เลย
   หรือปล่อยว่างแล้วไปกรอกในหน้า "ตั้งค่าเซิร์ฟเวอร์" ในเกม (เก็บลง localStorage ของเครื่องนั้น)
   ตัวอย่าง: "https://tech-duel-default-rtdb.asia-southeast1.firebasedatabase.app" */
const FIREBASE_URL_DEFAULT = "";

const CFG = {
  get fbUrl() {
    const v = (localStorage.getItem("td_fb_url") || FIREBASE_URL_DEFAULT || "").trim();
    return v.replace(/\/+$/, "");
  },
  set fbUrl(v) {
    const clean = (v || "").trim().replace(/\/+$/, "");
    clean ? localStorage.setItem("td_fb_url", clean) : localStorage.removeItem("td_fb_url");
  },
  get online() { return !!CFG.fbUrl; }
};

/* ---------- ตัวช่วยที่ต้องทนเบราว์เซอร์เก่า ----------
   crypto.randomUUID() มีเฉพาะเบราว์เซอร์ใหม่และเฉพาะหน้าที่เป็น HTTPS
   บน iOS ต่ำกว่า 15.4, Android เก่า หรือเบราว์เซอร์ในแอป (Line/Facebook) จะไม่มี
   เรียกตรง ๆ แล้วจะพังตอนสมัครบัญชีพอดี จึงต้องมีทางถอย */
function uid() {
  try { if (crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID(); } catch {}
  try {
    if (crypto && crypto.getRandomValues) {
      const a = new Uint8Array(16);
      crypto.getRandomValues(a);
      return [...a].map(b => b.toString(16).padStart(2, "0")).join("");
    }
  } catch {}
  return (Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 32);
}

/* เบราว์เซอร์บางตัว (โหมดส่วนตัวของ Safari, ปิดคุกกี้ทั้งหมด) โยน error ตอนเขียน localStorage */
function storageWorks() {
  try { localStorage.setItem("td_test", "1"); localStorage.removeItem("td_test"); return true; }
  catch { return false; }
}
