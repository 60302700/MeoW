import { MongoClient } from 'mongodb';

let client = null;

async function main() {
    if (!client) {
        const uri = "mongodb+srv://abdullah123bin_db_user:wNH8rIzb034KqXxN@cluster0.g2cako5.mongodb.net";
        client = new MongoClient(uri);
        try {
            await client.connect();
            db = client.db("Meow");
            console.log("Connected to MongoDB");
            Cats = db.collection("Cats");
            Users = db.collection("Users");
            EEvent = db.collection("Emegency Event");
            Gurdian = db.collection("Gurdian");

        } finally {
            await client.close();
        }
    }
}