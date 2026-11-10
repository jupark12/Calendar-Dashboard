import { useState } from "react";
import type { Item } from "../shared/model";
import { api, type DashboardData } from "./data";
import type { Action } from "./manageTypes";
const blank = {
  list: "grocery" as const,
  text: "",
  category: "",
  priority: "normal" as const,
  due: null,
  completed: false,
};
export function Lists({
  data,
  act,
  busy,
}: {
  data: DashboardData;
  act: Action;
  busy: boolean;
}) {
  const [list, setList] = useState<"grocery" | "todo">("grocery");
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState<Omit<Item, "id" | "version">>(blank);
  const items = data.items
    .filter((i) => i.list === list)
    .sort(
      (a, b) =>
        Number(a.completed) - Number(b.completed) ||
        Number(b.priority === "high") - Number(a.priority === "high"),
    );
  function reset() {
    setEditing(null);
    setForm({ ...blank, list });
  }
  return (
    <div className="manage-list-layout">
      <section className="panel list-editor">
        <div className="view-switch">
          <button
            aria-pressed={list === "grocery"}
            onClick={() => {
              setList("grocery");
              setEditing(null);
              setForm({ ...blank, list: "grocery" });
            }}
          >
            Groceries
          </button>
          <button
            aria-pressed={list === "todo"}
            onClick={() => {
              setList("todo");
              setEditing(null);
              setForm({ ...blank, list: "todo" });
            }}
          >
            To-do
          </button>
        </div>
        <h2>
          {list === "grocery"
            ? "Good things for the pantry."
            : "Make a little progress."}
        </h2>
        <p>
          {items.filter((i) => !i.completed).length} left to{" "}
          {list === "grocery" ? "pick up" : "do"}
        </p>
        {!items.length && (
          <p className="empty">
            Your list is clear. Add something on the right.
          </p>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            className={`manage-item ${item.completed ? "completed" : ""}`}
          >
            <input
              type="checkbox"
              aria-label={`Complete ${item.text}`}
              checked={item.completed}
              disabled={busy}
              onChange={() =>
                void act(() =>
                  api(
                    "/items/" + item.id,
                    { ...item, completed: !item.completed },
                    "PUT",
                  ),
                )
              }
            />
            <div>
              <strong>{item.text}</strong>
              <small>
                {[
                  item.category,
                  item.priority === "high" ? "High priority" : "",
                  item.due ? "Due " + item.due : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
            </div>
            <button
              disabled={busy}
              onClick={() => {
                setEditing(item);
                setForm(item);
              }}
            >
              Edit
            </button>
            <button
              className="delete"
              disabled={busy}
              aria-label={`Delete ${item.text}`}
              onClick={() =>
                void act(() =>
                  api("/items/" + item.id, { version: item.version }, "DELETE"),
                )
              }
            >
              ×
            </button>
          </div>
        ))}
      </section>
      <section className="panel item-form">
        <h2>{editing ? "Edit item" : "Add to the list"}</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await act(() =>
                editing
                  ? api(
                      "/items/" + editing.id,
                      { ...form, version: editing.version },
                      "PUT",
                    )
                  : api("/items", form),
              )
            )
              reset();
          }}
        >
          <label>
            What do we need?
            <input
              required
              maxLength={160}
              value={form.text}
              onChange={(e) => setForm({ ...form, text: e.target.value })}
              placeholder={
                list === "grocery"
                  ? "e.g. Fresh strawberries"
                  : "e.g. Book the car service"
              }
            />
          </label>
          <label>
            Category <span>optional</span>
            <input
              maxLength={40}
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="Produce, home, errands…"
            />
          </label>
          <label>
            Priority
            <select
              value={form.priority}
              onChange={(e) =>
                setForm({
                  ...form,
                  priority: e.target.value as "normal" | "high",
                })
              }
            >
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </label>
          <label>
            Due date <span>optional</span>
            <input
              type="date"
              value={form.due ?? ""}
              onChange={(e) =>
                setForm({ ...form, due: e.target.value || null })
              }
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : editing ? "Save changes" : "Add item"}
          </button>
          {editing && (
            <button type="button" onClick={reset}>
              Cancel edit
            </button>
          )}
        </form>
      </section>
    </div>
  );
}
