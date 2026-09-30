// بصمة الجهاز: معرّف عشوائي ثابت لكل متصفح (localStorage). لا نضيف مقاس الشاشة أو أي خاصية متغيّرة:
// تغيير الشاشة/التكبير كان يجعل نفس المتصفح "جهازاً جديداً" فيستهلك حد الأجهزة بلا سبب.
const KEY = 'ma_device_id';

export function getDeviceFingerprint(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return 'nostorage-' + Math.random().toString(36).slice(2);
  }
}
