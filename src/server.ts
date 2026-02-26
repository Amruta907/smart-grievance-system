import bcrypt from "bcryptjs";
import cors from "cors";
import express, { Request, Response, NextFunction } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { getDb, initDb } from "./db.js";
import { SessionUser, UserRole } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT ?? 3000);
const sessions = new Map<string, SessionUser>();
const uploadsDir = path.resolve(process.cwd(), "uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(uploadsDir));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
      cb(null, uniqueName);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Only image files are allowed"));
      return;
    }
    cb(null, true);
  }
});

type AuthenticatedRequest = Request & { user?: SessionUser };

function auth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  let sessionUser = sessions.get(token);
  if (!sessionUser) {
    const db = getDb();
    const row = db
      .prepare(`
        SELECT u.id, u.email, u.name, u.role
        FROM user_sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token = ?
      `)
      .get(token) as SessionUser | undefined;
    if (row) {
      sessionUser = row;
      sessions.set(token, row);
    }
  }

  if (!sessionUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  req.user = sessionUser;
  next();
}

const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

const authorityStatusSchema = z.object({
  status: z.enum(["accepted", "in_progress", "closed"])
});

type TelegramLanguage = "en" | "hi" | "mr";
type TelegramState = "idle" | "awaiting_language" | "awaiting_category" | "awaiting_description" | "awaiting_location" | "awaiting_confirmation";
type TranslationKey =
  | "welcome"
  | "chooseLanguage"
  | "languageSet"
  | "chooseCategory"
  | "enterDescription"
  | "enterLocation"
  | "confirmPrompt"
  | "submitted"
  | "cancelled"
  | "help"
  | "invalidDescription"
  | "invalidLocation"
  | "unknown"
  | "statusMissing"
  | "statusNotFound"
  | "statusResult";

interface TelegramSessionRow {
  chat_id: string;
  user_id: number | null;
  state: TelegramState;
  language: TelegramLanguage;
  draft_json: string | null;
}

interface TelegramDraft {
  categoryId?: number;
  categoryName?: string;
  description?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
}

interface TelegramSession {
  chatId: string;
  userId: number | null;
  state: TelegramState;
  language: TelegramLanguage;
  draft: TelegramDraft;
}

interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
}

interface TelegramLocation {
  latitude: number;
  longitude: number;
}

interface TelegramMessage {
  message_id: number;
  chat: { id: number };
  text?: string;
  location?: TelegramLocation;
  from?: TelegramUser;
}

interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  data?: string;
  message?: TelegramMessage;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

const TELEGRAM_BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
const TELEGRAM_WEBHOOK_SECRET = String(process.env.TELEGRAM_WEBHOOK_SECRET ?? "").trim();
const TELEGRAM_API_BASE = TELEGRAM_BOT_TOKEN ? `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}` : "";
const TELEGRAM_LANGUAGES: TelegramLanguage[] = ["en", "hi", "mr"];

