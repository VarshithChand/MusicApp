import { useRef, useState } from 'react';
import { GestureResponderEvent, LayoutChangeEvent, PanResponder, PanResponderGestureState } from 'react-native';
import { setScreenBrightness } from '../native/brightness';

type Zone = 'left' | 'center' | 'right';

interface Options {
  /** True while the video is shown rotated 90 degrees to fill a portrait screen. */
  rotated: boolean;
  onSeek: (deltaSeconds: number) => void;
  onTogglePlay: () => void;
  /** Volume from 0 to 1. */
  onVolume: (level: number) => void;
}

const TAP_SLOP = 24;
const DOUBLE_TAP_MS = 350;
const SEEK_STEP_PX = 30;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Shared touch controls for the video players.
 * Drag sideways: seek in 10-second steps. Drag up/down on the left third: brightness; on the right third: volume.
 * Double tap the middle: play/pause. Double tap a side: skip 10 seconds.
 */
export function useVideoGestures(options: Options) {
  const [hud, setHud] = useState<string | null>(null);
  const opts = useRef(options);
  opts.current = options;

  const size = useRef({ w: 1, h: 1 });
  const volume = useRef(1);
  const brightness = useRef(0.5);
  const hudTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef<{ zone: Zone; at: number } | null>(null);
  const drag = useRef<{ zone: Zone; axis: 'x' | 'y' | null; startVol: number; startBright: number; seek: number } | null>(null);

  const showHud = (text: string) => {
    setHud(text);
    if (hudTimer.current) clearTimeout(hudTimer.current);
    hudTimer.current = setTimeout(() => setHud(null), 700);
  };

  // Converts screen movement into movement as the viewer sees it. The rotated video is turned 90 degrees clockwise,
  // so the viewer's left-to-right is the screen's top-to-bottom.
  const local = (g: PanResponderGestureState) => (opts.current.rotated ? { dx: g.dy, dy: -g.dx } : { dx: g.dx, dy: g.dy });
  const localX = (e: GestureResponderEvent) => (opts.current.rotated ? e.nativeEvent.pageY : e.nativeEvent.locationX);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const x = localX(e);
        const w = size.current.w;
        const zone: Zone = x < w * 0.35 ? 'left' : x > w * 0.65 ? 'right' : 'center';
        drag.current = { zone, axis: null, startVol: volume.current, startBright: brightness.current, seek: 0 };
      },
      onPanResponderMove: (_e, g) => {
        const d = drag.current;
        if (!d) return;
        const { dx, dy } = local(g);
        if (!d.axis) {
          if (Math.abs(dx) < TAP_SLOP && Math.abs(dy) < TAP_SLOP) return;
          // Lock to whichever direction the finger moved first, so a seek never turns into a volume change.
          d.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
        }
        if (d.axis === 'x') {
          d.seek = Math.round(dx / SEEK_STEP_PX) * 10;
          showHud(`${d.seek >= 0 ? '+' : ''}${d.seek}s`);
        } else if (d.zone === 'left') {
          brightness.current = clamp01(d.startBright - dy / size.current.h);
          setScreenBrightness(brightness.current);
          showHud(`Brightness ${Math.round(brightness.current * 100)}%`);
        } else if (d.zone === 'right') {
          volume.current = clamp01(d.startVol - dy / size.current.h);
          opts.current.onVolume(volume.current);
          showHud(`Volume ${Math.round(volume.current * 100)}%`);
        }
      },
      onPanResponderRelease: () => {
        const d = drag.current;
        drag.current = null;
        if (!d) return;
        if (d.axis) {
          if (d.axis === 'x' && d.seek) opts.current.onSeek(d.seek);
          return;
        }
        const now = Date.now();
        const last = lastTap.current;
        if (last && last.zone === d.zone && now - last.at < DOUBLE_TAP_MS) {
          lastTap.current = null;
          if (d.zone === 'center') {
            opts.current.onTogglePlay();
          } else {
            const step = d.zone === 'left' ? -10 : 10;
            opts.current.onSeek(step);
            showHud(`${step > 0 ? '+' : ''}${step}s`);
          }
        } else {
          lastTap.current = { zone: d.zone, at: now };
        }
      },
      onPanResponderTerminate: () => {
        drag.current = null;
      },
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    size.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
  };

  return { panHandlers: responder.panHandlers, onLayout, hud };
}
