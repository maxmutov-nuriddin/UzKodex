/**
 * UzKodex — Advanced Legal Search Engine
 * BM25 + trigram fuzzy + highlights + bookmarks + voice + URL state
 */

// ─── Config ───────────────────────────────────────────────────────────────────
const ITEMS_PER_PAGE = 20;
const BM25_K1 = 1.5, BM25_B = 0.75;
const FUZZY_THRESHOLD = 0.3;
const DEBOUNCE_MS = 200;

// ─── State ────────────────────────────────────────────────────────────────────
let articles = [], idx = null, results = [], currentPage = 0;
let currentLang = 'ru', activeFilter = 'all', sortMode = 'relevance';
let showBookmarks = false;
let bookmarks = new Set(JSON.parse(localStorage.getItem('uzk-bm') || '[]'));
let lastTerms = [], isFuzzy = false;
let debounceTimer;

// ─── Translations ─────────────────────────────────────────────────────────────
const T = {
    ru: {
        placeholder: "Поиск: № статьи, название, текст, наказание...",
        all: "Все", uk: "УК РУз", ak: "КоАО",
        bookmarksBtn: "❤ Избранное",
        loading: "Загрузка...",
        results: "Найдено: ",
        empty: "Ничего не найдено",
        emptyDesc: "Попробуйте изменить запрос или фильтры",
        legalConsequence: "Правовое последствие:",
        sanction: "Санкция",
        dbLoaded: "База данных загружена",
        dbError: "Ошибка загрузки данных",
        logoSubtitle: "Все кодексы в 1 месте",
        sortRelevance: "По релевантности",
        sortNumber: "По номеру статьи",
        copied: "Скопировано в буфер",
        bookmarked: "Добавлено в избранное",
        unbookmarked: "Удалено из избранного",
        noBookmarks: "Нет сохранённых статей",
        noBookmarksDesc: "Нажмите ♡ на карточке статьи",
        voiceStart: "Говорите...",
        fuzzyHint: "Похожие результаты для «%q»",
        ms: "мс",
        copyBtn: "Копировать",
        shareBtn: "Поделиться",
        bmBtn: "В избранное",
        bmActiveBtn: "В избранном",
        articleLabel: "Статья",
        shortcutHint: "/ или Ctrl+K — поиск",
    },
    uz: {
        placeholder: "Qidiruv: modda №, nomi, matn, jazo...",
        all: "Barchasi", uk: "JK", ak: "MJK",
        bookmarksBtn: "❤ Saqlangan",
        loading: "Yuklanmoqda...",
        results: "Topildi: ",
        empty: "Hech narsa topilmadi",
        emptyDesc: "Qidiruv so'zini yoki filtrlarni o'zgartiring",
        legalConsequence: "Huquqiy oqibat:",
        sanction: "Sanksiya",
        dbLoaded: "Ma'lumotlar yuklandi",
        dbError: "Yuklashda xatolik",
        logoSubtitle: "Barcha kodekslar 1 joyda",
        sortRelevance: "Muhimlik bo'yicha",
        sortNumber: "Modda raqami bo'yicha",
        copied: "Nusxalandi",
        bookmarked: "Saqlandi",
        unbookmarked: "O'chirildi",
        noBookmarks: "Saqlangan moddalar yo'q",
        noBookmarksDesc: "Modda kartasidagi ♡ ni bosing",
        voiceStart: "Gapiryapsizmi...",
        fuzzyHint: "«%q» uchun o'xshash natijalar",
        ms: "ms",
        copyBtn: "Nusxalash",
        shareBtn: "Ulashish",
        bmBtn: "Saqlash",
        bmActiveBtn: "Saqlangan",
        articleLabel: "Modda",
        shortcutHint: "/ yoki Ctrl+K — qidiruv",
    }
};

