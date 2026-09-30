import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import axios from 'axios';
import { toast } from '../../components/ui/notify';
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardCheck, Eye, FileText, Hourglass, Inbox, PenLine } from 'lucide-react';
import type { AdminHomeworkDTO, AdminSubmissionDTO } from '@miss-ann/shared';
import { PageTitle, StatCard } from '../../components/ui/StatCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { Field } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { Pager } from '../../components/ui/Pager';
import { Spinner } from '../../components/ui/Spinner';
import { PrivateFileModal } from '../../features/homework/PrivateFileModal';
import { adminHomeworkApi, attachmentFileUrl, submissionFileUrl } from '../../features/homework/api';
import { apiErrorMessage } from '../../lib/api';
import { formatBytes, formatDateTime } from '../../lib/format';

type StatusFilter = 'PENDING' | 'GRADED' | undefined;
type PreviewFile = { url: string; name: string; mime: string };

export function AdminHomeworkSubmissions() {
  const id = Number(useParams().id);
  const [page, setPage] = useState(1);
  const [params, setParams] = useSearchParams();
  const status: StatusFilter = params.get('status') === 'GRADED' ? 'GRADED' : params.get('status') === 'ALL' ? undefined : 'PENDING';
  const [grading, setGrading] = useState<AdminSubmissionDTO | null>(null);
  const [preview, setPreview] = useState<PreviewFile | null>(null);

  const hwQ = useQuery({ queryKey: ['admin', 'homework', 'detail', id], queryFn: () => adminHomeworkApi.detail(id), staleTime: 0 });
  const subsQ = useQuery({
    queryKey: ['admin', 'homework', 'submissions', id, status ?? 'ALL', page],
    queryFn: () => adminHomeworkApi.submissions(id, { status, page }),
    placeholderData: (p) => p,
    staleTime: 0,
  });

  if (hwQ.isPending) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner className="h-8 w-8 text-brand-500" />
      </div>
    );
  }
  if (hwQ.isError) return <EmptyState icon={AlertTriangle} title="تعذّر تحميل الواجب" text={apiErrorMessage(hwQ.error)} />;
  const hw = hwQ.data;
  const pending = hw.submissionsCount - hw.gradedCount;
  const data = subsQ.data;

  return (
    <div className="space-y-6">
      <Link to="/admin/homework" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-900">
        <ArrowRight size={16} /> كل الواجبات
      </Link>
      <PageTitle
        title={hw.title}
        subtitle={`${hw.courseTitle}${hw.lessonTitle ? ` · ${hw.lessonTitle}` : ''}${hw.dueAt ? ` · التسليم حتى ${formatDateTime(hw.dueAt)}` : ''}`}
        action={
          hw.attachment && (
            <button type="button" className="btn-ghost" onClick={() => setPreview({ url: attachmentFileUrl(hw.id), ...hw.attachment! })}>
              <FileText size={17} /> ورقة الواجب
            </button>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="التسليمات" value={String(hw.submissionsCount)} icon={Inbox} tone="ink" />
        <StatCard label="بانتظار التصحيح" value={String(pending)} icon={Hourglass} tone="coral" />
        <StatCard label="مصحّحة" value={String(hw.gradedCount)} icon={CheckCircle2} tone="lime" />
      </div>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-900/[0.06] p-5">
          <h2 className="font-display text-xl font-extrabold text-ink-900">حلول الطلاب</h2>
          <div className="flex max-w-full overflow-x-auto">
            <div className="inline-flex shrink-0 rounded-full border border-ink-900/10 bg-paper-50 p-1" role="tablist">
              {(
                [
                  ['PENDING', 'بانتظار التصحيح'],
                  ['GRADED', 'مصحّحة'],
                  ['ALL', 'الكل'],
                ] as const
              ).map(([key, label]) => {
                const active = (status ?? 'ALL') === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setParams(key === 'PENDING' ? {} : { status: key }, { replace: true });
                      setPage(1);
                    }}
                    className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                      active ? 'bg-ink-900 text-paper' : 'text-ink-600 hover:text-ink-900'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {subsQ.isPending ? (
          <div className="grid place-items-center py-16">
            <Spinner className="h-7 w-7 text-brand-500" />
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={ClipboardCheck}
              title={status === 'PENDING' ? 'لا حلول بانتظار التصحيح' : 'لا توجد تسليمات هنا'}
              text={status === 'PENDING' ? 'كل الحلول المسلَّمة مصحّحة. الحلول الجديدة تظهر هنا أولاً بأول.' : 'تظهر حلول الطلاب هنا فور رفعها.'}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-right">
              <thead className="bg-paper-50">
                <tr className="border-b border-ink-900/[0.06] text-xs text-ink-400">
                  <th className="p-4 font-semibold">الطالب</th>
                  <th className="p-4 font-semibold">التسليم</th>
                  <th className="p-4 font-semibold">الملف</th>
                  <th className="p-4 font-semibold">الدرجة</th>
                  <th className="p-4 font-semibold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((s) => (
                  <tr key={s.id} className="border-b border-ink-900/[0.06] last:border-0 hover:bg-paper-50">
                    <td className="p-4">
                      <div className="font-semibold text-ink-800">{s.user.name}</div>
                      <div className="text-xs text-ink-400 tabular-nums" dir="ltr">
                        {s.user.phone}
                      </div>
                    </td>
                    <td className="p-4 text-sm text-ink-600">
                      <div className="whitespace-nowrap">{formatDateTime(s.submittedAt)}</div>
                      {s.isLate && <span className="tag mt-1 bg-coral-100 text-coral-700">متأخر</span>}
                    </td>
                    <td className="p-4">
                      <button
                        type="button"
                        className="inline-flex max-w-[14rem] items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700"
                        onClick={() => setPreview({ url: submissionFileUrl(s.id), name: s.fileName, mime: s.fileMime })}
                      >
                        <Eye size={16} className="shrink-0" />
                        <span className="truncate" dir="auto">
                          {s.fileName}
                        </span>
                      </button>
                      <div className="text-xs text-ink-400">{formatBytes(s.fileSize)}</div>
                    </td>
                    <td className="p-4">
                      {s.grade !== null ? (
                        <span className="tag bg-lime-200 text-ink-900 tabular-nums">
                          {s.grade}/{hw.maxGrade}
                        </span>
                      ) : (
                        <span className="tag bg-paper-100 text-ink-600">لم يُصحَّح</span>
                      )}
                    </td>
                    <td className="p-4">
                      <button type="button" className={s.grade === null ? 'btn-primary px-4 py-2 text-sm' : 'btn-ghost px-4 py-2 text-sm'} onClick={() => setGrading(s)}>
                        <PenLine size={16} /> {s.grade === null ? 'صحّحي' : 'تعديل الدرجة'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && (
          <div className="px-5 pb-4">
            <Pager page={data.page} totalPages={data.totalPages} total={data.total} onChange={setPage} />
          </div>
        )}
      </section>

      <GradeModal hw={hw} submission={grading} onClose={() => setGrading(null)} onPreview={setPreview} />
      <PrivateFileModal file={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

function GradeModal({
  hw,
  submission,
  onClose,
  onPreview,
}: {
  hw: AdminHomeworkDTO;
  submission: AdminSubmissionDTO | null;
  onClose: () => void;
  onPreview: (f: PreviewFile) => void;
}) {
  return (
    <Modal open={submission !== null} onClose={onClose} title="تصحيح الحل">
      {submission && <GradeForm key={submission.id} hw={hw} s={submission} onDone={onClose} onPreview={onPreview} />}
    </Modal>
  );
}

function GradeForm({
  hw,
  s,
  onDone,
  onPreview,
}: {
  hw: AdminHomeworkDTO;
  s: AdminSubmissionDTO;
  onDone: () => void;
  onPreview: (f: PreviewFile) => void;
}) {
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ grade: string; feedback: string }>({
    defaultValues: { grade: s.grade === null ? '' : String(s.grade), feedback: s.feedback },
  });
  const gradeM = useMutation({
    mutationFn: (v: { grade: number; feedback: string }) => adminHomeworkApi.grade(hw.id, s.id, { ...v, submittedAt: s.submittedAt }),
    onSuccess: () => {
      toast.success('تم حفظ الدرجة');
      // التفاصيل (العدّادات) + قوائم التسليمات + قائمة الواجبات
      void qc.invalidateQueries({ queryKey: ['admin', 'homework'] });
      onDone();
    },
    onError: (e) => {
      toast.error(apiErrorMessage(e));
      // الطالب استبدل الملف: نحدّث القائمة ونغلق ليفتح الحل الجديد
      if (axios.isAxiosError(e) && e.response?.status === 409) {
        void qc.invalidateQueries({ queryKey: ['admin', 'homework'] });
        onDone();
      }
    },
  });

  return (
    <form
      className="space-y-4"
      onSubmit={handleSubmit((v) => gradeM.mutate({ grade: Number(v.grade), feedback: v.feedback.trim() }))}
    >
      <div className="rounded-3xl border border-ink-900/10 bg-paper-50 p-4">
        <div className="font-semibold text-ink-900">{s.user.name}</div>
        <button
          type="button"
          className="mt-1 inline-flex max-w-full items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700"
          onClick={() => onPreview({ url: submissionFileUrl(s.id), name: s.fileName, mime: s.fileMime })}
        >
          <Eye size={16} className="shrink-0" />
          <span className="truncate" dir="auto">
            فتح الحل: {s.fileName}
          </span>
        </button>
        {s.isLate && <div className="mt-1 text-xs font-semibold text-coral-700">سُلِّم بعد الموعد</div>}
      </div>
      <Field label={`الدرجة (من ${hw.maxGrade})`} error={errors.grade?.message}>
        <input
          type="number"
          inputMode="numeric"
          className="input"
          autoFocus
          {...register('grade', {
            required: 'اكتبي الدرجة',
            validate: (v) => (Number.isInteger(Number(v)) && +v >= 0 && +v <= hw.maxGrade) || `رقم صحيح من 0 إلى ${hw.maxGrade}`,
          })}
        />
      </Field>
      <Field label="ملاحظات للطالب (اختياري)" error={errors.feedback?.message}>
        <textarea className="input min-h-24" maxLength={1000} placeholder="برافو! راجع رسم الجدار الخلوي." {...register('feedback')} />
      </Field>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" className="btn-ghost" onClick={onDone} disabled={gradeM.isPending}>
          إلغاء
        </button>
        <button type="submit" className="btn-primary" disabled={gradeM.isPending}>
          {gradeM.isPending && <Spinner />} حفظ الدرجة
        </button>
      </div>
    </form>
  );
}