const tgText: Record<TelegramLanguage, Record<TranslationKey, string>> = {
  en: {
    welcome: "Welcome to Smart Grievance Bot.",
    chooseLanguage: "Choose language / भाषा निवडा:",
    languageSet: "Language set.",
    chooseCategory: "Select complaint category:",
    enterDescription: "Describe the issue in detail (minimum 10 characters).",
    enterLocation: "Share location as text (area/landmark) or send live location.",
    confirmPrompt: "Please confirm your complaint details.",
    submitted: "Complaint submitted successfully. Ticket: {ticket}",
    cancelled: "Complaint creation cancelled.",
    help: "Use /new to file complaint, /status <ticket> to check status, /cancel to stop.",
    invalidDescription: "Description is too short. Please enter at least 10 characters.",
    invalidLocation: "Location is too short. Please enter a valid location.",
    unknown: "Please use /new to start filing a complaint.",
    statusMissing: "Use: /status <ticket_number>",
    statusNotFound: "Ticket not found for this Telegram account.",
    statusResult: "Ticket {ticket}\nStatus: {status}\nUpdated: {updated}"
  },
  hi: {
    welcome: "स्मार्ट शिकायत बॉट में आपका स्वागत है।",
    chooseLanguage: "भाषा चुनें:",
    languageSet: "भाषा सेट हो गई।",
    chooseCategory: "शिकायत की श्रेणी चुनें:",
    enterDescription: "समस्या का विस्तृत विवरण लिखें (कम से कम 10 अक्षर)।",
    enterLocation: "स्थान टेक्स्ट में भेजें (एरिया/लैंडमार्क) या लाइव लोकेशन भेजें।",
    confirmPrompt: "कृपया शिकायत विवरण की पुष्टि करें।",
    submitted: "शिकायत सफलतापूर्वक दर्ज हुई। टिकट: {ticket}",
    cancelled: "शिकायत दर्ज करना रद्द किया गया।",
    help: "/new से नई शिकायत दर्ज करें, /status <ticket> से स्थिति देखें, /cancel से रोकें।",
    invalidDescription: "विवरण छोटा है। कम से कम 10 अक्षर लिखें।",
    invalidLocation: "स्थान सही नहीं है। कृपया मान्य स्थान लिखें।",
    unknown: "शिकायत शुरू करने के लिए /new भेजें।",
    statusMissing: "ऐसे लिखें: /status <ticket_number>",
    statusNotFound: "यह टिकट इस Telegram अकाउंट से नहीं मिला।",
    statusResult: "टिकट {ticket}\nस्थिति: {status}\nअपडेट: {updated}"
  },
  mr: {
    welcome: "स्मार्ट तक्रार बॉटमध्ये आपले स्वागत आहे.",
    chooseLanguage: "भाषा निवडा:",
    languageSet: "भाषा सेट झाली.",
    chooseCategory: "तक्रारीची श्रेणी निवडा:",
    enterDescription: "समस्येचे सविस्तर वर्णन द्या (किमान 10 अक्षरे).",
    enterLocation: "ठिकाण मजकूरात पाठवा (एरिया/लँडमार्क) किंवा लाइव्ह लोकेशन पाठवा.",
    confirmPrompt: "कृपया तक्रारीची माहिती पुष्टी करा.",
    submitted: "तक्रार यशस्वीरित्या नोंदली. तिकीट: {ticket}",
    cancelled: "तक्रार नोंदणी रद्द केली.",
    help: "/new ने तक्रार नोंदवा, /status <ticket> ने स्थिती पाहा, /cancel ने थांबा.",
    invalidDescription: "वर्णन खूप छोटे आहे. किमान 10 अक्षरे द्या.",
    invalidLocation: "ठिकाण योग्य नाही. कृपया वैध ठिकाण द्या.",
    unknown: "तक्रार सुरू करण्यासाठी /new वापरा.",
    statusMissing: "असे लिहा: /status <ticket_number>",
    statusNotFound: "हे तिकीट या Telegram खात्यासाठी सापडले नाही.",
    statusResult: "तिकीट {ticket}\nस्थिती: {status}\nअपडेट: {updated}"
  }
};

function isTelegramEnabled() {
  return TELEGRAM_BOT_TOKEN.length > 0;
}

function tgT(language: TelegramLanguage, key: TranslationKey, params?: Record<string, string>) {
  const template = tgText[language]?.[key] ?? tgText.en[key];
  if (!params) return template;
  return Object.entries(params).reduce((acc, [token, value]) => acc.replace(new RegExp(`\\{${token}\\}`, "g"), value), template);
}

function parseTelegramLanguage(input: string | undefined): TelegramLanguage | null {
  const value = (input ?? "").trim().toLowerCase();
  if (TELEGRAM_LANGUAGES.includes(value as TelegramLanguage)) return value as TelegramLanguage;
  if (["english", "eng"].includes(value)) return "en";
  if (["hindi", "hin"].includes(value)) return "hi";
  if (["marathi", "mar"].includes(value)) return "mr";
  return null;
}

