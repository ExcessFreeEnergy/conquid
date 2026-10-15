/**
 * Caesar: De Bello Gallico Vocabulary Arena & PWA Engine
 * Features 5 Games + Graded Cards, 10-word Active Pool & 15% Spaced Review
 */

const STORAGE_KEY = 'caesar_vocab_progress_v2';
const POOL_SIZE = 10;
const REVIEW_PROBABILITY = 0.15; // 15% chance to review a mastered word
const MASTERY_THRESHOLD = 3;    // Correct answers needed to master a word

function stripMacrons(str) {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function getRomanRank(masteredCount) {
  if (masteredCount >= 3290) return { title: 'Imperator', icon: '👑', color: '#fae09c' };
  if (masteredCount >= 2000) return { title: 'Legatus', icon: '🦅', color: '#cba34e' };
  if (masteredCount >= 1000) return { title: 'Tribunus', icon: '⚔️', color: '#e0ba63' };
  if (masteredCount >= 500)  return { title: 'Centurio', icon: '🛡️', color: '#cba34e' };
  if (masteredCount >= 250)  return { title: 'Optio', icon: '⚜️', color: '#a62d2d' };
  if (masteredCount >= 50)   return { title: 'Legionarius', icon: '🗡️', color: '#9ca3af' };
  return { title: 'Tiro', icon: '🏛️', color: '#6b7280' };
}

class CaesarApp {
  constructor() {
    this.words = [];
    this.wordsById = new Map();
    this.stages = [];
    
    this.state = {
      mastered: new Set(),
      masteryScores: {},   // { [id]: score (0 to 3) }
      activePool: [],      // Exactly 10 active word IDs
      selectedStage: 'ALL',// 'ALL' or specific stage
      currentMode: 'cards',// 'cards', 'drill', 'match', 'scribe', 'sprint', 'cloze'
      streak: 0,
      totalReviewed: 0,
    };

    // Card & Game runtime state
    this.currentWord = null;
    this.isReview = false;
    this.isFlipped = false;
    this.matchState = { selectedLatin: null, selectedEng: null, pairs: [] };
    this.sprintTarget = null;
    this.sprintIsCorrect = false;

    this.initElements();
    this.registerServiceWorker();
    this.loadData();
  }

  initElements() {
    // Mode Navigation Tabs
    this.modeTabs = document.querySelectorAll('.mode-tab');
    this.modeViews = {
      cards: document.getElementById('view-cards'),
      drill: document.getElementById('view-drill'),
      match: document.getElementById('view-match'),
      scribe: document.getElementById('view-scribe'),
      sprint: document.getElementById('view-sprint'),
      cloze: document.getElementById('view-cloze'),
    };

    this.modeTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const mode = tab.getAttribute('data-mode');
        this.switchMode(mode);
      });
    });

    // Header & Stats
    this.elActivePool = document.getElementById('active-pool-count');
    this.elMasteredCount = document.getElementById('mastered-count');
    this.elTotalCount = document.getElementById('total-count');
    this.elProgressBar = document.getElementById('progress-bar');
    this.elProgressPct = document.getElementById('progress-pct');
    this.elRankBadge = document.getElementById('user-rank-badge');
    this.elStageSelect = document.getElementById('stage-select');

    // Stage Selector Event
    this.elStageSelect.addEventListener('change', (e) => {
      this.state.selectedStage = e.target.value;
      this.syncActivePool();
      this.saveProgress();
      this.updateUI();
      this.loadCurrentMode();
    });

    // 1. Flashcard Mode Elements
    this.cardContainer = document.getElementById('card-container');
    this.cardHeadword = document.getElementById('card-headword');
    this.cardPos = document.getElementById('card-pos');
    this.cardFirstSeen = document.getElementById('card-first-seen');
    this.cardStageBadge = document.getElementById('card-stage-badge');
    this.cardReviewBadge = document.getElementById('card-review-badge');
    this.cardBackHeadword = document.getElementById('card-back-headword');
    this.cardDefinition = document.getElementById('card-definition');
    this.cardSnippet = document.getElementById('card-snippet');
    this.cardMasteryDots = document.getElementById('card-mastery-dots');

    this.cardContainer.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      this.flipCard();
    });

    // 3 Graded Card Buttons
    document.getElementById('btn-card-forgot').addEventListener('click', (e) => {
      e.stopPropagation();
      this.gradeCard(0);
    });
    document.getElementById('btn-card-hard').addEventListener('click', (e) => {
      e.stopPropagation();
      this.gradeCard(1);
    });
    document.getElementById('btn-card-mastered').addEventListener('click', (e) => {
      e.stopPropagation();
      this.gradeCard(3);
    });

    // 2. Drill Mode Elements
    this.elDrillWord = document.getElementById('drill-word');
    this.elDrillPos = document.getElementById('drill-pos');
    this.elDrillOptions = document.getElementById('drill-options');

    // 3. Match Mode Elements
    this.elMatchLatin = document.getElementById('match-latin-col');
    this.elMatchEng = document.getElementById('match-eng-col');

    // 4. Scribe Mode Elements
    this.elScribeDef = document.getElementById('scribe-definition');
    this.elScribePos = document.getElementById('scribe-pos');
    this.elScribeHint = document.getElementById('scribe-hint');
    this.elScribeInput = document.getElementById('scribe-input');
    this.elScribeSubmit = document.getElementById('btn-scribe-submit');
    this.elScribeFeedback = document.getElementById('scribe-feedback');

    this.elScribeSubmit.addEventListener('click', () => this.checkScribeAnswer());
    this.elScribeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.checkScribeAnswer();
    });

    // 5. Sprint (Shield Wall) Elements
    this.elSprintWord = document.getElementById('sprint-word');
    this.elSprintDef = document.getElementById('sprint-definition');
    this.elSprintPos = document.getElementById('sprint-pos');
    document.getElementById('btn-sprint-false').addEventListener('click', () => this.checkSprintAnswer(false));
    document.getElementById('btn-sprint-true').addEventListener('click', () => this.checkSprintAnswer(true));

    // 6. Cloze Mode Elements
    this.elClozeSentence = document.getElementById('cloze-sentence');
    this.elClozeOptions = document.getElementById('cloze-options');
    this.elClozeCitation = document.getElementById('cloze-citation');

    // Search & Reset
    this.btnSearch = document.getElementById('btn-search');
    this.searchModal = document.getElementById('search-modal');
    this.btnCloseSearch = document.getElementById('btn-close-search');
    this.searchInput = document.getElementById('search-input');
    this.searchResults = document.getElementById('search-results');
    this.btnReset = document.getElementById('btn-reset');

    this.btnSearch.addEventListener('click', () => this.openSearch());
    this.btnCloseSearch.addEventListener('click', () => this.closeSearch());
    this.searchInput.addEventListener('input', (e) => this.renderSearchResults(e.target.value));

    this.btnReset.addEventListener('click', () => {
      if (confirm('Reset all progress in Caesar: De Bello Gallico?')) {
        localStorage.removeItem(STORAGE_KEY);
        this.state.mastered = new Set();
        this.state.masteryScores = {};
        this.state.activePool = [];
        this.state.streak = 0;
        this.syncActivePool();
        this.updateUI();
        this.loadCurrentMode();
      }
    });

    // Keyboard Shortcuts
    this.initKeyboardShortcuts();
  }

  initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (!this.searchModal.classList.contains('hidden')) {
        if (e.key === 'Escape') this.closeSearch();
        return;
      }

      // Mode-specific shortcuts
      if (this.state.currentMode === 'cards') {
        if (e.code === 'Space' || e.key === 'Enter') {
          e.preventDefault();
          this.flipCard();
        } else if (this.isFlipped) {
          if (e.key === '1' || e.key === 'ArrowLeft') this.gradeCard(0);
          else if (e.key === '2' || e.key === 'ArrowDown') this.gradeCard(1);
          else if (e.key === '3' || e.key === 'ArrowRight') this.gradeCard(3);
        }
      } else if (this.state.currentMode === 'drill' || this.state.currentMode === 'cloze') {
        if (['1', '2', '3', '4'].includes(e.key)) {
          const btns = document.querySelectorAll('.quiz-option-btn');
          const idx = parseInt(e.key, 10) - 1;
          if (btns[idx]) btns[idx].click();
        }
      } else if (this.state.currentMode === 'sprint') {
        if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'f') this.checkSprintAnswer(false);
        else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'v' || e.key.toLowerCase() === 't') this.checkSprintAnswer(true);
      }
    });
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW error:', err));
      });
    }
  }

  async loadData() {
    try {
      if (window.CAESAR_WORDS && Array.isArray(window.CAESAR_WORDS) && window.CAESAR_WORDS.length > 0) {
        this.words = window.CAESAR_WORDS;
      } else {
        let resp = await fetch('data/words.json').catch(() => null);
        if (!resp || !resp.ok) resp = await fetch('./data/words.json');
        if (!resp || !resp.ok) throw new Error('Failed to load words.json');
        this.words = await resp.json();
      }

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
      this.switchMode(this.state.currentMode || 'cards');
    } catch (err) {
      console.error('Data error:', err);
      if (!this.words || this.words.length === 0) {
        alert('Unable to load vocabulary data. Please refresh.');
      }
    }
  }

  populateStageSelect() {
    this.elStageSelect.innerHTML = '<option value="ALL">All Stages (Complete Work: 3,290 words)</option>';
    this.stages.forEach((stage) => {
      const opt = document.createElement('option');
      opt.value = stage;
      opt.textContent = stage;
      this.elStageSelect.appendChild(opt);
    });
  }

  loadProgress() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        this.state.mastered = new Set(parsed.mastered || []);
        this.state.masteryScores = parsed.masteryScores || {};
        this.state.activePool = parsed.activePool || [];
        this.state.selectedStage = parsed.selectedStage || 'ALL';
        this.state.currentMode = parsed.currentMode || 'cards';
        this.state.streak = parsed.streak || 0;
        this.state.totalReviewed = parsed.totalReviewed || 0;
      }
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }
    this.elStageSelect.value = this.state.selectedStage;
  }

  saveProgress() {
    try {
      const payload = {
        mastered: Array.from(this.state.mastered),
        masteryScores: this.state.masteryScores,
        activePool: this.state.activePool,
        selectedStage: this.state.selectedStage,
        currentMode: this.state.currentMode,
        streak: this.state.streak,
        totalReviewed: this.state.totalReviewed,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
  }

  getAvailableWords() {
    if (this.state.selectedStage === 'ALL') return this.words;
    return this.words.filter((w) => w.s === this.state.selectedStage);
  }

  syncActivePool() {
    const available = this.getAvailableWords();
    const availableIds = new Set(available.map((w) => w.r));

    // Keep words not mastered and still in stage
    this.state.activePool = this.state.activePool.filter(
      (id) => !this.state.mastered.has(id) && availableIds.has(id)
    );

    // Refill up to POOL_SIZE from unmastered available words in order
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

  sampleActiveOrReview() {
    this.syncActivePool();
    const available = this.getAvailableWords();
    const masteredInStage = available.filter((w) => this.state.mastered.has(w.r));

    const canReview = masteredInStage.length > 0;
    const shouldReview = canReview && Math.random() < REVIEW_PROBABILITY;

    if (shouldReview) {
      const idx = Math.floor(Math.random() * masteredInStage.length);
      return { word: masteredInStage[idx], isReview: true };
    }

    if (this.state.activePool.length > 0) {
      const wordId = this.state.activePool[0];
      return { word: this.wordsById.get(wordId), isReview: false };
    }

    return { word: null, isReview: false };
  }

  switchMode(mode) {
    this.state.currentMode = mode;
    this.saveProgress();

    // Update active tab styles
    this.modeTabs.forEach((tab) => {
      const m = tab.getAttribute('data-mode');
      if (m === mode) {
        tab.classList.add('bg-[#cba34e]', 'text-gray-950', 'font-bold');
        tab.classList.remove('text-gray-300', 'bg-[#1b2229]');
      } else {
        tab.classList.remove('bg-[#cba34e]', 'text-gray-950', 'font-bold');
        tab.classList.add('text-gray-300', 'bg-[#1b2229]');
      }
    });

    // Toggle views
    Object.keys(this.modeViews).forEach((m) => {
      if (m === mode) {
        this.modeViews[m].classList.remove('hidden');
      } else {
        this.modeViews[m].classList.add('hidden');
      }
    });

    this.loadCurrentMode();
  }

  loadCurrentMode() {
    switch (this.state.currentMode) {
      case 'cards':  this.loadCardsMode(); break;
      case 'drill':  this.loadDrillMode(); break;
      case 'match':  this.loadMatchMode(); break;
      case 'scribe': this.loadScribeMode(); break;
      case 'sprint': this.loadSprintMode(); break;
      case 'cloze':  this.loadClozeMode(); break;
    }
    this.updateUI();
  }

  updateWordScore(wordId, delta, resetIfWrong = false) {
    if (!wordId) return;
    let score = this.state.masteryScores[wordId] || 0;

    if (resetIfWrong && delta < 0) {
      score = 0;
    } else {
      score = Math.max(0, score + delta);
    }

    if (score >= MASTERY_THRESHOLD) {
      this.state.mastered.add(wordId);
      delete this.state.masteryScores[wordId];
      this.state.activePool = this.state.activePool.filter((id) => id !== wordId);
      this.syncActivePool();
    } else {
      this.state.masteryScores[wordId] = score;
    }

    this.saveProgress();
    this.updateUI();
  }

  // ==========================================
  // MODE 0: FLASHCARDS (Graded Validation)
  // ==========================================
  loadCardsMode() {
    this.isFlipped = false;
    this.cardContainer.classList.remove('is-flipped');

    const sample = this.sampleActiveOrReview();
    this.currentWord = sample.word;
    this.isReview = sample.isReview;

    if (!this.currentWord) {
      this.cardHeadword.textContent = "Victoria! Stage Complete";
      this.cardPos.textContent = "All Words Mastered";
      this.cardFirstSeen.textContent = "Select another stage or practice reviews.";
      return;
    }

    const w = this.currentWord;
    this.cardHeadword.textContent = w.h;
    this.cardPos.textContent = w.p;
    this.cardFirstSeen.textContent = `"${w.f}" (${w.c})`;
    this.cardStageBadge.textContent = w.s;

    if (this.isReview) {
      this.cardReviewBadge.classList.remove('hidden');
    } else {
      this.cardReviewBadge.classList.add('hidden');
    }

    // Back
    this.cardBackHeadword.textContent = w.h;
    this.cardDefinition.textContent = w.d;
    this.cardSnippet.textContent = w.x ? `"${w.x}" (${w.c})` : `First appeared as "${w.f}" in ${w.c}`;

    // Mastery Score Dots
    const score = this.state.masteryScores[w.r] || 0;
    this.cardMasteryDots.innerHTML = [1, 2, 3].map((step) => {
      const active = score >= step || this.isReview;
      return `<span class="w-2.5 h-2.5 rounded-full ${active ? 'bg-[#cba34e]' : 'bg-[#2e3a45]'}"></span>`;
    }).join('');
  }

  flipCard() {
    if (!this.currentWord) return;
    this.isFlipped = !this.isFlipped;
    this.cardContainer.classList.toggle('is-flipped', this.isFlipped);
  }

  gradeCard(points) {
    if (!this.currentWord) return;

    if (this.isReview) {
      if (points === 0) {
        // Demote back to active pool
        this.state.mastered.delete(this.currentWord.r);
        this.state.masteryScores[this.currentWord.r] = 0;
        this.syncActivePool();
      }
    } else {
      if (points === 0) {
        // Forgot: reset score, move to end of pool
        this.updateWordScore(this.currentWord.r, -1, true);
        const idx = this.state.activePool.indexOf(this.currentWord.r);
        if (idx !== -1) {
          this.state.activePool.splice(idx, 1);
          this.state.activePool.push(this.currentWord.r);
        }
      } else if (points === 1) {
        // Hard: keep in pool
        const idx = this.state.activePool.indexOf(this.currentWord.r);
        if (idx !== -1) {
          this.state.activePool.splice(idx, 1);
          this.state.activePool.push(this.currentWord.r);
        }
      } else {
        // Mastered
        this.updateWordScore(this.currentWord.r, 1);
      }
    }

    this.state.totalReviewed += 1;
    this.saveProgress();
    this.loadCardsMode();
  }

  // ==========================================
  // MODE 1: LEGIONARY DRILL (4-Choice MCQ)
  // ==========================================
  loadDrillMode() {
    const sample = this.sampleActiveOrReview();
    this.currentWord = sample.word;
    this.isReview = sample.isReview;

    if (!this.currentWord) {
      this.elDrillWord.textContent = "Stage Complete!";
      this.elDrillOptions.innerHTML = `<div class="p-4 text-center text-[#cba34e]">All active words mastered in this stage!</div>`;
      return;
    }

    const w = this.currentWord;
    this.elDrillWord.textContent = w.h;
    this.elDrillPos.textContent = `${w.p} · ${w.s}`;

    // Generate 3 distractors
    const pool = this.getAvailableWords().filter((item) => item.r !== w.r);
    const shuffled = pool.sort(() => 0.5 - Math.random()).slice(0, 3);
    const options = [w, ...shuffled].sort(() => 0.5 - Math.random());

    this.elDrillOptions.innerHTML = options.map((opt, idx) => `
      <button class="quiz-option-btn w-full p-4 bg-[#1b2229] hover:bg-[#252f38] border border-[#2e3a45] hover:border-[#cba34e] text-left text-sm sm:text-base rounded-xl transition flex items-center justify-between" data-rank="${opt.r}">
        <span class="pr-2 leading-snug">${opt.d}</span>
        <span class="w-6 h-6 rounded-full bg-[#14181d] text-gray-400 text-xs flex items-center justify-center font-mono shrink-0">${idx + 1}</span>
      </button>
    `).join('');

    this.elDrillOptions.querySelectorAll('.quiz-option-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const selectedRank = parseInt(btn.getAttribute('data-rank'), 10);
        this.handleDrillAnswer(selectedRank === w.r, btn);
      });
    });
  }

  handleDrillAnswer(isCorrect, btn) {
    // Disable buttons
    this.elDrillOptions.querySelectorAll('.quiz-option-btn').forEach((b) => b.disabled = true);

    if (isCorrect) {
      btn.classList.add('bg-emerald-950/80', 'border-emerald-500', 'text-emerald-200');
      this.updateWordScore(this.currentWord.r, 1);
    } else {
      btn.classList.add('bg-red-950/80', 'border-red-500', 'text-red-200', 'animate-shake');
      this.updateWordScore(this.currentWord.r, -1, true);
    }

    setTimeout(() => {
      this.loadDrillMode();
    }, 700);
  }

  // ==========================================
  // MODE 2: GLADIATOR MATCH (Pair Matching)
  // ==========================================
  loadMatchMode() {
    this.syncActivePool();
    const available = this.state.activePool.slice(0, 5).map((id) => this.wordsById.get(id));

    if (available.length < 2) {
      this.elMatchLatin.innerHTML = `<div class="p-4 text-gray-400">Not enough active words to match. Master words or switch stage.</div>`;
      this.elMatchEng.innerHTML = '';
      return;
    }

    this.matchState = { selectedLatin: null, selectedEng: null, matchedCount: 0, total: available.length };

    const latinItems = [...available].sort(() => 0.5 - Math.random());
    const engItems = [...available].sort(() => 0.5 - Math.random());

    this.elMatchLatin.innerHTML = latinItems.map((w) => `
      <button class="match-tile match-latin w-full p-3.5 bg-[#1b2229] hover:bg-[#222b33] border border-[#2e3a45] rounded-xl text-left font-lora text-sm sm:text-base text-[#fae09c] transition" data-id="${w.r}">
        ${w.h}
      </button>
    `).join('');

    this.elMatchEng.innerHTML = engItems.map((w) => `
      <button class="match-tile match-eng w-full p-3.5 bg-[#1b2229] hover:bg-[#222b33] border border-[#2e3a45] rounded-xl text-left text-xs sm:text-sm text-gray-200 transition" data-id="${w.r}">
        ${w.d}
      </button>
    `).join('');

    // Attach listeners
    this.elMatchLatin.querySelectorAll('.match-latin').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.elMatchLatin.querySelectorAll('.match-latin').forEach((b) => b.classList.remove('tile-selected'));
        btn.classList.add('tile-selected');
        this.matchState.selectedLatin = parseInt(btn.getAttribute('data-id'), 10);
        this.evaluateMatchPair();
      });
    });

    this.elMatchEng.querySelectorAll('.match-eng').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.elMatchEng.querySelectorAll('.match-eng').forEach((b) => b.classList.remove('tile-selected'));
        btn.classList.add('tile-selected');
        this.matchState.selectedEng = parseInt(btn.getAttribute('data-id'), 10);
        this.evaluateMatchPair();
      });
    });
  }

  evaluateMatchPair() {
    if (!this.matchState.selectedLatin || !this.matchState.selectedEng) return;

    const latBtn = this.elMatchLatin.querySelector(`[data-id="${this.matchState.selectedLatin}"]`);
    const engBtn = this.elMatchEng.querySelector(`[data-id="${this.matchState.selectedEng}"]`);

    if (this.matchState.selectedLatin === this.matchState.selectedEng) {
      // MATCH!
      latBtn.classList.add('bg-emerald-900/60', 'border-emerald-500', 'tile-matched');
      engBtn.classList.add('bg-emerald-900/60', 'border-emerald-500', 'tile-matched');
      this.updateWordScore(this.matchState.selectedLatin, 1);

      this.matchState.matchedCount += 1;
      this.matchState.selectedLatin = null;
      this.matchState.selectedEng = null;

      if (this.matchState.matchedCount >= this.matchState.total) {
        setTimeout(() => this.loadMatchMode(), 600);
      }
    } else {
      // MISMATCH
      latBtn.classList.add('animate-shake', 'border-red-500');
      engBtn.classList.add('animate-shake', 'border-red-500');

      setTimeout(() => {
        latBtn.classList.remove('animate-shake', 'border-red-500', 'tile-selected');
        engBtn.classList.remove('animate-shake', 'border-red-500', 'tile-selected');
        this.matchState.selectedLatin = null;
        this.matchState.selectedEng = null;
      }, 500);
    }
  }

  // ==========================================
  // MODE 3: CAESAR'S SCRIBE (Type / Recall)
  // ==========================================
  loadScribeMode() {
    const sample = this.sampleActiveOrReview();
    this.currentWord = sample.word;
    this.isReview = sample.isReview;

    this.elScribeFeedback.textContent = '';
    this.elScribeFeedback.className = 'text-xs min-h-[20px] text-center font-medium';
    this.elScribeInput.value = '';

    if (!this.currentWord) {
      this.elScribeDef.textContent = "All Words Mastered!";
      this.elScribeHint.textContent = "";
      return;
    }

    const w = this.currentWord;
    this.elScribeDef.textContent = w.d;
    this.elScribePos.textContent = `${w.p} · In Caesar: "${w.f}" (${w.c})`;

    // Skeleton hint (first & last letter or spaces)
    const baseLemma = stripMacrons(w.h.split(',')[0].trim());
    const skeleton = baseLemma.split('').map((char, i) => {
      if (i === 0 || i === baseLemma.length - 1) return char;
      return '_';
    }).join(' ');

    this.elScribeHint.textContent = `Hint: ${skeleton}`;
    this.elScribeInput.focus();
  }

  checkScribeAnswer() {
    if (!this.currentWord) return;

    const userText = stripMacrons(this.elScribeInput.value);
    const primaryLemma = stripMacrons(this.currentWord.h.split(',')[0].trim());
    const surfaceForm = stripMacrons(this.currentWord.f);

    const isCorrect = userText === primaryLemma || userText === surfaceForm;

    if (isCorrect) {
      this.elScribeFeedback.textContent = `Optime! Correct: ${this.currentWord.h}`;
      this.elScribeFeedback.className = 'text-xs min-h-[20px] text-center font-semibold text-emerald-400';
      this.updateWordScore(this.currentWord.r, 1);
      setTimeout(() => this.loadScribeMode(), 800);
    } else {
      this.elScribeFeedback.textContent = `Correct form: ${this.currentWord.h}`;
      this.elScribeFeedback.className = 'text-xs min-h-[20px] text-center font-semibold text-red-400 animate-shake';
      this.updateWordScore(this.currentWord.r, -1, true);
      setTimeout(() => this.loadScribeMode(), 1200);
    }
  }

  // ==========================================
  // MODE 4: SHIELD WALL (True/False Lightning)
  // ==========================================
  loadSprintMode() {
    const sample = this.sampleActiveOrReview();
    this.currentWord = sample.word;
    this.isReview = sample.isReview;

    if (!this.currentWord) {
      this.elSprintWord.textContent = "Victoria!";
      this.elSprintDef.textContent = "Stage complete.";
      return;
    }

    const w = this.currentWord;
    this.sprintIsCorrect = Math.random() >= 0.5;

    this.elSprintWord.textContent = w.h;
    this.elSprintPos.textContent = w.p;

    if (this.sprintIsCorrect) {
      this.elSprintDef.textContent = w.d;
    } else {
      // Pick random false definition from active pool
      const pool = this.getAvailableWords().filter((item) => item.r !== w.r);
      const randomFake = pool[Math.floor(Math.random() * pool.length)];
      this.elSprintDef.textContent = randomFake ? randomFake.d : w.d;
    }
  }

  checkSprintAnswer(userAnswer) {
    if (!this.currentWord) return;

    const isMatch = (userAnswer === this.sprintIsCorrect);
    const sprintBox = document.getElementById('sprint-card-box');

    if (isMatch) {
      sprintBox.classList.add('border-emerald-500', 'animate-gold-pulse');
      this.updateWordScore(this.currentWord.r, 1);
    } else {
      sprintBox.classList.add('border-red-500', 'animate-shake');
      this.updateWordScore(this.currentWord.r, -1, true);
    }

    setTimeout(() => {
      sprintBox.classList.remove('border-emerald-500', 'border-red-500', 'animate-gold-pulse', 'animate-shake');
      this.loadSprintMode();
    }, 450);
  }

  // ==========================================
  // MODE 5: CAESAR'S BATTLEFIELD (Authentic Cloze)
  // ==========================================
  loadClozeMode() {
    const sample = this.sampleActiveOrReview();
    this.currentWord = sample.word;
    this.isReview = sample.isReview;

    if (!this.currentWord) {
      this.elClozeSentence.textContent = "Stage complete!";
      this.elClozeOptions.innerHTML = '';
      return;
    }

    const w = this.currentWord;
    const surface = w.f;
    const rawSentence = w.x || `... ${surface} ...`;

    // Replace target word with blank
    const regex = new RegExp(`\\b${surface}\\b`, 'i');
    const clozeText = rawSentence.replace(regex, '<span class="text-[#cba34e] font-bold border-b-2 border-[#cba34e] px-1">_______</span>');

    this.elClozeSentence.innerHTML = clozeText;
    this.elClozeCitation.textContent = `${w.c} · Meaning: "${w.d}"`;

    // 4 options: 1 correct surface/lemma + 3 distractors
    const pool = this.getAvailableWords().filter((item) => item.r !== w.r);
    const shuffled = pool.sort(() => 0.5 - Math.random()).slice(0, 3);
    const options = [w, ...shuffled].sort(() => 0.5 - Math.random());

    this.elClozeOptions.innerHTML = options.map((opt, idx) => `
      <button class="quiz-option-btn w-full p-4 bg-[#1b2229] hover:bg-[#252f38] border border-[#2e3a45] hover:border-[#cba34e] text-left font-lora text-base sm:text-lg text-[#fae09c] rounded-xl transition flex items-center justify-between" data-rank="${opt.r}">
        <span>${opt.f || opt.h}</span>
        <span class="w-6 h-6 rounded-full bg-[#14181d] text-gray-400 text-xs flex items-center justify-center font-mono font-sans shrink-0">${idx + 1}</span>
      </button>
    `).join('');

    this.elClozeOptions.querySelectorAll('.quiz-option-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const selectedRank = parseInt(btn.getAttribute('data-rank'), 10);
        this.handleClozeAnswer(selectedRank === w.r, btn);
      });
    });
  }

  handleClozeAnswer(isCorrect, btn) {
    this.elClozeOptions.querySelectorAll('.quiz-option-btn').forEach((b) => b.disabled = true);

    if (isCorrect) {
      btn.classList.add('bg-emerald-950/80', 'border-emerald-500', 'text-emerald-200');
      this.updateWordScore(this.currentWord.r, 1);
    } else {
      btn.classList.add('bg-red-950/80', 'border-red-500', 'text-red-200', 'animate-shake');
      this.updateWordScore(this.currentWord.r, -1, true);
    }

    setTimeout(() => {
      this.loadClozeMode();
    }, 700);
  }

  // ==========================================
  // UI & SEARCH
  // ==========================================
  updateUI() {
    const available = this.getAvailableWords();
    const total = available.length;
    const masteredInStage = available.filter((w) => this.state.mastered.has(w.r)).length;
    const pct = total > 0 ? Math.round((masteredInStage / total) * 100) : 0;

    this.elActivePool.textContent = `${this.state.activePool.length}/${POOL_SIZE}`;
    this.elMasteredCount.textContent = masteredInStage.toLocaleString();
    this.elTotalCount.textContent = total.toLocaleString();
    this.elProgressBar.style.width = `${pct}%`;
    this.elProgressPct.textContent = `${pct}%`;

    // Roman Rank
    const rankInfo = getRomanRank(this.state.mastered.size);
    this.elRankBadge.innerHTML = `<span>${rankInfo.icon}</span> <span>${rankInfo.title}</span>`;
    this.elRankBadge.style.color = rankInfo.color;
  }

  openSearch() {
    this.searchModal.classList.remove('hidden');
    this.searchInput.value = '';
    this.searchInput.focus();
    this.renderSearchResults('');
  }

  closeSearch() {
    this.searchModal.classList.add('hidden');
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
      this.searchResults.innerHTML = `<div class="text-center py-8 text-gray-400 text-sm">No words found matching "${query}".</div>`;
      return;
    }

    this.searchResults.innerHTML = filtered.map((w) => {
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
            <div class="text-[11px] text-gray-500 mt-0.5">${w.s} · "${w.f}" in ${w.c}</div>
          </div>
          <div class="text-right shrink-0">
            <span class="text-xs font-mono text-[#cba34e]">#${w.r}</span>
          </div>
        </div>
      `;
    }).join('');

    this.searchResults.querySelectorAll('[data-word-id]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = parseInt(el.getAttribute('data-word-id'), 10);
        this.currentWord = this.wordsById.get(id);
        this.isReview = this.state.mastered.has(id);
        this.closeSearch();
        this.switchMode('cards');
      });
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.caesarApp = new CaesarApp();
});
