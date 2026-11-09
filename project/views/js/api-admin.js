
// ========================================
// Изменение и удаление карточек
// ========================================

// PUT — изменение
document.querySelectorAll(".edit-place").forEach(button => {

    button.addEventListener("click", async () => {

        const id = button.dataset.id;

        const title = prompt(
            "Введите новое название:",
            button.dataset.title
        );

        if (title === null) return;

        const description = prompt(
            "Введите новое описание:",
            button.dataset.description
        );

        if (description === null) return;

        const category = prompt(
            "Введите категорию:",
            button.dataset.category
        );

        if (category === null) return;

        const time = prompt(
            "Введите время посещения:",
            button.dataset.time
        );

        if (time === null) return;

        try {
            const response = await fetch(`/api/places/${id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    title,
                    description,
                    category,
                    time
                })
            });

            const result = await response.json();

            if (!response.ok) {
                alert(result.message);
                return;
            }

            alert("Данные успешно изменены!");

            location.reload();

        } catch (error) {
            alert("Ошибка изменения записи");
            console.error(error);
        }
    });

});


// DELETE — удаление
document.querySelectorAll(".delete-place").forEach(button => {

    button.addEventListener("click", async () => {

        const id = button.dataset.id;

        const confirmed = confirm(
            "Вы действительно хотите удалить эту достопримечательность?"
        );

        if (!confirmed) return;

        try {
            const response = await fetch(`/api/places/${id}`, {
                method: "DELETE"
            });

            const result = await response.json();

            if (!response.ok) {
                alert(result.message);
                return;
            }

            alert("Достопримечательность удалена!");

            location.reload();

        } catch (error) {
            alert("Ошибка удаления записи");
            console.error(error);
        }
    });

});
