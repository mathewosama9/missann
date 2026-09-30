import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts';
import { formatEGP, type AdminStatsDTO } from '@miss-ann/shared';

// ── رسوم لوحة الأدمن ────────────────────────────────────────────
// لونان فقط بترتيب ثابت (فُحصا لعمى الألوان والتباين على الأبيض): السلسلة الأولى أزرق، الثانية مرجاني.
// محور واحد لكل رسم، علامات رفيعة، شبكة باهتة، مفتاح ألوان دائم + تلميح عند المرور + عرض كجدول.
const SERIES = ['#3D55F5', '#F4643B'] as const;
const GRID = '#ECE3CC';
const AXIS = '#6F7697';

type Daily = AdminStatsDTO['daily'][number];
interface Series {
  key: keyof Omit<Daily, 'day'>;
  label: string;
}

const dayLabel = (day: string) => {
  const [, m, d] = day.split('-');
  return `${Number(d)}/${Number(m)}`;
};
const longDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' });
const compactEgp = (piastres: number) => (piastres / 100).toLocaleString('ar-EG', { notation: 'compact' });

function Legend({ series }: { series: readonly Series[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
      {series.map((s, i) => (
        <li key={s.key} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: SERIES[i] }} aria-hidden="true" />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function ChartTooltip({ active, payload, label, series, money }: TooltipProps<number, string> & { series: readonly Series[]; money: boolean }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]!.payload as Daily;
  const fmt = money ? formatEGP : (n: number) => n.toLocaleString('ar-EG');
  return (
    <div dir="rtl" className="rounded-2xl border border-ink-900/10 bg-white px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold text-ink-900">{longDay(String(label))}</div>
      {series.map((s, i) => (
        <div key={s.key} className="flex items-center justify-between gap-4 text-ink-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: SERIES[i] }} aria-hidden="true" />
            {s.label}
          </span>
          <span className="font-semibold tabular-nums text-ink-900">{fmt(row[s.key])}</span>
        </div>
      ))}
      {money && (
        <div className="mt-1 flex justify-between gap-4 border-t border-ink-900/[0.06] pt-1 text-ink-500">
          <span>الإجمالي</span>
          <span className="font-semibold tabular-nums text-ink-900">{formatEGP(series.reduce((t, s) => t + row[s.key], 0))}</span>
        </div>
      )}
    </div>
  );
}

// الجدول البديل للرسم (قارئ الشاشة / الطباعة / من يفضّل الأرقام)
function DataTable({ data, series, money }: { data: Daily[]; series: readonly Series[]; money: boolean }) {
  const fmt = money ? formatEGP : (n: number) => n.toLocaleString('ar-EG');
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-xs font-semibold text-brand-600">عرض الأرقام كجدول</summary>
      <div className="mt-2 max-h-64 overflow-auto rounded-2xl border border-ink-900/[0.06]">
        <table className="w-full text-right text-xs">
          <thead className="sticky top-0 bg-paper-50 text-ink-400">
            <tr>
              <th className="p-2 font-semibold">اليوم</th>
              {series.map((s) => (
                <th key={s.key} className="p-2 font-semibold">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...data].reverse().map((r) => (
              <tr key={r.day} className="border-t border-ink-900/[0.06]">
                <td className="p-2 text-ink-500">{dayLabel(r.day)}</td>
                {series.map((s) => (
                  <td key={s.key} className="p-2 tabular-nums text-ink-800">
                    {fmt(r[s.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

const REVENUE: readonly Series[] = [
  { key: 'online', label: 'دفع أونلاين' },
  { key: 'codes', label: 'كروت شحن' },
];
const ACTIVITY: readonly Series[] = [
  { key: 'enrollments', label: 'اشتراكات جديدة' },
  { key: 'students', label: 'طلاب جدد' },
];

const axisProps = { stroke: AXIS, fontSize: 11, tickLine: false, axisLine: false } as const;

// إيراد يومي مكدّس (أونلاين + كروت) — فجوة 2px بين الجزأين، وحافة مستديرة أعلى العمود فقط
export function RevenueChart({ data }: { data: Daily[] }) {
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-extrabold text-ink-900">الإيراد اليومي — آخر 30 يوماً</h2>
        <Legend series={REVENUE} />
      </div>
      <div dir="ltr" className="mt-4 h-64" role="img" aria-label="رسم الإيراد اليومي لآخر 30 يوماً">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="20%">
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="day" tickFormatter={dayLabel} interval="preserveStartEnd" minTickGap={16} {...axisProps} />
            <YAxis tickFormatter={compactEgp} width={44} {...axisProps} />
            <Tooltip cursor={{ fill: 'rgba(19,22,41,0.04)' }} content={<ChartTooltip series={REVENUE} money />} />
            <Bar dataKey="online" stackId="rev" fill={SERIES[0]} stroke="#fff" strokeWidth={2} />
            <Bar dataKey="codes" stackId="rev" fill={SERIES[1]} stroke="#fff" strokeWidth={2} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTable data={data} series={REVENUE} money />
    </div>
  );
}

// الاشتراكات والطلاب الجدد يومياً (نفس الوحدة: عدد) — خطان 2px ونقطة عند المرور فقط
export function ActivityChart({ data }: { data: Daily[] }) {
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-extrabold text-ink-900">النشاط اليومي</h2>
        <Legend series={ACTIVITY} />
      </div>
      <div dir="ltr" className="mt-4 h-64" role="img" aria-label="رسم الاشتراكات والطلاب الجدد يومياً">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="day" tickFormatter={dayLabel} interval="preserveStartEnd" minTickGap={16} {...axisProps} />
            <YAxis allowDecimals={false} width={32} tickFormatter={(n: number) => n.toLocaleString('ar-EG')} {...axisProps} />
            <Tooltip cursor={{ stroke: AXIS, strokeDasharray: '3 3' }} content={<ChartTooltip series={ACTIVITY} money={false} />} />
            {ACTIVITY.map((s, i) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={SERIES[i]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <DataTable data={data} series={ACTIVITY} money={false} />
    </div>
  );
}
