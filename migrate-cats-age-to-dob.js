import "dotenv/config";
import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || "Meow";

function ageToDob(age) {
  const years = parseInt(age, 10) || 0;
  const birthYear = new Date().getFullYear() - years;
  return new Date(Date.UTC(birthYear, 0, 1));
}

async function main() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(MONGODB_DB_NAME);
  const Cats = db.collection("Cats");

  const legacyCats = await Cats.find({
    dob: { $exists: false },
  }).toArray();

  console.log(`Found ${legacyCats.length} cat(s) to migrate.`);

  let migrated = 0;
  for (const cat of legacyCats) {
    const dob = ageToDob(cat.age);
    await Cats.updateOne(
      { _id: cat._id },
      { $set: { dob }, $unset: { age: "" } },
    );
    migrated++;
  }

  console.log(`Migrated ${migrated} cat(s).`);
  await client.close();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