function parseDraft(raw: string | null): TelegramDraft {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as TelegramDraft;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function getTelegramSession(chatId: string): TelegramSession {
  const db = getDb();
  const row = db
    .prepare("SELECT chat_id, user_id, state, language, draft_json FROM telegram_sessions WHERE chat_id = ?")
    .get(chatId) as TelegramSessionRow | undefined;

  if (!row) {
    const session: TelegramSession = {
      chatId,
      userId: null,
      state: "awaiting_language",
      language: "en",
      draft: {}
    };
    db.prepare(
      "INSERT INTO telegram_sessions (chat_id, user_id, state, language, draft_json, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)"
    ).run(chatId, null, session.state, session.language, JSON.stringify(session.draft));
    return session;
  }

  return {
    chatId: row.chat_id,
    userId: row.user_id,
    state: row.state,
    language: TELEGRAM_LANGUAGES.includes(row.language) ? row.language : "en",
    draft: parseDraft(row.draft_json)
  };
}

function saveTelegramSession(session: TelegramSession) {
  getDb()
    .prepare(`
      INSERT INTO telegram_sessions (chat_id, user_id, state, language, draft_json, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(chat_id) DO UPDATE SET
        user_id = excluded.user_id,
        state = excluded.state,
        language = excluded.language,
        draft_json = excluded.draft_json,
        updated_at = CURRENT_TIMESTAMP
    `)
    .run(session.chatId, session.userId, session.state, session.language, JSON.stringify(session.draft ?? {}));
}

function getTelegramCategories() {
  return getDb()
    .prepare("SELECT id, name FROM grievance_categories ORDER BY name")
    .all() as Array<{ id: number; name: string }>;
}

function ensureTelegramCitizen(chatId: string, user?: TelegramUser) {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM users WHERE telegram_chat_id = ?").get(chatId) as { id: number } | undefined;
  if (existing) return existing.id;

  const fallbackEmail = `tg_${chatId.replace(/[^a-zA-Z0-9_-]/g, "_")}@telegram.local`;
  const byEmail = db.prepare("SELECT id FROM users WHERE email = ?").get(fallbackEmail) as { id: number } | undefined;
  if (byEmail) {
    db.prepare("UPDATE users SET telegram_chat_id = ? WHERE id = ?").run(chatId, byEmail.id);
    return byEmail.id;
  }

  const fullName = `${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim() || `Telegram User ${chatId}`;
  const tempPassword = bcrypt.hashSync(uuid(), 10);
  const inserted = db
    .prepare("INSERT INTO users (email, password, name, role, telegram_chat_id) VALUES (?, ?, ?, 'citizen', ?)")
    .run(fallbackEmail, tempPassword, fullName, chatId);
  return Number(inserted.lastInsertRowid);
}

async function callTelegramApi(method: string, payload: Record<string, unknown>) {
  if (!isTelegramEnabled()) return;
  const response = await fetch(`${TELEGRAM_API_BASE}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const text = await response.text();
    console.error(`Telegram API ${method} failed`, response.status, text);
  }
}

async function sendTelegramMessage(chatId: string, text: string, replyMarkup?: Record<string, unknown>) {
  const payload: Record<string, unknown> = { chat_id: chatId, text };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  await callTelegramApi("sendMessage", payload);
}

async function answerTelegramCallback(callbackQueryId: string) {
  await callTelegramApi("answerCallbackQuery", { callback_query_id: callbackQueryId });
}

function languageKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "English", callback_data: "lang:en" },
        { text: "हिन्दी", callback_data: "lang:hi" },
        { text: "मराठी", callback_data: "lang:mr" }
      ]
    ]
  };
}

function categoryKeyboard() {
  const categories = getTelegramCategories();
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  for (let i = 0; i < categories.length; i += 2) {
    const row = [
      { text: categories[i].name, callback_data: `cat:${categories[i].id}` }
    ];
    if (categories[i + 1]) {
      row.push({ text: categories[i + 1].name, callback_data: `cat:${categories[i + 1].id}` });
    }
    rows.push(row);
  }
  return { inline_keyboard: rows };
}

