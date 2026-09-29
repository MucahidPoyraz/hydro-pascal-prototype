export function handleTabKeyDown(event, items, current, onSelect, idPrefix) {
  const currentIndex = items.findIndex(item => item.id === current);
  let nextIndex = currentIndex;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % items.length;
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + items.length) % items.length;
  else if (event.key === 'Home') nextIndex = 0;
  else if (event.key === 'End') nextIndex = items.length - 1;
  else return;

  event.preventDefault();
  const next = items[nextIndex];
  onSelect(next.id);
  requestAnimationFrame(() => document.getElementById(idPrefix + next.id)?.focus());
}
