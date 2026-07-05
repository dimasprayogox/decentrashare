import { browser } from '$app/environment';

class ThemeController {
	theme = $state<'light' | 'dark'>('dark'); // Default to dark since current app is dark-first

	constructor() {
		if (browser) {
			const stored = localStorage.getItem('theme');
			if (stored === 'light' || stored === 'dark') {
				this.theme = stored;
			} else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
				this.theme = 'light';
			}
			this.apply();
		}
	}

	toggle() {
		this.theme = this.theme === 'dark' ? 'light' : 'dark';
		if (browser) {
			localStorage.setItem('theme', this.theme);
			this.apply();
		}
	}

	set(newTheme: 'light' | 'dark') {
		this.theme = newTheme;
		if (browser) {
			localStorage.setItem('theme', newTheme);
			this.apply();
		}
	}

	private apply() {
		if (!browser) return;
		if (this.theme === 'dark') {
			document.documentElement.classList.add('dark');
		} else {
			document.documentElement.classList.remove('dark');
		}
	}
}

export const themeController = new ThemeController();
