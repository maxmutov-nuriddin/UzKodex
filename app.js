/**
 * UzKodex PWA - Core Logic
 */

let articles = [];
let filteredArticles = [];
let currentIndex = 0;
let currentLang = 'ru';
const ITEMS_PER_PAGE = 20;
let searchTimeout;

const translations = {
    ru: {
        placeholder: "Поиск: № статьи, название, наказание...",
        all: "Все",
        uk: "Уголовный кодекс РУз",
        ak: "Кодекс об адм. ответственности",
        loading: "Загрузка статей...",
        results: "Найдено статей: ",
        empty: "Ничего не найдено",
        emptyDesc: "Попробуйте изменить запрос или фильтры",
        legalConsequence: "Правовое последствие:",
        sanction: "Санкция",
        dbLoaded: "База данных загружена",
        dbError: "Ошибка загрузки данных",
        logoSubtitle: "Все кодексы в 1 месте"
    },
    uz: {
        placeholder: "Qidiruv: modda №, nomi, jazo...",
        all: "Barchasi",
        uk: "Jinoyat kodeksi",
        ak: "Maʼmuriy javobgarlik kodeksi",
        loading: "Moddalar yuklanmoqda...",
        results: "Topilgan moddalar: ",
        empty: "Hech narsa topilmadi",
        emptyDesc: "Qidiruv so'zini yoki filtrlarni o'zgartirib ko'ring",
        legalConsequence: "Huquqiy oqibat:",
        sanction: "Sanksiya",
        dbLoaded: "Ma'lumotlar yuklandi",
        dbError: "Yuklashda xatolik yuz berdi",
        logoSubtitle: "Barcha kodekslar 1 joyda"
    }
};

// DOM Elements
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search');
const filterBtns = document.querySelectorAll('.filter-btn');
const langBtns = document.querySelectorAll('.lang-btn');
const virtualList = document.getElementById('virtual-list');
const resultsCount = document.getElementById('results-count');
const emptyState = document.getElementById('empty-state');
const loadingSkeletons = document.getElementById('loading-skeletons');
const modalOverlay = document.getElementById('modal-overlay');
const modalContent = document.getElementById('modal-content');
const closeModalBtn = document.getElementById('close-modal');
const toastContainer = document.getElementById('toast-container');

// Init
async function init() {
    const dbFile = currentLang === 'ru' ? 'database.json' : 'database_uz.json';
    try {
        virtualList.innerHTML = `<div class="loading-state">${translations[currentLang].loading}</div>`;
        loadingSkeletons.classList.remove('hidden');
        const response = await fetch(dbFile);
        articles = await response.json();
        filteredArticles = [...articles];
        
        loadingSkeletons.classList.add('hidden');
        renderInitial();
        updateResultsCount();
        showToast(translations[currentLang].dbLoaded);
    } catch (error) {
        console.error('Failed to load articles:', error);
        showToast(translations[currentLang].dbError, 'error');
    }
}

// Language Switcher
langBtns.forEach(btn => {
    btn.onclick = () => {
        if (btn.classList.contains('active')) return;
        langBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentLang = btn.dataset.lang;
        updateUITranslations();
        init(); // Re-load data for new language
    };
});

function updateUITranslations() {
    const t = translations[currentLang];
    searchInput.placeholder = t.placeholder;
    resultsCount.textContent = t.loading;
    
    filterBtns.forEach(btn => {
        if (btn.dataset.type === 'all') btn.textContent = t.all;
        if (btn.dataset.type === 'uk') btn.textContent = t.uk;
        if (btn.dataset.type === 'ak') btn.textContent = t.ak;
    });

    emptyState.querySelector('h3').textContent = t.empty;
    emptyState.querySelector('p').textContent = t.emptyDesc;
    document.getElementById('logo-subtitle').textContent = t.logoSubtitle;
}

// Rendering
function renderInitial() {
    virtualList.innerHTML = '';
    currentIndex = 0;
    renderMore();
}

function renderMore() {
    const nextBatch = filteredArticles.slice(currentIndex, currentIndex + ITEMS_PER_PAGE);
    if (nextBatch.length === 0 && currentIndex === 0) {
        emptyState.classList.remove('hidden');
        return;
    }
    
    emptyState.classList.add('hidden');
    
    const fragment = document.createDocumentFragment();
    nextBatch.forEach(article => {
        const card = document.createElement('div');
        card.className = 'article-card';
        const t = translations[currentLang];
        const moddaPrefix = currentLang === 'ru' ? 'ст.' : 'modda';
        card.innerHTML = `
            <div class="card-tag">${article.type} • ${moddaPrefix} ${article.articleNumber}</div>
            <h3>${article.title}</h3>
            <p class="preview-text">${article.content.substring(0, 150)}...</p>
            <div class="punishment-badge">⚖️ ${article.punishment.length > 25 ? t.sanction : article.punishment}</div>
        `;
        card.onclick = () => openArticle(article);
        fragment.appendChild(card);
    });
    
    virtualList.appendChild(fragment);
    currentIndex += ITEMS_PER_PAGE;
}

// Add focus on load
window.onload = () => searchInput.focus();

// Infinite Scroll
virtualList.parentElement.onscroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    if (scrollTop + clientHeight >= scrollHeight - 100) {
        if (currentIndex < filteredArticles.length) {
            renderMore();
        }
    }
};

// Search & Filter
function handleSearch() {
    const normalize = (str) => str.replace(/[ʻʼ`']/g, "'").toLowerCase();
    const query = normalize(searchInput.value).trim();
    const typeFilter = document.querySelector('.filter-btn.active').dataset.type;
    
    clearSearchBtn.classList.toggle('hidden', query === '');

    filteredArticles = articles.filter(article => {
        const searchPool = normalize(`${article.articleNumber} ${article.title} ${article.content} ${article.punishment}`);
        if (!query) return true;
        const keywords = query.split(/\s+/).filter(k => k.length > 0);
        
        const matchesQuery = keywords.every(word => searchPool.includes(word));
        
        const matchesType = 
            typeFilter === 'all' || 
            (typeFilter === 'uk' && (article.type.includes('Уголовный') || article.type.includes('Jinoyat'))) ||
            (typeFilter === 'ak' && (article.type.includes('Административный') || article.type.includes('Maʼmuriy') || article.type.includes('адм.')));
            
        return matchesQuery && matchesType;
    });

    renderInitial();
    updateResultsCount();
}

// Debounce
searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(handleSearch, 300);
});

clearSearchBtn.onclick = () => {
    searchInput.value = '';
    handleSearch();
};

filterBtns.forEach(btn => {
    btn.onclick = () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        handleSearch();
    };
});

// Modal Logic
function openArticle(article) {
    modalContent.innerHTML = `
        <div class="card-tag">${article.type}</div>
        <h2>${currentLang === 'ru' ? 'Статья' : 'Modda'} ${article.articleNumber}. ${article.title}</h2>
        <p>${article.content.replace(/\n/g, '<br>')}</p>
        <div class="full-punishment">
            <strong>${translations[currentLang].legalConsequence}</strong><br>
            ${article.punishment}
        </div>
    `;
    modalOverlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

closeModalBtn.onclick = () => {
    modalOverlay.classList.add('hidden');
    document.body.style.overflow = '';
};

modalOverlay.onclick = (e) => {
    if (e.target === modalOverlay) closeModalBtn.click();
};

// UI Helpers
function updateResultsCount() {
    resultsCount.textContent = translations[currentLang].results + filteredArticles.length;
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Start
init();
