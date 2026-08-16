import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { execFile as execFileCallback } from "node:child_process";

const execFile = promisify(execFileCallback);
const source = resolve("assets/search-app-icon-source.svg");
const outputDirectory = resolve("public/icons");
const rasterVariants = [
  [32, "search-icon-32.png"],
  [180, "search-apple-touch-icon.png"],
  [192, "search-icon-192.png"],
  [512, "search-icon-512.png"],
];

await mkdir(outputDirectory, { recursive: true });
await cp(source, resolve(outputDirectory, "search-icon.svg"));

for (const [size, filename] of rasterVariants) {
  const output = resolve(outputDirectory, filename);
  await mkdir(dirname(output), { recursive: true });
  await execFile("sips", ["-s", "format", "png", "-z", String(size), String(size), source, "--out", output]);
}
