/* Pixvox Interactive: progressive enhancement for the one-page site.
   Dependency-free ES module. Every feature degrades to plain HTML if JS fails. */

const root = document.documentElement;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
const scrollBehavior = () => (reduceMotion.matches ? 'auto' : 'smooth');
const hashId = (hash) => {
	try {
		return decodeURIComponent(hash.slice(1));
	} catch {
		return hash.slice(1); // malformed escape sequence in a shared link
	}
};

/* --------------------------------------------------------------- toast -- */
let toastTimer;
function toast(message) {
	const el = $('[data-toast]');
	if (!el) return;
	el.textContent = message;
	requestAnimationFrame(() => el.classList.add('is-visible'));
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2600);
}

/* ------------------------------------- header state, scrollspy, to-top -- */
function initHeader() {
	const header = $('[data-header]');
	const sentinel = $('.top-sentinel');
	if (header && sentinel && 'IntersectionObserver' in window) {
		new IntersectionObserver(([entry]) => {
			header.classList.toggle('is-scrolled', !entry.isIntersecting);
		}).observe(sentinel);
	}

	const links = $$('[data-nav] a');
	const indicator = $('.nav__indicator');
	const sectionIds = ['home', 'products', 'services', 'aboutUs', 'partners', 'contactUs'];
	const sections = sectionIds.map((id) => document.getElementById(id)).filter(Boolean);
	const toTop = $('[data-to-top]');
	let active = null;
	let ticking = false;

	function moveIndicator(link) {
		if (!indicator) return;
		if (!link || !link.offsetParent) {
			indicator.classList.remove('is-active');
			return;
		}
		const pad = parseFloat(getComputedStyle(link).paddingLeft) || 0;
		const width = link.offsetWidth - pad * 2;
		indicator.style.setProperty('--x', `${link.offsetLeft + pad}px`);
		indicator.style.setProperty('--s', (width / indicator.offsetWidth).toFixed(3));
		indicator.classList.add('is-active');
	}

	function update() {
		ticking = false;
		const line = window.innerHeight * 0.35;
		let current = null;
		for (const section of sections) {
			if (section.getBoundingClientRect().top <= line) current = section.id;
		}
		// At the very bottom the last section is current even if it is short.
		if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
			current = sections[sections.length - 1]?.id ?? current;
		}
		if (current !== active) {
			active = current;
			let activeLink = null;
			for (const link of links) {
				const match = link.getAttribute('href') === `#${current}`;
				if (match) {
					link.setAttribute('aria-current', 'true');
					activeLink = link;
				} else {
					link.removeAttribute('aria-current');
				}
			}
			moveIndicator(activeLink);
		}
		if (toTop) {
			// Hide near the bottom, where the footer has its own "Back to top" link.
			const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160;
			toTop.classList.toggle('is-visible', window.scrollY > window.innerHeight * 1.2 && !nearBottom);
		}
	}

	const onScroll = () => {
		if (!ticking) {
			ticking = true;
			requestAnimationFrame(update);
		}
	};
	window.addEventListener('scroll', onScroll, { passive: true });
	window.addEventListener('resize', () => {
		active = undefined; // force indicator re-measure
		onScroll();
	});
	document.fonts?.ready.then(() => {
		active = undefined;
		onScroll();
	});
	onScroll(); // first measurement in the next frame rather than a forced reflow during boot
}

/* ------------------------------------------------- mobile menu dialog -- */
function initMenu() {
	const dialog = $('[data-menu]');
	const opener = $('[data-menu-open]');
	if (!dialog || !opener) return;
	const modal = typeof dialog.showModal === 'function';
	const isOpen = () => dialog.hasAttribute('open');
	opener.setAttribute('aria-expanded', 'false');

	const afterClose = () => {
		root.classList.remove('menu-open');
		opener.setAttribute('aria-expanded', 'false');
	};
	const close = () => {
		if (!isOpen()) return;
		root.classList.remove('menu-open');
		if (modal) {
			dialog.close(); // fires "close" → afterClose; focus returns to the opener
		} else {
			dialog.removeAttribute('open');
			afterClose();
			opener.focus();
		}
	};
	opener.addEventListener('click', () => {
		if (modal) dialog.showModal();
		else {
			// Browsers without <dialog>: show it as a plain full-screen layer.
			dialog.setAttribute('open', '');
			$('[data-menu-close]', dialog)?.focus();
		}
		root.classList.add('menu-open');
		opener.setAttribute('aria-expanded', 'true');
	});
	dialog.addEventListener('close', afterClose);
	if (!modal) document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
	$$('[data-menu-close]', dialog).forEach((btn) => btn.addEventListener('click', close));
	// Links: close first, then let the browser follow the in-page anchor.
	$$('[data-menu-link]', dialog).forEach((link) => link.addEventListener('click', close));
	window.matchMedia('(min-width: 60em)').addEventListener('change', (e) => {
		if (e.matches) close();
	});
}

