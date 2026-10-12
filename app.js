(() => {
  'use strict';

  const DATA = window.QUIZ_DATA;
  const BY_NO = new Map(DATA.map((q) => [q.n, q]));
  const SET_SIZE = 10;
  const SETS = [];
  for (let i = 0; i < DATA.length; i += SET_SIZE) SETS.push(DATA.slice(i, i + SET_SIZE).map((q) => q.n));

  const STORE_KEY = 'gkentei-quiz-v1';
  const $ = (id) => document.getElementById(id);

  // ---------- 記録（ブラウザ内のみ） ----------
  let store = { results: {} };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (saved && saved.results) store = saved;
  } catch (e) { /* 使えない環境では記録なしで動作 */ }
  const save = () => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* noop */ }
  };

  // ---------- 表示ヘルパー ----------
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const linkify = (s) => esc(s).replace(/https?:\/\/[^\s　）)」]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
  const paras = (list, bulletClass) => list.map((t) => {
    const cls = bulletClass && /^[•・]/.test(t) ? ` class="${bulletClass}"` : '';
    return `<p${cls}>${linkify(t)}</p>`;
  }).join('');
  const optionLabel = (q, i) => q.options[i] || `選択肢 ${i + 1}（上の原文画像を参照）`;

  const showView = (id) => {
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('is-active', v.id === id));
    window.scrollTo({ top: 0 });
  };

  // ---------- ホーム ----------
  function renderHome() {
    const res = store.results;
    const done = Object.keys(res).length;
    const correct = Object.values(res).filter(Boolean).length;
    $('stat-done').textContent = `${done}/${DATA.length}`;
    $('stat-correct').textContent = correct;
    $('stat-rate').textContent = done ? `${Math.round((correct / done) * 100)}%` : '-';
    requestAnimationFrame(() => { $('overall-bar').style.width = `${(done / DATA.length) * 100}%`; });

    $('sets').innerHTML = SETS.map((nos, i) => {
      const ok = nos.filter((n) => res[n] === true).length;
      const ng = nos.filter((n) => res[n] === false).length;
      const first = nos[0];
      const last = nos[nos.length - 1];
      const perfect = ok === nos.length;
      const state = perfect ? 'COMPLETE' : ok + ng ? 'IN PROGRESS' : `SET ${String(i + 1).padStart(2, '0')}`;
      return `
        <button class="set${perfect ? ' is-perfect' : ''}" data-set="${i}" style="animation-delay:${i * 25}ms" type="button">
          <span class="set__label">${state}</span>
          <span class="set__range">${first === last ? `Q${first}` : `Q${first}–${last}`}</span>
          <span class="set__meta"><span>${nos.length}問</span><span>${ok + ng ? `${ok}/${nos.length} 正解` : '未挑戦'}</span></span>
          <span class="set__bar"><i class="ok" style="width:${(ok / nos.length) * 100}%"></i><i class="ng" style="width:${(ng / nos.length) * 100}%"></i></span>
        </button>`;
    }).join('');
  }

  $('sets').addEventListener('click', (e) => {
    const btn = e.target.closest('.set');
    if (btn) startSession(SETS[+btn.dataset.set], +btn.dataset.set);
  });
  $('sets').addEventListener('pointermove', (e) => {
    const btn = e.target.closest('.set');
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    btn.style.setProperty('--mx', `${e.clientX - r.left}px`);
    btn.style.setProperty('--my', `${e.clientY - r.top}px`);
  });
  $('reset-btn').addEventListener('click', () => {
    if (!confirm('これまでの回答記録をすべて消去しますか？')) return;
    store = { results: {} };
    save();
    renderHome();
  });

  // ---------- クイズ ----------
  let session = null;

  function startSession(nos, setIndex = null, label = null) {
    const first = nos[0];
    const last = nos[nos.length - 1];
    session = {
      nos,
      setIndex,
      label: label || (setIndex !== null ? `SET ${setIndex + 1}（問題 ${first}〜${last}）` : '解き直し'),
      i: 0,
      chosen: null,
      answered: false,
      results: {},
    };
    showView('quiz');
    renderQuestion();
  }

  function renderQuestion() {
    const q = BY_NO.get(session.nos[session.i]);
    session.chosen = null;
    session.answered = false;
    session.qImg = q.qImgDefault;
    session.aImg = q.aImgDefault;

    $('set-label').textContent = session.label;
    $('count-label').textContent = `${session.i + 1} / ${session.nos.length}`;
    $('progress-bar').style.width = `${(session.i / session.nos.length) * 100}%`;
    renderDots();

    $('qno').textContent = `問題 ${q.n} / ${DATA.length}`;
    $('stem').innerHTML = paras(q.stem);
    $('q-img').src = q.qimg;
    $('q-img').alt = `問題 ${q.n} の原文`;
    applyQuestionMode();

    $('options').innerHTML = q.options.map((_, i) => `
      <li><button class="option" data-i="${i}" type="button">
        <span class="option__no">${i + 1}</span>
        <span class="option__text">${esc(optionLabel(q, i))}</span>
      </button></li>`).join('');

    $('answer-btn').disabled = true;
    $('answer-btn').parentElement.hidden = false;
    $('result').hidden = true;

    const card = $('card');
    card.classList.remove('is-enter');
    void card.offsetWidth;
    card.classList.add('is-enter');
  }

  function renderDots() {
    $('live-score').innerHTML = session.nos.map((n, i) => {
      const r = session.results[n];
      const cls = r === true ? 'ok' : r === false ? 'ng' : i === session.i ? 'cur' : '';
      return `<i class="${cls}"></i>`;
    }).join('');
  }

  function applyQuestionMode() {
    const img = session.qImg;
    $('stem').hidden = img;
    $('q-orig').hidden = !img;
    $('q-toggle').textContent = img ? 'テキストで表示' : '原文画像で表示';
  }

  function applyAnswerMode(q) {
    const img = session.aImg;
    $('expl').hidden = img;
    $('a-orig').hidden = !img;
    if (img && !$('a-orig').childElementCount) {
      $('a-orig').innerHTML = q.aimg.map((src) => `<img src="${src}" alt="問題 ${q.n} の解答・解説の原文" loading="lazy">`).join('');
    }
    $('a-toggle').textContent = img ? 'テキストで表示' : '原文画像で表示';
  }

  $('q-toggle').addEventListener('click', () => { session.qImg = !session.qImg; applyQuestionMode(); });
  $('a-toggle').addEventListener('click', () => {
    session.aImg = !session.aImg;
    applyAnswerMode(BY_NO.get(session.nos[session.i]));
  });

  function select(i) {
    if (session.answered) return;
    session.chosen = i;
    document.querySelectorAll('.option').forEach((b) => b.classList.toggle('is-selected', +b.dataset.i === i));
    $('answer-btn').disabled = false;
  }

  $('options').addEventListener('click', (e) => {
    const b = e.target.closest('.option');
    if (b) select(+b.dataset.i);
  });

  const ICON_OK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_NG = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';

  function answer() {
    if (session.chosen === null || session.answered) return;
    const q = BY_NO.get(session.nos[session.i]);
    const correctIdx = q.answer - 1;
    const ok = session.chosen === correctIdx;
    session.answered = true;
    session.results[q.n] = ok;
    store.results[q.n] = ok;
    save();

    document.querySelectorAll('.option').forEach((b) => {
      const i = +b.dataset.i;
      b.disabled = true;
      b.classList.remove('is-selected');
      if (i === correctIdx) {
        b.classList.add('is-correct');
        b.insertAdjacentHTML('beforeend', '<span class="option__tag">正解</span>');
      } else if (i === session.chosen) {
        b.classList.add('is-wrong');
        b.insertAdjacentHTML('beforeend', '<span class="option__tag">あなたの回答</span>');
      } else {
        b.classList.add('is-dim');
      }
    });

    $('verdict').className = `verdict ${ok ? 'ok' : 'ng'}`;
    $('verdict').innerHTML = `
      <div class="verdict__icon">${ok ? ICON_OK : ICON_NG}</div>
      <div>
        <div class="verdict__title">${ok ? '正解！' : '不正解'}</div>
        <div class="verdict__sub">正解は <b>${q.answer}</b>：${esc(optionLabel(q, correctIdx))}${ok ? '' : `<br>あなたの回答 <b>${session.chosen + 1}</b>`}</div>
      </div>`;
    $('expl').innerHTML = paras(q.explanation, 'bullet');
    $('a-orig').innerHTML = '';
    applyAnswerMode(q);

    const isLast = session.i === session.nos.length - 1;
    $('next-btn').textContent = isLast ? '結果を見る' : '次の問題へ';
    $('answer-btn').parentElement.hidden = true;
    $('result').hidden = false;
    $('progress-bar').style.width = `${((session.i + 1) / session.nos.length) * 100}%`;
    renderDots();
    $('next-btn').focus({ preventScroll: true });
    $('verdict').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function next() {
    if (!session.answered) return;
    if (session.i < session.nos.length - 1) {
      session.i += 1;
      renderQuestion();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      renderSummary();
    }
  }

  $('answer-btn').addEventListener('click', answer);
  $('next-btn').addEventListener('click', next);
  $('back-btn').addEventListener('click', goHome);

  // ---------- 結果 ----------
  function renderSummary() {
    const nos = session.nos;
    const okCount = nos.filter((n) => session.results[n]).length;
    const rate = okCount / nos.length;
    $('sum-set').textContent = session.label;
    $('sum-score').textContent = okCount;
    $('sum-total').textContent = `/ ${nos.length}問`;
    $('sum-msg').textContent = rate === 1 ? 'パーフェクト！🎉' : rate >= 0.8 ? 'いい感じ！合格ライン圏内です' : rate >= 0.5 ? 'あと一歩。解説を見直そう' : '復習して再チャレンジ！';
    const ring = $('ring-value');
    ring.style.transition = 'none';
    ring.style.strokeDashoffset = 326.7;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      ring.style.transition = '';
      ring.style.strokeDashoffset = 326.7 * (1 - rate);
      ring.style.stroke = rate >= 0.8 ? 'var(--ok)' : rate >= 0.5 ? 'var(--accent-2)' : 'var(--ng)';
    }));

    $('sum-list').innerHTML = nos.map((n, i) => {
      const ok = session.results[n];
      const q = BY_NO.get(n);
      return `<li class="sum-item ${ok ? 'ok' : 'ng'}" data-n="${n}" style="animation-delay:${i * 40}ms">
        <span class="sum-item__mark">${ok ? '○' : '×'}</span>
        <span class="sum-item__no">Q${n}</span>
        <span class="sum-item__text">${esc(q.stem[0])}</span>
      </li>`;
    }).join('');

    const wrong = nos.filter((n) => !session.results[n]);
    $('retry-wrong-btn').hidden = wrong.length === 0;
    const hasNext = session.setIndex !== null && session.setIndex < SETS.length - 1;
    $('next-set-btn').hidden = !hasNext;
    showView('summary');
  }

  $('sum-list').addEventListener('click', (e) => {
    const li = e.target.closest('.sum-item');
    if (li) startSession([+li.dataset.n], null, `問題 ${li.dataset.n} を解き直し`);
  });
  $('retry-wrong-btn').addEventListener('click', () => {
    const wrong = session.nos.filter((n) => !session.results[n]);
    startSession(wrong, null, `間違えた問題の解き直し（${wrong.length}問）`);
  });
  $('retry-btn').addEventListener('click', () => startSession(session.nos, session.setIndex, session.label));
  $('next-set-btn').addEventListener('click', () => startSession(SETS[session.setIndex + 1], session.setIndex + 1));
  $('home-btn').addEventListener('click', goHome);

  function goHome() {
    renderHome();
    showView('home');
  }

  // ---------- キーボード操作 ----------
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const active = document.querySelector('.view.is-active').id;
    if (e.key === 'Escape' && active !== 'home') { goHome(); return; }
    if (active !== 'quiz') return;
    if (/^[1-4]$/.test(e.key)) { select(+e.key - 1); return; }
    if (e.key === 'Enter') {
      const opt = e.target.closest('.option');
      if (e.target.closest('button') && !opt) return; // ボタン上のEnterは既定動作に任せる
      e.preventDefault();
      if (session.answered) { next(); return; }
      if (opt) select(+opt.dataset.i);
      answer();
    }
  });

  renderHome();
})();
