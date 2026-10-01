import { Link } from 'react-router-dom';
// m = نسخة motion الخفيفة (الميزات من LazyMotion في main.tsx)
import { m as motion } from 'framer-motion';
import {
  PlayCircle,
  ShieldCheck,
  Timer,
  FileText,
  Star,
  ArrowUpLeft,
  ArrowLeft,
  UserPlus,
  Wallet,
  Rocket,
  Quote,
  Plus,
  BellRing,
  FlaskConical,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import { Grade, GRADE_SHORT, GRADE_LABELS, PLATFORM } from '@miss-ann/shared';
import { AtomArt, FlaskArt, LeafArt, Squiggle } from '../components/ScienceArt';
import { GRADE_META } from '../features/courses/gradeMeta';

const grades = [Grade.FOURTH_PRIMARY, Grade.FIFTH_PRIMARY, Grade.SIXTH_PRIMARY];

const gradeTopics: Record<Grade, string> = {
  FOURTH_PRIMARY: 'شرح المنهج شهرياً، كورسات تأسيس ومراجعات الترم.',
  FIFTH_PRIMARY: 'حصص مصوّرة وواجبات وامتحانات بعد كل جزء.',
  SIXTH_PRIMARY: 'تأسيس قوي ومراجعات نهائية قبل الامتحانات.',
};

const steps = [
  { icon: UserPlus, title: 'سجّل حساب الطالب', desc: 'بيانات بسيطة ورقم ولي الأمر للمتابعة.' },
  { icon: Wallet, title: 'اشحن المحفظة', desc: 'بكارت شحن أو دفع أونلاين في ثوانٍ.' },
  { icon: Rocket, title: 'ابدأ أول حصة', desc: 'اختر كورس صفّك وابدأ التجربة فوراً.' },
];

const stats = [
  { value: '+٥٠٠٠', label: 'طالب وطالبة' },
  { value: '+٢٠٠', label: 'حصة مصوّرة' },
  { value: '٣', label: 'صفوف دراسية' },
  { value: '٩٨٪', label: 'رضا أولياء الأمور' },
];

const testimonials = [
  { name: 'أم يوسف', grade: 'رابعة ابتدائي', text: 'ابني بقى بيحب العلوم وبيذاكر لوحده. شرح مس آن بسيط جداً.' },
  { name: 'أبو مالك', grade: 'سادسة ابتدائي', text: 'الامتحانات والمتابعة ممتازة، وبيوصلني درجة ابني أول بأول.' },
  { name: 'أم حبيبة', grade: 'خامسة ابتدائي', text: 'المنصة سهلة والفيديوهات واضحة. تجربة رائعة لبنتي.' },
];

const faqs = [
  { q: 'إزاي ابني يشترك في الكورس؟', a: 'يسجّل حساب جديد، يشحن المحفظة بكود أو أونلاين، ثم يشترك في كورس صفّه.' },
  { q: 'هل الفيديوهات تشتغل على الموبايل؟', a: 'نعم، المنصة تعمل على الموبايل والتابلت والكمبيوتر بجودة عالية.' },
  { q: 'هل ولي الأمر يتابع الدرجات؟', a: 'نعم، يصل لولي الأمر إشعار تلقائي بدرجة كل امتحان بعد انتهائه.' },
  { q: 'نسيت كلمة المرور، أعمل إيه؟', a: 'من صفحة الدخول اضغط "نسيت كلمة المرور" وسيصلك كود على الموبايل.' },
];

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.5, ease: 'easeOut' },
} as const;

