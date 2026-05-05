import { clearAuthFile } from "../storage";

export async function logout(): Promise<void> {
  await clearAuthFile();
  console.log("Logged out of My Agent Loop.");
}
