import rawStrings from "./strings.json";

export interface Strings {
  gameTitle: string;
  gameSubtitle: string;
}

// CD-16 title slot: edit strings.json to rename the game — title screen,
// top-bar h1, and document.title all read from here, zero code changes.
export const STRINGS = rawStrings as Strings;