function confirmationKeyboard(language: TelegramLanguage) {
  return {
    inline_keyboard: [
      [
        { text: language === "en" ? "Submit" : language === "hi" ? "जमा करें" : "सबमिट करा", callback_data: "confirm:submit" },
        { text: language === "en" ? "Cancel" : language === "hi" ? "रद्द करें" : "रद्द करा", callback_data: "confirm:cancel" }
      ]
    ]
  };
}

function buildComplaintSummary(language: TelegramLanguage, draft: TelegramDraft) {
  const labels: Record<TelegramLanguage, { category: string; description: string; location: string }> = {
    en: { category: "Category", description: "Description", location: "Location" },
    hi: { category: "श्रेणी", description: "विवरण", location: "स्थान" },
    mr: { category: "श्रेणी", description: "वर्णन", location: "ठिकाण" }
  };
  const l = labels[language];
  return `${tgT(language, "confirmPrompt")}\n\n${l.category}: ${draft.categoryName ?? "-"}\n${l.description}: ${draft.description ?? "-"}\n${l.location}: ${draft.location ?? "-"}`;
}

async function submitTelegramComplaint(session: TelegramSession, chatId: string) {
  if (!session.userId || !session.draft.categoryId || !session.draft.description || !session.draft.location) return null;
  const db = getDb();
  const ticket = `TGM-${Date.now().toString(36).toUpperCase()}`;
  const title = session.draft.description.slice(0, 100);
  db.prepare(`
    INSERT INTO grievances
      (ticket_number, citizen_id, category_id, title, description, location, latitude, longitude, priority, status, complaint_status, source_channel, source_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'medium', 'submitted', 'pending', 'telegram', ?)
  `).run(
    ticket,
    session.userId,
    session.draft.categoryId,
    title,
    session.draft.description,
    session.draft.location,
    session.draft.latitude ?? null,
    session.draft.longitude ?? null,
    chatId
  );
  session.state = "idle";
  session.draft = {};
  saveTelegramSession(session);
  return ticket;
}

async function handleTelegramMessage(update: TelegramUpdate) {
  const message = update.message;
  if (!message) return;

  const chatId = String(message.chat.id);
  const session = getTelegramSession(chatId);
  const text = (message.text ?? "").trim();

  if (text.toLowerCase().startsWith("/start") || text.toLowerCase().startsWith("/new")) {
    session.state = "awaiting_language";
    session.draft = {};
    saveTelegramSession(session);
    await sendTelegramMessage(chatId, `${tgT(session.language, "welcome")}\n${tgT(session.language, "chooseLanguage")}`, languageKeyboard());
    return;
  }

  if (text.toLowerCase().startsWith("/help")) {
    await sendTelegramMessage(chatId, tgT(session.language, "help"));
    return;
  }

  if (text.toLowerCase().startsWith("/cancel")) {
    session.state = "idle";
    session.draft = {};
    saveTelegramSession(session);
    await sendTelegramMessage(chatId, tgT(session.language, "cancelled"));
    return;
  }

  if (text.toLowerCase().startsWith("/status")) {
    const ticket = text.split(/\s+/)[1]?.trim();
    if (!ticket) {
      await sendTelegramMessage(chatId, tgT(session.language, "statusMissing"));
      return;
    }
    const db = getDb();
    const grievance = db
      .prepare(
        "SELECT ticket_number, status, updated_at FROM grievances WHERE ticket_number = ? AND source_channel = 'telegram' AND source_user_id = ?"
      )
      .get(ticket, chatId) as { ticket_number: string; status: string; updated_at: string } | undefined;
    if (!grievance) {
      await sendTelegramMessage(chatId, tgT(session.language, "statusNotFound"));
      return;
    }
    await sendTelegramMessage(
      chatId,
      tgT(session.language, "statusResult", {
        ticket: grievance.ticket_number,
        status: grievance.status,
        updated: grievance.updated_at
      })
    );
    return;
  }

  if (session.state === "awaiting_language") {
    const selected = parseTelegramLanguage(text);
    if (!selected) {
      await sendTelegramMessage(chatId, tgT(session.language, "chooseLanguage"), languageKeyboard());
      return;
    }
    session.language = selected;
    session.state = "awaiting_category";
    session.userId = ensureTelegramCitizen(chatId, message.from);
    saveTelegramSession(session);
    await sendTelegramMessage(chatId, `${tgT(session.language, "languageSet")}\n${tgT(session.language, "chooseCategory")}`, categoryKeyboard());
    return;
  }

  if (session.state === "awaiting_description") {
    if (text.length < 10) {
      await sendTelegramMessage(chatId, tgT(session.language, "invalidDescription"));
      return;
    }
    session.draft.description = text;
    session.state = "awaiting_location";
    saveTelegramSession(session);
    await sendTelegramMessage(chatId, tgT(session.language, "enterLocation"));
    return;
  }

  if (session.state === "awaiting_location") {
    if (message.location) {
      session.draft.latitude = message.location.latitude;
      session.draft.longitude = message.location.longitude;
      session.draft.location = `${message.location.latitude.toFixed(6)}, ${message.location.longitude.toFixed(6)}`;
    } else if (text.length >= 3) {
      session.draft.location = text;
      delete session.draft.latitude;
      delete session.draft.longitude;
    } else {
      await sendTelegramMessage(chatId, tgT(session.language, "invalidLocation"));
      return;
    }
    session.state = "awaiting_confirmation";
    saveTelegramSession(session);
    await sendTelegramMessage(chatId, buildComplaintSummary(session.language, session.draft), confirmationKeyboard(session.language));
    return;
  }

  await sendTelegramMessage(chatId, tgT(session.language, "unknown"));
}

