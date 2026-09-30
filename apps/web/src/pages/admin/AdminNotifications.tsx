import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../../store/auth';
import { PageTitle } from '../../components/ui/StatCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { BroadcastPanel } from '../../features/notifications/BroadcastPanel';
import { MessagesPanel } from '../../features/notifications/MessagesPanel';
import { TemplatesPanel } from '../../features/notifications/TemplatesPanel';

const TABS = [
  ['broadcast', 'إرسال جماعي'],
  ['messages', 'سجل الرسائل'],
  ['templates', 'القوالب'],
] as const;
type Tab = (typeof TABS)[number][0];

export function AdminNotifications() {
  const [tab, setTab] = useState<Tab>('broadcast');
  // الإرسال الجماعي والقوالب للأدمن فقط (المساعد يصل للوحة لكن الـ API يرفض)
  const isAdmin = useAuth((s) => s.user?.role === 'ADMIN');
  if (!isAdmin) {
    return (
      <div>
        <PageTitle title="الإشعارات" />
        <div className="mt-6">
          <EmptyState icon={ShieldAlert} title="للأدمن فقط" text="الإرسال الجماعي وقوالب الرسائل متاحة لحساب الأدمن. إشعاراتك الخاصة في الجرس أعلى الصفحة." />
        </div>
      </div>
    );
  }
  return (
    <div>
      <PageTitle title="الإشعارات" subtitle="رسائل جماعية للطلاب، متابعة رسائل واتساب/SMS، ونصوص الرسائل التلقائية." />
      <div className="mt-6 flex max-w-full overflow-x-auto">
        <div className="inline-flex shrink-0 rounded-full border border-ink-900/10 bg-white p-1" role="tablist">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition sm:px-5 ${tab === key ? 'bg-ink-900 text-paper' : 'text-ink-600 hover:text-ink-900'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-6">
        {tab === 'broadcast' && <BroadcastPanel />}
        {tab === 'messages' && <MessagesPanel />}
        {tab === 'templates' && <TemplatesPanel />}
      </div>
    </div>
  );
}
