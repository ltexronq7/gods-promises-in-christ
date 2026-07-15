const state = { promises: [], bible: null, scope: 'promises', search: '', book: '', category: '', chapter: 1 };
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value = '') => String(value).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const normalize = (value = '') => value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
const canonicalBook = (book) => book === 'Psalm' ? 'Psalms' : book;
const matchesQuery = (haystack, query) => !query || query.split(/\s+/).every(word => haystack.includes(word));

async function loadData() {
  const [promisesResponse, bibleResponse] = await Promise.all([
    fetch('./data/promises.json'),
    fetch('./data/kjv-web.json')
  ]);
  if (!promisesResponse.ok || !bibleResponse.ok) throw new Error('Data could not be loaded.');
  state.promises = await promisesResponse.json();
  state.bible = await bibleResponse.json();
  initializeFilters();
  renderSearch();
  renderReader();
  renderVault();
}

function initializeFilters() {
  const categories = [...new Set(state.promises.flatMap(p => p.categories))].sort();
  $('#category-filter').innerHTML = '<option value="">All themes</option>' + categories.map(c => `<option>${escapeHtml(c)}</option>`).join('');
  const bookOptions = state.bible.books.map(b => `<option value="${escapeHtml(b.book)}">${escapeHtml(b.book)}</option>`).join('');
  $('#search-book-filter').innerHTML = '<option value="">All books</option>' + bookOptions;
  $('#reader-book').innerHTML = bookOptions;
  state.book = state.bible.books[0].book;
  updateChapterOptions();
}

function renderSearch() {
  const query = normalize(state.search).trim();
  let results;
  if (state.scope === 'promises') {
    results = state.promises.filter(p => {
      const haystack = normalize([p.promise, p.reference, p.book, p.recipient, p.speaker, ...(p.categories || [])].join(' '));
      return matchesQuery(haystack, query) &&
        (!$('#search-book-filter').value || canonicalBook(p.book) === $('#search-book-filter').value) &&
        (!$('#category-filter').value || p.categories.includes($('#category-filter').value));
    }).slice(0, 200);
  } else {
    results = state.bible.verses.filter(v => {
      const haystack = normalize(`${v.reference} ${v.text}`);
      return matchesQuery(haystack, query) &&
        (!$('#search-book-filter').value || v.book === $('#search-book-filter').value);
    }).slice(0, 200);
  }
  $('#category-filter').hidden = state.scope !== 'promises';
  $('#results-meta').textContent = `${results.length}${results.length === 200 ? '+' : ''} ${state.scope === 'promises' ? 'promise' : 'verse'} result${results.length === 1 ? '' : 's'}`;
  $('#results').innerHTML = results.length ? results.map(item => state.scope === 'promises' ? promiseCard(item) : verseCard(item)).join('') : '<div class="empty">No matches found. Try fewer words or a different filter.</div>';
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

function updateChapterOptions() {
  const book = state.bible.books.find(b => b.book === state.book);
  $('#reader-chapter').innerHTML = Array.from({length: book.chapters}, (_, i) => `<option value="${i + 1}">Chapter ${i + 1}</option>`).join('');
  state.chapter = Math.min(state.chapter, book.chapters) || 1;
  $('#reader-chapter').value = state.chapter;
}

function renderReader() {
  const bookInfo = state.bible.books.find(b => b.book === state.book);
  const verses = state.bible.verses.filter(v => v.book === state.book && v.chapter === Number(state.chapter));
  $('#reader-content').innerHTML = `<h3>${escapeHtml(state.book)} ${state.chapter}</h3>
    ${bookInfo.christ ? `<div class="book-intro"><strong>Jesus Christ in ${escapeHtml(state.book)}</strong><br>${escapeHtml(bookInfo.christ)}</div>` : ''}
    <div class="chapter-text">${verses.map(v => `<span class="verse"><sup class="verse-number">${v.verse}</sup>${escapeHtml(v.text)} </span>`).join('')}</div>`;
}

function renderVault() {
  const books = state.bible.books;
  $('#vault-books').innerHTML = books.map(b => `<button class="book-link" data-open-book="${escapeHtml(b.book)}" data-open-chapter="1">${escapeHtml(b.book)}</button>`).join('');
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
