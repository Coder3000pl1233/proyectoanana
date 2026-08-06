import { describe, it, expect } from "vitest";
import { Store } from "./store.js";
import { generatePieces } from "./domain.js";
describe("persistencia y reconexión", () => {
  it("recupera el progreso guardado", () => {
    const s = new Store(":memory:");
    const pieces = generatePieces("facil");
    s.create({
      id: "abcdefghijklmnop",
      difficulty: "facil",
      imagePath: "x.webp",
      width: 800,
      height: 600,
      rows: 3,
      cols: 4,
      pieces,
    });
    pieces[1].groupId = pieces[0].groupId;
    s.save("abcdefghijklmnop", pieces, false);
    expect(s.state("abcdefghijklmnop")?.pieces[1].groupId).toBe(
      pieces[0].groupId,
    );
    expect(s.summary("abcdefghijklmnop")?.progress).toBe(17);
  });
});