async function handleTelegramCallback(update: TelegramUpdate) {
  const callback = update.callback_query;
  if (!callback?.message) return;

  const chatId = String(callback.message.chat.id);
  const data = String(callback.data ?? "");
  const session = getTelegramSession(chatId);

  await answerTelegramCallback(callback.id);

  if (data.startsWith("lang:")) {
    const selected = parseTelegramLanguage(data.replace("lang:", ""));
    if (!selected) return;
    session.language = selected;
    session.state = "awaiting_category";
    session.userId = ensureTelegramCitizen(chatId, callback.from);
    saveTelegramSession(session);
    await sendTelegramMessage(chatId, `${tgT(session.language, "languageSet")}\n${tgT(session.language, "chooseCategory")}`, categoryKeyboard());
    return;
  }

  if (data.startsWith("cat:")) {
    const categoryId = Number(data.replace("cat:", ""));
    const category = getDb().prepare("SELECT id, name FROM grievance_categories WHERE id = ?").get(categoryId) as
      | { id: number; name: string }
      | undefined;
    if (!category) return;
    session.draft.categoryId = category.id;
    session.draft.categoryName = category.name;
    session.state = "awaiting_description";
    saveTelegramSession(session);
    await sendTelegramMessage(chatId, tgT(session.language, "enterDescription"));
    return;
  }

  if (data === "confirm:cancel") {
    session.state = "idle";
    session.draft = {};
    saveTelegramSession(session);
    await sendTelegramMessage(chatId, tgT(session.language, "cancelled"));
    return;
  }

  if (data === "confirm:submit") {
    const ticket = await submitTelegramComplaint(session, chatId);
    if (!ticket) {
      await sendTelegramMessage(chatId, tgT(session.language, "unknown"));
      return;
    }
    await sendTelegramMessage(chatId, tgT(session.language, "submitted", { ticket }));
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/auth/login", (req, res) => {
  const parseResult = authSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }

  const role = (req.body.role as UserRole | undefined) ?? "citizen";
  const { email, password } = parseResult.data;

  const db = getDb();
  const user = db.prepare("SELECT * FROM users WHERE email = ? AND role = ?").get(email, role) as
    | { id: number; email: string; name: string; role: UserRole; password: string }
    | undefined;

  if (!user || !bcrypt.compareSync(password, user.password)) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = uuid();
  const sessionUser: SessionUser = { id: user.id, email: user.email, name: user.name, role: user.role };
  sessions.set(token, sessionUser);
  db.prepare("INSERT OR REPLACE INTO user_sessions (token, user_id) VALUES (?, ?)").run(token, user.id);
  res.json({ token, user: sessionUser });
});