/* ------------------------------------------------ product explorer -- */
function initExplorer() {
	const explorer = $('[data-explorer]');
	if (!explorer) return null;
	const tabs = $$('.explorer__tab', explorer);
	const panels = tabs.map((tab) => document.getElementById(tab.getAttribute('aria-controls')));
	const headings = tabs.map((tab) => tab.closest('.explorer__heading'));
	const desktop = window.matchMedia('(min-width: 64em)');
	let current = tabs.findIndex((tab) => tab.getAttribute('aria-expanded') === 'true');

	function warm(index) {
		const img = panels[index]?.querySelector('img[loading="lazy"]');
		if (img) img.loading = 'eager';
	}

	function setOpen(index, { animate = true } = {}) {
		tabs.forEach((tab, i) => {
			const open = i === index;
			tab.setAttribute('aria-expanded', String(open));
			const panel = panels[i];
			if (open) {
				panel.removeAttribute('hidden');
			} else if (!panel.hasAttribute('hidden')) {
				panel.setAttribute('hidden', 'until-found');
			}
		});
		current = index;
		if (index >= 0) {
			warm(index);
			if (animate && !reduceMotion.matches) {
				const panel = panels[index];
				panel.classList.remove('is-entering');
				void panel.offsetWidth; // restart the entrance animation
				panel.classList.add('is-entering');
			}
		}
	}

	// Keep the clicked tab fixed under the pointer when panels above collapse.
	function keepInPlace(el, mutate) {
		const before = el.getBoundingClientRect().top;
		mutate();
		const delta = el.getBoundingClientRect().top - before;
		if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: 'instant' });
	}

	tabs.forEach((tab, i) => {
		tab.addEventListener('click', () => {
			const isOpen = tab.getAttribute('aria-expanded') === 'true';
			if (isOpen) {
				if (!desktop.matches) keepInPlace(tab, () => setOpen(-1));
				return;
			}
			keepInPlace(tab, () => setOpen(i));
			if (!desktop.matches) {
				const top = tab.getBoundingClientRect().top;
				const headerH = $('[data-header]')?.offsetHeight ?? 64;
				if (top < headerH || top > window.innerHeight * 0.6) {
					tab.scrollIntoView({ block: 'start', behavior: scrollBehavior() });
				}
			}
		});
		tab.addEventListener('keydown', (e) => {
			const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
			let next = null;
			if (e.key in keys) next = (i + keys[e.key] + tabs.length) % tabs.length;
			else if (e.key === 'Home') next = 0;
			else if (e.key === 'End') next = tabs.length - 1;
			if (next === null) return;
			e.preventDefault();
			tabs[next].focus();
			if (desktop.matches) setOpen(next);
		});
		tab.addEventListener('pointerenter', () => warm(i), { once: true });
		tab.addEventListener('focus', () => warm(i), { once: true });
	});

	// Find-in-page (Ctrl/Cmd+F) can reveal hidden="until-found" panels.
	panels.forEach((panel, i) => panel.addEventListener('beforematch', () => setOpen(i, { animate: false })));

	desktop.addEventListener('change', (e) => {
		if (e.matches && current < 0) setOpen(0, { animate: false });
	});

	function openById(id, { scroll = true } = {}) {
		const index = headings.findIndex((h) => h.id === id);
		if (index < 0) return false;
		setOpen(index, { animate: true });
		if (scroll) {
			const target = desktop.matches ? explorer : headings[index];
			target.scrollIntoView({ block: 'start', behavior: scrollBehavior() });
		}
		return true;
	}

	return { openById, ids: headings.map((h) => h.id) };
}

