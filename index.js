import express from "express";
import { startEscalationWorkflow } from "./temporal/client.js";
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
  requestPasswordReset,
  resetPasswordWithToken,
  updateProfile,
  updateUserPhoto,
  getCatByNamePresentationLayer,
  searchUsersByName,
  setOwnerUnavailable,
  setOwnerAvailable,
  getGuardianAccess,
  acknowledgeGuardianAccess,
  changePassword,
  deleteAccount,
} from "./presentation.js";
import { v4 as uuidv4 } from "uuid";
import multer from "multer";

const app = express();

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

const hbsEngine = engine({
  extname: ".hbs",
  helpers: {
    eq: (a, b) => a === b,
    initial: (str) => (str && str.length > 0 ? str[0].toUpperCase() : "?"),
  },
});
app.engine("hbs", hbsEngine);
app.engine("handlebars", engine({ extname: ".handlebars" }));
app.set("view engine", "hbs");
app.set("views", "./views");

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));

// ── Session middleware ──────────────────────────────────────────────────────
function getSessionCookie(req) {
  const cookieHeader = req.headers.cookie || "";
  const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function Loggedin(req) {
  const isLoggedIn = getSessionCookie(req);
  if (!isLoggedIn) return false;
  const valid = await checkSessionMiddleware(isLoggedIn);
  if (!valid) return false;
  return true;
}

async function requireAuth(req, res, next) {
  const sessionId = getSessionCookie(req);
  if (!sessionId) return res.redirect("/");
  const valid = await checkSessionMiddleware(sessionId);
  if (!valid) {
    res.clearCookie("session");
    return res.redirect("/?expired=1");
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
  res.render("login", {
    title: "Login",
    isLoggedIn,
    expired: req.query.expired === "1",
    reset: req.query.reset === "1",
    deleted: req.query.deleted === "1",
  });
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
  res.render("login", {
    title: "Login",
    isLoggedIn,
    expired: req.query.expired === "1",
    reset: req.query.reset === "1",
    deleted: req.query.deleted === "1",
  });
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const session = await authenticateUser(email, password);
    if (!session) {
      res.render("login", {
        title: "Login",
        error: "Invalid email or password",
        values: { email: email },
      });
      return;
    } else {
      res.cookie("session", session, {
        maxAge: 5 * 60 * 60 * 1000,
        httpOnly: true,
      });
      res.redirect("/homepage");
    }
  } catch (err) {
    res.render("login", {
      title: "Login",
      error: err.message,
      values: { email: email },
    });
  }
});

app.get("/scan", (req, res) => {
  res.render("scan", { title: "MeoW Safety Gateway" });
});

app.post("/scan", async (req, res) => {
  const { qrCodeId } = req.body;
  try {
    const { eventId, guardianCount } = await handleScan(qrCodeId);
    console.log(`[Scan] eventId=${eventId} guardianCount=${guardianCount}`);
    startEscalationWorkflow(eventId.toString(), guardianCount)
      .then(() => console.log("[Temporal] Workflow started successfully"))
      .catch((err) => console.error("[Temporal] Failed:", err.message));
    res.redirect(`/scan/${eventId}`);
  } catch (err) {
    res.render("scan", { title: "MeoW Safety Gateway", error: err.message });
  }
});

