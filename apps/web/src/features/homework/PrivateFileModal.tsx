import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Download } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import { apiErrorMessage } from '../../lib/api';
import { fetchPrivateFile } from './api';

// معاينة ملف خاص (حل طالب / مرفق واجب): يُجلب كـ Blob بتوكن الوصول ثم يُعرض محلياً.
// الصورة تُعرض مباشرة، والـ PDF في إطار؛ زر التنزيل متاح دائماً (الموبايل لا يعرض PDF داخل الصفحة).
export function PrivateFileModal({
  file,
  onClose,
}: {
  file: { url: string; name: string; mime: string } | null;
  onClose: () => void;
}) {
  const q = useQuery({
    queryKey: ['private-file', file?.url],
    queryFn: () => fetchPrivateFile(file!.url),
    enabled: file !== null,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!q.data) return;
    const u = URL.createObjectURL(q.data);
    setObjectUrl(u);
    return () => {
      URL.revokeObjectURL(u);
      setObjectUrl(null);
    };
  }, [q.data]);

  return (
    <Modal open={file !== null} onClose={onClose} title={file?.name ?? ''} size="lg">
      {q.isPending || (q.data && !objectUrl) ? (
        <div className="grid place-items-center py-20">
          <Spinner className="h-8 w-8 text-brand-500" />
        </div>
      ) : q.isError ? (
        <div className="flex items-center gap-2 rounded-2xl bg-coral-100 p-4 text-sm font-semibold text-coral-700">
          <AlertTriangle size={18} /> {apiErrorMessage(q.error, 'تعذّر فتح الملف')}
        </div>
      ) : (
        objectUrl &&
        file && (
          <div className="space-y-4">
            {file.mime.startsWith('image/') ? (
              <img src={objectUrl} alt={file.name} className="mx-auto max-h-[60vh] rounded-2xl border border-ink-900/10" />
            ) : (
              <iframe src={objectUrl} title={file.name} className="hidden h-[60vh] w-full rounded-2xl border border-ink-900/10 md:block" />
            )}
            <a href={objectUrl} download={file.name} className="btn-dark w-full sm:w-auto">
              <Download size={18} /> تنزيل الملف
            </a>
          </div>
        )
      )}
    </Modal>
  );
}
