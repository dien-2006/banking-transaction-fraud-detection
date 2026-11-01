import { readFile } from "node:fs/promises";
import ts from "typescript";
const cache = new Map();
export async function moduleUrl(name) {
  if (cache.has(name)) return cache.get(name);
  let source = ts.transpileModule(
    await readFile(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  for (const match of source.matchAll(/from "\.\/([\w-]+)"/g))
    source = source.replace(match[0], `from "${await moduleUrl(match[1])}"`);
  const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  cache.set(name, url);
  return url;
}
