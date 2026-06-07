/**
 * Svelte action: adds the `in-view` class to an element once it scrolls
 * into the viewport. Useful for scroll-triggered reveal animations.
 *
 * Usage:
 *   <div use:inView class="reveal">...</div>
 *   <div use:inView={{ threshold: 0.3, once: true }}>...</div>
 */
export interface InViewOptions {
	/** Portion of the element that must be visible (0–1). */
	threshold?: number;
	/** Root margin passed to the IntersectionObserver. */
	rootMargin?: string;
	/** Only trigger once (default true). */
	once?: boolean;
}

export function inView(node: HTMLElement, options: InViewOptions = {}) {
	const { threshold = 0.15, rootMargin = '0px 0px -10% 0px', once = true } = options;

	// Respect reduced-motion preferences and SSR safety.
	if (typeof IntersectionObserver === 'undefined') {
		node.classList.add('in-view');
		return;
	}

	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) {
					node.classList.add('in-view');
					if (once) observer.unobserve(node);
				} else if (!once) {
					node.classList.remove('in-view');
				}
			}
		},
		{ threshold, rootMargin }
	);

	observer.observe(node);

	return {
		destroy() {
			observer.disconnect();
		}
	};
}