app.get("/scan/:eventId", async (req, res) => {
  try {
    const { event, cat, guardians } = await getEmergencyView(
      req.params.eventId,
    );
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
  const sessionId = getSessionCookie(req);
  const isLoggedIn = await Loggedin(req);
  if (!isLoggedIn) {
    if (sessionId) res.clearCookie("session");
    return res.redirect(sessionId ? "/?expired=1" : "/");
  }
  const data = await getUserHomepage(sessionId);
  if (!data) return res.redirect("/");
  const { user, cats, guardians, isUnavailable } = data;
  res.render("homepage", {
    title: `${user.name}'s Homepage`,
    isLoggedIn,
    user,
    cats,
    guardians,
    hasCats: cats && cats.length > 0,
    hasGuardians: guardians && guardians.length > 0,
    isUnavailable,
    error: req.query.error,
    layout: "hp",
  });
});

app.get("/profile/edit", async (req, res) => {
  const sessionId = getSessionCookie(req);
  const isLoggedIn = await Loggedin(req);
  if (!isLoggedIn) {
    if (sessionId) res.clearCookie("session");
    return res.redirect(sessionId ? "/?expired=1" : "/");
  }
  const data = await getUserHomepage(sessionId);
  if (!data) {
    return res.redirect("/");
  }
  const { user } = data;
  res.render("profile-edit", {
    title: "Edit Profile",
    isLoggedIn,
    user,
    error: req.query.error,
  });
});

app.post("/cats", requireAuth, upload.single("photo"), async (req, res) => {
  const sessionId = getSessionCookie(req);
  const {
    name,
    breed,
    age,
    photo,
    feedingSchedule,
    foodBrand,
    allergies,
    conditions,
    medications,
    vaccinations,
    neutered,
    vetName,
    vetPhone,
    microchip,
    passportNumber,
    personality,
    notes,
  } = req.body;
  let photoString = "";

  try {
    if (req.file) {
      if (!req.file.buffer || req.file.buffer.length === 0) {
        throw new Error(
          "Uploaded image is empty or was not buffered correctly.",
        );
      }
      photoString = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
    } else if (photo) {
      photoString = photo.startsWith("data:")
        ? photo
        : `data:image/png;base64,${photo}`;
    }
    await addNewCat(sessionId, {
      name,
      breed,
      age: Number(age),
      photoUrl: photoString,
      qrCodeId: uuidv4(),
      feedingSchedule,
      foodBrand,
      allergies,
      conditions,
      medications,
      vaccinations,
      neutered,
      vetName,
      vetPhone,
      microchip,
      passportNumber,
      personality,
      notes,
    });
    res.redirect("/homepage");
  } catch (err) {
    res.redirect(`/homepage?error=${encodeURIComponent(err.message)}`);
  }
});

app.post("/guardians", requireAuth, async (req, res) => {
  const sessionId = getSessionCookie(req);
  const { name, email, phone, priorityOrder } = req.body;
  try {
    await addNewGuardian(sessionId, {
      name,
      email,
      phone,
      priorityOrder,
      Id: uuidv4(),
    });
    res.redirect("/homepage");
  } catch (err) {
    res.redirect(`/homepage?error=${encodeURIComponent(err.message)}`);
  }
});

app.post("/cats/:catId", requireAuth, async (req, res) => {
  res.redirect("/homepage");
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
  res.render("forgot-password", {
    title: "Reset Password",
    isLoggedIn,
    sent: req.query.sent === "1",
  });
});

app.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  try {
    await requestPasswordReset(email);
    res.redirect("/forgot-password?sent=1");
  } catch (err) {
    res.render("forgot-password", {
      title: "Reset Password",
      error: err.message,
      values: { email },
    });
  }
});

app.get("/reset-password", async (req, res) => {
  const { token, success } = req.query;
  if (!token && !success) return res.redirect("/forgot-password");
  res.render("reset-password", {
    title: "Set New Password",
    token,
    success: success === "1",
  });
});

app.post("/reset-password", async (req, res) => {
  const { token, newPassword, confirmPassword } = req.body;
  if (newPassword !== confirmPassword) {
    return res.render("reset-password", {
      title: "Set New Password",
      token,
      error: "Passwords do not match.",
    });
  }
  if (newPassword.length < 6) {
    return res.render("reset-password", {
      title: "Set New Password",
      token,
      error: "Password must be at least 6 characters.",
    });
  }
  try {
    await resetPasswordWithToken(token, newPassword);
    res.redirect("/login?reset=1");
  } catch (err) {
    res.render("reset-password", {
      title: "Set New Password",
      token,
      error: err.message,
    });
  }
});

