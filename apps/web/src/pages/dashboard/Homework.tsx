import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from '../../components/ui/notify';
import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  FileText,
  Info,
  MessageSquareText,
  Paperclip,
  RefreshCw,
  Upload,
} from 'lucide-react';
import {
  HOMEWORK_POLICY,
  UPLOAD_LIMITS,
  type HomeworkItemDTO,
  type HomeworkStatus,
  type HomeworkTab,
} from '@miss-ann/shared';
import { PageTitle } from '../../components/ui/StatCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { Pager } from '../../components/ui/Pager';
import { Spinner } from '../../components/ui/Spinner';
import { FileDropzone } from '../../features/homework/FileDropzone';
import { PrivateFileModal } from '../../features/homework/PrivateFileModal';
import { attachmentFileUrl, homeworkApi, submissionFileUrl } from '../../features/homework/api';
import { apiErrorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';

type PreviewFile = { url: string; name: string; mime: string };

const TABS: [HomeworkTab, string][] = [
  ['REQUIRED', 'المطلوبة'],
  ['SUBMITTED', 'المسلَّمة'],
  ['GRADED', 'المصحَّحة'],
];

const EMPTY: Record<HomeworkTab, [string, string]> = {
  REQUIRED: ['لا توجد واجبات مطلوبة', 'أحسنت! كل واجباتك مسلَّمة. الواجبات الجديدة تظهر هنا فور نشرها.'],
  SUBMITTED: ['لا توجد تسليمات بانتظار التصحيح', 'بعد رفع حل أي واجب ستجده هنا حتى تصحّحه المس.'],
  GRADED: ['لا توجد واجبات مصحَّحة بعد', 'درجاتك وملاحظات المس تظهر هنا بعد التصحيح.'],
};

export function HomeworkPage() {
  const [tab, setTab] = useState<HomeworkTab>('REQUIRED');
  const [page, setPage] = useState(1);
  const [uploading, setUploading] = useState<HomeworkItemDTO | null>(null);
  const [preview, setPreview] = useState<PreviewFile | null>(null);

  const listQ = useQuery({
    queryKey: ['homework', tab, page],
    queryFn: () => homeworkApi.list({ tab, page }),
    placeholderData: (prev) => prev,
    staleTime: 0,
  });
  const data = listQ.data;

  return (
    <div className="space-y-6">
      <PageTitle title="الواجبات" subtitle="حلّ واجبك، ارفعه صورة أو PDF، وشوف درجتك وملاحظات المس." />

      <div className="flex items-start gap-2 rounded-3xl border border-ink-900/10 bg-white p-4 text-sm leading-6 text-ink-600">
        <Info size={18} className="mt-0.5 shrink-0 text-brand-500" />
        <p>
          {HOMEWORK_POLICY.resubmitUntilGraded
            ? 'تقدر تغيّر ملف الحل أي وقت لحد ما المس تصحّحه — بعد التصحيح التسليم بيتقفل.'
            : 'التسليم مرة واحدة فقط — راجع حلك قبل الرفع.'}{' '}
          {HOMEWORK_POLICY.allowLate
            ? 'التسليم بعد الموعد مقبول لكن بيظهر للمس إنه «متأخر».'
            : 'بعد انتهاء الموعد مش هتقدر تسلّم.'}
        </p>
      </div>

      <div className="flex max-w-full overflow-x-auto">
        <div className="inline-flex shrink-0 rounded-full border border-ink-900/10 bg-white p-1" role="tablist">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => {
                setTab(key);
                setPage(1);
              }}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition sm:px-5 ${
                tab === key ? 'bg-ink-900 text-paper' : 'text-ink-600 hover:text-ink-900'
              }`}
            >
              {label} {data && <span className="tabular-nums opacity-70">({data.counts[key]})</span>}
            </button>
          ))}
        </div>
      </div>

      {listQ.isPending ? (
        <div className="grid place-items-center py-20">
          <Spinner className="h-8 w-8 text-brand-500" />
        </div>
      ) : listQ.isError ? (
        <EmptyState icon={AlertTriangle} title="تعذّر تحميل الواجبات" text={apiErrorMessage(listQ.error)} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState icon={FileText} title={EMPTY[tab][0]} text={EMPTY[tab][1]} />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {data.items.map((h) => (
              <HomeworkCard key={h.id} hw={h} onUpload={() => setUploading(h)} onPreview={setPreview} />
            ))}
          </div>
          <Pager page={data.page} totalPages={data.totalPages} total={data.total} onChange={setPage} />
        </>
      )}

      <UploadModal hw={uploading} onClose={() => setUploading(null)} />
      <PrivateFileModal file={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

const STATUS_TAGS: Record<HomeworkStatus, [string, string]> = {
  REQUIRED: ['مطلوب', 'bg-paper-100 text-ink-600'],
  LATE: ['فات الموعد', 'bg-coral-100 text-coral-700'],
  SUBMITTED: ['تم التسليم', 'bg-lime-200 text-ink-900'],
  GRADED: ['تم التصحيح', 'bg-lime-200 text-ink-900'],
};

function HomeworkCard({
  hw,
  onUpload,
  onPreview,
}: {
  hw: HomeworkItemDTO;
  onUpload: () => void;
  onPreview: (f: PreviewFile) => void;
}) {
  const sub = hw.submission;
  const [label, cls] = STATUS_TAGS[hw.status];
  const canUpload = sub ? sub.canResubmit : hw.status === 'REQUIRED' || (hw.status === 'LATE' && HOMEWORK_POLICY.allowLate);

  return (
    <article className="card flex flex-col p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="tag bg-paper-100 text-ink-700">{hw.courseTitle}</span>
        <span className={`tag ${cls}`}>{label}</span>
        {sub?.isLate && <span className="tag bg-coral-100 text-coral-700">متأخر</span>}
      </div>
      <h3 className="mt-3 font-display text-xl font-extrabold text-ink-900">{hw.title}</h3>
      {hw.description && <p className="mt-1 whitespace-pre-line text-sm leading-6 text-ink-500">{hw.description}</p>}

      <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-600">
        {hw.lessonTitle && (
          <div className="inline-flex items-center gap-1.5">
            <BookOpen size={16} className="text-ink-400" /> {hw.lessonTitle}
          </div>
        )}
        {hw.dueAt && (
          <div className={`inline-flex items-center gap-1.5 ${hw.status === 'LATE' ? 'font-semibold text-coral-700' : ''}`}>
            <CalendarClock size={16} className={hw.status === 'LATE' ? '' : 'text-ink-400'} /> التسليم حتى {formatDateTime(hw.dueAt)}
          </div>
        )}
        <div className="inline-flex items-center gap-1.5">
          <CheckCircle2 size={16} className="text-ink-400" /> من {hw.maxGrade} درجات
        </div>
      </dl>

      {hw.attachment && (
        <button
          type="button"
          className="mt-4 inline-flex w-fit items-center gap-2 rounded-full bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-100"
          onClick={() => onPreview({ url: attachmentFileUrl(hw.id), ...hw.attachment! })}
        >
          <Paperclip size={16} /> ورقة الواجب
        </button>
      )}

      {sub && (
        <div className="mt-4 rounded-3xl border border-ink-900/10 bg-paper-50 p-4">
          <button
            type="button"
            className="flex w-full min-w-0 items-center gap-2 text-right text-sm font-semibold text-ink-800 hover:text-brand-600"
            onClick={() => onPreview({ url: submissionFileUrl(sub.id), name: sub.fileName, mime: sub.fileMime })}
          >
            <FileText size={16} className="shrink-0" />
            <span className="truncate" dir="auto">
              {sub.fileName}
            </span>
          </button>
          <div className="mt-1 text-xs text-ink-400">سلّمته {formatDateTime(sub.submittedAt)}</div>
          {sub.grade !== null && (
            <div className="mt-4 border-t border-ink-900/[0.06] pt-4">
              <div className="flex items-baseline gap-2">
                <span className="font-display text-3xl font-extrabold text-ink-900 tabular-nums">
                  {sub.grade}/{hw.maxGrade}
                </span>
                <span className="text-sm text-ink-500">درجتك</span>
              </div>
              {sub.feedback && (
                <p className="mt-2 flex gap-2 text-sm leading-6 text-ink-700">
                  <MessageSquareText size={16} className="mt-1 shrink-0 text-brand-500" />
                  <span className="whitespace-pre-line">{sub.feedback}</span>
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {canUpload && (
        <div className="mt-auto pt-5">
          <button type="button" className={sub ? 'btn-ghost w-full sm:w-auto' : 'btn-primary w-full sm:w-auto'} onClick={onUpload}>
            {sub ? <RefreshCw size={17} /> : <Upload size={18} />} {sub ? 'استبدال الملف' : 'رفع الحل'}
          </button>
        </div>
      )}
    </article>
  );
}

function UploadModal({ hw, onClose }: { hw: HomeworkItemDTO | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);

  const close = () => {
    if (submitM.isPending) return;
    setFile(null);
    setProgress(0);
    onClose();
  };
  const submitM = useMutation({
    mutationFn: () => homeworkApi.submit(hw!.id, file!, setProgress),
    onSuccess: (s) => {
      toast.success(s.isLate ? 'تم التسليم — مسجَّل كمتأخر' : 'تم تسليم الواجب');
      void qc.invalidateQueries({ queryKey: ['homework'] });
      setFile(null);
      setProgress(0);
      onClose();
    },
    onError: (e) => {
      setProgress(0);
      toast.error(apiErrorMessage(e, 'تعذّر رفع الملف'));
      // 409 (صُحِّح أثناء فتح النافذة) أو 404 (حُذف الواجب/انتهى الاشتراك): الحالة المعروضة قديمة
      if (axios.isAxiosError(e) && (e.response?.status === 409 || e.response?.status === 404)) {
        void qc.invalidateQueries({ queryKey: ['homework'] });
        setFile(null);
        onClose();
      }
    },
  });

  const late = hw?.dueAt ? Date.now() > Date.parse(hw.dueAt) : false;
  return (
    <Modal open={hw !== null} onClose={close} title={hw?.submission ? 'استبدال ملف الحل' : 'رفع الحل'}>
      {hw && (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (file) submitM.mutate();
          }}
        >
          <div className="rounded-3xl border border-ink-900/10 bg-paper-50 p-4">
            <div className="font-semibold text-ink-900">{hw.title}</div>
            <div className="mt-1 text-sm text-ink-500">{hw.courseTitle}</div>
          </div>
          <FileDropzone file={file} onChange={setFile} maxBytes={UPLOAD_LIMITS.homeworkMaxBytes} disabled={submitM.isPending} />
          {late && (
            <p className="flex items-center gap-2 text-sm font-semibold text-coral-700">
              <AlertTriangle size={16} /> موعد التسليم فات — هيظهر إن التسليم متأخر.
            </p>
          )}
          {hw.submission && (
            <p className="text-sm text-ink-500">الملف الجديد هيحلّ محل «{hw.submission.fileName}».</p>
          )}
          {submitM.isPending && (
            <div className="space-y-1">
              <div className="h-2.5 overflow-hidden rounded-full bg-paper-100" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-brand-500 transition-[width]" style={{ width: `${progress}%` }} />
              </div>
              <div className="text-xs text-ink-400 tabular-nums">{progress < 100 ? `جارٍ الرفع ${progress}%` : 'جارٍ الحفظ...'}</div>
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button type="button" className="btn-ghost" onClick={close} disabled={submitM.isPending}>
              إلغاء
            </button>
            <button type="submit" className="btn-primary" disabled={!file || submitM.isPending}>
              {submitM.isPending ? <Spinner /> : <Upload size={18} />} تسليم
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
