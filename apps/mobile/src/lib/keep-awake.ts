import { useKeepAwake } from 'expo-keep-awake';

/**
 * Keeps the screen on while a workout or a timer is open. A browser may refuse the lock, and
 * letting go of one that never came is not an error for us: the screen simply may go dark.
 */
export const useScreenAwake = () => useKeepAwake(undefined, { suppressDeactivateWarnings: true });