/* -------------------------------------------- in-page link handling -- */
function initLinks(explorer) {
	document.addEventListener('click', (e) => {
		const link = e.target.closest('a[href^="#"]');
		if (!link || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
		const id = hashId(link.getAttribute('href'));

		// Deep links to a product open it, then scroll to it.
		if (explorer && explorer.ids.includes(id)) {
			e.preventDefault();
			// Let a closing menu dialog restore the page before scrolling.
			requestAnimationFrame(() => {
				explorer.openById(id);
				history.pushState(null, '', `#${id}`);
			});
			return;
		}

		// "Discuss a project" style links pre-select a topic in the form.
		if (link.dataset.topic) {
			const box = $(`.chip input[value="${CSS.escape(link.dataset.topic)}"]`);
			if (box) box.checked = true;
		}
	});

	const fromHash = () => {
		const id = hashId(location.hash);
		if (explorer && explorer.ids.includes(id)) explorer.openById(id);
	};
	window.addEventListener('hashchange', fromHash);
	if (location.hash && explorer) {
		const id = hashId(location.hash);
		if (explorer.ids.includes(id)) {
			// Open now (no layout jump later), scroll once the browser's own fragment scroll is done.
			explorer.openById(id, { scroll: false });
			const settle = () => requestAnimationFrame(() => explorer.openById(id));
			if (document.readyState === 'complete') settle();
			else window.addEventListener('load', settle, { once: true });
		}
	}
}

/* ------------------------------------------------------ scroll reveal -- */
function initReveal() {
	const els = $$('[data-reveal]');
	if (!('IntersectionObserver' in window) || reduceMotion.matches) {
		els.forEach((el) => el.classList.add('is-visible'));
		return;
	}
	const io = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) {
					entry.target.classList.add('is-visible');
					io.unobserve(entry.target);
				}
			}
		},
		{ rootMargin: '0px 0px -8% 0px', threshold: 0 },
	);
	els.forEach((el) => io.observe(el));
}

/* ------------------------------------------- spotlight on services -- */
function initSpotlight() {
	const grid = $('[data-spotlight]');
	if (!grid || !window.matchMedia('(hover: hover)').matches) return;
	grid.addEventListener(
		'pointermove',
		(e) => {
			const cell = e.target.closest('.service');
			if (!cell) return;
			const r = cell.getBoundingClientRect();
			cell.style.setProperty('--mx', `${e.clientX - r.left}px`);
			cell.style.setProperty('--my', `${e.clientY - r.top}px`);
		},
		{ passive: true },
	);
}

/* ------------------------------------------------ brand film (about) -- */
function initFilm() {
	const film = $('[data-film]');
	if (!film) return;
	const video = $('video', film);
	const button = $('[data-film-control]', film);
	const label = $('[data-film-label]', film);
	const icon = $('use', button);
	if (!video || !video.dataset.src) return;
	let loaded = false;
	let finished = false; // played through once: from then on it only replays on request
	let blocked = false; // the browser refused autoplay (e.g. iOS Low Power Mode)
	let dwell = 0;

	// kind: 'play' until the film has been seen, 'replay' after; the label and icon follow it
	const offer = (kind) => {
		label.textContent = kind === 'replay' ? 'Replay animation' : 'Play animation';
		icon.setAttribute('href', `#i-${kind}`);
		button.hidden = false;
	};
	const load = () => {
		if (loaded) return;
		loaded = true;
		video.src = video.dataset.src;
		video.preload = 'auto';
		video.load();
	};
	const play = () => {
		load();
		try { video.currentTime = 0; } catch { /* not seekable yet */ }
		film.classList.add('is-playing');
		const attempt = video.play();
		if (attempt) {
			attempt.catch((err) => {
				film.classList.remove('is-playing');
				// AbortError: paused because the film scrolled away before it started; it retries on return
				if (err && err.name === 'AbortError') return;
				// The file itself failed (the error handler already hid the control): keep the poster, no dead button
				if (video.error) return;
				blocked = true;
				offer(film.classList.contains('is-active') ? 'replay' : 'play');
			});
		}
	};

	video.addEventListener('playing', () => film.classList.add('is-active', 'is-playing'));
	video.addEventListener('ended', () => {
		finished = true;
		film.classList.remove('is-playing');
		offer('replay');
	});
	video.addEventListener('error', () => {
		film.classList.remove('is-playing', 'is-active');
		button.hidden = true;
	});
	button.addEventListener('click', play);

	if (reduceMotion.matches || !('IntersectionObserver' in window)) {
		offer('play');
		return;
	}
	new IntersectionObserver((entries, obs) => {
		if (entries.some((e) => e.isIntersecting)) {
			load();
			obs.disconnect();
		}
	}, { rootMargin: '0px 0px 100% 0px' }).observe(film);
	new IntersectionObserver((entries) => {
		for (const entry of entries) {
			clearTimeout(dwell);
			if (entry.isIntersecting) {
				// Start once the visitor settles here, so a smooth-scroll fly-by doesn't use up the autoplay
				if (!finished && !blocked && video.paused) dwell = setTimeout(play, 400);
			} else if (!video.paused) {
				video.pause();
				film.classList.remove('is-playing');
				if (finished || blocked) offer('replay');
				else film.classList.remove('is-active'); // first viewing cut short: back to the poster, restart on return
			}
		}
	}, { threshold: 0.6 }).observe(film);
}

