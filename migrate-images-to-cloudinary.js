import "dotenv/config";
import { MongoClient } from "mongodb";
import { uploadImageDataUri } from "./cloudinary.js";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || "Meow";

const targets = [
  { collection: "Users", folder: "profiles" },
  { collection: "Cats", folder: "cats" },
  { collection: "Guardians", folder: "guardians" },
];

async function migrateCollection(db, collectionName, folder) {
  const coll = db.collection(collectionName);
  const docs = await coll
    .find({ photoUrl: { $regex: "^data:" } })
    .toArray();

  console.log(`${collectionName}: ${docs.length} base64 image(s) to migrate`);

  let migrated = 0;
  let failed = 0;
  for (const doc of docs) {
    try {
      const secureUrl = await uploadImageDataUri(doc.photoUrl, folder);
      await coll.updateOne(
        { _id: doc._id },
        { $set: { photoUrl: secureUrl } },
      );
      migrated++;
    } catch (err) {
      failed++;
      console.error(`  failed for ${collectionName} ${doc._id}:`, err.message);
    }
  }
  console.log(`${collectionName}: migrated ${migrated}, failed ${failed}`);
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  console.log(`Connected to MongoDB (${dbName})`);

  for (const { collection, folder } of targets) {
    await migrateCollection(db, collection, folder);
  }

  await client.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
