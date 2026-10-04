import type { ExerciseMedia } from '@mvp/schemas';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import YoutubePlayer from 'react-native-youtube-iframe';

import { Spacing } from '@/constants/theme';

/** A YouTube video of the exercise, embedded and started from the right moment. */
export function ExerciseVideo({ media }: { media: ExerciseMedia }) {
  const [width, setWidth] = useState(0);

  return (
    <View style={styles.frame} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 && (
        <YoutubePlayer
          width={width}
          height={(width * 9) / 16}
          videoId={media.video_id}
          initialPlayerParams={{ start: media.start_sec, rel: false }}
          // Works around a crash of the Android WebView inside a navigation stack.
          webViewStyle={styles.webView}
        />
      )}
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
  webView: {
    opacity: 0.99,
  },
});
