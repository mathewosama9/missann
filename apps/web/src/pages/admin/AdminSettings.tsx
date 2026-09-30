import { useState } from 'react';
import { PageTitle } from '../../components/ui/StatCard';
import { Tabs } from '../../components/ui/Tabs';
import { PlatformSettingsPanel } from '../../features/admin/PlatformSettingsPanel';
import { StaffPanel } from '../../features/admin/StaffPanel';
import { AuditLogPanel } from '../../features/admin/AuditLogPanel';

const TABS = [
  ['platform', 'إعدادات المنصة'],
  ['staff', 'المساعدون'],
  ['audit', 'سجل العمليات'],
] as const;
type Tab = (typeof TABS)[number][0];

// أدمن فقط (القسم مخفي عن المساعد في القائمة، والـ API يرفض غيره)
export function AdminSettings() {
  const [tab, setTab] = useState<Tab>('platform');
  return (
    <div>
      <PageTitle title="الإعدادات" subtitle="إعدادات التسجيل، فريق العمل، وسجل كل العمليات الحساسة." />
      <div className="mt-6">
        <Tabs tabs={TABS} value={tab} onChange={setTab}>
          {tab === 'platform' && <PlatformSettingsPanel />}
          {tab === 'staff' && <StaffPanel />}
          {tab === 'audit' && <AuditLogPanel />}
        </Tabs>
      </div>
    </div>
  );
}
