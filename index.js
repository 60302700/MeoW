import express, { Router } from "express";
import { logoutUser, registerUser, authenticateUser, handleScan, getEmergencyView, claimGuardian, engine, checkSessionMiddleware } from "./presentation.js";
import { connectDB } from "./persistance.js";

const app = express();

app.engine("hbs", engine({ extname: ".hbs" }));
app.engine("handlebars", engine({ extname: ".handlebars" }));
app.set("view engine", "hbs");
app.set("views", "./views");

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));

// ── Session middleware ──────────────────────────────────────────────────────
// Manually parse the session cookie from the Cookie header.
function getSessionCookie(req) {
    const cookieHeader = req.headers.cookie || "";
    const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
}

async function Loggedin(req) {
    const isLoggedIn = getSessionCookie(req)
    if (!isLoggedIn) {
        return false;
    }
    const valid = await checkSessionMiddleware(isLoggedIn);
    if (!valid) {
        return false;
    }
    return true;
}

async function requireAuth(req, res, next) {
    const sessionId = getSessionCookie(req);
    if (!sessionId) {
        return res.redirect("/");
    }
    const valid = await checkSessionMiddleware(sessionId);
    if (!valid) {
        res.clearCookie("session");
        return res.redirect("/");
    }
    next();
}
// ───────────────────────────────────────────────────────────────────────────

app.get("/register", async (req, res) => {
    const isLoggedIn = await Loggedin(req);
    res.render("register", { title: "Register", isLoggedIn });
});

app.get("/login", async (req, res) => {
    const isLoggedIn = await Loggedin(req);
    res.render("login", { title: "Login", isLoggedIn: isLoggedIn });
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

app.get("/", async (req, res) => {
    const isLoggedIn = await Loggedin(req);
    res.render("login", { title: "Login", isLoggedIn: isLoggedIn });
});

app.post("/login", async (req, res) => {
    const { email, password } = req.body;
    try {
        const session = await authenticateUser(email, password);
        if (!session) {
            res.render("login", { title: "Login", error: "Invalid email or password", values: { email: email } });
            return;
        } else {
            res.cookie("session", session, { maxAge: 5 * 60 * 60 * 1000, httpOnly: true });
            res.redirect("/homepage");
        }
    } catch (err) {
        res.render("login", { title: "Login", error: err.message, values: { email: email } });
    }
});

app.get("/scan", requireAuth, (req, res) => {
    res.render("scan", { title: "MeoW Safety Gateway" });
});

app.post("/scan", requireAuth, async (req, res) => {
    const { qrCodeId } = req.body;
    try {
        const { eventId } = await handleScan(qrCodeId);
        res.redirect(`/scan/${eventId}`);
    } catch (err) {
        res.render("scan", { title: "MeoW Safety Gateway", error: err.message });
    }
});

app.get("/scan/:eventId", requireAuth, async (req, res) => {
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

app.post("/scan/:eventId/claim", requireAuth, async (req, res) => {
    const { guardianId } = req.body;
    try {
        await claimGuardian(req.params.eventId, guardianId);
    } finally {
        res.redirect(`/scan/${req.params.eventId}`);
    }
});


app.get("/homepage", requireAuth, async (req, res) => {
    const isLoggedIn = await Loggedin(req);
    res.render("scan", { title: "MeoW Safety Gateway", isLoggedIn });
});
// ── Logout ─────────────────────────────────────────────────────────────────
app.get("/logout", async (req, res) => {
    res.clearCookie("session");
    console.log(await logoutUser(getSessionCookie(req)))
    res.redirect("/");
});
// ───────────────────────────────────────────────────────────────────────────

app.use((req, res) => {
    res.status(404).render("404", { layout: false });
});

const port = process.env.PORT || 3000;
connectDB().then(() => {
    app.listen(port, () => {
        console.log(`Server listening on http://localhost:${port}`);
    });
});