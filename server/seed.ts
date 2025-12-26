import { storage } from "./storage";

async function seed() {
  console.log("Seeding database...");

  // Create admin user with username Lewis.barron
  try {
    const existingAdmin = await storage.getUserByUsername("Lewis.barron");
    if (!existingAdmin) {
      await storage.createUser({
        username: "Lewis.barron",
        password: "testtest",
        role: "admin",
        status: "active",
      });
      console.log("✓ Created admin user (username: Lewis.barron)");
    } else {
      console.log("✓ Admin user already exists");
    }
  } catch (error) {
    console.error("Error creating admin user:", error);
  }

  // Create sample care workers
  const careWorkers = [
    { name: "L.Barron", role: "Care Coordinator" },
    { name: "S.Jones", role: "Carer" },
    { name: "M.Smith", role: "Carer" },
    { name: "M.Williams", role: "Carer" },
    { name: "K.Thompson", role: "Senior Carer" },
    { name: "J.Doe", role: "Carer" },
  ];

  for (const worker of careWorkers) {
    try {
      const workers = await storage.getAllCareWorkers();
      const exists = workers.find(w => w.name === worker.name);
      if (!exists) {
        await storage.createCareWorker(worker);
        console.log(`✓ Created care worker: ${worker.name}`);
      }
    } catch (error) {
      console.error(`Error creating care worker ${worker.name}:`, error);
    }
  }

  console.log("Seeding complete!");
  process.exit(0);
}

seed();