app.post("/api/auth/register", (req, res) => {
  const schema = authSchema.extend({ name: z.string().min(2) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }

  const db = getDb();
  const { email, password, name } = parsed.data;
  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = db
      .prepare("INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, 'citizen')")
      .run(email, hash, name);
    const id = Number(result.lastInsertRowid);
    const token = uuid();
    const user: SessionUser = { id, name, email, role: "citizen" };
    sessions.set(token, user);
    db.prepare("INSERT OR REPLACE INTO user_sessions (token, user_id) VALUES (?, ?)").run(token, id);
    res.status(201).json({ token, user });
  } catch {
    res.status(400).json({ error: "Email already registered" });
  }
});

app.post("/api/auth/logout", auth, (req: AuthenticatedRequest, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (token) {
    sessions.delete(token);
    getDb().prepare("DELETE FROM user_sessions WHERE token = ?").run(token);
  }
  res.json({ success: true });
});

app.get("/api/categories", (_req, res) => {
  const db = getDb();
  const categories = db.prepare("SELECT * FROM grievance_categories ORDER BY name").all();
  res.json(categories);
});

app.get("/api/grievances", auth, (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const db = getDb();
  const rows =
    req.user.role === "authority"
      ? db
          .prepare(`
            SELECT g.*, c.name AS category_name, u.name AS citizen_name
            FROM grievances g
            JOIN grievance_categories c ON c.id = g.category_id
            JOIN users u ON u.id = g.citizen_id
            ORDER BY g.created_at DESC
          `)
          .all()
      : db
          .prepare(`
            SELECT g.*, c.name AS category_name, u.name AS citizen_name
            FROM grievances g
            JOIN grievance_categories c ON c.id = g.category_id
            JOIN users u ON u.id = g.citizen_id
            WHERE g.citizen_id = ?
            ORDER BY g.created_at DESC
          `)
          .all(req.user.id);
  res.json(rows);
});

app.get("/api/grievances/my", auth, (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "citizen") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const db = getDb();
  const rows = db
    .prepare(`
      SELECT g.*, c.name AS category_name
      FROM grievances g
      JOIN grievance_categories c ON c.id = g.category_id
      WHERE g.citizen_id = ?
      ORDER BY g.created_at DESC
    `)
    .all(req.user.id);

  res.json(rows);
});

