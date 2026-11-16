/** Styled custom selects that keep the native <select> in sync for existing code. */

const wrappers = new WeakMap();

function labelOf(opt) {
  return (opt?.textContent || "").trim() || "—";
}

function rebuild(select) {
  const wrap = wrappers.get(select);
  if (!wrap) return;
  const { btn, menu, label } = wrap;
  btn.disabled = select.disabled;
  const selected = select.selectedOptions[0] || select.options[0];
  label.textContent = selected ? labelOf(selected) : "—";
  menu.innerHTML = "";
  [...select.options].forEach((opt, i) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "csel-opt";
    item.textContent = labelOf(opt);
    item.disabled = opt.disabled;
    item.setAttribute("aria-selected", opt.selected ? "true" : "false");
    item.onclick = (e) => {
      e.stopPropagation();
      if (opt.disabled) return;
      select.selectedIndex = i;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      rebuild(select);
      close(select);
    };
    menu.append(item);
  });
}

function close(select) {
  const wrap = wrappers.get(select);
  if (!wrap) return;
  wrap.root.classList.remove("open");
  wrap.btn.setAttribute("aria-expanded", "false");
}

function closeAll(except) {
  document.querySelectorAll("select.native-hidden").forEach((s) => {
    if (s !== except) close(s);
  });
}

function enhance(select) {
  if (wrappers.has(select) || select.dataset.csel === "off") return;
  const parent = select.parentElement;
  if (!parent) return;

  const root = document.createElement("div");
  root.className = "csel";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "csel-btn";
  btn.setAttribute("aria-haspopup", "listbox");
  btn.setAttribute("aria-expanded", "false");
  const label = document.createElement("span");
  label.className = "csel-label";
  const chev = document.createElement("span");
  chev.className = "csel-chev";
  chev.textContent = "▾";
  btn.append(label, chev);
  const menu = document.createElement("div");
  menu.className = "csel-menu";
  menu.setAttribute("role", "listbox");

  select.classList.add("native-hidden");
  parent.insertBefore(root, select);
  root.append(select, btn, menu);
  wrappers.set(select, { root, btn, menu, label });

  btn.onclick = (e) => {
    e.stopPropagation();
    if (select.disabled) return;
    const open = !root.classList.contains("open");
    closeAll(select);
    root.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) rebuild(select);
  };

  const mo = new MutationObserver(() => rebuild(select));
  mo.observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "selected"] });
  select.addEventListener("change", () => rebuild(select));
  rebuild(select);
}

export function refreshSelect(el) {
  if (!el) return;
  if (!wrappers.has(el)) enhance(el);
  else rebuild(el);
}

export function initCustomSelects(root = document) {
  root.querySelectorAll("select").forEach(enhance);
  if (!initCustomSelects._docBound) {
    initCustomSelects._docBound = true;
    document.addEventListener("click", () => closeAll());
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAll();
    });
  }
}
