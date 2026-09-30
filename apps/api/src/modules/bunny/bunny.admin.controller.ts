import type { Request, Response } from 'express';
import type { BunnyCreateVideoInput, BunnyUploadDTO } from '@miss-ann/shared';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { createBunnyVideo, getBunnyVideo, signTusUpload, TUS_ENDPOINT } from '../../lib/bunny.js';

// ينشئ عنصر فيديو في المكتبة ويرجّع توقيع رفع TUS مؤقت.
// لا يغيّر الحصة هنا: الربط يتم بعد اكتمال الرفع (PATCH الحصة) حتى لا يُستبدل فيديو
// يعمل بفيديو فارغ لو أُلغي الرفع أو فشل.
export async function createVideoHandler(req: Request, res: Response): Promise<void> {
  const { lessonId, title } = req.body as BunnyCreateVideoInput;
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { id: true, title: true, bunnyVideoId: true },
  });
  if (!lesson) throw notFound('الحصة غير موجودة');

  const { videoId } = await createBunnyVideo(title ?? lesson.title);
  await audit(req, 'BUNNY_VIDEO_CREATE', 'Lesson', {
    lessonId,
    videoId,
    currentVideoId: lesson.bunnyVideoId,
  });

  const { headers, expiresAt } = signTusUpload(videoId);
  const body: BunnyUploadDTO = {
    videoId,
    lessonId,
    tusEndpoint: TUS_ENDPOINT,
    headers,
    expiresAt: expiresAt.toISOString(),
  };
  res.status(201).json(body);
}

export async function videoStatusHandler(req: Request, res: Response): Promise<void> {
  const lessonId = Number(req.params.id);
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { bunnyVideoId: true, durationSec: true },
  });
  if (!lesson) throw notFound('الحصة غير موجودة');
  if (!lesson.bunnyVideoId) throw notFound('لا يوجد فيديو مرتبط بالحصة');

  const info = await getBunnyVideo(lesson.bunnyVideoId);
  const ready = info.status === 4;
  let durationSec = lesson.durationSec;
  if (ready && info.lengthSec > 0 && info.lengthSec !== lesson.durationSec) {
    durationSec = info.lengthSec;
    await prisma.lesson.update({ where: { id: lessonId }, data: { durationSec } });
  }
  res.json({ status: info.status, encodeProgress: info.encodeProgress, ready, durationSec });
}
