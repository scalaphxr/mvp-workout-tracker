import type { Templates } from '@mvp/domain';

/**
 * Day templates for programs made from the questionnaire. A slot lists the exercises that
 * can fill it, best first: the first one the gym has equipment for is taken. A day lists its
 * slots in order of importance: a short workout keeps the first ones.
 */
export const programTemplates: Templates = {
  slots: {
    squat: {
      group: 'quads',
      candidates: ['barbell-back-squat', 'leg-press', 'dumbbell-lunge', 'bodyweight-squat'],
    },
    leg_press: {
      group: 'quads',
      candidates: ['leg-press', 'barbell-back-squat', 'dumbbell-lunge', 'bodyweight-squat'],
    },
    lunge: { group: 'quads', candidates: ['dumbbell-lunge', 'leg-press', 'bodyweight-squat'] },
    leg_extension: {
      group: 'quads',
      candidates: ['leg-extension', 'dumbbell-lunge', 'bodyweight-squat'],
    },
    hinge: {
      group: 'hamstrings',
      candidates: [
        'romanian-deadlift',
        'conventional-deadlift',
        'barbell-hip-thrust',
        'back-extension',
        'glute-bridge',
      ],
    },
    hip_thrust: {
      group: 'hamstrings',
      candidates: ['barbell-hip-thrust', 'glute-bridge', 'romanian-deadlift'],
    },
    leg_curl: {
      group: 'hamstrings',
      candidates: ['lying-leg-curl', 'romanian-deadlift', 'back-extension', 'glute-bridge'],
    },
    calves: {
      group: 'calves',
      candidates: [
        'standing-calf-raise-machine',
        'smith-machine-calf-raise',
        'single-leg-dumbbell-calf-raise',
        'leg-press-calf-raise',
      ],
    },
    bench: {
      group: 'chest',
      candidates: ['barbell-bench-press', 'dumbbell-bench-press', 'chest-press-machine', 'push-up'],
    },
    incline: {
      group: 'chest',
      candidates: [
        'incline-dumbbell-press',
        'dumbbell-bench-press',
        'chest-press-machine',
        'parallel-bar-dip',
        'push-up',
      ],
    },
    fly: { group: 'chest', candidates: ['cable-crossover-fly', 'parallel-bar-dip', 'push-up'] },
    row: {
      group: 'back',
      candidates: [
        't-bar-row',
        'barbell-bent-over-row',
        'one-arm-dumbbell-row',
        'lever-machine-row',
        'seated-cable-row',
      ],
    },
    row_light: {
      group: 'back',
      candidates: [
        'seated-cable-row',
        'lever-machine-row',
        'one-arm-dumbbell-row',
        'barbell-bent-over-row',
      ],
    },
    pull: { group: 'back', candidates: ['pull-up', 'lat-pulldown'] },
    pulldown: { group: 'back', candidates: ['lat-pulldown', 'pull-up'] },
    lower_back: { group: 'back', candidates: ['back-extension', 'superman'] },
    press: {
      group: 'shoulders',
      candidates: ['overhead-barbell-press', 'seated-dumbbell-shoulder-press'],
    },
    press_dumbbells: {
      group: 'shoulders',
      candidates: ['seated-dumbbell-shoulder-press', 'overhead-barbell-press'],
    },
    lateral: {
      group: 'shoulders',
      candidates: ['dumbbell-lateral-raise', 'cable-lateral-raise', 'barbell-upright-row'],
    },
    rear: {
      group: 'shoulders',
      candidates: ['cable-face-pull', 'dumbbell-reverse-fly', 'reverse-pec-deck-fly'],
    },
    biceps: {
      group: 'biceps',
      candidates: ['barbell-curl', 'dumbbell-hammer-curl', 'cable-curl'],
    },
    biceps_other: {
      group: 'biceps',
      candidates: ['dumbbell-hammer-curl', 'cable-curl', 'barbell-curl'],
    },
    triceps: {
      group: 'triceps',
      candidates: ['cable-rope-pushdown', 'ez-bar-skull-crusher', 'parallel-bar-dip'],
    },
    triceps_other: {
      group: 'triceps',
      candidates: ['ez-bar-skull-crusher', 'cable-rope-pushdown', 'parallel-bar-dip'],
    },
    core: { group: 'core', candidates: ['hanging-leg-raise', 'crunch', 'plank'] },
  },
  days: {
    full_body_a: ['squat', 'bench', 'row', 'press', 'biceps', 'core'],
    full_body_b: ['hinge', 'incline', 'pull', 'lateral', 'triceps', 'calves'],
    full_body_c: ['leg_press', 'press_dumbbells', 'row_light', 'leg_curl', 'fly', 'core'],
    upper_a: ['bench', 'row', 'press', 'pull', 'biceps', 'triceps'],
    upper_b: ['incline', 'pulldown', 'lateral', 'row_light', 'triceps_other', 'biceps_other'],
    lower_a: ['squat', 'hinge', 'leg_extension', 'leg_curl', 'calves', 'core'],
    lower_b: ['hip_thrust', 'leg_press', 'lunge', 'leg_curl', 'calves', 'core'],
    chest: ['bench', 'incline', 'fly', 'press', 'lateral', 'triceps'],
    back: ['row', 'pull', 'row_light', 'rear', 'biceps', 'biceps_other'],
    legs: ['squat', 'hinge', 'leg_press', 'leg_curl', 'calves', 'core'],
    push_a: ['bench', 'press', 'incline', 'lateral', 'triceps', 'fly'],
    push_b: ['incline', 'press_dumbbells', 'fly', 'lateral', 'triceps_other', 'triceps'],
    pull_a: ['row', 'pull', 'rear', 'biceps', 'row_light', 'biceps_other'],
    pull_b: ['pulldown', 'row_light', 'rear', 'biceps_other', 'lower_back', 'biceps'],
  },
};
