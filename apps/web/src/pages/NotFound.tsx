import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { FlaskArt } from '../components/ScienceArt';

export function NotFound() {
  return (
    <div className="container-app grid min-h-[65vh] place-items-center py-14 text-center">
      <div>
        <div className="flex items-center justify-center gap-2 font-display text-[8rem] font-extrabold leading-none text-ink-900">
          <span>٤</span>
          <FlaskArt className="h-28 w-28 -rotate-12" />
          <span>٤</span>
        </div>
        <p className="mt-4 font-display text-2xl font-extrabold text-ink-900">التجربة دي ملهاش نتيجة!</p>
        <p className="mt-1 text-ink-500">الصفحة اللي بتدوّر عليها مش موجودة.</p>
        <Link to="/" className="btn-dark mt-8">
          <ArrowRight size={16} /> العودة للرئيسية
        </Link>
      </div>
    </div>
  );
}
