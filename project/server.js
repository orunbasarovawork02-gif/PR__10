const express = require("express");
const path = require("path");
const db = require("./db");
const bcrypt = require("bcrypt");
const session = require("express-session");

require("dotenv").config({
    path: path.join(__dirname, ".env")
});

const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use(session({
    secret: process.env.SESSION_SECRET || "temporary-secret-change-in-env",
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        maxAge: 2 * 60 * 60 * 1000
    }
}));

app.use((req, res, next) => {
    res.locals.isAdmin = Boolean(req.session.isAdmin);
    next();
});

function requireAuth(req, res, next) {
    if (req.session.isAdmin) return next();
    return res.redirect("/login");
}

function requireApiAuth(req, res, next) {
    if (req.session.isAdmin) return next();
    return res.status(401).json({
        error: "Доступ запрещён. Войдите как администратор."
    });
}

function parseId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validatePlace(body) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string"
        ? body.description.trim()
        : "";
    const category = typeof body.category === "string"
        ? body.category.trim()
        : "";
    const time = typeof body.time === "string" ? body.time.trim() : "";
    const image = typeof body.image === "string" ? body.image.trim() : "";

    const errors = [];
    if (title.length < 8) errors.push("Название должно содержать минимум 8 символов.");
    if (description.length < 10) errors.push("Описание должно содержать минимум 10 символов.");
    if (!category) errors.push("Укажите категорию.");
    if (!time) errors.push("Укажите время посещения.");

    return { errors, place: { title, description, category, time, image } };
}

async function getNextPlaceId(collection) {
    const lastPlace = await collection.find({}).sort({ id: -1 }).limit(1).toArray();
    return lastPlace.length > 0 && Number.isInteger(lastPlace[0].id)
        ? lastPlace[0].id + 1
        : 1;
}

// Приводим документы из старой версии PR-8 к единому виду:
// добавляем id и переносим name в title, если это необходимо.
async function migratePlacesSchema() {
    const collection = db.getCollection("places");
    const places = await collection.find({}).sort({ _id: 1 }).toArray();

    const usedIds = new Set(
        places.map(place => place.id)
            .filter(id => Number.isInteger(id) && id > 0)
    );
    let nextId = usedIds.size > 0 ? Math.max(...usedIds) + 1 : 1;
    const seenIds = new Set();

    for (const place of places) {
        let id = Number.isInteger(place.id) && place.id > 0 ? place.id : null;

        if (id === null || seenIds.has(id)) {
            while (usedIds.has(nextId) || seenIds.has(nextId)) nextId += 1;
            id = nextId;
            nextId += 1;
        }
        seenIds.add(id);

        const title = typeof place.title === "string" && place.title.trim()
            ? place.title.trim()
            : (place.name || "Без названия");

        const update = {};
        if (place.id !== id) update.id = id;
        if (place.title !== title) update.title = title;
        if (place.image === "Nur Alem.jpg") update.image = "Nur alem.jpg";

        if (Object.keys(update).length > 0) {
            await collection.updateOne({ _id: place._id }, { $set: update });
        }
    }

    console.log("Проверена структура достопримечательностей:", places.length);
}

// Главная страница
app.get("/", async (req, res) => {
    try {
        const places = await db.getCollection("places")
            .find({})
            .sort({ id: 1 })
            .toArray();

        res.render("index", {
            title: "ASTANA GUIDE — Тур-гид по Астане",
            places
        });
    } catch (error) {
        console.error("Ошибка главной страницы:", error);
        res.status(500).render("error", {
            message: "Не удалось загрузить достопримечательности."
        });
    }
});

// ========================= REST API =========================

