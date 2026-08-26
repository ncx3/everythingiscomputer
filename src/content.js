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
const BASE = import.meta.env.BASE_URL;

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
    name: 'Edoardo Bracchi',
    role: 'ARCHITECTURE / LEVEL DESIGN',
    bio:
      'Edoardo Bracchi is an architect and level designer working across spatial design, ' +
      'gaming, and virtual media. Alongside his active collaborations with architecture ' +
      'and landscape design practices, he develops interactive environments and video game ' +
      'spaces. His research centers on spatial storytelling and worldbuilding, exploring ' +
      'the translation of physical architecture and landscape systems into interactive ' +
      'digital worlds.',
    portrait: BASE + 'portraits/edoardo-bracchi.webp',
  },
  {
    name: 'Federico Zurani',
    role: 'GAME DESIGN / CREATIVE TECHNOLOGY',
    bio:
      'Federico Zurani is a game designer and creative technologist. His practice moves ' +
      'between art, game development, and research. He has developed interactive works ' +
      'ranging from exhibition contexts to videogames. His research focuses on the ' +
      'epistemological shift inside open-source investigations, tracing how scientific ' +
      'modelling practices emerge from the use of 3D software and game engines.',
    portrait: BASE + 'portraits/federico-zurani.webp',
  },
  {
    name: 'Laura Cugusi',
    role: 'ART / WRITING / RESEARCH',
    bio:
      'Laura Cugusi is an artist, writer and researcher. Her practice has been nomadic ' +
      'across languages and media. Her research focuses on mapping media ecologies, tech ' +
      'literacies, governance infrastructures and world-building strategies that shape the ' +
      'imagination (or lack thereof) about the future.',
    portrait: BASE + 'portraits/laura-cugusi.webp',
  },
  {
    name: 'machine yearning',
    alias: 'Nada Zanhour',
    role: 'SOUND / VIDEO / 3D / INTERACTIVE',
    bio:
      'machine yearning aka Nada Zanhour works across sound, video, 3D and interactive ' +
      'media. Her research focuses on online aesthetics, internet hyper-niches, meme ' +
      'culture and digital militarism.',
    portrait: BASE + 'portraits/machine-yearning.webp',
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

/**
 * Cuts from the Gamescom build capture. `at` is the in-point in the master
 * recording — kept so a clip can be re-cut without trawling the whole 18
 * minutes again. Poster and clip paths follow from the id by convention.
 */
export const SURVEILLANCE = [
  { id: 'orientation', code: 'SL-01', label: 'ORIENTATION', at: '0:34', dur: '0:51',
    note: 'Do not fear the surveillance. Fear the gaps in it.' },
  { id: 'highlighter', code: 'SL-02', label: 'HIGHLIGHTER', at: '4:02', dur: '0:31',
    note: 'Genocyber Highlighter Component acquired.' },
  { id: 'gatekeeper', code: 'SL-03', label: 'GATEKEEPER', at: '8:42', dur: '0:24',
    note: 'Only agents with Gatekeeper digital ID may pass.' },
  { id: 'dialectics', code: 'SL-04', label: 'DIALECTICS', at: '11:58', dur: '0:28',
    note: 'Progress emerges from the synthesis of opposites.' },
  { id: 'roboteism', code: 'SL-05', label: 'ROBOTEISM', at: '13:14', dur: '0:31',
    note: 'Devotional hardware, stocked on a retail shelf.' },
  { id: 'thestack', code: 'SL-06', label: 'THE STACK', at: '14:12', dur: '0:35',
    note: 'The canon, filed by ideology.' },
].map((c) => ({ ...c, poster: `/clips/${c.id}.webp`, src: `/clips/${c.id}.mp4` }));

export const COMMS = [
  {
    label: 'INSTAGRAM',
    value: '@eeevvverythingggiscomputer',
    href: 'https://www.instagram.com/eeevvverythingggiscomputer',
  },
  {
    label: 'MAIL',
    value: 'eeevvverythingggiscomputer@proton.me',
    href: 'mailto:eeevvverythingggiscomputer@proton.me',
  },
];

export const SECTIONS = [
  { id: 'brief', label: 'BRIEF', count: null },
  { id: 'personnel', label: 'PERSONNEL', count: PERSONNEL.length },
  { id: 'surveillance', label: 'SURVEILLANCE_LOG', count: SURVEILLANCE.length },
  { id: 'comms', label: 'COMMS', count: COMMS.length },
];
