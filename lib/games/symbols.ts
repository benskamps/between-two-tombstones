// Carved symbols for Tombstone Bingo, with their traditional meanings as
// commonly given in cemetery symbolism guides. One short line each; where a
// symbol has more than one common reading, both are given.

export type GraveSymbol = {
  id: string;
  /** Full name, shown with the meaning. */
  name: string;
  /** Short label that fits a bingo square on a phone. */
  label: string;
  meaning: string;
};

export const FREE_SQUARE: GraveSymbol = {
  id: "rip",
  name: "R.I.P.",
  label: "R.I.P.",
  meaning: "Requiescat in pace: “rest in peace.” Free square.",
};

export const SYMBOLS: GraveSymbol[] = [
  { id: "lamb", name: "Lamb", label: "Lamb", meaning: "Innocence; most often marks a child’s grave." },
  { id: "weeping-willow", name: "Weeping willow", label: "Weeping willow", meaning: "Mourning and grief." },
  { id: "draped-urn", name: "Draped urn", label: "Draped urn", meaning: "Mourning; the soul’s departure from the body." },
  { id: "broken-column", name: "Broken column", label: "Broken column", meaning: "A life cut short." },
  { id: "clasped-hands", name: "Clasped hands", label: "Clasped hands", meaning: "Farewell, or reunion in the afterlife." },
  { id: "winged-hourglass", name: "Winged hourglass", label: "Winged hourglass", meaning: "Time flies." },
  { id: "inverted-torch", name: "Inverted torch", label: "Upside-down torch", meaning: "A life extinguished." },
  { id: "anchor", name: "Anchor", label: "Anchor", meaning: "Hope; sometimes a sailor’s grave." },
  { id: "square-compass", name: "Square and compass", label: "Square & compass", meaning: "A Freemason." },
  { id: "three-links", name: "Three chain links", label: "Three links", meaning: "Odd Fellows: friendship, love and truth." },
  {
    id: "tree-stump",
    name: "Tree stump (Woodmen of the World)",
    label: "Tree stump",
    meaning: "A Woodmen of the World member; also a life cut short.",
  },
  { id: "gar-star", name: "GAR star", label: "GAR star", meaning: "Grand Army of the Republic: a Union Civil War veteran." },
  {
    id: "white-bronze",
    name: "White bronze marker",
    label: "Zinc marker",
    meaning: "Cast zinc, blue-gray; sold from the 1870s to about 1914.",
  },
  { id: "open-book", name: "Open book", label: "Open book", meaning: "The Book of Life, or scripture." },
  { id: "dove", name: "Dove", label: "Dove", meaning: "Peace; the Holy Spirit; the soul at rest." },
  { id: "ivy", name: "Ivy", label: "Ivy", meaning: "Friendship, faithfulness and undying memory." },
  { id: "oak-leaves", name: "Oak leaves", label: "Oak leaves", meaning: "Strength, endurance and a long life." },
  { id: "wheat-sheaf", name: "Wheat sheaf", label: "Wheat sheaf", meaning: "A long, fruitful life; the harvest of old age." },
  { id: "praying-hands", name: "Praying hands", label: "Praying hands", meaning: "Devotion; a prayer for eternal life." },
  { id: "cross", name: "Cross", label: "Cross", meaning: "Christian faith." },
  { id: "star-of-david", name: "Star of David", label: "Star of David", meaning: "Jewish faith." },
  { id: "crown", name: "Crown", label: "Crown", meaning: "Victory over death; the crown of glory." },
  { id: "angel", name: "Angel", label: "Angel", meaning: "A guardian guiding the soul to heaven." },
  { id: "cherub", name: "Cherub", label: "Cherub", meaning: "Innocence; often on a child’s grave." },
  { id: "rosebud", name: "Rosebud", label: "Rosebud", meaning: "A child or young person, gone before full bloom." },
  { id: "fern", name: "Fern", label: "Fern", meaning: "Humility and sincerity; a Victorian favorite." },
  { id: "lily", name: "Lily", label: "Lily", meaning: "Purity and resurrection." },
  { id: "ihs", name: "IHS", label: "IHS", meaning: "The first letters of Jesus’ name in Greek." },
  {
    id: "skull-crossbones",
    name: "Skull and crossbones",
    label: "Skull & bones",
    meaning: "Mortality; common on stones from the 1600s and 1700s.",
  },
  {
    id: "deaths-head",
    name: "Death’s head (winged skull)",
    label: "Winged skull",
    meaning: "Remember that you will die; early New England stones.",
  },
  { id: "soul-effigy", name: "Soul effigy (winged face)", label: "Winged face", meaning: "The soul flying to heaven." },
  { id: "laurel-wreath", name: "Laurel wreath", label: "Laurel wreath", meaning: "Victory, honor and distinction." },
  {
    id: "all-seeing-eye",
    name: "Eye of Providence",
    label: "All-seeing eye",
    meaning: "The eye of God watching over all; also Masonic.",
  },
  { id: "hand-up", name: "Hand pointing up", label: "Hand pointing up", meaning: "The soul has gone to heaven." },
  {
    id: "hand-down",
    name: "Hand pointing down",
    label: "Hand pointing down",
    meaning: "God reaching down for the soul; sometimes a sudden death.",
  },
  { id: "obelisk", name: "Obelisk", label: "Obelisk", meaning: "Eternal life; an Egyptian Revival favorite." },
  { id: "poppy", name: "Poppy", label: "Poppy", meaning: "Eternal sleep, and remembrance." },
  { id: "scythe", name: "Scythe", label: "Scythe", meaning: "Death the reaper; a life cut down." },
  { id: "rising-sun", name: "Rising sun", label: "Rising sun", meaning: "Resurrection and renewal." },
  { id: "chalice", name: "Chalice", label: "Chalice", meaning: "Holy Communion; often a priest’s grave." },
  { id: "celtic-cross", name: "Celtic cross", label: "Celtic cross", meaning: "Christian faith with Irish or Scottish roots." },
  { id: "butterfly", name: "Butterfly", label: "Butterfly", meaning: "Resurrection; sometimes a short life." },
  { id: "trumpet", name: "Trumpet", label: "Trumpet", meaning: "The call to rise on Judgment Day." },
  {
    id: "blessing-hands",
    name: "Blessing hands (thumbs touching)",
    label: "Blessing hands",
    meaning: "A Kohen, descended from the ancient Jewish priests.",
  },
  { id: "elks", name: "Elk head (BPOE)", label: "Elk head", meaning: "A member of the Benevolent and Protective Order of Elks." },
];

const BY_ID = new Map([FREE_SQUARE, ...SYMBOLS].map((s) => [s.id, s]));

export function symbolById(id: string): GraveSymbol | undefined {
  return BY_ID.get(id);
}
