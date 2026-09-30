import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from '../components/ui/notify';
import { resetPasswordSchema, type ResetPasswordInput } from '@miss-ann/shared';
import { AuthCard } from '../features/auth/AuthCard';
import { Field } from '../components/ui/Field';
import { Spinner } from '../components/ui/Spinner';
import { authApi } from '../features/auth/api';
import { apiErrorMessage } from '../lib/api';

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { phone: params.get('phone') ?? '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setLoading(true);
    try {
      const res = await authApi.reset(values);
      toast.success(res.message);
      navigate('/login', { replace: true });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  });

  return (
    <AuthCard title="إعادة تعيين كلمة المرور" subtitle="أدخل الكود وكلمة المرور الجديدة">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="رقم الموبايل" error={errors.phone?.message}>
          <input className="input" dir="ltr" {...register('phone')} />
        </Field>
        <Field label="كود الاستعادة" error={errors.code?.message}>
          <input className="input text-center tracking-widest" dir="ltr" maxLength={6} {...register('code')} />
        </Field>
        <Field label="كلمة المرور الجديدة" error={errors.newPassword?.message}>
          <input className="input" type="password" {...register('newPassword')} />
        </Field>
        <button type="submit" className="btn-dark w-full py-3.5 text-base" disabled={loading}>
          {loading ? <Spinner /> : 'تغيير كلمة المرور'}
        </button>
      </form>
    </AuthCard>
  );
}
