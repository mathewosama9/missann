import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { toast } from '../components/ui/notify';
import { loginSchema, type LoginInput } from '@miss-ann/shared';
import { AuthCard } from '../features/auth/AuthCard';
import { Field } from '../components/ui/Field';
import { Spinner } from '../components/ui/Spinner';
import { authApi } from '../features/auth/api';
import { useAuth } from '../store/auth';
import { getDeviceFingerprint } from '../lib/fingerprint';
import { apiErrorMessage } from '../lib/api';

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { deviceFingerprint: getDeviceFingerprint(), rememberMe: true },
  });

  const onSubmit = handleSubmit(async (values) => {
    setLoading(true);
    try {
      const res = await authApi.login({ ...values, deviceFingerprint: getDeviceFingerprint() });
      useAuth.getState().setAuth(res);
      toast.success(`أهلاً ${res.user.name}`);
      const dest =
        (location.state as { from?: string } | null)?.from ??
        (res.user.role === 'STUDENT' ? '/dashboard' : '/admin');
      navigate(dest, { replace: true });
    } catch (err) {
      toast.error(apiErrorMessage(err, 'تعذّر تسجيل الدخول'));
    } finally {
      setLoading(false);
    }
  });

  return (
    <AuthCard
      title="تسجيل الدخول"
      subtitle="أدخل بياناتك للوصول إلى كورساتك"
      footer={
        <>
          ليس لديك حساب؟{' '}
          <Link to="/register" className="font-semibold text-brand-600 underline-offset-4 hover:underline">
            أنشئ حساباً
          </Link>
        </>
      }
    >
      {/* method=post + autocomplete ← المتصفح يعرض حفظ بيانات الدخول (الإرسال الفعلي عبر JS) */}
      <form onSubmit={onSubmit} method="post" autoComplete="on" className="space-y-4">
        <Field label="الموبايل أو البريد" error={errors.identifier?.message}>
          <input className="input" placeholder="01xxxxxxxxx" dir="ltr" autoComplete="username" inputMode="tel" {...register('identifier')} />
        </Field>
        <Field label="كلمة المرور" error={errors.password?.message}>
          <input className="input" type="password" autoComplete="current-password" {...register('password')} />
        </Field>
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-ink-600">
            <input type="checkbox" className="h-4 w-4 rounded accent-brand-500" {...register('rememberMe')} /> تذكّرني على هذا الجهاز
          </label>
          <Link to="/forgot-password" className="font-semibold text-brand-600 underline-offset-4 hover:underline">
            نسيت كلمة المرور؟
          </Link>
        </div>
        <button type="submit" className="btn-dark w-full py-3.5 text-base" disabled={loading}>
          {loading ? <Spinner /> : 'دخول'}
        </button>
      </form>
    </AuthCard>
  );
}
