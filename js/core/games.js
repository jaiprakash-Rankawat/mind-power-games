/* Single source of truth for the hub, the practice shell and the Brain Test.
   Adding a game = drop a module in js/games/ and add an entry here.

   Registry order is the Brain Test order. `official` holds the fixed settings a
   game is played at in the Brain Test; practice lets the player choose. */

export const GAMES = [
  {
    id: 'stroop',
    name: 'Color Clash',
    tagline: 'The word says one color, the ink says another. Trust the ink.',
    skills: 'Focus · Impulse control',
    module: 'stroop.js',
    locked: false,
    modes: ['easy', 'medium', 'hard'],
    category: 'Attention',
    official: { difficulty: 'medium' },
    minutes: 1,
    instruction: 'Tap the colour of the ink - not the colour the word names.',
    keys: 'Keys 1-6, or tap the colour'
  },
  {
    id: 'memory-grid',
    name: 'Memory Grid',
    tagline: 'Recall a flashing path that grows one tile at a time.',
    skills: 'Working memory',
    module: 'memory-grid.js',
    locked: false,
    modes: ['easy', 'medium', 'hard'],
    category: 'Visual Memory',
    official: { difficulty: 'easy' },
    minutes: 1.5,
    instruction: 'Watch the tiles light up, then tap them in the same order. The path grows each level.',
    keys: 'Tap or click the tiles'
  },
  {
    id: 'n-back',
    name: 'N-Back',
    tagline: 'Flag the item that matches the one N steps back. N adapts to you.',
    skills: 'Working memory · Updating',
    module: 'n-back.js',
    locked: false,
    modes: ['easy', 'medium', 'hard'],
    category: 'Working Memory',
    official: { difficulty: 'easy', blocks: 3 },
    minutes: 3,
    instruction: 'Press MATCH when the square is where it was 2 steps earlier. The level adapts as you go.',
    keys: 'Space or tap MATCH'
  },
  {
    id: 'reaction',
    name: 'Reaction Speed',
    tagline: 'Hit the light the instant it appears - then pick the right side, fast.',
    skills: 'Processing speed',
    module: 'reaction.js',
    locked: false,
    modes: ['easy', 'medium', 'hard'],
    category: 'Processing Speed',
    official: { difficulty: 'medium' },
    minutes: 1.5,
    instruction: 'Press the moment the light appears. Then press the side it lights up on.',
    keys: 'Space, then F / J - or tap'
  },
  {
    id: 'task-switch',
    name: 'Task Switch',
    tagline: 'Odd or even? Low or high? The question keeps changing - keep up.',
    skills: 'Cognitive flexibility',
    module: 'task-switch.js',
    locked: false,
    modes: ['easy', 'medium', 'hard'],
    category: 'Cognitive Flexibility',
    official: { difficulty: 'medium' },
    minutes: 1.5,
    instruction: 'Answer the question on each card: ODD or EVEN, or LOW or HIGH. The question changes.',
    keys: 'F = odd / low, J = even / high - or tap'
  },
  {
    id: 'number-pattern',
    name: 'Number Pattern',
    tagline: 'Six numbers, one hidden rule. What comes next?',
    skills: 'Reasoning',
    module: 'number-pattern.js',
    locked: false,
    modes: ['easy', 'medium', 'hard'],
    category: 'Fluid Reasoning',
    official: { difficulty: 'medium' },
    minutes: 2,
    instruction: 'Six numbers follow one rule. Pick the number that comes next. Patterns get harder as you get them right.',
    keys: 'Keys 1-4, or tap an answer'
  },
  {
    id: 'spatial-rotation',
    name: 'Spatial Rotation',
    tagline: 'Same shape turned around - or its mirror image?',
    skills: 'Spatial reasoning',
    module: 'spatial-rotation.js',
    locked: false,
    modes: ['easy', 'medium', 'hard'],
    category: 'Visuospatial Reasoning',
    official: { difficulty: 'medium' },
    minutes: 1.5,
    instruction: 'Is the right shape the left one turned around, or its mirror image? Accuracy first, then speed.',
    keys: 'F = same, J = mirror - or tap'
  },
  {
    id: 'sequence-recall',
    name: 'Sequence Recall',
    tagline: 'Digits flash one by one. Type them back in the same order.',
    skills: 'Working memory · Order',
    module: 'sequence-recall.js',
    locked: false,
    modes: ['easy', 'medium', 'hard'],
    category: 'Sequence Memory',
    official: { difficulty: 'medium' },
    minutes: 1.5,
    instruction: 'Watch the digits appear one at a time, then type them back in the same order. Each correct answer adds a digit.',
    keys: 'Keys 1-9, Backspace to undo - or tap'
  },
  {
    id: 'visual-tracking',
    name: 'Visual Tracking',
    tagline: 'One turns red, then they all look alike and move. Keep your eyes on it.',
    skills: 'Visual attention · Tracking',
    module: 'visual-tracking.js',
    locked: false,
    modes: ['easy', 'medium', 'hard'],
    category: 'Visual Tracking',
    official: { difficulty: 'medium' },
    minutes: 1.5,
    instruction: 'Follow the red object with your eyes while they all move, then pick it out when they stop.',
    keys: 'Click the object, or press its number'
  },
  {
    id: 'attention-storm',
    name: 'Attention Storm',
    tagline: 'Shapes flash past. Catch every star - and ignore the look-alikes.',
    skills: 'Sustained attention · Holding back',
    module: 'attention-storm.js',
    locked: false,
    modes: ['easy', 'medium', 'hard'],
    category: 'Sustained Attention',
    official: { difficulty: 'medium' },
    minutes: 2,
    instruction: 'Shapes flash one at a time. Press only for the five-point star - not for the shapes that look like it.',
    keys: 'Space or tap for the star'
  },
  {
    id: 'path-finder',
    name: 'Path Finder',
    tagline: 'Plan the best route through the maze - every step counts.',
    skills: 'Planning · Spatial problem solving',
    module: 'path-finder.js',
    locked: false,
    modes: ['easy', 'medium', 'hard'],
    category: 'Planning',
    official: { difficulty: 'medium' },
    minutes: 2,
    instruction: 'Walk from the start to the flag in as few steps as possible. Every step counts, so plan the route first.',
    keys: 'Arrow keys or WASD - or click the next square'
  }
];

export const getGame = (id) => GAMES.find((g) => g.id === id) || null;
