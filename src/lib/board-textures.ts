/** borderInset is the painted frame width as a fraction of the 1254px asset.
 * User-supplied board images. Colours also provide contrast and asset-error fallbacks. */
export const BOARD_TEXTURES = [
  { id: "olive-ebony", borderInset: 5 / 1254, name: "Olive & Ebony", lightSquare: "#dba45e", darkSquare: "#382b24", asset: "/boards/olive-ebony.png" },
  { id: "ivory-ebony", borderInset: 3 / 1254, name: "Ivory & Ebony", lightSquare: "#eddbbc", darkSquare: "#20221f", asset: "/boards/ivory-ebony.png" },
  { id: "natural-walnut", borderInset: 3 / 1254, name: "Natural Walnut", lightSquare: "#e8d3b1", darkSquare: "#79543b", asset: "/boards/natural-walnut.png" },
  { id: "silver-ash", borderInset: 3 / 1254, name: "Silver Ash", lightSquare: "#d7d6d2", darkSquare: "#202326", asset: "/boards/silver-ash.png" },
  { id: "warm-rosewood", borderInset: 4 / 1254, name: "Warm Rosewood", lightSquare: "#dda888", darkSquare: "#44292b", asset: "/boards/warm-rosewood.png" },
  { id: "smoked-oak", borderInset: 4 / 1254, name: "Smoked Oak", lightSquare: "#d1cbbb", darkSquare: "#46453d", asset: "/boards/smoked-oak.png" },
] as const;
export type BoardTextureId = typeof BOARD_TEXTURES[number]["id"];
export const boardTexture = (id: string) => BOARD_TEXTURES.find(texture => texture.id === id);
