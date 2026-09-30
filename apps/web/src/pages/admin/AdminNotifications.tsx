import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../../store/auth';
import { PageTitle } from '../../components/ui/StatCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { Tabs } from '../../components/ui/Tabs';
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
      <div className="mt-6">
        <Tabs tabs={TABS} value={tab} onChange={setTab}>
          {tab === 'broadcast' && <BroadcastPanel />}
          {tab === 'messages' && <MessagesPanel />}
          {tab === 'templates' && <TemplatesPanel />}
        </Tabs>
      </div>
    </div>
  );
}
