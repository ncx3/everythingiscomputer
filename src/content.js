/**
 * Site content, in one place.
 *
 * The screen mock reads from here today; the real DOM TUI will read from the
 * same place, so filling this file in is the only thing content edits require.
 */

/**
 * Personnel are identified by a code, never by a position in a list — there is
 * no first, second or third author here.
 *
 * The code is derived from the name rather than rolled at load time, so a
 * person's identifier is stable across sessions and shareable, while still
 * carrying no ordering information. FNV-1a, then folded into a shape that
 * reads like a corporate record number.
 */
function codeFor(name) {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h >>>= 0;
  // Letters chosen to stay unambiguous in a monospace face: no I/O/Q/S/U/Z.
  const L = 'ACDEFHJKLMNPRTVWXY';
  const a = L[h % L.length];
  const b = L[(h >>> 5) % L.length];
  return `${a}${b}-${String((h >>> 11) % 10000).padStart(4, '0')}`;
}

const CREW = [
  {
    name: 'Federico Zurani',
    role: 'GAME DESIGN / CREATIVE TECHNOLOGY',
    bio:
      'Federico Zurani is a game designer and creative technologist. His practice moves ' +
      'between art, game development, and research. He has developed interactive works ' +
      'ranging from exhibition contexts to videogames. His research focuses on the ' +
      'epistemological shift inside open-source investigations, tracing how scientific ' +
      'modelling practices emerge from the use of 3D software and game engines.',
    portrait: '/portraits/federico-zurani.webp',
  },
  {
    name: 'Laura Cugusi',
    role: 'ART / WRITING / RESEARCH',
    bio:
      'Laura Cugusi is an artist, writer and researcher. Her practice has been nomadic ' +
      'across languages and media. Her research focuses on mapping media ecologies, tech ' +
      'literacies, governance infrastructures and world-building strategies that shape the ' +
      'imagination (or lack thereof) about the future.',
    portrait: '/portraits/laura-cugusi.webp',
  },
  {
    name: 'machine yearning',
    alias: 'Nada Zanhour',
    role: 'SOUND / VIDEO / 3D / INTERACTIVE',
    bio:
      'machine yearning aka Nada Zanhour works across sound, video, 3D and interactive ' +
      'media. Her research focuses on online aesthetics, internet hyper-niches, meme ' +
      'culture and digital militarism.',
    portrait: '/portraits/machine-yearning.webp',
  },
];

/** Sorted by code, which is to say: in no meaningful order at all. */
export const PERSONNEL = CREW.map((p) => ({ ...p, code: codeFor(p.name) })).sort((a, b) =>
  a.code.localeCompare(b.code)
);

export const TITLE = 'EVERYTHING IS COMPUTER';

export const BRIEF = [
  'Everything Is Computer is a "game essay" set in the aftermath of a Thielian ' +
    'apocalypse, where a Superintelligence/AGI cult has taken over, devoured the ' +
    "earth's marrow and drained humans of their life force. In a spectral landscape of " +
    'decaying architecture of startup dreams and broken pitch decks, the delusional ' +
    'myths of tech-bro culture are left entangled with the ideological fallout of ' +
    'techno-libertarian prophets. As players navigate its ruins, they sift through ' +
    'venture capital slogans turned scripture and user manuals reborn as sacred texts, ' +
    'piecing together the fragmented mythos the cult has left behind, in an act of ' +
    'ideological excavation to uncover the hidden beliefs that once powered the ' +
    'machine-god empire.',
  "The game's narrative emerges from the digital footprint of Silicon Valley's " +
    'self-declared visionaries such as Peter Thiel, Curtis Yarvin, and Sam Altman, among ' +
    'many others orbiting the tech-broligarc circle jerk. Tweets, essays, interviews, and ' +
    'other texts shape the architecture of a world haunted by the collapse of its own ' +
    'futurist promises.',
];

/** Placeholders until the real material lands. */
export const SURVEILLANCE = [{ label: 'PLAYTHROUGH', status: 'AWAITING UPLOAD' }];

export const COMMS = [
  { label: 'DISCORD', value: '████████████' },
  { label: 'INSTAGRAM', value: '████████████' },
  { label: 'PRESS', value: '████████████' },
  { label: 'MAIL', value: '████████████' },
];

export const SECTIONS = [
  { id: 'brief', label: 'BRIEF', count: null },
  { id: 'personnel', label: 'PERSONNEL', count: PERSONNEL.length },
  { id: 'surveillance', label: 'SURVEILLANCE_LOG', count: SURVEILLANCE.length },
  { id: 'comms', label: 'COMMS', count: COMMS.length },
];
