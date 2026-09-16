export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`找不到 DOM 元素：#${id}`);
  return element as T;
}

export function setText(id: string, value: string | number): void {
  byId(id).textContent = String(value);
}
