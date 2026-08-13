const state = {
  promises: [],
  index: null,
  books: new Map(),     // book name -> loaded book file
  corpus: null,         // every KJV verse, only once a full-text search needs it
  corpusLoad: null,
  scope: 'promises',
  search: '',
  theme: '',
  bookFilter: '',
  focus: 0,             // a single promise id, when one was linked to directly
  results: [],          // every match for the current search, not just the drawn ones
  shown: 0,             // how many of them have been drawn
  book: '',
  chapter: 1,
  readerStarted: false
};
const SITE_TITLE = 'God’s Promises in Christ';
const PAGE_SIZE = 200;
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value = '') => String(value).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const normalize = (value = '') => value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
// promises.json now stores the canonical "Psalms"; this keeps a stale cached copy working.
const canonicalBook = (book) => book === 'Psalm' ? 'Psalms' : book;
const matchesQuery = (haystack, query) => !query || query.split(/\s+/).every(word => haystack.includes(word));
const bookEntry = (name) => state.index.books.find(b => b.book === name);

/* ---- Shareable URLs ----
 * Everything you can look at has an address: a search, a single promise, or a
 * chapter. Each address describes one view, so a link says what it is about
 * and nothing else — no stale query text riding along inside a link to a
 * chapter. The hash keeps doing what it always did, which is scrolling.
 */

function searchUrl() {
  const params = new URLSearchParams();
  if (state.search) params.set('q', state.search);
  if (state.scope === 'bible') params.set('scope', 'kjv');
  if (state.bookFilter) params.set('in', state.bookFilter);
  if (state.theme) params.set('theme', state.theme);
  return withQuery(params, '');
}

const promiseUrl = (id) => withQuery(new URLSearchParams({promise: id}), '#search');

function chapterUrl(book, chapter) {
  const params = new URLSearchParams({read: book});
  if (Number(chapter) > 1) params.set('ch', chapter);
  return withQuery(params, '#bible');
}

function withQuery(params, hash) {
  const query = params.toString();
  return `${location.pathname}${query ? '?' + query : ''}${hash}`;
}

function pushUrl(url, replace = false) {
  history[replace ? 'replaceState' : 'pushState']({}, '', url);
  updateTitle();
}

/** Restore state from the current address. Returns true if a chapter was requested. */
function applyUrl() {
  const params = new URLSearchParams(location.search);
  const focus = Number(params.get('promise')) || 0;
  state.focus = state.promises.some(p => p.id === focus) ? focus : 0;
  state.search = state.focus ? '' : (params.get('q') || '');
  state.scope = !state.focus && params.get('scope') === 'kjv' ? 'bible' : 'promises';

  const requestedBookFilter = params.get('in') || '';
  state.bookFilter = bookEntry(requestedBookFilter) ? requestedBookFilter : '';
  const themes = new Set(state.promises.flatMap(p => p.categories));
  state.theme = themes.has(params.get('theme')) ? params.get('theme') : '';

  // An address with no chapter in it says nothing about the reader, so the
  // reader is left showing whatever it was showing.
  const entry = bookEntry(params.get('read') || '');
  if (entry) {
    state.book = entry.book;
    state.chapter = Math.min(Math.max(Number(params.get('ch')) || 1, 1), entry.chapters);
  }
  syncControls();
  return Boolean(entry);
}

function syncControls() {
  $('#global-search').value = state.search;
  $('#search-book-filter').value = state.bookFilter;
  $('#category-filter').value = state.theme;
  $('#category-filter').hidden = state.scope !== 'promises';
  $('#reader-book').value = state.book;
  $('#global-search').placeholder = state.scope === 'promises'
    ? 'Search promises, themes, people, or references…'
    : 'Search every word of the KJV…';
  document.querySelectorAll('.tab').forEach(tab => tab.setAttribute('aria-selected', String(tab.dataset.scope === state.scope)));
  updateChapterOptions();
}

function updateTitle() {
  const promise = state.focus && state.promises.find(p => p.id === state.focus);
  if (promise) document.title = `Promise #${promise.id} · ${promise.reference} | ${SITE_TITLE}`;
  else if (state.readerStarted) document.title = `${state.book} ${state.chapter} (KJV) | ${SITE_TITLE}`;
  else document.title = `${SITE_TITLE} | Search the KJV and Explore the Vault`;
}