// GET /api/places?page=1&limit=10
// GET /api/places?category=Прогулка
// GET /api/places?q=мост
// GET /api/places?time=1–2 часа
app.get("/api/places", async (req, res) => {
    try {
        const page = req.query.page === undefined ? 1 : Number(req.query.page);
        const limit = req.query.limit === undefined ? 10 : Number(req.query.limit);

        if (!Number.isInteger(page) || page < 1 ||
            !Number.isInteger(limit) || limit < 1) {
            return res.status(400).json({
                error: "Параметры page и limit должны быть положительными целыми числами."
            });
        }

        const safeLimit = Math.min(limit, 100);
        const filter = {};

        if (typeof req.query.category === "string" && req.query.category.trim()) {
            filter.category = {
                $regex: `^${escapeRegex(req.query.category.trim())}$`,
                $options: "i"
            };
        }

        if (typeof req.query.time === "string" && req.query.time.trim()) {
            filter.time = {
                $regex: escapeRegex(req.query.time.trim()),
                $options: "i"
            };
        }

        const search = typeof req.query.q === "string" ? req.query.q.trim() : "";
        if (search) {
            const searchRegex = new RegExp(escapeRegex(search), "i");
            filter.$or = [
                { title: searchRegex },
                { description: searchRegex },
                { category: searchRegex }
            ];
        }

        const collection = db.getCollection("places");
        const total = await collection.countDocuments(filter);
        const items = await collection.find(filter)
            .sort({ id: 1 })
            .skip((page - 1) * safeLimit)
            .limit(safeLimit)
            .toArray();

        return res.status(200).json({
            total,
            page,
            limit: safeLimit,
            items
        });
    } catch (error) {
        console.error("GET /api/places:", error);
        return res.status(500).json({
            error: "Не удалось получить список достопримечательностей."
        });
    }
});

// GET /api/places/:id — получение одной записи
app.get("/api/places/:id", async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (id === null) return res.status(400).json({ error: "Некорректный ID." });

        const place = await db.getCollection("places").findOne({ id });
        if (!place) return res.status(404).json({ error: "Достопримечательность не найдена." });

        return res.status(200).json(place);
    } catch (error) {
        console.error("GET /api/places/:id:", error);
        return res.status(500).json({ error: "Не удалось получить запись." });
    }
});

// POST /api/places — добавление (только администратор)
app.post("/api/places", requireApiAuth, async (req, res) => {
    try {
        const { errors, place } = validatePlace(req.body);
        if (errors.length > 0) {
            return res.status(400).json({ error: "Проверьте данные.", details: errors });
        }

        const collection = db.getCollection("places");
        const newPlace = { id: await getNextPlaceId(collection), ...place };
        await collection.insertOne(newPlace);

        return res.status(201).json({
            message: "Достопримечательность успешно добавлена.",
            item: newPlace
        });
    } catch (error) {
        console.error("POST /api/places:", error);
        return res.status(500).json({ error: "Не удалось добавить достопримечательность." });
    }
});

// PUT /api/places/:id — изменение (только администратор)
app.put("/api/places/:id", requireApiAuth, async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (id === null) return res.status(400).json({ error: "Некорректный ID." });

        const { errors, place } = validatePlace(req.body);
        if (errors.length > 0) {
            return res.status(400).json({ error: "Проверьте данные.", details: errors });
        }

        const collection = db.getCollection("places");
        const result = await collection.updateOne({ id }, { $set: place });

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: "Достопримечательность не найдена." });
        }

        const updatedPlace = await collection.findOne({ id });
        return res.status(200).json({
            message: "Достопримечательность успешно изменена.",
            item: updatedPlace
        });
    } catch (error) {
        console.error("PUT /api/places/:id:", error);
        return res.status(500).json({ error: "Не удалось изменить запись." });
    }
});

// DELETE /api/places/:id — удаление (только администратор)
app.delete("/api/places/:id", requireApiAuth, async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (id === null) return res.status(400).json({ error: "Некорректный ID." });

        const result = await db.getCollection("places").deleteOne({ id });
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: "Достопримечательность не найдена." });
        }

        return res.status(200).json({
            message: "Достопримечательность успешно удалена.",
            id
        });
    } catch (error) {
        console.error("DELETE /api/places/:id:", error);
        return res.status(500).json({ error: "Не удалось удалить запись." });
    }
});

// ====================== АВТОРИЗАЦИЯ ======================

app.get("/login", (req, res) => {
    if (req.session.isAdmin) return res.redirect("/add");
    res.render("login", { title: "Вход администратора", error: null });
});

