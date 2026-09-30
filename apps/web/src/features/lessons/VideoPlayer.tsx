import type { LessonPlayDTO } from '@miss-ann/shared';
import { BunnyPlayer, type PlayerCallbacks } from './BunnyPlayer';
import { YouTubePlayer } from './YouTubePlayer';

export type { PlayerTime } from './Watermark';

// يختار المشغّل المناسب حسب مصدر فيديو الحصة
export function VideoPlayer({
  play,
  onExpired,
  ...callbacks
}: Omit<PlayerCallbacks, 'watermarkText'> & { play: LessonPlayDTO; onExpired?: () => void }) {
  if (play.provider === 'YOUTUBE') {
    return (
      <YouTubePlayer
        videoKey={play.videoKey}
        expiresAt={play.expiresAt}
        onExpired={onExpired}
        watermarkText={play.watermarkText}
        {...callbacks}
      />
    );
  }
  return <BunnyPlayer embedUrl={play.embedUrl} watermarkText={play.watermarkText} {...callbacks} />;
}
