import { useCallback, useEffect, useRef, useState } from 'react';
import type { LessonProgressDTO, ProgressResultDTO } from '@miss-ann/shared';
import { lessonsApi } from './api';
import type { PlayerTime } from './Watermark';

const SEND_EVERY_MS = 15_000;
// قفزات أكبر من هذا بين تحديثين تُعتبر تقديماً (seek) لا مشاهدة فعلية
const MAX_TICK_SEC = 3;

// تتبّع تقدّم المشاهدة: يجمع الثواني المُشاهدة فعلاً (لا موضع المؤشر) ويرسلها كل 15 ثانية
export function useLessonProgress(lessonId: number, initial: LessonProgressDTO, fallbackDuration: number) {
  const [percent, setPercent] = useState(initial.percent);
  const [completedAt, setCompletedAt] = useState(initial.completedAt);

  const state = useRef({
    basePercent: initial.percent,
    watched: 0,
    lastSec: -1,
    position: initial.lastPositionSec,
    duration: fallbackDuration,
    dirty: false,
    percent: initial.percent,
  });

  const compute = () => {
    const s = state.current;
    if (!s.duration) return s.percent;
    const base = (s.basePercent / 100) * s.duration;
    return Math.min(100, Math.max(s.percent, ((base + s.watched) / s.duration) * 100));
  };

  const onTimeUpdate = useCallback(({ seconds, duration }: PlayerTime) => {
    const s = state.current;
    if (duration > 0) s.duration = duration;
    if (s.lastSec >= 0) {
      const delta = seconds - s.lastSec;
      if (delta > 0 && delta <= MAX_TICK_SEC) s.watched += delta;
    }
    s.lastSec = seconds;
    s.position = Math.floor(seconds);
    s.dirty = true;
    const p = compute();
    s.percent = p;
    setPercent(Math.floor(p));
  }, []);

  const flush = useCallback(async () => {
    const s = state.current;
    if (!s.dirty) return;
    s.dirty = false;
    try {
      await lessonsApi.progress(lessonId, {
        percent: Math.round(s.percent * 10) / 10,
        lastPositionSec: s.position,
      });
    } catch {
      s.dirty = true; // نعيد المحاولة في الدورة التالية
    }
  }, [lessonId]);

  // إرسال دوري + عند مغادرة الصفحة
  useEffect(() => {
    const t = window.setInterval(() => void flush(), SEND_EVERY_MS);
    return () => {
      window.clearInterval(t);
      void flush();
    };
  }, [flush]);

  const complete = useCallback(async (): Promise<ProgressResultDTO> => {
    const s = state.current;
    const res = await lessonsApi.progress(lessonId, {
      percent: Math.round(s.percent * 10) / 10,
      lastPositionSec: s.position,
      completed: true,
    });
    s.dirty = false;
    setCompletedAt(res.progress.completedAt);
    setPercent(Math.floor(res.progress.percent));
    return res;
  }, [lessonId]);

  return { percent, completedAt, onTimeUpdate, flush, complete };
}
