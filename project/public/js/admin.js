document.addEventListener("click", async function (event) {
    const button = event.target.closest(".delete-place-button");
    if (!button) return;

    const id = button.dataset.id;
    const confirmed = window.confirm("Удалить эту достопримечательность? Это действие нельзя отменить.");
    if (!confirmed) return;

    button.disabled = true;

    try {
        const response = await fetch(`/api/places/${id}`, {
            method: "DELETE"
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Не удалось удалить запись.");
        }

        const card = button.closest("[data-place-id]");
        if (card) card.remove();

        // Если удаление было выполнено со страницы отдельной записи,
        // возвращаем администратора к списку.
        if (!card) {
            window.location.href = "/";
            return;
        }

        window.alert("Достопримечательность удалена.");
    } catch (error) {
        window.alert(error.message);
        button.disabled = false;
    }
});
