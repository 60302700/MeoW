import express, { Router } from "express";
import { registerUser, authenticateUser, handleScan, getEmergencyView, claimGuardian, engine, checkSessionMiddleware } from "./presentation.js";
import { connectDB } from "./persistance.js";

const app = express();

app.engine("hbs", engine({ extname: ".hbs" }));
app.engine("handlebars", engine({ extname: ".handlebars" }));
app.set("view engine", "hbs");
app.set("views", "./views");

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));

app.use(async (req, res, next) => {
    const pages = ["/", "/register", "/login", "/scan", "/scan/:eventId"];
    if (pages.includes(req.url)) {
        next();
    }
    const session = false;
    if (true) {
        const c = req.headers.cookie.session
        console.log(c.split("="));
    }
    if (session) {
        const valid = await checkSessionMiddleware(session);
        if (valid) {
            next();
        } else {
            res.redirect("/");
        }
    }
});


app.get("/register", (req, res) => {
    res.render("register", { title: "Register" });
});

app.get("/login", (req, res) => {
    res.redirect("/");
});

app.get("/emergency", (req, res) => {
    res.redirect("/scan");
});

app.post("/register", async (req, res) => {
    const { name, email, phone, password } = req.body;
    try {
        await registerUser({ name, email, phone, password });
        res.redirect("/register?success=1");
    } catch (err) {
        res.render("register", {
            title: "Register",
            error: err.message,
            values: { name, email, phone },
        });
    }
});

app.get("/", (req, res) => {
    res.render("login.hbs", { title: "Login" });
});

app.post("/login", async (req, res) => {
    const { email, password } = req.body;
    try {
        const session = await authenticateUser(email, password);
        if (!session) {
            res.render("login.handlebars", { layout: false, title: "Login", error: "Invalid email or password", values: { email: email } });
            return;
        } else {
            res.cookie("session", session, { httpOnly: true });
            res.redirect("/scan");
        }
    } catch (err) {
        res.render("login.handlebars", { layout: false, title: "Login", error: err.message, values: { email: email } });
    }
});

app.get("/scan", (req, res) => {
    res.render("scan", { title: "MeoW Safety Gateway" });
});

app.post("/scan", async (req, res) => {
    const { qrCodeId } = req.body;
    try {
        const { eventId } = await handleScan(qrCodeId);
        res.redirect(`/scan/${eventId}`);
    } catch (err) {
        res.render("scan", { title: "MeoW Safety Gateway", error: err.message });
    }
});

app.get("/scan/:eventId", async (req, res) => {
    try {
        const { event, cat, guardians } = await getEmergencyView(req.params.eventId);
        res.render("scan", {
            title: "MeoW Safety Gateway",
            emergency: true,
            event,
            cat,
            guardians,
            claimed: event.status !== "ALERTED",
        });
    } catch (err) {
        res.render("scan", { title: "MeoW Safety Gateway", error: err.message });
    }
});

app.post("/scan/:eventId/claim", async (req, res) => {
    const { guardianId } = req.body;
    try {
        await claimGuardian(req.params.eventId, guardianId);
    } finally {
        res.redirect(`/scan/${req.params.eventId}`);
    }
});

const port = process.env.PORT || 3000;
connectDB().then(() => {
    app.listen(port, () => {
        console.log(`Server listening on http://localhost:${port}`);
    });
});