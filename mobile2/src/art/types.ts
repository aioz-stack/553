/** One layer of an exported art piece, in the piece's own design units (see scripts/art/exporter.js). */
export interface ArtLayer {
  kind: 'still' | 'anim';
  x: number;
  y: number;
  w: number;
  h: number;
  /** Metro asset id (a bundled require). */
  src: number;
  /** CSS animation this layer had on the web (replayed natively by ui/Art.tsx). */
  anim?: string;
  duration?: number;
  delay?: number;
  timing?: string;
  /** Rotation/scale pivot, in design units. */
  pivotX?: number;
  pivotY?: number;
  /** Local units → design units (for translations). */
  unit?: number;
  /** The layer is mirrored (rotations turn the other way). */
  flip?: boolean;
}

export interface ArtManifest {
  width: number;
  height: number;
  layers: ArtLayer[];
}