app.post(
  "/profile/photo",
  requireAuth,
  upload.single("photo"),
  async (req, res) => {
    const sessionId = getSessionCookie(req);
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const photoUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
      await updateUserPhoto(sessionId, photoUrl);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

app.post("/profile/edit", requireAuth, async (req, res) => {
  const sessionId = getSessionCookie(req);
  const { name, phone, currentPassword, newPassword, confirmNewPassword } =
    req.body;
  if (newPassword && newPassword !== confirmNewPassword) {
    return res.redirect(
      "/homepage?error=" + encodeURIComponent("New passwords do not match."),
    );
  }
  try {
    await updateProfile(sessionId, {
      name,
      phone,
      currentPassword,
      newPassword: newPassword || null,
    });
    res.redirect("/homepage?success=profile");
  } catch (err) {
    res.redirect("/homepage?error=" + encodeURIComponent(err.message));
  }
});

app.get("/cats/:catName", requireAuth, async (req, res) => {
  const cat = await getCatByNamePresentationLayer(req.params.catName);
  res.render("cat-detail", {
    title: cat.name,
    cat,
    isLoggedIn: true,
    layout: "hp",
  });
});

// ── Owner availability ─────────────────────────────────────────────────────
app.post("/owner/unavailable", requireAuth, async (req, res) => {
  const sessionId = getSessionCookie(req);
  try {
    await setOwnerUnavailable(sessionId);
    res.redirect("/homepage");
  } catch (err) {
    res.redirect("/homepage?error=" + encodeURIComponent(err.message));
  }
});

app.post("/owner/available", requireAuth, async (req, res) => {
  const sessionId = getSessionCookie(req);
  try {
    await setOwnerAvailable(sessionId);
    res.redirect("/homepage");
  } catch (err) {
    res.redirect("/homepage?error=" + encodeURIComponent(err.message));
  }
});

// ── Guardian magic link ────────────────────────────────────────────────────
app.get("/guardian-access", async (req, res) => {
  const { token } = req.query;
  if (!token) return res.redirect("/");
  try {
    const { record, cats, ownerName, alreadyAcknowledged } =
      await getGuardianAccess(token);
    res.render("guardian-access", {
      title: "Guardian Access",
      token,
      cats,
      ownerName,
      alreadyAcknowledged,
      acked: req.query.acked === "1",
      layout: false,
    });
  } catch (err) {
    res.render("guardian-access", {
      title: "Guardian Access",
      error: err.message,
      layout: false,
    });
  }
});

app.post("/guardian-access/:token/acknowledge", async (req, res) => {
  const { token } = req.params;
  try {
    await acknowledgeGuardianAccess(token);
    res.redirect(`/guardian-access?token=${token}&acked=1`);
  } catch (err) {
    res.redirect(
      `/guardian-access?token=${token}&error=${encodeURIComponent(err.message)}`,
    );
  }
});
// ───────────────────────────────────────────────────────────────────────────

// ── Change password ────────────────────────────────────────────────────────
app.post("/profile/password", requireAuth, async (req, res) => {
  const sessionId = getSessionCookie(req);
  const { currentPassword, newPassword, confirmNewPassword } = req.body;
  if (newPassword !== confirmNewPassword) {
    return res.redirect(
      "/homepage?error=" + encodeURIComponent("New passwords do not match."),
    );
  }
  if (newPassword.length < 6) {
    return res.redirect(
      "/homepage?error=" +
        encodeURIComponent("Password must be at least 6 characters."),
    );
  }
  try {
    await changePassword(sessionId, currentPassword, newPassword);
    res.redirect("/homepage?success=password");
  } catch (err) {
    res.redirect("/homepage?error=" + encodeURIComponent(err.message));
  }
});
// ───────────────────────────────────────────────────────────────────────────

// ── Delete account ─────────────────────────────────────────────────────────
app.post("/account/delete", requireAuth, async (req, res) => {
  const sessionId = getSessionCookie(req);
  const { password } = req.body;
  try {
    await deleteAccount(sessionId, password);
    res.clearCookie("session");
    res.redirect("/?deleted=1");
  } catch (err) {
    res.redirect("/homepage?error=" + encodeURIComponent(err.message));
  }
});
// ───────────────────────────────────────────────────────────────────────────

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
