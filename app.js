/**
 * CONQUID: Caesar De Bello Gallico Vocabulary Engine
 * Full PWA application logic supporting bidirectional Latin ⇄ English mastery,
 * spaced repetition active pool, 6 distinct study games, and Caesar's Gauntlet
 * cumulative chapter milestone review.
 */

const STORAGE_KEY = 'caesar_vocab_progress_v2';
const POOL_SIZE = 10;
const REVIEW_PROBABILITY = 0.15;      // 15% chance to review a mastered word
const MASTERY_THRESHOLD_PER_DIR = 2;  // Requires 2 in Latin->Eng AND 2 in Eng->Latin for complete mastery

function stripMacrons(str) {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function normalizeScore(scoreObj) {
  if (typeof scoreObj === 'number') {
    return { l2e: Math.min(2, scoreObj), e2l: Math.min(2, Math.max(0, scoreObj - 1)) };
  }
  if (scoreObj && typeof scoreObj === 'object') {
    return {
      l2e: typeof scoreObj.l2e === 'number' ? Math.max(0, Math.min(2, scoreObj.l2e)) : 0,
      e2l: typeof scoreObj.e2l === 'number' ? Math.max(0, Math.min(2, scoreObj.e2l)) : 0,
    };
  }
  return { l2e: 0, e2l: 0 };
}

function getRomanRank(masteredCount) {
  if (masteredCount >= 3290) return { title: 'Imperator', icon: '👑', color: '#fae09c' };
  if (masteredCount >= 2000) return { title: 'Legatus', icon: '🦅', color: '#cba34e' };
  if (masteredCount >= 1000) return { title: 'Tribunus', icon: '⚔️', color: '#e0ba63' };
  if (masteredCount >= 500)  return { title: 'Centurio', icon: '🛡️', color: '#d4af37' };
  if (masteredCount >= 250)  return { title: 'Optio', icon: '🗡️', color: '#a0aab2' };
  if (masteredCount >= 100)  return { title: 'Legionarius', icon: '🪖', color: '#94a3b8' };
  if (masteredCount >= 30)   return { title: 'Discens', icon: '📜', color: '#8b9bb4' };
  return { title: 'Tiro', icon: '🏛️', color: '#71717a' };
}

class CaesarApp {
  constructor() {
    this.words = [];
    this.wordsById = new Map();
    this.stages = [];
    this.chapters = [];
    this.chaptersByKey = new Map();
    
    this.state = {
      mastered: new Set(),
      masteryScores: {},   // { [id]: { l2e: number, e2l: number } }
      activePool: [],      // Exactly 10 active word IDs
      selectedStage: 'Book 1 Subsection 1',
      currentMode: 'cards',// 'cards', 'drill', 'match', 'scribe', 'sprint', 'cloze', 'gauntlet'
      streak: 0,
      totalReviewed: 0,
      chapterTriumphs: {}, // { [chapterKey]: { score: number, accuracy: number, maxCombo: number, date: string } }
    };

    // Card & Game runtime state
    this.currentWord = null;
    this.isReview = false;
    this.isFlipped = false;
    this.currentDirection = 'l2e'; // 'l2e' (Latin -> Eng) or 'e2l' (Eng -> Latin)
    this.matchState = { selectedLatin: null, selectedEng: null, matchedCount: 0, total: 0 };
    this.sprintIsCorrect = false;
    this.sprintDirection = 'l2e';
    this.drillDirection = 'l2e';
    this.scribeDirection = 'e2l';
    this.clozeDirection = 'l2e';

    // Gauntlet Big Cumulative Review Runtime State
    this.gauntletState = {
      active: false,
      selectedKey: '1.1',
      queue: [],
      currentIndex: 0,
      lives: 3,
      score: 0,
      combo: 0,
      maxCombo: 0,
      correctCount: 0,
      timeLeft: 10,
      timerInterval: null,
      currentQuestion: null,
      totalRounds: 15,
    };

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
      gauntlet: document.getElementById('view-gauntlet'),
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

    // Chapter Milestone Review Banner
    this.elChapterReviewBanner = document.getElementById('chapter-review-banner');
    this.elBannerChapterTitle = document.getElementById('banner-chapter-title');
    this.elBannerChapterDesc = document.getElementById('banner-chapter-desc');
    this.elBtnBannerGauntlet = document.getElementById('btn-banner-gauntlet');

    if (this.elBtnBannerGauntlet) {
      this.elBtnBannerGauntlet.addEventListener('click', () => {
        const bannerKey = this.elBtnBannerGauntlet.getAttribute('data-chapter-key') || '1.1';
        this.gauntletState.selectedKey = bannerKey;
        if (this.elGauntletChapterSelect) {
          this.elGauntletChapterSelect.value = bannerKey;
        }
        this.switchMode('gauntlet');
      });
    }

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
    this.cardDirectionBadge = document.getElementById('card-direction-badge');
    this.cardReviewBadge = document.getElementById('card-review-badge');
    this.cardBackHeadword = document.getElementById('card-back-headword');
    this.cardBackSublabel = document.getElementById('card-back-sublabel');
    this.cardDefinition = document.getElementById('card-definition');
    this.cardSnippet = document.getElementById('card-snippet');
    this.cardMasteryDots = document.getElementById('card-mastery-dots');

    // Card Flip & Touch Gestures
    this.cardContainer.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      this.flipCard();
    });

    let touchStartX = 0;
    let touchStartY = 0;

    this.cardContainer.addEventListener('touchstart', (e) => {
      if (!e.changedTouches || e.changedTouches.length === 0) return;
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    this.cardContainer.addEventListener('touchend', (e) => {
      if (e.target.closest('button')) return;
      if (!e.changedTouches || e.changedTouches.length === 0) return;
      const touchEndX = e.changedTouches[0].screenX;
      const touchEndY = e.changedTouches[0].screenY;
      const diffX = touchEndX - touchStartX;
      const diffY = touchEndY - touchStartY;

      if (Math.abs(diffX) > 60 && Math.abs(diffX) > Math.abs(diffY)) {
        // Horizontal swipe gesture
        if (this.isFlipped) {
          if (diffX < 0) {
            this.gradeCard(0); // Swipe Left -> Forgot
          } else {
            this.gradeCard(3); // Swipe Right -> Mastered
          }
        }
      }
      // Taps are cleanly handled by the native click event listener
    }, { passive: true });

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
    this.elDrillDirectionBadge = document.getElementById('drill-direction-badge');

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
    this.elScribeDirectionBadge = document.getElementById('scribe-direction-badge');

    this.elScribeSubmit.addEventListener('click', () => this.checkScribeAnswer());
    this.elScribeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.checkScribeAnswer();
    });

    // 5. Sprint (Shield Wall) Elements
    this.elSprintWord = document.getElementById('sprint-word');
    this.elSprintDef = document.getElementById('sprint-definition');
    this.elSprintPos = document.getElementById('sprint-pos');
    this.elSprintDirectionBadge = document.getElementById('sprint-direction-badge');
    document.getElementById('btn-sprint-false').addEventListener('click', () => this.checkSprintAnswer(false));
    document.getElementById('btn-sprint-true').addEventListener('click', () => this.checkSprintAnswer(true));

    // 6. Cloze Mode Elements
    this.elClozeSentence = document.getElementById('cloze-sentence');
    this.elClozeOptions = document.getElementById('cloze-options');
    this.elClozeCitation = document.getElementById('cloze-citation');
    this.elClozeDirectionBadge = document.getElementById('cloze-direction-badge');

    // 7. Gauntlet Mode Elements
    this.elGauntletLobby = document.getElementById('gauntlet-lobby');
    this.elGauntletBattle = document.getElementById('gauntlet-battle');
    this.elGauntletResults = document.getElementById('gauntlet-results');
    this.elGauntletChapterSelect = document.getElementById('gauntlet-chapter-select');
    this.elGauntletScopeWords = document.getElementById('gauntlet-scope-words');
    this.elGauntletScopeStatus = document.getElementById('gauntlet-scope-status');
    this.elBtnStartGauntlet = document.getElementById('btn-start-gauntlet');

    this.elGauntletShields = document.getElementById('gauntlet-shields');
    this.elGauntletRoundNum = document.getElementById('gauntlet-round-num');
    this.elGauntletScore = document.getElementById('gauntlet-score');
    this.elGauntletComboBadge = document.getElementById('gauntlet-combo-badge');
    this.elGauntletTimerBar = document.getElementById('gauntlet-timer-bar');
    this.elGauntletDirBadge = document.getElementById('gauntlet-dir-badge');
    this.elGauntletWordCitation = document.getElementById('gauntlet-word-citation');
    this.elGauntletPrompt = document.getElementById('gauntlet-prompt');
    this.elGauntletSubprompt = document.getElementById('gauntlet-subprompt');
    this.elGauntletOptions = document.getElementById('gauntlet-options');

    this.elGauntletResultIcon = document.getElementById('gauntlet-result-icon');
    this.elGauntletResultTitle = document.getElementById('gauntlet-result-title');
    this.elGauntletResultSubtitle = document.getElementById('gauntlet-result-subtitle');
    this.elGauntletResScore = document.getElementById('gauntlet-res-score');
    this.elGauntletResAccuracy = document.getElementById('gauntlet-res-accuracy');
    this.elGauntletResCombo = document.getElementById('gauntlet-res-combo');
    this.elGauntletTrophyMessage = document.getElementById('gauntlet-trophy-message');
    this.elBtnGauntletRetry = document.getElementById('btn-gauntlet-retry');
    this.elBtnGauntletDone = document.getElementById('btn-gauntlet-done');

    if (this.elGauntletChapterSelect) {
      this.elGauntletChapterSelect.addEventListener('change', (e) => {
        this.gauntletState.selectedKey = e.target.value;
        this.updateGauntletLobbyStats();
      });
    }

    if (this.elBtnStartGauntlet) {
      this.elBtnStartGauntlet.addEventListener('click', () => this.startGauntlet());
    }
    if (this.elBtnGauntletRetry) {
      this.elBtnGauntletRetry.addEventListener('click', () => this.startGauntlet());
    }
    if (this.elBtnGauntletDone) {
      this.elBtnGauntletDone.addEventListener('click', () => this.switchMode('cards'));
    }

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
        this.state.chapterTriumphs = {};
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
      // Don't intercept when user is typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape' && !this.searchModal.classList.contains('hidden')) {
          this.closeSearch();
        }
        return;
      }

      if (!this.searchModal.classList.contains('hidden')) {
        if (e.key === 'Escape') this.closeSearch();
        return;
      }

      // Mode-specific shortcuts
      if (this.state.currentMode === 'cards') {
        const isSpace = e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar';
        if (isSpace || e.key === 'Enter' || e.key === 'ArrowUp') {
          e.preventDefault();
          this.flipCard();
        } else if (this.isFlipped) {
          if (e.key === '1' || e.key === 'ArrowLeft') {
            e.preventDefault();
            this.gradeCard(0);
          } else if (e.key === '2' || e.key === 'ArrowDown') {
            e.preventDefault();
            this.gradeCard(1);
          } else if (e.key === '3' || e.key === 'ArrowRight') {
            e.preventDefault();
            this.gradeCard(3);
          }
        }
      } else if (this.state.currentMode === 'drill' || this.state.currentMode === 'cloze') {
        if (['1', '2', '3', '4'].includes(e.key)) {
          const activeView = this.modeViews[this.state.currentMode];
          if (activeView) {
            const btns = activeView.querySelectorAll('.quiz-option-btn');
            const idx = parseInt(e.key, 10) - 1;
            if (btns[idx] && !btns[idx].disabled) {
              e.preventDefault();
              btns[idx].click();
            }
          }
        }
      } else if (this.state.currentMode === 'gauntlet' && this.gauntletState.active) {
        if (['1', '2', '3', '4'].includes(e.key)) {
          const btns = this.elGauntletOptions.querySelectorAll('.gauntlet-opt-btn');
          const idx = parseInt(e.key, 10) - 1;
          if (btns[idx] && !btns[idx].disabled) {
            e.preventDefault();
            btns[idx].click();
          }
        }
      } else if (this.state.currentMode === 'sprint') {
        if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'f') {
          e.preventDefault();
          this.checkSprintAnswer(false);
        } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'v' || e.key.toLowerCase() === 't') {
          e.preventDefault();
          this.checkSprintAnswer(true);
        }
      }
    });
  }

  registerServiceWorker() {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
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
      this.chapters = [];
      this.chaptersByKey.clear();

      const stageSet = new Set();

      this.words.forEach((w) => {
        this.wordsById.set(w.r, w);
        if (!stageSet.has(w.s)) {
          stageSet.add(w.s);
          this.stages.push(w.s);
        }

        // Group into chapters by citation, e.g. "Bk 1, Ch 1"
        const m = (w.c || '').match(/Bk\s*(\d+),\s*Ch\s*(\d+)/i);
        if (m) {
          const book = parseInt(m[1], 10);
          const ch = parseInt(m[2], 10);
          const key = `${book}.${ch}`;
          if (!this.chaptersByKey.has(key)) {
            const entry = {
              key,
              book,
              chapter: ch,
              title: `Book ${book}, Chapter ${ch}`,
              words: [],
              firstRank: w.r,
            };
            this.chaptersByKey.set(key, entry);
            this.chapters.push(entry);
          }
          this.chaptersByKey.get(key).words.push(w);
        }
      });

      // Compute cumulative words for each chapter
      let runningCumulative = [];
      this.chapters.forEach((chEntry) => {
        runningCumulative = runningCumulative.concat(chEntry.words);
        chEntry.cumulativeWords = [...runningCumulative];
        chEntry.cumulativeCount = runningCumulative.length;
      });

      this.populateStageSelect();
      this.populateGauntletChapterSelect();
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
    this.elStageSelect.innerHTML = '';
    this.stages.forEach((stage) => {
      const opt = document.createElement('option');
      opt.value = stage;
      const count = this.words.filter((w) => w.s === stage).length;
      opt.textContent = `${stage} (${count} words)`;
      this.elStageSelect.appendChild(opt);
    });
    const optAll = document.createElement('option');
    optAll.value = 'ALL';
    optAll.textContent = `All Books (Complete Work: ${this.words.length.toLocaleString()} words)`;
    this.elStageSelect.appendChild(optAll);
  }

  populateGauntletChapterSelect() {
    if (!this.elGauntletChapterSelect) return;
    this.elGauntletChapterSelect.innerHTML = '';
    this.chapters.forEach((ch) => {
      const opt = document.createElement('option');
      opt.value = ch.key;
      const triumph = this.state.chapterTriumphs && this.state.chapterTriumphs[ch.key];
      opt.textContent = `${ch.title} · ${ch.cumulativeCount} words cumulative ${triumph ? '🏆' : ''}`;
      this.elGauntletChapterSelect.appendChild(opt);
    });
    if (this.chapters.length > 0 && !this.gauntletState.selectedKey) {
      this.gauntletState.selectedKey = this.chapters[0].key;
    }
    if (this.gauntletState.selectedKey) {
      this.elGauntletChapterSelect.value = this.gauntletState.selectedKey;
    }
    this.updateGauntletLobbyStats();
  }

  loadProgress() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        this.state.mastered = new Set(parsed.mastered || []);
        this.state.masteryScores = parsed.masteryScores || {};
        this.state.activePool = parsed.activePool || [];
        this.state.chapterTriumphs = parsed.chapterTriumphs || {};

        // Migrate any old 'Chunk' names to 'Subsection'
        let savedStage = parsed.selectedStage;
        if (savedStage && typeof savedStage === 'string' && savedStage.includes('Chunk')) {
          savedStage = savedStage.replace('Chunk', 'Subsection');
        }

        // If previously saved as ALL or invalid stage, default to the first stage
        if (!savedStage || savedStage === 'ALL' || !this.stages.includes(savedStage)) {
          this.state.selectedStage = this.stages[0] || 'Book 1 Subsection 1';
        } else {
          this.state.selectedStage = savedStage;
        }

        this.state.currentMode = parsed.currentMode || 'cards';
        this.state.streak = parsed.streak || 0;
        this.state.totalReviewed = parsed.totalReviewed || 0;
      } else {
        this.state.selectedStage = this.stages[0] || 'Book 1 Subsection 1';
      }
    } catch (e) {
      console.warn('LocalStorage error:', e);
      this.state.selectedStage = this.stages[0] || 'Book 1 Subsection 1';
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
        chapterTriumphs: this.state.chapterTriumphs,
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
    const prevPool = [...this.state.activePool];

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

    const changed = this.state.activePool.length !== prevPool.length ||
      this.state.activePool.some((id, i) => id !== prevPool[i]);

    if (changed) {
      this.saveProgress();
    }
  }

  /**
   * Sample word and determine direction.
   * Prioritizes whichever direction (l2e or e2l) has lower mastery score.
   */
  sampleActiveOrReview() {
    this.syncActivePool();
    const available = this.getAvailableWords();
    const masteredInStage = available.filter((w) => this.state.mastered.has(w.r));

    const canReview = masteredInStage.length > 0;
    const shouldReview = canReview && Math.random() < REVIEW_PROBABILITY;

    let word = null;
    let isReview = false;

    if (shouldReview) {
      const idx = Math.floor(Math.random() * masteredInStage.length);
      word = masteredInStage[idx];
      isReview = true;
    } else if (this.state.activePool.length > 0) {
      word = this.wordsById.get(this.state.activePool[0]);
      isReview = false;
    }

    if (!word) {
      return { word: null, isReview: false, direction: 'l2e' };
    }

    // Bidirectional selection:
    // If review: random 50/50
    // If active: prioritize whichever direction has fewer validations
    let direction = 'l2e';
    if (isReview) {
      direction = Math.random() < 0.5 ? 'l2e' : 'e2l';
    } else {
      const scores = normalizeScore(this.state.masteryScores[word.r]);
      if (scores.l2e < scores.e2l) {
        direction = 'l2e';
      } else if (scores.e2l < scores.l2e) {
        direction = 'e2l';
      } else {
        direction = Math.random() < 0.5 ? 'l2e' : 'e2l';
      }
    }

    return { word, isReview, direction };
  }

  switchMode(mode) {
    // If leaving gauntlet while active, clean up timer
    if (this.state.currentMode === 'gauntlet' && mode !== 'gauntlet' && this.gauntletState.timerInterval) {
      clearInterval(this.gauntletState.timerInterval);
      this.gauntletState.timerInterval = null;
    }

    this.state.currentMode = mode;
    this.saveProgress();

    // Update active tab styles
    this.modeTabs.forEach((tab) => {
      const m = tab.getAttribute('data-mode');
      if (m === mode) {
        tab.classList.add('bg-[#cba34e]', 'text-gray-950', 'font-bold');
        tab.classList.remove('text-gray-300', 'bg-[#1b2229]', 'text-[#fae09c]');
      } else {
        tab.classList.remove('bg-[#cba34e]', 'text-gray-950', 'font-bold');
        tab.classList.add(m === 'gauntlet' ? 'text-[#fae09c]' : 'text-gray-300', 'bg-[#1b2229]');
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
      case 'cards':    this.loadCardsMode(); break;
      case 'drill':    this.loadDrillMode(); break;
      case 'match':    this.loadMatchMode(); break;
      case 'scribe':   this.loadScribeMode(); break;
      case 'sprint':   this.loadSprintMode(); break;
      case 'cloze':    this.loadClozeMode(); break;
      case 'gauntlet': this.loadGauntletMode(); break;
    }
    this.updateUI();
  }

  /**
   * Updates score for specific direction (l2e or e2l).
   * Moves word to mastered Set ONLY when both directions reach MASTERY_THRESHOLD_PER_DIR.
   */
  updateWordScore(wordId, direction = 'l2e', delta = 1, resetIfWrong = false) {
    if (!wordId) return;
    const scores = normalizeScore(this.state.masteryScores[wordId]);

    if (resetIfWrong && delta < 0) {
      scores[direction] = 0;
      // Demote review word back to active learning pool if failed in any game
      if (this.state.mastered.has(wordId)) {
        this.state.mastered.delete(wordId);
        const otherDir = direction === 'l2e' ? 'e2l' : 'l2e';
        scores[otherDir] = Math.max(1, scores[otherDir]);
        this.syncActivePool();
      }
    } else {
      scores[direction] = Math.max(0, scores[direction] + delta);
    }

    if (scores.l2e >= MASTERY_THRESHOLD_PER_DIR && scores.e2l >= MASTERY_THRESHOLD_PER_DIR) {
      this.state.mastered.add(wordId);
      delete this.state.masteryScores[wordId];
      this.state.activePool = this.state.activePool.filter((id) => id !== wordId);
      this.syncActivePool();
    } else {
      this.state.masteryScores[wordId] = scores;
    }

    this.saveProgress();
    this.updateUI();
  }

  // ==========================================
  // MODE 0: FLASHCARDS (Bidirectional Graded)
  // ==========================================
  loadCardsMode() {
    this.isFlipped = false;
    this.cardContainer.classList.remove('is-flipped');

    const sample = this.sampleActiveOrReview();
    this.currentWord = sample.word;
    this.isReview = sample.isReview;
    this.currentDirection = sample.direction;

    if (!this.currentWord) {
      this.cardHeadword.textContent = "Victoria! Stage Complete";
      this.cardPos.textContent = "All Words Mastered";
      this.cardFirstSeen.textContent = "Select another stage or play Caesar's Gauntlet.";
      this.cardMasteryDots.innerHTML = '';
      return;
    }

    const w = this.currentWord;
    const isL2E = this.currentDirection === 'l2e';

    // Direction Badge
    if (this.cardDirectionBadge) {
      this.cardDirectionBadge.innerHTML = isL2E
        ? '<span>🏛️</span> <span>Latin → English</span>'
        : '<span>🇬🇧</span> <span>English → Latin</span>';
    }

    this.cardStageBadge.textContent = w.s;
    if (this.isReview) {
      this.cardReviewBadge.classList.remove('hidden');
    } else {
      this.cardReviewBadge.classList.add('hidden');
    }

    if (isL2E) {
      // Front: Latin
      this.cardHeadword.textContent = w.h;
      this.cardPos.textContent = w.p;
      this.cardFirstSeen.textContent = `"${w.f}" (${w.c})`;
      // Back: English
      this.cardBackHeadword.textContent = w.h;
      if (this.cardBackSublabel) this.cardBackSublabel.textContent = 'English Meaning';
      this.cardDefinition.textContent = w.d;
      this.cardSnippet.textContent = w.x ? `"${w.x}" (${w.c})` : `First appeared as "${w.f}" in ${w.c}`;
    } else {
      // Front: English
      this.cardHeadword.textContent = w.d;
      this.cardPos.textContent = w.p;
      this.cardFirstSeen.textContent = `Appeared in ${w.c}`;
      // Back: Latin
      this.cardBackHeadword.textContent = `Latin: ${w.h}`;
      if (this.cardBackSublabel) this.cardBackSublabel.textContent = 'Latin Headword & Form';
      this.cardDefinition.textContent = w.h;
      this.cardSnippet.textContent = w.x ? `"${w.x}" (${w.c})` : `First appeared as "${w.f}" in ${w.c}`;
    }

    // Bidirectional Mastery Score Dots: L->E [●][○] | E->L [●][○]
    const scores = normalizeScore(this.state.masteryScores[w.r]);
    const l2eDots = [1, 2].map((step) => {
      const active = scores.l2e >= step || this.isReview;
      return `<span class="w-2 h-2 rounded-full ${active ? 'bg-[#cba34e]' : 'bg-[#2e3a45]'}" title="Latin→English Step ${step}"></span>`;
    }).join('');
    const e2lDots = [1, 2].map((step) => {
      const active = scores.e2l >= step || this.isReview;
      return `<span class="w-2 h-2 rounded-full ${active ? 'bg-[#fae09c]' : 'bg-[#2e3a45]'}" title="English→Latin Step ${step}"></span>`;
    }).join('');

    this.cardMasteryDots.innerHTML = `
      <span class="text-[9px] font-mono text-gray-400">L→E</span>
      <div class="flex items-center gap-0.5">${l2eDots}</div>
      <span class="text-gray-600 px-0.5 text-xs">|</span>
      <span class="text-[9px] font-mono text-gray-400">E→L</span>
      <div class="flex items-center gap-0.5">${e2lDots}</div>
    `;
  }

  flipCard() {
    this.isFlipped = !this.isFlipped;
    this.cardContainer.classList.toggle('is-flipped', this.isFlipped);
  }

  gradeCard(points) {
    if (!this.currentWord) return;

    if (this.isReview) {
      if (points === 0) {
        // Demote back to active pool with 1 point in tested direction
        this.state.mastered.delete(this.currentWord.r);
        this.state.masteryScores[this.currentWord.r] = {
          l2e: this.currentDirection === 'l2e' ? 0 : 1,
          e2l: this.currentDirection === 'e2l' ? 0 : 1,
        };
        this.syncActivePool();
      }
    } else {
      if (points === 0) {
        // Forgot: reset score for current direction, cycle to back of active pool
        this.updateWordScore(this.currentWord.r, this.currentDirection, -1, true);
        const idx = this.state.activePool.indexOf(this.currentWord.r);
        if (idx !== -1) {
          this.state.activePool.splice(idx, 1);
          this.state.activePool.push(this.currentWord.r);
        }
      } else if (points === 1) {
        // Hard: keep in active pool, cycle to back
        const idx = this.state.activePool.indexOf(this.currentWord.r);
        if (idx !== -1) {
          this.state.activePool.splice(idx, 1);
          this.state.activePool.push(this.currentWord.r);
        }
      } else {
        // Mastered this direction step
        this.updateWordScore(this.currentWord.r, this.currentDirection, 1);
      }
    }

    this.state.totalReviewed += 1;
    this.saveProgress();
    this.loadCardsMode();
  }

  // ==========================================
  // MODE 1: LEGIONARY DRILL (Bidirectional MCQ)
  // ==========================================
  loadDrillMode() {
    const sample = this.sampleActiveOrReview();
    this.currentWord = sample.word;
    this.isReview = sample.isReview;
    this.drillDirection = sample.direction;

    if (!this.currentWord) {
      this.elDrillWord.textContent = "Stage Complete!";
      this.elDrillOptions.innerHTML = `<div class="p-4 text-center text-[#cba34e]">All active words mastered in this stage!</div>`;
      return;
    }

    const w = this.currentWord;
    const isL2E = this.drillDirection === 'l2e';

    if (this.elDrillDirectionBadge) {
      this.elDrillDirectionBadge.textContent = isL2E ? 'Latin → English' : 'English → Latin';
    }

    if (isL2E) {
      this.elDrillWord.textContent = w.h;
      this.elDrillPos.textContent = `${w.p} · ${w.s}`;
    } else {
      this.elDrillWord.textContent = w.d;
      this.elDrillPos.textContent = `In Caesar: ${w.c} · ${w.p}`;
    }

    // 3 distractors
    let pool = this.getAvailableWords().filter((item) => item.r !== w.r);
    if (pool.length < 3) {
      pool = this.words.filter((item) => item.r !== w.r);
    }
    const shuffled = pool.sort(() => 0.5 - Math.random()).slice(0, 3);
    const options = [w, ...shuffled].sort(() => 0.5 - Math.random());

    this.elDrillOptions.innerHTML = options.map((opt, idx) => {
      const displayText = isL2E ? opt.d : opt.h;
      return `
        <button class="quiz-option-btn w-full p-3.5 sm:p-4 bg-[#1b2229] hover:bg-[#252f38] border border-[#2e3a45] hover:border-[#cba34e] text-left text-sm sm:text-base rounded-xl transition flex items-center justify-between" data-rank="${opt.r}">
          <span class="pr-2 leading-snug ${!isL2E ? 'font-lora text-[#fae09c]' : 'text-gray-200'}">${displayText}</span>
          <span class="w-6 h-6 rounded-full bg-[#14181d] text-gray-400 text-xs flex items-center justify-center font-mono shrink-0">${idx + 1}</span>
        </button>
      `;
    }).join('');

    this.elDrillOptions.querySelectorAll('.quiz-option-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const selectedRank = parseInt(btn.getAttribute('data-rank'), 10);
        this.handleDrillAnswer(selectedRank === w.r, btn);
      });
    });
  }

  handleDrillAnswer(isCorrect, btn) {
    this.elDrillOptions.querySelectorAll('.quiz-option-btn').forEach((b) => b.disabled = true);

    if (isCorrect) {
      btn.classList.add('bg-emerald-950/80', 'border-emerald-500', 'text-emerald-200');
      this.updateWordScore(this.currentWord.r, this.drillDirection, 1);
    } else {
      btn.classList.add('bg-red-950/80', 'border-red-500', 'text-red-200', 'animate-shake');
      this.updateWordScore(this.currentWord.r, this.drillDirection, -1, true);
    }

    setTimeout(() => {
      if (this.state.currentMode === 'drill') {
        this.loadDrillMode();
      }
    }, 650);
  }

  // ==========================================
  // MODE 2: GLADIATOR MATCH (Pair Matching)
  // ==========================================
  loadMatchMode() {
    this.syncActivePool();
    let available = this.state.activePool.slice(0, 5).map((id) => this.wordsById.get(id)).filter(Boolean);

    if (available.length < 2) {
      const stageWords = this.getAvailableWords();
      available = stageWords.slice(0, 5);
    }

    if (available.length < 2) {
      this.elMatchLatin.innerHTML = `<div class="p-4 text-gray-400">Not enough words to match. Select another stage.</div>`;
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

    if (!latBtn || !engBtn) {
      this.matchState.selectedLatin = null;
      this.matchState.selectedEng = null;
      return;
    }

    if (this.matchState.selectedLatin === this.matchState.selectedEng) {
      const matchedId = this.matchState.selectedLatin;
      latBtn.classList.add('bg-emerald-900/60', 'border-emerald-500', 'tile-matched');
      engBtn.classList.add('bg-emerald-900/60', 'border-emerald-500', 'tile-matched');

      // Progress the direction with fewer points
      const scores = normalizeScore(this.state.masteryScores[matchedId]);
      const dir = scores.l2e <= scores.e2l ? 'l2e' : 'e2l';
      this.updateWordScore(matchedId, dir, 1);

      this.matchState.matchedCount += 1;
      this.matchState.selectedLatin = null;
      this.matchState.selectedEng = null;

      if (this.matchState.matchedCount >= this.matchState.total) {
        setTimeout(() => {
          if (this.state.currentMode === 'match') {
            this.loadMatchMode();
          }
        }, 600);
      }
    } else {
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
  // MODE 3: CAESAR'S SCRIBE (Bidirectional Typing)
  // ==========================================
  loadScribeMode() {
    const sample = this.sampleActiveOrReview();
    this.currentWord = sample.word;
    this.isReview = sample.isReview;
    this.scribeDirection = sample.direction;

    this.elScribeFeedback.textContent = '';
    this.elScribeFeedback.className = 'text-xs min-h-[20px] text-center font-medium';
    this.elScribeInput.value = '';

    if (!this.currentWord) {
      this.elScribeDef.textContent = "All Words Mastered!";
      this.elScribeHint.textContent = "";
      return;
    }

    const w = this.currentWord;
    const isE2L = this.scribeDirection === 'e2l';

    if (this.elScribeDirectionBadge) {
      this.elScribeDirectionBadge.textContent = isE2L ? 'English → Latin' : 'Latin → English';
    }

    if (isE2L) {
      // English prompt -> type Latin word
      this.elScribeDef.textContent = w.d;
      this.elScribePos.textContent = `${w.p} · In Caesar: "${w.f}" (${w.c})`;
      this.elScribeInput.placeholder = "Type Latin word (macrons optional)...";

      const baseLemma = stripMacrons(w.h.split(',')[0].trim());
      const skeleton = baseLemma.split('').map((char, i) => {
        if (i === 0 || i === baseLemma.length - 1 || char === ' ') return char;
        return '_';
      }).join(' ');
      this.elScribeHint.textContent = `Latin Hint: ${skeleton}`;
    } else {
      // Latin prompt -> type primary English keyword
      this.elScribeDef.textContent = w.h;
      this.elScribePos.textContent = `${w.p} · In Caesar: "${w.f}" (${w.c})`;
      this.elScribeInput.placeholder = "Type English meaning...";

      const cleanDef = w.d.replace(/\(.*?\)/g, '').split(/[,;/]/)[0].trim();
      const skeleton = cleanDef.split('').map((char, i) => {
        if (i === 0 || i === cleanDef.length - 1 || char === ' ') return char;
        return '_';
      }).join(' ');
      this.elScribeHint.textContent = `English Hint: ${skeleton}`;
    }

    this.elScribeInput.focus();
  }

  checkScribeAnswer() {
    if (!this.currentWord) return;

    const userText = stripMacrons(this.elScribeInput.value);
    const w = this.currentWord;
    const isE2L = this.scribeDirection === 'e2l';
    let isCorrect = false;

    if (isE2L) {
      const primaryLemma = stripMacrons(w.h.split(',')[0].trim());
      const surfaceForm = stripMacrons(w.f);
      isCorrect = userText.length > 0 && (userText === primaryLemma || userText === surfaceForm);
    } else {
      const cleanDef = stripMacrons(w.d.replace(/[(),;]/g, ' '));
      const defWords = cleanDef.split(/\s+/).filter((s) => s.length > 2);
      const userClean = stripMacrons(userText);
      isCorrect = userClean.length > 0 && (
        defWords.includes(userClean) ||
        cleanDef.includes(userClean) ||
        w.d.toLowerCase().includes(userClean)
      );
    }

    if (isCorrect) {
      this.elScribeFeedback.textContent = `Optime! Correct: ${isE2L ? w.h : w.d}`;
      this.elScribeFeedback.className = 'text-xs min-h-[20px] text-center font-semibold text-emerald-400';
      this.updateWordScore(w.r, this.scribeDirection, 1);
      setTimeout(() => {
        if (this.state.currentMode === 'scribe') {
          this.loadScribeMode();
        }
      }, 700);
    } else {
      this.elScribeFeedback.textContent = `Correct: ${isE2L ? w.h : w.d}`;
      this.elScribeFeedback.className = 'text-xs min-h-[20px] text-center font-semibold text-red-400 animate-shake';
      this.updateWordScore(w.r, this.scribeDirection, -1, true);
      setTimeout(() => {
        if (this.state.currentMode === 'scribe') {
          this.loadScribeMode();
        }
      }, 1200);
    }
  }

  // ==========================================
  // MODE 4: SHIELD WALL (Bidirectional Sprint)
  // ==========================================
  loadSprintMode() {
    const sample = this.sampleActiveOrReview();
    this.currentWord = sample.word;
    this.isReview = sample.isReview;
    this.sprintDirection = sample.direction;

    if (!this.currentWord) {
      this.elSprintWord.textContent = "Victoria!";
      this.elSprintDef.textContent = "Stage complete.";
      return;
    }

    const w = this.currentWord;
    this.sprintIsCorrect = Math.random() >= 0.5;
    const isL2E = this.sprintDirection === 'l2e';

    if (this.elSprintDirectionBadge) {
      this.elSprintDirectionBadge.textContent = isL2E ? 'Latin → English' : 'English → Latin';
    }

    if (isL2E) {
      this.elSprintWord.textContent = w.h;
      this.elSprintPos.textContent = w.p;

      if (this.sprintIsCorrect) {
        this.elSprintDef.textContent = w.d;
      } else {
        let pool = this.getAvailableWords().filter((item) => item.r !== w.r);
        if (pool.length === 0) pool = this.words.filter((item) => item.r !== w.r);
        const randomFake = pool[Math.floor(Math.random() * pool.length)];
        this.elSprintDef.textContent = randomFake ? randomFake.d : w.d;
      }
    } else {
      this.elSprintWord.textContent = w.d;
      this.elSprintPos.textContent = `In Caesar: ${w.c} · ${w.p}`;

      if (this.sprintIsCorrect) {
        this.elSprintDef.textContent = w.h;
      } else {
        let pool = this.getAvailableWords().filter((item) => item.r !== w.r);
        if (pool.length === 0) pool = this.words.filter((item) => item.r !== w.r);
        const randomFake = pool[Math.floor(Math.random() * pool.length)];
        this.elSprintDef.textContent = randomFake ? randomFake.h : w.h;
      }
    }
  }

  checkSprintAnswer(userAnswer) {
    if (!this.currentWord) return;

    const isMatch = (userAnswer === this.sprintIsCorrect);
    const sprintBox = document.getElementById('sprint-card-box');

    if (isMatch) {
      sprintBox.classList.add('border-emerald-500', 'animate-gold-pulse');
      this.updateWordScore(this.currentWord.r, this.sprintDirection, 1);
    } else {
      sprintBox.classList.add('border-red-500', 'animate-shake');
      this.updateWordScore(this.currentWord.r, this.sprintDirection, -1, true);
    }

    setTimeout(() => {
      sprintBox.classList.remove('border-emerald-500', 'border-red-500', 'animate-gold-pulse', 'animate-shake');
      if (this.state.currentMode === 'sprint') {
        this.loadSprintMode();
      }
    }, 450);
  }

  // ==========================================
  // MODE 5: CAESAR'S BATTLEFIELD (Cloze)
  // ==========================================
  loadClozeMode() {
    const sample = this.sampleActiveOrReview();
    this.currentWord = sample.word;
    this.isReview = sample.isReview;
    this.clozeDirection = sample.direction;

    if (!this.currentWord) {
      this.elClozeSentence.textContent = "Stage complete!";
      this.elClozeOptions.innerHTML = '';
      return;
    }

    const w = this.currentWord;
    const surface = w.f;
    const rawSentence = w.x || `... ${surface} ...`;
    const isL2E = this.clozeDirection === 'l2e';

    if (this.elClozeDirectionBadge) {
      this.elClozeDirectionBadge.textContent = isL2E ? 'Latin Blank' : 'English Meaning';
    }

    if (isL2E) {
      // Latin cloze: target word blanked out, choose Latin word
      const regex = new RegExp(`\\b${surface}\\b`, 'i');
      const clozeText = rawSentence.replace(regex, '<span class="text-[#cba34e] font-bold border-b-2 border-[#cba34e] px-1">_______</span>');
      this.elClozeSentence.innerHTML = clozeText;
      this.elClozeCitation.textContent = `${w.c} · Clue: "${w.d}"`;

      let pool = this.getAvailableWords().filter((item) => item.r !== w.r);
      if (pool.length < 3) {
        pool = this.words.filter((item) => item.r !== w.r);
      }
      const shuffled = pool.sort(() => 0.5 - Math.random()).slice(0, 3);
      const options = [w, ...shuffled].sort(() => 0.5 - Math.random());

      this.elClozeOptions.innerHTML = options.map((opt, idx) => `
        <button class="quiz-option-btn w-full p-3.5 sm:p-4 bg-[#1b2229] hover:bg-[#252f38] border border-[#2e3a45] hover:border-[#cba34e] text-left font-lora text-base sm:text-lg text-[#fae09c] rounded-xl transition flex items-center justify-between" data-rank="${opt.r}">
          <span>${opt.f || opt.h}</span>
          <span class="w-6 h-6 rounded-full bg-[#14181d] text-gray-400 text-xs flex items-center justify-center font-mono font-sans shrink-0">${idx + 1}</span>
        </button>
      `).join('');
    } else {
      // English context: target word highlighted, choose English definition
      const regex = new RegExp(`\\b${surface}\\b`, 'i');
      const highlighted = rawSentence.replace(regex, `<span class="text-[#fae09c] font-bold underline decoration-[#cba34e] underline-offset-4 px-1">${surface}</span>`);
      this.elClozeSentence.innerHTML = highlighted;
      this.elClozeCitation.textContent = `${w.c} · What does "${surface}" mean in this passage?`;

      let pool = this.getAvailableWords().filter((item) => item.r !== w.r);
      if (pool.length < 3) {
        pool = this.words.filter((item) => item.r !== w.r);
      }
      const shuffled = pool.sort(() => 0.5 - Math.random()).slice(0, 3);
      const options = [w, ...shuffled].sort(() => 0.5 - Math.random());

      this.elClozeOptions.innerHTML = options.map((opt, idx) => `
        <button class="quiz-option-btn w-full p-3.5 sm:p-4 bg-[#1b2229] hover:bg-[#252f38] border border-[#2e3a45] hover:border-[#cba34e] text-left text-sm sm:text-base text-gray-200 rounded-xl transition flex items-center justify-between" data-rank="${opt.r}">
          <span class="pr-2 leading-snug">${opt.d}</span>
          <span class="w-6 h-6 rounded-full bg-[#14181d] text-gray-400 text-xs flex items-center justify-center font-mono font-sans shrink-0">${idx + 1}</span>
        </button>
      `).join('');
    }

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
      this.updateWordScore(this.currentWord.r, this.clozeDirection, 1);
    } else {
      btn.classList.add('bg-red-950/80', 'border-red-500', 'text-red-200', 'animate-shake');
      this.updateWordScore(this.currentWord.r, this.clozeDirection, -1, true);
    }

    setTimeout(() => {
      if (this.state.currentMode === 'cloze') {
        this.loadClozeMode();
      }
    }, 650);
  }

  // ==========================================
  // MODE 6: CAESAR'S GAUNTLET (Cumulative Review)
  // ==========================================
  loadGauntletMode() {
    if (!this.gauntletState.active) {
      // Show lobby
      this.elGauntletLobby.classList.remove('hidden');
      this.elGauntletBattle.classList.add('hidden');
      this.elGauntletResults.classList.add('hidden');
      this.updateGauntletLobbyStats();
    }
  }

  updateGauntletLobbyStats() {
    const key = this.gauntletState.selectedKey || '1.1';
    const ch = this.chaptersByKey.get(key);
    if (!ch) return;

    if (this.elGauntletScopeWords) {
      this.elGauntletScopeWords.textContent = `${ch.cumulativeCount.toLocaleString()} words`;
    }

    if (this.elGauntletScopeStatus) {
      const triumph = this.state.chapterTriumphs && this.state.chapterTriumphs[key];
      if (triumph) {
        this.elGauntletScopeStatus.innerHTML = `<span class="text-[#fae09c] font-bold">🏆 Triumph (Score: ${triumph.score})</span>`;
      } else {
        this.elGauntletScopeStatus.innerHTML = `<span class="text-gray-300">⚔️ Untested</span>`;
      }
    }
  }

  startGauntlet() {
    const key = this.gauntletState.selectedKey || '1.1';
    const ch = this.chaptersByKey.get(key);
    if (!ch || !ch.cumulativeWords || ch.cumulativeWords.length === 0) {
      alert('Selected chapter has no cumulative words.');
      return;
    }

    // Build 15-question queue sampled randomly from all cumulative words up to this chapter
    const pool = [...ch.cumulativeWords];
    const totalRounds = Math.min(15, pool.length);
    const shuffledPool = pool.sort(() => 0.5 - Math.random());
    const queueWords = shuffledPool.slice(0, totalRounds);

    this.gauntletState.active = true;
    this.gauntletState.queue = queueWords;
    this.gauntletState.totalRounds = totalRounds;
    this.gauntletState.currentIndex = 0;
    this.gauntletState.lives = 3;
    this.gauntletState.score = 0;
    this.gauntletState.combo = 0;
    this.gauntletState.maxCombo = 0;
    this.gauntletState.correctCount = 0;

    // Show battle screen
    this.elGauntletLobby.classList.add('hidden');
    this.elGauntletResults.classList.add('hidden');
    this.elGauntletBattle.classList.remove('hidden');

    this.runGauntletRound();
  }

  runGauntletRound() {
    if (!this.gauntletState.active) return;

    // Check if finished queue or out of lives
    if (this.gauntletState.currentIndex >= this.gauntletState.totalRounds || this.gauntletState.lives <= 0) {
      this.finishGauntlet();
      return;
    }

    const currentWord = this.gauntletState.queue[this.gauntletState.currentIndex];
    this.gauntletState.currentQuestion = currentWord;

    // 50/50 Latin -> English or English -> Latin
    const direction = Math.random() < 0.5 ? 'l2e' : 'e2l';
    this.gauntletState.currentDirection = direction;

    // Update Round Counter & Score
    this.elGauntletRoundNum.textContent = (this.gauntletState.currentIndex + 1);
    this.elGauntletScore.textContent = `${this.gauntletState.score} pts`;

    // Update Combo Badge
    if (this.gauntletState.combo >= 2) {
      this.elGauntletComboBadge.textContent = `${this.gauntletState.combo}x`;
      this.elGauntletComboBadge.classList.remove('hidden');
    } else {
      this.elGauntletComboBadge.classList.add('hidden');
    }

    // Update Shields (Lives)
    const shieldsHtml = [1, 2, 3].map((num) => {
      const lost = num > this.gauntletState.lives;
      return `<span class="text-sm ${lost ? 'shield-lost' : ''}">🛡️</span>`;
    }).join(' ');
    this.elGauntletShields.innerHTML = shieldsHtml;

    // Direction & Question Box
    this.elGauntletDirBadge.textContent = direction === 'l2e' ? 'Latin → English' : 'English → Latin';
    this.elGauntletWordCitation.textContent = currentWord.c;

    if (direction === 'l2e') {
      this.elGauntletPrompt.textContent = currentWord.h;
      this.elGauntletSubprompt.textContent = currentWord.p;
    } else {
      this.elGauntletPrompt.textContent = currentWord.d;
      this.elGauntletSubprompt.textContent = `${currentWord.p} · in Caesar: "${currentWord.f}"`;
    }

    // Generate 3 distractors from chapter cumulative words
    const ch = this.chaptersByKey.get(this.gauntletState.selectedKey);
    let distractorPool = (ch && ch.cumulativeWords ? ch.cumulativeWords : this.words).filter((w) => w.r !== currentWord.r);
    if (distractorPool.length < 3) {
      distractorPool = this.words.filter((w) => w.r !== currentWord.r);
    }
    const distractors = distractorPool.sort(() => 0.5 - Math.random()).slice(0, 3);
    const options = [currentWord, ...distractors].sort(() => 0.5 - Math.random());

    this.elGauntletOptions.innerHTML = options.map((opt, idx) => {
      const text = direction === 'l2e' ? opt.d : opt.h;
      return `
        <button class="gauntlet-opt-btn w-full p-3 bg-[#171d23] hover:bg-[#222b33] border border-[#2e3a45] hover:border-[#cba34e] text-left rounded-xl transition flex items-center justify-between text-xs sm:text-sm" data-rank="${opt.r}">
          <span class="pr-2 leading-snug ${direction === 'e2l' ? 'font-lora text-[#fae09c]' : 'text-gray-200'}">${text}</span>
          <span class="w-5 h-5 rounded-full bg-[#14181d] text-gray-400 text-[10px] flex items-center justify-center font-mono shrink-0">${idx + 1}</span>
        </button>
      `;
    }).join('');

    this.elGauntletOptions.querySelectorAll('.gauntlet-opt-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const selectedRank = parseInt(btn.getAttribute('data-rank'), 10);
        this.handleGauntletAnswer(selectedRank === currentWord.r, btn);
      });
    });

    // Reset and Start 10-second Timer Bar
    this.startGauntletTimer();
  }

  startGauntletTimer() {
    if (this.gauntletState.timerInterval) {
      clearInterval(this.gauntletState.timerInterval);
      this.gauntletState.timerInterval = null;
    }

    const totalSeconds = 10;
    this.gauntletState.timeLeft = totalSeconds;
    this.elGauntletTimerBar.style.width = '100%';
    this.elGauntletTimerBar.className = 'h-full bg-gradient-to-r from-[#96742a] via-[#cba34e] to-[#fae09c] transition-all duration-100 w-full';

    const intervalMs = 100;
    const step = intervalMs / 1000;

    this.gauntletState.timerInterval = setInterval(() => {
      this.gauntletState.timeLeft -= step;
      const pct = Math.max(0, (this.gauntletState.timeLeft / totalSeconds) * 100);
      this.elGauntletTimerBar.style.width = `${pct}%`;

      if (pct < 30) {
        this.elGauntletTimerBar.classList.add('bg-red-500');
      }

      if (this.gauntletState.timeLeft <= 0) {
        clearInterval(this.gauntletState.timerInterval);
        this.gauntletState.timerInterval = null;
        this.handleGauntletTimeout();
      }
    }, intervalMs);
  }

  handleGauntletAnswer(isCorrect, btn) {
    if (this.gauntletState.timerInterval) {
      clearInterval(this.gauntletState.timerInterval);
      this.gauntletState.timerInterval = null;
    }

    this.elGauntletOptions.querySelectorAll('.gauntlet-opt-btn').forEach((b) => b.disabled = true);

    if (isCorrect) {
      btn.classList.add('bg-emerald-950/80', 'border-emerald-500', 'text-emerald-200');
      this.gauntletState.combo += 1;
      this.gauntletState.correctCount += 1;
      if (this.gauntletState.combo > this.gauntletState.maxCombo) {
        this.gauntletState.maxCombo = this.gauntletState.combo;
      }
      const timeBonus = Math.round(this.gauntletState.timeLeft * 10);
      const comboMultiplier = Math.min(4, Math.max(1, this.gauntletState.combo));
      this.gauntletState.score += (100 * comboMultiplier) + timeBonus;

      // Update score in active study profile
      this.updateWordScore(this.gauntletState.currentQuestion.r, this.gauntletState.currentDirection, 1);
    } else {
      btn.classList.add('bg-red-950/80', 'border-red-500', 'text-red-200', 'animate-shake');
      this.gauntletState.combo = 0;
      this.gauntletState.lives -= 1;
    }

    setTimeout(() => {
      if (this.state.currentMode === 'gauntlet' && this.gauntletState.active) {
        this.gauntletState.currentIndex += 1;
        this.runGauntletRound();
      }
    }, 450);
  }

  handleGauntletTimeout() {
    this.elGauntletOptions.querySelectorAll('.gauntlet-opt-btn').forEach((b) => b.disabled = true);
    this.gauntletState.combo = 0;
    this.gauntletState.lives -= 1;

    const box = document.getElementById('gauntlet-question-box');
    if (box) {
      box.classList.add('animate-shake', 'border-red-500');
      setTimeout(() => box.classList.remove('animate-shake', 'border-red-500'), 400);
    }

    setTimeout(() => {
      if (this.state.currentMode === 'gauntlet' && this.gauntletState.active) {
        this.gauntletState.currentIndex += 1;
        this.runGauntletRound();
      }
    }, 500);
  }

  finishGauntlet() {
    if (this.gauntletState.timerInterval) {
      clearInterval(this.gauntletState.timerInterval);
      this.gauntletState.timerInterval = null;
    }

    this.gauntletState.active = false;
    this.elGauntletBattle.classList.add('hidden');
    this.elGauntletResults.classList.remove('hidden');

    const total = this.gauntletState.totalRounds;
    const accuracy = total > 0 ? Math.round((this.gauntletState.correctCount / total) * 100) : 0;
    const key = this.gauntletState.selectedKey;
    const ch = this.chaptersByKey.get(key);
    const chapterName = ch ? ch.title : `Chapter ${key}`;

    this.elGauntletResScore.textContent = this.gauntletState.score.toLocaleString();
    this.elGauntletResAccuracy.textContent = `${accuracy}%`;
    this.elGauntletResCombo.textContent = `${this.gauntletState.maxCombo}x`;

    const survived = this.gauntletState.lives > 0;

    if (survived) {
      // Victory
      this.elGauntletResultIcon.textContent = '🏆';
      this.elGauntletResultTitle.textContent = 'TRIUMPHUS DECLARATUS!';
      this.elGauntletResultTitle.className = 'font-cinzel text-xl sm:text-2xl font-bold text-gold-gradient animate-triumph';
      this.elGauntletResultSubtitle.textContent = `You conquered the Cumulative Review for ${chapterName}!`;
      this.elGauntletTrophyMessage.classList.remove('hidden');
      this.elGauntletTrophyMessage.innerHTML = `🏅 Triumph Crown Awarded for <b>${chapterName}</b>!`;

      // Save Triumph
      this.state.chapterTriumphs[key] = {
        score: this.gauntletState.score,
        accuracy,
        maxCombo: this.gauntletState.maxCombo,
        date: new Date().toISOString(),
      };
      this.saveProgress();
      this.populateGauntletChapterSelect();
    } else {
      // Defeat
      this.elGauntletResultIcon.textContent = '💀';
      this.elGauntletResultTitle.textContent = 'CLADES ROMANA (Defeat)';
      this.elGauntletResultTitle.className = 'font-cinzel text-xl sm:text-2xl font-bold text-red-400';
      this.elGauntletResultSubtitle.textContent = `The Gallic horde overwhelmed your cohort. Regroup and fight again!`;
      this.elGauntletTrophyMessage.classList.add('hidden');
    }

    this.updateUI();
  }

  // ==========================================
  // UI, MILESTONE BANNER & SEARCH
  // ==========================================
  checkChapterMilestones() {
    if (!this.elChapterReviewBanner) return;

    // Find the latest completed chapter or chapter with highest progress
    let milestoneChapter = null;
    for (const ch of this.chapters) {
      const wordsInCh = ch.words;
      if (wordsInCh.length === 0) continue;
      const masteredInCh = wordsInCh.filter((w) => this.state.mastered.has(w.r)).length;
      if (masteredInCh >= Math.ceil(wordsInCh.length * 0.7)) {
        milestoneChapter = ch;
      }
    }

    if (!milestoneChapter && this.chapters.length > 0) {
      // If user has mastered at least 5 words, suggest Chapter 1 review
      if (this.state.mastered.size >= 5) {
        milestoneChapter = this.chapters[0];
      }
    }

    if (milestoneChapter) {
      this.elChapterReviewBanner.classList.remove('hidden');
      this.elBannerChapterTitle.textContent = `Chapter Milestone: ${milestoneChapter.title}`;
      this.elBannerChapterDesc.textContent = `Cumulative review across ${milestoneChapter.cumulativeCount} words available!`;
      this.elBtnBannerGauntlet.setAttribute('data-chapter-key', milestoneChapter.key);
    } else {
      this.elChapterReviewBanner.classList.add('hidden');
    }
  }

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

    // Check chapter milestones
    this.checkChapterMilestones();
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
      const scores = normalizeScore(this.state.masteryScores[w.r]);
      return `
        <div class="p-3.5 bg-[#171d23] hover:bg-[#1f2730] border border-[#2e3a45] rounded-xl transition cursor-pointer flex items-center justify-between" data-word-id="${w.r}">
          <div class="pr-3">
            <div class="flex items-center gap-2">
              <span class="font-lora text-lg font-medium text-[#cba34e]">${w.h}</span>
              <span class="text-[10px] px-1.5 py-0.5 bg-[#2e3a45] text-gray-300 rounded">${w.p}</span>
              ${isMastered 
                ? '<span class="text-[10px] px-1.5 py-0.5 bg-emerald-900/60 text-emerald-300 border border-emerald-700/50 rounded">Mastered</span>' 
                : `<span class="text-[10px] px-1.5 py-0.5 bg-[#1b2229] text-gray-400 border border-[#2e3a45] rounded font-mono">L→E: ${scores.l2e}/2 · E→L: ${scores.e2l}/2</span>`}
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

function initCaesarApp() {
  if (!window.caesarApp) {
    window.caesarApp = new CaesarApp();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCaesarApp);
} else {
  initCaesarApp();
}
