import { storage } from "./server/storage.ts";

async function run() {
  try {
    const existingAdmin = await storage.getUserByUsername("Lewis.Barron");
    if (!existingAdmin) {
      await storage.createUser({
        username: "Lewis.Barron",
        password: "testtest",
        role: "admin",
        status: "active",
      });
      console.log("Successfully inserted Lewis.Barron");
    } else {
      console.log("User Lewis.Barron already exists.");
    }
  } catch (error) {
    console.error("Error inserting user:", error);
  }
  process.exit(0);
}

run();
