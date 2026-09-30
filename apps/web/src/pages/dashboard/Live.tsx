import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BellRing, CalendarClock, Lock, Timer, Video } from 'lucide-react';
import { LIVE_JOIN_EARLY_MIN, LIVE_PROVIDER_LABELS, LIVE_REMINDER_BEFORE_MIN, type LiveSessionDTO } from '@miss-ann/shared';
import { PageTitle } from '../../components/ui/StatCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { Pager } from '../../components/ui/Pager';
import { Spinner } from '../../components/ui/Spinner';
import { liveApi } from '../../features/live/api';
import { apiErrorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';

// أقصى تأخير يقبله setTimeout (~24.8 يوم)
const MAX_TIMEOUT = 2_147_000_000;

export function LivePage() {
  const [page, setPage] = useState(1);
  const listQ = useQuery({
    queryKey: ['live', page],
    queryFn: () => liveApi.list(page),
    placeholderData: (prev) => prev,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 5 * 60_000,
  });
  const data = listQ.data;
  // فرق ساعة الجهاز عن الخادم: العدّاد وزر الانضمام يتبعان وقت الخادم لا الجهاز
  const offset = data ? Date.parse(data.serverNow) - listQ.dataUpdatedAt : 0;

  // إعادة الجلب عند أقرب حدّ (فتح نافذة الانضمام، البداية، نهاية الحصة) ← الخادم يرسل joinUrl أو يحجبه،
  // والبطاقة تتحوّل لـ«مباشر الآن» عند البداية بدل عدّاد واقف على الصفر
  const { refetch } = listQ;
  useEffect(() => {
    if (!data) return;
    const now = Date.now() + offset;
    const next = data.items
      .flatMap((s) => [s.joinOpensAt, s.startAt, s.endsAt].map(Date.parse))
      .filter((t) => t > now)
      .sort((a, b) => a - b)[0];
    if (next === undefined) return;
    const timer = setTimeout(() => void refetch(), Math.min(next - now + 1000, MAX_TIMEOUT));
    return () => clearTimeout(timer);
  }, [data, offset, refetch]);

  return (
    <div className="space-y-6">
      <PageTitle title="الحصص اللايف" subtitle="حصص مباشرة مع المس — ادخل في الموعد واسأل كل اللي في بالك." />

      <div className="flex items-start gap-2 rounded-3xl border border-ink-900/10 bg-white p-4 text-sm leading-6 text-ink-600">
        <BellRing size={18} className="mt-0.5 shrink-0 text-brand-500" />
        <p>
          زر الانضمام بيفتح قبل الحصة بـ {LIVE_JOIN_EARLY_MIN} دقيقة، وهيوصلك تذكير قبلها بـ {LIVE_REMINDER_BEFORE_MIN} دقيقة.
        </p>
      </div>

      {listQ.isPending ? (
        <div className="grid place-items-center py-20">
          <Spinner className="h-8 w-8 text-brand-500" />
        </div>
      ) : listQ.isError ? (
        <EmptyState icon={AlertTriangle} title="تعذّر تحميل الحصص" text={apiErrorMessage(listQ.error)} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState icon={Video} title="لا توجد حصص لايف قادمة" text="الحصص المجدولة لكورساتك هتظهر هنا مع عدّاد لحد موعدها." />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {data.items.map((s) => (
              <LiveCard key={s.id} s={s} offset={offset} />
            ))}
          </div>
          <Pager page={data.page} totalPages={data.totalPages} total={data.total} onChange={setPage} />
        </>
      )}
    </div>
  );
}

function LiveCard({ s, offset }: { s: LiveSessionDTO; offset: number }) {
  const live = s.state === 'OPEN' && Date.now() + offset >= Date.parse(s.startAt);
  return (
    <article className="card flex flex-col p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="tag bg-paper-100 text-ink-700">{s.courseTitle}</span>
        {live ? (
          <span className="tag bg-lime-300 text-ink-900">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ink-900 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-ink-900" />
            </span>
            مباشر الآن
          </span>
        ) : s.state === 'OPEN' ? (
          <span className="tag bg-lime-200 text-ink-900">الانضمام متاح</span>
        ) : (
          <span className="tag bg-brand-50 text-brand-700">قادمة</span>
        )}
        <span className="tag bg-paper-100 text-ink-500">{LIVE_PROVIDER_LABELS[s.provider]}</span>
      </div>
      <h3 className="mt-3 font-display text-xl font-extrabold text-ink-900">{s.title}</h3>
      <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-600">
        <div className="inline-flex items-center gap-1.5">
          <CalendarClock size={16} className="text-ink-400" /> {formatDateTime(s.startAt)}
        </div>
        <div className="inline-flex items-center gap-1.5">
          <Timer size={16} className="text-ink-400" /> {s.durationMin} دقيقة
        </div>
      </dl>

      {!live && (
        <div className="mt-4 rounded-3xl bg-paper-50 p-4">
          <div className="text-xs text-ink-400">تبدأ بعد</div>
          <Countdown to={Date.parse(s.startAt)} offset={offset} />
        </div>
      )}

      <div className="mt-auto pt-5">
        {s.joinUrl ? (
          <a href={s.joinUrl} target="_blank" rel="noopener noreferrer" className="btn-accent w-full sm:w-auto">
            <Video size={18} /> انضم للحصة
          </a>
        ) : (
          <button type="button" className="btn-ghost w-full sm:w-auto" disabled>
            <Lock size={17} /> الانضمام يفتح {formatDateTime(s.joinOpensAt)}
          </button>
        )}
      </div>
    </article>
  );
}

// عدّاد مستقل: الثانية تعيد رسم هذا المكوّن فقط لا الصفحة
function Countdown({ to, offset }: { to: number; offset: number }) {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(t);
  }, [offset]);
  const left = Math.max(0, to - now);
  const sec = Math.floor(left / 1000);
  const d = Math.floor(sec / 86400);
  const hh = String(Math.floor((sec % 86400) / 3600)).padStart(2, '0');
  const mm = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');
  return (
    <div className="mt-1 font-display text-2xl font-extrabold text-ink-900 tabular-nums" dir="ltr" aria-live="off">
      {d > 0 && <span className="text-base font-bold text-ink-500">{d} {d === 1 ? 'يوم' : d === 2 ? 'يومين' : 'أيام'} · </span>}
      {hh}:{mm}:{ss}
    </div>
  );
}
