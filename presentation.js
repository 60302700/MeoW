import express from 'express';
import { engine } from 'express-handlebars';
import { AuthenticateUser } from "./business.js";
import { connectDB } from "./persistance.js";

const app = express();
const PORT = process.env.PORT || 3000;

// Configure Handlebars engine
app.engine('handlebars', engine());
app.set('view engine', 'handlebars');
app.set('views', './views');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
    res.render('login', { layout: false });
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await AuthenticateUser(username, password);
        if (user) {
            res.send(`Login successful! Welcome ${user.name || username}`);
        } else {
            res.render('login', { layout: false, error: 'Invalid username or password' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).send("Internal Server Error");
    }
});

// Start the server
async function startServer() {
    try {
        await connectDB();
        app.listen(PORT, () => {
            console.log(`Server is running at http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error("Failed to start server:", err);
    }
}

startServer();