async function loadData() {
  const [promisesResponse, indexResponse] = await Promise.all([
    fetch('./data/promises.json'),
    fetch('./data/bible/index.json')
  ]);
  if (!promisesResponse.ok || !indexResponse.ok) throw new Error('Data could not be loaded.');
  state.promises = await promisesResponse.json();
  state.index = await indexResponse.json();
  initializeFilters();
  const chapterRequested = applyUrl();
  renderSearch();
  renderVault();
  if (chapterRequested) {
    await renderReader();
    if (!location.hash) $('#bible').scrollIntoView();
  } else {
    prepareReader();
  }
  updateTitle();
}

/* ---- Bible text, fetched a book at a time ---- */

async function loadBook(name) {
  if (state.books.has(name)) return state.books.get(name);
  const entry = bookEntry(name);
  const response = await fetch(`./data/bible/${entry.slug}.json`);
  if (!response.ok) throw new Error(`${name} could not be loaded.`);
  const data = await response.json();
  state.books.set(name, data);
  return data;
}

/** Rebuild the flat verse records the search and reader work with. */
function bookVerses(data) {
  if (!data.flat) {
    data.flat = data.text.flatMap((chapter, chapterIndex) =>
      chapter.map((text, verseIndex) => ({
        reference: `${data.book} ${chapterIndex + 1}:${verseIndex + 1}`,
        book: data.book,
        chapter: chapterIndex + 1,
        verse: verseIndex + 1,
        text
      })));
  }
  return data.flat;
}

/** Load every book, once, for an unfiltered full-text search. */
function loadCorpus(onProgress) {
  if (state.corpus) return Promise.resolve(state.corpus);
  if (state.corpusLoad) return state.corpusLoad;
  let done = 0;
  const total = state.index.books.length;
  state.corpusLoad = Promise.all(state.index.books.map(entry =>
    loadBook(entry.book).then(data => {
      onProgress(Math.round((++done / total) * 100));
      return data;
    })
  )).then(books => {
    state.corpus = books.flatMap(bookVerses);
    return state.corpus;
  }).catch(error => {
    state.corpusLoad = null;
    throw error;
  });
  return state.corpusLoad;
}

/* ---- Search ---- */

function initializeFilters() {
  const categories = [...new Set(state.promises.flatMap(p => p.categories))].sort();
  $('#category-filter').innerHTML = '<option value="">All themes</option>' + categories.map(c => `<option>${escapeHtml(c)}</option>`).join('');
  const bookOptions = state.index.books.map(b => `<option value="${escapeHtml(b.book)}">${escapeHtml(b.book)}</option>`).join('');
  $('#search-book-filter').innerHTML = '<option value="">All books</option>' + bookOptions;
  $('#reader-book').innerHTML = bookOptions;
  state.book = state.index.books[0].book;
}

let renderToken = 0;

async function renderSearch() {
  const token = ++renderToken;
  $('#category-filter').hidden = state.scope !== 'promises';
  $('#results-more').hidden = true;

  if (state.focus) return renderFocusedPromise();

  const query = normalize(state.search).trim();
  let results;
  if (state.scope === 'promises') {
    results = state.promises.filter(p =>
      matchesQuery(normalize([p.promise, p.reference, p.book, p.recipient, p.speaker, ...(p.categories || [])].join(' ')), query) &&
      (!state.bookFilter || canonicalBook(p.book) === state.bookFilter) &&
      (!state.theme || p.categories.includes(state.theme)));
  } else {
    const verses = await bibleSearchSource(query, state.bookFilter, token);
    if (token !== renderToken || !verses) return;
    results = verses.filter(v => matchesQuery(normalize(`${v.reference} ${v.text}`), query));
  }

  if (token !== renderToken) return;
  state.results = results;
  state.shown = 0;
  $('#results').innerHTML = results.length
    ? ''
    : '<div class="empty">No matches found. Try fewer words or a different filter.</div>';
  showMoreResults();
}

/**
 * Draw the next page of results.
 *
 * Only a page at a time reaches the DOM — a common word can match thousands
 * of verses, and building all of those cards at once would lock the page up.
 * The count in the heading is always the true total, so the number you see is
 * the number that matched, whether or not it has been drawn yet.
 */
function showMoreResults() {
  const total = state.results.length;
  const next = state.results.slice(state.shown, state.shown + PAGE_SIZE);
  const card = state.scope === 'promises' ? promiseCard : verseCard;
  if (next.length) $('#results').insertAdjacentHTML('beforeend', next.map(card).join(''));
  state.shown += next.length;

  const noun = state.scope === 'promises' ? 'promise' : 'verse';
  $('#results-meta').textContent = !total
    ? `No matching ${noun}s`
    : state.shown < total
      ? `Showing ${state.shown.toLocaleString()} of ${total.toLocaleString()} ${noun}s`
      : `${total.toLocaleString()} ${noun}${total === 1 ? '' : 's'}`;
  renderMoreButton(total - state.shown);
}

