import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export function createFileBirdSpotDirectoryCache(filePath) {
  return {
    readCache: async () => JSON.parse(await fs.readFile(filePath, "utf8")),
    async writeCache(snapshot) {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const temporary = `${filePath}.${randomUUID()}.tmp`;
      try {
        await fs.writeFile(temporary, JSON.stringify(snapshot), { mode: 0o600 });
        await fs.rename(temporary, filePath);
      } finally { await fs.rm(temporary, { force: true }); }
    },
  };
}
