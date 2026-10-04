import type { ExerciseMedia } from '@mvp/schemas';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';

// The web build exists only for development: a plain iframe instead of the native player.
export function ExerciseVideo({ media }: { media: ExerciseMedia }) {
  return (
    <View style={styles.frame}>
      <iframe
        src={`https://www.youtube.com/embed/${media.video_id}?start=${media.start_sec}&rel=0`}
        title="YouTube"
        allowFullScreen
        style={{ border: 0, width: '100%', height: '100%' }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    aspectRatio: 16 / 9,
    borderRadius: Spacing.three,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
});