export function Home() {
  return (
    <>
      <Hero />

      {/* اختر صفك */}
      <section className="container-app mt-24">
        <motion.div {...fadeUp} className="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <span className="eyebrow"><FlaskConical size={14} /> الجدول الدوري للصفوف</span>
            <h2 className="section-title mt-3">اختر خانتك في المعمل</h2>
          </div>
          <p className="max-w-sm text-ink-500">كل صف له منهجه وتجاربه ومراجعاته، مرتّبة شهرياً وبالترم.</p>
        </motion.div>

        <div className="grid gap-5 md:grid-cols-3">
          {grades.map((g, i) => {
            const m = GRADE_META[g];
            return (
              <motion.div key={g} {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.08 }}>
                <Link
                  to={`/courses?grade=${g}`}
                  className="card card-hover group relative flex h-full flex-col overflow-hidden p-6"
                >
                  <div className="flex items-start justify-between">
                    <div className={`relative grid h-24 w-24 place-items-center rounded-2xl border-2 border-ink-900 ${m.tile}`}>
                      <span className="absolute right-2 top-1.5 text-[10px] font-semibold opacity-90">{m.code}</span>
                      <span className="font-display text-5xl font-extrabold leading-none">{m.num}</span>
                      <span className="absolute bottom-1.5 text-[10px] font-semibold opacity-70">علوم</span>
                    </div>
                    <m.Art className="h-20 w-20 opacity-90 transition duration-500 group-hover:-rotate-6 group-hover:scale-110" />
                  </div>
                  <h3 className="mt-6 text-2xl font-extrabold text-ink-900">{GRADE_LABELS[g]}</h3>
                  <p className="mt-2 text-sm leading-6 text-ink-500">{gradeTopics[g]}</p>
                  <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-ink-900">
                    كورسات {GRADE_SHORT[g]}
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-ink-900 text-paper transition group-hover:-translate-x-1">
                      <ArrowLeft size={15} />
                    </span>
                  </span>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* المميزات — شبكة غير متماثلة */}
      <section className="container-app mt-28">
        <motion.div {...fadeUp} className="mb-10 max-w-2xl">
          <span className="eyebrow"><Sparkles size={14} /> ليه مس آن؟</span>
          <h2 className="section-title mt-3">كل اللي الطالب محتاجه… في دفتر واحد</h2>
        </motion.div>

        <div className="grid auto-rows-[minmax(180px,auto)] gap-5 md:grid-cols-6">
          <motion.div {...fadeUp} className="relative overflow-hidden rounded-4xl bg-ink-900 p-8 pb-40 text-paper md:col-span-4 md:row-span-2 md:pb-8">
            <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />
            <div className="relative z-10 flex h-full flex-col">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-lime-300 text-ink-900">
                <PlayCircle size={28} />
              </span>
              <h3 className="mt-6 max-w-md text-3xl font-extrabold leading-snug">
                فيديوهات قصيرة، كل واحد فيه فكرة واحدة واضحة
              </h3>
              <p className="mt-3 max-w-md leading-7 text-paper/65">
                شرح بأسلوب قصصي وتجارب مصوّرة تربط المعلومة بالحياة اليومية، بجودة عالية على أي جهاز.
              </p>
              <div className="mt-auto flex flex-wrap gap-2 pt-8 text-xs">
                {['تجارب عملية', 'رسوم توضيحية', 'تلخيص في آخر الحصة'].map((t) => (
                  <span key={t} className="rounded-full border border-paper/20 px-3 py-1.5 text-paper/80">{t}</span>
                ))}
              </div>
            </div>
            <AtomArt tone="dark" className="absolute -bottom-12 -left-10 w-52 opacity-90 md:-bottom-16 md:-left-16 md:w-80 md:opacity-95" />
          </motion.div>

          <Feature className="md:col-span-2 bg-lime-300" icon={FileText} title="مذكرات وواجبات" desc="ملف PDF وواجب لكل حصة لتثبيت المعلومة." />
          <Feature className="md:col-span-2 bg-coral-200" icon={Timer} title="امتحانات مؤقتة" desc="تصحيح فوري ومتابعة مستمرة للتقدّم." />
          <Feature className="md:col-span-2 bg-white" icon={BellRing} title="ولي الأمر في الصورة" desc="إشعار بالدرجة بعد كل امتحان مباشرةً." />
          <Feature className="md:col-span-2 bg-white" icon={ShieldCheck} title="محتوى محمي" desc="حماية الفيديوهات وخصوصية بيانات الطالب." />
          <Feature className="md:col-span-2 bg-brand-100" icon={Smartphone} title="من أي جهاز" desc="موبايل، تابلت أو كمبيوتر بنفس الجودة." />
        </div>
      </section>

      {/* خطوات البدء */}
      <section className="container-app mt-28">
        <div className="rounded-4xl border-2 border-dashed border-ink-900/20 p-6 sm:p-10">
          <motion.div {...fadeUp} className="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <span className="eyebrow">خطوات التجربة</span>
              <h2 className="section-title mt-3">ثلاث خطوات وتبدأ</h2>
            </div>
            <Link to="/register" className="btn-dark self-start md:self-auto">
              ابدأ الخطوة الأولى <ArrowUpLeft size={16} />
            </Link>
          </motion.div>
          <ol className="grid gap-6 md:grid-cols-3">
            {steps.map((s, i) => (
              <motion.li key={s.title} {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.1 }} className="relative">
                <div className="flex items-center gap-4">
                  <span className="font-display text-6xl font-extrabold leading-none text-ink-900/10">
                    {['١', '٢', '٣'][i]}
                  </span>
                  <span className="grid h-12 w-12 place-items-center rounded-full border-2 border-ink-900 bg-white text-ink-900">
                    <s.icon size={20} />
                  </span>
                  {i < steps.length - 1 && <Squiggle className="hidden h-4 flex-1 text-ink-900/20 md:block" />}
                </div>
                <h3 className="mt-5 text-xl font-extrabold text-ink-900">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-ink-500">{s.desc}</p>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      {/* أرقام */}
      <section className="container-app mt-20">
        <div className="grid grid-cols-2 border-y-2 border-ink-900 md:grid-cols-4">
          {stats.map((s, i) => (
            <div
              key={s.label}
              className={`px-4 py-8 text-center ${i % 2 === 0 ? 'border-l border-ink-900/15' : ''} md:border-l md:border-ink-900/15 md:last:border-l-0`}
            >
              <div className="font-display text-4xl font-extrabold text-ink-900 md:text-5xl">{s.value}</div>
              <div className="mt-1 text-sm text-ink-500">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* آراء أولياء الأمور */}
      <section className="container-app mt-28">
        <motion.div {...fadeUp} className="mb-10 text-center">
          <span className="eyebrow"><Star size={14} /> من دفتر الملاحظات</span>
          <h2 className="section-title mt-3">أولياء الأمور بيقولوا إيه؟</h2>
        </motion.div>
        <div className="grid gap-5 md:grid-cols-3">
          {testimonials.map((t, i) => (
            <motion.figure
              key={t.name}
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: i * 0.08 }}
              className={`card relative p-7 ${i === 1 ? 'md:-translate-y-4 md:rotate-[0.6deg]' : i === 0 ? 'md:-rotate-[0.8deg]' : 'md:rotate-[0.8deg]'}`}
            >
              <Quote size={36} className="text-lime-400" fill="currentColor" strokeWidth={0} />
              <blockquote className="mt-4 text-lg leading-8 text-ink-700">{t.text}</blockquote>
              <figcaption className="mt-6 flex items-center justify-between border-t border-dashed border-ink-900/15 pt-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-ink-900 font-display font-extrabold text-lime-300">
                    {t.name.split(' ')[1]?.charAt(0) ?? t.name.charAt(0)}
                  </span>
                  <div>
                    <div className="font-semibold text-ink-900">{t.name}</div>
                    <div className="text-xs text-ink-500">{t.grade}</div>
                  </div>
                </div>
                <div className="flex gap-0.5 text-science-yellow" role="img" aria-label="تقييم ٥ من ٥">
                  {Array.from({ length: 5 }).map((_, k) => (
                    <Star key={k} size={14} fill="currentColor" strokeWidth={0} />
                  ))}
                </div>
              </figcaption>
            </motion.figure>
          ))}
        </div>
      </section>

      {/* الأسئلة الشائعة */}
      <section className="container-app mt-28 grid gap-10 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <span className="eyebrow">أسئلة شائعة</span>
          <h2 className="section-title mt-3">عندك سؤال؟ غالباً إجابته هنا</h2>
          <p className="mt-4 max-w-sm leading-7 text-ink-500">
            لو ملقتش إجابتك، كلّمنا على واتساب وهنرد عليك في أسرع وقت.
          </p>
          <a href={`https://wa.me/${PLATFORM.whatsapp}`} target="_blank" rel="noreferrer" className="btn-ghost mt-6">
            اسأل على واتساب <ArrowUpLeft size={16} />
          </a>
        </div>
        <div className="space-y-3">
          {faqs.map((f) => (
            <details key={f.q} className="group card overflow-hidden open:border-ink-900 open:shadow-stamp-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 font-semibold text-ink-900 [&::-webkit-details-marker]:hidden">
                {f.q}
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-ink-900/15 transition group-open:rotate-45 group-open:border-ink-900 group-open:bg-lime-300">
                  <Plus size={16} />
                </span>
              </summary>
              <p className="px-5 pb-5 leading-7 text-ink-500">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}

function Hero() {
  return (
    <section className="relative -mt-[76px] overflow-hidden pt-[76px]">
      <div className="pointer-events-none absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />

      <div className="container-app relative grid items-center gap-12 pb-10 pt-12 lg:grid-cols-[1.15fr_1fr] lg:pt-20">
        {/* العنوان الرئيسي ظاهر من أول رسم (أكبر عنصر في الصفحة — LCP): حركة انزلاق فقط بلا إخفاء */}
        <motion.div initial={{ y: 20 }} animate={{ y: 0 }} transition={{ duration: 0.5 }}>
          <span className="eyebrow">
            <span className="h-2 w-2 rounded-full bg-lime-400 ring-4 ring-lime-200" />
            {PLATFORM.tagline}
          </span>

          <h1 className="mt-6 font-display text-5xl font-extrabold leading-[1.15] text-ink-900 sm:text-6xl lg:text-7xl">
            العلوم مش حفظ،
            <br />
            <span className="marker">العلوم تجربة</span>
            <span className="text-brand-500">.</span>
          </h1>

          <p className="mt-6 max-w-lg text-lg leading-8 text-ink-500">
            مع <strong className="font-semibold text-ink-900">{PLATFORM.name}</strong> يتعلّم طالب الرابع والخامس
            والسادس الابتدائي العلوم بالفيديو والتجربة والسؤال — وولي الأمر يتابع كل خطوة.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/register" className="btn-accent px-6 py-3.5 text-base">
              ابدأ رحلتك مجاناً <ArrowUpLeft size={18} />
            </Link>
            <Link to="/courses" className="btn-ghost px-6 py-3.5 text-base">
              <PlayCircle size={18} /> تصفّح الكورسات
            </Link>
          </div>

          <div className="mt-10 flex items-center gap-4">
            <div className="flex -space-x-3 space-x-reverse">
              {['bg-lime-300', 'bg-coral-300', 'bg-brand-300', 'bg-paper-200'].map((c, i) => (
                <span key={c} className={`grid h-10 w-10 place-items-center rounded-full border-2 border-paper ${c} font-display text-sm font-extrabold text-ink-900`}>
                  {['م', 'ي', 'ح', 'س'][i]}
                </span>
              ))}
            </div>
            <div className="text-sm">
              <div className="font-semibold text-ink-900">+٥٠٠٠ طالب وطالبة</div>
              <div className="text-ink-500">بيذاكروا العلوم معانا</div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="relative mx-auto aspect-square w-full max-w-[480px]"
        >
          <HeroBoard />
        </motion.div>
      </div>
    </section>
  );
}

// لوحة المعمل في الهيرو: ذرة تدور + خانات الصفوف + بطاقات عائمة
function HeroBoard() {
  return (
    <div className="absolute inset-0">
      <div className="absolute inset-[8%] rounded-full border-2 border-dashed border-ink-900/15" />
      <AtomArt className="absolute inset-[10%]" />

      {grades.map((g, i) => {
        const m = GRADE_META[g];
        const pos = ['right-[2%] top-[6%] rotate-[-8deg]', 'left-[0%] top-[38%] rotate-[6deg]', 'right-[10%] bottom-[4%] rotate-[4deg]'][i];
        return (
          <Link
            key={g}
            to={`/courses?grade=${g}`}
            className={`absolute ${pos} grid h-[84px] w-[84px] place-items-center rounded-2xl border-2 border-ink-900 shadow-stamp transition hover:rotate-0 hover:scale-105 ${m.tile}`}
          >
            <span className="absolute right-2 top-1 text-[10px] font-semibold opacity-90">{m.code}</span>
            <span className="font-display text-4xl font-extrabold leading-none">{m.num}</span>
            <span className="absolute bottom-1 text-[9px] font-semibold opacity-70">{GRADE_SHORT[g]}</span>
          </Link>
        );
      })}

      <div className="absolute left-[6%] top-[4%] flex animate-float items-center gap-2 rounded-2xl border border-ink-900/10 bg-white px-3 py-2 shadow-soft">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-500 text-white"><Timer size={15} /></span>
        <div className="text-xs">
          <div className="font-semibold text-ink-900">كويز الحصة</div>
          <div className="text-ink-500">١٠ / ١٠ درجات</div>
        </div>
      </div>

      <div className="absolute bottom-[14%] left-[8%] flex animate-float items-center gap-2 rounded-2xl border border-ink-900/10 bg-white px-3 py-2 shadow-soft [animation-delay:1.5s]">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-coral-400 text-ink-900"><BellRing size={15} /></span>
        <div className="text-xs">
          <div className="font-semibold text-ink-900">إشعار لولي الأمر</div>
          <div className="text-ink-500">تم إرسال الدرجة</div>
        </div>
      </div>

      <FlaskArt className="absolute bottom-[34%] right-[-2%] w-16 animate-float [animation-delay:0.8s]" />
      <LeafArt className="absolute left-[40%] top-[-2%] w-12 animate-float [animation-delay:2.2s]" />
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  desc,
  className = '',
}: {
  icon: typeof FileText;
  title: string;
  desc: string;
  className?: string;
}) {
  return (
    <motion.div {...fadeUp} className={`flex flex-col rounded-4xl border border-ink-900/[0.08] p-6 ${className}`}>
      <span className="grid h-11 w-11 place-items-center rounded-full bg-ink-900 text-paper">
        <Icon size={19} />
      </span>
      <h3 className="mt-auto pt-6 text-xl font-extrabold text-ink-900">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-ink-600">{desc}</p>
    </motion.div>
  );
}
