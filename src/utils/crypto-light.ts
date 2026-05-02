/**
 * Light obfuscation for SMTP password at rest.
 * NOT cryptographically strong — purpose is "not plaintext on disk".
 * For real security, use OS keychain (future enhancement).
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const ALGO = "aes-256-gcm";

function deriveKey(seed: string): Buffer {
	return createHash("sha256").update(`atlas:${seed}:v1`).digest();
}

export function encryptLight(plaintext: string, vaultId: string): string {
	if (!plaintext) return "";
	const key = deriveKey(vaultId);
	const iv = randomBytes(12);
	const cipher = createCipheriv(ALGO, key, iv);
	const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
	const tag = cipher.getAuthTag();
	return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptLight(ciphertext: string, vaultId: string): string {
	if (!ciphertext) return "";
	if (!ciphertext.startsWith("v1:")) return ciphertext; // legacy plaintext
	const parts = ciphertext.split(":");
	if (parts.length !== 4) return "";
	try {
		const key = deriveKey(vaultId);
		const iv = Buffer.from(parts[1], "base64");
		const tag = Buffer.from(parts[2], "base64");
		const enc = Buffer.from(parts[3], "base64");
		const decipher = createDecipheriv(ALGO, key, iv);
		decipher.setAuthTag(tag);
		const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
		return dec.toString("utf8");
	} catch {
		return "";
	}
}
