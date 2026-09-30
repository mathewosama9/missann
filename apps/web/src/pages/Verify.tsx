import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from '../components/ui/notify';
import { OtpPurpose } from '@miss-ann/shared';
import { AuthCard } from '../features/auth/AuthCard';
import { Field } from '../components/ui/Field';
import { Spinner } from '../components/ui/Spinner';
import { authApi } from '../features/auth/api';
import { apiErrorMessage } from '../lib/api';

export function Verify() {
  const [params] = useSearchParams();
  const phone = params.get('phone') ?? '';
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.verifyOtp({ phone, code, purpose: OtpPurpose.ACTIVATION });
      toast.success('تم تفعيل الحساب، سجّل الدخول');
      navigate('/login', { replace: true });
    } catch (err) {
      toast.error(apiErrorMessage(err, 'كود غير صحيح'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard title="تفعيل الحساب" subtitle={`أدخل الكود المرسل إلى ${phone || 'موبايلك'}`}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="كود التفعيل (6 أرقام)">
          <input
            className="input text-center text-2xl tracking-[0.5em]"
            inputMode="numeric"
            maxLength={6}
            dir="ltr"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="______"
          />
        </Field>
        <button type="submit" className="btn-dark w-full py-3.5 text-base" disabled={loading || code.length !== 6}>
          {loading ? <Spinner /> : 'تفعيل'}
        </button>
      </form>
    </AuthCard>
  );
}