/** The button is never replaced, only relabelled, so keyboard focus survives a click. */
function renderMoreButton(remaining) {
  $('#results-more').hidden = remaining <= 0;
  if (remaining <= 0) return;
  const batch = Math.min(remaining, PAGE_SIZE);
  $('#show-more').textContent = `Show ${batch.toLocaleString()} more`;
  const hint = $('#results-hint');
  hint.hidden = remaining <= batch;
  hint.textContent = hint.hidden ? '' : `${remaining.toLocaleString()} more match. Adding another word narrows the search.`;
}

/** A link straight to one promise, e.g. ?promise=55 */
function renderFocusedPromise() {
  const promise = state.promises.find(p => p.id === state.focus);
  $('#results-meta').textContent = `Promise #${promise.id}`;
  $('#results').innerHTML = promiseCard(promise) +
    '<div class="focus-note">You followed a link to a single promise. <button class="link-button" id="clear-focus">Show all 1,046 promises</button></div>';
}

/**
 * The verses a KJV search should run over. Filtering by book needs only that
 * book; searching the whole Bible pulls the rest down the first time it is
 * asked for, so a visitor who never opens this tab never pays for it.
 */
async function bibleSearchSource(query, bookFilter, token) {
  if (bookFilter) return bookVerses(await loadBook(bookFilter));
  if (!query) {
    $('#results-meta').textContent = 'Full KJV';
    $('#results').innerHTML = '<div class="empty">Type a word or phrase to search all 31,102 verses of the King James Bible.</div>';
    return null;
  }
  if (state.corpus) return state.corpus;
  $('#results-meta').textContent = 'Preparing the full KJV text';
  $('#results').innerHTML = '<div class="loading">Loading the complete King James text… this happens once.</div>';
  return loadCorpus(percent => {
    if (token === renderToken) $('#results').innerHTML = `<div class="loading">Loading the complete King James text… ${percent}%</div>`;
  });
}

function promiseCard(p) {
  const book = canonicalBook(p.book);
  return `<article class="result-card"><div class="result-ref"><a class="ref-link" href="${promiseUrl(p.id)}" data-focus-promise="${p.id}">Promise #${p.id}</a> · ${escapeHtml(p.reference)}</div><p>${escapeHtml(p.promise)}</p><div class="result-details">${escapeHtml(p.categories.join(' · '))} · ${p.conditional ? 'Conditional' : 'Unconditional'} · Spoken by ${escapeHtml(p.speaker)}<br><a class="book-link" href="${chapterUrl(book, p.chapter)}" data-open-book="${escapeHtml(book)}" data-open-chapter="${p.chapter}">Read this passage in the KJV</a></div></article>`;
}

function verseCard(v) {
  return `<article class="result-card"><div class="result-ref"><a class="ref-link" href="${chapterUrl(v.book, v.chapter)}" data-open-book="${escapeHtml(v.book)}" data-open-chapter="${v.chapter}">${escapeHtml(v.reference)}</a> · KJV</div><p>${escapeHtml(v.text)}</p><div class="result-details"><a class="book-link" href="${chapterUrl(v.book, v.chapter)}" data-open-book="${escapeHtml(v.book)}" data-open-chapter="${v.chapter}">Read this chapter</a></div></article>`;
}

function setScope(scope) {
  if (scope === state.scope && !state.focus) return;
  state.scope = scope;
  state.focus = 0;
  syncControls();
  pushUrl(searchUrl());
  renderSearch();
}

/* ---- Reader ---- */

function updateChapterOptions() {
  const entry = bookEntry(state.book);
  $('#reader-chapter').innerHTML = Array.from({length: entry.chapters}, (_, i) => `<option value="${i + 1}">Chapter ${i + 1}</option>`).join('');
  state.chapter = Math.min(state.chapter, entry.chapters) || 1;
  $('#reader-chapter').value = state.chapter;
}

