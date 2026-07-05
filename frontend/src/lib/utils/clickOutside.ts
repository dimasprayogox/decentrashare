// src/lib/utils/clickOutside.ts
export function onClickOutside(
	element: HTMLElement | undefined,
	callback: (event: MouseEvent) => void
) {
	function handler(event: MouseEvent) {
		if (element && !element.contains(event.target as Node)) {
			callback(event);
		}
	}

	document.addEventListener('mousedown', handler);
	document.addEventListener('touchstart', handler);

	return () => {
		document.removeEventListener('mousedown', handler);
		document.removeEventListener('touchstart', handler);
	};
}
