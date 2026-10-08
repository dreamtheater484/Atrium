import { Composition } from 'remotion';
import captures from './generated/captures.json';
import videos from './generated/videos.json';
import { FPS, HEIGHT, WIDTH } from './theme';
import type { Captures, VideoData } from './types';
import { totalFrames, Video } from './Video';

export function Root() {
  return (
    <>
      {(videos as VideoData[]).map((v) => (
        <Composition
          key={v.id}
          id={v.id}
          component={Video}
          durationInFrames={Math.max(1, totalFrames(v, FPS))}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
          defaultProps={{ video: v, captures: captures as unknown as Captures }}
        />
      ))}
    </>
  );
}
