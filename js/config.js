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
