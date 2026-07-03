import express from "express";
import {
    connectDB,
    logoutUser,
    registerUser,
    authenticateUser,
    handleScan,
    getEmergencyView,
    claimGuardian,
    engine,
    checkSessionMiddleware,
    getUserHomepage,
    addNewCat,
    addNewGuardian,
    toggleCatBackupProtocol,
    resetPassword,
    updateProfile
} from "./presentation.js";
import { v4 as uuidv4 } from 'uuid';


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


app.get("/homepage", async (req, res) => {
    const isLoggedIn = await Loggedin(req);
    if (!isLoggedIn) {
        return res.redirect("/");
    }
    const sessionId = getSessionCookie(req);
    const data = await getUserHomepage(sessionId);
    if (!data) {
        return res.redirect("/");
    }
    const { user, cats, guardians } = data;
    res.render("homepage", {
        title: `${user.name}'s Homepage`,
        isLoggedIn,
        user,
        cats,
        guardians,
        hasCats: cats && cats.length > 0,
        hasGuardians: guardians && guardians.length > 0,
        error: req.query.error,
        layout: "hp",
    });
});

app.post("/cats", requireAuth, async (req, res) => {
    const sessionId = getSessionCookie(req);
    console.log(req.body);
    const { name, breed, age, care, photo } = req.body;
    try {
        await addNewCat(sessionId, { name, breed, age, photoUrl: photo, care, qrCodeId: uuidv4() });
        res.redirect("/homepage");
    } catch (err) {
        res.redirect(`/homepage?error=${encodeURIComponent(err.message)}`);
    }
});

app.post("/guardians", requireAuth, async (req, res) => {
    const sessionId = getSessionCookie(req);
    const { name, email, phone, priorityOrder } = req.body;
    try {
        await addNewGuardian(sessionId, { name, email, phone, priorityOrder });
        res.redirect("/homepage");
    } catch (err) {
        res.redirect(`/homepage?error=${encodeURIComponent(err.message)}`);
    }
});

app.post("/cats/toggle-protocol", requireAuth, async (req, res) => {
    const sessionId = getSessionCookie(req);
    const { catId } = req.body;
    try {
        await toggleCatBackupProtocol(sessionId, catId);
        res.redirect("/homepage");
    } catch (err) {
        res.redirect(`/homepage?error=${encodeURIComponent(err.message)}`);
    }
});

app.get("/forgot-password", async (req, res) => {
    const isLoggedIn = await Loggedin(req);
    res.render("forgot-password", { title: "Reset Password", isLoggedIn, success: req.query.success });
});

app.post("/forgot-password", async (req, res) => {
    const { email, newPassword, confirmPassword } = req.body;
    if (newPassword !== confirmPassword) {
        return res.render("forgot-password", { title: "Reset Password", error: "Passwords do not match." });
    }
    if (newPassword.length < 6) {
        return res.render("forgot-password", { title: "Reset Password", error: "Password must be at least 6 characters.", values: { email } });
    }
    try {
        await resetPassword(email, newPassword);
        res.redirect("/forgot-password?success=1");
    } catch (err) {
        res.render("forgot-password", { title: "Reset Password", error: err.message, values: { email } });
    }
});

app.post("/profile/edit", requireAuth, async (req, res) => {
    const sessionId = getSessionCookie(req);
    const { name, phone, currentPassword, newPassword, confirmNewPassword } = req.body;
    if (newPassword && newPassword !== confirmNewPassword) {
        return res.redirect("/homepage?error=" + encodeURIComponent("New passwords do not match."));
    }
    try {
        await updateProfile(sessionId, { name, phone, currentPassword, newPassword: newPassword || null });
        res.redirect("/homepage?success=profile");
    } catch (err) {
        res.redirect("/homepage?error=" + encodeURIComponent(err.message));
    }
});

// ── Logout ─────────────────────────────────────────────────────────────────
app.get("/logout", async (req, res) => {
    res.clearCookie("session");
    await logoutUser(getSessionCookie(req));
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