/* --------------------------------------------------- map facade -- */
function initMap() {
	const map = $('[data-map]');
	const button = map && $('[data-map-load]', map);
	if (!button) return;
	button.addEventListener('click', () => {
		const iframe = document.createElement('iframe');
		iframe.src = map.dataset.src;
		iframe.title = 'Pixvox office location on Google Maps';
		iframe.loading = 'lazy';
		iframe.referrerPolicy = 'no-referrer-when-downgrade';
		iframe.allowFullscreen = true;
		map.append(iframe);
		$('.map__facade', map).hidden = true;
		iframe.focus();
	});
}

/* ------------------------------------------ copy-to-clipboard, time -- */
function initCopy() {
	if (!navigator.clipboard || !window.isSecureContext) return;
	$$('[data-copy]').forEach((btn) => {
		btn.hidden = false;
		btn.addEventListener('click', async () => {
			try {
				await navigator.clipboard.writeText(btn.dataset.copy);
				toast('Email address copied');
			} catch {
				toast('Couldn’t copy. Please select the address instead.');
			}
		});
	});
}

function initLocalTime() {
	const el = $('[data-local-time]');
	const out = el && $('span', el);
	if (!out) return;
	let fmt;
	try {
		fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' });
	} catch {
		return;
	}
	const tick = () => { out.textContent = `It’s ${fmt.format(new Date())} in Hyderabad (IST, UTC+5:30)`; };
	tick();
	el.hidden = false;
	setInterval(tick, 30_000);
}

function initFacts() {
	const year = String(new Date().getFullYear());
	$$('[data-year]').forEach((el) => { el.textContent = year; });
	const count = $$('[data-partner]').length;
	const target = $('[data-partner-count]');
	if (target && count) target.textContent = String(count);
}

/* ----------------------------------------------------- contact form -- */
// Same Firebase project, collection and document shape as the original site,
// so existing Firestore rules and whoever reads these leads keep working.
const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/8.10.1';
const firebaseConfig = {
	apiKey: 'AIzaSyDG3tARnIpwSsGaKVLC6yNwPdm8ZRWV6YU',
	authDomain: 'reelsndice-main.firebaseapp.com',
	projectId: 'reelsndice-main',
	storageBucket: 'reelsndice-main.appspot.com',
	messagingSenderId: '805611676345',
	appId: '1:805611676345:web:fd361a740182afc99d3168',
	measurementId: 'G-S48T2EZKK3',
};

function loadScript(src) {
	return new Promise((resolve, reject) => {
		const s = document.createElement('script');
		s.src = src;
		s.async = false;
		s.onload = resolve;
		s.onerror = () => reject(new Error(`Failed to load ${src}`));
		document.head.append(s);
	});
}

let firestorePromise = null;
function getFirestore() {
	if (!firestorePromise) {
		firestorePromise = loadScript(`${FIREBASE_SDK}/firebase-app.js`)
			.then(() => loadScript(`${FIREBASE_SDK}/firebase-firestore.js`))
			.then(() => {
				const fb = window.firebase;
				const app = fb.apps.length ? fb.app() : fb.initializeApp(firebaseConfig);
				return fb.firestore(app);
			})
			.catch((err) => {
				firestorePromise = null; // allow a retry
				throw err;
			});
	}
	return firestorePromise;
}

const withTimeout = (promise, ms) =>
	Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const messages = {
	name: { valueMissing: 'Please enter your name.' },
	email: {
		valueMissing: 'Please enter your email address.',
		invalid: 'Please enter a valid email address, like name@company.com.',
	},
	message: { valueMissing: 'Please tell us a little about your project.' },
};

