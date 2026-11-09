document.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("edit-place-form");
    const message = document.getElementById("edit-message");

    if (!form) return;

    form.addEventListener("submit", async function (event) {
        event.preventDefault();

        const id = form.dataset.placeId;
        const formData = new FormData(form);
        const place = Object.fromEntries(formData.entries());
        const submitButton = form.querySelector('button[type="submit"]');

        submitButton.disabled = true;
        message.hidden = true;

        try {
            const response = await fetch(`/api/places/${id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(place)
            });

            const result = await response.json();

            if (!response.ok) {
                const details = Array.isArray(result.details)
                    ? ` ${result.details.join(" ")}`
                    : "";
                throw new Error((result.error || "Не удалось сохранить изменения.") + details);
            }

            message.textContent = "Изменения сохранены. Возвращаемся к списку…";
            message.className = "form-message success";
            message.hidden = false;

            window.setTimeout(function () {
                window.location.href = "/";
            }, 900);
        } catch (error) {
            message.textContent = error.message;
            message.className = "form-message error";
            message.hidden = false;
            submitButton.disabled = false;
        }
    });
});
