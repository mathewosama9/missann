// تنسيق التواريخ بالعربية المصرية
export const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });

export const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('ar-EG', { dateStyle: 'medium' });

// ISO ← قيمة datetime-local بتوقيت الجهاز
export const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

// حجم ملف مقروء (KB/MB)
export const formatBytes = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${Math.round((bytes / 1024 / 1024) * 10) / 10}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;

// وقت نسبي قصير ("منذ 5 دقائق") — وبعد أسبوع تاريخ عادي
const rtf = new Intl.RelativeTimeFormat('ar-EG', { numeric: 'auto' });
export function formatRelative(iso: string, now = Date.now()): string {
  const sec = Math.round((Date.parse(iso) - now) / 1000);
  const abs = Math.abs(sec);
  if (abs < 60) return rtf.format(0, 'second');
  if (abs < 3600) return rtf.format(Math.round(sec / 60), 'minute');
  if (abs < 86_400) return rtf.format(Math.round(sec / 3600), 'hour');
  if (abs < 7 * 86_400) return rtf.format(Math.round(sec / 86_400), 'day');
  return formatDate(iso);
}
