import { describe, it, expect } from "vitest";
import { extractEmbedded } from "./extract-embedded";

describe("extractEmbedded", () => {
  it("returns full code when markers are not found", () => {
    const code = "const x = 1;\nconst y = 2;";
    expect(extractEmbedded(code)).toBe(code);
  });

  it("extracts code between markers", () => {
    const code = `import { something } from 'other'
// embed-begin
const x = 1;
const y = 2;
// embed-end
const z = 3;`;

    const result = extractEmbedded(code);
    expect(result).toContain("const x = 1;");
    expect(result).toContain("const y = 2;");
    expect(result).not.toContain("const z = 3;");
  });

  it("keeps domo-actors imports", () => {
    const code = `import { Actor } from 'domo-actors'
import { something } from 'other'
// embed-begin
const x = 1;
// embed-end`;

    const result = extractEmbedded(code);
    expect(result).toContain("import { Actor } from 'domo-actors'");
    expect(result).not.toContain("import { something } from 'other'");
  });

  it("replaces non-domo-actors imports with //...", () => {
    const code = `import { Actor } from 'domo-actors'
import { something } from 'other'
import { another } from 'third'
// embed-begin
const x = 1;
// embed-end`;

    const result = extractEmbedded(code);
    expect(result).toContain("import { Actor } from 'domo-actors'");
    expect(result).toContain("//...");
    expect(result).not.toContain("import { something } from 'other'");
    expect(result).not.toContain("import { another } from 'third'");
  });

  it("handles code with only non-domo-actors imports", () => {
    const code = `import { something } from 'other'
// embed-begin
const x = 1;
// embed-end`;

    const result = extractEmbedded(code);
    expect(result).toContain("//...");
    expect(result).toContain("const x = 1;");
    expect(result).not.toContain("import { something } from 'other'");
  });

  it("handles code with no imports", () => {
    const code = `// embed-begin
const x = 1;
// embed-end`;

    const result = extractEmbedded(code);
    expect(result).toBe("const x = 1;");
  });

  it("trims whitespace from embedded section", () => {
    const code = `// embed-begin
    
    const x = 1;
    
    // embed-end`;

    const result = extractEmbedded(code);
    expect(result.trim()).toBe("const x = 1;");
  });
});
