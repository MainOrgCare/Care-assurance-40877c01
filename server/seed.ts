import { storage } from "./storage";

async function seed() {
  console.log("Seeding database...");

  // Create admin user with username Lewis.Barron
  try {
    const existingAdmin = await storage.getUserByUsername("Lewis.Barron");
    if (!existingAdmin) {
      await storage.createUser({
        username: "Lewis.Barron",
        password: "testtest",
        role: "admin",
        status: "active",
      });
      console.log("✓ Created admin user (username: Lewis.Barron)");
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

  // Seed default GDPR retention policies
  const retentionPolicies = [
    { 
      dataCategory: 'session_history', 
      retentionDays: 730, // 2 years
      legalBasis: 'legitimate_interests',
      description: 'User login/logout history for security monitoring'
    },
    { 
      dataCategory: 'gdpr_audit_logs', 
      retentionDays: 2555, // 7 years
      legalBasis: 'legal_obligation',
      description: 'GDPR compliance audit trail - required for accountability'
    },
    { 
      dataCategory: 'system_logs', 
      retentionDays: 365, // 1 year
      legalBasis: 'legitimate_interests',
      description: 'System events and error logs for troubleshooting'
    },
    { 
      dataCategory: 'ai_usage_logs', 
      retentionDays: 2555, // 7 years
      legalBasis: 'legal_obligation',
      description: 'AI processing logs for compliance and billing'
    },
  ];

  for (const policy of retentionPolicies) {
    try {
      await storage.upsertRetentionPolicy(policy);
      console.log(`✓ Set retention policy: ${policy.dataCategory} (${policy.retentionDays} days)`);
    } catch (error) {
      console.error(`Error setting policy ${policy.dataCategory}:`, error);
    }
  }

  console.log("Seeding complete!");
  process.exit(0);
}

seed();
