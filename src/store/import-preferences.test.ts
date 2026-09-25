import { expect, it } from "vitest";
import { importPreferencesSchema } from "./import-preferences";
it("defaults to five and bounds independently configurable discovery batches", () => {
 expect(importPreferencesSchema.parse({})).toEqual({initialCount:5,moreCount:5});
 expect(importPreferencesSchema.parse({initialCount:3,moreCount:12})).toEqual({initialCount:3,moreCount:12});
 for(const n of [0,51,1.5]) expect(importPreferencesSchema.safeParse({initialCount:n}).success).toBe(false);
});
