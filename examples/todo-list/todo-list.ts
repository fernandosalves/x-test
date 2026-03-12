/**
 * Example — Todo List component
 *
 * @xtest-surface
 * @element new-item-input   by-ref: new-item
 *   @alias  "new todo", "add input", "task input", "item input"
 *
 * @element add-button       by-ref: add-btn
 *   @alias  "add", "add button", "create", "submit"
 *
 * @element todo-list        by-ref: todo-list
 *   @alias  "list", "todos", "items"
 *
 * @element empty-message    by-selector: .empty-msg
 *   @alias  "empty state", "empty", "empty message", "nothing here"
 *
 * @element filter-all       by-ref: filter-all
 *   @alias  "all filter", "show all", "all tab"
 *
 * @element filter-open      by-ref: filter-open
 *   @alias  "open filter", "show open", "active filter"
 *
 * @element filter-done      by-ref: filter-done
 *   @alias  "done filter", "show done", "completed filter"
 *
 * @element item-count       by-selector: .item-count
 *   @alias  "count", "item count", "remaining count"
 */
export function renderTodoList(): string {
    return /* html */`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Todo List</title>
    <style>
        body { font-family: system-ui, sans-serif; max-width: 480px; margin: 2rem auto; padding: 0 1rem; background: #f8fafc; }
        h1 { font-size: 1.4rem; color: #0f172a; margin-bottom: 1rem; }
        .input-row { display: flex; gap: .5rem; margin-bottom: 1rem; }
        .input-row input { flex: 1; border: 1px solid #cbd5e1; border-radius: 6px; padding: .45rem .7rem; font-size: .9rem; }
        .input-row button { background: #4f46e5; color: white; border: none; border-radius: 6px; padding: .45rem .9rem; cursor: pointer; font-weight: 600; }
        .filter-row { display: flex; gap: .35rem; margin-bottom: .75rem; }
        .filter-row button { background: #e2e8f0; color: #475569; border: none; border-radius: 5px; padding: .3rem .7rem; font-size: .8rem; cursor: pointer; }
        .filter-row button.active { background: #4f46e5; color: white; }
        ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: .35rem; }
        li { display: flex; align-items: center; gap: .5rem; padding: .5rem .7rem; background: white; border: 1px solid #e2e8f0; border-radius: 6px; }
        li.done label { text-decoration: line-through; color: #94a3b8; }
        li label { flex: 1; font-size: .9rem; cursor: pointer; }
        li button.del { background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 1rem; }
        li button.del:hover { color: #dc2626; }
        .empty-msg { color: #94a3b8; font-style: italic; font-size: .9rem; text-align: center; padding: 1.5rem 0; }
        .item-count { font-size: .78rem; color: #64748b; margin-top: .6rem; }
    </style>
</head>
<body>
    <h1>Todos</h1>

    <div class="input-row">
        <input data-xtest="new-item" id="new-item" type="text" placeholder="New todo…" />
        <button data-xtest="add-btn" id="add-btn">Add</button>
    </div>

    <div class="filter-row">
        <button data-xtest="filter-all"  class="active" data-filter="all">All</button>
        <button data-xtest="filter-open" data-filter="open">Open</button>
        <button data-xtest="filter-done" data-filter="done">Done</button>
    </div>

    <ul data-xtest="todo-list" id="todo-list"></ul>
    <p class="empty-msg" id="empty-msg">Nothing yet — add something above!</p>
    <p class="item-count" id="item-count"></p>

    <script>
        let todos = [];
        let nextId = 1;
        let filter = 'all';

        const input   = document.getElementById('new-item');
        const addBtn  = document.getElementById('add-btn');
        const listEl  = document.getElementById('todo-list');
        const emptyEl = document.getElementById('empty-msg');
        const countEl = document.getElementById('item-count');

        function render() {
            const visible = todos.filter(t =>
                filter === 'done' ? t.done : filter === 'open' ? !t.done : true
            );

            listEl.innerHTML = '';
            for (const todo of visible) {
                const li = document.createElement('li');
                if (todo.done) li.classList.add('done');
                li.dataset.id = todo.id;
                li.innerHTML = \`
                    <input type="checkbox" id="cb-\${todo.id}" \${todo.done ? 'checked' : ''}>
                    <label for="cb-\${todo.id}">\${todo.text}</label>
                    <button class="del" data-del="\${todo.id}">✕</button>
                \`;
                listEl.appendChild(li);
            }

            emptyEl.hidden   = visible.length > 0;
            const remaining  = todos.filter(t => !t.done).length;
            countEl.textContent = todos.length > 0
                ? \`\${remaining} remaining · \${todos.length} total\`
                : '';

            document.querySelectorAll('.filter-row button').forEach(b => {
                b.classList.toggle('active', b.dataset.filter === filter);
            });
        }

        addBtn.addEventListener('click', () => {
            const text = input.value.trim();
            if (!text) return;
            todos.push({ id: nextId++, text, done: false });
            input.value = '';
            render();
        });

        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') addBtn.click();
        });

        listEl.addEventListener('change', e => {
            const cb = e.target.closest('input[type=checkbox]');
            if (!cb) return;
            const id = Number(cb.closest('li').dataset.id);
            todos = todos.map(t => t.id === id ? { ...t, done: cb.checked } : t);
            render();
        });

        listEl.addEventListener('click', e => {
            const btn = e.target.closest('[data-del]');
            if (!btn) return;
            todos = todos.filter(t => t.id !== Number(btn.dataset.del));
            render();
        });

        document.querySelector('.filter-row').addEventListener('click', e => {
            const btn = e.target.closest('[data-filter]');
            if (!btn) return;
            filter = btn.dataset.filter;
            render();
        });

        render();
    </script>
</body>
</html>
    `.trim();
}