app.post("/login", async (req, res) => {
    try {
        const { login, password } = req.body;

        if (!login || !password) {
            return res.status(400).render("login", {
                title: "Вход администратора",
                error: "Введите логин и пароль."
            });
        }

        const correctLogin = login === process.env.ADMIN_LOGIN;
        const correctPassword = process.env.ADMIN_HASH
            ? await bcrypt.compare(password, process.env.ADMIN_HASH)
            : false;

        if (!correctLogin || !correctPassword) {
            return res.status(401).render("login", {
                title: "Вход администратора",
                error: "Неверный логин или пароль."
            });
        }

        req.session.regenerate((error) => {
            if (error) {
                console.error("Ошибка создания сессии:", error);
                return res.status(500).render("login", {
                    title: "Вход администратора",
                    error: "Не удалось выполнить вход."
                });
            }

            req.session.isAdmin = true;
            req.session.save((saveError) => {
                if (saveError) {
                    console.error("Ошибка сохранения сессии:", saveError);
                    return res.status(500).render("login", {
                        title: "Вход администратора",
                        error: "Не удалось сохранить авторизацию."
                    });
                }
                return res.redirect("/add");
            });
        });
    } catch (error) {
        console.error("Ошибка авторизации:", error);
        return res.status(500).render("login", {
            title: "Вход администратора",
            error: "Произошла ошибка при входе."
        });
    }
});

app.post("/logout", (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            console.error("Ошибка выхода:", error);
            return res.status(500).send("Не удалось выйти из аккаунта.");
        }
        res.clearCookie("connect.sid");
        return res.redirect("/");
    });
});

// ====================== HTML-СТРАНИЦЫ ======================

app.get("/add", requireAuth, (req, res) => {
    res.render("add", {
        title: "Добавить достопримечательность",
        errors: [],
        formData: {}
    });
});

// Добавление через HTML-форму (предыдущая функция PR-8)
app.post("/add", requireAuth, async (req, res) => {
    try {
        const { errors, place } = validatePlace(req.body);

        if (errors.length > 0) {
            return res.status(400).render("add", {
                title: "Добавить достопримечательность",
                errors,
                formData: req.body
            });
        }

        const collection = db.getCollection("places");
        const newPlace = { id: await getNextPlaceId(collection), ...place };
        await collection.insertOne(newPlace);
        return res.redirect("/");
    } catch (error) {
        console.error("Ошибка добавления места:", error);
        return res.status(500).render("error", {
            message: "Не удалось добавить достопримечательность."
        });
    }
});

// Страница редактирования (сама запись сохраняется через PUT API)
app.get("/edit/:id", requireAuth, async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (id === null) {
            return res.status(400).render("error", {
                message: "Некорректный ID достопримечательности."
            });
        }

        const place = await db.getCollection("places").findOne({ id });
        if (!place) {
            return res.status(404).render("404", { title: "Страница не найдена" });
        }

        return res.render("edit", {
            title: "Редактировать достопримечательность",
            place
        });
    } catch (error) {
        console.error("Ошибка открытия редактирования:", error);
        return res.status(500).render("error", {
            message: "Не удалось открыть запись для редактирования."
        });
    }
});

app.get("/place/:id", async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (id === null) {
            return res.status(400).render("error", {
                message: "Некорректный ID достопримечательности."
            });
        }

        const place = await db.getCollection("places").findOne({ id });
        if (!place) return res.status(404).render("404", { title: "Страница не найдена" });

        return res.render("place", { title: place.title, place });
    } catch (error) {
        console.error("Ошибка загрузки места:", error);
        return res.status(500).render("error", {
            message: "Не удалось загрузить страницу."
        });
    }
});

app.get("/about", (req, res) => {
    res.render("about", { title: "О проекте" });
});

app.use((req, res) => {
    if (req.path.startsWith("/api/")) {
        return res.status(404).json({ error: "API-маршрут не найден." });
    }
    return res.status(404).render("404", { title: "Страница не найдена" });
});

app.use((error, req, res, next) => {
    console.error("Ошибка сервера:", error);
    if (req.path.startsWith("/api/")) {
        return res.status(500).json({ error: "Внутренняя ошибка сервера." });
    }
    return res.status(500).render("error", {
        message: "Произошла внутренняя ошибка сервера."
    });
});

async function startServer() {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error("Не найден MONGODB_URI в файле .env");
        }
        if (!process.env.ADMIN_LOGIN || !process.env.ADMIN_HASH) {
            throw new Error("Не настроены данные администратора в .env");
        }
        if (!process.env.SESSION_SECRET) {
            throw new Error("Не найден SESSION_SECRET в файле .env");
        }

        await db.connect();
        await migratePlacesSchema();

        app.listen(PORT, () => {
            console.log(`Сервер запущен: http://localhost:${PORT}`);
            console.log(`REST API: http://localhost:${PORT}/api/places`);
        });
    } catch (error) {
        console.error("Ошибка запуска сервера:", error);
    }
}

startServer();
