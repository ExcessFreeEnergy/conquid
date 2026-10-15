/**
 * Caesar: De Bello Gallico Vocabulary Engine & Spaced Repetition PWA
 */

const STORAGE_KEY = 'caesar_vocab_progress_v1';
const POOL_SIZE = 10;
const REVIEW_PROBABILITY = 0.15; // 15% chance to review a mastered word

class CaesarApp {
  constructor() {
    this.words = [];
    this.wordsById = new Map();
    this.stages = [];
    
    this.state = {
      mastered: new Set(),
      activePool: [],      // Array of 10 word IDs
      selectedStage: 'ALL',// 'ALL' or specific stage string
      streak: 0,
      totalReviewed: 0,
      lastStudyDate: null,
    };

    this.currentCard = null;
    this.isReviewCard = false;
    this.isFlipped = false;

    this.initElements();
    this.registerServiceWorker();
    this.loadData();
  }

  initElements() {
    this.elements = {
      flashcard: document.getElementById('flashcard'),
      cardContainer: document.getElementById('card-container'),
      cardHeadword: document.getElementById('card-headword'),
      cardPos: document.getElementById('card-pos'),
      cardFirstSeen: document.getElementById('card-first-seen'),
      cardStageBadge: document.getElementById('card-stage-badge'),
      cardReviewBadge: document.getElementById('card-review-badge'),
      cardBackHeadword: document.getElementById('card-back-headword'),
      cardDefinition: document.getElementById('card-definition'),
      cardFirstSeenContext: document.getElementById('card-first-seen-context'),
      cardFrequencyBadge: document.getElementById('card-frequency-badge'),
      btnStudyAgain: document.getElementById('btn-study-again'),
      btnMastered: document.getElementById('btn-mastered'),
      activePoolBadge: document.getElementById('active-pool-count'),
      masteredCount: document.getElementById('mastered-count'),
      totalCount: document.getElementById('total-count'),
      progressBar: document.getElementById('progress-bar'),
      progressPct: document.getElementById('progress-pct'),
      stageSelect: document.getElementById('stage-select'),
      currentStageTitle: document.getElementById('current-stage-title'),
      currentStageDesc: document.getElementById('current-stage-desc'),
      btnSearch: document.getElementById('btn-search'),
      searchModal: document.getElementById('search-modal'),
      btnCloseSearch: document.getElementById('btn-close-search'),
      searchInput: document.getElementById('search-input'),
      searchResults: document.getElementById('search-results'),
      btnReset: document.getElementById('btn-reset'),
    };

    // Card Flip Events
    this.elements.cardContainer.addEventListener('click', (e) => {
      // Don't flip if clicking action buttons on the back
      if (e.target.closest('button')) return;
      this.flipCard();
    });

    // Button Events
    this.elements.btnStudyAgain.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleStudyAgain();
    });

    this.elements.btnMastered.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleMastered();
    });

    // Stage Selector Event
    this.elements.stageSelect.addEventListener('change', (e) => {
      this.state.selectedStage = e.target.value;
      this.syncActivePool();
      this.saveProgress();
      this.updateUI();
      this.nextCard();
    });

    // Search Drawer Events
    this.elements.btnSearch.addEventListener('click', () => this.openSearch());
    this.elements.btnCloseSearch.addEventListener('click', () => this.closeSearch());
    this.elements.searchInput.addEventListener('input', (e) => this.renderSearchResults(e.target.value));

    // Reset Progress
    this.elements.btnReset.addEventListener('click', () => {
      if (confirm('Are you sure you want to reset all your learning progress? This cannot be undone.')) {
        localStorage.removeItem(STORAGE_KEY);
        this.state.mastered = new Set();
        this.state.activePool = [];
        this.state.streak = 0;
        this.state.totalReviewed = 0;
        this.syncActivePool();
        this.updateUI();
        this.nextCard();
      }
    });

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
      if (this.elements.searchModal.classList.contains('hidden') === false) {
        if (e.key === 'Escape') this.closeSearch();
        return;
      }
      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        this.flipCard();
      } else if (e.key === '1' || e.key === 'ArrowLeft') {
        if (this.isFlipped) this.handleStudyAgain();
      } else if (e.key === '2' || e.key === 'ArrowRight') {
        if (this.isFlipped) this.handleMastered();
      }
    });

    // Touch Swipe Support on Flashcard
    this.setupSwipeGestures();
  }

  setupSwipeGestures() {
    let touchStartX = 0;
    let touchStartY = 0;

    this.elements.cardContainer.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    this.elements.cardContainer.addEventListener('touchend', (e) => {
      const touchEndX = e.changedTouches[0].screenX;
      const touchEndY = e.changedTouches[0].screenY;
      const diffX = touchEndX - touchStartX;
      const diffY = touchEndY - touchStartY;

      if (Math.abs(diffX) > 60 && Math.abs(diffX) > Math.abs(diffY)) {
        // Horizontal swipe detected
        if (this.isFlipped) {
          if (diffX < 0) {
            // Swipe Left -> Study Again
            this.handleStudyAgain();
          } else {
            // Swipe Right -> Mastered
            this.handleMastered();
          }
        } else {
          this.flipCard();
        }
      }
    }, { passive: true });
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch((err) => {
          console.warn('SW registration skipped:', err);
        });
      });
    }
  }

  async loadData() {
    try {
      const resp = await fetch('data/words.json');
      if (!resp.ok) throw new Error('Failed to load words.json');
      this.words = await resp.json();
      
      this.wordsById.clear();
      this.stages = [];
      const stageSet = new Set();

      this.words.forEach((w) => {
        this.wordsById.set(w.r, w);
        if (!stageSet.has(w.s)) {
          stageSet.add(w.s);
          this.stages.push(w.s);
        }
      });

      this.populateStageSelect();
      this.loadProgress();
      this.syncActivePool();
      this.updateUI();
      this.nextCard();
    } catch (err) {
      console.error('Error loading data:', err);
      alert('Unable to load vocabulary data. Please check your internet connection or reload.');
    }
  }

  populateStageSelect() {
    this.elements.stageSelect.innerHTML = '<option value="ALL">All Stages (Complete Work: 3,290 words)</option>';
    this.stages.forEach((stage) => {
      const opt = document.createElement('option');
      opt.value = stage;
      opt.textContent = stage;
      this.elements.stageSelect.appendChild(opt);
    });
  }

  loadProgress() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        this.state.mastered = new Set(parsed.mastered || []);
        this.state.activePool = parsed.activePool || [];
        this.state.selectedStage = parsed.selectedStage || 'ALL';
        this.state.streak = parsed.streak || 0;
        this.state.totalReviewed = parsed.totalReviewed || 0;
        this.state.lastStudyDate = parsed.lastStudyDate || null;
      }
    } catch (e) {
      console.warn('Error reading localStorage:', e);
    }
    this.elements.stageSelect.value = this.state.selectedStage;
  }

  saveProgress() {
    try {
      const payload = {
        mastered: Array.from(this.state.mastered),
        activePool: this.state.activePool,
        selectedStage: this.state.selectedStage,
        streak: this.state.streak,
        totalReviewed: this.state.totalReviewed,
        lastStudyDate: this.state.lastStudyDate,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn('Error saving to localStorage:', e);
    }
  }

  getAvailableWords() {
    if (this.state.selectedStage === 'ALL') {
      return this.words;
    }
    return this.words.filter((w) => w.s === this.state.selectedStage);
  }

  syncActivePool() {
    const available = this.getAvailableWords();
    const availableIds = new Set(available.map((w) => w.r));

    // 1. Remove from active pool words that are mastered or outside selected stage
    this.state.activePool = this.state.activePool.filter(
      (id) => !this.state.mastered.has(id) && availableIds.has(id)
    );

    // 2. Refill active pool up to POOL_SIZE from unmastered available words in order of rank
    if (this.state.activePool.length < POOL_SIZE) {
      const activeSet = new Set(this.state.activePool);
      for (const w of available) {
        if (!this.state.mastered.has(w.r) && !activeSet.has(w.r)) {
          this.state.activePool.push(w.r);
          activeSet.add(w.r);
          if (this.state.activePool.length >= POOL_SIZE) break;
        }
      }
    }

    this.saveProgress();
  }

  nextCard() {
    this.isFlipped = false;
    this.elements.cardContainer.classList.remove('is-flipped');

    this.syncActivePool();
    const available = this.getAvailableWords();
    const masteredInStage = available.filter((w) => this.state.mastered.has(w.r));

    // Check 15% spaced repetition review chance
    const canReview = masteredInStage.length > 0;
    const shouldReview = canReview && Math.random() < REVIEW_PROBABILITY;

    if (shouldReview) {
      // Pick random mastered word for review
      const randomIndex = Math.floor(Math.random() * masteredInStage.length);
      this.currentCard = masteredInStage[randomIndex];
      this.isReviewCard = true;
    } else if (this.state.activePool.length > 0) {
      // Pick next word from active pool
      const wordId = this.state.activePool[0];
      this.currentCard = this.wordsById.get(wordId);
      this.isReviewCard = false;
    } else {
      // Stage completed!
      this.currentCard = null;
      this.isReviewCard = false;
    }

    this.renderCurrentCard();
    this.updateUI();
  }

  flipCard() {
    if (!this.currentCard) return;
    this.isFlipped = !this.isFlipped;
    if (this.isFlipped) {
      this.elements.cardContainer.classList.add('is-flipped');
    } else {
      this.elements.cardContainer.classList.remove('is-flipped');
    }
  }

  handleMastered() {
    if (!this.currentCard) return;

    if (!this.isReviewCard) {
      // Add to mastered set
      this.state.mastered.add(this.currentCard.r);
      // Remove from active pool
      this.state.activePool = this.state.activePool.filter((id) => id !== this.currentCard.r);
    }
    
    this.state.totalReviewed += 1;
    this.saveProgress();
    this.nextCard();
  }

  handleStudyAgain() {
    if (!this.currentCard) return;

    if (this.isReviewCard) {
      // If user failed a review card, demote back into active pool
      this.state.mastered.delete(this.currentCard.r);
      if (!this.state.activePool.includes(this.currentCard.r)) {
        this.state.activePool.push(this.currentCard.r);
      }
    } else {
      // Move this card to the end of the active pool
      const idx = this.state.activePool.indexOf(this.currentCard.r);
      if (idx !== -1) {
        this.state.activePool.splice(idx, 1);
        this.state.activePool.push(this.currentCard.r);
      }
    }

    this.state.totalReviewed += 1;
    this.saveProgress();
    this.nextCard();
  }

  renderCurrentCard() {
    if (!this.currentCard) {
      this.renderCompletionScreen();
      return;
    }

    const w = this.currentCard;

    // Front Face
    this.elements.cardHeadword.textContent = w.h;
    this.elements.cardPos.textContent = w.p;
    this.elements.cardFirstSeen.textContent = `"${w.f}" (${w.c})`;
    this.elements.cardStageBadge.textContent = w.s;

    if (this.isReviewCard) {
      this.elements.cardReviewBadge.classList.remove('hidden');
    } else {
      this.elements.cardReviewBadge.classList.add('hidden');
    }

    // Back Face
    this.elements.cardBackHeadword.textContent = w.h;
    this.elements.cardDefinition.textContent = w.d;
    this.elements.cardFirstSeenContext.textContent = `First appeared as "${w.f}" in ${w.c}`;
    this.elements.cardFrequencyBadge.textContent = `${w.n} total occurrence${w.n > 1 ? 's' : ''} in Caesar`;

    this.elements.flashcard.classList.remove('hidden');
    const compEl = document.getElementById('completion-view');
    if (compEl) compEl.classList.add('hidden');
  }

  renderCompletionScreen() {
    this.elements.flashcard.classList.add('hidden');
    let compEl = document.getElementById('completion-view');
    if (!compEl) {
      compEl = document.createElement('div');
      compEl.id = 'completion-view';
      compEl.className = 'bg-[#1b2229] border border-[#cba34e]/40 rounded-2xl p-8 text-center max-w-md mx-auto my-6 shadow-2xl';
      this.elements.flashcard.parentNode.insertBefore(compEl, this.elements.flashcard);
    }
    compEl.classList.remove('hidden');
    compEl.innerHTML = `
      <div class="text-4xl mb-3">🏛️</div>
      <h3 class="text-2xl font-cinzel font-bold text-[#cba34e] mb-2">Victoria! Stage Complete</h3>
      <p class="text-gray-300 text-sm mb-6">
        You have mastered all vocabulary in <strong class="text-white">${this.state.selectedStage}</strong>!
      </p>
      <div class="space-y-3">
        <button id="btn-next-stage" class="w-full py-3 bg-[#cba34e] hover:bg-[#e0ba63] text-gray-950 font-semibold rounded-xl transition shadow-lg">
          Advance to Next Stage
        </button>
        <button id="btn-review-all" class="w-full py-2.5 bg-[#2e3a45] hover:bg-[#3d4c5a] text-gray-200 text-sm font-medium rounded-xl transition">
          Practice Mastered Words
        </button>
      </div>
    `;

    document.getElementById('btn-next-stage').addEventListener('click', () => {
      const currIdx = this.stages.indexOf(this.state.selectedStage);
      if (currIdx !== -1 && currIdx < this.stages.length - 1) {
        this.elements.stageSelect.value = this.stages[currIdx + 1];
        this.elements.stageSelect.dispatchEvent(new Event('change'));
      } else {
        this.elements.stageSelect.value = 'ALL';
        this.elements.stageSelect.dispatchEvent(new Event('change'));
      }
    });

    document.getElementById('btn-review-all').addEventListener('click', () => {
      const available = this.getAvailableWords();
      const masteredInStage = available.filter((w) => this.state.mastered.has(w.r));
      if (masteredInStage.length > 0) {
        const rand = Math.floor(Math.random() * masteredInStage.length);
        this.currentCard = masteredInStage[rand];
        this.isReviewCard = true;
        this.renderCurrentCard();
      }
    });
  }

  updateUI() {
    const available = this.getAvailableWords();
    const total = available.length;
    const masteredInStage = available.filter((w) => this.state.mastered.has(w.r)).length;
    const pct = total > 0 ? Math.round((masteredInStage / total) * 100) : 0;

    this.elements.activePoolBadge.textContent = `${this.state.activePool.length}/${POOL_SIZE}`;
    this.elements.masteredCount.textContent = masteredInStage.toLocaleString();
    this.elements.totalCount.textContent = total.toLocaleString();
    this.elements.progressBar.style.width = `${pct}%`;
    this.elements.progressPct.textContent = `${pct}%`;

    if (this.state.selectedStage === 'ALL') {
      this.elements.currentStageTitle.textContent = "Entire Work (Books 1–8)";
      this.elements.currentStageDesc.textContent = "3,290 unique dictionary headwords ordered by first appearance.";
    } else {
      this.elements.currentStageTitle.textContent = this.state.selectedStage;
      this.elements.currentStageDesc.textContent = `${total} new words in this learning stage.`;
    }
  }

  openSearch() {
    this.elements.searchModal.classList.remove('hidden');
    this.elements.searchInput.value = '';
    this.elements.searchInput.focus();
    this.renderSearchResults('');
  }

  closeSearch() {
    this.elements.searchModal.classList.add('hidden');
  }

  renderSearchResults(query) {
    const q = query.trim().toLowerCase();
    const filtered = this.words.filter((w) => {
      if (!q) return true;
      return (
        w.h.toLowerCase().includes(q) ||
        w.d.toLowerCase().includes(q) ||
        w.f.toLowerCase().includes(q) ||
        w.s.toLowerCase().includes(q)
      );
    }).slice(0, 50);

    if (filtered.length === 0) {
      this.elements.searchResults.innerHTML = `
        <div class="text-center py-8 text-gray-400 text-sm">
          No words found matching "${query}".
        </div>
      `;
      return;
    }

    this.elements.searchResults.innerHTML = filtered.map((w) => {
      const isMastered = this.state.mastered.has(w.r);
      return `
        <div class="p-3.5 bg-[#171d23] hover:bg-[#1f2730] border border-[#2e3a45] rounded-xl transition cursor-pointer flex items-center justify-between" data-word-id="${w.r}">
          <div class="pr-3">
            <div class="flex items-center gap-2">
              <span class="font-lora text-lg font-medium text-[#cba34e]">${w.h}</span>
              <span class="text-[10px] px-1.5 py-0.5 bg-[#2e3a45] text-gray-300 rounded">${w.p}</span>
              ${isMastered ? '<span class="text-[10px] px-1.5 py-0.5 bg-emerald-900/60 text-emerald-300 border border-emerald-700/50 rounded">Mastered</span>' : ''}
            </div>
            <div class="text-xs text-gray-300 mt-1">${w.d}</div>
            <div class="text-[11px] text-gray-500 mt-0.5">${w.s} · First seen as "${w.f}" in ${w.c}</div>
          </div>
          <div class="text-right shrink-0">
            <span class="text-xs font-mono text-[#cba34e]">#${w.r}</span>
          </div>
        </div>
      `;
    }).join('');

    // Clicking a search result jumps directly to study it
    this.elements.searchResults.querySelectorAll('[data-word-id]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = parseInt(el.getAttribute('data-word-id'), 10);
        this.currentCard = this.wordsById.get(id);
        this.isReviewCard = this.state.mastered.has(id);
        this.closeSearch();
        this.renderCurrentCard();
      });
    });
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.caesarApp = new CaesarApp();
});
