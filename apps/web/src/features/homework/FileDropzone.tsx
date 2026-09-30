import { useId, useState, type DragEvent } from 'react';
import { FileText, ImageIcon, UploadCloud, X } from 'lucide-react';
import { HOMEWORK_FILE_ACCEPT, HOMEWORK_FILE_TYPES } from '@miss-ann/shared';
import { formatBytes } from '../../lib/format';

// فحص سريع في المتصفح قبل الرفع (النوع والحجم) — الحكم النهائي على المحتوى في الخادم
export function checkFile(file: File, maxBytes: number): string | null {
  if (!HOMEWORK_FILE_TYPES.includes(file.type)) return 'نوع الملف غير مسموح — PDF أو صورة JPG/PNG/WEBP فقط';
  if (file.size > maxBytes) return `حجم الملف أكبر من ${formatBytes(maxBytes)}`;
  if (file.size === 0) return 'الملف فارغ';
  return null;
}

export function FileDropzone({
  file,
  onChange,
  maxBytes,
  disabled,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  maxBytes: number;
  disabled?: boolean;
}) {
  const inputId = useId();
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const pick = (f: File | undefined) => {
    if (!f) return;
    const err = checkFile(f, maxBytes);
    setError(err);
    onChange(err ? null : f);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (!disabled) pick(e.dataTransfer.files[0]);
  };

  return (
    <div>
      {file ? (
        <div className="flex items-center gap-3 rounded-3xl border border-ink-900/10 bg-paper-50 p-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-lime-300 text-ink-900">
            {file.type === 'application/pdf' ? <FileText size={20} /> : <ImageIcon size={20} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold text-ink-900" dir="auto">
              {file.name}
            </div>
            <div className="text-xs text-ink-400">{formatBytes(file.size)}</div>
          </div>
          <button type="button" className="btn-icon h-9 w-9" onClick={() => onChange(null)} disabled={disabled} aria-label="إزالة الملف">
            <X size={18} />
          </button>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          className={`grid cursor-pointer place-items-center gap-2 rounded-3xl border-2 border-dashed p-8 text-center transition hover:border-ink-900 ${
            over ? 'border-ink-900 bg-paper-50' : 'border-ink-900/20'
          }`}
        >
          <span className="grid h-14 w-14 place-items-center rounded-full bg-brand-50 text-brand-600">
            <UploadCloud size={26} />
          </span>
          <span className="font-semibold text-ink-900">اسحب الملف هنا أو اضغط للاختيار</span>
          <span className="text-xs text-ink-400">PDF أو صورة (JPG / PNG / WEBP) حتى {formatBytes(maxBytes)}</span>
        </label>
      )}
      <input
        id={inputId}
        type="file"
        accept={HOMEWORK_FILE_ACCEPT}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