function initContactForm() {
	const form = $('[data-contact-form]');
	if (!form) return;
	const success = $('[data-form-success]');
	const alertBox = $('[data-form-alert]', form);
	const status = $('[data-form-status]', form);
	const submit = $('[data-submit]', form);
	const submitLabel = $('.form__submit-label', submit);
	const fields = ['name', 'email', 'message'].map((id) => form.elements[id]);
	let attempted = false;

	function errorFor(input) {
		const value = input.value.trim();
		const m = messages[input.name];
		if (!value) return m.valueMissing;
		if (input.name === 'email' && !EMAIL_RE.test(value)) return m.invalid;
		return '';
	}
	function showError(input, text) {
		const error = document.getElementById(`${input.id}-error`);
		input.setAttribute('aria-invalid', String(Boolean(text)));
		if (!error) return;
		error.textContent = text;
		error.hidden = !text;
	}
	function validate(input) {
		const text = errorFor(input);
		showError(input, text);
		return !text;
	}

	fields.forEach((input) => {
		input.addEventListener('blur', () => {
			if (attempted || input.value.trim()) validate(input);
		});
		input.addEventListener('input', () => {
			if (attempted || input.getAttribute('aria-invalid') === 'true') validate(input);
		});
	});

	// Warm up the (lazy) Firebase SDK as soon as someone starts filling the form.
	form.addEventListener('focusin', () => { getFirestore().catch(() => {}); }, { once: true });

	function setBusy(busy) {
		form.classList.toggle('is-busy', busy);
		submit.setAttribute('aria-disabled', String(busy));
		submitLabel.textContent = busy ? 'Sending…' : 'Send message';
		status.textContent = busy ? 'Sending your message…' : '';
	}

	function composeMessage() {
		const topics = $$('input[name="topics"]:checked', form).map((box) => box.value);
		const text = form.elements.message.value.trim();
		return topics.length ? `Interested in: ${topics.join(', ')}\n\n${text}` : text;
	}

	// Mirrors the original getInputVal(): empty or absent fields are stored as 'undefined'.
	const val = (value) => (value && value.trim()) || 'undefined';

	form.addEventListener('submit', async (e) => {
		e.preventDefault();
		if (form.classList.contains('is-busy')) return;
		attempted = true;
		alertBox.hidden = true;
		const invalid = fields.filter((input) => !validate(input));
		if (invalid.length) {
			invalid[0].focus();
			status.textContent = `Please fix ${invalid.length === 1 ? 'the highlighted field' : `${invalid.length} highlighted fields`}.`;
			return;
		}

		// Honeypot: bots fill hidden fields. Pretend success, write nothing.
		if (form.elements.website.value) {
			showSuccess();
			return;
		}

		setBusy(true);
		try {
			const db = await withTimeout(getFirestore(), 20_000);
			await withTimeout(
				db.collection('contact-messages').add({
					name: val(form.elements.name.value),
					company: val(form.elements.company.value),
					email: val(form.elements.email.value),
					phone: 'undefined',
					message: val(composeMessage()),
				}),
				20_000,
			);
			showSuccess();
		} catch (err) {
			console.error('[contact] submission failed', err);
			alertBox.hidden = false;
			status.textContent = '';
		} finally {
			setBusy(false);
		}
	});

	function showSuccess() {
		form.reset();
		attempted = false;
		fields.forEach((input) => showError(input, ''));
		form.hidden = true;
		success.hidden = false;
		$('.form-success__title', success).focus({ preventScroll: true });
		const top = success.getBoundingClientRect().top;
		if (top < 80 || top > window.innerHeight - 120) {
			success.scrollIntoView({ block: 'center', behavior: scrollBehavior() });
		}
	}

	$('[data-form-reset]', success)?.addEventListener('click', () => {
		success.hidden = true;
		form.hidden = false;
		form.elements.name.focus();
	});
}

/* -------------------------------------------------------------- boot -- */
function safely(name, init, ...args) {
	try {
		return init(...args);
	} catch (err) {
		console.error(`[pixvox] ${name} failed to initialise`, err);
		return null;
	}
}

const explorer = safely('explorer', initExplorer);
safely('header', initHeader);
safely('menu', initMenu);
safely('links', initLinks, explorer);
safely('reveal', initReveal);
safely('spotlight', initSpotlight);
safely('film', initFilm);
safely('map', initMap);
safely('copy', initCopy);
safely('local time', initLocalTime);
safely('facts', initFacts);
safely('contact form', initContactForm);
root.classList.add('is-ready');
