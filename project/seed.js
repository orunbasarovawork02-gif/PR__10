const fs = require("fs");
const path = require("path");
const db = require("./db");

async function seed() {
    try {
        await db.connect();

        const collection = db.getCollection("places");
        const count = await collection.countDocuments();

        if (count > 0) {
            console.log("Коллекция places уже содержит данные:", count);
            return;
        }

        const source = JSON.parse(
            fs.readFileSync(path.join(__dirname, "data.json"), "utf8")
        );

        const documents = source.map((item, index) => ({
            id: Number.isInteger(item.id) ? item.id : index + 1,
            title: item.title || item.name || "Без названия",
            description: item.description || "",
            category: item.category || "",
            time: item.time || "",
            image: item.image || ""
        }));

        if (documents.length === 0) {
            console.log("В data.json нет записей для переноса.");
            return;
        }

        await collection.insertMany(documents);
        console.log("В базу добавлено достопримечательностей:", documents.length);
    } catch (error) {
        console.error("Ошибка заполнения базы:", error);
        process.exitCode = 1;
    } finally {
        process.exit();
    }
}

seed();
