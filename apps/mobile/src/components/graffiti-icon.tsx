import Svg, { Path } from 'react-native-svg';

const PATHS = {
  steps: 'M3 13l4-1 2-7 3 1 2 4 5 2c2 1 3 2 3 4l-2 2H5l-2-2zM3.5 21l13-.5M10 10l3-1m-2 4 4-1',
  calories: 'M12 2c.6 4 6 6 5 11l3-3c3 5-.3 11-7 11-5 0-8-2-8-6 0-3 2-5 4-7l.5 4C12 10 12.5 6 12 2zM11 18l3-3',
  activity: 'M14 2l-9 12 7-1-2 9 10-13-7 1zM3 9l2-3m14 14 2-3',
  food: 'M3 11l18-1c-.4 6-4 9-9 9s-8-2-9-8zM8 22l8-1M7 7l2-3m3 3 3-5m1 5 3-3',
  home: 'M2.5 11.5 11.5 3 22 10.5M5.5 10v9.5c0 1 .5 1.5 1.5 1.5l4-.3v-6l4.5-.3v6l3.5-.3c1-.1 1.5-.7 1.5-1.7v-7M16.5 4.5l3.5-.5',
  programs: 'M7 4.5 18.5 4c1-.1 1.5.5 1.5 1.5v13c0 1-.5 1.5-1.5 1.6l-12 .6c-1 .1-1.5-.4-1.5-1.5V6c0-.9.7-1.4 2-1.5zM3 8l4-.3m-4 5.2 4-.3m-4 5 4-.3M10 9l6-.4m-6 4.1 6-.4M10 16.4l4-.25',
  workout: 'M2.5 15l2-1m2.5 3.5L3.5 11a1.4 1.4 0 0 1 .5-1.9l2.5-1.4a1.4 1.4 0 0 1 1.9.5l3.6 6.5a1.4 1.4 0 0 1-.5 1.9L9 18a1.5 1.5 0 0 1-2-.5zM10 12l4.5-2.5m1.4 3.2-3.6-6.3a1.4 1.4 0 0 1 .5-1.9l2.6-1.4a1.4 1.4 0 0 1 1.9.5l3.7 6.5a1.4 1.4 0 0 1-.6 1.9l-2.6 1.4a1.4 1.4 0 0 1-1.9-.7zM19.5 7l2-1M13 20.5l3.5-1.7',
  progress: 'M3.5 20.5 21 19.7M6 16.5l.2-3.5m4.9 3.3.3-6m5.2 5.7.7-8M4 9l5.8-4.6 4 1.5L20 2.5m-4.5.2L20 2.5l-.3 4',
  profile: 'M16.4 7.5c0 2.5-1.8 4.4-4.4 4.4S7.5 10.1 7.5 7.6s1.9-4.3 4.6-4.5c2.5-.2 4.3 1.6 4.3 4.4zM3.5 20c1.3-3.6 4.5-5.2 8.5-5.4 4-.2 7.1 1.3 8.5 4.8M8 21l8-.5',
  play: 'M8 4.5 19.5 12 8 20zM3.5 16l.5-7',
  sleep: 'M13.5 3.5l8-.5-7.5 8 7.5-.5M6.5 10l5.5-.4-5 6 5.5-.5M2.5 17.5l4-.3-3.5 4.5 4-.3',
};

export type GraffitiIconName = keyof typeof PATHS;

export function GraffitiIcon({ name, color, size, emphasized = false }: {
  name: GraffitiIconName;
  color: string;
  size: number;
  emphasized?: boolean;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <Path
        d={PATHS[name]}
        fill="none"
        stroke={color}
        strokeWidth={emphasized ? 2.7 : 2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
