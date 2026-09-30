import { Link } from 'react-router-dom';
import { CheckCircle2, Users, ClipboardCheck, ShieldCheck, Lightbulb, ArrowUpLeft } from 'lucide-react';
import { PLATFORM } from '@miss-ann/shared';
import { MicroscopeArt, LeafArt } from '../components/ScienceArt';

const values = [
  { icon: Lightbulb, title: 'شرح خطوة بخطوة', desc: 'شرح مبسّط يناسب سن الطفل ويبني المعلومة على اللي قبلها.' },
  { icon: Users, title: 'شراكة مع ولي الأمر', desc: 'متابعة مستمرة لمستوى الطالب وإشعارات بكل نتيجة.' },
  { icon: ClipboardCheck, title: 'تثبيت بالتدريب', desc: 'واجبات وامتحانات دورية بعد كل جزء من المنهج.' },
  { icon: ShieldCheck, title: 'بيئة آمنة', desc: 'محتوى محمي وخصوصية كاملة لبيانات الطلاب.' },
];

export function About() {
  return (
    <div className="container-app pt-10">
      <section className="grid items-center gap-10 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <span className="eyebrow">عن المنصة</span>
          <h1 className="mt-4 font-display text-5xl font-extrabold leading-[1.2] text-ink-900">
            أهلاً، أنا <span className="marker">{PLATFORM.name}</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-ink-500">
            مدرّسة علوم متخصصة في تدريس المرحلة الابتدائية (الصف الرابع والخامس والسادس). مؤمنة إن العلوم مادة
            ممتعة يمكن تبسيطها للأطفال بأسلوب قصصي وتجارب مصوّرة تربط المعلومة بالحياة اليومية.
          </p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {['شرح مبسّط يناسب سن الطفل', 'متابعة مستمرة مع ولي الأمر', 'واجبات وامتحانات دورية', 'محتوى آمن ومحمي'].map((t) => (
              <li key={t} className="flex items-center gap-2.5 text-ink-700">
                <CheckCircle2 size={19} className="shrink-0 text-brand-500" /> {t}
              </li>
            ))}
          </ul>
          <Link to="/courses" className="btn-dark mt-10">
            شوف الكورسات <ArrowUpLeft size={16} />
          </Link>
        </div>

        <div className="relative mx-auto aspect-[4/5] w-full max-w-sm">
          <div className="absolute inset-0 rotate-3 rounded-4xl border-2 border-ink-900 bg-coral-200" />
          <div className="absolute inset-0 -rotate-2 overflow-hidden rounded-4xl border-2 border-ink-900 bg-lime-200">
            <div className="absolute inset-0 bg-grid" />
            <MicroscopeArt className="absolute inset-x-0 top-1/2 mx-auto w-52 -translate-y-1/2" />
            <LeafArt className="absolute bottom-6 left-6 w-14" />
            <div className="absolute bottom-6 right-6 rounded-2xl bg-white px-4 py-2 text-sm shadow-soft">
              <div className="font-display text-lg font-extrabold text-ink-900">٤ · ٥ · ٦</div>
              <div className="text-xs text-ink-400">صفوف المرحلة الابتدائية</div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-24 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {values.map((v, i) => (
          <div key={v.title} className="card p-6">
            <div className="flex items-center justify-between">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-ink-900 text-lime-300">
                <v.icon size={20} />
              </span>
              <span className="font-display text-3xl font-extrabold text-ink-900/10">0{i + 1}</span>
            </div>
            <h3 className="mt-6 text-xl font-extrabold text-ink-900">{v.title}</h3>
            <p className="mt-1.5 text-sm leading-6 text-ink-500">{v.desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