// ─── DOM ──────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ─── Text Utilities ───────────────────────────────────────────────────────────
const normalize = s => s.replace(/[ʻʼ`'']/g, "'").replace(/ё/g, 'е').toLowerCase();
const tokenize = s => normalize(s).match(/[a-zа-яa-z0-9']+/gi) || [];
const escHtml = s => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ─── BM25 Index ───────────────────────────────────────────────────────────────
function buildIndex(docs) {
    const tf = [], df = new Map(), lens = [];
    let total = 0;

    docs.forEach((doc, i) => {
        // Field weights: title×3, punishment×2, content×1
        const text = [
            doc.title, doc.title, doc.title,
            doc.punishment, doc.punishment,
            doc.content,
            String(doc.articleNumber)
        ].join(' ');

        const tokens = tokenize(text);
        lens.push(tokens.length);
        total += tokens.length;

        const freq = new Map();
        tokens.forEach(t => freq.set(t, (freq.get(t) || 0) + 1));
        tf.push(freq);
        freq.forEach((_, t) => df.set(t, (df.get(t) || 0) + 1));
    });

    const N = docs.length, avgdl = total / N;
    const idf = new Map();
    df.forEach((n, t) => idf.set(t, Math.log((N - n + 0.5) / (n + 0.5) + 1)));

    // Trigram index for fuzzy search
    const triIdx = new Map();
    idf.forEach((_, term) => {
        const s = ' ' + term + ' ';
        for (let i = 0; i <= s.length - 3; i++) {
            const g = s.slice(i, i + 3);
            if (!triIdx.has(g)) triIdx.set(g, []);
            triIdx.get(g).push(term);
        }
    });

    return { tf, idf, df, lens, avgdl, N, triIdx };
}

function bm25Score(index, docI, terms) {
    let s = 0;
    const { tf, idf, lens, avgdl } = index;
    const dl = lens[docI];
    terms.forEach(t => {
        const f = tf[docI].get(t) || 0;
        if (!f) return;
        s += (idf.get(t) || 0) * f * (BM25_K1 + 1) / (f + BM25_K1 * (1 - BM25_B + BM25_B * dl / avgdl));
    });
    return s;
}

function expandTerm(term, index) {
    if (index.idf.has(term)) return { terms: [term], fuzzy: false };

    // Prefix expansion
    const prefixes = [];
    index.idf.forEach((_, t) => {
        if (t.startsWith(term) && t.length < term.length + 5) prefixes.push(t);
    });
    if (prefixes.length) return { terms: prefixes.slice(0, 10), fuzzy: false };

    // Trigram fuzzy
    const s = ' ' + term + ' ';
    const cands = new Map();
    for (let i = 0; i <= s.length - 3; i++) {
        (index.triIdx.get(s.slice(i, i + 3)) || []).forEach(t => {
            if (Math.abs(t.length - term.length) <= 3)
                cands.set(t, (cands.get(t) || 0) + 1);
        });
    }
    const maxGrams = s.length - 2;
    const fuzzy = [...cands.entries()]
        .map(([t, n]) => [t, (2 * n) / (maxGrams + t.length)])
        .filter(([, sim]) => sim >= FUZZY_THRESHOLD)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([t]) => t);

    return { terms: fuzzy, fuzzy: fuzzy.length > 0 };
}

function runSearch(query) {
    if (!idx) return [];
    lastTerms = [];
    isFuzzy = false;

    const rawTerms = tokenize(query);
    if (!rawTerms.length) {
        return articles.map((_, i) => i).sort((a, b) => {
            return (parseFloat(articles[a].articleNumber) || 0) - (parseFloat(articles[b].articleNumber) || 0);
        });
    }

    const allExpanded = [];
    rawTerms.forEach(t => {
        const { terms, fuzzy } = expandTerm(t, idx);
        if (fuzzy) isFuzzy = true;
        allExpanded.push(...terms);
    });

    lastTerms = [...new Set(allExpanded)];
    if (!lastTerms.length) return [];

    const scored = articles
        .map((_, i) => ({ i, s: bm25Score(idx, i, lastTerms) }))
        .filter(x => x.s > 0);

    // Boost exact/partial article number match
    const numMatch = query.trim().match(/^(\d[\d\-.]*\d?|\d)$/);
    if (numMatch) {
        const n = numMatch[1];
        scored.forEach(item => {
            const an = articles[item.i].articleNumber;
            if (String(an) === n) item.s += 200;
            else if (String(an).startsWith(n)) item.s += 50;
        });
    }

    if (sortMode === 'number') {
        return scored
            .sort((a, b) => (parseFloat(articles[a.i].articleNumber) || 0) - (parseFloat(articles[b.i].articleNumber) || 0))
            .map(x => x.i);
    }
    return scored.sort((a, b) => b.s - a.s).map(x => x.i);
}

// ─── Snippet & Highlight ──────────────────────────────────────────────────────
function bestSnippet(text, terms, maxLen = 200) {
    if (!terms.length) return text.slice(0, maxLen) + (text.length > maxLen ? '…' : '');
    const norm = normalize(text);
    let best = { pos: 0, score: 0 };

    for (let i = 0; i < Math.max(1, norm.length - maxLen + 1); i += 15) {
        const w = norm.slice(i, i + maxLen);
        let sc = 0;
        terms.forEach(t => { if (w.includes(t)) sc += (w.split(t).length - 1) * (1 / Math.max(t.length, 1)); });
        if (sc > best.score) best = { pos: i, score: sc };
    }

    let snip = text.slice(best.pos, best.pos + maxLen);
    if (best.pos > 0) snip = '…' + snip.replace(/^\S+\s/, '');
    if (best.pos + maxLen < text.length) snip += '…';
    return snip;
}

function highlight(html, terms) {
    if (!terms.length) return html;
    const escaped = terms.map(t => escRe(escHtml(t))).filter(Boolean);
    if (!escaped.length) return html;
    const pattern = new RegExp(`(${escaped.join('|')})`, 'gi');
    return html.replace(pattern, '<mark>$1</mark>');
}

// ─── Rendering ────────────────────────────────────────────────────────────────
function renderCards(reset = true) {
    const list = $('virtual-list');
    if (reset) { list.innerHTML = ''; currentPage = 0; }

    const batch = results.slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE);
    const emptyState = $('empty-state');

    if (!batch.length && currentPage === 0) {
        emptyState.classList.remove('hidden');
        const t = T[currentLang];
        if (showBookmarks) {
            emptyState.querySelector('h3').textContent = t.noBookmarks;
            emptyState.querySelector('p').textContent = t.noBookmarksDesc;
        } else {
            emptyState.querySelector('h3').textContent = t.empty;
            emptyState.querySelector('p').textContent = t.emptyDesc;
        }
        return;
    }
    emptyState.classList.add('hidden');

    const t = T[currentLang];
    const moddaPrefix = currentLang === 'ru' ? 'ст.' : 'modda';
    const frag = document.createDocumentFragment();

    batch.forEach(i => {
        const a = articles[i];
        const isBm = bookmarks.has(i);
        const card = document.createElement('div');
        card.className = 'article-card';

        const snippet = bestSnippet(a.content, lastTerms);
        const titleHtml = highlight(escHtml(a.title), lastTerms);
        const snippetHtml = highlight(escHtml(snippet), lastTerms);
        const punish = a.punishment.length > 30 ? t.sanction : escHtml(a.punishment);

        card.innerHTML = `
            <div class="card-header">
                <div class="card-tag">${escHtml(a.type)} · ${moddaPrefix} ${escHtml(String(a.articleNumber))}</div>
                <button class="bm-btn${isBm ? ' active' : ''}" data-i="${i}" aria-label="Bookmark">${isBm ? '♥' : '♡'}</button>
            </div>
            <h3>${titleHtml}</h3>
            <p class="preview-text">${snippetHtml}</p>
            <div class="punishment-badge">⚖ ${punish}</div>
        `;

        card.addEventListener('click', e => {
            if (!e.target.closest('.bm-btn')) openArticle(a, i);
        });
        card.querySelector('.bm-btn').addEventListener('click', e => {
            e.stopPropagation();
            toggleBm(i, card);
        });

        frag.appendChild(card);
    });

    list.appendChild(frag);
    currentPage++;
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function openArticle(article, artIdx) {
    const t = T[currentLang];
    const label = t.articleLabel;
    const isBm = bookmarks.has(artIdx);

    const titleHl = lastTerms.length ? highlight(escHtml(article.title), lastTerms) : escHtml(article.title);
    const contentHl = lastTerms.length ? highlight(escHtml(article.content), lastTerms) : escHtml(article.content);

    $('modal-content').innerHTML = `
        <div class="modal-type-tag">${escHtml(article.type)}</div>
        <h2>${label} ${escHtml(String(article.articleNumber))}. ${titleHl}</h2>
        <div class="modal-body">${contentHl.replace(/\n/g, '<br>')}</div>
        <div class="full-punishment">
            <strong>${t.legalConsequence}</strong><br>
            ${escHtml(article.punishment)}
        </div>
        <div class="modal-actions">
            <button class="modal-act-btn" id="btn-copy">📋 ${t.copyBtn}</button>
            <button class="modal-act-btn" id="btn-share">🔗 ${t.shareBtn}</button>
            <button class="modal-act-btn${isBm ? ' bm-active' : ''}" id="btn-bm">
                ${isBm ? '♥' : '♡'} ${isBm ? t.bmActiveBtn : t.bmBtn}
            </button>
        </div>
    `;

    $('modal-overlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    $('btn-copy').addEventListener('click', () => {
        const text = `${label} ${article.articleNumber}. ${article.title}\n\n${article.content}\n\n${t.legalConsequence}\n${article.punishment}`;
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => showToast(t.copied));
        } else {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showToast(t.copied);
        }
    });

    $('btn-share').addEventListener('click', async () => {
        const shareData = {
            title: `UzKodex: ${label} ${article.articleNumber}. ${article.title}`,
            text: `${article.content.slice(0, 300)}…\n\n${t.legalConsequence} ${article.punishment}`,
        };
        if (navigator.share) {
            try { await navigator.share(shareData); } catch {}
        } else {
            navigator.clipboard?.writeText(`${shareData.title}\n\n${shareData.text}`)
                .then(() => showToast(t.copied));
        }
    });

    $('btn-bm').addEventListener('click', () => {
        toggleBm(artIdx, null);
        const btn = $('btn-bm');
        const active = bookmarks.has(artIdx);
        btn.innerHTML = `${active ? '♥' : '♡'} ${active ? t.bmActiveBtn : t.bmBtn}`;
        btn.classList.toggle('bm-active', active);
    });
}

function closeModal() {
    $('modal-overlay').classList.add('hidden');
    document.body.style.overflow = '';
}

// ─── Bookmarks ────────────────────────────────────────────────────────────────
function toggleBm(i, cardEl) {
    const t = T[currentLang];
    if (bookmarks.has(i)) {
        bookmarks.delete(i);
        showToast(t.unbookmarked);
    } else {
        bookmarks.add(i);
        showToast(t.bookmarked);
    }
    localStorage.setItem('uzk-bm', JSON.stringify([...bookmarks]));

    const active = bookmarks.has(i);
    if (cardEl) {
        const btn = cardEl.querySelector('.bm-btn');
        btn.classList.toggle('active', active);
        btn.textContent = active ? '♥' : '♡';
    }
    document.querySelectorAll(`.bm-btn[data-i="${i}"]`).forEach(btn => {
        btn.classList.toggle('active', active);
        btn.textContent = active ? '♥' : '♡';
    });

    if (showBookmarks) triggerSearch();
}

// ─── Main Search Flow ─────────────────────────────────────────────────────────
function triggerSearch() {
    const q = $('search-input').value.trim();
    $('clear-search').classList.toggle('hidden', !q);

    const url = new URL(location.href);
    if (q) url.searchParams.set('q', q); else url.searchParams.delete('q');
    if (activeFilter !== 'all') url.searchParams.set('type', activeFilter); else url.searchParams.delete('type');
    window.history.replaceState({}, '', url);

    const t0 = performance.now();
    let raw = runSearch(q);

    if (activeFilter !== 'all') {
        raw = raw.filter(i => {
            const type = articles[i].type;
            if (activeFilter === 'uk') return type.includes('Уголовный') || type.includes('Jinoyat');
            if (activeFilter === 'ak') return type.includes('Административный') || type.includes('Maʼmuriy') || type.includes('адм.');
            return true;
        });
    }

    if (showBookmarks) raw = raw.filter(i => bookmarks.has(i));

    results = raw;
    const ms = Math.round(performance.now() - t0);

    const t = T[currentLang];
    $('results-count').textContent = t.results + results.length;
    $('search-stats').textContent = q ? `${ms} ${t.ms}` : '';

    if (isFuzzy && results.length && q) {
        $('fuzzy-hint').textContent = t.fuzzyHint.replace('%q', q);
        $('fuzzy-hint').classList.remove('hidden');
    } else {
        $('fuzzy-hint').classList.add('hidden');
    }

    renderCards(true);
}

function updateTranslations() {
    const t = T[currentLang];
    $('search-input').placeholder = t.placeholder;
    $('empty-state').querySelector('h3').textContent = t.empty;
    $('empty-state').querySelector('p').textContent = t.emptyDesc;
    $('logo-subtitle').textContent = t.logoSubtitle;
    $('sort-select').querySelector('[value="relevance"]').textContent = t.sortRelevance;
    $('sort-select').querySelector('[value="number"]').textContent = t.sortNumber;
    $('bm-toggle').textContent = t.bookmarksBtn;
    $('shortcut-hint').textContent = t.shortcutHint;

    document.querySelectorAll('.filter-btn').forEach(btn => {
        if (btn.dataset.type === 'all') btn.textContent = t.all;
        if (btn.dataset.type === 'uk') btn.textContent = t.uk;
        if (btn.dataset.type === 'ak') btn.textContent = t.ak;
    });
}

// ─── Voice Search ─────────────────────────────────────────────────────────────
function initVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    const btn = $('voice-btn');
    btn.classList.remove('hidden');
    const rec = new SR();
    rec.maxAlternatives = 1;
    rec.interimResults = false;

    btn.addEventListener('click', () => {
        if (btn.classList.contains('listening')) { rec.stop(); return; }
        rec.lang = currentLang === 'ru' ? 'ru-RU' : 'uz-UZ';
        rec.start();
        btn.classList.add('listening');
        showToast(T[currentLang].voiceStart);
    });

    rec.onresult = e => {
        $('search-input').value = e.results[0][0].transcript;
        btn.classList.remove('listening');
        triggerSearch();
    };
    rec.onerror = () => btn.classList.remove('listening');
    rec.onend = () => btn.classList.remove('listening');
}

// ─── Event Wiring ─────────────────────────────────────────────────────────────
$('search-input').addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(triggerSearch, DEBOUNCE_MS);
});

$('clear-search').addEventListener('click', () => {
    $('search-input').value = '';
    triggerSearch();
    $('search-input').focus();
});

document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeFilter = btn.dataset.type;
        triggerSearch();
    });
});

document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (btn.classList.contains('active')) return;
        document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentLang = btn.dataset.lang;
        updateTranslations();
        init();
    });
});

$('sort-select').addEventListener('change', e => {
    sortMode = e.target.value;
    triggerSearch();
});

$('bm-toggle').addEventListener('click', () => {
    showBookmarks = !showBookmarks;
    $('bm-toggle').classList.toggle('active', showBookmarks);
    triggerSearch();
});

$('close-modal').addEventListener('click', closeModal);
$('modal-overlay').addEventListener('click', e => { if (e.target === $('modal-overlay')) closeModal(); });

$('content-area').addEventListener('scroll', e => {
    const el = e.target;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 150 && currentPage * ITEMS_PER_PAGE < results.length) {
        renderCards(false);
    }
});

document.addEventListener('keydown', e => {
    const inInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';

    if (e.key === 'Escape') {
        if (!$('modal-overlay').classList.contains('hidden')) {
            closeModal();
        } else if ($('search-input').value) {
            $('search-input').value = '';
            triggerSearch();
        } else {
            $('search-input').blur();
        }
        return;
    }

    if ((e.key === '/' || (e.ctrlKey && e.key === 'k')) && !inInput) {
        e.preventDefault();
        $('search-input').focus();
        $('search-input').select();
    }
});

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    $('toast-container').appendChild(el);
    setTimeout(() => el.remove(), 3000);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
    const file = currentLang === 'ru' ? 'database.json' : 'database_uz.json';
    $('virtual-list').innerHTML = '';
    $('loading-skeletons').classList.remove('hidden');
    $('results-count').textContent = T[currentLang].loading;
    $('fuzzy-hint').classList.add('hidden');

    try {
        const res = await fetch(file);
        articles = await res.json();
        idx = buildIndex(articles);
        $('loading-skeletons').classList.add('hidden');

        // Restore URL state
        const params = new URLSearchParams(location.search);
        const urlQ = params.get('q');
        const urlType = params.get('type');
        if (urlQ) $('search-input').value = urlQ;
        if (urlType && urlType !== 'all') {
            activeFilter = urlType;
            document.querySelectorAll('.filter-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.type === urlType);
            });
        }

        triggerSearch();
        showToast(T[currentLang].dbLoaded);
    } catch (err) {
        $('loading-skeletons').classList.add('hidden');
        showToast(T[currentLang].dbError, 'error');
        console.error(err);
    }
}

window.addEventListener('load', () => {
    $('search-input').focus();
    initVoice();
    init();
});
