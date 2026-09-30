import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '../components/ui/notify';
import { AuthCard } from '../features/auth/AuthCard';
import { Field } from '../components/ui/Field';
import { Spinner } from '../components/ui/Spinner';
import { authApi } from '../features/auth/api';
import { apiErrorMessage } from '../lib/api';

export function ForgotPassword() {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await authApi.forgot(phone);
      toast.success(res.message);
      navigate(`/reset-password?phone=${encodeURIComponent(phone)}`);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard title="نسيت كلمة المرور" subtitle="أدخل رقم موبايلك لإرسال كود الاستعادة">
      <form onSubmit={submit} className="space-y-4">
        <Field label="رقم الموبايل">
          <input className="input" dir="ltr" placeholder="01xxxxxxxxx" value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} />
        </Field>
        <button type="submit" className="btn-dark w-full py-3.5 text-base" disabled={loading}>
          {loading ? <Spinner /> : 'إرسال الكود'}
        </button>
      </form>
    </AuthCard>
  );
}