app.get("/api/grievances/track/:ticket", auth, (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const ticket = String(req.params.ticket ?? "").trim();
  if (!ticket) {
    res.status(400).json({ error: "Ticket id is required" });
    return;
  }

  const db = getDb();
  const grievance = db
    .prepare(`
      SELECT g.*, c.name AS category_name, u.name AS citizen_name
      FROM grievances g
      JOIN grievance_categories c ON c.id = g.category_id
      JOIN users u ON u.id = g.citizen_id
      WHERE g.ticket_number = ?
    `)
    .get(ticket) as (Record<string, unknown> & { citizen_id: number; status: string; complaint_status?: string }) | undefined;

  if (!grievance) {
    res.status(404).json({ error: "Complaint not found" });
    return;
  }

  if (req.user.role === "citizen" && grievance.citizen_id !== req.user.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const status = String(grievance.status);
  const complaintStatus = String(grievance.complaint_status ?? "");
  const stage =
    complaintStatus === "closed" || status === "closed"
      ? "closed"
      : status === "resolved"
      ? "closed"
      : complaintStatus === "in_progress" || status === "in_progress" || status === "awaiting_confirmation"
      ? "in_progress"
      : complaintStatus === "accepted" || status === "under_review" || status === "assigned" || status === "escalated" || status === "reopened"
      ? "accepted"
      : "submitted";

  res.json({ ...grievance, tracking_stage: stage });
});

app.post("/api/grievances", auth, (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "citizen") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const schema = z.object({
    categoryId: z.number().int().positive(),
    title: z.string().min(4),
    description: z.string().min(10),
    location: z.string().min(3),
    latitude: z.number().optional(),
    longitude: z.number().optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid grievance payload" });
    return;
  }

  const db = getDb();
  const ticket = `GRV-${Date.now().toString(36).toUpperCase()}`;
  const payload = parsed.data;

  db.prepare(`
      INSERT INTO grievances
        (ticket_number, citizen_id, category_id, title, description, location, latitude, longitude, priority, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'medium', 'submitted')
    `).run(
    ticket,
    req.user.id,
    payload.categoryId,
    payload.title,
    payload.description,
    payload.location,
    payload.latitude ?? null,
    payload.longitude ?? null
  );

  const grievance = db
    .prepare("SELECT * FROM grievances WHERE ticket_number = ?")
    .get(ticket);

  res.status(201).json(grievance);
});

app.post("/api/complaints", auth, upload.array("photos", 6), (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "citizen") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const schema = z.object({
    categoryId: z.coerce.number().int().positive(),
    fullName: z.string().min(2),
    email: z.string().email(),
    mobile: z.string().regex(/^\d{10}$/),
    description: z.string().min(10),
    location: z.string().min(3),
    latitude: z.coerce.number().optional(),
    longitude: z.coerce.number().optional()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid form data", details: parsed.error.flatten() });
    return;
  }

  const payload = parsed.data;
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const imagePaths = files.map((file) => `/uploads/${file.filename}`);
  const db = getDb();
  const complaintId = `CMP-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;
  const category = db
    .prepare("SELECT name FROM grievance_categories WHERE id = ?")
    .get(payload.categoryId) as { name?: string } | undefined;
  const assignedDepartment = category?.name ? `${category.name} Department` : "General Department";

  db.prepare(`
    INSERT INTO grievances
      (
        ticket_number,
        citizen_id,
        category_id,
        title,
        description,
        reporter_name,
        reporter_email,
        reporter_mobile,
        assigned_department,
        location,
        latitude,
        longitude,
        images_json,
        priority,
        status,
        complaint_status
      )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'medium', 'submitted', 'pending')
  `).run(
    complaintId,
    req.user.id,
    payload.categoryId,
    `Complaint by ${payload.fullName}`,
    payload.description,
    payload.fullName,
    payload.email,
    payload.mobile,
    assignedDepartment,
    payload.location,
    payload.latitude ?? null,
    payload.longitude ?? null,
    JSON.stringify(imagePaths)
  );

  const created = db
    .prepare("SELECT id, ticket_number, complaint_status, status, created_at FROM grievances WHERE ticket_number = ?")
    .get(complaintId);

  res.status(201).json({ message: "Complaint submitted successfully", complaint: created });
});

app.get("/api/authority/grievances/:id", auth, (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "authority") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const db = getDb();
  const grievance = db
    .prepare(`
      SELECT
        g.*,
        c.name AS category_name,
        u.name AS citizen_name,
        u.email AS citizen_email,
        u.phone AS citizen_phone
      FROM grievances g
      JOIN grievance_categories c ON c.id = g.category_id
      JOIN users u ON u.id = g.citizen_id
      WHERE g.id = ?
    `)
    .get(Number(req.params.id)) as Record<string, unknown> | undefined;

  if (!grievance) {
    res.status(404).json({ error: "Complaint not found" });
    return;
  }

  res.json(grievance);
});

app.patch("/api/authority/grievances/:id/status", auth, (req: AuthenticatedRequest, res) => {
  if (req.user?.role !== "authority") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsed = authorityStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid status payload" });
    return;
  }

  const statusMap: Record<string, string[]> = {
    accepted: ["under_review", "assigned"],
    in_progress: ["in_progress"],
    closed: ["closed", "resolved"]
  };

  const db = getDb();
  const id = Number(req.params.id);
  const candidates = statusMap[parsed.data.status];
  const nextComplaintStatus = parsed.data.status;
  let updated = false;
  for (const nextStatus of candidates) {
    try {
      db.prepare(`
        UPDATE grievances
        SET status = ?, complaint_status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(nextStatus, nextComplaintStatus, id);
      updated = true;
      break;
    } catch {
      // Try fallback status value for legacy schemas.
    }
  }

  if (!updated) {
    res.status(500).json({ error: "Unable to update status for current database schema" });
    return;
  }

  const updatedRow = db
    .prepare("SELECT id, ticket_number, status, complaint_status, updated_at FROM grievances WHERE id = ?")
    .get(id);

  if (!updatedRow) {
    res.status(404).json({ error: "Complaint not found" });
    return;
  }

  res.json(updatedRow);
});

