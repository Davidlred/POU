import React from 'react';
import { View, Image } from 'react-native';
import Svg, { Path, Rect, Ellipse, Circle, Line } from 'react-native-svg';
import { useTheme } from './ThemeProvider';

// Placeholder art (newdesign.md 3.3): shown when a listing has no photo, and small in category tiles, cart rows,
// empty states and role options. A tinted ground plus a line drawing: ink outline 2.5, white fill, one orange detail.
// Four drawings: eggs in a tray, bird, feed bag, vial. Real photos replace it when present.
// (Drawn here from the brief; swap the paths for the mockup's Art.dc.html drawings if they differ.)

const KIND_OF = { eggs: 'eggs', chicken: 'bird', turkey: 'bird', live_birds: 'bird', feed: 'feed', drugs: 'vial', equipment: 'box', packaging: 'box', manure: 'feed', litter: 'feed', feathers: 'bird' };
const TINT_OF = { eggs: 't4', bird: 't2', feed: 't1', vial: 't3', box: 't4' };
export const artKind = (category) => KIND_OF[category] || (['eggs', 'bird', 'feed', 'vial', 'box'].includes(category) ? category : 'feed');
export const artTint = (kind) => TINT_OF[artKind(kind)];

function Drawing({ kind, size }) {
  const { c } = useTheme();
  const ink = c.ink === '#F2F5F3' ? '#0E1512' : c.ink;   // the drawings stay dark-outlined on their light tint in both modes
  const p = { stroke: ink, strokeWidth: 2.5, strokeLinejoin: 'round', strokeLinecap: 'round' };
  const W = '#FFFFFF'; const O = c.orange;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {kind === 'eggs' ? <>
        <Ellipse cx="32" cy="46" rx="11" ry="14" fill={W} {...p} />
        <Ellipse cx="68" cy="46" rx="11" ry="14" fill={W} {...p} />
        <Ellipse cx="50" cy="40" rx="11.5" ry="14.5" fill={O} {...p} />
        <Path d="M14 56 H86 L80 80 C79.4 82.4 77.4 84 75 84 H25 C22.6 84 20.6 82.4 20 80 Z" fill={W} {...p} />
        <Path d="M32 62 V78 M50 62 V78 M68 62 V78" {...p} fill="none" />
      </> : kind === 'bird' ? <>
        <Path d="M30 50 C22 46 18 36 21 26 C27 31 31 38 34 44" fill={W} {...p} />
        <Path d="M30 52 C30 38 41 32 54 35 C61 36.5 64 31 64 25 C64 17.5 70 13 76.5 14.5 C83 16 85.5 23 82 29 L81 31 C82 49 74 68 54 70 C40 71.5 30 64 30 52 Z" fill={W} {...p} />
        <Path d="M82 25.5 L91 29 L82.5 32.5 Z" fill={O} {...p} />
        <Path d="M70 14.5 C69 9.5 73 7.5 75.5 11 C76.5 7 81 7.5 80.5 13" fill={W} {...p} />
        <Circle cx="75" cy="22" r="2.2" fill={ink} />
        <Path d="M42 50 C49 45 60 47.5 62 56 C54 59 46 57 42 50 Z" fill={W} {...p} />
        <Path d="M48 70 L46 84 M42 84 H51 M60 69 L62 84 M58 84 H67" {...p} fill="none" />
      </> : kind === 'vial' ? <>
        <Rect x="39" y="12" width="22" height="12" rx="3" fill={O} {...p} />
        <Rect x="43" y="24" width="14" height="8" fill={W} {...p} />
        <Rect x="31" y="32" width="38" height="56" rx="9" fill={W} {...p} />
        <Line x1="31" y1="60" x2="69" y2="60" {...p} />
        <Path d="M41 70 H59 M41 77 H53" {...p} fill="none" />
      </> : kind === 'box' ? <>
        <Path d="M18 36 L50 22 L82 36 L50 50 Z" fill={W} {...p} />
        <Path d="M18 36 V72 L50 86 V50 Z" fill={W} {...p} />
        <Path d="M82 36 V72 L50 86 V50 Z" fill={W} {...p} />
        <Path d="M34 29 L66 43 V56 L58 52.5 V40" fill={O} {...p} />
        <Path d="M58 72 L72 66" {...p} fill="none" />
      </> : <>
        <Path d="M32 28 L68 28 C70 28 71 29 71.5 31 L78 82 C78.3 85 76.5 87 73.5 87 H26.5 C23.5 87 21.7 85 22 82 L28.5 31 C29 29 30 28 32 28 Z" fill={W} {...p} />
        <Path d="M33 28 C35 21 41 16 50 16 C59 16 65 21 67 28" fill={W} {...p} />
        <Path d="M41 22 L50 27 L59 22" {...p} fill="none" />
        <Rect x="29" y="50" width="42" height="16" rx="3" fill={O} {...p} />
        <Path d="M38 76 H62" {...p} fill="none" />
      </>}
    </Svg>
  );
}

// kind: eggs | bird | feed | vial, or a listing category (mapped). size: the square's side. round: a circle instead of a rounded square.
// bare: just the drawing, no tinted ground.
export function PlaceholderArt({ kind = 'feed', category, size = 64, round, bare, radius = 12, style }) {
  const { c } = useTheme();
  const k = artKind(category || kind);
  if (bare) return <Drawing kind={k} size={size} />;
  return (
    <View style={[{ width: size, height: size, borderRadius: round ? size / 2 : radius, backgroundColor: c[TINT_OF[k]], alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, style]}>
      <Drawing kind={k} size={size * 0.74} />
    </View>
  );
}

// A product's picture area: the photo if there is one, else a tinted panel with its drawing. Fills its width.
export function ArtPanel({ uri, category, height = 156, radius = 0, style, dim }) {
  const { c } = useTheme();
  const k = artKind(category);
  if (uri) return <Image source={{ uri }} style={[{ height, borderRadius: radius, backgroundColor: c[TINT_OF[k]], opacity: dim ? 0.5 : 1 }, style]} />;
  return (
    <View style={[{ height, borderRadius: radius, backgroundColor: c[TINT_OF[k]], alignItems: 'center', justifyContent: 'center', opacity: dim ? 0.5 : 1 }, style]}>
      <Drawing kind={k} size={Math.min(height * 0.72, 220)} />
    </View>
  );
}

// A small square thumbnail: photo or drawing.
export function Thumb({ uri, category, size = 48, radius = 12 }) {
  const { c } = useTheme();
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: radius, backgroundColor: c.sf2 }} />;
  return <PlaceholderArt category={category} size={size} radius={radius} />;
}
