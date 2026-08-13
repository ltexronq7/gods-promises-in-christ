const state = {
  promises: [],
  index: null,
  books: new Map(),     // book name -> loaded book file
  corpus: null,         // every KJV verse, only once a full-text search needs it
  corpusLoad: null,
  scope: 'promises',
  search: '',
  book: '',
  chapter: 1,
  readerStarted: false
};
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value = '') => String(value).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const normalize = (value = '') => value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
// promises.json now stores the canonical "Psalms"; this keeps a stale cached copy working.
const canonicalBook = (book) => book === 'Psalm' ? 'Psalms' : book;
const matchesQuery = (haystack, query) => !query || query.split(/\s+/).every(word => haystack.includes(word));
const bookEntry = (name) => state.index.books.find(b => b.book === name);

async function loadData() {
  const [promisesResponse, indexResponse] = await Promise.all([
    fetch('./data/promises.json'),
    fetch('./data/bible/index.json')
  ]);
  if (!promisesResponse.ok || !indexResponse.ok) throw new Error('Data could not be loaded.');
  state.promises = await promisesResponse.json();
  state.index = await indexResponse.json();
  initializeFilters();
  renderSearch();
  renderVault();
  prepareReader();
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
  updateChapterOptions();
}

let renderToken = 0;

async function renderSearch() {
  const token = ++renderToken;
  const query = normalize(state.search).trim();
  const bookFilter = $('#search-book-filter').value;
  $('#category-filter').hidden = state.scope !== 'promises';

  let results;
  if (state.scope === 'promises') {
    results = state.promises.filter(p =>
      matchesQuery(normalize([p.promise, p.reference, p.book, p.recipient, p.speaker, ...(p.categories || [])].join(' ')), query) &&
      (!bookFilter || canonicalBook(p.book) === bookFilter) &&
      (!$('#category-filter').value || p.categories.includes($('#category-filter').value)));
  } else {
    const verses = await bibleSearchSource(query, bookFilter, token);
    if (token !== renderToken || !verses) return;
    results = verses.filter(v => matchesQuery(normalize(`${v.reference} ${v.text}`), query));
  }

  if (token !== renderToken) return;
  const shown = results.slice(0, 200);
  $('#results-meta').textContent = `${shown.length}${results.length > 200 ? '+' : ''} ${state.scope === 'promises' ? 'promise' : 'verse'} result${shown.length === 1 ? '' : 's'}`;
  $('#results').innerHTML = shown.length
    ? shown.map(item => state.scope === 'promises' ? promiseCard(item) : verseCard(item)).join('')
    : '<div class="empty">No matches found. Try fewer words or a different filter.</div>';
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
  return `<article class="result-card"><div class="result-ref">Promise #${p.id} · ${escapeHtml(p.reference)}</div><p>${escapeHtml(p.promise)}</p><div class="result-details">${escapeHtml(p.categories.join(' · '))} · ${p.conditional ? 'Conditional' : 'Unconditional'} · Spoken by ${escapeHtml(p.speaker)}<br><button class="book-link" data-open-book="${escapeHtml(canonicalBook(p.book))}" data-open-chapter="${p.chapter}">Read this passage in the KJV</button></div></article>`;
}

function verseCard(v) {
  return `<article class="result-card"><div class="result-ref">${escapeHtml(v.reference)} · KJV</div><p>${escapeHtml(v.text)}</p><div class="result-details"><button class="book-link" data-open-book="${escapeHtml(v.book)}" data-open-chapter="${v.chapter}">Read this chapter</button></div></article>`;
}

function setScope(scope) {
  state.scope = scope;
  document.querySelectorAll('.tab').forEach(tab => tab.setAttribute('aria-selected', String(tab.dataset.scope === scope)));
  $('#global-search').placeholder = scope === 'promises' ? 'Search promises, themes, people, or references…' : 'Search every word of the KJV…';
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
    .map(b => `<button class="book-link" data-open-book="${escapeHtml(b.book)}" data-open-chapter="1">${escapeHtml(b.book)}</button>`)
    .join('');
}

function openBook(book, chapter = 1) {
  state.book = book;
  state.chapter = Number(chapter);
  $('#reader-book').value = book;
  updateChapterOptions();
  $('#reader-chapter').value = state.chapter;
  renderReader();
  location.hash = 'bible';
}

/* ---- Wiring ---- */

$('#global-search').addEventListener('input', event => { state.search = event.target.value; clearTimeout(window.searchTimer); window.searchTimer = setTimeout(renderSearch, 120); });
document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => setScope(tab.dataset.scope)));
$('#search-book-filter').addEventListener('change', renderSearch);
$('#category-filter').addEventListener('change', renderSearch);
$('#reader-book').addEventListener('change', event => { state.book = event.target.value; state.chapter = 1; updateChapterOptions(); renderReader(); });
$('#reader-chapter').addEventListener('change', event => { state.chapter = Number(event.target.value); renderReader(); });
document.addEventListener('click', event => { const target = event.target.closest('[data-open-book]'); if (target) openBook(target.dataset.openBook, target.dataset.openChapter); });

loadData().catch(error => {
  $('#results').innerHTML = `<div class="empty">${escapeHtml(error.message)} Please refresh the page.</div>`;
  $('#reader-content').innerHTML = '<div class="empty">Bible data could not be loaded.</div>';
});
