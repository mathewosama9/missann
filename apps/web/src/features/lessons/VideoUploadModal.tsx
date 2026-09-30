import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from '../../components/ui/notify';
import {
  UploadCloud,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Youtube,
  Cloud,
  Link2,
  ShieldCheck,
} from 'lucide-react';
import { parseYouTubeId, VideoProvider, type AdminLessonDTO } from '@miss-ann/shared';
import { Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import { apiErrorMessage } from '../../lib/api';
import { adminCoursesApi } from '../courses/api';
import { bunnyAdminApi } from './api';
import { tusUpload } from './tusUpload';

type Tab = VideoProvider;

// إدارة فيديو الحصة: رابط يوتيوب (غير مدرج) أو رفع مباشر إلى Bunny، واختيار المصدر الفعّال
export function VideoUploadModal({
  lesson,
  onClose,
  onChanged,
}: {
  lesson?: AdminLessonDTO;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<Tab>(VideoProvider.YOUTUBE);
  const busyRef = useRef(false);

  useEffect(() => {
    if (lesson) setTab(lesson.videoProvider);
    // نعيد الضبط عند فتح حصة أخرى فقط
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson?.id]);

  const close = () => {
    if (busyRef.current && !window.confirm('الرفع جارٍ، هل تريد إلغاءه؟')) return;
    onClose();
  };

  const activeLabel =
    lesson && (lesson.videoProvider === 'YOUTUBE' ? lesson.youtubeVideoId : lesson.bunnyVideoId)
      ? lesson.videoProvider === 'YOUTUBE'
        ? 'يوتيوب'
        : 'Bunny'
      : null;

  return (
    <Modal open={!!lesson} onClose={close} title={`فيديو الحصة: ${lesson?.title ?? ''}`} size="lg">
      {lesson && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-ink-500">
              المصدر المعروض للطلاب:{' '}
              <b className="text-ink-900">{activeLabel ?? 'لا يوجد فيديو بعد'}</b>
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1 rounded-full border border-ink-900/10 bg-paper-50 p-1">
            <TabButton active={tab === 'YOUTUBE'} onClick={() => setTab('YOUTUBE')}>
              <Youtube size={16} /> يوتيوب
            </TabButton>
            <TabButton active={tab === 'BUNNY'} onClick={() => setTab('BUNNY')}>
              <Cloud size={16} /> Bunny
            </TabButton>
          </div>

          {tab === 'YOUTUBE' ? (
            <YouTubeTab lesson={lesson} onChanged={onChanged} />
          ) : (
            <BunnyTab lesson={lesson} onChanged={onChanged} busyRef={busyRef} />
          )}

          <div className="flex justify-end pt-1">
            <button type="button" className="btn-ghost" onClick={close}>
              إغلاق
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-full py-2 text-sm font-semibold transition ${
        active ? 'bg-ink-900 text-paper' : 'text-ink-600 hover:bg-white'
      }`}
    >
      {children}
    </button>
  );
}

// ── يوتيوب: لصق رابط فيديو غير مدرج ─────────────────────────────
function YouTubeTab({ lesson, onChanged }: { lesson: AdminLessonDTO; onChanged: () => void }) {
  const [link, setLink] = useState(lesson.youtubeVideoId ? `https://youtu.be/${lesson.youtubeVideoId}` : '');
  const [minutes, setMinutes] = useState(lesson.durationSec ? String(Math.round(lesson.durationSec / 60)) : '');
  const id = link.trim() ? parseYouTubeId(link) : null;
  const isActive = lesson.videoProvider === 'YOUTUBE' && !!lesson.youtubeVideoId;

  const saveM = useMutation({
    mutationFn: () =>
      adminCoursesApi.updateLesson(lesson.id, {
        videoProvider: 'YOUTUBE',
        youtubeVideoId: id,
        ...(minutes !== '' && { durationSec: Math.max(0, Number(minutes) || 0) * 60 }),
      }),
    onSuccess: () => {
      toast.success('تم ربط فيديو يوتيوب بالحصة');
      onChanged();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-4 text-sm text-ink-700">
        <div className="mb-2 flex items-center gap-2 font-semibold text-ink-900">
          <ShieldCheck size={16} className="text-brand-600" /> قبل اللصق — إعدادات الحماية في YouTube Studio
        </div>
        <ol className="list-inside list-decimal space-y-1 leading-6">
          <li>
            الظهور: <b>غير مدرج (Unlisted)</b> — ليس "عام"، وليس "خاص" لأن الخاص لا يعمل داخل المنصة.
          </li>
          <li>
            فعّل <b>السماح بالتضمين (Allow embedding)</b>.
          </li>
          <li>أوقف التعليقات، ولا تضعه في قائمة تشغيل عامة، ولا تشاركه في أي مكان آخر.</li>
          <li>انسخ رابط الفيديو والصقه هنا.</li>
        </ol>
      </div>

      <label className="block">
        <span className="label">رابط فيديو يوتيوب</span>
        <div className="relative">
          <Link2 size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-300" />
          <input
            dir="ltr"
            className="input pr-10 text-left"
            placeholder="https://youtu.be/..."
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
        </div>
        {link.trim() !== '' &&
          (id ? (
            <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-lime-700">
              <CheckCircle2 size={13} /> معرّف الفيديو: <span dir="ltr">{id}</span>
            </span>
          ) : (
            <span className="field-error">رابط يوتيوب غير صحيح</span>
          ))}
      </label>

      <label className="block">
        <span className="label">مدة الحصة بالدقائق (اختياري)</span>
        <input type="number" min={0} className="input" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
      </label>

      <button
        type="button"
        className="btn-primary w-full"
        disabled={!id || saveM.isPending}
        onClick={() => saveM.mutate()}
      >
        {saveM.isPending ? <Spinner /> : <Youtube size={18} />}
        {isActive && id === lesson.youtubeVideoId ? 'حفظ' : 'ربط الفيديو وجعله المصدر المعروض'}
      </button>
    </div>
  );
}

// ── Bunny: رفع مباشر من المتصفح (TUS) ───────────────────────────
type Phase = 'idle' | 'uploading' | 'done';

function BunnyTab({
  lesson,
  onChanged,
  busyRef,
}: {
  lesson: AdminLessonDTO;
  onChanged: () => void;
  busyRef: React.MutableRefObject<boolean>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      busyRef.current = false;
    },
    [busyRef],
  );

  const statusQ = useQuery({
    queryKey: ['admin', 'bunny-status', lesson.id],
    queryFn: () => bunnyAdminApi.status(lesson.id),
    enabled: !!lesson.bunnyVideoId && phase !== 'uploading',
    retry: false,
  });

  const activateM = useMutation({
    mutationFn: () => adminCoursesApi.updateLesson(lesson.id, { videoProvider: 'BUNNY' }),
    onSuccess: () => {
      toast.success('أصبح فيديو Bunny هو المعروض');
      onChanged();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const start = async () => {
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      toast.error('اختر ملف فيديو');
      return;
    }
    setPhase('uploading');
    busyRef.current = true;
    setProgress(0);
    abortRef.current = new AbortController();
    try {
      const upload = await bunnyAdminApi.createVideo(lesson.id, lesson.title);
      await tusUpload(file, upload, setProgress, abortRef.current.signal);
      // الربط بعد اكتمال الرفع فقط: الإلغاء/الفشل لا يمس الفيديو الحالي للحصة
      await adminCoursesApi.updateLesson(lesson.id, {
        bunnyVideoId: upload.videoId,
        videoProvider: 'BUNNY',
      });
      onChanged();
      setPhase('done');
      toast.success('تم رفع الفيديو — جاري المعالجة في Bunny');
      void statusQ.refetch();
    } catch (e) {
      setPhase('idle');
      if ((e as Error).name !== 'AbortError') {
        toast.error(e instanceof Error && !('isAxiosError' in e) ? e.message : apiErrorMessage(e));
      }
    } finally {
      busyRef.current = false;
    }
  };

  const status = statusQ.data;

  return (
    <div className="space-y-4">
      {lesson.bunnyVideoId && (
        <div className="rounded-2xl border border-ink-900/10 bg-paper-50 p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-ink-700">فيديو Bunny الحالي</span>
            <div className="flex items-center gap-2">
              {lesson.videoProvider !== 'BUNNY' && (
                <button
                  type="button"
                  className="btn-ghost px-3 py-1 text-xs"
                  onClick={() => activateM.mutate()}
                  disabled={activateM.isPending}
                >
                  اجعله المعروض
                </button>
              )}
              <button
                type="button"
                className="btn-icon h-8 w-8"
                onClick={() => void statusQ.refetch()}
                disabled={statusQ.isFetching}
                aria-label="تحديث الحالة"
                title="تحديث الحالة"
              >
                <RefreshCw size={14} className={statusQ.isFetching ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
          <div className="mt-1 truncate font-mono text-xs text-ink-400" dir="ltr">
            {lesson.bunnyVideoId}
          </div>
          <div className="mt-2 text-xs">
            {statusQ.isError ? (
              <span className="inline-flex items-center gap-1 text-coral-600">
                <AlertTriangle size={13} /> {apiErrorMessage(statusQ.error)}
              </span>
            ) : !status ? (
              <span className="text-ink-400">جاري فحص الحالة...</span>
            ) : status.ready ? (
              <span className="inline-flex items-center gap-1 font-semibold text-lime-700">
                <CheckCircle2 size={13} /> جاهز للتشغيل • {Math.round(status.durationSec / 60)} دقيقة
              </span>
            ) : status.status === 5 ? (
              <span className="inline-flex items-center gap-1 text-coral-600">
                <AlertTriangle size={13} /> فشلت المعالجة، أعد الرفع
              </span>
            ) : (
              <span className="text-ink-500">قيد المعالجة ({status.encodeProgress}٪)</span>
            )}
          </div>
        </div>
      )}

      <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-ink-900/15 p-6 text-center transition hover:border-brand-400 hover:bg-brand-50/40">
        <UploadCloud size={28} className="mx-auto mb-2 text-brand-500" />
        <span className="block text-sm font-semibold text-ink-700">
          {file ? file.name : lesson.bunnyVideoId ? 'اختر فيديو جديداً لاستبدال الحالي' : 'اختر ملف الفيديو'}
        </span>
        {file && (
          <span className="mt-1 block text-xs text-ink-400">{(file.size / 1024 / 1024).toFixed(1)} ميجابايت</span>
        )}
        <input
          type="file"
          accept="video/*"
          className="sr-only"
          disabled={phase === 'uploading'}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>

      {phase !== 'idle' && (
        <div>
          <div className="mb-1 flex justify-between text-xs font-semibold text-ink-500">
            <span>{phase === 'done' ? 'اكتمل الرفع' : 'جاري الرفع...'}</span>
            <span>{progress}٪</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-ink-50">
            <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3">
        {phase === 'uploading' && (
          <button type="button" className="btn-ghost" onClick={() => abortRef.current?.abort()}>
            إلغاء الرفع
          </button>
        )}
        <button type="button" className="btn-primary" onClick={start} disabled={!file || phase === 'uploading'}>
          {phase === 'uploading' ? <Spinner /> : <UploadCloud size={18} />} رفع إلى Bunny
        </button>
      </div>
    </div>
  );
}
