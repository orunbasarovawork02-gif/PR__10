const container = document.getElementById("cards");
const loader = document.getElementById("loader");
const errorBox = document.getElementById("error");
const emptyBox = document.getElementById("empty");
const retryButton = document.getElementById("retry");

function showState(state) {
    loader.hidden = state !== "loading";
    errorBox.hidden = state !== "error";
    emptyBox.hidden = state !== "empty";
    container.hidden = state !== "data";
}

function createCard(place) {
    const card = document.createElement("article");

    card.className = "card";

    card.innerHTML = `
        <h3>${place.title}</h3>
        <p><b>Категория:</b> ${place.category}</p>
        <p><b>Время:</b> ${place.time}</p>
        <p>${place.description}</p>
    `;

    return card;
}

function render(data) {
    container.innerHTML = "";

    data.forEach(function(place) {
        container.appendChild(createCard(place));
    });
}

async function load() {

    showState("loading");

    try {

        const response = await fetch("/api/items");

        if (!response.ok) {
            throw new Error();
        }

        const data = await response.json();

        if (data.length === 0) {
            showState("empty");
            return;
        }

        render(data);

        showState("data");

    } catch (error) {

        console.error(error);

        showState("error");
    }
}

retryButton.addEventListener("click", load);

load();