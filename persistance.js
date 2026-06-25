import { MongoClient } from 'mongodb';

let client = null;
let db = null;
let Cats = null;
let Users = null;
let EEvent = null;
let Gurdian = null;

async function connectDB() {
    if (!client) {
        const uri = "mongodb+srv://abdullah123bin_db_user:wNH8rIzb034KqXxN@cluster0.g2cako5.mongodb.net";
        client = new MongoClient(uri);
        await client.connect();
        db = client.db("MeoW");
        console.log("Connected to MongoDB");
        Cats = db.collection("Cats");
        Users = db.collection("Users");
        EEvent = db.collection("Emegency Event");
        Gurdian = db.collection("Gurdian");
    }
}

async function Login(username, password) {
    await connectDB();
    console.log({ Username: username, password: password });
    const user = await Users.findOne({ Username: username, password: password });
    console.log(user);
    return user;
}

async function testLogin() {
    await Login("Jane", "123456789");
}

testLogin();