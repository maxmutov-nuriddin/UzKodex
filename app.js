/**
 * UzKodex PWA - Core Logic
 */

let articles = [];
let filteredArticles = [];
let currentIndex = 0;
const ITEMS_PER_PAGE = 20;
let searchTimeout;

// DOM Elements
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search');
const filterBtns = document.querySelectorAll('.filter-btn');
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
    try {
        const response = await fetch('database.json');
        articles = await response.json();
        filteredArticles = [...articles];
        
        loadingSkeletons.classList.add('hidden');
        renderInitial();
        updateResultsCount();
        showToast('База данных загружена');
    } catch (error) {
        console.error('Failed to load articles:', error);
        showToast('Ошибка загрузки данных', 'error');
    }
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
        card.innerHTML = `
            <div class="card-tag">${article.type} • Статья ${article.articleNumber}</div>
            <h3>${article.title}</h3>
            <p class="preview-text">${article.content.substring(0, 150)}...</p>
            ${article.punishment ? `<div class="punishment-badge">⚖️ Наказание предусмотрено</div>` : ''}
        `;
        card.onclick = () => openArticle(article);
        fragment.appendChild(card);
    });
    
    virtualList.appendChild(fragment);
    currentIndex += ITEMS_PER_PAGE;
}

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
    const query = searchInput.value.toLowerCase().trim();
    const typeFilter = document.querySelector('.filter-btn.active').dataset.type;
    
    clearSearchBtn.classList.toggle('hidden', query === '');

    filteredArticles = articles.filter(article => {
        const matchesQuery = 
            article.articleNumber.toString().includes(query) ||
            article.title.toLowerCase().includes(query) ||
            article.content.toLowerCase().includes(query);
        
        const matchesType = 
            typeFilter === 'all' || 
            (typeFilter === 'uk' && article.type === 'Уголовный кодекс') ||
            (typeFilter === 'ak' && article.type === 'Административный кодекс');
            
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
        <h2>Статья ${article.articleNumber}. ${article.title}</h2>
        <p>${article.content.replace(/\n/g, '<br>')}</p>
        ${article.punishment ? `
            <div class="full-punishment">
                <strong>Наказание:</strong><br>
                ${article.punishment}
            </div>
        ` : ''}
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
    resultsCount.textContent = `Найдено статей: ${filteredArticles.length}`;
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
