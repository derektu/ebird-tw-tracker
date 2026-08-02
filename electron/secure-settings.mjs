import fs from "node:fs/promises";
import path from "node:path";

export function createSecureSettingsStore({ filePath, safeStorage }) {
  async function writeEncrypted(value) {
    if (!(await safeStorage.isAsyncEncryptionAvailable())) {
      throw Object.assign(new Error("系統安全儲存空間目前不可用"), { statusCode: 503 });
    }
    const encrypted = await safeStorage.encryptStringAsync(JSON.stringify(value));
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.tmp`;
    await fs.writeFile(temporaryPath, encrypted, { mode: 0o600 });
    await fs.rename(temporaryPath, filePath);
    await fs.chmod(filePath, 0o600);
  }

  async function read() {
    try {
      const encrypted = await fs.readFile(filePath);
      if (!(await safeStorage.isAsyncEncryptionAvailable())) return {};
      const decrypted = await safeStorage.decryptStringAsync(encrypted);
      const value = JSON.parse(decrypted.result);
      if (decrypted.shouldReEncrypt) await writeEncrypted(value);
      return value;
    } catch (error) {
      if (error.code === "ENOENT") return {};
      throw error;
    }
  }

  return { read, write: writeEncrypted };
}
