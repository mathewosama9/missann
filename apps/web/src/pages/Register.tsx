import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from '../components/ui/notify';
import {
  registerSchema,
  type RegisterInput,
  Grade,
  GRADE_LABELS,
  GOVERNORATES,
} from '@miss-ann/shared';
import { AuthCard } from '../features/auth/AuthCard';
import { Field } from '../components/ui/Field';
import { Spinner } from '../components/ui/Spinner';
import { authApi } from '../features/auth/api';
import { apiErrorMessage, apiErrorFields } from '../lib/api';

export function Register() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { grade: Grade.FOURTH_PRIMARY, governorate: GOVERNORATES[0] },
  });

  const onSubmit = handleSubmit(async (values) => {
    setLoading(true);
    try {
      const res = await authApi.register(values);
      toast.success(res.message);
      // التحقق بالكود يحدده الأدمن؛ بدونه الحساب مفعّل فوراً ← صفحة الدخول
      navigate(res.requiresVerification ? `/verify?phone=${encodeURIComponent(res.phone)}` : '/login');
    } catch (err) {
      const fields = apiErrorFields(err);
      if (fields) {
        for (const [k, v] of Object.entries(fields)) setError(k as keyof RegisterInput, { message: v });
      }
      toast.error(apiErrorMessage(err, 'تعذّر إنشاء الحساب'));
    } finally {
      setLoading(false);
    }
  });

  return (
    <AuthCard
      title="إنشاء حساب جديد"
      subtitle="سجّل بيانات الطالب للبدء في تعلّم العلوم"
      footer={
        <>
          لديك حساب؟{' '}
          <Link to="/login" className="font-semibold text-brand-600 underline-offset-4 hover:underline">
            سجّل الدخول
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="اسم الطالب" error={errors.name?.message}>
          <input className="input" placeholder="الاسم الكامل" {...register('name')} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="موبايل الطالب" error={errors.phone?.message}>
            <input className="input" inputMode="numeric" placeholder="01xxxxxxxxx" dir="ltr" {...register('phone')} />
          </Field>
          <Field label="موبايل ولي الأمر" error={errors.parentPhone?.message}>
            <input className="input" inputMode="numeric" placeholder="01xxxxxxxxx" dir="ltr" {...register('parentPhone')} />
          </Field>
        </div>

        <Field label="البريد الإلكتروني (اختياري)" error={errors.email?.message}>
          <input className="input" type="email" placeholder="example@mail.com" dir="ltr" {...register('email')} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="الصف الدراسي" error={errors.grade?.message}>
            <select className="input" {...register('grade')}>
              {Object.values(Grade).map((g) => (
                <option key={g} value={g}>
                  {GRADE_LABELS[g]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="المحافظة" error={errors.governorate?.message}>
            <select className="input" {...register('governorate')}>
              {GOVERNORATES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="كلمة المرور" error={errors.password?.message}>
            <input className="input" type="password" placeholder="8 أحرف على الأقل" {...register('password')} />
          </Field>
          <Field label="تأكيد كلمة المرور" error={errors.confirmPassword?.message}>
            <input className="input" type="password" {...register('confirmPassword')} />
          </Field>
        </div>

        <button type="submit" className="btn-dark w-full py-3.5 text-base" disabled={loading}>
          {loading ? <Spinner /> : 'إنشاء الحساب'}
        </button>
      </form>
    </AuthCard>
  );
}