async function renderReader() {
  state.readerStarted = true;
  const book = state.book;
  const chapter = Number(state.chapter);
  if (!state.books.has(book)) {
    $('#reader-content').innerHTML = `<div class="loading">Loading ${escapeHtml(book)}…</div>`;
  }
  const data = await loadBook(book);
  if (state.book !== book || Number(state.chapter) !== chapter) return;  // reader moved on
  const verses = data.text[chapter - 1] || [];
  $('#reader-content').innerHTML = `<h3>${escapeHtml(book)} ${chapter}</h3>
    ${data.christ ? `<div class="book-intro"><strong>Jesus Christ in ${escapeHtml(book)}</strong><br>${escapeHtml(data.christ)}</div>` : ''}
    <div class="chapter-text">${verses.map((text, i) => `<span class="verse"><sup class="verse-number">${i + 1}</sup>${escapeHtml(text)} </span>`).join('')}</div>`;
  updateTitle();
}

/** Hold the reader until the visitor actually goes looking for it. */
function prepareReader() {
  if (location.hash === '#bible') return void renderReader();
  $('#reader-content').innerHTML = '<div class="empty">Choose a book and chapter above to begin reading.</div>';
  if (!('IntersectionObserver' in window)) return void renderReader();
  const observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) {
      observer.disconnect();
      if (!state.readerStarted) renderReader();
    }
  }, {rootMargin: '200px'});
  observer.observe($('#bible'));
}

function renderVault() {
  $('#vault-books').innerHTML = state.index.books
    .map(b => `<a class="book-link" href="${chapterUrl(b.book, 1)}" data-open-book="${escapeHtml(b.book)}" data-open-chapter="1">${escapeHtml(b.book)}</a>`)
    .join('');
}

function openBook(book, chapter = 1, scroll = true) {
  state.book = book;
  state.chapter = Number(chapter);
  state.readerStarted = true;
  $('#reader-book').value = book;
  updateChapterOptions();
  pushUrl(chapterUrl(book, state.chapter));
  renderReader();
  if (scroll) $('#bible').scrollIntoView();
}

async function copyChapterLink(button) {
  const url = new URL(chapterUrl(state.book, state.chapter), location.href).href;
  const original = button.textContent;
  try {
    await navigator.clipboard.writeText(url);
    button.textContent = 'Link copied';
  } catch {
    button.textContent = 'Press Ctrl+C to copy';
    window.prompt('Copy this link:', url);
  }
  setTimeout(() => { button.textContent = original; }, 2000);
}

/* ---- Wiring ---- */

$('#global-search').addEventListener('input', event => {
  state.search = event.target.value;
  state.focus = 0;
  clearTimeout(window.searchTimer);
  window.searchTimer = setTimeout(() => { pushUrl(searchUrl(), true); renderSearch(); }, 120);
});
document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => setScope(tab.dataset.scope)));
$('#search-book-filter').addEventListener('change', event => {
  state.bookFilter = event.target.value; state.focus = 0; pushUrl(searchUrl()); renderSearch();
});
$('#category-filter').addEventListener('change', event => {
  state.theme = event.target.value; state.focus = 0; pushUrl(searchUrl()); renderSearch();
});
$('#reader-book').addEventListener('change', event => {
  state.book = event.target.value; state.chapter = 1; state.readerStarted = true;
  updateChapterOptions(); pushUrl(chapterUrl(state.book, 1)); renderReader();
});
$('#reader-chapter').addEventListener('change', event => {
  state.chapter = Number(event.target.value); state.readerStarted = true;
  pushUrl(chapterUrl(state.book, state.chapter)); renderReader();
});
$('#copy-chapter-link').addEventListener('click', event => copyChapterLink(event.currentTarget));

document.addEventListener('click', event => {
  const focusLink = event.target.closest('[data-focus-promise]');
  if (focusLink) {
    event.preventDefault();
    state.focus = Number(focusLink.dataset.focusPromise);
    state.search = '';
    syncControls();
    pushUrl(promiseUrl(state.focus));
    renderSearch();
    return;
  }
  const bookLink = event.target.closest('[data-open-book]');
  if (bookLink) {
    event.preventDefault();
    openBook(bookLink.dataset.openBook, bookLink.dataset.openChapter);
    return;
  }
  if (event.target.id === 'show-more') {
    showMoreResults();
    return;
  }
  if (event.target.id === 'clear-focus') {
    state.focus = 0;
    pushUrl(searchUrl());
    renderSearch();
  }
});

window.addEventListener('popstate', async () => {
  if (!state.index) return;
  const chapterRequested = applyUrl();
  renderSearch();
  if (chapterRequested) await renderReader();
  updateTitle();
});

loadData().catch(error => {
  $('#results').innerHTML = `<div class="empty">${escapeHtml(error.message)} Please refresh the page.</div>`;
  $('#reader-content').innerHTML = '<div class="empty">Bible data could not be loaded.</div>';
});