app.get("/api/map/markers", auth, (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const db = getDb();
  const markers =
    req.user.role === "authority"
      ? db
          .prepare(`
              SELECT
                g.id,
                g.ticket_number,
                g.title,
                g.status,
                g.complaint_status,
                g.latitude,
                g.longitude,
                g.location
            FROM grievances g
            WHERE g.latitude IS NOT NULL AND g.longitude IS NOT NULL
          `)
          .all()
      : db
          .prepare(`
              SELECT
                g.id,
                g.ticket_number,
                g.title,
                g.status,
                g.complaint_status,
                g.latitude,
                g.longitude,
                g.location
            FROM grievances g
            WHERE g.citizen_id = ? AND g.latitude IS NOT NULL AND g.longitude IS NOT NULL
          `)
          .all(req.user.id);
  res.json(markers);
});

app.post("/webhooks/telegram", async (req: Request, res: Response) => {
  if (!isTelegramEnabled()) {
    res.status(503).json({ error: "Telegram integration is disabled" });
    return;
  }

  if (TELEGRAM_WEBHOOK_SECRET) {
    const secret = String(req.headers["x-telegram-bot-api-secret-token"] ?? "");
    if (secret !== TELEGRAM_WEBHOOK_SECRET) {
      res.status(401).json({ error: "Invalid webhook secret" });
      return;
    }
  }

  const update = req.body as TelegramUpdate;
  if (!update || typeof update.update_id !== "number") {
    res.status(400).json({ error: "Invalid update payload" });
    return;
  }

  const db = getDb();
  const seen = db.prepare("SELECT 1 as exists FROM telegram_updates WHERE update_id = ?").get(update.update_id) as
    | { exists: number }
    | undefined;
  if (seen) {
    res.json({ ok: true, duplicate: true });
    return;
  }

  db.prepare("INSERT INTO telegram_updates (update_id) VALUES (?)").run(update.update_id);

  try {
    if (update.callback_query) {
      await handleTelegramCallback(update);
    } else if (update.message) {
      await handleTelegramMessage(update);
    }
  } catch (error) {
    console.error("Telegram webhook error:", error);
  }

  res.json({ ok: true });
});

app.post("/api/telegram/set-webhook", async (_req: Request, res: Response) => {
  if (!isTelegramEnabled()) {
    res.status(400).json({ error: "Set TELEGRAM_BOT_TOKEN first" });
    return;
  }

  const appBaseUrl = String(process.env.APP_BASE_URL ?? "").trim().replace(/\/$/, "");
  if (!appBaseUrl) {
    res.status(400).json({ error: "Set APP_BASE_URL in environment" });
    return;
  }

  const payload: Record<string, unknown> = {
    url: `${appBaseUrl}/webhooks/telegram`
  };
  if (TELEGRAM_WEBHOOK_SECRET) payload.secret_token = TELEGRAM_WEBHOOK_SECRET;

  const response = await fetch(`${TELEGRAM_API_BASE}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const result = (await response.json()) as unknown;
  if (!response.ok) {
    res.status(response.status).json({ error: "Failed to set webhook", details: result });
    return;
  }

  res.json(result);
});

const clientDistPath = path.resolve(__dirname, "../client/dist");
app.use(express.static(clientDistPath));
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDistPath, "index.html"));
});

initDb();
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
